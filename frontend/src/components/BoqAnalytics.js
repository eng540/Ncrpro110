import React, { useState, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index.js';

// ==========================================
// Constants & Configuration
// ==========================================
const BOQ_LABELS = {
  'A1': { name: 'حفر وتسوية + أساس حجر', unit: 'م³' },
  'A2': { name: 'جدران بلك مفرغ 15سم', unit: 'م²' },
  'A3': { name: 'لياسة داخلية وخارجية', unit: 'م²' },
  'A4': { name: 'سقف خرسانة مسلحة', unit: 'ل.م' },
  'A5': { name: 'كرسي عربي + كوع ريحة', unit: 'عدد' },
  'A6': { name: 'بلاط موزايكو', unit: 'م²' },
  'B1': { name: 'حفر بيارة قطر 1م', unit: 'م³' },
  'B2': { name: 'تمديد UPVC 4 انش + تهوية', unit: 'ل.م' },
  'B3': { name: 'غطاء بيارة خرساني', unit: 'عدد' },
  'C1': { name: 'باب حديد صاج', unit: 'عدد' },
  'C2': { name: 'نافذة ألمنيوم', unit: 'عدد' },
  'C3': { name: 'إضاءة شمسية 10واط', unit: 'عدد' },
  'C4': { name: 'لوحة معدنية + شعار', unit: 'عدد' }
};

const GROUPS = {
  'A': { label: 'أعمال البناء والخرسانة', codes: ['A1','A2','A3','A4','A5','A6'], color: '#1F4E78' },
  'B': { label: 'أعمال الصرف الصحي', codes: ['B1','B2','B3'], color: '#27ae60' },
  'C': { label: 'أعمال التشطيبات', codes: ['C1','C2','C3','C4'], color: '#e74c3c' }
};

// ==========================================
// Main Component
// ==========================================
const BoqAnalytics = ({ onBack }) => {
  const [selectedBoq, setSelectedBoq] = useState(null); // للنافذة المنبثقة (Modal)

  // 1. جلب البيانات من القاعدة المحلية
  const latrines = useLiveQuery(() => db.latrines.toArray(), []);
  const boqItems = useLiveQuery(() => db.boq_items.toArray(), []);

  // 2. محرك عصر البيانات (Data Aggregation Engine)
  const analytics = useMemo(() => {
    if (!latrines || !boqItems) return null;

    const stats = {};
    
    // تهيئة الهيكل لكل بند
    Object.keys(BOQ_LABELS).forEach(code => {
      stats[code] = {
        code,
        name: BOQ_LABELS[code].name,
        unit: BOQ_LABELS[code].unit,
        totalPlanned: 0,
        totalAchieved: 0,
        latrinesCompleted: [],
        latrinesInProgress: [],
        latrinesPending: []
      };
    });

    // تجميع البيانات
    boqItems.forEach(item => {
      const code = item.boq_code;
      if (!stats[code]) return;

      stats[code].totalPlanned += (item.planned_qty || 0);
      stats[code].totalAchieved += (item.achieved_qty || 0);

      // جلب رقم الحمام للربط
      const latrine = latrines.find(l => l.id === item.latrine_id);
      const latrineName = latrine ? latrine.latrine_id : `ID:${item.latrine_id}`;

      // تصنيف حالة الحمام لهذا البند
      if (item.status === 'completed' || item.status === 'accepted') {
        stats[code].latrinesCompleted.push(latrineName);
      } else if (item.status === 'in_progress') {
        stats[code].latrinesInProgress.push(latrineName);
      } else {
        stats[code].latrinesPending.push(latrineName);
      }
    });

    return stats;
  }, [latrines, boqItems]);

  if (!analytics) {
    return <div style={{ textAlign: 'center', padding: '60px', direction: 'rtl' }}>⏳ جاري تحليل البيانات الهندسية...</div>;
  }

  const totalLatrinesCount = latrines?.length || 0;

  return (
    <div style={{ direction: 'rtl', paddingBottom: '40px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ color: '#1F4E78', margin: 0 }}>📊 تحليل البنود (BoQ Analytics)</h2>
          <p style={{ color: '#7f8c8d', margin: '5px 0 0 0', fontSize: '14px' }}>
            نظرة شاملة على تقدم كل بند في جميع الحمامات ({totalLatrinesCount} حمام)
          </p>
        </div>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          &larr; العودة
        </button>
      </div>

      {/* Grouped Analytics */}
      {Object.entries(GROUPS).map(([groupKey, group]) => (
        <div key={groupKey} style={{ marginBottom: '30px', background: 'white', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
          <div style={{ background: group.color, color: 'white', padding: '12px 20px', fontWeight: 'bold', fontSize: '16px' }}>
            {group.label}
          </div>
          
          <div style={{ padding: '20px' }}>
            {group.codes.map(code => {
              const data = analytics[code];
              if (!data) return null;

              const progressPct = data.totalPlanned > 0 ? Math.min(100, Math.round((data.totalAchieved / data.totalPlanned) * 100)) : 0;
              const completedCount = data.latrinesCompleted.length;
              const pendingCount = data.latrinesPending.length + data.latrinesInProgress.length;

              return (
                <div key={code} style={{ marginBottom: '20px', paddingBottom: '20px', borderBottom: '1px solid #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '15px' }}>
                    
                    {/* معلومات البند */}
                    <div style={{ flex: '1 1 300px' }}>
                      <div style={{ fontWeight: 'bold', color: '#2c3e50', fontSize: '16px' }}>
                        <span style={{ color: group.color, marginRight: '5px' }}>{code}</span> | {data.name}
                      </div>
                      <div style={{ display: 'flex', gap: '20px', marginTop: '10px', fontSize: '13px', color: '#666' }}>
                        <div><strong>المخطط الكلي:</strong> {data.totalPlanned.toFixed(2)} {data.unit}</div>
                        <div><strong>المنفذ الكلي:</strong> <span style={{ color: '#27ae60', fontWeight: 'bold' }}>{data.totalAchieved.toFixed(2)} {data.unit}</span></div>
                        <div><strong>المتبقي:</strong> <span style={{ color: '#e74c3c' }}>{(data.totalPlanned - data.totalAchieved).toFixed(2)} {data.unit}</span></div>
                      </div>
                    </div>

                    {/* شريط التقدم (Progress Bar) */}
                    <div style={{ flex: '1 1 200px', minWidth: '200px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', marginBottom: '5px', fontWeight: 'bold' }}>
                        <span>نسبة الإنجاز للبند</span>
                        <span style={{ color: progressPct >= 100 ? '#27ae60' : '#f39c12' }}>{progressPct}%</span>
                      </div>
                      <div style={{ width: '100%', background: '#ecf0f1', borderRadius: '10px', height: '12px', overflow: 'hidden' }}>
                        <div style={{ width: `${progressPct}%`, background: progressPct >= 100 ? '#27ae60' : group.color, height: '100%', transition: 'width 1s ease-in-out' }}></div>
                      </div>
                    </div>

                    {/* إحصائيات الحمامات (Latrine Spread) */}
                    <div style={{ flex: '0 1 250px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', background: '#e8f8f5', padding: '6px 10px', borderRadius: '4px', border: '1px solid #a3e4d7' }}>
                        <span>✅ مكتمل في:</span>
                        <strong style={{ color: '#27ae60' }}>{completedCount} حمام</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', background: '#fdedec', padding: '6px 10px', borderRadius: '4px', border: '1px solid #f5b7b1' }}>
                        <span>⏳ متبقي / جاري في:</span>
                        <strong style={{ color: '#c0392b' }}>{pendingCount} حمام</strong>
                      </div>
                      <button 
                        onClick={() => setSelectedBoq(data)}
                        style={{ padding: '6px', background: 'white', border: `1px solid ${group.color}`, color: group.color, borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold', transition: 'all 0.2s' }}
                        onMouseOver={(e) => { e.target.style.background = group.color; e.target.style.color = 'white'; }}
                        onMouseOut={(e) => { e.target.style.background = 'white'; e.target.style.color = group.color; }}
                      >
                        🔍 عرض تفاصيل الحمامات
                      </button>
                    </div>

                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* ========================================== */}
      {/* 🔍 Drill-down Modal (نافذة تفاصيل الحمامات) */}
      {/* ========================================== */}
      {selectedBoq && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: '8px', width: '100%', maxWidth: '600px', maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            
            {/* Modal Header */}
            <div style={{ padding: '20px', borderBottom: '1px solid #eee', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8f9fa', borderRadius: '8px 8px 0 0' }}>
              <div>
                <h3 style={{ margin: '0 0 5px 0', color: '#1F4E78' }}>تفاصيل البند: {selectedBoq.code}</h3>
                <p style={{ margin: 0, fontSize: '13px', color: '#666' }}>{selectedBoq.name}</p>
              </div>
              <button onClick={() => setSelectedBoq(null)} style={{ background: '#e74c3c', color: 'white', border: 'none', width: '30px', height: '30px', borderRadius: '50%', cursor: 'pointer', fontWeight: 'bold' }}>X</button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
              
              {/* قائمة الحمامات المتأخرة (الأهم للمشرف) */}
              <div style={{ marginBottom: '25px' }}>
                <h4 style={{ color: '#c0392b', borderBottom: '2px solid #fdedec', paddingBottom: '5px', marginTop: 0 }}>
                  ⏳ حمامات لم يكتمل فيها البند ({selectedBoq.latrinesPending.length + selectedBoq.latrinesInProgress.length})
                </h4>
                {selectedBoq.latrinesPending.length === 0 && selectedBoq.latrinesInProgress.length === 0 ? (
                  <p style={{ color: '#27ae60', fontSize: '13px', fontWeight: 'bold' }}>🎉 رائع! تم إنجاز هذا البند في جميع الحمامات.</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedBoq.latrinesInProgress.map(id => (
                      <span key={id} style={{ background: '#fef9e7', color: '#d35400', padding: '4px 10px', borderRadius: '15px', fontSize: '12px', border: '1px solid #fdebd0' }} title="قيد العمل">
                        🔄 {id}
                      </span>
                    ))}
                    {selectedBoq.latrinesPending.map(id => (
                      <span key={id} style={{ background: '#fdf2e9', color: '#c0392b', padding: '4px 10px', borderRadius: '15px', fontSize: '12px', border: '1px solid #fadbd8' }} title="لم يبدأ">
                        ⬜ {id}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* قائمة الحمامات المكتملة */}
              <div>
                <h4 style={{ color: '#27ae60', borderBottom: '2px solid #e9f7ef', paddingBottom: '5px' }}>
                  ✅ حمامات اكتمل فيها البند ({selectedBoq.latrinesCompleted.length})
                </h4>
                {selectedBoq.latrinesCompleted.length === 0 ? (
                  <p style={{ color: '#7f8c8d', fontSize: '13px' }}>لم يكتمل هذا البند في أي حمام بعد.</p>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {selectedBoq.latrinesCompleted.map(id => (
                      <span key={id} style={{ background: '#e9f7ef', color: '#1e8449', padding: '4px 10px', borderRadius: '15px', fontSize: '12px', border: '1px solid #d4efdf' }}>
                        {id}
                      </span>
                    ))}
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default BoqAnalytics;