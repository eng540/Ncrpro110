import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { syncWithServer } from '../syncEngine';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

// ✅ استعادة أنماط البطاقات من النسخة السابقة (ألوان Excel المألوفة)
const cardStyle = (color) => ({ 
  background: color, 
  color: 'white', 
  borderRadius: '8px', 
  padding: '20px', 
  flex: '1', 
  minWidth: '180px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
});

const labelStyle = { fontSize: '12px', opacity: 0.9, marginBottom: '8px', fontWeight: 'bold' };
const valueStyle = { fontSize: '28px', fontWeight: 'bold', margin: 0 };

// ✅ بطاقة معلومات ملونة (للبنود المقبولة/المرفوضة/الملاحظات)
const infoCardStyle = (bgColor, textColor, borderColor) => ({
  background: bgColor,
  color: textColor,
  border: `1px solid ${borderColor}`,
  borderRadius: '8px',
  padding: '20px',
  flex: '1',
  minWidth: '180px',
  boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
});

const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const pendingCount = useLiveQuery(() => db.sync_queue.count(), []) || 0;
  const isOnline = navigator.onLine;

  // ✅ جلب البيانات من الخادم (summary + categories بالتوازي)
  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, categoriesRes] = await Promise.all([
        fetch(`${API_BASE_URL}/dashboard/summary`),
        fetch(`${API_BASE_URL}/dashboard/categories`)
      ]);

      if (!summaryRes.ok) throw new Error('فشل جلب ملخص المشروع');
      if (!categoriesRes.ok) throw new Error('فشل جلب تقدم الفئات');

      const summaryData = await summaryRes.json();
      const categoriesData = await categoriesRes.json();

      setSummary(summaryData);
      setCategories(categoriesData);
    } catch (err) {
      console.error('Dashboard fetch error:', err);
      setError('تعذر الاتصال بالخادم. تأكد من جودة اتصالك بالإنترنت.');
    } finally {
      setLoading(false);
    }
  };

  // ✅ جلب البيانات فقط إذا كان متصلاً ولا توجد بيانات معلقة
  useEffect(() => {
    if (isOnline && pendingCount === 0) {
      fetchDashboardData();
    }
  }, [isOnline, pendingCount]);

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      await syncWithServer();
      // سيتم تشغيل useEffect تلقائياً لأن pendingCount سيصبح 0
    } catch (err) {
      console.error('Sync error:', err);
      alert("فشلت المزامنة: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  // --- حالات المنع (Blocking UI) ---
  
  if (!isOnline) {
    return (
      <div style={{ textAlign: 'center', padding: '50px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ color: '#e74c3c' }}>لا يوجد اتصال بالإنترنت</h2>
        <p>لوحة المؤشرات الحية تتطلب اتصالاً بالخادم المركزي لعرض الإحصائيات الدقيقة للمشروع.</p>
        <p>يرجى الاتصال بالشبكة والمحاولة مجدداً.</p>
      </div>
    );
  }

  if (pendingCount > 0) {
    return (
      <div style={{ textAlign: 'center', padding: '50px', background: '#fff3cd', border: '1px solid #ffe69c', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
        <h2 style={{ color: '#bb992f' }}>بيانات غير متزامنة</h2>
        <p>لديك <strong>{pendingCount}</strong> عمليات إدخال مسجلة محلياً لم يتم إرسالها للخادم.</p>
        <p>لضمان دقة الإحصائيات، يرجى إرسال بياناتك أولاً.</p>
        <button 
          onClick={handleForceSync} disabled={isSyncing}
          style={{ padding: '10px 20px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', marginTop: '15px' }}
        >
          {isSyncing ? 'جاري المزامنة...' : 'مزامنة البيانات الآن لعرض الإحصائيات'}
        </button>
      </div>
    );
  }

  if (loading) return <div style={{ textAlign: 'center', padding: '40px' }}>جاري جلب إحصائيات المشروع الحية من الخادم...</div>;
  if (error) return <div style={{ textAlign: 'center', padding: '40px', color: '#c0392b', fontWeight: 'bold' }}>{error}</div>;
  if (!summary) return null;

  // --- عرض البيانات (The Dashboard UI) ---
  return (
    <div style={{ direction: 'rtl' }}>
      <h2 style={{ color: '#1F4E78', marginBottom: '20px' }}>ملخص المشروع التنفيذي (Live Dashboard)</h2>
      
      {/* ✅ استعادة البطاقات العلوية من النسخة السابقة + لون الجديد */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
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

      {/* ✅ استعادة بطاقات البنود والملاحظات من النسخة السابقة */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <div style={infoCardStyle('#C6EFCE', '#1F4E78', '#70AD47')}>
          <div style={{...labelStyle, color: '#333'}}>بنود مقبولة (Pass)</div>
          <div style={{...valueStyle, color: '#1F4E78'}}>{summary.accepted_items}</div>
        </div>
        <div style={infoCardStyle('#FFC7CE', '#C00000', '#C00000')}>
          <div style={{...labelStyle, color: '#333'}}>بنود مرفوضة (Fail)</div>
          <div style={{...valueStyle, color: '#C00000'}}>{summary.rejected_items}</div>
        </div>
        <div style={infoCardStyle('#FFEB9C', '#333', '#FFC000')}>
          <div style={{...labelStyle, color: '#333'}}>ملاحظات مفتوحة</div>
          <div style={{...valueStyle, color: '#333'}}>{summary.open_remarks}</div>
        </div>
        <div style={infoCardStyle('#FFC7CE', '#C00000', '#C00000')}>
          <div style={{...labelStyle, color: '#333'}}>ملاحظات متأخرة</div>
          <div style={{...valueStyle, color: '#C00000'}}>{summary.overdue_remarks}</div>
        </div>
      </div>

      {/* ✅ استعادة شريط الإنجاز المالي من النسخة الجديدة */}
      <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>نسبة الإنجاز المالية للمشروع (Earned Value)</h3>
        <div style={{ width: '100%', background: '#ecf0f1', borderRadius: '10px', height: '30px', overflow: 'hidden', position: 'relative' }}>
          <div style={{ 
            width: `${summary.overall_progress_pct}%`, 
            background: summary.overall_progress_pct >= 80 ? '#27ae60' : summary.overall_progress_pct >= 40 ? '#f39c12' : '#e74c3c', 
            height: '100%', 
            transition: 'width 1s ease-in-out' 
          }}></div>
          <span style={{ 
            position: 'absolute', 
            top: '5px', 
            right: '15px', 
            color: summary.overall_progress_pct > 10 ? 'white' : '#2c3e50', 
            fontWeight: 'bold' 
          }}>
            {summary.overall_progress_pct}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', color: '#7f8c8d', fontSize: '14px' }}>
          <span>البنود المقبولة: {summary.accepted_items}</span>
          <span>البنود المرفوضة: {summary.rejected_items}</span>
        </div>
      </div>

      {/* ✅ استعادة تقدم الفئات من النسخة السابقة */}
      <div style={{ background: 'white', borderRadius: '8px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }}>
        <h3 style={{ color: '#1F4E78', marginTop: 0, marginBottom: '20px' }}>تقدم الأعمال حسب الفئة</h3>
        {categories.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#7f8c8d' }}>لا توجد بيانات فئات متاحة</p>
        ) : (
          categories.map(cat => (
            <div key={cat.category} style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', alignItems: 'center' }}>
                <span style={{ fontWeight: 'bold', color: '#2c3e50' }}>{cat.category}</span>
                <span style={{ 
                  fontWeight: 'bold', 
                  color: cat.avg_achievement_pct >= 80 ? '#27ae60' : cat.avg_achievement_pct >= 40 ? '#f39c12' : '#e74c3c' 
                }}>
                  {cat.avg_achievement_pct}%
                </span>
              </div>
              <div style={{ background: '#e0e0e0', borderRadius: '4px', height: '24px', overflow: 'hidden' }}>
                <div style={{
                  width: `${Math.min(cat.avg_achievement_pct, 100)}%`,
                  background: cat.avg_achievement_pct >= 80 ? '#70AD47' : cat.avg_achievement_pct >= 40 ? '#FFC000' : '#C00000',
                  height: '100%',
                  borderRadius: '4px',
                  transition: 'width 0.5s ease-in-out',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'flex-end',
                  paddingRight: '8px'
                }}>
                  {cat.avg_achievement_pct > 15 && (
                    <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>
                      {cat.avg_achievement_pct}%
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Dashboard;
