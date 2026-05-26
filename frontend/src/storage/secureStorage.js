/**
 * storage/secureStorage.js
 * Hybrid E2EE Storage Service (Architected for Decision Engine Compatibility)
 * 
 * 🌟 PATCH-5 FIX: Removed double .toDB() calls that caused undefined envelopes
 */

import { db } from '../db/index.js';
import { cryptoService } from '../crypto/cryptoService.js';
import { audit } from '../services/auditService.js';

class SecureStorage {
  // ========== LATRINES ==========
  async saveLatrine(data) {
    const safeId = String(data.latrine_id || data.id || 'unknown');
    const envelope = {
      id: data.id,
      latrine_id: data.latrine_id,
      block_no: data.block_no,
      status: data.status,
      overall_pct: data.overall_pct,
      last_update: data.last_update || new Date().toISOString(),
      beneficiary_hh: data.beneficiary_hh ? await cryptoService.encryptField(data.beneficiary_hh, { entity: 'latrine', field: 'beneficiary_hh', rid: safeId }) : null,
      gps_coordinates: data.gps_coordinates ? await cryptoService.encryptField(data.gps_coordinates, { entity: 'latrine', field: 'gps_coordinates', rid: safeId }) : null,
      site_engineer: data.site_engineer ? await cryptoService.encryptField(data.site_engineer, { entity: 'latrine', field: 'site_engineer', rid: safeId }) : null,
    };
    await db.latrines.put(envelope);
    await audit.log('LATRINE_SAVED', 'latrine', data.latrine_id, { encrypted_fields: ['beneficiary_hh', 'gps_coordinates', 'site_engineer'] });
  }

  async getLatrine(id) {
    const record = await db.latrines.get(id);
    if (!record) return null;
    const view = { id: record.id, latrine_id: record.latrine_id, block_no: record.block_no, status: record.status, overall_pct: record.overall_pct, last_update: record.last_update };

    try {
      if (record.beneficiary_hh?._env) view.beneficiary_hh = await cryptoService.decryptField(record.beneficiary_hh);
      else view.beneficiary_hh = record.beneficiary_hh;

      if (record.gps_coordinates?._env) view.gps_coordinates = await cryptoService.decryptField(record.gps_coordinates);
      else view.gps_coordinates = record.gps_coordinates;

      if (record.site_engineer?._env) view.site_engineer = await cryptoService.decryptField(record.site_engineer);
      else view.site_engineer = record.site_engineer;
    } catch (e) {
      console.warn("Decryption failed for latrine", id);
    }
    return Object.freeze(view);
  }

  // ========== REMARKS ==========
  async saveRemark(data) {
    // 🌟 إصلاح: ضمان وجود UUID كنص دائماً
    const safeUuid = String(data.local_uuid || crypto.randomUUID());

    const envelope = {
      latrine_id: data.latrine_id,
      boq_code: data.boq_code,
      status: data.status,
      severity: data.severity,
      sync_status: data.sync_status || 'local',
      date_logged: data.date_logged || new Date().toISOString(),
      local_uuid: safeUuid,
    };

    if (data.id) envelope.id = data.id;

    // 🌟 PATCH-5 FIX: cryptoService.encryptField() already returns envelope.toDB()
    // Calling .toDB() again on the returned object produces undefined
    if (data.description) {
      envelope.description = await cryptoService.encryptField(data.description, { entity: 'remark', field: 'description', rid: safeUuid });
    }
    if (data.action_required) {
      envelope.action_required = await cryptoService.encryptField(data.action_required, { entity: 'remark', field: 'action_required', rid: safeUuid });
    }

    await db.remarks.put(envelope);
    await audit.log('REMARK_SAVED', 'remark', safeUuid, { severity: data.severity });
  }

  async getRemark(id) {
    const record = await db.remarks.get(id);
    if (!record) return null;
    const view = { id: record.id, local_uuid: record.local_uuid, latrine_id: record.latrine_id, boq_code: record.boq_code, status: record.status, severity: record.severity, sync_status: record.sync_status, date_logged: record.date_logged };

    try {
      if (record.description?._env) view.description = await cryptoService.decryptField(record.description);
      else view.description = record.description;

      if (record.action_required?._env) view.action_required = await cryptoService.decryptField(record.action_required);
      else view.action_required = record.action_required;
    } catch (e) {
      console.warn("Decryption failed for remark", id);
    }
    return Object.freeze(view);
  }

  // ========== SYNC QUEUE ==========
  async pushSyncQueue(type, data) {
    let secureData = { ...data };
    const safeId = String(data.local_uuid || data.id || 'new');

    if (type === 'CREATE_REMARK' || type === 'UPDATE_REMARK') {
      // 🌟 PATCH-5 FIX: Removed double .toDB() — encryptField returns serialized envelope
      if (secureData.description) {
        const env = await cryptoService.encryptField(secureData.description, { entity: 'remark', field: 'description', rid: safeId });
        secureData.description = JSON.stringify(env._env);
      }
      if (secureData.action_required) {
        const env = await cryptoService.encryptField(secureData.action_required, { entity: 'remark', field: 'action_required', rid: safeId });
        secureData.action_required = JSON.stringify(env._env);
      }
    } else if (type === 'UPDATE_LATRINE') {
      if (secureData.beneficiary_hh) {
        const env = await cryptoService.encryptField(secureData.beneficiary_hh, { entity: 'latrine', field: 'beneficiary_hh', rid: safeId });
        secureData.beneficiary_hh = JSON.stringify(env._env);
      }
      if (secureData.site_engineer) {
        const env = await cryptoService.encryptField(secureData.site_engineer, { entity: 'latrine', field: 'site_engineer', rid: safeId });
        secureData.site_engineer = JSON.stringify(env._env);
      }
    } else if (type === 'CREATE_DAILY_LOG') {
      if (secureData.notes) {
        const env = await cryptoService.encryptField(secureData.notes, { entity: 'daily_log', field: 'notes', rid: 'new' });
        secureData.notes = JSON.stringify(env._env);
      }
    }

    const entry = {
      type,
      timestamp: new Date().toISOString(),
      sync_status: 'pending',
      retry_count: 0,
      payload: secureData, 
    };

    await db.sync_queue.add(entry);
  }

  async popSyncQueue() {
    return await db.sync_queue.where('sync_status').equals('pending').toArray();
  }
}

export const secureStorage = new SecureStorage();
