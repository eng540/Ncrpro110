import React, { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';

const qualityColors = { pass: '#C6EFCE', fail: '#FFC7CE', pending: '#FFF2CC' };
const itemStatuses = [
  { value: 'not_started', label: 'لم يبدأ' },
  { value: 'in_progress', label: 'قيد العمل' },
  { value: 'completed', label: 'مكتمل' },
  { value: 'pending_inspection', label: 'بانتظار الفحص' }
];

// ربط الأكواد بأسماء البنود (لتسهيل اختيار المهندس)
const boqDictionary = [
  { code: 'A1', name: 'حفر وتسوية + أساس حجر' },
  { code: 'A2', name: 'جدران بلك مفرغ 15سم' },
  { code: 'A3', name: 'لياسة داخلية وخارجية' },
  { code: 'A4', name: 'سقف خرسانة مسلحة' },
  { code: 'A5', name: 'كرسي عربي + كوع ريحة' },
  { code: 'A6', name: 'بلاط موزايكو' },
  { code: 'B1', name: 'حفر بيارة قطر 1م' },
  { code: 'B2', name: 'تمديد UPVC 4 انش + تهوية' },
  { code: 'B3', name: 'غطاء بيارة خرساني' },
  { code: 'C1', name: 'باب حديد صاج' },
  { code: 'C2', name: 'نافذة ألمنيوم' },
  { code: 'C3', name: 'إضاءة شمسية 10واط' },
  { code: 'C4', name: 'لوحة معدنية + شعار' }
];

const BulkUpdate = () => {
  const [selectedBoqCode, setSelectedBoqCode] = useState('A1');
  const [selectedLatrines, setSelectedLatrines] = useState([]);
  const [bulkQty, setBulkQty] = useState('');
  const [bulkStatus, setBulkStatus] = useState('completed');
  const [bulkQuality, setBulkQuality] = useState('pass');
  const [isSaving, setIsSaving] = useState(false);

  // جلب الحمامات وجداول الكميات المرتبطة بالبند المختار محلياً
  const latrines = useLiveQuery(() => db.latrines.toArray(), []);
  const boqItems = useLiveQuery(() => 
    db.boq_items.where('boq_code').equals(selectedBoqCode).toArray(), 
  [selectedBoqCode]);

  if (!latrines || !boqItems) return <div style={{ textAlign: 'center', padding: '40px' }}>جاري التحميل...</div>;

  // دمج البيانات لعرضها في الجدول
  const tableData = latrines.map(latrine => {
    const item = boqItems.find(i => i.latrine_id === latrine.id);
    return { ...latrine, boqItem: item };
  }).filter(data => data.boqItem !== undefined);

  const toggleSelectAll = (e) => {
    if (e.target.checked) setSelectedLatrines(tableData.map(d => d.id));
    else setSelectedLatrines([]);
  };

  const toggleSelect = (id) => {
    setSelectedLatrines(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleApplyBulkUpdate = async () => {
    if (selectedLatrines.length === 0) {
      alert("يرجى تحديد حمام واحد على الأقل.");
      return;
    }
    if (bulkQty === '' || isNaN(parseFloat(bulkQty))) {
      alert("يرجى إدخال الكمية المنفذة المراد تطبيقها.");
      return;
    }

    if (!window.confirm(`هل أنت متأكد من تطبيق التحديث على ${selectedLatrines.length} حمامات؟`)) return;

    setIsSaving(true);
    try {
      const qty = parseFloat(bulkQty);

      // استخدام Transaction محلي لضمان سرعة وسلامة التحديث الجماعي
      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        for (const latrineId of selectedLatrines) {
          const targetItem = boqItems.find(i => i.latrine_id === latrineId);
          if (targetItem) {
            // تحديث محلي
            await db.boq_items.update(targetItem.id, {
              achieved_qty: qty,
              status: bulkStatus,
              quality_pass: bulkQuality
            });

            // إرسال لطابور المزامنة
            await pushToSyncQueue('UPDATE_BOQ', {
              id: targetItem.id,
              achieved_qty: qty,
              status: bulkStatus,
              quality_pass: bulkQuality,
              latrine_id: latrineId
            });
          }
        }
      });

      alert("تم تطبيق التحديث الجماعي بنجاح وحفظه في طابور المزامنة.");
      setSelectedLatrines([]); // إفراغ التحديد بعد النجاح
      setBulkQty('');
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء التحديث الجماعي.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div style={{ direction: 'rtl' }}>
      <h2 style={{ color: '#1F4E78', marginBottom: '20px' }}>التحديث الجماعي للبنود (Bulk Update)</h2>

      {/* لوحة التحكم بالتحديث الجماعي */}
      <div style={{ background: '#fff', padding: '20px', borderRadius: '8px', boxShadow: '0 2px 8px rgba(0,0,0,0.1)', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>اختر البند المستهدف:</label>
            <select 
              value={selectedBoqCode} 
              onChange={(e) => { setSelectedBoqCode(e.target.value); setSelectedLatrines([]); }} 
              style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '250px' }}
            >
              {boqDictionary.map(b => (
                <option key={b.code} value={b.code}>
                  {b.code} - {b.name} {/* عرض الكود والاسم معاً لتسهيل البحث */}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold', color: '#2980b9' }}>الكمية المنفذة الجديدة:</label>
            <input 
              type="number" step="0.01" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} 
              style={{ padding: '8px', borderRadius: '4px', border: '2px solid #3498db', minWidth: '100px' }} 
              placeholder="الكمية..." 
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>حالة البند:</label>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
              {itemStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>فحص الجودة:</label>
            <select value={bulkQuality} onChange={(e) => setBulkQuality(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: qualityColors[bulkQuality] }}>
              <option value="pending">قيد الفحص</option>
              <option value="pass">مقبول</option>
              <option value="fail">مرفوض</option>
            </select>
          </div>

          <button onClick={handleApplyBulkUpdate} disabled={isSaving || selectedLatrines.length === 0} style={{ padding: '10px 20px', background: selectedLatrines.length > 0 ? '#27ae60' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: selectedLatrines.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', height: '40px' }}>
            {isSaving ? 'جاري التطبيق...' : `تطبيق على (${selectedLatrines.length}) حمام`}
          </button>
        </div>
      </div>

      {/* جدول اختيار الحمامات */}
      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'center', width: '50px' }}>
                <input type="checkbox" onChange={toggleSelectAll} checked={tableData.length > 0 && selectedLatrines.length === tableData.length} />
              </th>
              <th style={{ padding: '12px', textAlign: 'right' }}>رقم الحمام</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>المربع</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>المنفذ حالياً</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>حالة الجودة الحالية</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>المهندس</th>
            </tr>
          </thead>
          <tbody>
            {tableData.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '20px', textAlign: 'center' }}>لا توجد بيانات محلية. يرجى المزامنة.</td></tr>
            ) : (
              tableData.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #eee', backgroundColor: selectedLatrines.includes(row.id) ? '#f1f8ff' : 'transparent' }}>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedLatrines.includes(row.id)} onChange={() => toggleSelect(row.id)} />
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#1F4E78' }}>{row.latrine_id}</td>
                  <td style={{ padding: '12px' }}>{row.block_no}</td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#7f8c8d' }}>
                    {row.boqItem.achieved_qty} / {row.boqItem.planned_qty} {row.boqItem.unit}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <span style={{ background: qualityColors[row.boqItem.quality_pass || 'pending'], padding: '4px 8px', borderRadius: '4px', fontSize: '12px' }}>
                      {row.boqItem.quality_pass === 'pass' ? 'مقبول' : row.boqItem.quality_pass === 'fail' ? 'مرفوض' : 'قيد الفحص'}
                    </span>
                  </td>
                  <td style={{ padding: '12px' }}>{row.site_engineer}</td>
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