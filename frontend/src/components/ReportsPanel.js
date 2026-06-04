// AUTH-PATCH 2026-06-02: استخدام apiFetch لتنزيل التقارير

import React, { useState } from 'react';
import { apiFetch } from '../api';

const API_BASE_URL = process.env.REACT_APP_API_URL || '/api';

const ReportsPanel = () => {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const handleDownload = async (endpoint, filename, format = 'pdf') => {
    if (!navigator.onLine) {
      setError('لا يمكن تحميل التقارير في وضع عدم الاتصال (Offline). يرجى الاتصال بالإنترنت.');
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      let url = `${endpoint}?format=${format}`;
      
      if (endpoint === '/reports/remarks' || endpoint === '/reports/daily-logs') {
        const params = new URLSearchParams();
        params.append('format', format);
        if (fromDate) params.append('from_date', new Date(fromDate).toISOString());
        if (toDate) params.append('to_date', new Date(toDate).toISOString());
        url = `${endpoint}?${params.toString()}`;
      }

      const response = await apiFetch(url, { method: 'GET' });

      if (!response.ok) {
        throw new Error('فشل توليد التقرير من الخادم.');
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = downloadUrl;
      const ext = format === 'excel' ? 'xlsx' : 'pdf';
      link.download = filename.replace(/\.(pdf|xlsx)$/, `.${ext}`);
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

  const ReportCard = ({ title, description, color, endpoint, filenameBase, supportsDates = false }) => (
    <div style={{ background: 'white', padding: '25px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', borderTop: `4px solid ${color}`, display: 'flex', flexDirection: 'column' }}>
      <h3 style={{ color: color, marginTop: 0 }}>{title}</h3>
      <p style={{ fontSize: '13px', color: '#666', flex: 1 }}>{description}</p>
      <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
        <button 
          onClick={() => handleDownload(endpoint, filenameBase, 'pdf')}
          disabled={isDownloading}
          style={{ flex: 1, padding: '10px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: isDownloading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '13px' }}
        >
          {isDownloading ? '⏳' : '📄 PDF'}
        </button>
        <button 
          onClick={() => handleDownload(endpoint, filenameBase, 'excel')}
          disabled={isDownloading}
          style={{ flex: 1, padding: '10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: isDownloading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '13px' }}
        >
          {isDownloading ? '⏳' : '📊 Excel'}
        </button>
      </div>
    </div>
  );

  return (
    <div style={{ direction: 'rtl', maxWidth: '1000px', margin: '0 auto' }}>
      <div style={{ marginBottom: '30px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>📈 مركز التقارير والمخرجات</h2>
        <p style={{ color: '#7f8c8d', marginTop: '5px' }}>
          توليد وتحميل التقارير المالية والهندسية المعتمدة. اختر الصيغة المفضلة (PDF أو Excel).
        </p>
      </div>

      {error && (
        <div style={{ background: '#f8d7da', color: '#721c24', padding: '12px 16px', borderRadius: '6px', marginBottom: '20px', fontWeight: 'bold' }}>
          ⚠️ {error}
        </div>
      )}

      <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ color: '#2c3e50' }}>تحديد الفترة الزمنية (للتقارير المدعومة):</strong>
        <div style={{ display: 'flex', gap: '10px', flex: 1 }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '11px', color: '#7f8c8d', marginBottom: '4px' }}>من تاريخ:</label>
            <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', fontSize: '11px', color: '#7f8c8d', marginBottom: '4px' }}>إلى تاريخ:</label>
            <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
        
        <ReportCard
          title="المستخلص المالي (IPC)"
          description="شهادة دفع مؤقتة شاملة توضح الكميات المنفذة، المبالغ المستحقة والمحتجزة بناءً على قرارات الحوكمة والجودة."
          color="#27ae60"
          endpoint="/reports/ipc"
          filenameBase={`IPC_Report_${new Date().toISOString().split('T')[0]}`}
        />

        <ReportCard
          title="الملخص التنفيذي"
          description="تقرير رسمي يحتوي على إحصائيات المشروع الكلية، نسب الإنجاز، وملخص قرارات الإدارة والجودة."
          color="#1F4E78"
          endpoint="/reports/summary"
          filenameBase={`Executive_Summary_${new Date().toISOString().split('T')[0]}`}
        />

        <ReportCard
          title="سجل ملاحظات الجودة"
          description="جميع الملاحظات المفتوحة والمغلقة مع إمكانية تحديد فترة زمنية. (يتأثر بالفترة المحددة أعلاه)."
          color="#e74c3c"
          endpoint="/reports/remarks"
          filenameBase={`Remarks_Log_${new Date().toISOString().split('T')[0]}`}
          supportsDates={true}
        />

        <ReportCard
          title="يوميات الموقع (Site Diary)"
          description="سجلات العمل اليومية، العمالة، المعدات، وإحصائيات الفحص. (يتأثر بالفترة المحددة أعلاه)."
          color="#8e44ad"
          endpoint="/reports/daily-logs"
          filenameBase={`Site_Diary_${new Date().toISOString().split('T')[0]}`}
          supportsDates={true}
        />

        <ReportCard
          title="مصفوفة الإنجاز (Matrix)"
          description="تقرير أفقي يعرض كل مستفيد في صف، وكل بند كعمودين (كمية منفذة / تكلفة)."
          color="#f39c12"
          endpoint="/reports/matrix"
          filenameBase={`Matrix_Report_${new Date().toISOString().split('T')[0]}`}
        />

      </div>
    </div>
  );
};

export default ReportsPanel;