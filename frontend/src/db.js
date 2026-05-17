import Dexie from 'dexie';

// إنشاء قاعدة البيانات المحلية باسم المشروع
export const db = new Dexie('NRCLatrineTrackerDB');

// تعريف المخطط (Schema) للجداول المحلية
// ++id يعني Auto-increment محلي
db.version(1).stores({
  latrines: 'id, latrine_id, status, site_engineer',
  boq_items: 'id, latrine_id, boq_code, category, status, quality_pass',
  remarks: 'id, remark_id, latrine_id, status, severity',
  sync_queue: 'id, type, timestamp' // طابور العمليات التي تنتظر الإنترنت
});

// دوال مساعدة لتفريغ وبناء قاعدة البيانات عند أول تحميل (Initial Load)
export const populateLocalDB = async (latrines, boqItems, remarks) => {
  await db.transaction('rw', db.latrines, db.boq_items, db.remarks, async () => {
    await db.latrines.clear();
    await db.boq_items.clear();
    await db.remarks.clear();
    
    if (latrines?.length) await db.latrines.bulkAdd(latrines);
    if (boqItems?.length) await db.boq_items.bulkAdd(boqItems);
    if (remarks?.length) await db.remarks.bulkAdd(remarks);
  });
};