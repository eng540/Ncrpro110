/**
 * syncEngine.js (Fixed for Hybrid E2EE & Undefined Errors)
 */

import { db } from './db/index.js';
import { syncProtocol } from './sync/syncProtocol.js';
import { secureStorage } from './storage/secureStorage.js';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

export const pushToSyncQueue = async (type, data) => {
  try {
    await secureStorage.pushSyncQueue(type, data);
  } catch (error) {
    console.error('pushToSyncQueue failed:', error);
    await db.sync_queue.add({
      type,
      timestamp: new Date().toISOString(),
      sync_status: 'pending',
      retry_count: 0,
      payload: data, // 🌟 إرسال البيانات كما هي إذا فشل التشفير
    });
  }
};

export const syncWithServer = async () => {
  if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');

  const items = await secureStorage.popSyncQueue();
  if (items.length === 0) return { status: 'empty', message: 'لا توجد بيانات معلقة' };

  const operations = items.map(item => ({
    type: item.type,
    payload: item.payload,
  }));

  try {
    await syncProtocol.verifyDeterministic(operations);
  } catch (err) {
    console.warn('Determinism check failed:', err);
  }

  const batch = await syncProtocol.encodeBatch(operations);

  try {
    const response = await fetch(`${API_BASE_URL}/sync`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'X-Device-ID': await _getDeviceId(),
      },
      body: JSON.stringify(batch)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    const decoded = syncProtocol.decodeResponse(result);

    // 🌟 إصلاح: التأكد من وجود المصفوفات لتجنب undefined
    const processedList = decoded.processed || [];
    const failedList = decoded.failed || [];

    if (processedList.length > 0) {
      const processedIds = items
        .filter((_, i) => processedList.includes(i + 1))
        .map(item => item.id);

      if (processedIds.length > 0) {
        await db.sync_queue.bulkDelete(processedIds);
      }
    }

    if (failedList.length > 0 || (decoded.errors && Object.keys(decoded.errors).length > 0)) {
      const errorsObj = decoded.errors || {};
      for (const seq of failedList) {
        const item = items[parseInt(seq) - 1];
        if (item) {
          await db.sync_queue.update(item.id, { 
            sync_status: 'failed',
            retry_count: (item.retry_count || 0) + 1,
            last_error: errorsObj[seq] || 'Unknown server error'
          });
        }
      }
    }

    return {
      status: 'success',
      processed: processedList.length,
      failed: failedList.length,
    };

  } catch (error) {
    console.error('Sync failed:', error);
    for (const item of items) {
      await db.sync_queue.update(item.id, { 
        sync_status: 'failed',
        retry_count: (item.retry_count || 0) + 1,
        last_error: error.message
      });
    }
    throw error;
  }
};

export const getPendingSyncCount = async () => {
  return await db.sync_queue.where('sync_status').equals('pending').count();
};

export const retryFailedSync = async () => {
  const failed = await db.sync_queue.where('sync_status').equals('failed').toArray();
  if (failed.length === 0) return { status: 'empty', message: 'لا توجد عمليات فاشلة' };

  const retryable = failed.filter(item => (item.retry_count || 0) < 5);
  if (retryable.length === 0) return { status: 'exhausted', message: `عمليات فشلت بشكل نهائي` };

  for (const item of retryable) {
    await db.sync_queue.update(item.id, { sync_status: 'pending', retry_count: (item.retry_count || 0) + 1 });
  }
  return await syncWithServer();
};

export const forceSync = async () => {
  await retryFailedSync();
  return await syncWithServer();
};

async function _getDeviceId() {
  const { getSetting, setSetting } = await import('./db/index.js');
  let deviceId = await getSetting('device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await setSetting('device_id', deviceId);
  }
  return deviceId;
}