import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { syncWithServer } from '../syncEngine';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);

  const pendingCount = useLiveQuery(() => db.sync_queue.count(), []) || 0;
  const isOnline = navigator.onLine;

  const fetchDashboardData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/dashboard/summary`);
      if (!response.ok) throw new Error('فشل جلب البيانات من الخادم');
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError('تعذر الاتصال بالخادم. تأكد من جودة اتصالك بالإنترنت.');
    } finally {
      setLoading(false);
    }
  };

  // جلب البيانات فقط إذا كان متصلاً ولا توجد بيانات معلقة
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
  if (!stats) return null;

  // --- عرض البيانات (The Dashboard UI) ---
  return (
    <div style={{ direction: 'rtl' }}>
      <h2 style={{ color: '#1F4E78', marginBottom: '20px' }}>لوحة المؤشرات المباشرة (Live Dashboard)</h2>
      
      {/* البطاقات العلوية */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '15px', marginBottom: '20px' }}>
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderBottom: '4px solid #3498db' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#7f8c8d' }}>إجمالي الحمامات</h4>
          <h2 style={{ margin: 0, fontSize: '2rem', color: '#2c3e50' }}>{stats.total_latrines}</h2>
        </div>
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderBottom: '4px solid #2ecc71' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#7f8c8d' }}>الحمامات المكتملة</h4>
          <h2 style={{ margin: 0, fontSize: '2rem', color: '#27ae60' }}>{stats.completed}</h2>
        </div>
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderBottom: '4px solid #f1c40f' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#7f8c8d' }}>قيد الإنجاز</h4>
          <h2 style={{ margin: 0, fontSize: '2rem', color: '#f39c12' }}>{stats.in_progress}</h2>
        </div>
        <div style={{ background: 'white', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', borderBottom: '4px solid #e74c3c' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#7f8c8d' }}>ملاحظات مفتوحة</h4>
          <h2 style={{ margin: 0, fontSize: '2rem', color: '#c0392b' }}>{stats.open_remarks}</h2>
        </div>
      </div>

      {/* شريط الإنجاز الكلي للمشروع */}
      <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
        <h3 style={{ margin: '0 0 15px 0', color: '#2c3e50' }}>نسبة الإنجاز المالية للمشروع (Earned Value)</h3>
        <div style={{ width: '100%', background: '#ecf0f1', borderRadius: '10px', height: '30px', overflow: 'hidden', position: 'relative' }}>
          <div style={{ width: `${stats.overall_progress_pct}%`, background: '#27ae60', height: '100%', transition: 'width 1s ease-in-out' }}></div>
          <span style={{ position: 'absolute', top: '5px', right: '15px', color: stats.overall_progress_pct > 10 ? 'white' : '#2c3e50', fontWeight: 'bold' }}>
            {stats.overall_progress_pct}%
          </span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '15px', color: '#7f8c8d', fontSize: '14px' }}>
          <span>البنود المقبولة: {stats.accepted_items}</span>
          <span>البنود المرفوضة: {stats.rejected_items}</span>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;