import React, { useState, useEffect } from 'react';
import { cryptoService } from '../crypto/cryptoService';
import { audit } from '../services/auditService';

function SeedLockScreen({ onUnlock }) {
const [mode, setMode] = useState('check');
const [password, setPassword] = useState('');
const [confirm, setConfirm] = useState('');
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);
const [showPassword, setShowPassword] = useState(false);

useEffect(() => {
const checkExisting = async () => {
const { getSetting } = await import('../db/index.js');
const salt = await getSetting('seed_salt');
setMode(salt ? 'check' : 'create');
};
checkExisting();
}, []);

const handleCreate = async () => {
if (password.length < 10) {
setError('كلمة المرور يجب أن تكون 10 أحرف على الأقل');
return;
}
if (password !== confirm) {
setError('كلمتا المرور غير متطابقتين');
return;
}

setLoading(true);  
try {  
  await cryptoService.unlockSeed(password);  
  await cryptoService.setPin('000000');  
  await audit.log('SEED_CREATED', 'system', null, { firstTime: true });  
  cryptoService._startAutoLock();  
  onUnlock();  
} catch (e) {  
  setError('فشل إنشاء الخزنة: ' + e.message);  
}  
setLoading(false);

};

const handleUnlock = async () => {
setLoading(true);
try {
await cryptoService.unlockSeed(password);
await audit.log('SEED_UNLOCKED', 'system', null, {});
cryptoService._startAutoLock();
onUnlock();
} catch (e) {
setError('كلمة المرور غير صحيحة');
}
setLoading(false);
};

return (
<div style={{
position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
background: '#1F4E78', display: 'flex', alignItems: 'center',
justifyContent: 'center', zIndex: 99999, direction: 'rtl'
}}>
<div style={{
background: 'white', padding: '40px', borderRadius: '12px',
width: '90%', maxWidth: '400px', boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
}}>
<div style={{ textAlign: 'center', marginBottom: '30px' }}>
<div style={{ fontSize: '48px', marginBottom: '10px' }}>🔐</div>
<h2 style={{ margin: 0, color: '#1F4E78' }}>
{mode === 'create' ? 'إنشاء خزنة جديدة' : 'فتح الخزنة'}
</h2>
<p style={{ color: '#7f8c8d', fontSize: '14px' }}>
{mode === 'create'
? 'هذه الكلمة لا يمكن استردادها — احتفظ بها بأمان'
: 'أدخل كلمة مرور الخزنة لفك تشفير البيانات'
}
</p>
</div>

<div style={{ marginBottom: '20px', position: 'relative' }}>  
      <input  
        type={showPassword ? 'text' : 'password'}  
        value={password}  
        onChange={e => setPassword(e.target.value)}  
        placeholder="كلمة مرور الخزنة (10+ أحرف)"  
        style={{  
          width: '100%', padding: '12px', borderRadius: '6px',  
          border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box'  
        }}  
      />  
      <button  
        onClick={() => setShowPassword(!showPassword)}  
        style={{  
          position: 'absolute', left: '10px', top: '10px',  
          background: 'none', border: 'none', cursor: 'pointer'  
        }}  
      >  
        {showPassword ? '🙈' : '👁️'}  
      </button>  
    </div>  

    {mode === 'create' && (  
      <div style={{ marginBottom: '20px' }}>  
        <input  
          type="password"  
          value={confirm}  
          onChange={e => setConfirm(e.target.value)}  
          placeholder="تأكيد كلمة المرور"  
          style={{  
            width: '100%', padding: '12px', borderRadius: '6px',  
            border: '1px solid #ddd', fontSize: '16px', boxSizing: 'border-box'  
          }}  
        />  
      </div>  
    )}  

    {error && (  
      <div style={{  
        background: '#ffebee', color: '#c62828', padding: '10px',  
        borderRadius: '4px', marginBottom: '15px', fontSize: '14px'  
      }}>  
        ⚠️ {error}  
      </div>  
    )}  

    <button  
      onClick={mode === 'create' ? handleCreate : handleUnlock}  
      disabled={loading}  
      style={{  
        width: '100%', padding: '14px',  
        background: loading ? '#95a5a6' : '#27ae60',  
        color: 'white', border: 'none', borderRadius: '6px',  
        fontSize: '16px', fontWeight: 'bold',  
        cursor: loading ? 'not-allowed' : 'pointer'  
      }}  
    >  
      {loading ? '⏳ جاري...' : mode === 'create' ? '🔐 إنشاء الخزنة' : '🔓 فتح'}  
    </button>  

    {mode === 'check' && (  
      <p style={{  
        textAlign: 'center', marginTop: '20px',  
        fontSize: '12px', color: '#e74c3c'  
      }}>  
        ⚠️ نسيان كلمة المرور = فقدان البيانات نهائياً  
      </p>  
    )}  
  </div>  
</div>

);
}

export default SeedLockScreen;
