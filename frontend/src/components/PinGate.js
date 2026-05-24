import React, { useState } from 'react';
import { cryptoService } from '../crypto/cryptoService';

function PinGate({ onSuccess, actionLabel, required = false }) {
const [pin, setPin] = useState('');
const [error, setError] = useState('');
const [attempts, setAttempts] = useState(0);

if (!required || cryptoService.isPinValid()) {
return null;
}

const handleSubmit = async () => {
if (pin.length !== 6) {
setError('PIN يجب أن يكون 6 أرقام');
return;
}

const valid = await cryptoService.verifyPin(pin);  
if (valid) {  
  setPin('');  
  setError('');  
  setAttempts(0);  
  onSuccess();  
} else {  
  const newAttempts = attempts + 1;  
  setAttempts(newAttempts);  
  setError(`PIN غير صحيح (${newAttempts}/5)`);  
  setPin('');  
    
  if (newAttempts >= 5) {  
    cryptoService.lock();  
    window.location.reload();  
  }  
}

};

return (
<div style={{
position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
background: 'rgba(0,0,0,0.7)', display: 'flex',
alignItems: 'center', justifyContent: 'center',
zIndex: 99998, direction: 'rtl'
}}>
<div style={{
background: 'white', padding: '30px', borderRadius: '10px',
width: '300px', textAlign: 'center'
}}>
<div style={{ fontSize: '36px', marginBottom: '10px' }}>🔢</div>
<h3 style={{ margin: '0 0 5px 0' }}>{actionLabel}</h3>
<p style={{ fontSize: '13px', color: '#666', marginBottom: '20px' }}>
أدخل PIN المشرف (6 أرقام)
</p>

<input  
      type="password"  
      inputMode="numeric"  
      pattern="[0-9]*"  
      maxLength={6}  
      value={pin}  
      onChange={e => setPin(e.target.value.replace(/\D/g, ''))}  
      onKeyPress={e => e.key === 'Enter' && handleSubmit()}  
      style={{  
        width: '150px', padding: '12px', fontSize: '20px',  
        textAlign: 'center', letterSpacing: '8px',  
        border: '2px solid #1F4E78', borderRadius: '6px',  
        marginBottom: '15px'  
      }}  
      autoFocus  
    />  

    {error && (  
      <p style={{ color: '#e74c3c', fontSize: '14px', marginBottom: '10px' }}>  
        {error}  
      </p>  
    )}  

    <button  
      onClick={handleSubmit}  
      style={{  
        padding: '10px 30px', background: '#1F4E78',  
        color: 'white', border: 'none', borderRadius: '6px',  
        cursor: 'pointer', fontWeight: 'bold'  
      }}  
    >  
      تأكيد  
    </button>  
  </div>  
</div>

);
}

export default PinGate;
