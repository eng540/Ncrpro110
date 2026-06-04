// AUTH-PATCH 2026-06-02: Ш§ШіШӘШ®ШҜШ§Щ… apiFetch ШЁШҜЩ„Ш§ЩӢ Щ…ЩҶ fetch Ш§Щ„Щ…ШЁШ§ШҙШұ (Щ…Ш№ Ш§Щ„Ш§ШӯШӘЩҒШ§Шё ШЁЩғЩ„ Ш§Щ„ЩҲШёШ§ШҰЩҒ)

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
      if (isSyncingImages) return;
      isSyncingImages = true;
      setIsOnline(true);
      try {
        await imageService.syncPendingImages();
      } catch (err) {
        console.error("Online image sync error:", err);
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

  // ШҜЩҒШ№ Ш§Щ„ШӘШ№ШҜЩҠЩ„Ш§ШӘ ШҘЩ„Щү Ш§Щ„Ш®Ш§ШҜЩ…
  const handlePushSync = async () => {
    if (!isOnline || pendingCount === 0) return;
    setIsSyncing(true);
    try {
      const result = await syncWithServer();
      alert(`ШӘЩ…ШӘ Ш§Щ„Щ…ШІШ§Щ…ЩҶШ© ШЁЩҶШ¬Ш§Шӯ: ${result.processed} Ш№Щ…Щ„ЩҠШ© ЩҶШ§Ш¬ШӯШ©.`);
    } catch (error) {
      alert(`Ш®Ш·ШЈ ЩҒЩҠ Ш§Щ„Щ…ШІШ§Щ…ЩҶШ©: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // ШіШӯШЁ ШЈШӯШҜШ« Ш§Щ„ШЁЩҠШ§ЩҶШ§ШӘ Щ…ЩҶ Ш§Щ„Ш®Ш§ШҜЩ… (ШӘШӯЩ…ЩҠЩ„)
  const handleDownloadData = async () => {
    if (!isOnline) {
      alert("ЩҠШ¬ШЁ ШЈЩҶ ШӘЩғЩҲЩҶ Щ…ШӘШөЩ„Ш§ЩӢ ШЁШ§Щ„ШҘЩҶШӘШұЩҶШӘ Щ„ШӘШӯЩ…ЩҠЩ„ Ш§Щ„ШЁЩҠШ§ЩҶШ§ШӘ.");
      return;
    }
    if (pendingCount > 0) {
      alert("Щ„ШҜЩҠЩғ ШӘШ№ШҜЩҠЩ„Ш§ШӘ Щ…ШӯЩ„ЩҠШ© Щ„Щ… ЩҠШӘЩ… ШҘШұШіШ§Щ„ЩҮШ§. ЩҠШұШ¬Щү Щ…ШІШ§Щ…ЩҶШ© ШЁЩҠШ§ЩҶШ§ШӘЩғ ШЈЩҲЩ„Ш§ЩӢ.");
      return;
    }

    setIsDownloading(true);
    try {
      // вң… Ш§Щ„ШӘШәЩҠЩҠШұ Ш§Щ„ЩҲШӯЩҠШҜ: Ш§ШіШӘШЁШҜШ§Щ„ fetch ШЁЩҖ apiFetch
      const [latrinesRes, boqRes, remarksRes, templatesRes] = await Promise.all([
        apiFetch('/latrines?limit=200'),
        apiFetch('/boq-items'),
        apiFetch('/remarks'),
        apiFetch('/remark-templates')
      ]);

      if (!latrinesRes.ok || !boqRes.ok) throw new Error("ЩҒШҙЩ„ Ш§Щ„Ш§ШӘШөШ§Щ„ ШЁШ§Щ„Ш®Ш§ШҜЩ…");

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
      alert("ШӘЩ… ШӘШӯЩ…ЩҠЩ„ ШЈШӯШҜШ« Ш§Щ„ШЁЩҠШ§ЩҶШ§ШӘ (ШЁЩ…Ш§ ЩҒЩҠЩҮШ§ Щ…ЩғШӘШЁШ© Ш§Щ„Щ…Щ„Ш§ШӯШёШ§ШӘ) ШЁЩҶШ¬Ш§Шӯ!");
    } catch (error) {
      console.error(error);
      alert("ШӘШ№Ш°Шұ ШӘШӯЩ…ЩҠЩ„ Ш§Щ„ШЁЩҠШ§ЩҶШ§ШӘ Щ…ЩҶ Ш§Щ„Ш®Ш§ШҜЩ….");
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
        <strong>{isOnline ? 'Щ…ШӘШөЩ„ ШЁШ§Щ„ШҘЩҶШӘШұЩҶШӘ (Online)' : 'Ш§Щ„Ш№Щ…Щ„ ШҜЩҲЩҶ Ш§ШӘШөШ§Щ„ (Offline)'}</strong>
        {pendingCount > 0 && <span style={{ marginRight: '15px', fontWeight: 'bold' }}>- Ш№Щ…Щ„ЩҠШ§ШӘ ШӘЩҶШӘШёШұ Ш§Щ„ШҘШұШіШ§Щ„: {pendingCount}</span>}
      </div>
      <div style={{ display: 'flex', gap: '10px' }}>
        {pendingCount > 0 && (
          <button onClick={handlePushSync} disabled={!isOnline || isSyncing}
            style={{ padding: '6px 12px', backgroundColor: 'white', color: '#f39c12', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: (!isOnline || isSyncing) ? 'not-allowed' : 'pointer' }}>
            {isSyncing ? 'Ш¬Ш§ШұЩҠ Ш§Щ„ШҘШұШіШ§Щ„...' : 'ШҘШұШіШ§Щ„ Ш§Щ„ШӘШ№ШҜЩҠЩ„Ш§ШӘ Щ„Щ„Ш®Ш§ШҜЩ…'}
          </button>
        )}
        <button onClick={handleDownloadData} disabled={!isOnline || isDownloading || pendingCount > 0}
          style={{ padding: '6px 12px', backgroundColor: 'rgba(255,255,255,0.2)', color: 'white', border: '1px solid white', borderRadius: '4px', fontWeight: 'bold', cursor: (!isOnline || isDownloading || pendingCount > 0) ? 'not-allowed' : 'pointer' }}
          title={pendingCount > 0 ? "ЩӮЩ… ШЁШҘШұШіШ§Щ„ ШӘШ№ШҜЩҠЩ„Ш§ШӘЩғ ШЈЩҲЩ„Ш§ЩӢ" : "ШіШӯШЁ ШЈШӯШҜШ« Ш§Щ„ШЁЩҠШ§ЩҶШ§ШӘ Щ…ЩҶ Ш§Щ„Ш®Ш§ШҜЩ…"}>
          {isDownloading ? 'Ш¬Ш§ШұЩҠ Ш§Щ„ШӘШӯЩ…ЩҠЩ„...' : 'ШӘШӯЩ…ЩҠЩ„ ШЈШӯШҜШ« Ш§Щ„ШЁЩҠШ§ЩҶШ§ШӘ Щ…ЩҶ Ш§Щ„Ш®Ш§ШҜЩ… вҶ“'}
        </button>
      </div>
    </div>
  );
};

export default SyncStatus;