import { db } from './db/index.js';
import { apiFetch } from './api';

export const pushToSyncQueue = async (type, data) => {
  await db.sync_queue.add({
    type,
    timestamp: new Date().toISOString(),
    sync_status: 'pending',
    retry_count: 0,
    payload: data,
  });
};

export const syncWithServer = async () => {
  if (!navigator.onLine) throw new Error('لا يوجد اتصال بالإنترنت');
  const items = await db.sync_queue.where('sync_status').equals('pending').toArray();
  if (items.length === 0) return { status: 'empty' };
  const operations = items.map((item, idx) => ({
    seq: idx + 1,
    type: item.type,
    payload: item.payload,
    integrity: 'none'
  }));
  const batch = { protocol: 1, device_id: 'web-client', operations };
  const response = await apiFetch('/sync', { method: 'POST', body: JSON.stringify(batch) });
  const result = await response.json();
  const processedList = result.processed_ids || [];
  const failedList = result.failed_ids || [];
  if (processedList.length) {
    const processedDbIds = items.filter((_, i) => processedList.includes(i + 1)).map(i => i.id);
    if (processedDbIds.length) await db.sync_queue.bulkDelete(processedDbIds);
  }
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
  return { processed: processedList.length, failed: failedList.length };
};

export const getPendingSyncCount = async () => db.sync_queue.where('sync_status').equals('pending').count();

export const retryFailedSync = async () => {
  const failed = await db.sync_queue.where('sync_status').equals('failed').toArray();
  for (const item of failed) await db.sync_queue.update(item.id, { sync_status: 'pending' });
  return await syncWithServer();
};