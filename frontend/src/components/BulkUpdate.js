
import React, { useState, useEffect, useMemo } from 'react';
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

const boqDictionary = [
  { code: 'A1', name: 'Ø­ÙØ± ÙˆØªØ³ÙˆÙŠØ© + Ø£Ø³Ø§Ø³ Ø­Ø¬Ø±' }, { code: 'A2', name: 'Ø¬Ø¯Ø±Ø§Ù† Ø¨Ù„Ùƒ Ù…ÙØ±Øº 15Ø³Ù…' },
  { code: 'A3', name: 'Ù„ÙŠØ§Ø³Ø© Ø¯Ø§Ø®Ù„ÙŠØ© ÙˆØ®Ø§Ø±Ø¬ÙŠØ©' }, { code: 'A4', name: 'Ø³Ù‚Ù Ø®Ø±Ø³Ø§Ù†Ø© Ù…Ø³Ù„Ø­Ø©' },
  { code: 'A5', name: 'ÙƒØ±Ø³ÙŠ Ø¹Ø±Ø¨ÙŠ + ÙƒÙˆØ¹ Ø±ÙŠØ­Ø©' }, { code: 'A6', name: 'Ø¨Ù„Ø§Ø· Ù…ÙˆØ²Ø§ÙŠÙƒÙˆ' },
  { code: 'B1', name: 'Ø­ÙØ± Ø¨ÙŠØ§Ø±Ø© Ù‚Ø·Ø± 1Ù…' }, { code: 'B2', name: 'ØªÙ…Ø¯ÙŠØ¯ UPVC 4 Ø§Ù†Ø´ + ØªÙ‡ÙˆÙŠØ©' },
  { code: 'B3', name: 'ØºØ·Ø§Ø¡ Ø¨ÙŠØ§Ø±Ø© Ø®Ø±Ø³Ø§Ù†ÙŠ' }, { code: 'C1', name: 'Ø¨Ø§Ø¨ Ø­Ø¯ÙŠØ¯ ØµØ§Ø¬' },
  { code: 'C2', name: 'Ù†Ø§ÙØ°Ø© Ø£Ù„Ù…Ù†ÙŠÙˆÙ…' }, { code: 'C3', name: 'Ø¥Ø¶Ø§Ø¡Ø© Ø´Ù…Ø³ÙŠØ© 10ÙˆØ§Ø·' }, { code: 'C4', name: 'Ù„ÙˆØ­Ø© Ù…Ø¹Ø¯Ù†ÙŠØ© + Ø´Ø¹Ø§Ø±' }
];

