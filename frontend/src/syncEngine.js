// AUTH-PATCH 2026-06-02: استخدام apiFetch بدلاً من fetch المباشر للمزامنة

import { db } from './db/index.js';
import { apiFetch } from './api';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export const pushToSyncQueue = async (type, data) => {
  try {
    await db.sync_queue.add({
      type,
      timestamp: new Date().toISOString(),
      sync_status: 'pending',
      retry_count: 0,
      payload: data,
    });
  } catch (error) {
    console.error('pushToSyncQueue failed:', error);
  }
};

export const syncWithServer = async () => {
  if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');

  const items = await db.sync_queue.where('sync_status').equals('pending').toArray();
  if (items.length === 0) return { status: 'empty', message: 'لا توجد بيانات معلقة' };

  const operations = items.map((item, index) => ({
    seq: index + 1,
    type: item.type,
    payload: item.payload,
    integrity: 'none'
  }));

  const batch = {
    protocol: 1,
    device_id: 'web-client',
    operations: operations
  };

  try {
    const response = await apiFetch('/sync', {
      method: 'POST',
      body: JSON.stringify(batch)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const processedList = result.processed_ids || [];
    const failedList = result.failed_ids || [];

    if (processedList.length > 0) {
      const processedDbIds = items
        .filter((_, i) => processedList.includes(i + 1))
        .map(item => item.id);
      if (processedDbIds.length > 0) {
        await db.sync_queue.bulkDelete(processedDbIds);
      }
    }

    if (failedList.length > 0) {
      for (const seq of failedList) {
        const item = items[parseInt(seq) - 1];
        if (item) {
          await db.sync_queue.update(item.id, { 
            sync_status: 'failed',
            retry_count: (item.retry_count || 0) + 1,
            last_error: result.errors?.[seq] || 'Unknown error'
          });
        }
      }
    }

    return { status: 'success', processed: processedList.length, failed: failedList.length };

  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
};

export const getPendingSyncCount = async () => {
  return await db.sync_queue.where('sync_status').equals('pending').count();
};

export const retryFailedSync = async () => {
  const failed = await db.sync_queue.where('sync_status').equals('failed').toArray();
  if (failed.length === 0) return { status: 'empty' };

  for (const item of failed) {
    await db.sync_queue.update(item.id, { sync_status: 'pending' });
  }
  return await syncWithServer();
};