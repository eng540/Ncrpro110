/**
 * crypto/envelope.js
 * Immutable encryption envelope format
 */

import { base64urlEncode, base64urlDecode, computeIntegrityHash, computeChainHash } from './canonical.js';

export const ENVELOPE_VERSION = 1;

export class Envelope {
  constructor(data) {
    this.v = ENVELOPE_VERSION;
    this.alg = 'AES-GCM-256';
    this.iv = data.iv;
    this.ct = data.ct;
    this.aad = data.aad;
    this.meta = Object.freeze({ ...data.meta });
    this.int = data.int ? Object.freeze({ ...data.int }) : null;
    Object.freeze(this);
  }

  toDB() {
    return Object.freeze({
      _enc: true,
      _env: Object.freeze({
        v: this.v,
        alg: this.alg,
        iv: base64urlEncode(this.iv),
        ct: base64urlEncode(this.ct),
        aad: this.aad,
        meta: this.meta,
        int: this.int,
      })
    });
  }

  static fromDB(record) {
    if (!record?._env) throw new Error('Not an envelope: missing _env');
    const e = record._env;
    if (e.v !== ENVELOPE_VERSION) {  
      throw new Error(`Envelope version mismatch: ${e.v} != ${ENVELOPE_VERSION}`);  
    }  
    return new Envelope({  
      iv: base64urlDecode(e.iv),  
      ct: base64urlDecode(e.ct),  
      aad: e.aad,  
      meta: e.meta,  
      int: e.int,  
    });
  }

  async verify() {
    if (!this.int?.h) return false;
    try {  
      const computed = await computeIntegrityHash(this.iv, this.ct, this.aad);  
      return computed === this.int.h;  
    } catch {  
      return false;  
    }
  }

  static async create(iv, ct, aad, meta, prevChainHash = null) {
    const integrity = await computeIntegrityHash(iv, ct, aad);
    const chain = await computeChainHash(prevChainHash, integrity);
    return new Envelope({  
      iv,  
      ct,  
      aad,  
      meta: { ...meta, t: new Date().toISOString() },  
      int: { h: integrity, c: chain },  
    });
  }
}

export function canonicalAAD(entity, recordId) {
  if (!entity || typeof entity !== 'string') throw new TypeError('entity required');
  if (recordId === undefined || recordId === null) throw new TypeError('recordId required');
  
  // 🌟 الإصلاح الجراحي: إجبار تحويل الـ ID (سواء كان رقماً أو UUID) إلى نص لمنع الانهيار
  const ridStr = String(recordId); 
  
  return JSON.stringify({ e: entity, r: ridStr });
}