const BulkUpdate = ({ onOpenRemarks }) => {
  const [selectedBoqCode, setSelectedBoqCode] = useState('A1');
  const [selectedLatrines, setSelectedLatrines] = useState([]);
  const [bulkQty, setBulkQty] = useState('');
  const [bulkStatus, setBulkStatus] = useState('completed');
  const [bulkQuality, setBulkQuality] = useState('pass');
  const [isSaving, setIsSaving] = useState(false);
  const [savingRowId, setSavingRowId] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const latrines = useLiveQuery(() => db.latrines.toArray(), []);
  const boqItems = useLiveQuery(() => 
    db.boq_items.where('boq_code').equals(selectedBoqCode).toArray(), 
  [selectedBoqCode]);

  useEffect(() => {
    setSelectedLatrines([]);
  }, [selectedBoqCode]);

  useEffect(() => {
    if (!errorMsg) return;
    const timer = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(timer);
  }, [errorMsg]);

  const showError = (msg) => setErrorMsg(msg);

  const tableData = useMemo(() => {
    if (!latrines || !boqItems) return [];
    return latrines.map(latrine => {
      const item = boqItems.find(i => i.latrine_id === latrine.id);
      return { ...latrine, boqItem: item };
    }).filter(data => data.boqItem !== undefined);
  }, [latrines, boqItems]);

  const toggleSelectAll = (e) => {
    if (e.target.checked && tableData.length) setSelectedLatrines(tableData.map(d => d.id));
    else setSelectedLatrines([]);
  };

  const toggleSelect = (id) => {
    setSelectedLatrines(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleSingleUpdate = async (item, latrineId) => {
    setSavingRowId(item.id);
    try {
      const qtyInput = document.getElementById(`bulk-qty-${item.id}`);
      const statusSelect = document.getElementById(`bulk-status-${item.id}`);
      const qualitySelect = document.getElementById(`bulk-quality-${item.id}`);
      
      const qty = parseFloat(qtyInput?.value);
      const status = statusSelect?.value;
      const quality = qualitySelect?.value;

      if (isNaN(qty) || qty < 0 || qty > item.planned_qty) {
        showError(`Ø§Ù„ÙƒÙ…ÙŠØ© ØºÙŠØ± ØµØ§Ù„Ø­Ø© Ù„Ù„Ø¨Ù†Ø¯ ${item.boq_code}. Ø§Ù„Ø­Ø¯ Ø§Ù„Ø£Ù‚ØµÙ‰: ${item.planned_qty}`);
        return false;
      }

      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        await db.boq_items.update(item.id, { achieved_qty: qty, status, quality_pass: quality });
        await pushToSyncQueue('UPDATE_BOQ', { 
          id: item.id, achieved_qty: qty, status, quality_pass: quality, latrine_id: latrineId 
        });
      });
      return true;
    } catch (error) {
      console.error('Single update error:', error);
      showError('Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„Ø­ÙØ¸ Ø§Ù„Ù…Ø­Ù„ÙŠ.');
      return false;
    } finally {
      setSavingRowId(null);
    }
  };

  const handleApplyBulkUpdate = async () => {
    if (selectedLatrines.length === 0) return showError('ÙŠØ±Ø¬Ù‰ ØªØ­Ø¯ÙŠØ¯ Ø­Ù…Ø§Ù… ÙˆØ§Ø­Ø¯ Ø¹Ù„Ù‰ Ø§Ù„Ø£Ù‚Ù„.');
    if (bulkQty === '' || isNaN(parseFloat(bulkQty))) return showError('ÙŠØ±Ø¬Ù‰ Ø¥Ø¯Ø®Ø§Ù„ Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ù†ÙØ°Ø©.');

    if (!window.confirm(`ØªØ·Ø¨ÙŠÙ‚ Ø§Ù„ØªØ­Ø¯ÙŠØ« Ø¹Ù„Ù‰ ${selectedLatrines.length} Ø­Ù…Ø§Ù…Ø§ØªØŸ`)) return;

    setIsSaving(true);
    try {
      const qty = parseFloat(bulkQty);
      const itemsToProcess = boqItems.filter(i => selectedLatrines.includes(i.latrine_id) && qty <= i.planned_qty);
      const skippedCount = selectedLatrines.length - itemsToProcess.length;

      if (!itemsToProcess.length) {
        showError('Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø¯Ø®Ù„Ø© ØªØªØ¬Ø§ÙˆØ² Ø§Ù„Ù…Ø®Ø·Ø· Ù„Ø¬Ù…ÙŠØ¹ Ø§Ù„Ø¨Ù†ÙˆØ¯ Ø§Ù„Ù…Ø­Ø¯Ø¯Ø©.');
        return;
      }

      await db.transaction('rw', db.boq_items, db.sync_queue, async () => {
        for (const item of itemsToProcess) {
          await db.boq_items.update(item.id, { achieved_qty: qty, status: bulkStatus, quality_pass: bulkQuality });
          await pushToSyncQueue('UPDATE_BOQ', { 
            id: item.id, achieved_qty: qty, status: bulkStatus, quality_pass: bulkQuality, latrine_id: item.latrine_id 
          });
        }
      });

      for (const item of itemsToProcess) {
        const qtyInput = document.getElementById(`bulk-qty-${item.id}`);
        const statusSelect = document.getElementById(`bulk-status-${item.id}`);
        const qualitySelect = document.getElementById(`bulk-quality-${item.id}`);
        if (qtyInput) qtyInput.value = qty;
        if (statusSelect) statusSelect.value = bulkStatus;
        if (qualitySelect) {
          qualitySelect.value = bulkQuality;
          qualitySelect.style.backgroundColor = qualityColors[bulkQuality];
        }
      }

      if (skippedCount > 0) {
        showError(`ØªÙ… ØªØ®Ø·ÙŠ ${skippedCount} Ø¨Ù†Ø¯ Ù„ØªØ¬Ø§ÙˆØ² Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ø®Ø·Ø·.`);
      }
      setSelectedLatrines([]);
      setBulkQty('');
    } catch (error) {
      console.error('Bulk update error:', error);
      showError('Ø­Ø¯Ø« Ø®Ø·Ø£ Ø£Ø«Ù†Ø§Ø¡ Ø§Ù„ØªØ­Ø¯ÙŠØ« Ø§Ù„Ø¬Ù…Ø§Ø¹ÙŠ.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!latrines || !boqItems) return <div style={{ textAlign: 'center', padding: '40px' }}>Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ­Ù…ÙŠÙ„...</div>;

  const targetBoqInfo = boqDictionary.find(b => b.code === selectedBoqCode);
  const allSelected = tableData.length > 0 && selectedLatrines.length === tableData.length;

  return (
    <div style={{ direction: 'rtl' }}>
      {errorMsg && (
        <div style={{ background: '#ffebee', color: '#c62828', padding: '12px 16px', borderRadius: '6px', marginBottom: '15px', border: '1px solid #ef9a9a', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>âš ï¸</span> {errorMsg}
        </div>
      )}

      <h2 style={{ color: '#1F4E78', marginBottom: '20px' }}>Ø¥Ø¯Ø§Ø±Ø© Ø§Ù„Ø¨Ù†Ø¯ {selectedBoqCode} Ø¬Ù…Ø§Ø¹ÙŠØ§Ù‹</h2>

      <div style={{ background: '#e8f4f8', border: '1px solid #bdc3c7', padding: '15px', borderRadius: '8px', marginBottom: '20px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#2980b9' }}>ÙˆØ­Ø¯Ø© Ø§Ù„ØªØ­ÙƒÙ… Ø§Ù„Ø¬Ù…Ø§Ø¹ÙŠØ©</h4>
        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>Ø§Ù„Ø¨Ù†Ø¯ Ø§Ù„Ù…Ø³ØªÙ‡Ø¯Ù:</label>
            <select value={selectedBoqCode} onChange={(e) => setSelectedBoqCode(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', minWidth: '250px' }}>
              {boqDictionary.map(b => <option key={b.code} value={b.code}>{b.code} - {b.name}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>Ø§Ù„ÙƒÙ…ÙŠØ© Ø§Ù„Ù…Ù†ÙØ°Ø©:</label>
            <input type="number" step="0.01" value={bulkQty} onChange={(e) => setBulkQty(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', width: '100px' }} />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>Ø­Ø§Ù„Ø© Ø§Ù„Ø¨Ù†Ø¯:</label>
            <select value={bulkStatus} onChange={(e) => setBulkStatus(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc' }}>
              {itemStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            <label style={{ fontWeight: 'bold' }}>ÙØ­Øµ Ø§Ù„Ø¬ÙˆØ¯Ø©:</label>
            <select value={bulkQuality} onChange={(e) => setBulkQuality(e.target.value)} style={{ padding: '8px', borderRadius: '4px', border: '1px solid #ccc', backgroundColor: qualityColors[bulkQuality] }}>
              <option value="pending">Ù‚ÙŠØ¯ Ø§Ù„ÙØ­Øµ</option><option value="pass">Ù…Ù‚Ø¨ÙˆÙ„</option><option value="fail">Ù…Ø±ÙÙˆØ¶</option>
            </select>
          </div>

          <button onClick={handleApplyBulkUpdate} disabled={isSaving || selectedLatrines.length === 0} style={{ padding: '10px 20px', background: selectedLatrines.length > 0 ? '#16a085' : '#bdc3c7', color: 'white', border: 'none', borderRadius: '4px', cursor: selectedLatrines.length > 0 ? 'pointer' : 'not-allowed', fontWeight: 'bold' }}>
            {isSaving ? 'Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªØ·Ø¨ÙŠÙ‚...' : `ØªØ·Ø¨ÙŠÙ‚ Ø¹Ù„Ù‰ (${selectedLatrines.length})`}
          </button>
        </div>
      </div>

      <div style={{ background: 'white', borderRadius: '8px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '1000px' }}>
          <thead style={{ background: '#1F4E78', color: 'white' }}>
            <tr>
              <th style={{ padding: '12px', textAlign: 'center', width: '50px' }}>
                <input type="checkbox" onChange={toggleSelectAll} checked={allSelected} aria-label="ØªØ­Ø¯ÙŠØ¯ ÙƒÙ„ Ø§Ù„Ø­Ù…Ø§Ù…Ø§Øª" />
              </th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Ø§Ù„Ø­Ù…Ø§Ù… ÙˆØ§Ù„Ù…Ø±Ø¨Ø¹</th>
              <th style={{ padding: '12px', textAlign: 'center', color: '#f1c40f', whiteSpace: 'nowrap' }}>Ø§Ù„Ù…Ø®Ø·Ø· ({targetBoqInfo?.name})</th>
              <th style={{ padding: '12px', textAlign: 'right', whiteSpace: 'nowrap' }}>Ø§Ù„Ù…Ù†ÙØ° Ø­Ø§Ù„ÙŠØ§Ù‹</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>ØªØ¹Ø¯ÙŠÙ„ Ø§Ù„ÙƒÙ…ÙŠØ©</th>
              <th style={{ padding: '12px', textAlign: 'right' }}>Ø§Ù„Ø­Ø§Ù„Ø© ÙˆØ§Ù„Ø¬ÙˆØ¯Ø©</th>
              <th style={{ padding: '12px', textAlign: 'center' }}>Ø¥Ø¬Ø±Ø§Ø¡Ø§Øª Ø§Ù„Ø³Ø·Ø±</th>
            </tr>
          </thead>
          <tbody>
            {tableData.length === 0 ? (
              <tr><td colSpan="7" style={{ padding: '20px', textAlign: 'center' }}>Ù„Ø§ ØªÙˆØ¬Ø¯ Ø¨ÙŠØ§Ù†Ø§Øª. ÙŠØ±Ø¬Ù‰ Ø§Ù„Ù…Ø²Ø§Ù…Ù†Ø©.</td></tr>
            ) : (
              tableData.map(row => (
                <tr key={row.id} style={{ borderBottom: '1px solid #eee', backgroundColor: selectedLatrines.includes(row.id) ? '#f1f8ff' : 'transparent' }}>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <input type="checkbox" checked={selectedLatrines.includes(row.id)} onChange={() => toggleSelect(row.id)} aria-label={`ØªØ­Ø¯ÙŠØ¯ Ø­Ù…Ø§Ù… ${row.latrine_id}`} />
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#1F4E78', whiteSpace: 'nowrap' }}>
                    {row.latrine_id} <br/><small style={{color:'#7f8c8d'}}>{row.block_no}</small>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {row.boqItem.planned_qty} {row.boqItem.unit}
                  </td>
                  <td style={{ padding: '12px', fontWeight: 'bold', color: '#7f8c8d', whiteSpace: 'nowrap' }}>
                    {row.boqItem.achieved_qty} / {row.boqItem.planned_qty}
                  </td>
                  <td style={{ padding: '12px' }}>
                    <input type="number" step="0.01" defaultValue={row.boqItem.achieved_qty} id={`bulk-qty-${row.boqItem.id}`} style={{ width: '70px', padding: '6px', border: '1px solid #ccc', borderRadius: '4px' }} />
                  </td>
                  <td style={{ padding: '12px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      <select id={`bulk-status-${row.boqItem.id}`} defaultValue={row.boqItem.status || 'not_started'} style={{ padding: '4px', borderRadius: '4px', fontSize: '12px' }}>
                        {itemStatuses.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                      <select id={`bulk-quality-${row.boqItem.id}`} defaultValue={row.boqItem.quality_pass || 'pending'} style={{ padding: '4px', borderRadius: '4px', fontSize: '12px', backgroundColor: qualityColors[row.boqItem.quality_pass || 'pending'] }} onChange={(e) => e.target.style.backgroundColor = qualityColors[e.target.value]}>
                        <option value="pending">Ù‚ÙŠØ¯ Ø§Ù„ÙØ­Øµ</option><option value="pass">Ù…Ù‚Ø¨ÙˆÙ„</option><option value="fail">Ù…Ø±ÙÙˆØ¶</option>
                      </select>
                    </div>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', flexDirection: 'column' }}>
                      <button 
                        onClick={() => handleSingleUpdate(row.boqItem, row.id)} disabled={savingRowId === row.boqItem.id}
                        aria-label={`Ø­ÙØ¸ Ø¨Ù†Ø¯ Ø­Ù…Ø§Ù… ${row.latrine_id}`}
                        style={{ padding: '4px 8px', background: savingRowId === row.boqItem.id ? '#95a5a6' : '#3498db', color: 'white', border: 'none', borderRadius: '4px', cursor: savingRowId === row.boqItem.id ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: '11px' }}
                      >
                        {savingRowId === row.boqItem.id ? '...' : 'Ø­ÙØ¸ Ø§Ù„Ø³Ø·Ø±'}
                      </button>
                      <button onClick={() => onOpenRemarks?.(row.id, selectedBoqCode)} aria-label={`Ù…Ù„Ø§Ø­Ø¸Ø© Ù„Ø­Ù…Ø§Ù… ${row.latrine_id}`} style={{ padding: '4px 8px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}>
                        + Ù…Ù„Ø§Ø­Ø¸Ø©
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


