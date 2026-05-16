import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';
import LatrineList from './components/LatrineList';
import LatrineDetail from './components/LatrineDetail';
import Remarks from './components/Remarks';
import BulkUpdate from './components/BulkUpdate';

const API_URL = '/api';
const PROJECT_PIN = '2525'; // رمز الدخول الموحد للمشروع

const styles = {
  app: { minHeight: '100vh', background: '#f5f6fa' },
  header: { background: '#1F4E78', color: 'white', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' },
  title: { margin: 0, fontSize: '20px' },
  nav: { display: 'flex', gap: '8px', flexWrap: 'wrap' },
  navBtn: (active) => ({ background: active ? '#FFC000' : 'transparent', color: active ? '#1F4E78' : 'white', border: '1px solid rgba(255,255,255,0.3)', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' }),
  content: { padding: '24px', maxWidth: '1400px', margin: '0 auto' },
  card: { background: 'white', borderRadius: '8px', padding: '20px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' },
  
  // أنماط شاشة تسجيل الدخول
  loginWrapper: { display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', background: '#1F4E78' },
  loginBox: { background: 'white', padding: '40px', borderRadius: '12px', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', textAlign: 'center', maxWidth: '400px', width: '90%' },
  loginInput: { width: '100%', padding: '14px', margin: '20px 0', borderRadius: '6px', border: '2px solid #e0e0e0', fontSize: '24px', textAlign: 'center', boxSizing: 'border-box', letterSpacing: '4px' },
  loginBtn: { width: '100%', padding: '14px', background: '#70AD47', color: 'white', border: 'none', borderRadius: '6px', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer' },
  logoutBtn: { background: 'transparent', color: '#FFC7CE', border: '1px solid #FFC7CE', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', marginRight: 'auto' }
};

function App() {
  // حالة المصادقة (تتحقق مما إذا كان الرمز محفوظاً مسبقاً)
  const [isAuthenticated, setIsAuthenticated] = useState(
    localStorage.getItem('nrc_project_pin') === PROJECT_PIN
  );
  const [pinInput, setPinInput] = useState('');
  const [loginError, setLoginError] = useState('');

  const [view, setView] = useState('dashboard');
  const [selectedLatrine, setSelectedLatrine] = useState(null);
  const [apiStatus, setApiStatus] = useState('checking');

  useEffect(() => {
    if (isAuthenticated) {
      fetch(`${API_URL.replace('/api','')}/health`)
        .then(r => r.ok ? setApiStatus('connected') : setApiStatus('error'))
        .catch(() => setApiStatus('error'));
    }
  }, [isAuthenticated]);

  // دالة معالجة تسجيل الدخول
  const handleLogin = (e) => {
    e.preventDefault();
    if (pinInput === PROJECT_PIN) {
      localStorage.setItem('nrc_project_pin', PROJECT_PIN); // حفظ الرمز في المتصفح
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('رمز المرور غير صحيح، يرجى المحاولة مرة أخرى.');
      setPinInput('');
    }
  };

  // دالة تسجيل الخروج
  const handleLogout = () => {
    localStorage.removeItem('nrc_project_pin');
    setIsAuthenticated(false);
    setPinInput('');
    setView('dashboard');
  };

  // إذا لم يكن مسجلاً للدخول، اعرض شاشة القفل
  if (!isAuthenticated) {
    return (
      <div style={styles.loginWrapper}>
        <div style={styles.loginBox}>
          <div style={{background: '#FFC000', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: '24px'}}>🔒</div>
          <h2 style={{color: '#1F4E78', margin: '0 0 8px 0'}}>NRC Latrine Tracker</h2>
          <p style={{color: '#666', margin: 0, fontSize: '14px'}}>مشروع ECHO 2525 - مديرية الزهرة</p>
          
          <form onSubmit={handleLogin}>
            <input 
              type="password" 
              placeholder="••••"
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              style={styles.loginInput}
              autoFocus
            />
            {loginError && <div style={{color: '#C00000', fontSize: '13px', marginBottom: '16px', fontWeight: 'bold'}}>{loginError}</div>}
            <button type="submit" style={styles.loginBtn}>دخول للنظام</button>
          </form>
        </div>
      </div>
    );
  }

  const renderView = () => {
    switch(view) {
      case 'dashboard': return <Dashboard apiUrl={API_URL} />;
      case 'latrines': return <LatrineList apiUrl={API_URL} onSelect={(l) => { setSelectedLatrine(l); setView('detail'); }} />;
      case 'detail': return <LatrineDetail apiUrl={API_URL} latrine={selectedLatrine} onBack={() => setView('latrines')} />;
      case 'remarks': return <Remarks apiUrl={API_URL} />;
      case 'bulk': return <BulkUpdate apiUrl={API_URL} />;
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
        <div style={{display:'flex',alignItems:'center',gap:'16px', flexWrap: 'wrap'}}>
          <span style={{fontSize:'12px',background: apiStatus==='connected'?'#C6EFCE':'#FFC7CE',padding:'4px 8px',borderRadius:'4px',color:'#333'}}>
            API: {apiStatus}
          </span>
          <nav style={styles.nav}>
            <button style={styles.navBtn(view==='dashboard')} onClick={() => setView('dashboard')}>لوحة القيادة</button>
            <button style={styles.navBtn(view==='latrines')} onClick={() => setView('latrines')}>الحمامات</button>
            <button style={styles.navBtn(view==='bulk')} onClick={() => setView('bulk')}>التحديث الجماعي</button>
            <button style={styles.navBtn(view==='remarks')} onClick={() => setView('remarks')}>الملاحظات</button>
          </nav>
          <button onClick={handleLogout} style={styles.logoutBtn}>تسجيل خروج</button>
        </div>
      </header>
      <main style={styles.content}>
        {renderView()}
      </main>
    </div>
  );
}

export default App;