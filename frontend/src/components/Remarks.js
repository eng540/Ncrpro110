import React, { useState, useEffect } from 'react';

const severityColors = { minor: '#FFC000', major: '#FF6600', critical: '#C00000' };
const statusColors = { open: '#FFEB9C', closed: '#C6EFCE', overdue: '#FFC7CE' };

function Remarks({ apiUrl }) {
  const [remarks, setRemarks] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetch(`${apiUrl}/remarks`)
      .then(r => r.json())
      .then(data => setRemarks(data));
  }, [apiUrl]);

  const filtered = remarks.filter(r => 
    filter === '' || r.status === filter || r.severity === filter
  );

  const closeRemark = async (id) => {
    await fetch(`${apiUrl}/remarks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed', closed_date: new Date().toISOString() })
    });
    setRemarks(prev => prev.map(r => r.id === id ? { ...r, status: 'closed', closed_date: new Date().toISOString() } : r));
  };

  return (
    <div>
      <div style={{display:'flex',gap:'12px',marginBottom:'20px',alignItems:'center'}}>
        <h2 style={{color:'#1F4E78',margin:0}}>سجل الملاحظات والعيوب</h2>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{padding:'8px'}}>
          <option value="">الكل</option>
          <option value="open">مفتوحة</option>
          <option value="closed">مغلقة</option>
          <option value="overdue">متأخرة</option>
          <option value="critical">حرجة</option>
          <option value="major">كبيرة</option>
          <option value="minor">بسيطة</option>
        </select>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill, minmax(320px, 1fr))',gap:'16px'}}>
        {filtered.map(r => (
          <div key={r.id} style={{background:'white',borderRadius:'8px',padding:'16px',boxShadow:'0 2px 8px rgba(0,0,0,0.08)',borderRight:`4px solid ${severityColors[r.severity]}`}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'8px'}}>
              <span style={{fontWeight:'bold',fontSize:'14px'}}>{r.remark_id || `REM-${r.id}`}</span>
              <span style={{background: severityColors[r.severity],color:'white',padding:'2px 8px',borderRadius:'4px',fontSize:'12px'}}>
                {r.severity}
              </span>
            </div>
            <div style={{fontSize:'13px',color:'#666',marginBottom:'8px'}}>
              الحمام: {r.latrine_id} | البند: {r.boq_code || '-'}
            </div>
            <div style={{marginBottom:'8px'}}>{r.description}</div>
            <div style={{fontSize:'12px',color:'#666',marginBottom:'8px'}}>
              <strong>الإجراء المطلوب:</strong> {r.action_required}
            </div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{background: statusColors[r.status],padding:'4px 8px',borderRadius:'4px',fontSize:'12px'}}>
                {r.status}
              </span>
              {r.status === 'open' && (
                <button 
                  onClick={() => closeRemark(r.id)}
                  style={{padding:'4px 12px',background:'#70AD47',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12px'}}
                >
                  إغلاق
                </button>
              )}
            </div>
            {r.deadline && (
              <div style={{fontSize:'11px',color:'#C00000',marginTop:'8px'}}>
                الموعد النهائي: {new Date(r.deadline).toLocaleDateString('ar-SA')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default Remarks;
