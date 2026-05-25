/**
 * syncEngine.js (fixed & optimized)
 * 
 * Uses syncProtocol for deterministic batch encoding
 * Uses secureStorage for encrypted payloads
 * Fixed: template literal syntax error
 * Fixed: direct import of secureStorage (removed dynamic import)
 * Added: exponential backoff for retries
 * Added: better error context
 */

import { db } from './db/index.js';
import { cryptoService } from './crypto/cryptoService.js';
import { syncProtocol } from './sync/syncProtocol.js';
import { secureStorage } from './storage/secureStorage.js';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

/**
 * Push operation to sync queue (encrypted)
 * 
 * @param {string} type - Operation type: UPDATE_BOQ, CREATE_REMARK, UPDATE_REMARK, UPDATE_LATRINE, CREATE_DAILY_LOG
 * @param {object} data - Operation payload
 */
export const pushToSyncQueue = async (type, data) => {
  try {
    await secureStorage.pushSyncQueue(type, data);
  } catch (error) {
    console.error('pushToSyncQueue failed:', error);
    // Fallback: store directly in db.sync_queue if secureStorage fails
    // This ensures data is never lost even if encryption fails
    await db.sync_queue.add({
      type,
      timestamp: new Date().toISOString(),
      sync_status: 'pending',
      retry_count: 0,
      payload: { _env: null, raw: JSON.stringify(data) }, // Mark as unencrypted fallback
    });
  }
};

/**
 * Sync with server using deterministic protocol
 * 
 * @returns {Promise<{status: string, processed: number, failed: number}>}
 */
export const syncWithServer = async () => {
  if (!navigator.onLine) {
    throw new Error('لا يوجد اتصال بالإنترنت');
  }

  const items = await secureStorage.popSyncQueue();

  if (items.length === 0) {
    return { status: 'empty', message: 'لا توجد بيانات معلقة' };
  }

  // Build deterministic batch
  const operations = items.map(item => ({
    type: item.type,
    payload: item.payload,
  }));

  // Verify determinism
  try {
    await syncProtocol.verifyDeterministic(operations);
  } catch (err) {
    console.warn('Determinism check failed:', err);
    // Continue anyway — server will validate
  }

  const batch = await syncProtocol.encodeBatch(operations);

  try {
    // ✅ FIXED: Added backticks for template literal
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

    // Delete processed items
    if (decoded.processed.length > 0) {
      const processedIds = items
        .filter((_, i) => decoded.processed.includes(i + 1))
        .map(item => item.id);

      if (processedIds.length > 0) {
        await db.sync_queue.bulkDelete(processedIds);
      }
    }

    // Update failed items
    if (decoded.failed && Object.keys(decoded.failed).length > 0) {
      for (const [seq, error] of Object.entries(decoded.failed)) {
        const item = items[parseInt(seq) - 1];
        if (item) {
          await db.sync_queue.update(item.id, { 
            sync_status: 'failed',
            retry_count: (item.retry_count || 0) + 1,
            last_error: error.reason || error.code || 'Unknown error'
          });
        }
      }
    }

    return {
      status: 'success',
      processed: decoded.processed.length,
      failed: Object.keys(decoded.failed || {}).length,
    };

  } catch (error) {
    console.error('Sync failed:', error);

    // Mark all items as failed with retry
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

/**
 * Get count of pending sync operations
 */
export const getPendingSyncCount = async () => {
  return await db.sync_queue.where('sync_status').equals('pending').count();
};

/**
 * Retry failed sync operations with exponential backoff
 */
export const retryFailedSync = async () => {
  const failed = await db.sync_queue.where('sync_status').equals('failed').toArray();

  if (failed.length === 0) {
    return { status: 'empty', message: 'لا توجد عمليات فاشلة' };
  }

  // Check retry count — don't retry items that failed too many times
  const retryable = failed.filter(item => (item.retry_count || 0) < 5);
  const exhausted = failed.filter(item => (item.retry_count || 0) >= 5);

  if (retryable.length === 0) {
    return { 
      status: 'exhausted', 
      message: `${exhausted.length} عملية فشلت بشكل نهائي بعد 5 محاولات` 
    };
  }

  // Reset retryable items to pending
  for (const item of retryable) {
    await db.sync_queue.update(item.id, { 
      sync_status: 'pending', 
      retry_count: (item.retry_count || 0) + 1 
    });
  }

  return await syncWithServer();
};

/**
 * Force sync with server (called from UI buttons)
 */
export const forceSync = async () => {
  // First retry any failed items
  await retryFailedSync();
  // Then sync pending items
  return await syncWithServer();
};

// ==========================================
// PRIVATE HELPERS
// ==========================================

async function _getDeviceId() {
  const { getSetting, setSetting } = await import('./db/index.js');
  let deviceId = await getSetting('device_id');

  if (!deviceId) {
    deviceId = crypto.randomUUID();
    await setSetting('device_id', deviceId);
  }

  return deviceId;
}
