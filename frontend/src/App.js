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
import GovernanceDashboard from './components/GovernanceDashboard';
import BoqAnalytics from './components/BoqAnalytics';
import QualityInspector from './components/QualityInspector';
import { db, populateLocalDB } from './db';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// ==========================================
// أيقونات SVG
// ==========================================
const ICONS = {
  list: <path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>,
  bulk: <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>,
  speed: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/>,
  daily: <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>,
  logs: <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>,
  dashboard: <path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>,
  reports: <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>,
  boq: <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z"/>,
  governance: <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>,
  admin: <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>,
  quality: <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
};

function SvgIcon({ children, size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      {children}
    </svg>
  );
}

const navItems = [
  { name: 'LIST', label: 'سجل الحمامات', icon: ICONS.list, activeOn: ['LIST', 'BOQ', 'REMARKS'] },
  { name: 'BULK', label: 'الشبكة المتقدمة', icon: ICONS.bulk },
  { name: 'SPEED_ENTRY', label: 'الإدخال السريع', icon: ICONS.speed, highlight: true },
  { name: 'DAILY_LOG', label: 'التقرير اليومي', icon: ICONS.daily },
  { name: 'DAILY_LOG_LIST', label: 'سجل التقارير', icon: ICONS.logs },
  { name: 'DASHBOARD', label: 'لوحة المؤشرات', icon: ICONS.dashboard },
  { name: 'REPORTS', label: 'التقارير', icon: ICONS.reports },
  { name: 'BOQ_ANALYTICS', label: 'تحليل البنود', icon: ICONS.boq },
  { name: 'GOVERNANCE', label: 'الحوكمة', icon: ICONS.governance },
  { name: 'QUALITY_INSPECTOR', label: 'فحص الجودة', icon: ICONS.quality },
  { name: 'ADMIN', label: 'الإدارة', icon: ICONS.admin },
];

function App() {
  const [currentView, setCurrentView] = useState({
    name: 'LIST',
    latrineId: null,
    boqCode: null,
    filterStatus: '',
    previousView: 'LIST'
  });
  const [isInitializing, setIsInitializing] = useState(true);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);

  // ==========================================
  // 🌟 التحديث: جلب القوالب الذكية مع البيانات
  // ==========================================
  const initializeData = async () => {
    try {
      const count = await db.latrines.count();
      if (count === 0 && navigator.onLine) {
        const [latrinesRes, boqRes, remarksRes, templatesRes] = await Promise.all([
          fetch(`${API_BASE_URL}/latrines?limit=200`),
          fetch(`${API_BASE_URL}/boq-items`),
          fetch(`${API_BASE_URL}/remarks`),
          fetch(`${API_BASE_URL}/remark-templates`)
        ]);

        if (latrinesRes.ok && boqRes.ok) {
          const latrines = await latrinesRes.json();
          const boqItems = await boqRes.json();
          const remarks = remarksRes.ok ? await remarksRes.json() : [];
          const templates = templatesRes.ok ? await templatesRes.json() : [];
          
          await db.transaction('rw', db.latrines, db.boq_items, db.remarks, db.remark_templates, async () => {
            await db.latrines.clear();
            await db.boq_items.clear();
            await db.remarks.clear();
            await db.remark_templates.clear();

            if (latrines?.length > 0) await db.latrines.bulkAdd(latrines);  
            if (boqItems?.length > 0) await db.boq_items.bulkAdd(boqItems);  
            if (templates?.length > 0) await db.remark_templates.bulkAdd(templates); // 🌟 حفظ القوالب محلياً
            
            if (remarks?.length > 0) {  
              const remarksWithSync = remarks.map(r => ({...r, sync_status: 'synced'}));  
              await db.remarks.bulkAdd(remarksWithSync);  
            }  
          });
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
    <div style={{ display: 'flex', minHeight: '100vh', fontFamily: 'Tahoma, sans-serif', direction: 'rtl', backgroundColor: '#f5f6fa' }}>
      {/* الشريط الجانبي */}
      <div style={{
        width: sidebarExpanded ? '220px' : '70px',
        background: 'linear-gradient(180deg, #1A3A5C 0%, #1F4E78 100%)',
        color: 'white',
        transition: 'width 0.3s ease',
        overflow: 'hidden',
        boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        zIndex: 10
      }}>
        <button
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          style={{
            background: 'rgba(255,255,255,0.1)',
            border: 'none',
            color: 'white',
            padding: '15px',
            cursor: 'pointer',
            fontSize: '20px',
            display: 'flex',
            justifyContent: 'center',
            transition: 'background 0.2s',
          }}
          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
          onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.1)'}
        >
          {sidebarExpanded ? '◀' : '▶'}
        </button>

        <nav style={{ flex: 1, padding: '10px 0' }}>
          {navItems.map((item) => {
            const isActive = item.activeOn
              ? item.activeOn.includes(currentView.name)
              : currentView.name === item.name;

            return (
              <button
                key={item.name}
                onClick={() => navigateTo(item.name, item.name === 'LIST' ? { filterStatus: '' } : {})}
                title={item.label}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: sidebarExpanded ? '12px 20px' : '12px 0',
                  justifyContent: sidebarExpanded ? 'flex-start' : 'center',
                  background: isActive ? 'rgba(255,255,255,0.2)' : 'transparent',
                  color: item.highlight && !isActive ? '#FFD700' : 'white',
                  border: 'none',
                  borderRight: isActive ? '4px solid #FFD700' : '4px solid transparent',
                  cursor: 'pointer',
                  fontSize: '16px',
                  fontWeight: isActive ? 'bold' : 'normal',
                  transition: 'all 0.2s',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.background = 'transparent';
                }}
              >
                <SvgIcon size={22}>{item.icon}</SvgIcon>
                {sidebarExpanded && <span style={{ fontSize: '14px' }}>{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {sidebarExpanded && (
          <div style={{ padding: '15px', fontSize: '11px', color: 'rgba(255,255,255,0.5)', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            NRC Latrine Tracker v3.0
          </div>
        )}
      </div>

      {/* المحتوى الرئيسي */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowX: 'auto' }}>
        <SyncStatus />
        <div style={{ flex: 1, padding: '20px', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
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
          {currentView.name === 'GOVERNANCE' && (
            <GovernanceDashboard onBack={() => navigateTo('LIST')} />
          )}
          {currentView.name === 'BOQ_ANALYTICS' && (
            <BoqAnalytics onBack={() => navigateTo('LIST')} />
          )}
          {currentView.name === 'QUALITY_INSPECTOR' && (
            <QualityInspector onBack={() => navigateTo('DASHBOARD')} initialFilter={currentView.filterStatus} />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;