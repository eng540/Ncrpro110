// AUTH-PATCH 2026-06-02: استخدام apiFetch

import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';

const SYSTEM_CODES = {
  'APPROVE': { label: 'موافق للدفع', color: '#27ae60', bg: '#e8f8f5' },
  'APPROVE_WITH_NOTE': { label: 'موافق مع تنبيه', color: '#f39c12', bg: '#fef9e7' },
  'HOLD': { label: 'إيقاف مؤقت (للفحص)', color: '#2980b9', bg: '#ebf5fb' },
  'REWORK': { label: 'إعادة عمل (مرفوض)', color: '#c0392b', bg: '#fdedec' },
  'STOP': { label: 'إيقاف فوري (خطر)', color: '#8e44ad', bg: '#f4ecf8' }
};

const HUMAN_CODES = {
  'APPROVE': 'اعتماد الدفع',
  'HOLD': 'إبقاء الإيقاف',
  'REJECT': 'رفض نهائي',
  'OVERRIDE': 'تجاوز استثنائي'
};

const GovernanceDashboard = ({ onBack }) => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('HOLD');
  const [selectedItem, setSelectedItem] = useState(null);
  const [overrideData, setOverrideData] = useState({
    human_decision_code: 'OVERRIDE',
    human_payment_pct: 0,
    override_reason: '',
    approved_by: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchItems = async () => {
    setLoading(true);
    setError(null);
    try {
      const url = filter ? `/admin/governance-items?status_filter=${filter}` : '/admin/governance-items';
      const res = await apiFetch(url);
      if (!res.ok) throw new Error('فشل جلب بيانات الحوكمة');
      const data = await res.json();
      setItems(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
  }, [filter]);

  const handleOverrideSubmit = async (e) => {
    e.preventDefault();
    if (!overrideData.override_reason.trim() || !overrideData.approved_by.trim()) {
      alert('يجب إدخال سبب التجاويز واسم المعتمد.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiFetch(`/admin/governance-items/${selectedItem.decision_id}/override`, {
        method: 'POST',
        body: JSON.stringify(overrideData)
      });

      if (!res.ok) throw new Error('فشل تطبيق القرار');
      
      setItems(prev => prev.map(item => 
        item.decision_id === selectedItem.decision_id 
          ? { ...item, final_state: 'LOCKED', human_decision_code: overrideData.human_decision_code, human_payment_pct: overrideData.human_payment_pct }
          : item
      ));
      
      setSelectedItem(null);
      alert('تم اعتماد القرار بنجاح وإعادة حساب المستخلص المالي.');
    } catch (err) {
      alert(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openModal = (item) => {
    setSelectedItem(item);
    setOverrideData({
      human_decision_code: 'OVERRIDE',
      human_payment_pct: item.system_payment_pct,
      override_reason: '',
      approved_by: ''
    });
  };

  return (
    <div style={{ direction: 'rtl' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ color: '#1F4E78', margin: 0 }}>⚖️ لوحة حوكمة القرارات (Governance Center)</h2>
          <p style={{ color: '#7f8c8d', margin: '5px 0 0 0', fontSize: '14px' }}>
            مراجعة البنود الموقوفة واعتماد الاستثناءات المالية
          </p>
        </div>
        <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
          &larr; العودة
        </button>
      </div>

      <div style={{ background: 'white', padding: '15px', borderRadius: '8px', marginBottom: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', display: 'flex', gap: '15px', alignItems: 'center' }}>
        <strong style={{ color: '#2c3e50' }}>تصفية حسب قرار النظام:</strong>
        <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '200px' }}>
          <option value="">الكل (بدون تصفية)</option>
          <option value="HOLD">إيقاف مؤقت (للفحص)</option>
          <option value="REWORK">إعادة عمل (مرفوض)</option>
          <option value="STOP">إيقاف فوري (خطر)</option>
          <option value="APPROVE_WITH_NOTE">موافق مع تنبيه</option>
        </select>
        <button onClick={fetchItems} style={{ padding: '8px 16px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          🔄 تحديث
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: '#7f8c8d' }}>جاري جلب بيانات الحوكمة...</div>
      ) : error ? (
        <div style={{ background: '#fdedec', color: '#c0392b', padding: '15px', borderRadius: '8px', textAlign: 'center' }}>{error}</div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px', background: 'white', borderRadius: '8px', color: '#95a5a6' }}>
          <div style={{ fontSize: '48px', marginBottom: '10px' }}>✅</div>
          <h3>لا توجد بنود تحتاج مراجعة إدارية حالياً.</h3>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
            <thead style={{ background: '#1F4E78', color: 'white' }}>
              <tr>
                <th style={{ padding: '12px', textAlign: 'right' }}>الحمام / المستفيد</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>البند</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>الواقع الميداني</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>قرار النظام الآلي</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>النسبة المالية</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>الحالة</th>
                <th style={{ padding: '12px', textAlign: 'center' }}>الإجراء</th>
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const sysCode = SYSTEM_CODES[item.system_recommendation_code] || { label: item.system_recommendation_code, color: '#333', bg: '#eee' };
                const isLocked = item.final_state === 'LOCKED';

                return (
                  <tr key={item.decision_id} style={{ borderBottom: '1px solid #eee', background: isLocked ? '#f8f9fa' : 'white' }}>
                    <td style={{ padding: '12px' }}>
                      <div style={{ fontWeight: 'bold', color: '#2c3e50' }}>{item.latrine_id}</div>
                      <div style={{ fontSize: '12px', color: '#7f8c8d' }}>{item.beneficiary_hh || '—'}</div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>{item.boq_code}</td>
                    <td style={{ padding: '12px', textAlign: 'center', fontSize: '12px' }}>
                      <div>إنجاز: {item.execution_pct}%</div>
                      <div>جودة: {item.quality_status}</div>
                      {item.highest_remark_severity && <div style={{ color: '#c0392b' }}>ملاحظة: {item.highest_remark_severity}</div>}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <div style={{ background: sysCode.bg, color: sysCode.color, padding: '4px 8px', borderRadius: '4px', fontWeight: 'bold', fontSize: '12px', display: 'inline-block' }}>
                        {sysCode.label}
                      </div>
                      <div style={{ fontSize: '11px', color: '#7f8c8d', marginTop: '4px', maxWidth: '150px', margin: '4px auto 0' }}>
                        {item.system_recommendation_note}
                      </div>
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', color: isLocked ? '#27ae60' : '#e67e22' }}>
                      {isLocked ? item.human_payment_pct : item.system_payment_pct}%
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      {isLocked ? (
                        <span style={{ background: '#27ae60', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>تم الاعتماد</span>
                      ) : (
                        <span style={{ background: '#f39c12', color: 'white', padding: '2px 6px', borderRadius: '4px', fontSize: '11px' }}>بانتظار القرار</span>
                      )}
                    </td>
                    <td style={{ padding: '12px', textAlign: 'center' }}>
                      <button 
                        onClick={() => openModal(item)}
                        style={{ padding: '6px 12px', background: isLocked ? '#bdc3c7' : '#8e44ad', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                      >
                        {isLocked ? 'عرض القرار' : 'تجاوز (Override)'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedItem && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '25px', borderRadius: '8px', width: '90%', maxWidth: '500px', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#8e44ad', borderBottom: '2px solid #f4ecf8', paddingBottom: '10px' }}>
              {selectedItem.final_state === 'LOCKED' ? 'تفاصيل القرار المعتمد' : 'اعتماد قرار استثنائي (Override)'}
            </h3>
            
            <div style={{ background: '#f8f9fa', padding: '10px', borderRadius: '4px', marginBottom: '15px', fontSize: '13px' }}>
              <strong>الحمام:</strong> {selectedItem.latrine_id} | <strong>البند:</strong> {selectedItem.boq_code} <br/>
              <strong>توصية النظام:</strong> {SYSTEM_CODES[selectedItem.system_recommendation_code]?.label || selectedItem.system_recommendation_code} ({selectedItem.system_payment_pct}%)
            </div>

            <form onSubmit={handleOverrideSubmit}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>القرار الإداري:</label>
                <select 
                  value={selectedItem.final_state === 'LOCKED' ? selectedItem.human_decision_code : overrideData.human_decision_code} 
                  onChange={(e) => setOverrideData({...overrideData, human_decision_code: e.target.value})}
                  disabled={selectedItem.final_state === 'LOCKED'}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}
                >
                  {Object.entries(HUMAN_CODES).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>النسبة المالية المعتمدة للدفع (%):</label>
                <input 
                  type="number" min="0" max="100" step="0.1"
                  value={selectedItem.final_state === 'LOCKED' ? selectedItem.human_payment_pct : overrideData.human_payment_pct}
                  onChange={(e) => setOverrideData({...overrideData, human_payment_pct: parseFloat(e.target.value)})}
                  disabled={selectedItem.final_state === 'LOCKED'}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                  required
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>سبب التجاويز (Justification):</label>
                <textarea 
                  rows="3"
                  value={selectedItem.final_state === 'LOCKED' ? selectedItem.override_reason : overrideData.override_reason}
                  onChange={(e) => setOverrideData({...overrideData, override_reason: e.target.value})}
                  disabled={selectedItem.final_state === 'LOCKED'}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                  placeholder="اكتب سبب مخالفة توصية النظام (مطلوب للتدقيق المالي)..."
                  required
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold', fontSize: '14px' }}>اسم المعتمد:</label>
                <input 
                  type="text"
                  value={selectedItem.final_state === 'LOCKED' ? selectedItem.approved_by : overrideData.approved_by}
                  onChange={(e) => setOverrideData({...overrideData, approved_by: e.target.value})}
                  disabled={selectedItem.final_state === 'LOCKED'}
                  style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', boxSizing: 'border-box' }}
                  placeholder="اسم مدير المشروع أو المهندس المخول..."
                  required
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setSelectedItem(null)} style={{ padding: '8px 16px', background: '#ecf0f1', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
                  إغلاق
                </button>
                {selectedItem.final_state !== 'LOCKED' && (
                  <button type="submit" disabled={isSubmitting} style={{ padding: '8px 16px', background: '#8e44ad', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
                    {isSubmitting ? 'جاري الاعتماد...' : 'اعتماد القرار'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default GovernanceDashboard;