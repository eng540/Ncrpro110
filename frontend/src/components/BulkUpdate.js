import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';

const qualityColors = { pass: '#C6EFCE', fail: '#FFC7CE', pending: '#FFF2CC' };
const itemStatuses = [
  { value: 'not_started', label: 'لم يبدأ' },
  { value: 'in_progress', label: 'قيد العمل' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'pending_inspection', label: 'بانتظار الفحص' },
  { value: 'rework_required', label: 'يحتاج إعادة عمل' },
  { value: 'rejected', label: 'مرفوض' }
];

const boqDictionary = [
  { code: 'A1', name: 'حفر وتسوية + أساس حجر' }, { code: 'A2', name: 'جدران بلك مفرغ 15سم' },
  { code: 'A3', name: 'لياسة داخلية وخارجية' }, { code: 'A4', name: 'سقف خرسانة مسلحة' },
  { code: 'A5', name: 'كرسي عربي + كوع ريحة' }, { code: 'A6', name: 'بلاط موزايكو' },
  { code: 'B1', name: 'حفر بيارة قطر 1م' }, { code: 'B2', name: 'تمديد UPVC 4 انش + تهوية' },
  { code: 'B3', name: 'غطاء بيارة خرساني' }, { code: 'C1', name: 'باب حديد صاج' },
  { code: 'C2', name: 'نافذة ألمنيوم' }, { code: 'C3', name: 'إضاءة شمسية 10واط' }, { code: 'C4', name: 'لوحة معدنية + شعار' }
];

