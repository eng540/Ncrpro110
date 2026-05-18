import React, { useState, useEffect } from 'react';
import SyncStatus from './components/SyncStatus';
import LatrineList from './components/LatrineList';
import BoqUpdater from './components/BoqUpdater';
import RemarksManager from './components/RemarksManager';
import BulkUpdate from './components/BulkUpdate';
import Dashboard from './components/Dashboard';
import { db, populateLocalDB } from './db';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

function App() {
  const [currentView, setCurrentView] = useState({ 
    name: 'LIST', 
    latrineId: null, 
    boqCode: null, 
    previousView: 'LIST' 
  });
  const [isInitializing, setIsInitializing] = useState(true);

  const initializeData = async () => {
    try {
      const count = await db.latrines.count();
      if (count === 0 && navigator.onLine) {
        const [latrinesRes, boqRes, remarksRes] = await Promise.all([
          fetch(`${API_BASE_URL}/latrines?limit=200`),
          fetch(`${API_BASE_URL}/boq-items`),
          fetch(`${API_BASE_URL}/remarks`)
        ]);

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

  if (isInitializing) {
    return (
      <div style={{ padding: '50px', textAlign: 'center', direction: 'rtl' }}>
        جاري تهيئة النظام الميداني...
      </div>
    );
  }

  const navigateTo = (viewName, params = {}) => {
    setCurrentView(prev => ({
      name: viewName,
      latrineId: params.latrineId ?? prev.latrineId,
      boqCode: params.boqCode ?? null,
      previousView: prev.name
    }));
  };

  const goBack = () => {
    setCurrentView(prev => ({
      name: prev.previousView || 'LIST',
      latrineId: prev.latrineId,
      boqCode: null,
      previousView: 'LIST'
    }));
  };

  return (
    <div style={{ fontFamily: 'Tahoma, sans-serif', backgroundColor: '#f5f6fa', minHeight: '100vh', direction: 'rtl' }}>
      <SyncStatus />

      <div style={{ background: '#1F4E78', padding: '10px 20px', display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
        <NavButton 
          active={['LIST', 'BOQ', 'REMARKS'].includes(currentView.name)}
          onClick={() => navigateTo('LIST')}
          label="سجل الحمامات التفصيلي"
        />
        <NavButton 
          active={currentView.name === 'BULK'}
          onClick={() => navigateTo('BULK')}
          label="الشبكة المتقدمة"
        />
        <NavButton 
          active={currentView.name === 'DASHBOARD'}
          onClick={() => navigateTo('DASHBOARD')}
          label="📊 لوحة المؤشرات (Online)"
        />
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        
        {currentView.name === 'LIST' && (
          <LatrineList 
            onSelectLatrine={(id) => navigateTo('BOQ', { latrineId: id })} 
          />
        )}

        {currentView.name === 'BOQ' && (
          <BoqUpdater 
            latrineId={currentView.latrineId} 
            onBack={goBack}
            onOpenRemarks={(id, boqCode) => navigateTo('REMARKS', { latrineId: id, boqCode })}
          />
        )}

        {currentView.name === 'REMARKS' && (
          <RemarksManager 
            latrineId={currentView.latrineId} 
            boqCode={currentView.boqCode}
            onBack={goBack}
          />
        )}

        {currentView.name === 'BULK' && (
          <BulkUpdate 
            onOpenRemarks={(id, boqCode) => navigateTo('REMARKS', { latrineId: id, boqCode })}
          />
        )}

        {currentView.name === 'DASHBOARD' && (
          <Dashboard />
        )}

      </div>
    </div>
  );
}

function NavButton({ active, onClick, label }) {
  return (
    <button 
      onClick={onClick}
      style={{ 
        background: active ? 'white' : 'transparent', 
        color: active ? '#1F4E78' : 'white', 
        border: 'none', 
        padding: '8px 16px', 
        borderRadius: '4px', 
        cursor: 'pointer', 
        fontWeight: 'bold',
        transition: 'all 0.2s'
      }}
    >
      {label}
    </button>
  );
}

export default App;
