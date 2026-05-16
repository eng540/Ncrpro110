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

const boqCodes = [
  {code:'A1', label:'A1 - حفر وتسوية + أساس حجر'},
  {code:'A2', label:'A2 - جدران بلك مفرغ 15سم'},
  {code:'A3', label:'A3 - لياسة داخلية وخارجية'},
  {code:'A4', label:'A4 - سقف خرسانة مسلحة'},
  {code:'A5', label:'A5 - كرسي عربي + كوع ريحة'},
  {code:'A6', label:'A6 - بلاط موزايكو'},
  {code:'B1', label:'B1 - حفر بيارة قطر 1م'},
  {code:'B2', label:'B2 - تمديد UPVC 4 انش + تهوية'},
  {code:'B3', label:'B3 - غطاء بيارة خرساني'},
  {code:'C1', label:'C1 - باب حديد صاج'},
  {code:'C2', label:'C2 - نافذة ألمنيوم'},
  {code:'C3', label:'C3 - إضاءة شمسية 10واط'},
  {code:'C4', label:'C4 - لوحة معدنية + شعار'},
];

function BulkUpdate({ apiUrl }) {
  const [latrines, setLatrines] = useState([]);
  const [boqItems, setBoqItems] = useState([]);
  const [selectedCode, setSelectedCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    Promise.all([
      fetch(`${apiUrl}/latrines?limit=200`).then(r => r.json()),
      fetch(`${apiUrl}/boq-items`).then(r => r.json())
    ])
    .then(([latData, boqData]) => {
      setLatrines(latData);
      setBoqItems(boqData);
      setLoading(false);
    })
    .catch(() => {
      setError('تعذر تحميل البيانات من الخادم');
      setLoading(false);
    });
  }, [apiUrl]);

  const getItemForLatrine = (latrineId) => {
    return boqItems.find(b => b.latrine_id === latrineId && b.boq_code === selectedCode);
  };

  const updateItemField = (itemId, field, value) => {
    setBoqItems(prev => prev.map(item => 
      item.id === itemId ? { ...item, [field]: value } : item
    ));
  };

  const setQuickPct = (item, pct) => {
    const val = parseFloat((item.planned_qty * (pct / 100)).toFixed(2));
    updateItemField(item.id, 'achieved_qty', val);
  };

  const completeAll = () => {
    setBoqItems(prev => prev.map(item => {
      if (item.boq_code === selectedCode) {
        return { ...item, achieved_qty: item.planned_qty, status: 'completed', quality_pass: 'pending' };
      }
      return item;
    }));
    setMessage('تم تعيين جميع الحمامات لهذا البند كـ منفذ كامل (لم يُحفظ بعد)');
    setError('');
  };

  const saveAll = async () => {
    if (!selectedCode) {
      setError('اختر بنداً أولاً');
      return;
    }
    setSaving(true);
    setMessage('');
    setError('');
    
    const changed = boqItems
      .filter(b => b.boq_code === selectedCode)
      .map(b => {
        const qty = b.achieved_qty;
        let numQty = null;
        if (qty !== null && qty !== undefined && qty !== '' && !isNaN(parseFloat(qty))) {
          numQty = parseFloat(parseFloat(qty).toFixed(2));
        }
        
        return {
          item_id: parseInt(b.id, 10),
          achieved_qty: numQty,
          status: b.status || 'not_started',
          quality_pass: b.quality_pass || 'pending'
        };
      })
      .filter(b => !isNaN(b.item_id));
    
    if (changed.length === 0) {
      setError('لا توجد بيانات صالحة للحفظ');
      setSaving(false);
      return;
    }

    console.log('Sending bulk update:', JSON.stringify({ items: changed }, null, 2));

    try {
      const res = await fetch(`${apiUrl}/boq-items/bulk`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: changed })
      });
      
      if (res.ok) {
        const data = await res.json();
        setMessage(`تم حفظ ${data.updated_count} بند بنجاح (${data.affected_latrines} حمام متأثر)`);
        const latRes = await fetch(`${apiUrl}/latrines?limit=200`);
        const latData = await latRes.json();
        setLatrines(latData);
      } else {
        const errData = await res.json();
        console.error('Server error response:', errData);
        
        let errText = 'خطأ أثناء الحفظ على الخادم';
        if (Array.isArray(errData.detail)) {
          errText = errData.detail.map(e => `${e.loc?.join('.')}: ${e.msg}`).join(' | ');
        } else if (typeof errData.detail === 'string') {
          errText = errData.detail;
        } else {
          errText = JSON.stringify(errData);
        }
        setError(`خطأ ${res.status}: ${errText}`);
      }
    } catch (e) {
      setError(`فشل الاتصال بالخادم: ${e.message}`);
    }
    setSaving(false);
  };

  if (loading) return React.createElement('div', {style: {textAlign:'center',padding:'40px'}}, 'جاري تحميل البيانات...');

  return React.createElement('div', null,
    React.createElement('div', {style: {display:'flex',gap:'12px',marginBottom:'20px',alignItems:'center',flexWrap:'wrap'}},
      React.createElement('h2', {style: {color:'#1F4E78',margin:0}}, 'التحديث الجماعي حسب البند'),
      React.createElement('select', {
        value: selectedCode,
        onChange: e => { setSelectedCode(e.target.value); setMessage(''); setError(''); },
        style: {padding:'10px 14px',borderRadius:'4px',border:'1px solid #ccc',minWidth:'280px'}
      },
        React.createElement('option', {value: ''}, 'اختر بند BoQ...'),
        boqCodes.map(b => React.createElement('option', {key: b.code, value: b.code}, b.label))
      ),
      selectedCode ? React.createElement(React.Fragment, null,
        React.createElement('button', {
          onClick: completeAll,
          style: {padding:'10px 16px',background:'#70AD47',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontWeight:'bold'}
        }, 'تنفيذ كامل للجميع'),
        React.createElement('button', {
          onClick: saveAll,
          disabled: saving,
          style: {padding:'10px 20px',background:'#1F4E78',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontWeight:'bold'}
        }, saving ? 'جاري الحفظ...' : 'حفظ جميع التغييرات')
      ) : null
    ),

    message ? React.createElement('div', {
      style: {padding:'12px 16px',background:'#C6EFCE',borderRadius:'4px',marginBottom:'16px',color:'#1F4E78',fontWeight:'bold',border:'1px solid #70AD47'}
    }, message) : null,

    error ? React.createElement('div', {
      style: {padding:'12px 16px',background:'#FFC7CE',borderRadius:'4px',marginBottom:'16px',color:'#C00000',fontWeight:'bold',border:'1px solid #C00000'}
    }, error) : null,

    selectedCode ? React.createElement('div', {style: {background:'white',borderRadius:'8px',overflow:'hidden',boxShadow:'0 2px 8px rgba(0,0,0,0.08)'}},
      React.createElement('table', {style: {width:'100%',borderCollapse:'collapse'}},
        React.createElement('thead', {style: {background:'#1F4E78',color:'white'}},
          React.createElement('tr', null,
            React.createElement('th', {style: {padding:'12px',textAlign:'right'}}, 'رقم الحمام'),
            React.createElement('th', {style: {padding:'12px',textAlign:'right'}}, 'المستفيد'),
            React.createElement('th', {style: {padding:'12px',textAlign:'right'}}, 'المجموعة'),
            React.createElement('th', {style: {padding:'12px',textAlign:'right'}}, 'المخطط'),
            React.createElement('th', {style: {padding:'12px',textAlign:'right'}}, 'المنفذ'),
            React.createElement('th', {style: {padding:'12px',textAlign:'right'}}, 'نسب سريعة'),
            React.createElement('th', {style: {padding:'12px',textAlign:'right'}}, 'الحالة'),
            React.createElement('th', {style: {padding:'12px',textAlign:'right'}}, 'جودة'),
            React.createElement('th', {style: {padding:'12px',textAlign:'right'}}, 'كامل')
          )
        ),
        React.createElement('tbody', null,
          latrines.map(lat => {
            const item = getItemForLatrine(lat.id);
            if (!item) return null;
            return React.createElement('tr', {key: lat.id, style: {borderBottom:'1px solid #eee'}},
              React.createElement('td', {style: {padding:'10px',fontWeight:'bold'}}, lat.latrine_id),
              React.createElement('td', {style: {padding:'10px',fontSize:'13px'}}, lat.beneficiary_hh),
              React.createElement('td', {style: {padding:'10px'}}, lat.block_no),
              React.createElement('td', {style: {padding:'10px'}}, `${item.planned_qty} ${item.unit}`),
              React.createElement('td', {style: {padding:'10px'}},
                React.createElement('input', {
                  type: 'number',
                  step: '0.01',
                  value: item.achieved_qty,
                  onChange: e => updateItemField(item.id, 'achieved_qty', e.target.value),
                  style: {width:'70px',padding:'4px'}
                })
              ),
              React.createElement('td', {style: {padding:'10px'}},
                React.createElement('div', {style: {display:'flex',gap:'2px',flexWrap:'wrap'}},
                  [25,50,75,100].map(pct => React.createElement('button', {
                    key: pct,
                    onClick: () => setQuickPct(item, pct),
                    style: {fontSize:'10px',padding:'2px 6px',cursor:'pointer',border:'1px solid #ccc',background:'#f5f5f5',borderRadius:'3px'}
                  }, `${pct}%`))
                )
              ),
              React.createElement('td', {style: {padding:'10px'}},
                React.createElement('select', {
                  value: item.status || 'not_started',
                  onChange: e => updateItemField(item.id, 'status', e.target.value),
                  style: {padding:'4px',background: statusColors[item.status] || '#E2EFDA',fontSize:'12px'}
                },
                  React.createElement('option', {value: 'not_started'}, 'لم يبدأ'),
                  React.createElement('option', {value: 'in_progress'}, 'جاري'),
                  React.createElement('option', {value: 'completed'}, 'منفذ'),
                  React.createElement('option', {value: 'pending_inspection'}, 'بانتظار الفحص'),
                  React.createElement('option', {value: 'accepted'}, 'مقبول'),
                  React.createElement('option', {value: 'rejected'}, 'مرفوض'),
                  React.createElement('option', {value: 'rework_required'}, 'يحتاج إعادة')
                )
              ),
              React.createElement('td', {style: {padding:'10px'}},
                React.createElement('select', {
                  value: item.quality_pass || 'pending',
                  onChange: e => updateItemField(item.id, 'quality_pass', e.target.value),
                  style: {padding:'4px',background: qualityColors[item.quality_pass] || '#FFEB9C',fontSize:'12px'}
                },
                  React.createElement('option', {value: 'pending'}, 'معلق'),
                  React.createElement('option', {value: 'pass'}, 'مقبول'),
                  React.createElement('option', {value: 'fail'}, 'مرفوض')
                )
              ),
              React.createElement('td', {style: {padding:'10px'}},
                React.createElement('button', {
                  onClick: () => {
                    updateItemField(item.id, 'achieved_qty', item.planned_qty);
                    updateItemField(item.id, 'status', 'completed');
                  },
                  style: {padding:'4px 10px',background:'#70AD47',color:'white',border:'none',borderRadius:'4px',cursor:'pointer',fontSize:'12px'}
                }, 'كامل')
              )
            );
          })
        )
      )
    ) : React.createElement('div', {style: {textAlign:'center',padding:'60px',color:'#666',background:'white',borderRadius:'8px'}},
      'اختر بند BoQ من القائمة أعلاه لعرض جميع الحمامات وتحديثها دفعة واحدة'
    )
  );
}

export default BulkUpdate;
