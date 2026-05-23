import { db } from './db';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

/**
 * تسجيل عملية جديدة في طابور المزامنة
 * @param {string} type - نوع العملية (UPDATE_BOQ, CREATE_REMARK, UPDATE_REMARK, UPDATE_LATRINE)
 * @param {object} data - البيانات المعدلة
 */
export const pushToSyncQueue = async (type, data) => {
  const operation = {
    id: uuidv4(),
    type: type,
    timestamp: new Date().toISOString(),
    local_uuid: data.local_uuid || null,
    data: data
  };
  
  await db.sync_queue.add(operation);
  
  // تحديث sync_status للملاحظات
  if (type === 'CREATE_REMARK' && data.local_uuid) {
    await db.remarks.where('local_uuid').equals(data.local_uuid).modify({ sync_status: 'pending' });
  }
  if (type === 'UPDATE_REMARK' && data.local_uuid) {
    await db.remarks.where('local_uuid').equals(data.local_uuid).modify({ sync_status: 'pending' });
  }
  
  return operation;
};

/**
 * محاولة إرسال الطابور إلى الخادم
 */
export const syncWithServer = async () => {
  if (!navigator.onLine) {
    throw new Error('لا يوجد اتصال بالإنترنت. لا يمكن المزامنة الآن.');
  }

  const queue = await db.sync_queue.toArray();
  if (queue.length === 0) {
    return { status: 'empty', message: 'لا توجد بيانات معلقة للمزامنة.' };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations: queue })
    });

    if (!response.ok) {
      throw new Error(`الخادم رد بالحالة ${response.status}`);
    }

    const result = await response.json();

    // حذف العمليات الناجحة فقط من الطابور
    if (result.processed_ids && result.processed_ids.length > 0) {
      await db.sync_queue.bulkDelete(result.processed_ids);
      
      // تحديث sync_status للملاحظات المُرسلة
      for (const op of queue) {
        if (result.processed_ids.includes(op.id) && op.local_uuid) {
          await db.remarks.where('local_uuid').equals(op.local_uuid).modify({ 
            sync_status: 'synced'
          });
        }
      }
    }

    // العمليات الفاشلة — تحديث حالتها إلى failed
    if (result.failed_ids && result.failed_ids.length > 0) {
      for (const failedId of result.failed_ids) {
        const failedOp = queue.find(q => q.id === failedId);
        if (failedOp && failedOp.local_uuid) {
          await db.remarks.where('local_uuid').equals(failedOp.local_uuid).modify({ 
            sync_status: 'failed' 
          });
        }
      }
    }

    return { 
      status: 'success', 
      processed: result.processed_ids?.length || 0,
      failed: result.failed_ids?.length || 0,
      errors: result.errors || {}
    };

  } catch (error) {
    console.error('فشل المزامنة:', error);
    // لا تُغيّر حالة queue — ستُعاد المحاولة لاحقاً
    // لا تُغيّر sync_status — تبقى pending
    throw error;
  }
};

/**
 * جلب العدد الحالي للعمليات المعلقة (لعرضها في واجهة المستخدم)
 */
export const getPendingSyncCount = async () => {
  return await db.sync_queue.count();
};

/**
 * إعادة محاولة المزامنة للعمليات الفاشلة فقط
 */
export const retryFailedSync = async () => {
  const failedRemarks = await db.remarks.where('sync_status').equals('failed').toArray();
  
  for (const remark of failedRemarks) {
    await db.remarks.where('local_uuid').equals(remark.local_uuid).modify({ 
      sync_status: 'local' 
    });
    
    if (remark.id < 0 || !remark.server_id) {
      await pushToSyncQueue('CREATE_REMARK', remark);
    } else {
      await pushToSyncQueue('UPDATE_REMARK', {
        local_uuid: remark.local_uuid,
        status: remark.status,
        closed_date: remark.closed_date
      });
    }
  }
  
  return await syncWithServer();
};
