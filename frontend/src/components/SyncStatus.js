import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, populateLocalDB } from '../db';
import { syncWithServer } from '../syncEngine';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const SyncStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // مراقبة طابور العمليات المعلقة
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

  // دالة إرسال التعديلات للخادم (Push)
  const handlePushSync = async () => {
    if (!isOnline || pendingCount === 0) return;
    setIsSyncing(true);
    try {
      const result = await syncWithServer();
      alert(`تمت المزامنة بنجاح: ${result.processed} عملية ناجحة.`);
    } catch (error) {
      alert(`خطأ في المزامنة: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // دالة تحميل البيانات من الخادم للهاتف (Pull)
  const handleDownloadData = async () => {
    if (!isOnline) {
      alert("يجب أن تكون متصلاً بالإنترنت لتحميل البيانات.");
      return;
    }
    if (pendingCount > 0) {
      alert("يوجد لديك تعديلات محلية لم يتم إرسالها. يرجى مزامنة بياناتك أولاً قبل تحميل بيانات جديدة لتجنب فقدان عملك.");
      return;
    }

    setIsDownloading(true);
    try {
      // جلب البيانات من الخادم
      const latrinesRes = await fetch(`${API_BASE_URL}/latrines?limit=200`);
      const boqRes = await fetch(`${API_BASE_URL}/boq-items`);
      
      if (!latrinesRes.ok) throw new Error("فشل الاتصال بالخادم");

      const latrines = await latrinesRes.json();
      const boqItems = await boqRes.json();

      // تفريغ وتعبئة قاعدة البيانات المحلية
      await populateLocalDB(latrines, boqItems, []);
      alert("تم تحميل أحدث البيانات من الخادم إلى هاتفك بنجاح!");
      
    } catch (error) {
      console.error(error);
      alert("تعذر تحميل البيانات من الخادم.");
    } finally {
      setIsDownloading(false);
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
      zIndex: 1000,
      flexWrap: 'wrap',
      gap: '10px'
    }}>
      <div>
        <strong>{isOnline ? 'متصل بالإنترنت (Online)' : 'العمل دون اتصال (Offline)'}</strong>
        {pendingCount > 0 && <span style={{ marginRight: '15px', fontWeight: 'bold' }}>- عمليات تنتظر الإرسال: {pendingCount}</span>}
      </div>
      
      <div style={{ display: 'flex', gap: '10px' }}>
        {/* زر إرسال البيانات (يظهر فقط إذا كان هناك تعديلات) */}
        {pendingCount > 0 && (
          <button 
            onClick={handlePushSync} 
            disabled={!isOnline || isSyncing}
            style={{
              padding: '6px 12px', cursor: (!isOnline || isSyncing) ? 'not-allowed' : 'pointer',
              backgroundColor: 'white', color: '#f39c12', border: 'none', borderRadius: '4px', fontWeight: 'bold'
            }}
          >
            {isSyncing ? 'جاري الإرسال...' : 'إرسال التعديلات للخادم'}
          </button>
        )}

        {/* زر تحميل البيانات (يظهر دائماً إذا كان متصلاً) */}
        <button 
          onClick={handleDownloadData} 
          disabled={!isOnline || isDownloading || pendingCount > 0}
          style={{
            padding: '6px 12px', cursor: (!isOnline || isDownloading || pendingCount > 0) ? 'not-allowed' : 'pointer',
            backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid white', borderRadius: '4px', fontWeight: 'bold'
          }}
          title={pendingCount > 0 ? "قم بإرسال تعديلاتك أولاً" : "سحب أحدث البيانات من الخادم"}
        >
          {isDownloading ? 'جاري التحميل...' : 'تحميل أحدث البيانات من الخادم ↓'}
        </button>
      </div>
    </div>
  );
};

export default SyncStatus;