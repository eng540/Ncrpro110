/**

syncEngine.js (updated)

Uses syncProtocol for deterministic batch encoding

Uses secureStorage for encrypted payloads
*/


import { db } from './db/index.js';
import { cryptoService } from './crypto/cryptoService.js';
import { syncProtocol } from './sync/syncProtocol.js';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

/**

Push operation to sync queue (encrypted)
*/
export const pushToSyncQueue = async (type, data) => {
const { secureStorage } = await import('./storage/secureStorage.js');
await secureStorage.pushSyncQueue(type, data);
};


/**

Sync with server using deterministic protocol
*/
export const syncWithServer = async () => {
if (!navigator.onLine) {
throw new Error('لا يوجد اتصال بالإنترنت');
}


const { secureStorage } = await import('./storage/secureStorage.js');
const items = await secureStorage.popSyncQueue();

if (items.length === 0) {
return { status: 'empty', message: 'لا توجد بيانات معلقة' };
}

// Build deterministic batch
const operations = items.map(item => ({
type: item.type,
payload: item.payload,
}));

// Verify determinism
await syncProtocol.verifyDeterministic(operations);

const batch = await syncProtocol.encodeBatch(operations);

try {
const response = await fetch(${API_BASE_URL}/sync, {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(batch)
});

if (!response.ok) throw new Error(`Server error: ${response.status}`);  

const result = await response.json();  
const decoded = syncProtocol.decodeResponse(result);  

// Delete processed items  
if (decoded.processed.length > 0) {  
  await db.sync_queue.bulkDelete(  
    items.filter((_, i) => decoded.processed.includes(i + 1)).map(i => i.id)  
  );  
}  

// Update failed items  
for (const [seq, error] of Object.entries(decoded.failed)) {  
  const item = items[parseInt(seq) - 1];  
  if (item) {  
    await db.sync_queue.update(item.id, {   
      sync_status: 'failed',  
      retry_count: (item.retry_count || 0) + 1,  
      last_error: error.reason  
    });  
  }  
}  

return {  
  status: 'success',  
  processed: decoded.processed.length,  
  failed: Object.keys(decoded.failed).length,  
};

} catch (error) {
console.error('Sync failed:', error);
throw error;
}
};

export const getPendingSyncCount = async () => {
return await db.sync_queue.where('sync_status').equals('pending').count();
};

export const retryFailedSync = async () => {
const failed = await db.sync_queue.where('sync_status').equals('failed').toArray();

for (const item of failed) {
await db.sync_queue.update(item.id, { sync_status: 'pending', retry_count: (item.retry_count || 0) + 1 });
}

return await syncWithServer();
};
