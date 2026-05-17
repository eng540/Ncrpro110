import React, { useState, useEffect } from 'react';
import SyncStatus from './components/SyncStatus';
import LatrineList from './components/LatrineList';
import BoqUpdater from './components/BoqUpdater';
import RemarksManager from './components/RemarksManager';
import { db, populateLocalDB } from './db';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

function App() {
  // state يحتوي على: اسم الشاشة، رقم الحمام، ورقم البند (للملاحظات)
  const [currentView, setCurrentView] = useState({ name: 'LIST', id: null, boqCode: null });
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
    <div style={{ fontFamily: 'Tahoma, sans-serif', backgroundColor: '#f5f6fa', minHeight: '100vh' }}>
      <SyncStatus />
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        
        {currentView.name === 'LIST' && (
          <LatrineList onSelectLatrine={(id) => setCurrentView({ name: 'BOQ', id, boqCode: null })} />
        )}

        {currentView.name === 'BOQ' && (
          <BoqUpdater 
            latrineId={currentView.id} 
            onBack={() => setCurrentView({ name: 'LIST', id: null, boqCode: null })} 
            onOpenRemarks={(id, boqCode) => setCurrentView({ name: 'REMARKS', id, boqCode })}
          />
        )}

        {currentView.name === 'REMARKS' && (
          <RemarksManager 
            latrineId={currentView.id} 
            boqCode={currentView.boqCode} // تمرير كود البند المخصص
            onBack={() => setCurrentView({ name: 'BOQ', id: currentView.id, boqCode: null })} 
          />
        )}

      </div>
    </div>
  );
}

export default App;