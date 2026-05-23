// ==========================================
// Constants & Configuration — المُصلحة
// ==========================================
const ITEM_HEIGHT = 60;
const HEADER_HEIGHT = 72;
const STICKY_COL_WIDTH = 200;
const CELL_WIDTH = 100;
const GROUP_TOGGLE_WIDTH = 30;
const ROW_WIDTH = 1590;

const BOQ_LABELS = {
  'A1': { name: 'حفر وتسوية + أساس حجر', short: 'حفر/أساس', unit: 'م³' },
  'A2': { name: 'جدران بلك مفرغ 15سم', short: 'جدران بلك', unit: 'م²' },
  'A3': { name: 'لياسة داخلية وخارجية', short: 'لياسة', unit: 'م²' },
  'A4': { name: 'سقف خرسانة مسلحة', short: 'سقف خرساني', unit: 'ل.م' },
  'A5': { name: 'كرسي عربي + كوع ريحة', short: 'كرسي/كوع', unit: 'عدد' },
  'A6': { name: 'بلاط موزايكو', short: 'بلاط', unit: 'م²' },
  'B1': { name: 'حفر بيارة قطر 1م', short: 'حفر بيارة', unit: 'م³' },
  'B2': { name: 'تمديد UPVC 4 انش + تهوية', short: 'تمديد صرف', unit: 'ل.م' },
  'B3': { name: 'غطاء بيارة خرساني', short: 'غطاء بيارة', unit: 'عدد' },
  'C1': { name: 'باب حديد صاج', short: 'باب حديد', unit: 'عدد' },
  'C2': { name: 'نافذة ألمنيوم', short: 'نافذة', unit: 'عدد' },
  'C3': { name: 'إضاءة شمسية 10واط', short: 'إضاءة شمسية', unit: 'عدد' },
  'C4': { name: 'لوحة معدنية + شعار', short: 'لوحة/شعار', unit: 'عدد' }
};

// ✅ الحل: تضمين ALL الحالات الممكنة في النظام
const STATUS_CYCLE = {
  'not_started': { next: 'in_progress', icon: '⬜', label: 'لم يبدأ', color: '#e0e0e0', pct: 0 },
  'in_progress': { next: 'completed', icon: '🔄', label: 'قيد العمل', color: '#ffc107', pct: 50 },
  'completed': { next: 'pending_inspection', icon: '✅', label: 'مكتمل', color: '#4caf50', pct: 100 },
  'pending_inspection': { next: 'accepted', icon: '🔍', label: 'بانتظار الفحص', color: '#2196f3', pct: 100 },
  'accepted': { next: 'rejected', icon: '✓', label: 'مقبول', color: '#8bc34a', pct: 100 },        // ← جديد
  'rejected': { next: 'rework_required', icon: '✗', label: 'مرفوض', color: '#f44336', pct: 0 },     // ← جديد
  'rework_required': { next: 'not_started', icon: '🔧', label: 'يحتاج إعادة', color: '#ff9800', pct: 25 }, // ← جديد
};

// ✅ نسخة آمنة للقراءة (Safe Reader)
const getStatusConfig = (status) => {
  return STATUS_CYCLE[status] || STATUS_CYCLE['not_started']; // Fallback آمن
};

const GROUPS = {
  'A': { label: 'أعمال البناء', codes: ['A1','A2','A3','A4','A5','A6'], color: '#1F4E78' },
  'B': { label: 'الصرفيات', codes: ['B1','B2','B3'], color: '#27ae60' },
  'C': { label: 'التشطيب', codes: ['C1','C2','C3','C4'], color: '#e74c3c' }
};

// ==========================================
// History Manager — بدون تغيير
// ==========================================
class HistoryManager {
  constructor(limit = 50) {
    this.stack = [];
    this.index = -1;
    this.limit = limit;
  }
  push(action) {
    if (this.index < this.stack.length - 1) this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push({ ...action, timestamp: Date.now() });
    if (this.stack.length > this.limit) this.stack.shift();
    else this.index++;
  }
  undo() {
    if (this.index >= 0) return this.stack[this.index--];
    return null;
  }
  canUndo() { return this.index >= 0; }
}

// ==========================================
// Sub-Components — المُصلحة
// ==========================================

