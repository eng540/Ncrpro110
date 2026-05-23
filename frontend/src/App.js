import React, { useState, useEffect } from 'react';
import SyncStatus from './components/SyncStatus';
import LatrineList from './components/LatrineList';
import BoqUpdater from './components/BoqUpdater';
import RemarksManager from './components/RemarksManager';
import BulkUpdate from './components/BulkUpdate';
import Dashboard from './components/Dashboard';
import DailyLogForm from './components/DailyLogForm';
import DailyLogList from './components/DailyLogList';
import ReportsPanel from './components/ReportsPanel';
import AdminPanel from './components/AdminPanel';
import SpeedEntryMatrix from './components/SpeedEntryMatrix';
import GovernanceDashboard from './components/GovernanceDashboard'; // استيراد المكون الجديد
import { db, populateLocalDB } from './db';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

function App() {
  const [currentView, setCurrentView] = useState({ 
    name: 'LIST', 
    latrineId: null, 
    boqCode: null, 
    filterStatus: '',
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
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>🏗️</div>
        <h2>جاري تهيئة النظام الميداني...</h2>
        <p style={{ color: '#7f8c8d' }}>يرجى الانتظار أثناء تحميل البيانات</p>
      </div>
    );
  }

  const navigateTo = (viewName, params = {}) => {
    setCurrentView(prev => ({
      name: viewName,
      latrineId: params.latrineId !== undefined ? params.latrineId : prev.latrineId,
      boqCode: params.boqCode !== undefined ? params.boqCode : null,
      filterStatus: params.filterStatus !== undefined ? params.filterStatus : '',
      previousView: prev.name
    }));
  };

  const goBack = () => {
    setCurrentView(prev => ({
      name: prev.previousView || 'LIST',
      latrineId: prev.latrineId,
      boqCode: null,
      filterStatus: '',
      previousView: 'LIST'
    }));
  };

  return (
    <div style={{ fontFamily: 'Tahoma, sans-serif', backgroundColor: '#f5f6fa', minHeight: '100vh', direction: 'rtl' }}>
      <SyncStatus />

      <div style={{ 
        background: '#1F4E78', 
        padding: '10px 20px', 
        display: 'flex', 
        gap: '10px', 
        flexWrap: 'wrap',
        position: 'sticky',
        top: '50px',
        zIndex: 999
      }}>
        <NavButton 
          active={['LIST', 'BOQ', 'REMARKS'].includes(currentView.name)}
          onClick={() => navigateTo('LIST', { filterStatus: '' })}
          label="🏗️ سجل الحمامات"
        />
        <NavButton 
          active={currentView.name === 'BULK'}
          onClick={() => navigateTo('BULK')}
          label="⚡ الشبكة المتقدمة"
        />
        <NavButton 
          active={currentView.name === 'SPEED_ENTRY'}
          onClick={() => navigateTo('SPEED_ENTRY')}
          label="🚀 الإدخال السريع"
          style={{ background: currentView.name === 'SPEED_ENTRY' ? '#fff' : 'rgba(255,215,0,0.2)', color: currentView.name === 'SPEED_ENTRY' ? '#1F4E78' : '#ffd700' }}
        />
        <NavButton 
          active={currentView.name === 'DAILY_LOG'}
          onClick={() => navigateTo('DAILY_LOG')}
          label="📝 التقرير اليومي"
        />
        <NavButton 
          active={currentView.name === 'DAILY_LOG_LIST'}
          onClick={() => navigateTo('DAILY_LOG_LIST')}
          label="📋 سجل التقارير"
        />
        <NavButton 
          active={currentView.name === 'DASHBOARD'}
          onClick={() => navigateTo('DASHBOARD')}
          label="📊 لوحة المؤشرات"
        />
        <NavButton 
          active={currentView.name === 'REPORTS'}
          onClick={() => navigateTo('REPORTS')}
          label="📈 التقارير"
        />
        {/* زر الحوكمة الجديد */}
        <NavButton 
          active={currentView.name === 'GOVERNANCE'}
          onClick={() => navigateTo('GOVERNANCE')}
          label="⚖️ الحوكمة"
          style={{ background: currentView.name === 'GOVERNANCE' ? '#fff' : 'rgba(142, 68, 173, 0.2)', color: currentView.name === 'GOVERNANCE' ? '#1F4E78' : '#e8bcf0' }}
        />
        <NavButton 
          active={currentView.name === 'ADMIN'}
          onClick={() => navigateTo('ADMIN')}
          label="⚙️ الإدارة"
          style={{ marginRight: 'auto', background: 'rgba(255,255,255,0.15)' }}
        />
      </div>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>

        {currentView.name === 'LIST' && (
          <LatrineList 
            initialFilter={currentView.filterStatus}
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
            initialFilter={currentView.filterStatus}
            onBack={goBack}
          />
        )}

        {currentView.name === 'BULK' && (
          <BulkUpdate 
            onOpenRemarks={(id, boqCode) => navigateTo('REMARKS', { latrineId: id, boqCode })}
          />
        )}

        {currentView.name === 'SPEED_ENTRY' && (
          <SpeedEntryMatrix onBack={() => navigateTo('LIST')} />
        )}

        {currentView.name === 'DAILY_LOG' && (
          <DailyLogForm onSaved={() => navigateTo('DAILY_LOG_LIST')} />
        )}

        {currentView.name === 'DAILY_LOG_LIST' && (
          <DailyLogList />
        )}

        {currentView.name === 'DASHBOARD' && (
          <Dashboard navigateTo={navigateTo} />
        )}

        {currentView.name === 'REPORTS' && (
          <ReportsPanel />
        )}

        {currentView.name === 'ADMIN' && (
          <AdminPanel onBack={() => navigateTo('LIST')} />
        )}

        {/* عرض لوحة الحوكمة */}
        {currentView.name === 'GOVERNANCE' && (
          <GovernanceDashboard onBack={() => navigateTo('LIST')} />
        )}

      </div>
    </div>
  );
}

function NavButton({ active, onClick, label, style = {} }) {
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
        fontSize: '14px',
        transition: 'all 0.2s',
        whiteSpace: 'nowrap',
        ...style
      }}
    >
      {label}
    </button>
  );
}

export default App;