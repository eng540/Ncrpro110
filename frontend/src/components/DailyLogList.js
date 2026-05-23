import React, { useState, useEffect } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const DailyLogList = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    if (!navigator.onLine) {
      setError('⚠️ يتطلب الاتصال بالإنترنت لعرض التقارير السابقة');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/daily-logs?limit=30`);
      if (!res.ok) throw new Error('فشل جلب البيانات');
      const data = await res.json();
      setLogs(data);
    } catch (err) {
      setError('❌ ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: '40px', fontSize: '18px' }}>⏳ جاري التحميل...</div>;
  if (error) return <div style={{ textAlign: 'center', padding: '40px', color: '#e74c3c', fontWeight: 'bold' }}>{error}</div>;

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>📋 سجل التقارير اليومية</h2>
        <button 
          onClick={fetchLogs}
          style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}
        >
          🔄 تحديث
        </button>
      </div>
      
      {logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', color: '#7f8c8d' }}>
          <div style={{ fontSize: '48px', marginBottom: '15px' }}>📭</div>
          <h3 style={{ margin: '0 0 10px 0' }}>لا توجد تقارير مسجلة</h3>
          <p>سيتم عرض التقارير اليومية هنا بعد حفظها</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '15px' }}>
          {logs.map(log => (
            <div key={log.id} style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderRight: '4px solid #3498db' }}>
              {/* الرأس */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '10px' }}>
                <h3 style={{ margin: 0, color: '#1F4E78', fontSize: '20px' }}>
                  📅 {new Date(log.date).toLocaleDateString('ar-SA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </h3>
                <span style={{ background: '#e8f4f8', padding: '6px 15px', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold', color: '#2980b9' }}>
                  👷 {log.engineer || 'غير محدد'}
                </span>
              </div>
              
              {/* الإحصائيات */}
              <div style={{ 
                display: 'grid', 
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', 
                gap: '10px', 
                marginBottom: '15px',
                background: '#f8f9fa',
                padding: '15px',
                borderRadius: '6px'
              }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#1F4E78' }}>{log.latrines_inspected}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>🧱 حمامات مُفحوصة</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#27ae60' }}>{log.latrines_accepted}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>✅ حمامات مُقبولة</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#e74c3c' }}>{log.remarks_issued}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>📝 ملاحظات</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#f39c12' }}>{log.manpower || 0}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>👷 عمال</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '22px', fontWeight: 'bold', color: '#9b59b6' }}>{log.weather || '—'}</div>
                  <div style={{ fontSize: '12px', color: '#666' }}>🌤️ طقس</div>
                </div>
              </div>
              
              {/* التفاصيل */}
              {log.equipment && (
                <div style={{ fontSize: '14px', color: '#2c3e50', marginBottom: '8px', padding: '8px', background: '#fff3cd', borderRadius: '4px' }}>
                  <strong>🚜 المعدات:</strong> {log.equipment}
                </div>
              )}
              
              {log.notes && (
                <div style={{ fontSize: '14px', color: '#2c3e50', background: '#e8f4f8', padding: '12px', borderRadius: '4px', borderRight: '3px solid #3498db' }}>
                  <strong>📝 ملاحظات:</strong><br/>
                  {log.notes}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default DailyLogList;