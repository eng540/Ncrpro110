import Dexie from 'dexie';

// إنشاء قاعدة البيانات المحلية باسم المشروع
export const db = new Dexie('NRCLatrineTrackerDB');

// تعريف المخطط (Schema) للجداول المحلية - الإصدار 2
// ++id يعني Auto-increment محلي
// الإضافات:
// - remarks: إضافة local_uuid, sync_status
// - daily_logs: جديد
// - sync_queue: إضافة local_uuid

db.version(2).stores({
  latrines: 'id, latrine_id, status, site_engineer',
  boq_items: 'id, latrine_id, boq_code, category, status, quality_pass',
  remarks: '++id, local_uuid, latrine_id, boq_code, status, severity, sync_status',
  daily_logs: '++id, date, engineer',
  sync_queue: '++id, type, timestamp, local_uuid'
});

// دوال مساعدة لتفريغ وبناء قاعدة البيانات عند أول تحميل (Initial Load)
export const populateLocalDB = async (latrines, boqItems, remarks) => {
  await db.transaction('rw', db.latrines, db.boq_items, db.remarks, async () => {
    await db.latrines.clear();
    await db.boq_items.clear();
    await db.remarks.clear();
    
    if (latrines?.length) await db.latrines.bulkAdd(latrines);
    if (boqItems?.length) await db.boq_items.bulkAdd(boqItems);
    if (remarks?.length) {
      // إضافة sync_status للبيانات القادمة من الخادم
      const remarksWithSync = remarks.map(r => ({...r, sync_status: 'synced'}));
      await db.remarks.bulkAdd(remarksWithSync);
    }
  });
};

// دالة مساعدة لتحديث حالة المزامنة
export const updateRemarkSyncStatus = async (localUuid, status) => {
  await db.remarks.where('local_uuid').equals(localUuid).modify({ sync_status: status });
};

// دالة مساعدة لجلب الملاحظات حسب حالة المزامنة
export const getRemarksBySyncStatus = async (status) => {
  return await db.remarks.where('sync_status').equals(status).toArray();
};