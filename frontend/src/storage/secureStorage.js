/**

storage/secureStorage.js

Immutable storage service — Encrypt-only write / Decrypt-only read

Contract:

DB stores ONLY envelope objects (_env)


Plaintext NEVER touches DB


Read returns decrypted VIEW MODEL (new object, read-only)


Write creates NEW envelope (no mutation)
*/



import { db } from '../db/index.js';
import { cryptoService } from '../crypto/cryptoService.js';
import { audit } from '../services/auditService.js';

class SecureStorage {
// ========== LATRINES ==========

async saveLatrine(data) {
const envelope = {
id: data.id,
latrine_id: data.latrine_id,
block_no: data.block_no,
status: data.status,
overall_pct: data.overall_pct,
last_update: data.last_update || new Date().toISOString(),
// Encrypted fields as envelopes
beneficiary_hh: data.beneficiary_hh
? await cryptoService.encryptField(data.beneficiary_hh, {
entity: 'latrine', field: 'beneficiary_hh', rid: data.latrine_id,
})
: null,
gps_coordinates: data.gps_coordinates
? await cryptoService.encryptField(data.gps_coordinates, {
entity: 'latrine', field: 'gps_coordinates', rid: data.latrine_id,
})
: null,
site_engineer: data.site_engineer
? await cryptoService.encryptField(data.site_engineer, {
entity: 'latrine', field: 'site_engineer', rid: data.latrine_id,
})
: null,
};

await db.latrines.put(envelope);  
await audit.log('LATRINE_SAVED', 'latrine', data.latrine_id, {  
  encrypted_fields: ['beneficiary_hh', 'gps_coordinates', 'site_engineer'],  
});

}

async getLatrine(id) {
const record = await db.latrines.get(id);
if (!record) return null;

// Build decrypted VIEW MODEL (NEW object, never mutate record)  
const view = {  
  id: record.id,  
  latrine_id: record.latrine_id,  
  block_no: record.block_no,  
  status: record.status,  
  overall_pct: record.overall_pct,  
  last_update: record.last_update,  
};  

if (record.beneficiary_hh?._env) {  
  view.beneficiary_hh = await cryptoService.decryptField(record.beneficiary_hh);  
}  
if (record.gps_coordinates?._env) {  
  view.gps_coordinates = await cryptoService.decryptField(record.gps_coordinates);  
}  
if (record.site_engineer?._env) {  
  view.site_engineer = await cryptoService.decryptField(record.site_engineer);  
}  

return Object.freeze(view);

}

async getLatrinesList() {
// Returns indexable fields only (no decryption)
return await db.latrines.toArray();
}

// ========== REMARKS ==========

async saveRemark(data) {
const envelope = {
id: data.id,
latrine_id: data.latrine_id,
boq_code: data.boq_code,
status: data.status,
severity: data.severity,
sync_status: data.sync_status || 'local',
date_logged: data.date_logged || new Date().toISOString(),
// Encrypted
description: data.description
? await cryptoService.encryptField(data.description, {
entity: 'remark', field: 'description', rid: data.local_uuid || data.id,
})
: null,
action_required: data.action_required
? await cryptoService.encryptField(data.action_required, {
entity: 'remark', field: 'action_required', rid: data.local_uuid || data.id,
})
: null,
};

await db.remarks.add(envelope);  
await audit.log('REMARK_SAVED', 'remark', data.local_uuid || data.id, {  
  severity: data.severity,  
});

}

async getRemark(id) {
const record = await db.remarks.get(id);
if (!record) return null;

const view = {  
  id: record.id,  
  latrine_id: record.latrine_id,  
  boq_code: record.boq_code,  
  status: record.status,  
  severity: record.severity,  
  sync_status: record.sync_status,  
  date_logged: record.date_logged,  
};  

if (record.description?._env) {  
  view.description = await cryptoService.decryptField(record.description);  
}  
if (record.action_required?._env) {  
  view.action_required = await cryptoService.decryptField(record.action_required);  
}  

return Object.freeze(view);

}

// ========== SYNC QUEUE (Deterministic Format) ==========

async pushSyncQueue(type, data) {
const payload = JSON.stringify(data);
const encryptedPayload = await cryptoService.encryptField(payload, {
entity: 'sync_queue', field: 'payload', rid: crypto.randomUUID(),
});

const entry = {  
  type,  
  timestamp: new Date().toISOString(),  
  sync_status: 'pending',  
  retry_count: 0,  
  payload: encryptedPayload,  
};  

await db.sync_queue.add(entry);

}

async popSyncQueue() {
const items = await db.sync_queue.where('sync_status').equals('pending').toArray();

return await Promise.all(items.map(async (item) => {  
  if (!item.payload?._env) return item;  
  const decrypted = await cryptoService.decryptField(item.payload);  
  return { ...item, data: JSON.parse(decrypted) };  
}));

}

// ========== BACKUP/RESTORE ==========

async exportBackup() {
if (cryptoService.isLocked()) throw new Error('SEED_LOCKED');

const allData = {  
  version: '2.2',  
  exported_at: new Date().toISOString(),  
  latrines: await db.latrines.toArray(),  
  boq_items: await db.boq_items.toArray(),  
  remarks: await db.remarks.toArray(),  
  audit_log: await db.audit_log.toArray(),  
  settings: await db.settings.toArray(),  
};  

const json = JSON.stringify(allData);  
const backup = await cryptoService.encryptField(json, {  
  entity: 'backup', field: 'full', rid: 'backup-' + Date.now(),  
});  

return {  
  filename: `nrc_backup_${new Date().toISOString().slice(0,10)}.enc.json`,  
  data: backup.toDB(),  
};

}

async importBackup(backupData) {
if (cryptoService.isLocked()) throw new Error('SEED_LOCKED');

const decrypted = await cryptoService.decryptField(backupData);  
const data = JSON.parse(decrypted);  

if (data.version !== '2.2') throw new Error('VERSION_MISMATCH');  

await db.transaction('rw',  
  [db.latrines, db.boq_items, db.remarks, db.audit_log, db.settings],  
  async () => {  
    await db.latrines.clear();  
    await db.boq_items.clear();  
    await db.remarks.clear();  
    await db.audit_log.clear();  
      
    await db.latrines.bulkAdd(data.latrines);  
    await db.boq_items.bulkAdd(data.boq_items);  
    await db.remarks.bulkAdd(data.remarks);  
    await db.audit_log.bulkAdd(data.audit_log);  
    // Settings (salt, pin) are NOT restored for security  
  }  
);  

await audit.log('BACKUP_IMPORTED', 'system', null, {  
  from_version: data.version, timestamp: data.exported_at,  
});

}
}

export const secureStorage = new SecureStorage();
