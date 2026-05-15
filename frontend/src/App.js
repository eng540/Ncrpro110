import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import LatrineList from './components/LatrineList';
import LatrineDetail from './components/LatrineDetail';
import Remarks from './components/Remarks';

const API_URL = '/api';

const styles = {
  app: { minHeight: '100vh', background: '#f5f6fa' },
  header: { background: '#1F4E78', color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { margin: 0, fontSize: '20px' },
  nav: { display: 'flex', gap: '12px' },
  navBtn: (active) => ({ background: active ? '#FFC000' : 'transparent', color: active ? '#1F4E78' : 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }),
  content: { padding: '24px', maxWidth: '1400px', margin: '0 auto' },
  card: { background: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }
};

function App() {
  const [view, setView] = useState('dashboard');
  const [selectedLatrine, setSelectedLatrine] = useState(null);
  const [apiStatus, setApiStatus] = useState('checking');

  useEffect(() => {
    fetch(`${API_URL.replace('/api','')}/health`)
      .then(r => r.ok ? setApiStatus('connected') : setApiStatus('error'))
      .catch(() => setApiStatus('error'));
  }, []);

  const renderView = () => {
    switch(view) {
      case 'dashboard': return <Dashboard apiUrl={API_URL} />;
      case 'latrines': return <LatrineList apiUrl={API_URL} onSelect={(l) => { setSelectedLatrine(l); setView('detail'); }} />;
      case 'detail': return <LatrineDetail apiUrl={API_URL} latrine={selectedLatrine} onBack={() => setView('latrines')} />;
      case 'remarks': return <Remarks apiUrl={API_URL} />;
      default: return <Dashboard apiUrl={API_URL} />;
    }
  };

  return (
    <div style={styles.app}>
      <header style={styles.header}>
        <div>
          <h1 style={styles.title}>NRC Latrine Tracker</h1>
          <small>ECHO 2525 | Al-Zohra District | 110 Latrines</small>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'16px'}}>
          <span style={{fontSize:'12px',background: apiStatus==='connected'?'#C6EFCE':'#FFC7CE',padding:'4px 8px',borderRadius:'4px',color:'#333'}}>
            API: {apiStatus}
          </span>
          <nav style={styles.nav}>
            <button style={styles.navBtn(view==='dashboard')} onClick={() => setView('dashboard')}>لوحة القيادة</button>
            <button style={styles.navBtn(view==='latrines')} onClick={() => setView('latrines')}>الحمامات</button>
            <button style={styles.navBtn(view==='remarks')} onClick={() => setView('remarks')}>الملاحظات</button>
          </nav>
        </div>
      </header>
      <main style={styles.content}>
        {renderView()}
      </main>
    </div>
  );
}

export default App;
