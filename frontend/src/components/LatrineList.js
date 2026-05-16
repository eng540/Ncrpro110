import React, { useState, useEffect } from 'react';

const statusColors = {
  completed: '#C6EFCE',
  in_progress: '#FFEB9C',
  not_started: '#E2EFDA',
  on_hold: '#B8CCE4',
  rejected: '#FFC7CE'
};

const statusLabels = {
  completed: 'مكتمل',
  in_progress: 'جاري',
  not_started: 'لم يبدأ',
  on_hold: 'متوقف',
  rejected: 'مرفوض'
};

function LatrineList({ apiUrl, onSelect }) {
  const [latrines, setLatrines] = useState([]);
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    
    // ARCHITECTURE FIX: Added limit=200 to fetch all 110 latrines
    const baseUrl = `${apiUrl}/latrines?limit=200`;
    const url = statusFilter ? `${baseUrl}&status=${statusFilter}` : baseUrl;
    
    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error('فشل الاتصال بالخادم');
        return r.json();
      })
      .then(data => {
        // Defensive Programming: Ensure data is an array
        if (Array.isArray(data)) {
          setLatrines(data);
        } else {
          setLatrines([]);
          console.error("Expected array but got:", data);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError('تعذر تحميل قائمة الحمامات');
        setLatrines([]);
        setLoading(false);
      });
  }, [apiUrl, statusFilter]);

  // Defensive Filtering: Protect against null values
  const safeLatrines = Array.isArray(latrines) ? latrines : [];
  const filtered = safeLatrines.filter(l => {
    const idMatch = (l.latrine_id || '').toLowerCase().includes(filter.toLowerCase());
    const hhMatch = (l.beneficiary_hh || '').toLowerCase().includes(filter.toLowerCase());
    return idMatch || hhMatch;
  });

  if (loading) return <div style={{textAlign:'center',padding:'40px'}}>جاري تحميل سجل الحمامات...</div>;
  if (error) return <div style={{textAlign:'center',padding:'40px',color:'#C00000',fontWeight:'bold'}}>{error}</div>;

  return (
    <div>
      <div style={{display:'flex',gap:'12px',marginBottom:'20px',alignItems:'center',flexWrap:'wrap'}}>
        <h2 style={{color:'#1F4E78',margin:0}}>سجل الحمامات</h2>
        <input 
          placeholder="بحث برقم الحمام أو الأسرة..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{padding:'8px 12px',borderRadius:'4px',border:'1px solid #ccc',flex:1,minWidth:'200px'}}
        />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{padding:'8px',borderRadius:'4px'}}>
          <option value="">كل الحالات</option>
          <option value="completed">مكتمل</option>
          <option value="in_progress">جاري</option>
          <option value="not_started">لم يبدأ</option>
          <option value="on_hold">متوقف</option>
          <option value="rejected">مرفوض</option>
        </select>
      </div>

      <div style={{background:'white',borderRadius:'8px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead style={{background:'#1F4E78',color:'white'}}>
            <tr>
              <th style={{padding:'12px',textAlign:'right'}}>رقم الحمام</th>
              <th style={{padding:'12px',textAlign:'right'}}>الحالة</th>
              <th style={{padding:'12px',textAlign:'right'}}>نسبة الإنجاز</th>
              <th style={{padding:'12px',textAlign:'right'}}>المستفيد</th>
              <th style={{padding:'12px',textAlign:'right'}}>المهندس</th>
              <th style={{padding:'12px',textAlign:'right'}}>الملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="6" style={{padding:'20px',textAlign:'center',color:'#666'}}>لا توجد حمامات مطابقة للبحث</td>
              </tr>
            ) : (
              filtered.map(l => (
                <tr key={l.id} onClick={() => onSelect(l)} style={{cursor:'pointer',borderBottom:'1px solid #eee'}}>
                  <td style={{padding:'12px',fontWeight:'bold',color:'#1F4E78'}}>{l.latrine_id}</td>
                  <td style={{padding:'12px'}}>
                    <span style={{
                      background: statusColors[l.status] || '#eee',
                      padding:'4px 8px',
                      borderRadius:'4px',
                      fontSize:'12px',
                      fontWeight:'bold',
                      color: '#333'
                    }}>
                      {statusLabels[l.status] || l.status}
                    </span>
                  </td>
                  <td style={{padding:'12px'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <div style={{width:'60px',background:'#e0e0e0',borderRadius:'4px',height:'8px'}}>
                        <div style={{width:`${l.overall_pct}%`,background:'#4472C4',height:'100%',borderRadius:'4px'}} />
                      </div>
                      <span style={{fontSize:'12px',fontWeight:'bold'}}>{l.overall_pct}%</span>
                    </div>
                  </td>
                  <td style={{padding:'12px'}}>{l.beneficiary_hh || '-'}</td>
                  <td style={{padding:'12px'}}>{l.site_engineer || '-'}</td>
                  <td style={{padding:'12px'}}>
                    {l.remarks_count > 0 ? (
                      <span style={{background:'#C00000',color:'white',padding:'2px 8px',borderRadius:'10px',fontSize:'12px',fontWeight:'bold'}}>
                        {l.remarks_count}
                      </span>
                    ) : <span style={{color:'#ccc'}}>-</span>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LatrineList;