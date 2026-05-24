
import React, { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/index.js';
import { pushToSyncQueue } from '../syncEngine';

const qualityColors = { pass: '#C6EFCE', fail: '#FFC7CE', pending: '#FFF2CC' };

const itemStatuses = [
  { value: 'not_started', label: 'Ù„Ù… ÙŠØ¨Ø¯Ø£' },
  { value: 'in_progress', label: 'Ù‚ÙŠØ¯ Ø§Ù„Ø¹Ù…Ù„' },
  { value: 'completed', label: 'Ù…ÙƒØªÙ…Ù„' },
  { value: 'pending_inspection', label: 'Ø¨Ø§Ù†ØªØ¸Ø§Ø± Ø§Ù„ÙØ­Øµ' },
  { value: 'rework_required', label: 'ÙŠØ­ØªØ§Ø¬ Ø¥Ø¹Ø§Ø¯Ø© Ø¹Ù…Ù„' },
  { value: 'rejected', label: 'Ù…Ø±ÙÙˆØ¶ Ù†Ù‡Ø§Ø¦ÙŠØ§Ù‹' }
];

const BoqUpdater = ({ latrineId, onBack, onOpenRemarks }) => {
  const latrine = useLiveQuery(() => db.latrines.get(latrineId), [latrineId]);
  const boqItems = useLiveQuery(() => db.boq_items.where({ latrine_id: latrineId }).toArray(), [latrineId]);
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);

  // ØªÙ†Ø¸ÙŠÙ Ø§Ù„ØªØ­Ø¯ÙŠØ¯ Ø¹Ù†Ø¯ ØªØºÙŠÙŠØ± Ø§Ù„Ø­Ù…Ø§Ù…
  useEffect(() => {
    setSelectedItems([]);
  }, [latrineId]);

  // ØªÙ†Ø¸ÙŠÙ Ø±Ø³Ø§Ù„Ø© Ø§Ù„Ø®Ø·Ø£ ØªÙ„Ù‚Ø§Ø¦ÙŠØ§Ù‹
  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  const showError = (msg) => setErrorMsg(msg);

  // âœ… ÙŠÙØ±Ø¬Ø¹ true Ø¹Ù†Ø¯ Ø§Ù„Ù†Ø¬Ø§Ø­ØŒ false Ø¹Ù†Ø¯ Ø§Ù„ÙØ´Ù„ (Ù„Ù„ØªØ­ÙƒÙ… ÙÙŠ DOM)
  const handleUpdate = async (item, newQty, newStatus, newQuality) => {
    setUpdatingId(item.id);
    try {
      const achieved = parseFloat(newQty);
      if (isNaN(achieved) || achieved < 0 || achieved > item.planned_qty) {
        showError(`Ø§Ù„ÙƒÙ…ÙŠØ© ØºÙŠØ± ØµØ§Ù„Ø­Ø© Ù„Ù„Ø¨Ù†Ø¯ ${item.boq_code}. Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰: ${item.planned_qty}`);
        return false;
      }

      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        await db.boq_items.update(item.id, {
          achieved_qty: achieved,
          status: newStatus,
          quality_pass: newQuality
        });
        await pushToSyncQueue('UPDATE_BOQ', {
          id: item.id,
          achieved_qty: achieved,
          status: newStatus,
          quality_pass: newQuality,
          latrine_id: latrineId
        });
      });
      return true;
    } catch (error) {
      console.error('BoqUpdater update error:', error);
      showError('Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø­ÙØ¸ Ø§Ù„Ù…Ø­Ù„ÙŠ. ÙŠØ±Ø¬Ù‰ Ø§Ù„Ù…Ø­Ø§ÙˆÙ„Ø© Ù…Ø¬Ø¯Ø¯Ø§Ù‹.');
      return false;
    } finally {
      setUpdatingId(null);
    }
  };

  const toggleSelectAll = (e) => {
    if (e.target.checked && boqItems?.length) {
      setSelectedItems(boqItems.map(i => i.id));
    } else {
      setSelectedItems([]);
    }
  };

  const toggleSelect = (id) => {
    setSelectedItems(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  // âœ… ØªØ­Ø¯ÙŠØ« DOM ÙÙ‚Ø· Ø¨Ø¹Ø¯ Ù†Ø¬Ø§Ø­ handleUpdate
  const handleBulkComplete = async () => {
    if (!selectedItems.length) return;
    if (!window.confirm(`Ù‡Ù„ Ø£Ù†Øª Ù…ØªØ£ÙƒØ¯ Ù…Ù† Ø¥ÙƒÙ…Ø§Ù„ ${selectedItems.length} Ø¨Ù†Ø¯ Ù…Ø­Ø¯Ø¯ Ø¨Ù†Ø³Ø¨Ø© 100% ÙƒÙ…Ù‚Ø¨ÙˆÙ„ØŸ`)) return;

    const itemsToProcess = boqItems.filter(i => selectedItems.includes(i.id));
    let success = false;

    try {
      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        for (const item of itemsToProcess) {
          await db.boq_items.update(item.id, {
            achieved_qty: item.planned_qty,
            status: 'completed',
            quality_pass: 'pass'
          });
          await pushToSyncQueue('UPDATE_BOQ', {
            id: item.id,
            achieved_qty: item.planned_qty,
            status: 'completed',
            quality_pass: 'pass',
            latrine_id: latrineId
          });
        }
      });
      success = true;
    } catch (error) {
      console.error('Bulk complete error:', error);
      showError('Ø®Ø·Ø£ ÙÙŠ Ø§Ù„ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¬Ù…Ø§Ø¹ÙŠ.');
    }

    // ØªØ­Ø¯ÙŠØ« DOM ÙÙ‚Ø· Ø¥Ø°Ø§ Ù†Ø¬Ø­Øª Ø§Ù„Ù…Ø¹Ø§Ù…Ù„Ø© Ø¨Ø§Ù„ÙƒØ§Ù…Ù„
    if (success) {
      for (const item of itemsToProcess) {
        const qtyInput = document.getElementById(`qty-${item.id}`);
        const statusSelect = document.getElementById(`status-${item.id}`);
        const qualitySelect = document.getElementById(`quality-${item.id}`);

        if (qtyInput) qtyInput.value = item.planned_qty;
        if (statusSelect) statusSelect.value = 'completed';
        if (qualitySelect) {
          qualitySelect.value = 'pass';
          qualitySelect.style.backgroundColor = qualityColors.pass;
        }
      }
      setSelectedItems([]);
    }
  };

  // âœ… ØªØ­Ø¯ÙŠØ« DOM ÙÙ‚Ø· Ø¨Ø¹Ø¯ Ù†Ø¬Ø§Ø­ handleUpdate
  const handleQuickPercent = async (item, percent) => {
    const qty = (item.planned_qty * percent).toFixed(2);
    const status = percent === 1 ? 'completed' : (percent === 0 ? 'not_started' : 'in_progress');

    const success = await handleUpdate(item, qty, status, 'pass');
    if (success) {
      const qtyInput = document.getElementById(`qty-${item.id}`);
      const statusSelect = document.getElementById(`status-${item.id}`);
      const qualitySelect = document.getElementById(`quality-${item.id}`);

      if (qtyInput) qtyInput.value = qty;
      if (statusSelect) statusSelect.value = status;
      if (qualitySelect) {
        qualitySelect.value = 'pass';
        qualitySelect.style.backgroundColor = qualityColors.pass;
      }
    }
  };

  if (!latrine || !boqItems) {
    return <div style={{ padding: '40px', textAlign: 'center' }}>Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...</div>;
  }

  const allSelected = boqItems.length > 0 && selectedItems.length === boqItems.length;

  return (
    <div style={{ direction: 'rtl' }}>
      {/* Ø´Ø±ÙŠØ· Ø§Ù„Ø®Ø·Ø£ Ø§Ù„Ø¹Ø§Ø¦Ù… */}
      {errorMsg && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: '12px 16px', borderRadius: '6px', marginBottom: '15px', border: '1px solid #ef9a9a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>âš ï¸</span> {errorMsg}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
        <h2 style={{ color: '#1F4E78', margin: 0 }}>Ø¬Ø¯ÙˆÙ„ ÙƒÙ…ÙŠØ§Øª Ø­Ù…Ø§Ù…: {latrine.latrine_id}</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={() => onOpenRemarks?.(latrineId, null)} style={{ padding: '8px 16px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            Ø§Ù„Ù…Ù„Ø§Ø­Ø¸Ø§Øª Ø§Ù„Ø¹Ø§Ù…Ø© Ù„Ù„Ø­Ù…Ø§Ù…
          </button>
          <button onClick={onBack} style={{ padding: '8px 16px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer' }}>
            &larr; Ø§Ù„Ø¹ÙˆØ¯Ø© Ù„Ù„Ù‚Ø§Ø¦Ù…Ø©
          </button>
        </div>
      </div>

      {selectedItems.length > 0 && (
        <div style={{ background: '#dff9fb', padding: '15px', borderRadius: '8px', marginBottom: '15px', border: '1px solid #c7ecee', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <strong>ØªÙ… ØªØ­Ø¯ÙŠØ¯ {selectedItems.length} Ø¨Ù†ÙˆØ¯</strong>
          <button onClick={handleBulkComplete} style={{ padding: '8px 16px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            âœ“ Ø§Ø¹ØªÙ…Ø§Ø¯ Ø§Ù„ÙƒÙ„ ÙƒÙ…ÙƒØªÙ…Ù„ ÙˆÙ…Ù‚Ø¨ÙˆÙ„ (100%)
          </button>
        </div>
      )}

      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '900px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'center' }}>
                <input type="checkbox" onChange={toggleSelectAll} checked={allSelected} aria-label="ØªØ­Ø¯ÙŠØ¯ ÙƒÙ„ Ø§Ù„Ø¨Ù†ÙˆØ¯" title="ØªØ­Ø¯ÙŠØ¯ Ø§Ù„ÙƒÙ„" />
              </th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Ø§Ù„Ø¨Ù†Ø¯</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Ø§Ù„Ù…Ø®Ø·Ø·</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Ø¥Ø¯Ø®Ø§Ù„ Ø³Ø±ÙŠØ¹</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Ø§Ù„Ù…Ù†ÙØ° ÙŠØ¯ÙˆÙŠØ§Ù‹</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Ø§Ù„Ø­Ø§Ù„Ø©</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>ÙØ­Øµ Ø§Ù„Ø¬ÙˆØ¯Ø©</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª</th>
            </tr>
          </thead>
          <tbody>
            {boqItems.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #eee', backgroundColor: selectedItems.includes(item.id) ? '#f1f8ff' : 'transparent' }}>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <input type="checkbox" checked={selectedItems.includes(item.id)} onChange={() => toggleSelect(item.id)} aria-label={`ØªØ­Ø¯ÙŠØ¯ Ø¨Ù†Ø¯ ${item.boq_code}`} />
                </td>
                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                  <strong>{item.boq_code}</strong><br/>
                  <small style={{ color: '#666' }}>{item.description_ar}</small>
                </td>
                <td style={{ padding: '12px', color: '#7f8c8d', fontWeight: 'bold', whiteSpace: 'nowrap' }}>{item.planned_qty} {item.unit}</td>
                <td style={{ padding: '12px', whiteSpace: 'nowrap' }}>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button onClick={() => handleQuickPercent(item, 0.25)} aria-label="25% Ù…Ù† Ø§Ù„ÙƒÙ…ÙŠØ©" style={{ padding: '4px 8px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize:'11px' }}>25%</button>
                    <button onClick={() => handleQuickPercent(item, 0.50)} aria-label="50% Ù…Ù† Ø§Ù„ÙƒÙ…ÙŠØ©" style={{ padding: '4px 8px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize:'11px' }}>50%</button>
                    <button onClick={() => handleQuickPercent(item, 0.75)} aria-label="75% Ù…Ù† Ø§Ù„ÙƒÙ…ÙŠØ©" style={{ padding: '4px 8px', background: '#ecf0f1', border: '1px solid #bdc3c7', borderRadius: '4px', cursor: 'pointer', fontSize:'11px' }}>75%</button>
                    <button onClick={() => handleQuickPercent(item, 1.00)} aria-label="100% Ù…Ù† Ø§Ù„ÙƒÙ…ÙŠØ© Ù…ÙƒØªÙ…Ù„" style={{ padding: '4px 8px', background: '#3498db', color:'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize:'11px', fontWeight:'bold' }}>100%</button>
                  </div>
                </td>
                <td style={{ padding: '12px' }}>
                  <input type="number" step="0.01" defaultValue={item.achieved_qty} id={`qty-${item.id}`} style={{ width: '70px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }} />
                </td>
                <td style={{ padding: '12px' }}>
                  <select id={`status-${item.id}`} defaultValue={item.status || 'not_started'} style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc' }}>
                    {itemStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
                <td style={{ padding: '12px' }}>
                  <select 
                    id={`quality-${item.id}`} defaultValue={item.quality_pass || 'pending'}
                    style={{ padding: '6px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: qualityColors[item.quality_pass || 'pending'] }}
                    onChange={(e) => e.target.style.backgroundColor = qualityColors[e.target.value]}
                  >
                    <option value="pending">Ù‚ÙŠØ¯ Ø§Ù„ÙØ­Øµ</option>
                    <option value="pass">Ù…Ù‚Ø¨ÙˆÙ„</option>
                    <option value="fail">Ù…Ø±ÙÙˆØ¶</option>
                  </select>
                </td>
                <td style={{ padding: '12px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexDirection: 'column' }}>
                    <button 
                      disabled={updatingId === item.id} 
                      onClick={() => {
                        const qty = document.getElementById(`qty-${item.id}`).value;
                        const status = document.getElementById(`status-${item.id}`).value;
                        const quality = document.getElementById(`quality-${item.id}`).value;
                        handleUpdate(item, qty, status, quality);
                      }} 
                      aria-label={`Ø­ÙØ¸ Ø¨Ù†Ø¯ ${item.boq_code}`}
                      style={{ padding: '6px 10px', background: '#27ae60', color: 'white', border: 'none', borderRadius: '4px', cursor: updatingId === item.id ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}
                    >
                      {updatingId === item.id ? '...' : 'Ø­ÙØ¸'}
                    </button>
                    <button onClick={() => onOpenRemarks?.(latrineId, item.boq_code)} aria-label={`Ù…Ù„Ø§Ø­Ø¸Ø© Ù„Ø¨Ù†Ø¯ ${item.boq_code}`} style={{ padding: '4px 8px', background: '#e67e22', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                      + Ù…Ù„Ø§Ø­Ø¸Ø© Ù„Ù„Ø¨Ù†Ø¯
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default BoqUpdater;


