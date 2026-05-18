import React, { useState, useEffect } from 'react';
import SyncStatus from './components/SyncStatus';
import LatrineList from './components/LatrineList';
import BoqUpdater from './components/BoqUpdater';
import RemarksManager from './components/RemarksManager';
import BulkUpdate from './components/BulkUpdate';
import { db, populateLocalDB } from './db';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

function App() {
  // إضافة previousView لمعرفة مسار العودة من شاشة الملاحظات
  const [currentView, setCurrentView] = useState({ name: 'LIST', id: null, boqCode: null, previousView: 'LIST' });
  const [isInitializing, setIsInitializing] = useState(true);

  const initializeData = async () => {
    try {
      const count = await db.latrines.count();
      if (count === 0 && navigator.onLine) {
        const latrinesRes = await fetch(`${API_BASE_URL}/latrines?limit=200`);
        const boqRes = await fetch(`${API_BASE_URL}/boq-items`);
        const remarksRes = await fetch(`${API_BASE_URL}/remarks`);
        
        if (latrinesRes.ok && boqRes.ok) {
          const latrines = await latrinesRes.json();
          const boqItems = await boqRes.json();
          const remarks = remarksRes.ok ? await remarksRes.json() : [];
          await populateLocalDB(latrines, boqItems, remarks);
        }
      }
    } catch (error) {
      console.error("Failed to initialize:", error);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    initializeData();
  }, []);

  if (isInitializing) return <div style={{ padding: '50px', textAlign: 'center', direction: 'rtl' }}>جاري تهيئة النظام الميداني...</div>;

  return (
    <div style={{ fontFamily: 'Tahoma, sans-serif', backgroundColor: '#f5f6fa', minHeight: '100vh', direction: 'rtl' }}>
      <SyncStatus />
      
      <div style={{ background: '#1F4E78', padding: '10px 20px', display: 'flex', gap: '15px' }}>
        <button 
          onClick={() => setCurrentView({ name: 'LIST', id: null, boqCode: null, previousView: 'LIST' })}
          style={{ background: currentView.name === 'LIST' || currentView.name === 'BOQ' ? 'white' : 'transparent', color: currentView.name === 'LIST' || currentView.name === 'BOQ' ? '#1F4E78' : 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          سجل الحمامات التفصيلي
        </button>
        <button 
          onClick={() => setCurrentView({ name: 'BULK', id: null, boqCode: null, previousView: 'BULK' })}
          style={{ background: currentView.name === 'BULK' ? 'white' : 'transparent', color: currentView.name === 'BULK' ? '#1F4E78' : 'white', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          الشبكة المتقدمة (التحديث الجماعي والمخصص)
        </button>
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        
        {currentView.name === 'LIST' && (
          <LatrineList onSelectLatrine={(id) => setCurrentView({ name: 'BOQ', id, boqCode: null, previousView: 'LIST' })} />
        )}

        {currentView.name === 'BOQ' && (
          <BoqUpdater 
            latrineId={currentView.id} 
            onBack={() => setCurrentView({ name: 'LIST', id: null, boqCode: null, previousView: 'LIST' })} 
            onOpenRemarks={(id, boqCode) => setCurrentView({ name: 'REMARKS', id, boqCode, previousView: 'BOQ' })}
          />
        )}

        {currentView.name === 'REMARKS' && (
          <RemarksManager 
            latrineId={currentView.id} 
            boqCode={currentView.boqCode}
            onBack={() => setCurrentView({ name: currentView.previousView, id: currentView.id, boqCode: null, previousView: currentView.previousView })} 
          />
        )}

        {currentView.name === 'BULK' && (
          <BulkUpdate 
            onOpenRemarks={(id, boqCode) => setCurrentView({ name: 'REMARKS', id, boqCode, previousView: 'BULK' })}
          />
        )}

      </div>
    </div>
  );
}

export default App;