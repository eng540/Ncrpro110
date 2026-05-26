/**
 * db/index.js
 * IndexedDB schema — Hybrid E2EE Support + Full Operational Tables
 */

import Dexie from 'dexie';

export const db = new Dexie('NRCLatrineTracker_v2');

// Schema v2: _env support, no hooks + Restored Missing Tables/Indexes
db.version(2).stores({
  // Technical tables — cleartext (no encryption needed)
  boq_items: 'id, latrine_id, boq_code, category, status, quality_pass',
  boq_dictionary: 'id, boq_code, category, is_active',

  // Sensitive tables — encrypted envelopes (_env)
  latrines: 'id, latrine_id, block_no, status, overall_pct, last_update',

  // 🌟 تم الإصلاح: إعادة local_uuid للفهارس لكي تعمل دوال البحث
  remarks: '++id, local_uuid, latrine_id, boq_code, status, severity, sync_status, date_logged',

  // 🌟 تم الإصلاح: إعادة جدول التقارير اليومية المفقود
  daily_logs: '++id, date, engineer',

  // Sync queue — encrypted payloads
  sync_queue: '++id, type, timestamp, sync_status, retry_count, local_uuid',

  // Audit trail & Security
  audit_log: '++id, timestamp, action, entity_type',
  settings: 'key',
  chain_state: '++id, entity, last_hash, updated_at',
});

// ========== SETTINGS HELPERS ==========

export async function getSetting(key) {
  const rec = await db.settings.get(key);
  return rec?.value || null;
}

export async function setSetting(key, value) {
  await db.settings.put({ key, value });
}

export async function deleteSetting(key) {
  await db.settings.delete(key);
}

// ========== CHAIN STATE HELPERS ==========

export async function getChainHead(entity) {
  const rec = await db.chain_state.where('entity').equals(entity).first();
  return rec?.last_hash || null;
}

export async function updateChainHead(entity, newHash) {
  const existing = await db.chain_state.where('entity').equals(entity).first();

  if (existing) {
    await db.chain_state.update(existing.id, {
      last_hash: newHash,
      updated_at: new Date().toISOString(),
    });
  } else {
    await db.chain_state.add({
      entity,
      last_hash: newHash,
      updated_at: new Date().toISOString(),
    });
  }
}

// ========== LEGACY COMPATIBILITY ==========

export async function populateLocalDB(latrines, boqItems, remarks) {
  try {
    await db.transaction('rw', db.latrines, db.boq_items, db.remarks, async () => {
      await db.latrines.clear();
      await db.boq_items.clear();
      await db.remarks.clear();

      if (latrines?.length > 0) await db.latrines.bulkAdd(latrines);  
      if (boqItems?.length > 0) await db.boq_items.bulkAdd(boqItems);  
      if (remarks?.length > 0) {  
        const remarksWithSync = remarks.map(r => ({...r, sync_status: 'synced'}));  
        await db.remarks.bulkAdd(remarksWithSync);  
      }  
    });
  } catch (error) {
    console.error("Failed to populate local DB:", error);
    throw error;
  }
}

export async function updateRemarkSyncStatus(localUuid, status) {
  try {
    // هذه الدالة كانت ستفشل لولا إعادتنا لـ local_uuid في الفهارس أعلاه
    await db.remarks.where('local_uuid').equals(localUuid).modify({ sync_status: status });
  } catch (error) {
    console.error("Failed to update sync status:", error);
  }
}

export async function getRemarksBySyncStatus(status) {
  return await db.remarks.where('sync_status').equals(status).toArray();
}