import { db } from './db';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

/**
 * تسجيل عملية جديدة في طابور المزامنة
 * @param {string} type - نوع العملية (UPDATE_BOQ, CREATE_REMARK, الخ)
 * @param {object} data - البيانات المعدلة
 */
export const pushToSyncQueue = async (type, data) => {
  const operation = {
    id: uuidv4(),
    type: type,
    timestamp: new Date().toISOString(),
    data: data
  };
  await db.sync_queue.add(operation);
  return operation;
};

/**
 * محاولة إرسال الطابور إلى الخادم
 */
export const syncWithServer = async () => {
  if (!navigator.onLine) {
    throw new Error('No internet connection. Cannot sync right now.');
  }

  const queue = await db.sync_queue.toArray();
  if (queue.length === 0) {
    return { status: 'empty', message: 'No pending data to sync.' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: queue })
    });

    if (!response.ok) {
      throw new Error(`Server responded with status ${response.status}`);
    }

    const result = await response.json();

    // حذف العمليات التي نجح الخادم في معالجتها من الطابور المحلي
    if (result.processed_ids && result.processed_ids.length > 0) {
      await db.sync_queue.bulkDelete(result.processed_ids);
    }

    return { 
      status: 'success', 
      processed: result.processed_ids?.length || 0,
      failed: result.failed_ids?.length || 0,
      errors: result.errors 
    };

  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
};

/**
 * جلب العدد الحالي للعمليات المعلقة (لعرضها في واجهة المستخدم)
 */
export const getPendingSyncCount = async () => {
  return await db.sync_queue.count();
};