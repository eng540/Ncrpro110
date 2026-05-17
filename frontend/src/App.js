import React, { useState, useEffect } from 'react';
import SyncStatus from './components/SyncStatus';
import LatrineList from './components/LatrineList';
import BoqUpdater from './components/BoqUpdater';
import { db, populateLocalDB } from './db';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

function App() {
  const [selectedLatrineId, setSelectedLatrineId] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);

  // دالة لجلب البيانات من الخادم وتخزينها محلياً لأول مرة
  const initializeData = async () => {
    try {
      const count = await db.latrines.count();
      // إذا كانت قاعدة البيانات المحلية فارغة وهناك إنترنت، اجلب البيانات من الخادم
      if (count === 0 && navigator.onLine) {
        console.log("Fetching initial data from server...");
        const latrinesRes = await fetch(`${API_BASE_URL}/latrines`);
        const boqRes = await fetch(`${API_BASE_URL}/boq-items`);
        
        if (latrinesRes.ok && boqRes.ok) {
          const latrines = await latrinesRes.json();
          const boqItems = await boqRes.json();
          await populateLocalDB(latrines, boqItems, []);
        }
      }
    } catch (error) {
      console.error("Failed to initialize data:", error);
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    initializeData();
  }, []);

  if (isInitializing) {
    return <div style={{ padding: '50px', textAlign: 'center', direction: 'rtl' }}>جاري تهيئة النظام الميداني...</div>;
  }

  return (
    <div style={{ fontFamily: 'Tahoma, sans-serif', backgroundColor: '#f5f6fa', minHeight: '100vh' }}>
      <SyncStatus />
      
      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        {selectedLatrineId ? (
          <BoqUpdater 
            latrineId={selectedLatrineId} 
            onBack={() => setSelectedLatrineId(null)} 
          />
        ) : (
          <LatrineList 
            onSelectLatrine={(id) => setSelectedLatrineId(id)} 
          />
        )}
      </div>
    </div>
  );
}

export default App;