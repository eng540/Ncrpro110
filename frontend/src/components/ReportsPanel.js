import React, { useState } from 'react';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const ReportsPanel = () => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState(null);
  
  // فلاتر تقرير الملاحظات
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleDownload = async (endpoint, filename, isPdf = true) => {
    if (!navigator.onLine) {
      setError('لا يمكن تحميل التقارير في وضع عدم الاتصال (Offline). يرجى الاتصال بالإنترنت.');
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      let url = `${API_BASE_URL}${endpoint}`;
      
      // إضافة الفلاتر إذا كان التقرير هو تقرير الملاحظات
      if (endpoint === '/reports/remarks') {
        const params = new URLSearchParams();
        if (fromDate) params.append('from_date', new Date(fromDate).toISOString());
        if (toDate) params.append('to_date', new Date(toDate).toISOString());
        if (params.toString()) url += `?${params.toString()}`;
      }

      const response = await fetch(url, { method: 'GET' });

      if (!response.ok) {
        throw new Error('فشل توليد التقرير من الخادم.');
      }

      // تحويل الاستجابة إلى ملف (Blob)
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(downloadUrl);

    } catch (err) {
      console.error('Download error:', err);
      setError(err.message);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div style={{ direction: 'rtl', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>📈 مركز التقارير والمخرجات</h2>
        <p style={{ color: '#7f8c8d', marginTop: '5px' }}>
          توليد وتحميل التقارير المالية والهندسية المعتمدة (يجب الاتصال بالإنترنت).
        </p>
      </div>

      {error && (
        <div style={{ background: '#f8d7da', color: '#721c24', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontWeight: 'bold' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        
        {/* 1. تقرير المستخلص المالي (IPC) */}
        <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderTop: '4px solid #27ae60' }}>
          <h3 style={{ color: '#27ae60', marginTop: 0 }}>المستخلص المالي (IPC)</h3>
          <p style={{ fontSize: '13px', color: '#666', minHeight: '40px' }}>
            تقرير Excel شامل يوضح الكميات المنفذة، المبالغ المستحقة للدفع، والمبالغ المحتجزة بناءً على قرارات الحوكمة والجودة.
          </p>
          <button 
            onClick={() => handleDownload('/reports/ipc', `IPC_Report_${new Date().toISOString().split('T')[0]}.xlsx`, false)}
            disabled={isDownloading}
            style={{ width: '100%', padding: '12px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: isDownloading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px' }}
          >
            {isDownloading ? '⏳ جاري التوليد...' : '📥 تحميل المستخلص (Excel)'}
          </button>
        </div>

        {/* 2. الملخص التنفيذي (Executive Summary) */}
        <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderTop: '4px solid #1F4E78' }}>
          <h3 style={{ color: '#1F4E78', marginTop: 0 }}>الملخص التنفيذي</h3>
          <p style={{ fontSize: '13px', color: '#666', minHeight: '40px' }}>
            تقرير PDF رسمي يحتوي على إحصائيات المشروع الكلية، نسب الإنجاز، وملخص قرارات الإدارة والجودة.
          </p>
          <button 
            onClick={() => handleDownload('/reports/summary', `Executive_Summary_${new Date().toISOString().split('T')[0]}.pdf`, true)}
            disabled={isDownloading}
            style={{ width: '100%', padding: '12px', background: '#1F4E78', color: 'white', border: 'none', borderRadius: '4px', cursor: isDownloading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px' }}
          >
            {isDownloading ? '⏳ جاري التوليد...' : '📄 تحميل الملخص (PDF)'}
          </button>
        </div>

        {/* 3. سجل الملاحظات (Remarks Log) */}
        <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderTop: '4px solid #e74c3c' }}>
          <h3 style={{ color: '#e74c3c', marginTop: 0 }}>سجل ملاحظات الجودة</h3>
          <p style={{ fontSize: '13px', color: '#666', minHeight: '40px' }}>
            تقرير PDF مفصل بجميع الملاحظات المفتوحة والمغلقة. يمكن تحديد فترة زمنية معينة للتقرير.
          </p>
          
          <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#7f8c8d', marginBottom: '4px' }}>من تاريخ:</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '11px', color: '#7f8c8d', marginBottom: '4px' }}>إلى تاريخ:</label>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
            </div>
          </div>

          <button 
            onClick={() => handleDownload('/reports/remarks', `Remarks_Log_${new Date().toISOString().split('T')[0]}.pdf`, true)}
            disabled={isDownloading}
            style={{ width: '100%', padding: '12px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: isDownloading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '14px' }}
          >
            {isDownloading ? '⏳ جاري التوليد...' : '📑 تحميل سجل الملاحظات (PDF)'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default ReportsPanel;