import React, { useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const ReportsPanel = () => {
  const [generating, setGenerating] = useState(null);
  const [error, setError] = useState(null);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  const downloadReport = async (type, filename) => {
    if (!navigator.onLine) {
      setError('⚠️ يتطلب الاتصال بالإنترنت لتوليد التقارير');
      return;
    }

    setGenerating(type);
    setError(null);
    
    try {
      let url = `${API_BASE_URL}/reports/${type}`;
      if (type === 'remarks' && (dateRange.from || dateRange.to)) {
        const params = new URLSearchParams();
        if (dateRange.from) params.append('from_date', dateRange.from);
        if (dateRange.to) params.append('to_date', dateRange.to);
        url += '?' + params.toString();
      }
      
      const res = await fetch(url);
      if (!res.ok) throw new Error('فشل توليد التقرير');
      
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err) {
      setError('❌ ' + err.message);
    } finally {
      setGenerating(null);
    }
  };

  const reports = [
    { 
      type: 'summary', 
      label: '📊 ملخص تنفيذي', 
      filename: 'summary_ech2525.pdf', 
      desc: 'حالة المشروع الكاملة + نسب الإنجاز + الملاحظات الحرجة',
      icon: '📈',
      color: '#1F4E78'
    },
    { 
      type: 'ipc', 
      label: '💰 شهادة دفع مؤقتة (IPC)', 
      filename: 'ipc_ech2525.xlsx', 
      desc: 'البنود المنفذة × أسعار الوحدة = المبلغ المستحق للمقاول',
      icon: '💵',
      color: '#27ae60'
    },
    { 
      type: 'remarks', 
      label: '📝 سجل ملاحظات الجودة', 
      filename: 'remarks_ech2525.pdf', 
      desc: 'الملاحظات المفتوحة والمغلقة حسب الفترة المحددة',
      icon: '📋',
      color: '#e74c3c',
      needsDate: true
    }
  ];

  return (
    <div style={{ direction: 'rtl', maxWidth: '900px', margin: '0 auto' }}>
      <h2 style={{ color: '#1F4E78', marginBottom: '10px' }}>📈 التقارير والمخرجات</h2>
      <p style={{ color: '#7f8c8d', marginBottom: '25px' }}>توليد تقارير احترافية للمتابعة والتدقيق والمانحين</p>
      
      {error && (
        <div style={{ padding: '15px', background: '#f8d7da', color: '#721c24', borderRadius: '4px', marginBottom: '20px', fontWeight: 'bold' }}>
          {error}
        </div>
      )}

      {/* فلترة التاريخ لملاحظات الجودة */}
      <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>📅 فلترة الفترة (لتقرير الملاحظات)</h4>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#666' }}>من:</label>
            <input 
              type="date" 
              value={dateRange.from} 
              onChange={e => setDateRange({...dateRange, from: e.target.value})}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontSize: '14px', color: '#666' }}>إلى:</label>
            <input 
              type="date" 
              value={dateRange.to} 
              onChange={e => setDateRange({...dateRange, to: e.target.value})}
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '20px' }}>
        {reports.map(report => (
          <div key={report.type} style={{ 
            background: 'white', 
            padding: '25px', 
            borderRadius: '8px', 
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            borderRight: `5px solid ${report.color}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '20px'
          }}>
            <div style={{ flex: 1, minWidth: '250px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '32px' }}>{report.icon}</span>
                <h3 style={{ margin: 0, color: '#2c3e50', fontSize: '20px' }}>{report.label}</h3>
              </div>
              <p style={{ margin: 0, color: '#7f8c8d', fontSize: '14px', lineHeight: '1.6' }}>{report.desc}</p>
              {report.needsDate && dateRange.from && (
                <p style={{ margin: '8px 0 0 0', color: '#3498db', fontSize: '13px' }}>
                  📅 الفترة: {dateRange.from} {dateRange.to ? ' إلى ' + dateRange.to : ''}
                </p>
              )}
            </div>
            <button
              onClick={() => downloadReport(report.type, report.filename)}
              disabled={generating === report.type || !navigator.onLine}
              style={{
                padding: '12px 30px',
                background: generating === report.type ? '#95a5a6' : report.color,
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: generating === report.type || !navigator.onLine ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '16px',
                minWidth: '150px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              {generating === report.type ? (
                <>
                  <span>⏳</span>
                  <span>جاري التوليد...</span>
                </>
              ) : (
                <>
                  <span>⬇️</span>
                  <span>تحميل</span>
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      {!navigator.onLine && (
        <div style={{ 
          textAlign: 'center', 
          padding: '30px', 
          background: '#fff3cd', 
          borderRadius: '8px', 
          marginTop: '25px',
          color: '#856404'
        }}>
          <div style={{ fontSize: '36px', marginBottom: '10px' }}>📡</div>
          <h3 style={{ margin: '0 0 10px 0' }}>التقارير تتطلب الاتصال بالإنترنت</h3>
          <p style={{ margin: 0 }}>يرجى الاتصال بالشبكة لتوليد وتحميل التقارير</p>
        </div>
      )}
    </div>
  );
};

export default ReportsPanel;