// ✅ StatusCell الآمن — يستخدم getStatusConfig
const StatusCell = React.memo(({ item, onToggle, isSelected }) => {
  const status = item?.status || 'not_started';
  const config = getStatusConfig(status); // ← استخدام الدالة الآمنة
  
  return (
    <button
      onClick={() => onToggle(item?.id)}
      onContextMenu={(e) => { e.preventDefault(); onToggle(item?.id, 'right'); }}
      style={{
        width: '100%', height: '100%', border: 'none', 
        background: isSelected ? '#e3f2fd' : config.color + '20',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '20px', transition: 'all 0.15s', borderRadius: '4px', margin: '2px'
      }}
      title={`${config.label} (${config.pct}%)`}
    >
      {config.icon}
    </button>
  );
});

const DualHeaderCell = ({ code, groupColor }) => {
  const info = BOQ_LABELS[code] || { name: code, short: code, unit: '' };
  return (
    <div style={{ width: CELL_WIDTH, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '2px', boxSizing: 'border-box' }}>
      <div style={{ fontSize: '9px', color: '#555', textAlign: 'center', lineHeight: '1.2', maxHeight: '22px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', direction: 'rtl' }} title={info.name}>
        {info.short}
      </div>
      <div style={{ fontSize: '13px', fontWeight: 'bold', color: groupColor, textAlign: 'center', lineHeight: '1.1' }}>{code}</div>
      <div style={{ fontSize: '8px', color: '#999', textAlign: 'center' }}>{info.unit}</div>
    </div>
  );
};

