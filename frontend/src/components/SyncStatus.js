import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index.js';
import { syncWithServer } from '../syncEngine';
import { apiFetch } from '../api';
import { imageService } from '../services/imageService';

const SyncStatus = () => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const pendingCount = useLiveQuery(() => db.sync_queue.count(), []);

  useEffect(() => {
    let isSyncingImages = false;
    
    const handleOnline = async () => {
      setIsOnline(true);
      if (isSyncingImages) return;
      isSyncingImages = true;
      try {
        // فحص ورفع الصور المعلقة خلف الكواليس تلقائياً عند التقاط إشارة الشبكة
        await imageService.syncPendingImages();
      } catch (err) {
        console.error("Online image sync automated trigger error:", err);
      } finally {
        isSyncingImages = false;
      }
    };
    
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // دفع البيانات النصية والـ BOQs المعدلة يدوياً
  const handlePushSync = async () => {
    if (!isOnline || pendingCount === 0) return;
    setIsSyncing(true);
    try {
      const result = await syncWithServer();
      alert(`تمت مزامنة السجلات بنجاح: تم معالجة ${result.processed} عملية مسبقة.`);
    } catch (error) {
      alert(`خطأ في محرك المزامنة الرئيسي: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // سحب البيانات الشاملة وتحديث الـ Cache
  const handleDownloadData = async () => {
    if (!isOnline) {
      alert("يجب أن تكون متصلاً بالإنترنت لسحب وتحديث البيانات القياسية.");
      return;
    }
    if (pendingCount > 0) {
      alert("تحذير: لديك سجلات وتعديلات معلقة محلياً، يرجى إرسال التعديلات أولاً لمنع الكتابة الفوقية.");
      return;
    }

    setIsDownloading(true);
    try {
      const [latrinesRes, boqRes, remarksRes, templatesRes] = await Promise.all([
        apiFetch('/latrines?limit=200'),
        apiFetch('/boq-items'),
        apiFetch('/remarks'),
        apiFetch('/remark-templates')
      ]);

      if (!latrinesRes.ok || !boqRes.ok) throw new Error("تعذر الاتصال ببوابة الخادم الحية.");

      const latrines = await latrinesRes.json();
      const boqItems = await boqRes.json();
      const remarks = remarksRes.ok ? await remarksRes.json() : [];
      const templates = templatesRes.ok ? await templatesRes.json() : [];

      await db.transaction('rw', db.latrines, db.boq_items, db.remarks, db.remark_templates, async () => {
        await db.latrines.clear();
        await db.boq_items.clear();
        await db.remarks.clear();
        await db.remark_templates.clear();
        
        if (latrines?.length) await db.latrines.bulkAdd(latrines);
        if (boqItems?.length) await db.boq_items.bulkAdd(boqItems);
        if (templates?.length) await db.remark_templates.bulkAdd(templates);
        if (remarks?.length) {
          const remarksWithSync = remarks.map(r => ({ ...r, sync_status: 'synced' }));
          await db.remarks.bulkAdd(remarksWithSync);
        }
      });
      alert("تمت مزامنة وتحديث قاعدة البيانات الميدانية بالكامل!");
    } catch (error) {
      console.error(error);
      alert("فشل تحديث البيانات المحلية من السيرفر الرئيسي.");
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
      gap: '10px',
      direction: 'rtl',
      fontFamily: 'sans-serif'
    }}>
      <div>
        <strong>{isOnline ? '🟢 حالة الاتصال: متصل بالإنترنت (Online)' : '🔴 حالة الاتصال: دون اتصال (Offline)'}</strong>
        {pendingCount > 0 && <span style={{ marginRight: '15px', fontWeight: 'bold' }}>- تعديلات قيد الانتظار: {pendingCount}</span>}
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        {pendingCount > 0 && (
          <button onClick={handlePushSync} disabled={!isOnline || isSyncing}
            style={{ padding: '6px 12px', backgroundColor: 'white', color: '#f39c12', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: (!isOnline || isSyncing) ? 'not-allowed' : 'pointer' }}>
            {isSyncing ? 'جاري إرسال السجلات...' : 'إرسال السجلات المعلقة الآن'}
          </button>
        )}
        <button onClick={handleDownloadData} disabled={!isOnline || isDownloading || pendingCount > 0}
          style={{ padding: '6px 12px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid white', borderRadius: '4px', fontWeight: 'bold', cursor: (!isOnline || isDownloading || pendingCount > 0) ? 'not-allowed' : 'pointer' }}
          title={pendingCount > 0 ? "قم بمزامنة التعديلات الميدانية الحالية أولاً" : "تحديث البيانات الشاملة من السيرفر"}>
          {isDownloading ? 'جاري تحديث النظام...' : 'تحديث النظام وسحب البيانات ↓'}
        </button>
      </div>
    </div>
  );
};

export default SyncStatus;
