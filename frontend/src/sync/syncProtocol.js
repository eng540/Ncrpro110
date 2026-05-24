/**

sync/syncProtocol.js

Deterministic sync protocol with encrypted payloads

Protocol v1:

Client -> Server:

{

protocol: 1,

device_id: "...",

batch: [

{

seq: 1,

type: "UPDATE_BOQ",

envelope: { _env: {...} },

integrity: "sha256:..."

}

]

}

Server -> Client:

{

processed: ["seq1", "seq2"],

failed: { "seq3": { code: "INTEGRITY_FAIL", reason: "..." } },

server_time: "..."

}
*/


import { base64urlEncode } from '../crypto/canonical.js';

const PROTOCOL_VERSION = 1;
const TEXT_ENCODER = new TextEncoder();

class SyncProtocol {
/**

Encode operations into deterministic batch

@param {Array} operations - Array of { type, payload, envelope }
*/
async encodeBatch(operations) {
const deviceId = await this._getDeviceId();


// Sort by sequence for determinism  
const sorted = operations.map((op, idx) => ({  
  seq: idx + 1,  
  type: op.type,  
  envelope: op.payload, // Already encrypted envelope  
  integrity: op.payload._env?.int?.h || 'unknown',  
}));  

return {  
  protocol: PROTOCOL_VERSION,  
  device_id: deviceId,  
  batch: sorted,  
};

}

/**

Verify deterministic encoding (same input -> same hash)
*/
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

/**

Decode server response
*/
decodeResponse(response) {
if (response.protocol !== PROTOCOL_VERSION) {
throw new Error('PROTOCOL_VERSION_MISMATCH');
}


return {  
  processed: response.processed || [],  
  failed: response.failed || {},  
  conflicts: response.conflicts || [],  
  serverTime: response.server_time,  
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
// Deterministic serialization:
// 1. Fixed-width protocol version
// 2. Device ID (UTF-8)
// 3. For each operation: seq (4 bytes) + type (UTF-8) + envelope canonical + integrity

const parts = [];  
  
// Protocol version (4 bytes, big-endian)  
const protoBytes = new Uint8Array(4);  
protoBytes[0] = (batch.protocol >>> 24) & 0xFF;  
protoBytes[1] = (batch.protocol >>> 16) & 0xFF;  
protoBytes[2] = (batch.protocol >>> 8) & 0xFF;  
protoBytes[3] = batch.protocol & 0xFF;  
parts.push(protoBytes);  
  
// Device ID  
parts.push(TEXT_ENCODER.encode(batch.device_id));  
  
// Operations (sorted by seq)  
const sorted = [...batch.batch].sort((a, b) => a.seq - b.seq);  
for (const op of sorted) {  
  // Seq (4 bytes, big-endian)  
  const seqBytes = new Uint8Array(4);  
  seqBytes[0] = (op.seq >>> 24) & 0xFF;  
  seqBytes[1] = (op.seq >>> 16) & 0xFF;  
  seqBytes[2] = (op.seq >>> 8) & 0xFF;  
  seqBytes[3] = op.seq & 0xFF;  
  parts.push(seqBytes);  
    
  // Type  
  parts.push(TEXT_ENCODER.encode(op.type));  
    
  // Envelope (canonical JSON with sorted keys)  
  const envCanonical = JSON.stringify(op.envelope._env, Object.keys(op.envelope._env).sort());  
  parts.push(TEXT_ENCODER.encode(envCanonical));  
    
  // Integrity  
  parts.push(TEXT_ENCODER.encode(op.integrity));  
}  
  
// Concatenate  
const totalLen = parts.reduce((sum, p) => sum + p.length, 0);  
const combined = new Uint8Array(totalLen);  
let offset = 0;  
for (const part of parts) {  
  combined.set(part, offset);  
  offset += part.length;  
}  
  
// Hash  
const hashBuffer = await crypto.subtle.digest('SHA-256', combined);  
return base64urlEncode(new Uint8Array(hashBuffer));

}
}

export const syncProtocol = new SyncProtocol();
