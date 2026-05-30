import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index.js';

const QualityInspector = ({ onBack, initialFilter = 'fail' }) => {
  const [filter, setFilter] = useState(initialFilter);
  const [searchQuery, setSearchQuery] = useState('');

  // جلب جميع البيانات من القاعدة المحلية
  const latrines = useLiveQuery(() => db.latrines.toArray(), []);
  const boqItems = useLiveQuery(() => db.boq_items.toArray(), []);
  const remarks = useLiveQuery(() => db.remarks.toArray(), []);

  // محرك دمج البيانات (Data Aggregation Engine)
  const enrichedItems = useMemo(() => {
    if (!latrines || !boqItems || !remarks) return [];

    return boqItems.map(item => {
      const latrine = latrines.find(l => l.id === item.latrine_id) || {};
      
      // البحث عن الملاحظات المرتبطة بهذا البند تحديداً
      const itemRemarks = remarks.filter(r => r.latrine_id === item.latrine_id && r.boq_code === item.boq_code);
      
      // استخراج أخطر ملاحظة مفتوحة لتكون هي "سبب الرفض"
      const openRemarks = itemRemarks.filter(r => r.status === 'open');
      let primaryReason = 'لا توجد ملاحظات مسجلة';
      let severityColor = '#95a5a6';

      if (openRemarks.length > 0) {
        const hasCritical = openRemarks.some(r => r.severity === 'critical');
        const hasMajor = openRemarks.some(r => r.severity === 'major');
        
        if (hasCritical) {
          primaryReason = openRemarks.find(r => r.severity === 'critical').description;
          severityColor = '#c0392b';
        } else if (hasMajor) {
          primaryReason = openRemarks.find(r => r.severity === 'major').description;
          severityColor = '#e67e22';
        } else {
          primaryReason = openRemarks[0].description;
          severityColor = '#f39c12';
        }
      }

      return {
        ...item,
        latrine_code: latrine.latrine_id,
        beneficiary: latrine.beneficiary_hh,
        block: latrine.block_no,
        engineer: latrine.site_engineer,
        primaryReason,
        severityColor,
        remarksCount: itemRemarks.length
      };
    });
  }, [latrines, boqItems, remarks]);

  // الفلترة والبحث
  const filteredItems = useMemo(() => {
    let data = enrichedItems;

    // فلترة حسب الجودة (مرفوض، مقبول، قيد الفحص)
    if (filter) {
      data = data.filter(item => item.quality_pass === filter);
    }

    // بحث نصي
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(item => 
        (item.latrine_code || '').toLowerCase().includes(q) ||
        (item.boq_code || '').toLowerCase().includes(q) ||
        (item.beneficiary || '').toLowerCase().includes(q) ||
        (item.primaryReason || '').toLowerCase().includes(q)
      );
    }

    return data;
  }, [enrichedItems, filter, searchQuery]);

  if (!latrines || !boqItems || !remarks) {
    return <div style={{ textAlign: 'center', padding: '60px', direction: 'rtl' }}>⏳ جاري تجميع بيانات الجودة...</div>;
  }

  return (
    <div style={{ direction: 'rtl', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ color: '#1F4E78', margin: 0 }}>🕵️ مفتش الجودة (Quality Inspector)</h2>
          <p style={{ color: '#7f8c8d', margin: '5px 0 0 0', fontSize: '14px' }}>
            تتبع البنود المرفوضة ومعرفة أسباب الرفض والملاحظات المرتبطة بها.
          </p>
        </div>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          &larr; العودة
        </button>
      </div>

      {/* Filters */}
      <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <input 
          type="text" 
          placeholder="🔍 بحث برقم الحمام، البند، أو سبب الرفض..." 
          value={searchQuery} 
          onChange={(e) => setSearchQuery(e.target.value)} 
          style={{ padding: '10px 15px', borderRadius: '6px', border: '1px solid #ccc', flex: 2, minWidth: '250px' }} 
        />
        <select 
          value={filter} 
          onChange={e => setFilter(e.target.value)} 
          style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc', flex: 1, minWidth: '150px', fontWeight: 'bold' }}
        >
          <option value="">📊 كل البنود</option>
          <option value="fail">❌ البنود المرفوضة (Fail)</option>
          <option value="pending">🔍 بانتظار الفحص (Pending)</option>
          <option value="pass">✅ البنود المقبولة (Pass)</option>
        </select>
      </div>

      {/* Data Grid */}
      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '15px', textAlign: 'right', width: '15%' }}>الحمام / المستفيد</th>
              <th style={{ padding: '15px', textAlign: 'center', width: '10%' }}>البند</th>
              <th style={{ padding: '15px', textAlign: 'center', width: '10%' }}>الكمية المنفذة</th>
              <th style={{ padding: '15px', textAlign: 'center', width: '10%' }}>حالة الجودة</th>
              <th style={{ padding: '15px', textAlign: 'right', width: '45%' }}>سبب الرفض / الملاحظة الرئيسية</th>
              <th style={{ padding: '15px', textAlign: 'center', width: '10%' }}>المهندس</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: '#7f8c8d' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>🎉</div>
                  لا توجد بنود مطابقة للبحث.
                </td>
              </tr>
            ) : (
              filteredItems.map(item => (
                <tr key={item.id} style={{ borderBottom: '1px solid #eee', transition: 'background 0.2s' }} onMouseOver={(e) => e.currentTarget.style.background = '#f8f9fa'} onMouseOut={(e) => e.currentTarget.style.background = 'white'}>
                  
                  {/* الحمام والمستفيد */}
                  <td style={{ padding: '15px' }}>
                    <div style={{ fontWeight: 'bold', color: '#1F4E78', fontSize: '14px' }}>{item.latrine_code}</div>
                    <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>{item.beneficiary || '—'}</div>
                    <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '2px' }}>{item.block}</div>
                  </td>

                  {/* البند */}
                  <td style={{ padding: '15px', textAlign: 'center' }}>
                    <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#2c3e50' }}>{item.boq_code}</div>
                  </td>

                  {/* الكمية المنفذة */}
                  <td style={{ padding: '15px', textAlign: 'center', fontWeight: 'bold', color: '#7f8c8d' }}>
                    {item.achieved_qty} / {item.planned_qty}
                  </td>

                  {/* حالة الجودة */}
                  <td style={{ padding: '15px', textAlign: 'center' }}>
                    <span style={{
                      background: item.quality_pass === 'fail' ? '#fdedec' : item.quality_pass === 'pass' ? '#e9f7ef' : '#fef9e7',
                      color: item.quality_pass === 'fail' ? '#c0392b' : item.quality_pass === 'pass' ? '#27ae60' : '#f39c12',
                      padding: '6px 12px',
                      borderRadius: '20px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      border: `1px solid ${item.quality_pass === 'fail' ? '#f5b7b1' : item.quality_pass === 'pass' ? '#a3e4d7' : '#fdebd0'}`
                    }}>
                      {item.quality_pass === 'fail' ? 'مرفوض' : item.quality_pass === 'pass' ? 'مقبول' : 'قيد الفحص'}
                    </span>
                  </td>

                  {/* سبب الرفض / الملاحظة */}
                  <td style={{ padding: '15px' }}>
                    <div style={{ 
                      fontSize: '13px', 
                      color: item.quality_pass === 'fail' ? item.severityColor : '#7f8c8d',
                      fontWeight: item.quality_pass === 'fail' ? 'bold' : 'normal',
                      lineHeight: '1.5'
                    }}>
                      {item.primaryReason}
                    </div>
                    {item.remarksCount > 1 && (
                      <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '5px' }}>
                        + {item.remarksCount - 1} ملاحظات أخرى مسجلة على هذا البند.
                      </div>
                    )}
                  </td>

                  {/* المهندس */}
                  <td style={{ padding: '15px', textAlign: 'center', fontSize: '12px', color: '#666' }}>
                    {item.engineer || '—'}
                  </td>

                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default QualityInspector;