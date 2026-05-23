import React, { useState, useEffect } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const DailyLogForm = ({ onSaved }) => {
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    engineer: '',
    weather: 'مشمس',
    manpower: '',
    equipment: '',
    notes: ''
  });
  const [stats, setStats] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');

  // جلب الإحصائيات التلقائية عند فتح النموذج
  useEffect(() => {
    fetchStats();
  }, [formData.date]);

  const fetchStats = async () => {
    if (!navigator.onLine) return;
    
    try {
      const res = await fetch(`${API_BASE_URL}/daily-logs/stats?date=${formData.date}`);
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!navigator.onLine) {
      setMessage('⚠️ يتطلب الاتصال بالإنترنت لحفظ التقرير اليومي');
      return;
    }

    setIsLoading(true);
    try {
      const payload = {
        ...formData,
        date: new Date(formData.date).toISOString(),
        latrines_inspected: stats?.latrines_inspected || 0,
        latrines_accepted: stats?.latrines_accepted || 0,
        remarks_issued: stats?.remarks_issued || 0
      };

      const res = await fetch(`${API_BASE_URL}/daily-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setMessage('✅ تم حفظ التقرير اليومي بنجاح');
        setFormData({ ...formData, notes: '', equipment: '', manpower: '' });
        onSaved?.();
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      setMessage('❌ فشل الحفظ: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{ direction: 'rtl', maxWidth: '800px', margin: '0 auto' }}>
      <h2 style={{ color: '#1F4E78' }}>التقرير اليومي</h2>
      
      {message && (
        <div style={{ 
          padding: '12px', 
          background: message.includes('✅') ? '#d4edda' : '#f8d7da', 
          color: message.includes('✅') ? '#155724' : '#721c24',
          borderRadius: '4px', 
          marginBottom: '15px',
          fontWeight: 'bold'
        }}>
          {message}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        
        {/* الإحصائيات التلقائية */}
        {stats && (
          <div style={{ background: '#e8f4f8', padding: '15px', borderRadius: '6px', marginBottom: '20px', border: '1px solid #bee5eb' }}>
            <h4 style={{ margin: '0 0 10px 0', color: '#2980b9' }}>📊 بيانات تلقائية من النظام</h4>
            <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
              <div style={{ background: 'white', padding: '10px', borderRadius: '4px', minWidth: '120px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#1F4E78' }}>{stats.latrines_inspected}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>حمامات مُفحوصة</div>
              </div>
              <div style={{ background: 'white', padding: '10px', borderRadius: '4px', minWidth: '120px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#27ae60' }}>{stats.latrines_accepted}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>حمامات مُقبولة</div>
              </div>
              <div style={{ background: 'white', padding: '10px', borderRadius: '4px', minWidth: '120px', textAlign: 'center' }}>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#e74c3c' }}>{stats.remarks_issued}</div>
                <div style={{ fontSize: '12px', color: '#666' }}>ملاحظات مُصدرة</div>
              </div>
            </div>
          </div>
        )}

        {/* الإدخالات اليدوية */}
        <div style={{ display: 'grid', gap: '15px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#2c3e50' }}>📅 التاريخ:</label>
            <input 
              type="date" 
              value={formData.date} 
              onChange={e => setFormData({...formData, date: e.target.value})}
              style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', width: '200px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#2c3e50' }}>👷 المهندس المسؤول:</label>
            <input 
              type="text" 
              value={formData.engineer} 
              onChange={e => setFormData({...formData, engineer: e.target.value})}
              placeholder="اسم المهندس المسؤول عن اليوم"
              style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#2c3e50' }}>🌤️ الطقس:</label>
            <select 
              value={formData.weather} 
              onChange={e => setFormData({...formData, weather: e.target.value})}
              style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '14px', minWidth: '150px' }}
            >
              <option value="مشمس">☀️ مشمس</option>
              <option value="غائم">☁️ غائم</option>
              <option value="ممطر">🌧️ ممطر</option>
              <option value="عاصف">💨 عاصف</option>
              <option value="غبار">🌫️ غبار</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#2c3e50' }}>👷 عدد العمال:</label>
            <input 
              type="number" 
              value={formData.manpower} 
              onChange={e => setFormData({...formData, manpower: e.target.value})}
              placeholder="0"
              min="0"
              style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', width: '150px', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#2c3e50' }}>🚜 المعدات المستخدمة:</label>
            <input 
              type="text" 
              value={formData.equipment} 
              onChange={e => setFormData({...formData, equipment: e.target.value})}
              placeholder="مثال: حفارة صغيرة، خلاطة، مولد كهربائي"
              style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', fontSize: '14px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', color: '#2c3e50' }}>📝 ملاحظات عامة عن اليوم:</label>
            <textarea 
              value={formData.notes} 
              onChange={e => setFormData({...formData, notes: e.target.value})}
              rows="4"
              placeholder="أي ملاحظات عن سير العمل، مشاكل، إنجازات، توصيات..."
              style={{ padding: '10px', borderRadius: '4px', border: '1px solid #ccc', width: '100%', fontSize: '14px', resize: 'vertical' }}
            />
          </div>
        </div>

        <button 
          type="submit" 
          disabled={isLoading || !navigator.onLine}
          style={{ 
            marginTop: '20px', 
            padding: '12px 40px', 
            background: navigator.onLine ? '#27ae60' : '#95a5a6', 
            color: 'white', 
            border: 'none', 
            borderRadius: '4px', 
            cursor: navigator.onLine ? 'pointer' : 'not-allowed',
            fontWeight: 'bold',
            fontSize: '16px',
            width: '100%'
          }}
        >
          {isLoading ? '⏳ جاري الحفظ...' : '💾 حفظ التقرير اليومي'}
        </button>

        {!navigator.onLine && (
          <p style={{ textAlign: 'center', color: '#e74c3c', marginTop: '15px', fontWeight: 'bold' }}>
            ⚠️ التقرير اليومي يتطلب الاتصال بالإنترنت — لا يمكن حفظه Offline
          </p>
        )}
      </form>
    </div>
  );
};

export default DailyLogForm;