// ==========================================
// Main Component — المُصلحة بالكامل
// ==========================================
const SpeedEntryMatrix = ({ onBack }) => {
  const [localChanges, setLocalChanges] = useState(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showLabels, setShowLabels] = useState(true);
  const [error, setError] = useState(null); // ← جديد: لالتقاط الأخطاء

  const historyRef = useRef(new HistoryManager());

  const latrines = useLiveQuery(() => db.latrines.toArray(), []);
  const boqItems = useLiveQuery(() => db.boq_items.toArray(), []);

  // ✅ بناء المصفوفة مع التحقق من وجود البنود
  const matrixData = useMemo(() => {
    if (!latrines || !boqItems) return [];
    return latrines.map(latrine => {
      const items = boqItems.filter(item => item.latrine_id === latrine.id);
      const itemMap = {};
      items.forEach(item => { itemMap[item.boq_code] = item; });
      return { latrine, items: itemMap, progress: latrine.overall_pct || 0 };
    });
  }, [latrines, boqItems]);

  const filteredData = useMemo(() => {
    let data = matrixData;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(row => 
        row.latrine.latrine_id.toLowerCase().includes(q) || 
        (row.latrine.beneficiary_hh || '').toLowerCase().includes(q)
      );
    }
    if (filterBlock) data = data.filter(row => row.latrine.block_no === filterBlock);
    return data;
  }, [matrixData, searchQuery, filterBlock]);

  const blocks = useMemo(() => {
    if (!latrines) return [];
    return [...new Set(latrines.map(l => l.block_no).filter(Boolean))].sort();
  }, [latrines]);

  const stats = useMemo(() => {
    const total = filteredData.length;
    const completed = filteredData.filter(r => r.progress >= 99.9).length;
    const inProgress = filteredData.filter(r => r.progress > 0 && r.progress < 99.9).length;
    const notStarted = filteredData.filter(r => r.progress === 0).length;
    return { total, completed, inProgress, notStarted };
  }, [filteredData]);

  // ✅ handleToggle مُصلح — يستخدم getStatusConfig ويتحقق من وجود item
  const handleToggle = useCallback((latrineId, boqCode, direction = 'forward') => {
    try {
      const key = `${latrineId}-${boqCode}`;
      const row = matrixData.find(r => r.latrine.id === latrineId);
      
      // ✅ تحقق أمان: هل الصف موجود؟
      if (!row) {
        console.warn(`Latrine ${latrineId} not found in matrix`);
        return;
      }
      
      const currentItem = row.items[boqCode];
      
      // ✅ تحقق أمان: هل البند موجود؟
      if (!currentItem) {
        console.warn(`BoQ item ${boqCode} not found for latrine ${latrineId}`);
        return;
      }

      const currentStatus = localChanges.get(key)?.status || currentItem.status || 'not_started';
      const config = getStatusConfig(currentStatus); // ← آمن حتى مع الحالات القديمة

      let newStatus;
      if (direction === 'right') {
        // ✅ منطق عكسي صحيح: نعكس دورة الحالات
        const reverseCycle = {
          'not_started': 'rework_required',
          'in_progress': 'not_started',
          'completed': 'in_progress',
          'pending_inspection': 'completed',
          'accepted': 'pending_inspection',
          'rejected': 'accepted',
          'rework_required': 'rejected'
        };
        newStatus = reverseCycle[currentStatus] || 'not_started';
      } else {
        newStatus = config.next;
      }

      const newConfig = getStatusConfig(newStatus);
      const newPct = newConfig.pct;

      historyRef.current.push({ 
        type: 'toggle', 
        latrineId, 
        boqCode, 
        from: currentStatus, 
        to: newStatus, 
        fromPct: currentItem.achievement_pct || 0, 
        toPct: newPct 
      });

      setLocalChanges(prev => new Map(prev).set(key, {
        status: newStatus, 
        achieved_qty: newPct === 100 ? currentItem.planned_qty : newPct === 50 ? (currentItem.planned_qty * 0.5) : newPct === 25 ? (currentItem.planned_qty * 0.25) : 0,
        achievement_pct: newPct, 
        quality_pass: newStatus === 'completed' || newStatus === 'accepted' ? 'pass' : newStatus === 'rejected' ? 'fail' : 'pending', 
        itemId: currentItem.id, 
        latrineId
      }));
    } catch (err) {
      console.error('Toggle error:', err);
      setError('خطأ في تبديل الحالة: ' + err.message);
    }
  }, [matrixData, localChanges]);

  // ✅ handleGroupToggle مُصلح — يتحقق من وجود كل البنود
  const handleGroupToggle = useCallback((latrineId, groupKey) => {
    try {
      const group = GROUPS[groupKey];
      const row = matrixData.find(r => r.latrine.id === latrineId);
      
      if (!row || !group) {
        console.warn('Row or group not found');
        return;
      }

      // ✅ التحقق: هل جميع البنود الموجودة مكتملة؟
      const existingItems = group.codes
        .map(code => row.items[code])
        .filter(Boolean); // ← تصفية البنود غير الموجودة
      
      if (existingItems.length === 0) {
        console.warn(`No items found for group ${groupKey} in latrine ${latrineId}`);
        return;
      }

      const allCompleted = existingItems.every(item => {
        const key = `${latrineId}-${item.boq_code}`;
        const status = localChanges.get(key)?.status || item.status || 'not_started';
        return status === 'completed' || status === 'accepted';
      });

      const targetStatus = allCompleted ? 'not_started' : 'completed';
      const targetPct = allCompleted ? 0 : 100;
      const newChanges = new Map(localChanges);

      existingItems.forEach(item => {
        const key = `${latrineId}-${item.boq_code}`;
        newChanges.set(key, {
          status: targetStatus, 
          achieved_qty: targetPct === 100 ? item.planned_qty : 0,
          achievement_pct: targetPct, 
          quality_pass: targetStatus === 'completed' ? 'pass' : 'pending', 
          itemId: item.id, 
          latrineId
        });
      });

      historyRef.current.push({ type: 'group_toggle', latrineId, groupKey, to: targetStatus });
      setLocalChanges(newChanges);
    } catch (err) {
      console.error('Group toggle error:', err);
      setError('خطأ في التبديل الجماعي: ' + err.message);
    }
  }, [matrixData, localChanges]);

  // ✅ handleUndo مُصلح — يتحقق من وجود العناصر قبل الوصول
  const handleUndo = useCallback(() => {
    try {
      const action = historyRef.current.undo();
      if (!action) return;

      if (action.type === 'toggle') {
        const key = `${action.latrineId}-${action.boqCode}`;
        const row = matrixData.find(r => r.latrine.id === action.latrineId);
        const currentItem = row?.items?.[action.boqCode];

        if (!currentItem) {
          // ✅ إذا لم يعد العنصر موجوداً، نحذف التغيير فقط
          const newChanges = new Map(localChanges);
          newChanges.delete(key);
          setLocalChanges(newChanges);
          return;
        }

        if (action.from === currentItem?.status) {
          const newChanges = new Map(localChanges);
          newChanges.delete(key);
          setLocalChanges(newChanges);
        } else {
          const fromConfig = getStatusConfig(action.from);
          setLocalChanges(prev => new Map(prev).set(key, {
            status: action.from, 
            achieved_qty: fromConfig.pct === 100 ? currentItem.planned_qty : fromConfig.pct === 50 ? (currentItem.planned_qty * 0.5) : fromConfig.pct === 25 ? (currentItem.planned_qty * 0.25) : 0,
            achievement_pct: fromConfig.pct, 
            quality_pass: action.from === 'completed' || action.from === 'accepted' ? 'pass' : action.from === 'rejected' ? 'fail' : 'pending', 
            itemId: currentItem.id, 
            latrineId: action.latrineId
          }));
        }
      }
    } catch (err) {
      console.error('Undo error:', err);
      setError('خطأ في التراجع: ' + err.message);
    }
  }, [matrixData, localChanges]);

  // ✅ handleSaveDraft مُصلح — معالجة الأخطاء المحتملة
  const handleSaveDraft = useCallback(async () => {
    if (localChanges.size === 0) return;
    const changesCount = localChanges.size;
    setIsSaving(true);
    setError(null);

    try {
      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        for (const [key, change] of localChanges) {
          // ✅ التحقق من وجود البند قبل التحديث
          const existingItem = await db.boq_items.get(change.itemId);
          if (!existingItem) {
            console.warn(`Item ${change.itemId} not found, skipping`);
            continue;
          }
          
          await db.boq_items.update(change.itemId, {
            achieved_qty: change.achieved_qty, 
            status: change.status,
            achievement_pct: change.achievement_pct, 
            quality_pass: change.quality_pass
          });
          await pushToSyncQueue('UPDATE_BOQ', {
            id: change.itemId, 
            achieved_qty: change.achieved_qty,
            status: change.status, 
            quality_pass: change.quality_pass, 
            latrine_id: change.latrineId
          });
        }
      });

      setLocalChanges(new Map());
      historyRef.current = new HistoryManager();
      setSaveMessage({ type: 'success', text: `تم حفظ ${changesCount} تعديل في المسودة` });
    } catch (err) {
      console.error('Save error:', err);
      setSaveMessage({ type: 'error', text: 'فشل الحفظ: ' + err.message });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }, [localChanges]);

  // ✅ اختصارات لوحة المفاتيح — مع Error Boundary ضمني
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') { e.preventDefault(); handleUndo(); }
        if (e.key === 's') { e.preventDefault(); handleSaveDraft(); }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleSaveDraft]);

  // ✅ InnerElement — بدون تغيير جوهري
  const InnerElement = useMemo(() => React.forwardRef(({ children, ...rest }, ref) => {
    return (
      <div ref={ref} {...rest} style={{ ...rest.style, width: `${ROW_WIDTH}px`, height: `${parseFloat(rest.style.height) + HEADER_HEIGHT}px`, direction: 'rtl' }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 20, height: HEADER_HEIGHT, display: 'flex', background: '#f8f9fa', borderBottom: '2px solid #dee2e6', width: '100%' }}>
          <div style={{ width: STICKY_COL_WIDTH, minWidth: STICKY_COL_WIDTH, position: 'sticky', right: 0, zIndex: 21, background: '#f8f9fa', display: 'flex', alignItems: 'center', padding: '0 12px', borderLeft: '2px solid #dee2e6', boxSizing: 'border-box', fontSize: '13px', fontWeight: 'bold', color: '#495057' }}>
            الحمام / المستفيد
          </div>
          {Object.entries(GROUPS).map(([groupKey, group]) => (
            <div key={groupKey} style={{ display: 'flex', flexShrink: 0 }}>
              <div style={{ width: `${GROUP_TOGGLE_WIDTH}px`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: group.color + '08', borderLeft: `1px solid ${group.color}20` }}>
                <div style={{ fontSize: '9px', color: group.color, fontWeight: 'bold' }}>مجموعة</div>
                <div style={{ fontSize: '14px', color: group.color, fontWeight: 'bold' }}>{groupKey}</div>
              </div>
              {group.codes.map(code => (
                <div key={code} style={{ width: CELL_WIDTH, borderLeft: '1px solid #e0e0e0', height: '100%' }}>
                  {showLabels ? <DualHeaderCell code={code} groupColor={group.color} /> : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px', fontWeight: 'bold', color: group.color }}>{code}</div>}
                </div>
              ))}
            </div>
          ))}
        </div>
        {React.Children.map(children, child => {
          if (!child) return null;
          return React.cloneElement(child, {
            style: { ...child.props.style, top: parseFloat(child.props.style.top) + HEADER_HEIGHT }
          });
        })}
      </div>
    );
  }), [showLabels]);

  // ✅ VirtualRow مُصلح — يتحقق من وجود البنود
  const VirtualRow = useCallback(({ index, style }) => {
    const row = filteredData[index];
    if (!row) return null; // ✅ أمان إضافي
    
    const latrine = row.latrine;
    const rowBg = index % 2 === 0 ? '#fafafa' : 'white';

    return (
      <div style={{ ...style, width: `${ROW_WIDTH}px`, display: 'flex', alignItems: 'center', borderBottom: '1px solid #e0e0e0', background: rowBg, boxSizing: 'border-box' }}>
        <div style={{
          width: STICKY_COL_WIDTH, minWidth: STICKY_COL_WIDTH, padding: '8px 12px', borderLeft: '2px solid #e0e0e0',
          background: rowBg, position: 'sticky', right: 0, zIndex: 10, flexShrink: 0, boxSizing: 'border-box',
          alignSelf: 'stretch', display: 'flex', flexDirection: 'column', justifyContent: 'center'
        }}>
          <div style={{ fontWeight: 'bold', color: '#1F4E78', fontSize: '13px' }}>{latrine.latrine_id}</div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>{latrine.beneficiary_hh || '—'}</div>
          <div style={{ fontSize: '10px', color: '#999' }}>{latrine.block_no} | {row.progress.toFixed(0)}%</div>
        </div>

        {Object.entries(GROUPS).map(([groupKey, group]) => (
          <div key={groupKey} style={{ display: 'flex', flexShrink: 0 }}>
            <div style={{ width: `${GROUP_TOGGLE_WIDTH}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', background: group.color + '10', flexShrink: 0 }}>
              <button
                onClick={() => handleGroupToggle(latrine.id, groupKey)}
                style={{ width: '24px', height: '24px', border: `2px solid ${group.color}`, borderRadius: '4px', background: 'white', cursor: 'pointer', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                {group.codes.every(code => {
                  const item = row.items[code];
                  if (!item) return true; // ✅ البند غير موجود = نعتبره مكتمل (لا يؤثر)
                  const key = `${latrine.id}-${code}`;
                  const status = localChanges.get(key)?.status || item.status || 'not_started';
                  return status === 'completed' || status === 'accepted';
                }) ? '✓' : '+'}
              </button>
            </div>
            {group.codes.map(code => {
              const item = row.items[code];
              const key = `${latrine.id}-${code}`;
              const isModified = localChanges.has(key);
              
              // ✅ إذا لم يكن البند موجوداً، نعرض خلية فارغة
              if (!item) return <div key={code} style={{ width: CELL_WIDTH, flexShrink: 0 }} />;
              
              return (
                <div key={code} style={{ width: CELL_WIDTH, padding: '2px', flexShrink: 0, boxSizing: 'border-box' }}>
                  <StatusCell 
                    item={{ ...item, status: localChanges.get(key)?.status || item.status }} 
                    onToggle={() => handleToggle(latrine.id, code)} 
                    isSelected={isModified} 
                  />
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  }, [filteredData, localChanges, handleToggle, handleGroupToggle]);

  // ✅ Error Display — عرض الأخطاء بدلاً من الشاشة البيضاء
  if (error) {
    return (
      <div style={{ direction: 'rtl', padding: '40px', textAlign: 'center', background: '#ffebee', color: '#c62828' }}>
        <h2>⚠️ خطأ في الإدخال السريع</h2>
        <p>{error}</p>
        <button onClick={() => setError(null)} style={{ padding: '10px 20px', background: '#c62828', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (!latrines || !boqItems) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', direction: 'rtl' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
        <h3>جاري بناء مصفوفة الإدخال السريع...</h3>
      </div>
    );
  }

  return (
    <div style={{ direction: 'rtl', height: 'calc(100vh - 60px)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ background: '#1F4E78', color: 'white', padding: '15px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>⚡ الإدخال السريع (Speed Entry)</h2>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
            {stats.total} حمام | {stats.completed} مكتمل | {stats.inProgress} قيد العمل | {stats.notStarted} لم يبدأ
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <input type="text" placeholder="🔍 بحث برقم أو اسم..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ padding: '8px 12px', borderRadius: '4px', border: 'none', width: '200px', fontSize: '13px' }} />
          <select value={filterBlock} onChange={e => setFilterBlock(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: 'none', fontSize: '13px' }}>
            <option value="">كل المربعات</option>
            {blocks.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <button onClick={() => setShowLabels(!showLabels)} style={{ padding: '8px 12px', background: showLabels ? 'rgba(255,215,0,0.3)' : 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}>
            {showLabels ? '🏷️ الأسماء: ON' : '🏷️ الأسماء: OFF'}
          </button>
          <button onClick={handleUndo} disabled={!historyRef.current.canUndo()} style={{ padding: '8px 16px', background: historyRef.current.canUndo() ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', cursor: historyRef.current.canUndo() ? 'pointer' : 'not-allowed', fontSize: '13px' }}>
            ↩️ تراجع
          </button>
          <button onClick={() => localChanges.size > 0 ? setShowConfirmModal(true) : null} disabled={localChanges.size === 0 || isSaving} style={{ padding: '8px 20px', background: localChanges.size > 0 ? '#27ae60' : '#95a5a6', color: 'white', border: 'none', borderRadius: '4px', cursor: localChanges.size > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '5px' }}>
            {isSaving ? '⏳' : '💾'} حفظ ({localChanges.size})
          </button>
          <button onClick={onBack} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '4px', cursor: 'pointer' }}>← عودة</button>
        </div>
      </div>

      {saveMessage && (
        <div style={{ padding: '10px 20px', background: saveMessage.type === 'success' ? '#d4edda' : '#f8d7da', color: saveMessage.type === 'success' ? '#155724' : '#721c24', fontWeight: 'bold', textAlign: 'center' }}>
          {saveMessage.type === 'success' ? '✅' : '❌'} {saveMessage.text}
        </div>
      )}

      {/* Virtualized Table */}
      <div style={{ flex: 1, position: 'relative', background: 'white' }}>
        <AutoSizer>
          {({ height, width }) => (
            <List
              height={height}
              itemCount={filteredData.length}
              itemSize={ITEM_HEIGHT}
              width={width}
              direction="rtl"
              overscanCount={5}
              innerElementType={InnerElement}
            >
              {VirtualRow}
            </List>
          )}
        </AutoSizer>
      </div>

      {/* Legend */}
      <div style={{ background: '#f8f9fa', padding: '10px 20px', borderTop: '1px solid #dee2e6', display: 'flex', gap: '15px', fontSize: '11px', color: '#666', flexWrap: 'wrap', alignItems: 'center' }}>
        <span><strong>الاختصارات:</strong></span>
        <span>🖱️ نقرة = تبديل الحالة</span>
        <span>🖱️🖱️ نقرة يمين = عكس الاتجاه</span>
        <span>⌨️ Ctrl+Z = تراجع</span>
        <span>⌨️ Ctrl+S = حفظ</span>
        
        <div style={{ marginRight: 'auto', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', borderRight: '2px solid #dee2e6', paddingRight: '15px' }}>
          <span style={{ fontWeight: 'bold', color: '#333' }}>البنود:</span>
          {Object.entries(BOQ_LABELS).map(([code, info]) => (
            <span key={code} style={{ background: GROUPS[code[0]]?.color + '15', color: GROUPS[code[0]]?.color, padding: '2px 6px', borderRadius: '3px', fontSize: '10px', whiteSpace: 'nowrap', border: `1px solid ${GROUPS[code[0]]?.color}30` }} title={info.name}>
              <strong>{code}</strong> {info.short}
            </span>
          ))}
        </div>
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'white', padding: '30px', borderRadius: '8px', maxWidth: '400px', textAlign: 'center' }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#1F4E78' }}>💾 حفظ التعديلات</h3>
            <p>هل أنت متأكد من حفظ {localChanges.size} تعديل؟</p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
              <button onClick={() => setShowConfirmModal(false)} style={{ padding: '10px 20px', background: '#ecf0f1', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>إلغاء</button>
              <button onClick={() => { setShowConfirmModal(false); handleSaveDraft(); }} style={{ padding: '10px 20px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>✅ تأكيد الحفظ</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpeedEntryMatrix;
