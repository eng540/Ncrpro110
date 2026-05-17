import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';

const LatrineList = ({ onSelectLatrine }) => {
  // جلب البيانات من قاعدة البيانات المحلية (IndexedDB)
  const latrines = useLiveQuery(() => db.latrines.toArray(), []);

  if (!latrines) return <div style={{ padding: '20px' }}>جاري تحميل البيانات المحلية...</div>;
  if (latrines.length === 0) return <div style={{ padding: '20px' }}>لا توجد بيانات. يرجى الاتصال بالإنترنت لتحميل البيانات لأول مرة.</div>;

  return (
    <div style={{ padding: '20px', direction: 'rtl' }}>
      <h2>قائمة الحمامات (ECHO 2525)</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', backgroundColor: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }}>
        <thead>
          <tr style={{ backgroundColor: '#ecf0f1', textAlign: 'right' }}>
            <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>رقم الحمام</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>المربع</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>نسبة الإنجاز</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>الحالة</th>
            <th style={{ padding: '12px', borderBottom: '2px solid #ddd' }}>إجراء</th>
          </tr>
        </thead>
        <tbody>
          {latrines.map(latrine => (
            <tr key={latrine.id} style={{ borderBottom: '1px solid #ddd' }}>
              <td style={{ padding: '12px' }}>{latrine.latrine_id}</td>
              <td style={{ padding: '12px' }}>{latrine.block_no}</td>
              <td style={{ padding: '12px' }}>
                <div style={{ width: '100%', backgroundColor: '#eee', borderRadius: '4px' }}>
                  <div style={{ width: `${latrine.overall_pct}%`, backgroundColor: '#3498db', height: '10px', borderRadius: '4px' }}></div>
                </div>
                <small>{latrine.overall_pct}%</small>
              </td>
              <td style={{ padding: '12px' }}>{latrine.status === 'completed' ? 'مكتمل' : latrine.status === 'in_progress' ? 'قيد العمل' : 'لم يبدأ'}</td>
              <td style={{ padding: '12px' }}>
                <button onClick={() => onSelectLatrine(latrine.id)} style={{ padding: '6px 12px', cursor: 'pointer' }}>تحديث الكميات</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default LatrineList;