import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { syncWithServer } from '../syncEngine';

const SyncStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);

  // استعلام حي (Live Query) لمراقبة طابور المزامنة تلقائياً
  const pendingCount = useLiveQuery(() => db.sync_queue.count(), []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleSync = async () => {
    if (!isOnline || pendingCount === 0) return;
    
    setIsSyncing(true);
    try {
      const result = await syncWithServer();
      alert(`Sync Complete: ${result.processed} success, ${result.failed} failed.`);
    } catch (error) {
      alert(`Sync Error: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div style={{
      backgroundColor: isOnline ? (pendingCount > 0 ? '#f39c12' : '#27ae60') : '#e74c3c',
      color: 'white',
      padding: '10px 20px',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      position: 'sticky',
      top: 0,
      zIndex: 1000
    }}>
      <div>
        <strong>{isOnline ? 'متصل بالإنترنت (Online)' : 'العمل دون اتصال (Offline)'}</strong>
        {pendingCount > 0 && <span style={{ marginRight: '15px' }}>- عمليات معلقة: {pendingCount}</span>}
      </div>
      
      {pendingCount > 0 && (
        <button 
          onClick={handleSync} 
          disabled={!isOnline || isSyncing}
          style={{
            padding: '5px 15px',
            cursor: (!isOnline || isSyncing) ? 'not-allowed' : 'pointer',
            backgroundColor: 'white',
            color: '#333',
            border: 'none',
            borderRadius: '4px',
            fontWeight: 'bold'
          }}
        >
          {isSyncing ? 'جاري المزامنة...' : 'مزامنة البيانات الآن'}
        </button>
      )}
    </div>
  );
};

export default SyncStatus;