const BulkUpdate = ({ onOpenRemarks }) => {
  const [selectedBoqCode, setSelectedBoqCode] = useState('A1');
  const [selectedLatrines, setSelectedLatrines] = useState([]);
  const [bulkQty, setBulkQty] = useState('');
  const [bulkStatus, setBulkStatus] = useState('completed');
  const [bulkQuality, setBulkQuality] = useState('pass');
  const [isSaving, setIsSaving] = useState(false);

  const latrines = useLiveQuery(() => db.latrines.toArray(), []);
  const boqItems = useLiveQuery(() => db.boq_items.where('boq_code').equals(selectedBoqCode).toArray(), [selectedBoqCode]);

  if (!latrines || !boqItems) return <div style={{ textAlign: 'center', padding: '40px' }}>جاري التحميل...</div>;

  const tableData = latrines.map(latrine => {
    const item = boqItems.find(i => i.latrine_id === latrine.id);
    return { ...latrine, boqItem: item };
  }).filter(data => data.boqItem !== undefined);

  // تحديث سطر واحد (Inline Editing)
  const handleSingleUpdate = async (item, latrineId) => {
    try {
      const qty = parseFloat(document.getElementById(`bulk-qty-${item.id}`).value);
      const status = document.getElementById(`bulk-status-${item.id}`).value;
      const quality = document.getElementById(`bulk-quality-${item.id}`).value;

      if (isNaN(qty) || qty < 0 || qty > item.planned_qty) {
        alert("الكمية المدخلة غير صالحة."); return;
      }

      await db.boq_items.update(item.id, { achieved_qty: qty, status: status, quality_pass: quality });
      await pushToSyncQueue('UPDATE_BOQ', { id: item.id, achieved_qty: qty, status: status, quality_pass: quality, latrine_id: latrineId });
      alert("تم حفظ التعديل لهذا الحمام.");
    } catch (error) {
      alert("خطأ أثناء الحفظ.");
    }
  };

  // التحديث الجماعي (Bulk Editing)
  const handleApplyBulkUpdate = async () => {
    if (selectedLatrines.length === 0) return alert("حدد حماماً واحداً على الأقل.");
    if (bulkQty === '' || isNaN(parseFloat(bulkQty))) return alert("أدخل الكمية الجماعية.");
    if (!window.confirm(`تطبيق على ${selectedLatrines.length} حمامات؟`)) return;

    setIsSaving(true);
    try {
      const qty = parseFloat(bulkQty);
      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        for (const latrineId of selectedLatrines) {
          const targetItem = boqItems.find(i => i.latrine_id === latrineId);
          if (targetItem) {
            // تحديث الحقول في الشاشة لتتطابق مع الإدخال الجماعي
            document.getElementById(`bulk-qty-${targetItem.id}`).value = qty;
            document.getElementById(`bulk-status-${targetItem.id}`).value = bulkStatus;
            document.getElementById(`bulk-quality-${targetItem.id}`).value = bulkQuality;

            await db.boq_items.update(targetItem.id, { achieved_qty: qty, status: bulkStatus, quality_pass: bulkQuality });
            await pushToSyncQueue('UPDATE_BOQ', { id: targetItem.id, achieved_qty: qty, status: bulkStatus, quality_pass: bulkQuality, latrine_id: latrineId });
          }
        }
      });
      alert("تم تطبيق التحديث الجماعي بنجاح.");
      setSelectedLatrines([]);
    } catch (error) {
      alert("حدث خطأ جماعي.");
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSelectAll = (e) => e.target.checked ? setSelectedLatrines(tableData.map(d => d.id)) : setSelectedLatrines([]);
  const toggleSelect = (id) => setSelectedLatrines(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);

  const targetBoqInfo = boqDictionary.find(b => b.code === selectedBoqCode);

  return (
    <div style={{ direction: 'rtl' }}>
      <h2 style={{ color: '#1F4E78', marginBottom: '20px' }}>الشبكة المتقدمة (إدارة البند {selectedBoqCode} في جميع الحمامات)</h2>

      {/* لوحة التحكم بالتحديث الجماعي (الماستر) */}
      <div style={{ background: '#e8f4f8', border: '1px solid #bdc3c7', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#2980b9' }}>1. وحدة التحكم الجماعية (للأرقام المحددة)</h4>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>تغيير البند المعروض:</label>
            <select value={selectedBoqCode} onChange={(e) => { setSelectedBoqCode(e.target.value); setSelectedLatrines([]); }} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '250px' }}>
              {boqDictionary.map(b => <option key={b.code} value={b.code}>{b.code} - {b.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>تعميم كمية:</label>
            <input type="number" step="0.01" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '90px' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>تعميم حالة:</label>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
              {itemStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>تعميم جودة:</label>
            <select value={bulkQuality} onChange={(e) => setBulkQuality(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: qualityColors[bulkQuality] }}>
              <option value="pending">قيد الفحص</option><option value="pass">مقبول</option><option value="fail">مرفوض</option>
            </select>
          </div>

          <button onClick={handleApplyBulkUpdate} disabled={isSaving || selectedLatrines.length === 0} style={{ padding: '10px 20px', background: selectedLatrines.length > 0 ? '#16a085' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: selectedLatrines.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
            {isSaving ? 'جاري...' : `تطبيق على (${selectedLatrines.length}) محدد`}
          </button>
        </div>
      </div>

      {/* شبكة التحرير المباشر (Inline Grid) */}
      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'center', width: '50px' }}>
                <input type="checkbox" onChange={toggleSelectAll} checked={tableData.length > 0 && selectedLatrines.length === tableData.length} />
              </th>
              <th style={{ padding: '12px', textAlign: 'right' }}>الحمام والمربع</th>
              <th style={{ padding: '12px', textAlign: 'center', color: '#f1c40f' }}>المخطط ({targetBoqInfo.name})</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>تعديل الكمية</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>تعديل الحالة والجودة</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>إجراء خاص بالحمام</th>
            </tr>
          </thead>
          <tbody>
            {tableData.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center' }}>لا توجد بيانات.</td></tr>
            ) : (
              tableData.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #eee', backgroundColor: selectedLatrines.includes(row.id) ? '#f1f8ff' : 'transparent' }}>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedLatrines.includes(row.id)} onChange={() => toggleSelect(row.id)} />
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#1F4E78' }}>
                    {row.latrine_id} <br/><small style={{color:'#7f8c8d'}}>{row.block_no}</small>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold' }}>
                    {row.boqItem.planned_qty} {row.boqItem.unit}
                  </td>
                  
                  {/* حقول التحرير المباشر (Inline Editing) */}
                  <td style={{ padding: '12px' }}>
                    <input 
                      type="number" step="0.01" defaultValue={row.boqItem.achieved_qty} id={`bulk-qty-${row.boqItem.id}`}
                      style={{ width: '70px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }} 
                    />
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <select id={`bulk-status-${row.boqItem.id}`} defaultValue={row.boqItem.status || 'not_started'} style={{ padding: '4px', borderRadius: '4px', fontSize:'12px' }}>
                        {itemStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <select id={`bulk-quality-${row.boqItem.id}`} defaultValue={row.boqItem.quality_pass || 'pending'} style={{ padding: '4px', borderRadius: '4px', fontSize:'12px', backgroundColor: qualityColors[row.boqItem.quality_pass || 'pending'] }} onChange={(e) => e.target.style.backgroundColor = qualityColors[e.target.value]}>
                        <option value="pending">قيد الفحص</option><option value="pass">مقبول</option><option value="fail">مرفوض</option>
                      </select>
                    </div>
                  </td>
                  
                  {/* أزرار الإجراءات الخاصة بالسطر */}
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexDirection: 'column' }}>
                      <button 
                        onClick={() => handleSingleUpdate(row.boqItem, row.id)}
                        style={{ padding: '4px 8px', background: '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize:'11px' }}
                      >
                        حفظ هذا السطر فقط
                      </button>
                      <button 
                        onClick={() => onOpenRemarks(row.id, selectedBoqCode)}
                        style={{ padding: '4px 8px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize:'11px' }}
                      >
                        + ملاحظة استثنائية
                      </button>
                    </div>
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

export default BulkUpdate;