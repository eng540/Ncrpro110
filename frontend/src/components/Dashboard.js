import React, { useState, useEffect } from 'react';

const cardStyle = (color) => ({ background: color, color: 'white', borderRadius: '8px', padding: '20px', flex: '1', minWidth: '200px' });
const labelStyle = { fontSize: '12px', opacity: 0.9, marginBottom: '8px' };
const valueStyle = { fontSize: '28px', fontWeight: 'bold', margin: 0 };

function Dashboard({ apiUrl }) {
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${apiUrl}/dashboard/summary`).then(r => r.json()),
      fetch(`${apiUrl}/dashboard/categories`).then(r => r.json())
    ])
    .then(([sum, cats]) => {
      setSummary(sum);
      setCategories(cats);
      setLoading(false);
    })
    .catch(() => setLoading(false));
  }, [apiUrl]);

  if (loading) return <div style={{textAlign:'center',padding:'40px'}}>جاري التحميل...</div>;
  if (!summary) return <div style={{textAlign:'center',padding:'40px',color:'#C00000'}}>تعذر الاتصال بالخادم</div>;

  return (
    <div>
      <h2 style={{color:'#1F4E78',marginBottom:'20px'}}>ملخص المشروع التنفيذي</h2>

      <div style={{display:'flex',gap:'16px',flexWrap:'wrap',marginBottom:'24px'}}>
        <div style={cardStyle('#1F4E78')}>
          <div style={labelStyle}>إجمالي الحمامات</div>
          <div style={valueStyle}>{summary.total_latrines}</div>
        </div>
        <div style={cardStyle('#70AD47')}>
          <div style={labelStyle}>مكتملة</div>
          <div style={valueStyle}>{summary.completed}</div>
        </div>
        <div style={cardStyle('#FFC000')}>
          <div style={labelStyle}>جاري العمل</div>
          <div style={valueStyle}>{summary.in_progress}</div>
        </div>
        <div style={cardStyle('#C55A11')}>
          <div style={labelStyle}>لم تبدأ</div>
          <div style={valueStyle}>{summary.not_started}</div>
        </div>
        <div style={cardStyle('#4472C4')}>
          <div style={labelStyle}>نسبة الإنجاز الكلية</div>
          <div style={valueStyle}>{summary.overall_progress_pct}%</div>
        </div>
      </div>

      <div style={{display:'flex',gap:'16px',flexWrap:'wrap',marginBottom:'24px'}}>
        <div style={{...cardStyle('#C6EFCE'), color:'#1F4E78', border:'1px solid #70AD47'}}>
          <div style={{...labelStyle,color:'#333'}}>بنود مقبولة (Pass)</div>
          <div style={{...valueStyle,color:'#1F4E78'}}>{summary.accepted_items}</div>
        </div>
        <div style={{...cardStyle('#FFC7CE'), color:'#C00000', border:'1px solid #C00000'}}>
          <div style={{...labelStyle,color:'#333'}}>بنود مرفوضة (Fail)</div>
          <div style={{...valueStyle,color:'#C00000'}}>{summary.rejected_items}</div>
        </div>
        <div style={{...cardStyle('#FFEB9C'), color:'#333', border:'1px solid #FFC000'}}>
          <div style={{...labelStyle,color:'#333'}}>ملاحظات مفتوحة</div>
          <div style={{...valueStyle,color:'#333'}}>{summary.open_remarks}</div>
        </div>
      </div>

      <div style={{background:'white',borderRadius:'8px',padding:'20px',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
        <h3 style={{color:'#1F4E78',marginTop:0}}>تقدم الأعمال حسب الفئة</h3>
        {categories.map(cat => (
          <div key={cat.category} style={{marginBottom:'12px'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'4px'}}>
              <span style={{fontWeight:'bold'}}>{cat.category}</span>
              <span>{cat.avg_achievement_pct}%</span>
            </div>
            <div style={{background:'#e0e0e0',borderRadius:'4px',height:'20px',overflow:'hidden'}}>
              <div style={{
                width: `${cat.avg_achievement_pct}%`,
                background: cat.avg_achievement_pct >= 80 ? '#70AD47' : cat.avg_achievement_pct >= 40 ? '#FFC000' : '#C00000',
                height: '100%',
                borderRadius: '4px',
                transition: 'width 0.5s'
              }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Dashboard;
