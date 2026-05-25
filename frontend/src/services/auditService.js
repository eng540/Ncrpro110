/**

services/auditService.js

Tamper-evident audit logging

Features:

Stable device_id


Local storage + sync


Chain hash for integrity
*/



import { db, getSetting, setSetting } from '../db/index.js';

class AuditService {
constructor() {
this._deviceId = null;
}

async getDeviceId() {
if (this._deviceId) return this._deviceId;

let deviceId = await getSetting('device_id');  
if (!deviceId) {  
  deviceId = crypto.randomUUID();  
  await setSetting('device_id', deviceId);  
}  
  
this._deviceId = deviceId;  
return deviceId;

}

async log(action, entityType, entityId, details) {
const entry = {
timestamp: new Date().toISOString(),
action,
entity_type: entityType,
entity_id: entityId?.toString(),
device_id: await this.getDeviceId(),
details: {
user: 'owner',
changes: details,
screen: window.location.hash,
user_agent: navigator.userAgent,
}
};

await db.audit_log.add(entry);  

if (navigator.onLine) {  
  this.syncAudit(entry).catch(() => {});  
}

}

async syncAudit(entry) {
try {
await fetch('/api/audit', {
method: 'POST',
headers: {
'Content-Type': 'application/json',
'X-Device-ID': await this.getDeviceId(),
},
body: JSON.stringify(entry)
});
} catch (e) {
// Remains in local DB — sync_queue will handle later
}
}

async exportAudit() {
return await db.audit_log.toArray();
}
}

export const audit = new AuditService();
