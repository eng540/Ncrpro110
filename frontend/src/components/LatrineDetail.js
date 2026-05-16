import React, { useState, useEffect } from 'react';

const statusColors = {
  not_started: '#E2EFDA',
  in_progress: '#FFEB9C',
  completed: '#C6EFCE',
  pending_inspection: '#B8CCE4',
  accepted: '#70AD47',
  rejected: '#FFC7CE',
  rework_required: '#FFC7CE'
};

const qualityColors = {
  pass: '#C6EFCE',
  fail: '#FFC7CE',
  pending: '#FFEB9C'
};

function LatrineDetail({ apiUrl, latrine, onBack }) {
  const [items, setItems] = useState([]);
  const [latrineData, setLatrineData] = useState(latrine);
  const [saving, setSaving] = useState(false);

  // --- حالات نافذة الملاحظات (Remark Modal States) ---
  const [showRemarkModal, setShowRemarkModal] = useState(false);
  const [selectedBoq, setSelectedBoq] = useState('');
  const [remarkForm, setRemarkForm] = useState({ description: '', severity: 'minor', action_required: '' });
  const [submittingRemark, setSubmittingRemark] = useState(false);

  useEffect(() => {
    fetch(`${apiUrl}/boq-items?latrine_id=${latrine.id}`)
      .then(r => r.json())
      .then(data => setItems(data));
  }, [apiUrl, latrine.id]);

  const updateItem = (itemId, field, value) => {
    setItems(prev => prev.map(item => item.id === itemId ? { ...item, [field]: value } : item));
  };

  const saveItem = async (item) => {
    setSaving(true);
    const payload = {};
    if (item.achieved_qty !== undefined) payload.achieved_qty = parseFloat(item.achieved_qty);
    if (item.status) payload.status = item.status;
    if (item.quality_pass) payload.quality_pass = item.quality_pass;
    payload.inspection_date = new Date().toISOString();
    payload.inspector = "Field Engineer";

    await fetch(`${apiUrl}/boq-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const latRes = await fetch(`${apiUrl}/latrines/${latrine.id}`);
    const latData = await latRes.json();
    setLatrineData(latData);
    setSaving(false);
  };

  const completeItem = async (item) => {
    setSaving(true);
    const payload = {
      achieved_qty: item.planned_qty,
      status: 'completed',
      quality_pass: 'pending',
      inspection_date: new Date().toISOString(),
      inspector: "Field Engineer"
    };

    await fetch(`${apiUrl}/boq-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    setItems(prev => prev.map(it => 
      it.id === item.id ? { ...it, achieved_qty: item.planned_qty, status: 'completed', quality_pass: 'pending' } : it
    ));

    const latRes = await fetch(`${apiUrl}/latrines/${latrine.id}`);
    const latData = await latRes.json();
    setLatrineData(latData);
    setSaving(false);
  };

  const setQuickPct = (item, pct) => {
    const val = parseFloat((item.planned_qty * (pct / 100)).toFixed(2));
    updateItem(item.id, 'achieved_qty', val);
  };

  // --- دالة إرسال الملاحظة الجديدة ---
  const submitRemark = async (e) => {
    e.preventDefault();
    if (!remarkForm.description) return alert("يرجى كتابة وصف الملاحظة");
    
    setSubmittingRemark(true);
    try {
      await fetch(`${apiUrl}/remarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latrine_id: latrineData.id,
          boq_code: selectedBoq,
          type: 'General',
          severity: remarkForm.severity,
          description: remarkForm.description,
          action_required: remarkForm.action_required
        })
      });

      // إغلاق النافذة وتفريغ النموذج
      setShowRemarkModal(false);
      setRemarkForm({ description: '', severity: 'minor', action_required: '' });
      
      // تحديث بيانات الحمام لجلب العداد الجديد للملاحظات
      const latRes = await fetch(`${apiUrl}/latrines/${latrineData.id}`);
      const latData = await latRes.json();
      setLatrineData(latData);
      
      alert("تم تسجيل الملاحظة بنجاح وتنبيه الإدارة.");
    } catch (error) {
      alert("حدث خطأ أثناء حفظ الملاحظة");
    }
    setSubmittingRemark(false);
  };

  return (
    <div style={{position: 'relative'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px'}}>
        <div>
          <button onClick={onBack} style={{marginBottom:'8px',padding:'6px 12px',cursor:'pointer'}}>← رجوع للقائمة</button>
          <h2 style={{color:'#1F4E78',margin:0}}>تفاصيل الحمام: {latrineData.latrine_id}</h2>
        </div>
        <div style={{textAlign:'left'}}>
          <div style={{fontSize:'24px',fontWeight:'bold',color:'#1F4E78'}}>{latrineData.overall_pct}%</div>
          <div style={{fontSize:'12px',color:'#666'}}>نسبة الإنجاز الإجمالية</div>
        </div>
      </div>

      <div style={{background:'white',borderRadius:'8px',padding:'16px',marginBottom:'20px',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit, minmax(200px, 1fr))',gap:'16px'}}>
          <div><strong>المستفيد:</strong> {latrineData.beneficiary_hh}</div>
          <div><strong>المجموعة:</strong> {latrineData.block_no}</div>
          <div><strong>المهندس:</strong> {latrineData.site_engineer}</div>
          <div><strong>الملاحظات المفتوحة:</strong> <span style={{color: latrineData.remarks_count > 0 ? '#C00000' : '#70AD47', fontWeight: 'bold'}}>{latrineData.remarks_count}</span></div>
          <div><strong>الحالة:</strong> 
            <span style={{background: statusColors[latrineData.status],padding:'2px 8px',borderRadius:'4px',marginRight:'8px'}}>
              {latrineData.status}
            </span>
          </div>
        </div>
      </div>

      <h3 style={{color:'#1F4E78'}}>جدول الكميات - تتبع البنود</h3>
      <div style={{background:'white',borderRadius:'8px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead style={{background:'#1F4E78',color:'white'}}>
            <tr>
              <th style={{padding:'12px',textAlign:'right'}}>البند</th>
              <th style={{padding:'12px',textAlign:'right'}}>الوصف</th>
              <th style={{padding:'12px',textAlign:'right'}}>الوحدة</th>
              <th style={{padding:'12px',textAlign:'right'}}>المخطط</th>
              <th style={{padding:'12px',textAlign:'right'}}>المنفذ</th>
              <th style={{padding:'12px',textAlign:'right'}}>نسب سريعة</th>
              <th style={{padding:'12px',textAlign:'right'}}>%</th>
              <th style={{padding:'12px',textAlign:'right'}}>الحالة</th>
              <th style={{padding:'12px',textAlign:'right'}}>جودة</th>
              <th style={{padding:'12px',textAlign:'right'}}>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{borderBottom:'1px solid #eee'}}>
                <td style={{padding:'10px',fontWeight:'bold'}}>{item.boq_code}</td>
                <td style={{padding:'10px',fontSize:'13px'}}>{item.description_ar}</td>
                <td style={{padding:'10px'}}>{item.unit}</td>
                <td style={{padding:'10px'}}>{item.planned_qty}</td>
                <td style={{padding:'10px'}}>
                  <input 
                    type="number" 
                    step="0.01"
                    value={item.achieved_qty}
                    onChange={e => updateItem(item.id, 'achieved_qty', e.target.value)}
                    style={{width:'70px',padding:'4px'}}
                  />
                </td>
                <td style={{padding:'10px'}}>
                  <div style={{display:'flex',gap:'2px',flexWrap:'wrap'}}>
                    {[25,50,75,100].map(pct => (
                      <button 
                        key={pct}
                        onClick={() => setQuickPct(item, pct)}
                        style={{fontSize:'10px',padding:'2px 6px',cursor:'pointer',border:'1px solid #ccc',background:'#f5f5f5',borderRadius:'3px'}}
                      >
                        {pct}%
                      </button>
                    ))}
                  </div>
                </td>
                <td style={{padding:'10px',fontWeight:'bold'}}>{item.achievement_pct}%</td>
                <td style={{padding:'10px'}}>
                  <select 
                    value={item.status}
                    onChange={e => updateItem(item.id, 'status', e.target.value)}
                    style={{padding:'4px',background: statusColors[item.status]}}
                  >
                    <option value="not_started">لم يبدأ</option>
                    <option value="in_progress">جاري</option>
                    <option value="completed">منفذ</option>
                    <option value="pending_inspection">بانتظار الفحص</option>
                    <option value="accepted">مقبول</option>
                    <option value="rejected">مرفوض</option>
                    <option value="rework_required">يحتاج إعادة</option>
                  </select>
                </td>
                <td style={{padding:'10px'}}>
                  <select 
                    value={item.quality_pass}
                    onChange={e => updateItem(item.id, 'quality_pass', e.target.value)}
                    style={{padding:'4px',background: qualityColors[item.quality_pass]}}
                  >
                    <option value="pending">معلق</option>
                    <option value="pass">مقبول</option>
                    <option value="fail">مرفوض</option>
                  </select>
                </td>
                <td style={{padding:'10px',display:'flex',gap:'4px',flexDirection:'column'}}>
                  <button 
                    onClick={() => saveItem(item)}
                    disabled={saving}
                    style={{padding:'6px 12px',background:'#1F4E78',color:'white',border:'none',borderRadius:'4px',cursor:'pointer'}}
                  >
                    {saving ? '...' : 'حفظ'}
                  </button>
                  <button 
                    onClick={() => completeItem(item)}
                    disabled={saving}
                    style={{padding:'6px 12px',background:'#70AD47',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12px'}}
                  >
                    كامل
                  </button>
                  <button 
                    onClick={() => { setSelectedBoq(item.boq_code); setShowRemarkModal(true); }}
                    style={{padding:'6px 12px',background:'#C00000',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12px'}}
                  >
                    ⚠️ ملاحظة
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- نافذة إضافة الملاحظة (Modal) --- */}
      {showRemarkModal && (
        <div style={{position:'fixed',top:0,left:0,width:'100%',height:'100%',background:'rgba(0,0,0,0.6)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:1000}}>
          <div style={{background:'white',padding:'24px',borderRadius:'8px',width:'90%',maxWidth:'400px',boxShadow:'0 4px 20px rgba(0,0,0,0.2)'}}>
            <h3 style={{color:'#C00000',marginTop:0}}>إضافة ملاحظة جودة</h3>
            <p style={{fontSize:'14px',color:'#666'}}>الحمام: <strong>{latrineData.latrine_id}</strong> | البند: <strong>{selectedBoq}</strong></p>
            
            <form onSubmit={submitRemark}>
              <div style={{marginBottom:'12px'}}>
                <label style={{display:'block',marginBottom:'4px',fontSize:'14px',fontWeight:'bold'}}>مستوى الخطورة:</label>
                <select 
                  value={remarkForm.severity} 
                  onChange={e => setRemarkForm({...remarkForm, severity: e.target.value})}
                  style={{width:'100%',padding:'8px',borderRadius:'4px',border:'1px solid #ccc'}}
                >
                  <option value="minor">طفيفة (Minor)</option>
                  <option value="major">كبيرة (Major)</option>
                  <option value="critical">حرجة (Critical)</option>
                </select>
              </div>

              <div style={{marginBottom:'12px'}}>
                <label style={{display:'block',marginBottom:'4px',fontSize:'14px',fontWeight:'bold'}}>وصف المشكلة:</label>
                <textarea 
                  required
                  rows="3"
                  value={remarkForm.description}
                  onChange={e => setRemarkForm({...remarkForm, description: e.target.value})}
                  style={{width:'100%',padding:'8px',borderRadius:'4px',border:'1px solid #ccc',boxSizing:'border-box'}}
                  placeholder="اكتب تفاصيل العيب أو المشكلة هنا..."
                />
              </div>

              <div style={{marginBottom:'20px'}}>
                <label style={{display:'block',marginBottom:'4px',fontSize:'14px',fontWeight:'bold'}}>الإجراء المطلوب (اختياري):</label>
                <textarea 
                  rows="2"
                  value={remarkForm.action_required}
                  onChange={e => setRemarkForm({...remarkForm, action_required: e.target.value})}
                  style={{width:'100%',padding:'8px',borderRadius:'4px',border:'1px solid #ccc',boxSizing:'border-box'}}
                  placeholder="ما الذي يجب على المقاول فعله؟"
                />
              </div>

              <div style={{display:'flex',justifyContent:'flex-end',gap:'12px'}}>
                <button type="button" onClick={() => setShowRemarkModal(false)} style={{padding:'8px 16px',background:'#eee',border:'none',borderRadius:'4px',cursor:'pointer',color:'#333'}}>
                  إلغاء
                </button>
                <button type="submit" disabled={submittingRemark} style={{padding:'8px 16px',background:'#C00000',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontWeight:'bold'}}>
                  {submittingRemark ? 'جاري الحفظ...' : 'حفظ الملاحظة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

export default LatrineDetail;