/**
 * db/index.js
 * IndexedDB schema вҖ” Hybrid E2EE Support + Full Operational Tables + Smart Observation Engine (v3)
 */

import Dexie from 'dexie';

export const db = new Dexie('NRCLatrineTracker_v4'); // рҹҢҹ ЩӮШ§Ш№ШҜШ© Ш¬ШҜЩҠШҜШ© ШӘЩ…Ш§Щ…Ш§ЩӢ

// Schema v3: Smart Observation Engine Support
db.version(3).stores({
  // Technical tables вҖ” cleartext (no encryption needed)
  boq_items: 'id, latrine_id, boq_code, category, status, quality_pass',
  boq_dictionary: 'id, boq_code, category, is_active',

  // рҹҢҹ Ш¬ШҜЩҠШҜ: Щ…ЩғШӘШЁШ© Ш§Щ„ЩӮЩҲШ§Щ„ШЁ (ШӘЩ… Ш§Щ„ШӘШөШӯЩҠШӯ ШҘЩ„Щү ++id)
  remark_templates: '++id, template_code, title, is_active',

  // Sensitive tables вҖ” encrypted envelopes (_env)
  latrines: 'id, latrine_id, block_no, status, overall_pct, last_update',

  // рҹҢҹ ШӘШӯШҜЩҠШ«: ШҘШ¶Ш§ЩҒШ© template_id Щ„Щ„ЩҒЩҮШ§ШұШі
  remarks: '++id, local_uuid, latrine_id, boq_code, status, severity, sync_status, date_logged, template_id',

  // Daily logs
  daily_logs: '++id, date, engineer',

  // Sync queue вҖ” encrypted payloads
  sync_queue: '++id, type, timestamp, sync_status, retry_count, local_uuid',

  // Audit trail & Security
  audit_log: '++id, timestamp, action, entity_type',
  settings: 'key',
  chain_state: '++id, entity, last_hash, updated_at',
});

// Schema v4 – ШҘШ¶Ш§ЩҒШ© ШҜШ№Щ… Ш§Щ„ШөЩҲШұ
db.version(4).stores({
  boq_items: 'id, latrine_id, boq_code, category, status, quality_pass',
  boq_dictionary: 'id, boq_code, category, is_active',
  remark_templates: '++id, template_code, title, is_active',
  latrines: 'id, latrine_id, block_no, status, overall_pct, last_update',
  remarks: '++id, local_uuid, latrine_id, boq_code, status, severity, sync_status, date_logged, template_id, before_photo_ref, after_photo_ref',
  daily_logs: '++id, date, engineer',
  sync_queue: '++id, type, timestamp, sync_status, retry_count, local_uuid',
  audit_log: '++id, timestamp, action, entity_type',
  settings: 'key',
  chain_state: '++id, entity, last_hash, updated_at',
  pending_images: '++id, remark_local_uuid, type, sync_status, created_at'
}).upgrade(async tx => {
  console.log("Upgrading to v4: adding image support");
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
    await db.remarks.where('local_uuid').equals(localUuid).modify({ sync_status: status });
  } catch (error) {
    console.error("Failed to update sync status:", error);
  }
}

export async function getRemarksBySyncStatus(status) {
  return await db.remarks.where('sync_status').equals(status).toArray();
}