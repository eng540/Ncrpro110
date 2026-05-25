/**
 * sync/syncProtocol.js
 * Deterministic sync protocol (Updated for Hybrid E2EE)
 */

import { base64urlEncode } from '../crypto/canonical.js';

const PROTOCOL_VERSION = 1;
const TEXT_ENCODER = new TextEncoder();

class SyncProtocol {
  async encodeBatch(operations) {
    const deviceId = await this._getDeviceId();

    // Sort by sequence for determinism  
    const sorted = operations.map((op, idx) => ({  
      seq: idx + 1,  
      type: op.type,  
      payload: op.payload, // 🌟 إرسال الـ Payload المهجن (واضح + مشفر جزئياً)
      integrity: 'hybrid-e2ee-v1', // تم نقل النزاهة لمستوى الحقول
    }));  

    return {  
      protocol: PROTOCOL_VERSION,  
      device_id: deviceId,  
      operations: sorted, // 🌟 تم تغيير الاسم ليتوافق مع schemas.SyncRequest في الخادم
    };
  }

  async verifyDeterministic(operations) {
    const batch1 = await this.encodeBatch(operations);
    const batch2 = await this.encodeBatch(operations);

    const hash1 = await this._canonicalBatchHash(batch1);  
    const hash2 = await this._canonicalBatchHash(batch2);  
      
    if (hash1 !== hash2) {  
      throw new Error('SYNC_NOT_DETERMINISTIC');  
    }  
    return true;
  }

  decodeResponse(response) {
    // 🌟 الخادم لا يرسل protocol version، لذا نتجاوز هذا الفحص
    return {  
      processed: response.processed_ids || [],  
      failed: response.failed_ids || [],  
      errors: response.errors || {},  
    };
  }

  // ========== PRIVATE ==========
  async _getDeviceId() {
    const { getSetting, setSetting } = await import('../db/index.js');
    let deviceId = await getSetting('device_id');

    if (!deviceId) {  
      deviceId = crypto.randomUUID();  
      await setSetting('device_id', deviceId);  
    }  
    return deviceId;
  }

  async _canonicalBatchHash(batch) {
    const parts = [];  
      
    const protoBytes = new Uint8Array(4);  
    protoBytes[0] = (batch.protocol >>> 24) & 0xFF;  
    protoBytes[1] = (batch.protocol >>> 16) & 0xFF;  
    protoBytes[2] = (batch.protocol >>> 8) & 0xFF;  
    protoBytes[3] = batch.protocol & 0xFF;  
    parts.push(protoBytes);  
      
    parts.push(TEXT_ENCODER.encode(batch.device_id));  
      
    const sorted = [...batch.operations].sort((a, b) => a.seq - b.seq);  
    for (const op of sorted) {  
      const seqBytes = new Uint8Array(4);  
      seqBytes[0] = (op.seq >>> 24) & 0xFF;  
      seqBytes[1] = (op.seq >>> 16) & 0xFF;  
      seqBytes[2] = (op.seq >>> 8) & 0xFF;  
      seqBytes[3] = op.seq & 0xFF;  
      parts.push(seqBytes);  
        
      parts.push(TEXT_ENCODER.encode(op.type));  
        
      // 🌟 تشفير الـ Payload المهجن لضمان النزاهة
      const payloadCanonical = JSON.stringify(op.payload, Object.keys(op.payload).sort());  
      parts.push(TEXT_ENCODER.encode(payloadCanonical));  
        
      parts.push(TEXT_ENCODER.encode(op.integrity));  
    }  
      
    const totalLen = parts.reduce((sum, p) => sum + p.length, 0);  
    const combined = new Uint8Array(totalLen);  
    let offset = 0;  
    for (const part of parts) {  
      combined.set(part, offset);  
      offset += part.length;  
    }  
      
    const hashBuffer = await crypto.subtle.digest('SHA-256', combined);  
    return base64urlEncode(new Uint8Array(hashBuffer));
  }
}

export const syncProtocol = new SyncProtocol();