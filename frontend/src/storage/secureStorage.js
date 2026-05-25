/**
 * storage/secureStorage.js
 * Hybrid E2EE Storage Service (Architected for Decision Engine Compatibility)
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
      beneficiary_hh: data.beneficiary_hh ? (await cryptoService.encryptField(data.beneficiary_hh, { entity: 'latrine', field: 'beneficiary_hh', rid: data.latrine_id })).toDB() : null,
      gps_coordinates: data.gps_coordinates ? (await cryptoService.encryptField(data.gps_coordinates, { entity: 'latrine', field: 'gps_coordinates', rid: data.latrine_id })).toDB() : null,
      site_engineer: data.site_engineer ? (await cryptoService.encryptField(data.site_engineer, { entity: 'latrine', field: 'site_engineer', rid: data.latrine_id })).toDB() : null,
    };
    await db.latrines.put(envelope);
    await audit.log('LATRINE_SAVED', 'latrine', data.latrine_id, { encrypted_fields: ['beneficiary_hh', 'gps_coordinates', 'site_engineer'] });
  }

  async getLatrine(id) {
    const record = await db.latrines.get(id);
    if (!record) return null;
    const view = { id: record.id, latrine_id: record.latrine_id, block_no: record.block_no, status: record.status, overall_pct: record.overall_pct, last_update: record.last_update };
    
    // فك التشفير إذا كانت البيانات مغلفة
    try {
      if (record.beneficiary_hh?._env) view.beneficiary_hh = await cryptoService.decryptField(record.beneficiary_hh);
      else view.beneficiary_hh = record.beneficiary_hh; // Fallback للبيانات القديمة
      
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
    const envelope = {
      id: data.id,
      local_uuid: data.local_uuid,
      latrine_id: data.latrine_id,
      boq_code: data.boq_code,
      status: data.status,
      severity: data.severity,
      sync_status: data.sync_status || 'local',
      date_logged: data.date_logged || new Date().toISOString(),
      description: data.description ? (await cryptoService.encryptField(data.description, { entity: 'remark', field: 'description', rid: data.local_uuid || data.id })).toDB() : null,
      action_required: data.action_required ? (await cryptoService.encryptField(data.action_required, { entity: 'remark', field: 'action_required', rid: data.local_uuid || data.id })).toDB() : null,
    };
    await db.remarks.put(envelope);
    await audit.log('REMARK_SAVED', 'remark', data.local_uuid || data.id, { severity: data.severity });
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

  // ========== SYNC QUEUE (Hybrid E2EE Format) ==========
  async pushSyncQueue(type, data) {
    let secureData = { ...data };

    // 🌟 التشفير الجزئي (Hybrid E2EE): تشفير الحقول الحساسة فقط وتحويلها لنص ليقبلها الخادم
    if (type === 'CREATE_REMARK' || type === 'UPDATE_REMARK') {
      if (secureData.description) {
        const env = await cryptoService.encryptField(secureData.description, { entity: 'remark', field: 'description', rid: data.local_uuid || data.id || 'new' });
        secureData.description = JSON.stringify(env.toDB()._env); // تحويل المظروف لنص ليُحفظ في PostgreSQL
      }
      if (secureData.action_required) {
        const env = await cryptoService.encryptField(secureData.action_required, { entity: 'remark', field: 'action_required', rid: data.local_uuid || data.id || 'new' });
        secureData.action_required = JSON.stringify(env.toDB()._env);
      }
    } else if (type === 'UPDATE_LATRINE') {
      if (secureData.beneficiary_hh) {
        const env = await cryptoService.encryptField(secureData.beneficiary_hh, { entity: 'latrine', field: 'beneficiary_hh', rid: data.id });
        secureData.beneficiary_hh = JSON.stringify(env.toDB()._env);
      }
      if (secureData.site_engineer) {
        const env = await cryptoService.encryptField(secureData.site_engineer, { entity: 'latrine', field: 'site_engineer', rid: data.id });
        secureData.site_engineer = JSON.stringify(env.toDB()._env);
      }
    } else if (type === 'CREATE_DAILY_LOG') {
      if (secureData.notes) {
        const env = await cryptoService.encryptField(secureData.notes, { entity: 'daily_log', field: 'notes', rid: 'new' });
        secureData.notes = JSON.stringify(env.toDB()._env);
      }
    }

    // 🌟 إرسال البيانات التشغيلية واضحة، والبيانات الحساسة مشفرة
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
    // إرجاع البيانات كما هي (لأنها لم تعد مشفرة بالكامل)
    return await db.sync_queue.where('sync_status').equals('pending').toArray();
  }
}

export const secureStorage = new SecureStorage();