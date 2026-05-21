import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db';
import { pushToSyncQueue } from '../syncEngine';
import { FixedSizeList as List } from 'react-window';
import AutoSizer from 'react-virtualized-auto-sizer';

// ==========================================
// Constants & Configuration
// ==========================================
const ITEM_HEIGHT = 60;
const HEADER_HEIGHT = 50;
const STICKY_COL_WIDTH = 200;
const CELL_WIDTH = 80;

const STATUS_CYCLE = {
  'not_started': { next: 'in_progress', icon: '⬜', label: 'لم يبدأ', color: '#e0e0e0', pct: 0 },
  'in_progress': { next: 'completed', icon: '🔄', label: 'قيد العمل', color: '#ffc107', pct: 50 },
  'completed': { next: 'pending_inspection', icon: '✅', label: 'مكتمل', color: '#4caf50', pct: 100 },
  'pending_inspection': { next: 'not_started', icon: '🔍', label: 'بانتظار الفحص', color: '#2196f3', pct: 100 }
};

const GROUPS = {
  'A': { label: 'أعمال البناء', codes: ['A1','A2','A3','A4','A5','A6'], color: '#1F4E78' },
  'B': { label: 'الصرفيات', codes: ['B1','B2','B3'], color: '#27ae60' },
  'C': { label: 'التشطيب', codes: ['C1','C2','C3','C4'], color: '#e74c3c' }
};

// ==========================================
// Undo/Redo Manager (Best Practice)
// ==========================================
class HistoryManager {
  constructor(limit = 50) {
    this.stack = [];
    this.index = -1;
    this.limit = limit;
  }

  push(action) {
    // إزالة العمليات المستقبلية إذا كنا في منتصف الـ stack
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }

    this.stack.push({
      ...action,
      timestamp: Date.now()
    });

    // الحفاظ على الحد الأقصى
    if (this.stack.length > this.limit) {
      this.stack.shift();
    } else {
      this.index++;
    }
  }

  undo() {
    if (this.index >= 0) {
      return this.stack[this.index--];
    }
    return null;
  }

  redo() {
    if (this.index < this.stack.length - 1) {
      return this.stack[++this.index];
    }
    return null;
  }

  canUndo() { return this.index >= 0; }
  canRedo() { return this.index < this.stack.length - 1; }
}

// ==========================================
// Sub-Components
// ==========================================

const StatusCell = React.memo(({ item, onToggle, isSelected }) => {
  const status = item?.status || 'not_started';
  const config = STATUS_CYCLE[status];

  return (
    <button
      onClick={() => onToggle(item?.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        onToggle(item?.id, 'right');
      }}
      style={{
        width: '100%',
        height: '100%',
        border: 'none',
        background: isSelected ? '#e3f2fd' : config.color + '20',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '20px',
        transition: 'all 0.15s',
        borderRadius: '4px',
        margin: '2px'
      }}
      title={`${config.label} (${config.pct}%)`}
    >
      {config.icon}
    </button>
  );
});

const GroupHeader = ({ groupKey, group, onToggleAll, allCompleted }) => (
  <div style={{
    background: group.color,
    color: 'white',
    padding: '8px 4px',
    textAlign: 'center',
    fontSize: '12px',
    fontWeight: 'bold',
    cursor: 'pointer',
    userSelect: 'none',
    position: 'relative'
  }} onClick={() => onToggleAll(groupKey)}>
    <div>{group.label}</div>
    <div style={{ fontSize: '10px', opacity: 0.8 }}>
      {allCompleted ? '✓ الكل' : 'تأشير الكل'}
    </div>
  </div>
);

