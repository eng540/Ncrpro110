// AUTH-PATCH 2026-06-02: استخدام apiFetch

import React, { useState, useEffect } from 'react';
import { getPendingSyncCount, syncWithServer } from '../syncEngine';
import { apiFetch } from '../api';

const Card = ({ bgColor, title, value, onClick, textColor = 'white', borderColor = 'transparent' }) => (
  <div onClick={onClick} style={{ background: bgColor, color: textColor, border: `1px solid ${borderColor}`, borderRadius: '8px', padding: '20px', flex: '1', minWidth: '180px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)', cursor: onClick ? 'pointer' : 'default', transition: 'transform 0.2s, box-shadow 0.2s', position: 'relative', overflow: 'hidden' }}
    onMouseOver={(e) => { if (onClick) { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)'; } }}
    onMouseOut={(e) => { if (onClick) { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)'; } }}>
    <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '8px', fontWeight: 'bold' }}>{title}</div>
    <div style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>{value}</div>
    {onClick && <div style={{ position: 'absolute', bottom: '10px', left: '15px', fontSize: '12px', opacity: 0.7 }}>عرض التفاصيل ⇱</div>}
  </div>
);

const Dashboard = ({ navigateTo }) => {
  const [summary, setSummary] = useState(null);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const isOnline = navigator.onLine;

  useEffect(() => {
    const checkPending = async () => {
      const count = await getPendingSyncCount();
      setPendingCount(count);
    };
    checkPending();
    const interval = setInterval(checkPending, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [summaryRes, categoriesRes] = await Promise.all([
        apiFetch('/dashboard/summary'),
        apiFetch('/dashboard/categories')
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

  useEffect(() => {
    if (isOnline && pendingCount === 0) {
      fetchDashboardData();
    }
  }, [isOnline, pendingCount]);

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncWithServer();
      const newCount = await getPendingSyncCount();
      setPendingCount(newCount);
      if (result.failed > 0) alert(`تمت مزامنة ${result.processed} عملية، لكن ${result.failed} فشلت.`);
    } catch (err) {
      alert("فشلت المزامنة: " + err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  if (!isOnline) return <div style={{ textAlign: 'center', padding: '50px', background: 'white', borderRadius: '8px' }}><h2 style={{ color: '#e74c3c' }}>لا يوجد اتصال بالإنترنت</h2><p>لوحة المؤشرات الحية تتطلب اتصالاً بالخادم المركزي.</p></div>;
  if (pendingCount > 0) return <div style={{ textAlign: 'center', padding: '50px', background: '#fff3cd', borderRadius: '8px' }}><h2 style={{ color: '#bb992f' }}>بيانات غير متزامنة</h2><p>لديك <strong>{pendingCount}</strong> عملية إدخال محلية لم تُرسل.</p><button onClick={handleForceSync} disabled={isSyncing} style={{ padding: '10px 20px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>{isSyncing ? 'جاري المزامنة...' : 'مزامنة الآن'}</button></div>;
  if (loading) return <div style={{ textAlign: 'center', padding: '40px' }}>جاري جلب إحصائيات المشروع...</div>;
  if (error) return <div style={{ textAlign: 'center', padding: '40px', color: '#c0392b', fontWeight: 'bold' }}>{error}</div>;
  if (!summary) return null;

  return (
    <div style={{ direction: 'rtl' }}>
      <h2 style={{ color: '#1F4E78', marginBottom: '20px' }}>ملخص المشروع التنفيذي (Live Dashboard)</h2>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <Card bgColor="#1F4E78" title="إجمالي الحمامات" value={summary.total_latrines} onClick={() => navigateTo('LIST', { filterStatus: '' })} />
        <Card bgColor="#70AD47" title="مكتملة" value={summary.completed} onClick={() => navigateTo('LIST', { filterStatus: 'completed' })} />
        <Card bgColor="#FFC000" title="جاري العمل" value={summary.in_progress} onClick={() => navigateTo('LIST', { filterStatus: 'in_progress' })} />
        <Card bgColor="#C55A11" title="لم تبدأ" value={summary.not_started} onClick={() => navigateTo('LIST', { filterStatus: 'not_started' })} />
        <Card bgColor="#4472C4" title="نسبة الإنجاز الكلية" value={`${summary.overall_progress_pct}%`} />
      </div>
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '24px' }}>
        <Card bgColor="#C6EFCE" textColor="#1F4E78" borderColor="#70AD47" title="بنود مقبولة (Pass)" value={summary.accepted_items} onClick={() => navigateTo('QUALITY_INSPECTOR', { filterStatus: 'pass' })} />
        <Card bgColor="#FFC7CE" textColor="#C00000" borderColor="#C00000" title="بنود مرفوضة (Fail)" value={summary.rejected_items} onClick={() => navigateTo('QUALITY_INSPECTOR', { filterStatus: 'fail' })} />
        <Card bgColor="#FFEB9C" textColor="#333" borderColor="#FFC000" title="ملاحظات مفتوحة" value={summary.open_remarks} onClick={() => navigateTo('REMARKS_MANAGER', { filterStatus: 'open' })} />
        <Card bgColor="#FFC7CE" textColor="#C00000" borderColor="#C00000" title="ملاحظات متأخرة" value={summary.overdue_remarks} onClick={() => navigateTo('REMARKS_MANAGER', { filterStatus: 'overdue' })} />
      </div>
      <div style={{ background: 'white', padding: '25px', borderRadius: '8px', marginBottom: '24px' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>نسبة الإنجاز المالية للمشروع (Earned Value)</h3>
        <div style={{ width: '100%', background: '#ecf0f1', borderRadius: '10px', height: '30px', overflow: 'hidden', position: 'relative' }}>
          <div style={{ width: `${summary.overall_progress_pct}%`, background: summary.overall_progress_pct >= 80 ? '#27ae60' : summary.overall_progress_pct >= 40 ? '#f39c12' : '#e74c3c', height: '100%', transition: 'width 1s ease-in-out' }} />
          <span style={{ position: 'absolute', top: '5px', right: '15px', color: summary.overall_progress_pct > 10 ? 'white' : '#2c3e50', fontWeight: 'bold' }}>{summary.overall_progress_pct}%</span>
        </div>
      </div>
      <div style={{ background: 'white', borderRadius: '8px', padding: '20px' }}>
        <h3 style={{ color: '#1F4E78', marginTop: 0, marginBottom: '20px' }}>تقدم الأعمال حسب الفئة</h3>
        {categories.map(cat => (
          <div key={cat.category} style={{ marginBottom: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}><span style={{ fontWeight: 'bold', color: '#2c3e50' }}>{cat.category}</span><span style={{ fontWeight: 'bold', color: cat.avg_achievement_pct >= 80 ? '#27ae60' : cat.avg_achievement_pct >= 40 ? '#f39c12' : '#e74c3c' }}>{cat.avg_achievement_pct}%</span></div>
            <div style={{ background: '#e0e0e0', borderRadius: '4px', height: '24px', overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(cat.avg_achievement_pct, 100)}%`, background: cat.avg_achievement_pct >= 80 ? '#70AD47' : cat.avg_achievement_pct >= 40 ? '#FFC000' : '#C00000', height: '100%', borderRadius: '4px', transition: 'width 0.5s ease-in-out', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: '8px' }}>
                {cat.avg_achievement_pct > 15 && <span style={{ color: 'white', fontSize: '12px', fontWeight: 'bold' }}>{cat.avg_achievement_pct}%</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Dashboard;