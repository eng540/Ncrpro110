import React, { useState, useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index.js';
import { secureStorage } from '../storage/secureStorage.js';

// ==========================================
// Constants & Configuration
// ==========================================
const statusColors = {
  completed: { bg: '#d4edda', text: '#155724', label: 'مكتمل' },
  in_progress: { bg: '#fff3cd', text: '#856404', label: 'جاري العمل' },
  not_started: { bg: '#e2e3e5', text: '#383d41', label: 'لم يبدأ' },
  on_hold: { bg: '#cce5ff', text: '#004085', label: 'متوقف' },
  rejected: { bg: '#f8d7da', text: '#721c24', label: 'مرفوض' }
};

// قاموس مصغر لترجمة الأكواد إلى أسماء مفهومة في "آخر نشاط"
const BOQ_SHORT_NAMES = {
  'A1': 'حفر وأساس', 'A2': 'جدران بلك', 'A3': 'لياسة', 'A4': 'سقف خرساني', 'A5': 'كرسي عربي', 'A6': 'بلاط',
  'B1': 'حفر بيارة', 'B2': 'تمديد صرف', 'B3': 'غطاء بيارة',
  'C1': 'باب حديد', 'C2': 'نافذة', 'C3': 'إضاءة', 'C4': 'لوحة'
};

// ==========================================
// Main Component
// ==========================================
function LatrineList({ onSelectLatrine, initialFilter = '' }) {
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(initialFilter);

  useEffect(() => {
    setStatusFilter(initialFilter);
  }, [initialFilter]);

  // 1. جلب وفك تشفير الحمامات
  const latrines = useLiveQuery(async () => {
    const rawLatrines = await db.latrines.toArray();
    const decrypted = await Promise.all(rawLatrines.map(l => secureStorage.getLatrine(l.id)));
    return decrypted.filter(Boolean);
  }, []);

  // 2. جلب جميع البنود (لحساب "آخر نشاط")
  const allBoqItems = useLiveQuery(() => db.boq_items.toArray(), []);

  // 3. محرك دمج البيانات (Data Aggregation Engine)
  const enrichedLatrines = useMemo(() => {
    if (!latrines || !allBoqItems) return [];

    return latrines.map(latrine => {
      // جلب بنود هذا الحمام فقط
      const myItems = allBoqItems.filter(item => item.latrine_id === latrine.id);
      
      // البحث عن "آخر بند مكتمل"
      const completedItems = myItems.filter(i => i.status === 'completed' || i.status === 'accepted');
      let lastActivity = 'لا يوجد إنجاز بعد';
      
      if (completedItems.length > 0) {
        // ترتيب البنود المكتملة حسب تاريخ التحديث (الأحدث أولاً)
        completedItems.sort((a, b) => new Date(b.last_update || 0) - new Date(a.last_update || 0));
        const lastItem = completedItems[0];
        const itemName = BOQ_SHORT_NAMES[lastItem.boq_code] || lastItem.boq_code;
        lastActivity = `آخر إنجاز: ${itemName}`;
      }

      return {
        ...latrine,
        lastActivity,
        itemsCount: myItems.length,
        completedCount: completedItems.length
      };
    });
  }, [latrines, allBoqItems]);

  if (latrines === undefined || allBoqItems === undefined) {
    return <div style={{textAlign:'center',padding:'60px', direction: 'rtl'}}>⏳ جاري فك تشفير وبناء رادار المشروع... 🔐</div>;
  }

  // 4. الفلترة
  const filtered = enrichedLatrines.filter(l => {
    const idMatch = (l.latrine_id || '').toLowerCase().includes(filter.toLowerCase());
    const hhMatch = (l.beneficiary_hh || '').toLowerCase().includes(filter.toLowerCase());
    const statusMatch = statusFilter ? l.status === statusFilter : true;
    return (idMatch || hhMatch) && statusMatch;
  });

  return (
    <div style={{ direction: 'rtl' }}>
      {/* Header & Filters */}
      <div style={{ background: 'white', padding: '20px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', gap: '15px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 100%' }}>
          <h2 style={{ color: '#1F4E78', margin: '0 0 5px 0' }}>📡 رادار المشروع (Latrine 360°)</h2>
          <p style={{ margin: 0, color: '#7f8c8d', fontSize: '13px' }}>عرض حي لحالة جميع الحمامات وآخر الأنشطة الميدانية.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', flex: '1 1 auto', flexWrap: 'wrap' }}>
          <input 
            placeholder="🔍 بحث برقم الحمام أو اسم المستفيد..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            style={{ padding: '10px 15px', borderRadius: '6px', border: '1px solid #ccc', flex: 2, minWidth: '200px' }}
          />
          <select 
            value={statusFilter} 
            onChange={e => setStatusFilter(e.target.value)} 
            style={{ padding: '10px', borderRadius: '6px', border: '1px solid #ccc', flex: 1, minWidth: '150px', fontWeight: 'bold', color: '#2c3e50' }}
          >
            <option value="">📊 كل الحالات ({enrichedLatrines.length})</option>
            <option value="completed">✅ مكتمل</option>
            <option value="in_progress">🔄 جاري العمل</option>
            <option value="not_started">⬜ لم يبدأ</option>
            <option value="on_hold">⏸️ متوقف</option>
          </select>
        </div>
      </div>

      {/* Data Grid */}
      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '15px', textAlign: 'right', width: '25%' }}>الحمام / المستفيد 🔒</th>
              <th style={{ padding: '15px', textAlign: 'center', width: '15%' }}>الحالة</th>
              <th style={{ padding: '15px', textAlign: 'right', width: '25%' }}>مؤشر الإنجاز</th>
              <th style={{ padding: '15px', textAlign: 'right', width: '25%' }}>النبض الميداني (آخر نشاط)</th>
              <th style={{ padding: '15px', textAlign: 'center', width: '10%' }}>ملاحظات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan="5" style={{ padding: '40px', textAlign: 'center', color: '#7f8c8d' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>📭</div>
                  {latrines.length === 0 ? 'لا توجد بيانات محلية. يرجى المزامنة مع الخادم.' : 'لا توجد حمامات مطابقة للبحث.'}
                </td>
              </tr>
            ) : (
              filtered.map(l => {
                const statusConf = statusColors[l.status] || statusColors.not_started;
                const hasRemarks = l.remarks_count > 0;

                return (
                  <tr 
                    key={l.id} 
                    onClick={() => onSelectLatrine(l.id)} 
                    style={{ cursor: 'pointer', borderBottom: '1px solid #eee', transition: 'background 0.2s' }}
                    onMouseOver={(e) => e.currentTarget.style.background = '#f8f9fa'}
                    onMouseOut={(e) => e.currentTarget.style.background = 'white'}
                  >
                    {/* 1. الحمام والمستفيد */}
                    <td style={{ padding: '15px' }}>
                      <div style={{ fontWeight: 'bold', color: '#1F4E78', fontSize: '15px' }}>{l.latrine_id}</div>
                      <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>👤 {l.beneficiary_hh || '—'}</div>
                      <div style={{ fontSize: '11px', color: '#95a5a6', marginTop: '2px' }}>📍 {l.block_no} | 👷 {l.site_engineer || '—'}</div>
                    </td>

                    {/* 2. الحالة */}
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      <span style={{
                        background: statusConf.bg,
                        color: statusConf.text,
                        padding: '6px 12px',
                        borderRadius: '20px',
                        fontSize: '12px',
                        fontWeight: 'bold',
                        display: 'inline-block',
                        border: `1px solid ${statusConf.text}40`
                      }}>
                        {statusConf.label}
                      </span>
                    </td>

                    {/* 3. مؤشر الإنجاز (Progress Bar) */}
                    <td style={{ padding: '15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '100%', background: '#e9ecef', borderRadius: '6px', height: '10px', overflow: 'hidden' }}>
                          <div style={{ 
                            width: `${l.overall_pct}%`, 
                            background: l.overall_pct >= 100 ? '#27ae60' : l.overall_pct > 0 ? '#3498db' : 'transparent', 
                            height: '100%', 
                            borderRadius: '6px',
                            transition: 'width 0.5s ease'
                          }} />
                        </div>
                        <span style={{ fontSize: '13px', fontWeight: 'bold', color: '#2c3e50', minWidth: '40px' }}>
                          {l.overall_pct}%
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: '#7f8c8d', marginTop: '5px' }}>
                        تم إنجاز {l.completedCount} من أصل {l.itemsCount} بند
                      </div>
                    </td>

                    {/* 4. النبض الميداني (آخر نشاط) */}
                    <td style={{ padding: '15px' }}>
                      <div style={{ 
                        fontSize: '12px', 
                        color: l.overall_pct === 0 ? '#95a5a6' : '#2c3e50',
                        background: l.overall_pct === 0 ? 'transparent' : '#f8f9fa',
                        padding: '6px 10px',
                        borderRadius: '4px',
                        borderLeft: l.overall_pct > 0 ? '3px solid #3498db' : 'none'
                      }}>
                        {l.overall_pct === 0 ? '⏳ بانتظار بدء الأعمال' : l.lastActivity}
                      </div>
                    </td>

                    {/* 5. الملاحظات (Risk Badge) */}
                    <td style={{ padding: '15px', textAlign: 'center' }}>
                      {hasRemarks ? (
                        <div style={{ 
                          background: '#fdedec', 
                          color: '#c0392b', 
                          padding: '6px 10px', 
                          borderRadius: '6px', 
                          fontSize: '12px', 
                          fontWeight: 'bold',
                          border: '1px solid #f5b7b1',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}>
                          ⚠️ {l.remarks_count}
                        </div>
                      ) : (
                        <span style={{ color: '#bdc3c7', fontSize: '12px' }}>—</span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default LatrineList;