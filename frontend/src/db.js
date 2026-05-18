import Dexie from 'dexie';

// تغيير اسم قاعدة البيانات لضمان مسح أي آثار قديمة تسبب تعارض (Nuclear Option)
export const db = new Dexie('NRCLatrineTrackerDB_v3');

// تعريف المخطط (Schema) - إصدار 1 (لأننا غيرنا اسم القاعدة)
db.version(1).stores({
  latrines: 'id, latrine_id, status, site_engineer',
  boq_items: 'id, latrine_id, boq_code, category, status, quality_pass',
  remarks: '++id, local_uuid, latrine_id, boq_code, status, severity, sync_status',
  daily_logs: '++id, date, engineer',
  sync_queue: '++id, type, timestamp, local_uuid'
});

// دوال مساعدة لتفريغ وبناء قاعدة البيانات عند أول تحميل (Initial Load)
export const populateLocalDB = async (latrines, boqItems, remarks) => {
  try {
    await db.transaction('rw', db.latrines, db.boq_items, db.remarks, async () => {
      await db.latrines.clear();
      await db.boq_items.clear();
      await db.remarks.clear();
      
      if (latrines && latrines.length > 0) await db.latrines.bulkAdd(latrines);
      if (boqItems && boqItems.length > 0) await db.boq_items.bulkAdd(boqItems);
      if (remarks && remarks.length > 0) {
        // إضافة sync_status للبيانات القادمة من الخادم
        const remarksWithSync = remarks.map(r => ({...r, sync_status: 'synced'}));
        await db.remarks.bulkAdd(remarksWithSync);
      }
    });
  } catch (error) {
    console.error("فشل في تعبئة قاعدة البيانات المحلية:", error);
  }
};

// دالة مساعدة لتحديث حالة المزامنة
export const updateRemarkSyncStatus = async (localUuid, status) => {
  try {
    await db.remarks.where('local_uuid').equals(localUuid).modify({ sync_status: status });
  } catch (error) {
    console.error("فشل تحديث حالة المزامنة:", error);
  }
};

// دالة مساعدة لجلب الملاحظات حسب حالة المزامنة
export const getRemarksBySyncStatus = async (status) => {
  return await db.remarks.where('sync_status').equals(status).toArray();
};