// ==========================================
// Main Component
// ==========================================
const SpeedEntryMatrix = ({ onBack }) => {
  // --- State Management ---
  const [localChanges, setLocalChanges] = useState(new Map());
  const [selectedCell, setSelectedCell] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBlock, setFilterBlock] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const historyRef = useRef(new HistoryManager());
  const listRef = useRef(null);

  // --- Live Queries (Optimized) ---
  const latrines = useLiveQuery(() => db.latrines.toArray(), []);
  const boqItems = useLiveQuery(() => db.boq_items.toArray(), []);

  // --- Build Matrix Data ---
  const matrixData = useMemo(() => {
    if (!latrines || !boqItems) return [];

    return latrines.map(latrine => {
      const items = boqItems.filter(item => item.latrine_id === latrine.id);
      const itemMap = {};

      // تجميع البنود حسب الكود
      items.forEach(item => {
        itemMap[item.boq_code] = item;
      });

      return {
        latrine,
        items: itemMap,
        // حساب نسبة إنجاز الحمام
        progress: latrine.overall_pct || 0
      };
    });
  }, [latrines, boqItems]);

  // --- Filtering ---
  const filteredData = useMemo(() => {
    let data = matrixData;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(row => 
        row.latrine.latrine_id.toLowerCase().includes(q) ||
        (row.latrine.beneficiary_hh || '').toLowerCase().includes(q)
      );
    }

    if (filterBlock) {
      data = data.filter(row => row.latrine.block_no === filterBlock);
    }

    return data;
  }, [matrixData, searchQuery, filterBlock]);

  // --- Unique Blocks for Filter ---
  const blocks = useMemo(() => {
    if (!latrines) return [];
    return [...new Set(latrines.map(l => l.block_no).filter(Boolean))].sort();
  }, [latrines]);

  // --- Statistics ---
  const stats = useMemo(() => {
    const total = filteredData.length;
    const completed = filteredData.filter(r => r.progress >= 99.9).length;
    const inProgress = filteredData.filter(r => r.progress > 0 && r.progress < 99.9).length;
    const notStarted = filteredData.filter(r => r.progress === 0).length;

    return { total, completed, inProgress, notStarted };
  }, [filteredData]);

  // --- Toggle Logic ---
  const handleToggle = useCallback((latrineId, boqCode, direction = 'forward') => {
    const key = `${latrineId}-${boqCode}`;
    const currentItem = matrixData.find(r => r.latrine.id === latrineId)?.items[boqCode];

    if (!currentItem) return;

    const currentStatus = localChanges.get(key)?.status || currentItem.status || 'not_started';
    const config = STATUS_CYCLE[currentStatus];

    let newStatus;
    if (direction === 'right') {
      // Right-click = reverse cycle
      const reverseMap = {
        'not_started': 'pending_inspection',
        'pending_inspection': 'completed',
        'completed': 'in_progress',
        'in_progress': 'not_started'
      };
      newStatus = reverseMap[currentStatus];
    } else {
      newStatus = config.next;
    }

    const newPct = STATUS_CYCLE[newStatus].pct;

    // Save to history
    historyRef.current.push({
      type: 'toggle',
      latrineId,
      boqCode,
      from: currentStatus,
      to: newStatus,
      fromPct: currentItem.achievement_pct || 0,
      toPct: newPct
    });

    // Update local changes
    setLocalChanges(prev => new Map(prev).set(key, {
      status: newStatus,
      achieved_qty: newPct === 100 ? currentItem.planned_qty : 
                    newPct === 50 ? (currentItem.planned_qty * 0.5) : 0,
      achievement_pct: newPct,
      quality_pass: newStatus === 'completed' ? 'pass' : 'pending',
      itemId: currentItem.id,
      latrineId
    }));
  }, [matrixData, localChanges]);

  // --- Group Toggle (Toggle All in A/B/C) ---
  const handleGroupToggle = useCallback((latrineId, groupKey) => {
    const group = GROUPS[groupKey];
    const row = matrixData.find(r => r.latrine.id === latrineId);
    if (!row) return;

    // هل جميع البنود في هذه المجموعة مكتملة؟
    const allCompleted = group.codes.every(code => {
      const item = row.items[code];
      if (!item) return true;
      const key = `${latrineId}-${code}`;
      const currentStatus = localChanges.get(key)?.status || item.status || 'not_started';
      return currentStatus === 'completed';
    });

    // إذا الكل مكتمل → نُعيد للصفر، وإلا → نُكمل الكل
    const targetStatus = allCompleted ? 'not_started' : 'completed';
    const targetPct = allCompleted ? 0 : 100;

    const newChanges = new Map(localChanges);

    group.codes.forEach(code => {
      const item = row.items[code];
      if (!item) return;

      const key = `${latrineId}-${code}`;
      newChanges.set(key, {
        status: targetStatus,
        achieved_qty: targetPct === 100 ? item.planned_qty : 0,
        achievement_pct: targetPct,
        quality_pass: targetStatus === 'completed' ? 'pass' : 'pending',
        itemId: item.id,
        latrineId
      });
    });

    historyRef.current.push({
      type: 'group_toggle',
      latrineId,
      groupKey,
      to: targetStatus
    });

    setLocalChanges(newChanges);
  }, [matrixData, localChanges]);

  // --- Undo/Redo ---
  const handleUndo = useCallback(() => {
    const action = historyRef.current.undo();
    if (!action) return;

    if (action.type === 'toggle') {
      const key = `${action.latrineId}-${action.boqCode}`;
      const currentItem = matrixData.find(r => r.latrine.id === action.latrineId)?.items[action.boqCode];

      if (action.from === currentItem?.status) {
        // Remove local change if it matches original
        const newChanges = new Map(localChanges);
        newChanges.delete(key);
        setLocalChanges(newChanges);
      } else {
        setLocalChanges(prev => new Map(prev).set(key, {
          status: action.from,
          achieved_qty: action.fromPct === 100 ? currentItem.planned_qty : 
                        action.fromPct === 50 ? (currentItem.planned_qty * 0.5) : 0,
          achievement_pct: action.fromPct,
          quality_pass: action.from === 'completed' ? 'pass' : 'pending',
          itemId: currentItem.id,
          latrineId: action.latrineId
        }));
      }
    }
  }, [matrixData, localChanges]);

  // --- Save Draft (Local IndexedDB) ---
  const handleSaveDraft = useCallback(async () => {
    if (localChanges.size === 0) return;

    setIsSaving(true);
    try {
      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        for (const [key, change] of localChanges) {
          // تحديث boq_items محلياً
          await db.boq_items.update(change.itemId, {
            achieved_qty: change.achieved_qty,
            status: change.status,
            achievement_pct: change.achievement_pct,
            quality_pass: change.quality_pass
          });

          // إضافة لطابور المزامنة
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
      setSaveMessage({ type: 'success', text: `تم حفظ ${localChanges.size} تعديل في المسودة` });
    } catch (err) {
      setSaveMessage({ type: 'error', text: 'فشل الحفظ: ' + err.message });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveMessage(null), 3000);
    }
  }, [localChanges]);

  // --- Keyboard Navigation (Best Practice) ---
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
          e.preventDefault();
          handleUndo();
        }
        if (e.key === 's') {
          e.preventDefault();
          handleSaveDraft();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleSaveDraft]);

  // --- Row Renderer for Virtualization ---
  const RowRenderer = useCallback(({ index, style }) => {
    const row = filteredData[index];
    if (!row) return null;

    const latrine = row.latrine;

    return (
      <div style={{
        ...style,
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid #e0e0e0',
        background: index % 2 === 0 ? '#fafafa' : 'white'
      }}>
        {/* Sticky Column: Latrine Info */}
        <div style={{
          width: STICKY_COL_WIDTH,
          minWidth: STICKY_COL_WIDTH,
          padding: '8px 12px',
          borderLeft: '2px solid #e0e0e0',
          background: 'inherit',
          position: 'sticky',
          right: 0,
          zIndex: 2
        }}>
          <div style={{ fontWeight: 'bold', color: '#1F4E78', fontSize: '13px' }}>
            {latrine.latrine_id}
          </div>
          <div style={{ fontSize: '11px', color: '#666', marginTop: '2px' }}>
            {latrine.beneficiary_hh || '—'}
          </div>
          <div style={{ fontSize: '10px', color: '#999' }}>
            {latrine.block_no} | {row.progress.toFixed(0)}%
          </div>
        </div>

        {/* Group Columns */}
        {Object.entries(GROUPS).map(([groupKey, group]) => (
          <div key={groupKey} style={{ display: 'flex' }}>
            {/* Group Toggle Header */}
            <div style={{
              width: '30px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: group.color + '10'
            }}>
              <button
                onClick={() => handleGroupToggle(latrine.id, groupKey)}
                style={{
                  width: '24px',
                  height: '24px',
                  border: `2px solid ${group.color}`,
                  borderRadius: '4px',
                  background: 'white',
                  cursor: 'pointer',
                  fontSize: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
                title={`تأشير مجموعة ${group.label}`}
              >
                {group.codes.every(code => {
                  const item = row.items[code];
                  if (!item) return true;
                  const key = `${latrine.id}-${code}`;
                  const status = localChanges.get(key)?.status || item.status || 'not_started';
                  return status === 'completed';
                }) ? '✓' : '+'}
              </button>
            </div>

            {/* Individual Items */}
            {group.codes.map(code => {
              const item = row.items[code];
              const key = `${latrine.id}-${code}`;
              const isModified = localChanges.has(key);

              if (!item) return <div key={code} style={{ width: CELL_WIDTH }} />;

              return (
                <div key={code} style={{ width: CELL_WIDTH, padding: '2px' }}>
                  <StatusCell
                    item={{
                      ...item,
                      status: localChanges.get(key)?.status || item.status
                    }}
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

  // --- Loading State ---
  if (!latrines || !boqItems) {
    return (
      <div style={{ textAlign: 'center', padding: '60px', direction: 'rtl' }}>
        <div style={{ fontSize: '48px', marginBottom: '20px' }}>⏳</div>
        <h3>جاري بناء مصفوفة الإدخال السريع...</h3>
        <p style={{ color: '#7f8c8d' }}>يتم تحميل {latrines?.length || 0} حمام و {boqItems?.length || 0} بند</p>
      </div>
    );
  }

  return (
    <div style={{ direction: 'rtl', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        background: '#1F4E78',
        color: 'white',
        padding: '15px 20px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '10px'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '20px' }}>⚡ الإدخال السريع (Speed Entry)</h2>
          <p style={{ margin: '5px 0 0 0', fontSize: '12px', opacity: 0.8 }}>
            {stats.total} حمام | {stats.completed} مكتمل | {stats.inProgress} قيد العمل | {stats.notStarted} لم يبدأ
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          {/* Search */}
          <input
            type="text"
            placeholder="🔍 بحث برقم أو اسم..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: '4px',
              border: 'none',
              width: '200px',
              fontSize: '13px'
            }}
          />

          {/* Block Filter */}
          <select
            value={filterBlock}
            onChange={e => setFilterBlock(e.target.value)}
            style={{
              padding: '8px',
              borderRadius: '4px',
              border: 'none',
              fontSize: '13px'
            }}
          >
            <option value="">كل المربعات</option>
            {blocks.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          {/* Undo */}
          <button
            onClick={handleUndo}
            disabled={!historyRef.current.canUndo()}
            style={{
              padding: '8px 16px',
              background: historyRef.current.canUndo() ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)',
              color: 'white',
              border: '1px solid rgba(255,255,255,0.3)',
              borderRadius: '4px',
              cursor: historyRef.current.canUndo() ? 'pointer' : 'not-allowed',
              fontSize: '13px'
            }}
            title="تراجع (Ctrl+Z)"
          >
            ↩️ تراجع
          </button>

          {/* Save Draft */}
          <button
            onClick={() => localChanges.size > 0 ? setShowConfirmModal(true) : null}
            disabled={localChanges.size === 0 || isSaving}
            style={{
              padding: '8px 20px',
              background: localChanges.size > 0 ? '#27ae60' : '#95a5a6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: localChanges.size > 0 ? 'pointer' : 'not-allowed',
              fontWeight: 'bold',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              gap: '5px'
            }}
          >
            {isSaving ? '⏳' : '💾'} 
            حفظ ({localChanges.size})
          </button>

          <button onClick={onBack} style={{
            padding: '8px 16px',
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.3)',
            borderRadius: '4px',
            cursor: 'pointer'
          }}>
            ← عودة
          </button>
        </div>
      </div>

      {/* Save Message */}
      {saveMessage && (
        <div style={{
          padding: '10px 20px',
          background: saveMessage.type === 'success' ? '#d4edda' : '#f8d7da',
          color: saveMessage.type === 'success' ? '#155724' : '#721c24',
          fontWeight: 'bold',
          textAlign: 'center'
        }}>
          {saveMessage.type === 'success' ? '✅' : '❌'} {saveMessage.text}
        </div>
      )}

      {/* Column Headers */}
      <div style={{
        display: 'flex',
        background: '#f8f9fa',
        borderBottom: '2px solid #dee2e6',
        height: HEADER_HEIGHT,
        alignItems: 'center',
        fontSize: '12px',
        fontWeight: 'bold',
        color: '#495057'
      }}>
        <div style={{ width: STICKY_COL_WIDTH, padding: '0 12px', textAlign: 'right' }}>
          الحمام / المستفيد
        </div>

        {Object.entries(GROUPS).map(([groupKey, group]) => (
          <div key={groupKey} style={{ display: 'flex' }}>
            <div style={{ width: '30px', textAlign: 'center', color: group.color }}>
              {groupKey}
            </div>
            {group.codes.map(code => (
              <div key={code} style={{ 
                width: CELL_WIDTH, 
                textAlign: 'center',
                fontSize: '11px',
                color: group.color
              }}>
                {code}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Virtualized List */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AutoSizer>
          {({ height, width }) => (
            <List
              ref={listRef}
              height={height}
              itemCount={filteredData.length}
              itemSize={ITEM_HEIGHT}
              width={width}
            >
              {RowRenderer}
            </List>
          )}
        </AutoSizer>
      </div>

      {/* Footer Legend */}
      <div style={{
        background: '#f8f9fa',
        padding: '10px 20px',
        borderTop: '1px solid #dee2e6',
        display: 'flex',
        gap: '20px',
        fontSize: '12px',
        color: '#666',
        flexWrap: 'wrap'
      }}>
        <span><strong>الاختصارات:</strong></span>
        <span>🖱️ نقرة = تبديل الحالة</span>
        <span>🖱️🖱️ نقرة يمين = عكس الاتجاه</span>
        <span>⌨️ Ctrl+Z = تراجع</span>
        <span>⌨️ Ctrl+S = حفظ</span>
        <span style={{ marginRight: 'auto' }}>
          <strong>المفتاح:</strong>
          <span style={{ margin: '0 5px' }}>⬜ لم يبدأ</span>
          <span style={{ margin: '0 5px' }}>🔄 قيد العمل</span>
          <span style={{ margin: '0 5px' }}>✅ مكتمل</span>
          <span style={{ margin: '0 5px' }}>🔍 بانتظار الفحص</span>
        </span>
      </div>

      {/* Confirm Modal */}
      {showConfirmModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: 'white',
            padding: '30px',
            borderRadius: '8px',
            maxWidth: '400px',
            textAlign: 'center'
          }}>
            <h3 style={{ margin: '0 0 15px 0', color: '#1F4E78' }}>💾 حفظ التعديلات</h3>
            <p>هل أنت متأكد من حفظ {localChanges.size} تعديل؟</p>
            <p style={{ fontSize: '12px', color: '#7f8c8d' }}>
              سيتم حفظها محلياً وإضافتها لطابور المزامنة
            </p>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center', marginTop: '20px' }}>
              <button
                onClick={() => setShowConfirmModal(false)}
                style={{
                  padding: '10px 20px',
                  background: '#ecf0f1',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                إلغاء
              </button>
              <button
                onClick={() => {
                  setShowConfirmModal(false);
                  handleSaveDraft();
                }}
                style={{
                  padding: '10px 20px',
                  background: '#27ae60',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                ✅ تأكيد الحفظ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SpeedEntryMatrix;
