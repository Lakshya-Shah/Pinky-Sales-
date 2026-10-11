import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen, ChevronDown, ChevronUp, Download, X, Calendar,
  TrendingUp, TrendingDown, Minus, RefreshCw, User, FileText,
  AlertCircle, ArrowUpRight, ArrowDownRight, ChevronsRight, Search,
  Edit3, Check, Loader2
} from 'lucide-react';
import InvoiceDetailDrawer from './InvoiceDetailDrawer';

const money = (v) => Math.round(Number(v || 0) * 100) / 100;
const fmt = (v) => money(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const currency = (v) => `₹${fmt(v)}`;

const today = () => new Date().toISOString().slice(0, 10);
const formatDMY = (d) => {
  if (!d) return '—';
  const s = String(d).slice(0, 10).split('-');
  return s.length === 3 ? `${s[2]}/${s[1]}/${s[0]}` : d;
};

const extractPaymentMode = (desc) => {
  const m = String(desc || '').match(/Payment received via\s+([^\[→]+)/i);
  return m ? m[1].trim().toLowerCase() : 'cash';
};

const extractRefNumber = (desc) => {
  const m = String(desc || '').match(/\[Ref:\s*([^\]]+)\]/i);
  return m ? m[1].trim() : '';
};

const TYPE_STYLES = {
  opening_balance: { label: 'Opening', color: '#6366f1', bg: '#eef2ff' },
  sale:            { label: 'Invoice',  color: '#0284c7', bg: '#e0f2fe' },
  payment:         { label: 'Payment',  color: '#16a34a', bg: '#dcfce7' },
  reversal:        { label: 'Reversal', color: '#b91c1c', bg: '#fee2e2' },
  credit_note:     { label: 'Cr. Note', color: '#dc2626', bg: '#fee2e2' },
  purchase_bill:   { label: 'Bill',     color: '#9333ea', bg: '#f3e8ff' },
  bill_payment:    { label: 'Payment',  color: '#16a34a', bg: '#dcfce7' },
  debit_note:      { label: 'Dr. Note', color: '#ea580c', bg: '#ffedd5' },
};

function TypeBadge({ type }) {
  const s = TYPE_STYLES[type] || { label: type, color: '#64748b', bg: '#f1f5f9' };
  return (
    <span style={{
      background: s.bg, color: s.color, border: `1px solid ${s.color}33`,
      padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap'
    }}>
      {s.label}
    </span>
  );
}

function renderBreakdownText(breakdownStr, onSelectInvoice) {
  if (!breakdownStr) return null;
  const parts = String(breakdownStr).split(/(Invoice #(?:INV-[\w]+|\d+))/gi);
  return parts.map((part, idx) => {
    const match = part.match(/^Invoice #((?:INV-[\w]+|\d+))$/i);
    if (match) {
      const invRef = match[1];
      return (
        <button
          key={idx}
          type="button"
          onClick={() => onSelectInvoice(invRef)}
          className="text-sky-600 hover:text-sky-500 hover:underline cursor-pointer font-bold font-mono inline-block bg-transparent border-none p-0 mx-0.5"
          title={`View invoice ${invRef}`}
        >
          {part}
        </button>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

function PartySearchInput({ mode, partyList = [], selectedId, onSelect }) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef(null);
  const inputRef = useRef(null);

  // Currently selected party
  const selectedParty = useMemo(() => {
    return partyList.find(p => String(p.id) === String(selectedId)) || null;
  }, [partyList, selectedId]);

  // Synchronize input text with selected party
  useEffect(() => {
    if (selectedParty) {
      setQuery(selectedParty.name || '');
    } else {
      setQuery('');
    }
  }, [selectedParty]);

  // Filter party list
  const filteredList = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || (selectedParty && query === selectedParty.name)) {
      return partyList.slice(0, 100);
    }
    return partyList.filter(p => {
      const name = (p.name || '').toLowerCase();
      const mobile = (p.mobile || '').toLowerCase();
      const address = (p.address || '').toLowerCase();
      const gstin = (p.gstin || '').toLowerCase();
      return name.includes(q) || mobile.includes(q) || address.includes(q) || gstin.includes(q);
    }).slice(0, 100);
  }, [partyList, query, selectedParty]);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        if (selectedParty) {
          setQuery(selectedParty.name || '');
        } else {
          setQuery('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [selectedParty]);

  const handleSelect = (party) => {
    onSelect(party ? String(party.id) : '');
    setQuery(party ? party.name : '');
    setIsOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onSelect('');
    setQuery('');
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIndex(prev => (prev + 1) % Math.max(1, filteredList.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIndex(prev => (prev - 1 + filteredList.length) % Math.max(1, filteredList.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredList[highlightIndex]) {
        handleSelect(filteredList[highlightIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search size={15} style={{ position: 'absolute', left: 12, color: '#94a3b8', pointerEvents: 'none' }} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setHighlightIndex(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            inputRef.current?.select();
          }}
          onKeyDown={handleKeyDown}
          placeholder={`Type to search ${mode === 'customer' ? 'customer' : 'vendor'} (name, mobile, city)...`}
          style={{
            width: '100%',
            padding: '9px 36px 9px 34px',
            borderRadius: 10,
            border: isOpen ? '1.5px solid #6366f1' : '1.5px solid #e2e8f0',
            fontSize: 13,
            fontWeight: selectedParty && query === selectedParty.name ? 700 : 500,
            background: '#fff',
            color: '#0f172a',
            outline: 'none',
            boxShadow: isOpen ? '0 0 0 3px rgba(99,102,241,0.15)' : 'none',
            transition: 'all 0.15s ease',
            boxSizing: 'border-box'
          }}
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            style={{
              position: 'absolute',
              right: 10,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              padding: 2
            }}
            title="Clear search"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Floating Dropdown Results */}
      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          right: 0,
          maxHeight: 280,
          overflowY: 'auto',
          background: '#fff',
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          zIndex: 9999,
          padding: '4px'
        }}>
          {filteredList.length === 0 ? (
            <div style={{ padding: '14px', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
              No {mode === 'customer' ? 'customers' : 'vendors'} match "{query}"
            </div>
          ) : (
            filteredList.map((p, idx) => {
              const isSelected = selectedParty && String(selectedParty.id) === String(p.id);
              const isHighlighted = idx === highlightIndex;
              const mobileInfo = p.mobile ? `📞 ${p.mobile}` : '';
              const addressInfo = p.address ? p.address : '';
              const gstinInfo = p.gstin ? `GST: ${p.gstin}` : '';
              const subtitle = [mobileInfo, gstinInfo, addressInfo].filter(Boolean).join(' • ');

              return (
                <div
                  key={p.id}
                  onClick={() => handleSelect(p)}
                  onMouseEnter={() => setHighlightIndex(idx)}
                  style={{
                    padding: '8px 12px',
                    borderRadius: 8,
                    cursor: 'pointer',
                    background: isSelected ? '#eef2ff' : (isHighlighted ? '#f8fafc' : 'transparent'),
                    border: isSelected ? '1px solid #c7d2fe' : '1px solid transparent',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 2,
                    transition: 'background 0.1s'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: isSelected ? 800 : 700, color: isSelected ? '#4338ca' : '#0f172a' }}>
                      {p.name}
                    </span>
                    {isSelected && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#6366f1' }}>Selected ✓</span>
                    )}
                  </div>
                  {subtitle && (
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      {subtitle}
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function PartyLedger({ session, api, setGlobalToast, customers = [], suppliers = [], onEditSale }) {
  const [mode, setMode] = useState('customer'); // 'customer' | 'vendor'
  const [selectedId, setSelectedId] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState(today());
  const [ledger, setLedger] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeInvoiceRef, setActiveInvoiceRef] = useState(null);

  // Direct editing modal state for ledger transactions (payments, credit notes, opening balance, bills)
  const [editingRow, setEditingRow] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState(null);

  const partyList = mode === 'customer' ? customers : suppliers;

  const fetchLedger = useCallback(async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const endpoint = mode === 'customer'
        ? `/ledger/customer/${selectedId}`
        : `/ledger/vendor/${selectedId}`;
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const data = await api(`${endpoint}?${params}`);
      setLedger(data);
    } catch (e) {
      setError(e.message || 'Failed to load ledger.');
      setGlobalToast && setGlobalToast({ type: 'error', message: e.message || 'Failed to load ledger' });
    } finally {
      setLoading(false);
    }
  }, [selectedId, mode, fromDate, toDate, api, setGlobalToast]);

  useEffect(() => {
    if (selectedId) fetchLedger();
    else setLedger(null);
  }, [selectedId, mode]);

  // Auto-refresh ledger when an invoice is edited via EditSaleModal
  useEffect(() => {
    const handleRefresh = () => {
      if (selectedId) fetchLedger();
    };
    window.addEventListener('party-ledger-refresh', handleRefresh);
    return () => window.removeEventListener('party-ledger-refresh', handleRefresh);
  }, [selectedId, fetchLedger]);

  const handleStartEdit = async (row) => {
    const isInv = row.type === 'Invoice' || row.entry_type === 'sale' || String(row.ref_no || '').startsWith('INV-');
    if (isInv) {
      if (typeof onEditSale === 'function') {
        try {
          const invRef = row.ref_no || String(row.id);
          const saleData = await api(`/sales/by-ref/${encodeURIComponent(invRef)}`);
          if (saleData && (saleData.sale || saleData.id)) {
            onEditSale(saleData.sale || saleData);
            return;
          }
        } catch (err) {
          console.warn('Failed to load sale by ref, opening detail drawer:', err);
        }
      }
      setActiveInvoiceRef(row.ref_no || String(row.id));
      return;
    }

    setEditError(null);
    setEditingRow(row);

    if (row.entry_type === 'payment') {
      setEditFormData({
        amount: String(row.credit || row.debit || ''),
        payment_date: row.entry_date || today(),
        payment_mode: extractPaymentMode(row.description) || 'cash',
        reference_number: extractRefNumber(row.description) || '',
        note: '',
      });
    } else if (row.entry_type === 'credit_note') {
      setEditFormData({
        amount: String(row.credit || ''),
        return_date: row.entry_date || today(),
        reason: String(row.description || '').replace(/^Credit Note #CN-\d+\s*\((.*)\)$/, '$1'),
      });
    } else if (row.entry_type === 'opening_balance') {
      setEditFormData({
        amount: String(ledger?.opening_balance || row.debit || ''),
        opening_balance_date: row.entry_date || today(),
      });
    } else if (row.entry_type === 'purchase_bill') {
      setEditFormData({
        amount: String(row.debit || ''),
        bill_date: row.entry_date || today(),
      });
    } else if (row.entry_type === 'bill_payment') {
      setEditFormData({
        amount: String(row.credit || ''),
        payment_date: row.entry_date || today(),
      });
    } else if (row.entry_type === 'debit_note') {
      setEditFormData({
        amount: String(row.credit || ''),
        return_date: row.entry_date || today(),
        reason: String(row.description || '').replace(/^Debit Note:\s*/, ''),
      });
    }
  };

  const handleSaveEdit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (!editingRow) return;

    setSavingEdit(true);
    setEditError(null);

    try {
      if (editingRow.entry_type === 'payment') {
        const payload = {
          amount: Number(editFormData.amount),
          payment_date: editFormData.payment_date,
          payment_mode: editFormData.payment_mode,
          reference_number: editFormData.reference_number,
          note: editFormData.note,
        };
        await api(`/payments/${editingRow.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setGlobalToast && setGlobalToast({ type: 'success', message: `Payment ${editingRow.ref_no} updated successfully.` });
      } else if (editingRow.entry_type === 'credit_note') {
        const payload = {
          amount: Number(editFormData.amount),
          return_date: editFormData.return_date,
          reason: editFormData.reason,
        };
        await api(`/credit-notes/${editingRow.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        setGlobalToast && setGlobalToast({ type: 'success', message: `Credit Note ${editingRow.ref_no} updated successfully.` });
      } else if (editingRow.entry_type === 'opening_balance') {
        const amt = Number(editFormData.amount || 0);
        if (mode === 'customer') {
          await api(`/customers/${selectedId}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: ledger.customer?.name,
              opening_balance: amt,
              opening_balance_date: editFormData.opening_balance_date,
            }),
          });
        } else {
          await api(`/reference-data/suppliers/${selectedId}`, {
            method: 'PUT',
            body: JSON.stringify({
              name: ledger.supplier?.name,
              opening_balance: amt,
              opening_balance_date: editFormData.opening_balance_date,
            }),
          });
        }
        setGlobalToast && setGlobalToast({ type: 'success', message: 'Opening balance updated successfully.' });
      } else if (editingRow.entry_type === 'purchase_bill' || editingRow.entry_type === 'bill_payment') {
        await api(`/purchase-bills/${editingRow.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            total_amount: Number(editFormData.amount || 0),
            bill_date: editFormData.bill_date || editFormData.entry_date,
          }),
        });
        setGlobalToast && setGlobalToast({ type: 'success', message: 'Purchase bill updated successfully.' });
      } else if (editingRow.entry_type === 'debit_note') {
        await api(`/debit-notes/${editingRow.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            amount: Number(editFormData.amount || 0),
            return_date: editFormData.return_date || editFormData.entry_date,
            reason: editFormData.reason,
          }),
        });
        setGlobalToast && setGlobalToast({ type: 'success', message: 'Debit note updated successfully.' });
      }

      setEditingRow(null);
      await fetchLedger();
    } catch (err) {
      console.error('Failed to update ledger transaction:', err);
      setEditError(err.message || 'Failed to save changes.');
      setGlobalToast && setGlobalToast({ type: 'error', message: err.message || 'Failed to save changes.' });
    } finally {
      setSavingEdit(false);
    }
  };

  const handleExportCSV = () => {
    if (!ledger?.rows?.length) return;
    const partyName = ledger.customer?.name || ledger.supplier?.name || 'party';
    const header = 'Date,Ref No,Type,Description,Debit,Credit,Balance\n';
    const rows = ledger.rows.map(r =>
      [formatDMY(r.entry_date), r.ref_no, r.entry_type, `"${r.description}"`, r.debit, r.credit, r.running_balance].join(',')
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `ledger_${partyName.replace(/\s+/g, '_')}_${today()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const handleExportPDF = async () => {
    if (!ledger?.rows?.length) return;
    try {
      const { generateLedgerPDFDoc } = await import('../../utils/pdfAndShareService.js');
      const partyName = ledger.customer?.name || ledger.supplier?.name || 'party';
      const doc = await generateLedgerPDFDoc(ledger);
      doc.save(`ledger_${partyName.replace(/\s+/g, '_')}_${today()}.pdf`);
    } catch (err) {
      setGlobalToast && setGlobalToast({ type: 'error', message: 'Failed to generate PDF: ' + (err.message || 'Unknown error') });
    }
  };

  const totalDebit  = ledger?.rows?.reduce((s, r) => s + money(r.debit), 0) || 0;
  const totalCredit = ledger?.rows?.reduce((s, r) => s + money(r.credit), 0) || 0;
  const closingBal  = ledger?.closing_balance || 0;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '16px 12px', fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0
        }}>
          <BookOpen size={18} />
        </div>
        <div>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: '#0f172a', letterSpacing: -0.4 }}>Party Ledger</h1>
          <p style={{ margin: 0, fontSize: 12, color: '#64748b' }}>Customer & Vendor running balance statement with live edit capability</p>
        </div>
      </div>

      {/* Controls */}
      <div style={{
        background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0',
        padding: '16px 20px', marginBottom: 20,
        boxShadow: '0 2px 12px rgba(15,23,42,0.06)'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          {/* Mode toggle */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>Party Type</label>
            <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
              {['customer', 'vendor'].map(m => (
                <button key={m} onClick={() => { setMode(m); setSelectedId(''); setLedger(null); }}
                  style={{
                    padding: '6px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                    background: mode === m ? '#6366f1' : 'transparent',
                    color: mode === m ? '#fff' : '#475569',
                    transition: 'all 0.2s'
                  }}>
                  {m === 'customer' ? 'Customer' : 'Vendor'}
                </button>
              ))}
            </div>
          </div>

          {/* Party Search Input */}
          <div style={{ flex: '1 1 280px', minWidth: 240 }}>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {mode === 'customer' ? 'Customer' : 'Vendor'}
            </label>
            <PartySearchInput
              mode={mode}
              partyList={partyList}
              selectedId={selectedId}
              onSelect={(id) => {
                setSelectedId(id || '');
                if (!id) setLedger(null);
              }}
            />
          </div>

          {/* Date range */}
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>From</label>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              style={{ padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>To</label>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              style={{ padding: '9px 10px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 13, fontWeight: 600, background: '#f8fafc', color: '#0f172a' }} />
          </div>

          <button onClick={fetchLedger} disabled={!selectedId || loading}
            style={{
              padding: '9px 20px', borderRadius: 10, border: 'none', cursor: selectedId ? 'pointer' : 'not-allowed',
              background: '#6366f1', color: '#fff', fontSize: 13, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 7, opacity: selectedId ? 1 : 0.5,
              boxShadow: '0 2px 8px rgba(99,102,241,0.35)'
            }}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? 'Loading…' : 'Load'}
          </button>

          {ledger?.rows?.length > 0 && (
            <>
              <button onClick={handleExportCSV}
                style={{
                  padding: '9px 16px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                  background: '#fff', color: '#475569', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer'
                }}>
                <Download size={14} /> CSV
              </button>
              <button onClick={handleExportPDF}
                style={{
                  padding: '9px 16px', borderRadius: 10, border: '1.5px solid #e2e8f0',
                  background: '#fff', color: '#6366f1', fontSize: 13, fontWeight: 700,
                  display: 'flex', alignItems: 'center', gap: 7, cursor: 'pointer'
                }}>
                <FileText size={14} /> PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '12px 16px', color: '#dc2626', fontSize: 13, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertCircle size={16} />{error}
        </div>
      )}

      {/* Summary cards */}
      {ledger && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12, marginBottom: 20 }}>
          {[
            ...(Number(ledger.opening_balance || 0) > 0 ? [{ label: 'Opening Balance', value: Number(ledger.opening_balance), icon: <BookOpen size={16} />, color: '#d97706', bg: '#fffbeb' }] : []),
            { label: 'Total Debit (Dr)', value: totalDebit, icon: <ArrowUpRight size={16} />, color: '#dc2626', bg: '#fef2f2' },
            { label: 'Total Credit (Cr)', value: totalCredit, icon: <ArrowDownRight size={16} />, color: '#16a34a', bg: '#dcfce7' },
            { label: 'Closing Balance', value: closingBal, icon: <ChevronsRight size={16} />, color: closingBal > 0 ? '#b45309' : '#16a34a', bg: closingBal > 0 ? '#fef3c7' : '#dcfce7' },
            ...(Number(ledger.advance_balance || 0) > 0 ? [{ label: 'Advance Credit', value: Number(ledger.advance_balance), icon: <TrendingDown size={16} />, color: '#2563eb', bg: '#eff6ff' }] : []),
            { label: 'Transactions', value: ledger.rows?.length || 0, icon: <FileText size={16} />, color: '#6366f1', bg: '#eef2ff', isCnt: true },
          ].map(c => (
            <div key={c.label} style={{
              background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
              padding: '14px 18px', boxShadow: '0 2px 8px rgba(15,23,42,0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{c.label}</span>
                <span style={{ color: c.color, background: c.bg, borderRadius: 8, padding: '3px 6px', display: 'flex' }}>{c.icon}</span>
              </div>
              <div style={{ fontSize: c.isCnt ? 22 : 18, fontWeight: 800, color: c.color, letterSpacing: -0.5 }}>
                {c.isCnt ? c.value : currency(c.value)}
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* Ledger table */}
      {ledger?.rows?.length > 0 ? (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 2px 12px rgba(15,23,42,0.06)' }}>
          {/* Party header */}
          <div style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', background: '#f8fafc', display: 'flex', alignItems: 'center', gap: 10 }}>
            <User size={16} color="#6366f1" />
            <strong style={{ fontSize: 14, color: '#0f172a' }}>
              {ledger.customer?.name || ledger.supplier?.name}
            </strong>
            {ledger.customer?.mobile && <span style={{ fontSize: 12, color: '#64748b' }}>· {ledger.customer.mobile}</span>}
            {(fromDate || toDate) && (
              <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 4 }}>
                <Calendar size={12} />
                {fromDate ? formatDMY(fromDate) : 'Beginning'} — {formatDMY(toDate)}
              </span>
            )}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Date', 'Ref No', 'Type', 'Description', 'Debit (Dr)', 'Credit (Cr)', 'Balance', 'Action'].map(h => (
                    <th key={h} style={{ 
                      padding: '10px 14px', 
                      textAlign: h === 'Debit (Dr)' || h === 'Credit (Cr)' || h === 'Balance' ? 'right' : h === 'Action' ? 'center' : 'left', 
                      fontWeight: 700, 
                      color: '#475569', 
                      fontSize: 11, 
                      textTransform: 'uppercase', 
                      letterSpacing: 0.4, 
                      borderBottom: '1px solid #e2e8f0', 
                      whiteSpace: 'nowrap' 
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ledger.rows.map((row, i) => {
                  const descParts = String(row.description || '').split(' → ');
                  const mainDesc = descParts[0];
                  const breakdown = row.allocation_breakdown || (descParts.length > 1 ? descParts[1].replace(' [REVERSED]', '') : null);

                  const isInvoice = row.type === 'Invoice' || row.entry_type === 'sale' || String(row.ref_no || '').startsWith('INV-');
                  const canEdit = !row.reversed && row.ref_no !== 'BAL-FWD' && row.entry_type !== 'reversal';

                  return (
                    <tr key={i} style={{ 
                      borderBottom: '1px solid #f1f5f9', 
                      background: row.entry_type === 'reversal' ? '#fffbeb' : '#fff',
                      transition: 'background 0.15s' 
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = row.entry_type === 'reversal' ? '#fef3c7' : '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.background = row.entry_type === 'reversal' ? '#fffbeb' : '#fff'}>
                      <td style={{ padding: '10px 14px', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{formatDMY(row.entry_date)}</td>
                      <td style={{ padding: '10px 14px', color: '#0f172a', fontWeight: 700, fontFamily: 'monospace', fontSize: 12 }}>
                        {isInvoice ? (
                          <button
                            type="button"
                            onClick={() => setActiveInvoiceRef(row.ref_no || String(row.id))}
                            className="text-sky-600 hover:text-sky-500 hover:underline cursor-pointer font-bold font-mono text-xs inline-flex items-center gap-1 text-left bg-transparent border-none p-0 transition-colors"
                            title={`View invoice ${row.ref_no}`}
                          >
                            <span>{row.ref_no}</span>
                            <ArrowUpRight size={12} className="opacity-70" />
                          </button>
                        ) : (
                          <span>{row.ref_no}</span>
                        )}
                      </td>
                      <td style={{ padding: '10px 14px' }}><TypeBadge type={row.entry_type} /></td>
                      <td style={{ padding: '10px 14px', color: '#334155', maxWidth: 320 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{
                            textDecoration: row.reversed ? 'line-through' : 'none',
                            color: row.reversed ? '#94a3b8' : '#0f172a',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            flexWrap: 'wrap'
                          }}>
                            {isInvoice ? (
                              <button
                                type="button"
                                onClick={() => setActiveInvoiceRef(row.ref_no || String(row.id))}
                                className="text-sky-600 hover:text-sky-500 hover:underline cursor-pointer text-left bg-transparent border-none p-0 transition-colors font-semibold"
                                title={`View invoice ${row.ref_no}`}
                              >
                                {mainDesc}
                              </button>
                            ) : (
                              <span>{mainDesc}</span>
                            )}
                            {row.reversed && (
                              <span style={{
                                fontSize: 9, fontWeight: 800, color: '#dc2626', background: '#fee2e2',
                                border: '1px solid #fca5a5', padding: '1px 5px', borderRadius: 4, textDecoration: 'none'
                              }}>
                                REVERSED
                              </span>
                            )}
                          </div>
                          {breakdown && (
                            <div style={{
                              fontSize: 11, color: '#4338ca', background: '#eef2ff',
                              borderRadius: 6, padding: '3px 8px', border: '1px solid #c7d2fe',
                              width: 'fit-content', lineHeight: 1.3
                            }}>
                              ↳ {renderBreakdownText(breakdown, setActiveInvoiceRef)}
                            </div>
                          )}
                        </div>
                      </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: money(row.debit) > 0 ? '#dc2626' : '#94a3b8', fontWeight: 700 }}>
                      {money(row.debit) > 0 ? currency(row.debit) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: money(row.credit) > 0 ? '#16a34a' : '#94a3b8', fontWeight: 700 }}>
                      {money(row.credit) > 0 ? currency(row.credit) : '—'}
                    </td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 800, color: money(row.running_balance) > 0 ? '#b45309' : money(row.running_balance) < 0 ? '#16a34a' : '#64748b', whiteSpace: 'nowrap' }}>
                      {currency(Math.abs(money(row.running_balance)))}
                      <span style={{ fontSize: 10, marginLeft: 3, color: '#94a3b8' }}>
                        {money(row.running_balance) > 0 ? 'Dr' : money(row.running_balance) < 0 ? 'Cr' : ''}
                      </span>
                    </td>
                    {/* Action Column */}
                    <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(row)}
                          style={{
                            padding: '4px 10px',
                            borderRadius: 8,
                            border: '1.5px solid #e0e7ff',
                            background: '#eef2ff',
                            color: '#4f46e5',
                            fontSize: 12,
                            fontWeight: 700,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 5,
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                            transition: 'all 0.15s ease',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#4f46e5'; e.currentTarget.style.color = '#fff'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.color = '#4f46e5'; }}
                          title={`Edit ${row.ref_no || 'entry'} details or numbers`}
                        >
                          <Edit3 size={12} />
                          <span>Edit</span>
                        </button>
                      ) : (
                        <span style={{ color: '#cbd5e1', fontSize: 11 }}>—</span>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: '#f8fafc', borderTop: '2px solid #e2e8f0' }}>
                  <td colSpan={4} style={{ padding: '12px 14px', fontWeight: 800, color: '#0f172a', fontSize: 13 }}>TOTALS</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#dc2626', fontSize: 14 }}>{currency(totalDebit)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, color: '#16a34a', fontSize: 14 }}>{currency(totalCredit)}</td>
                  <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 800, fontSize: 14, color: closingBal > 0 ? '#b45309' : '#16a34a' }}>
                    {currency(Math.abs(closingBal))} <span style={{ fontSize: 11 }}>{closingBal > 0 ? 'Dr' : closingBal < 0 ? 'Cr' : ''}</span>
                  </td>
                  <td style={{ padding: '12px 14px' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </motion.div>
      ) : selectedId && !loading && !error ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>
          <BookOpen size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 700 }}>No transactions found for this period.</div>
        </div>
      ) : !selectedId ? (
        <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 14 }}>
          <User size={36} style={{ opacity: 0.3, marginBottom: 12 }} />
          <div style={{ fontWeight: 700 }}>Select a {mode === 'customer' ? 'customer' : 'vendor'} to view their ledger.</div>
        </div>
      ) : null}

      {loading && (
        <div style={{ textAlign: 'center', padding: 48, color: '#6366f1', fontSize: 14 }}>
          <RefreshCw size={28} style={{ animation: 'spin 1s linear infinite', marginBottom: 10 }} />
          <div style={{ fontWeight: 700 }}>Loading ledger…</div>
        </div>
      )}

      {/* Invoice Detail Slide-over Drawer */}
      <InvoiceDetailDrawer
        isOpen={Boolean(activeInvoiceRef)}
        invoiceRef={activeInvoiceRef}
        onClose={() => setActiveInvoiceRef(null)}
        api={api}
        customer={ledger?.customer}
        shopId={ledger?.customer?.shop_id || session?.shop_id}
        setGlobalToast={setGlobalToast}
        onEditInvoice={(sale) => {
          if (typeof onEditSale === 'function') {
            onEditSale(sale);
          }
        }}
      />

      {/* Direct Edit Modal for Ledger Transactions */}
      <AnimatePresence>
        {editingRow && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 9999,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              background: 'rgba(15, 23, 42, 0.6)',
              backdropFilter: 'blur(4px)',
            }}
            onClick={() => !savingEdit && setEditingRow(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                position: 'relative',
                width: '100%',
                maxWidth: 480,
                background: '#fff',
                borderRadius: 20,
                border: '1px solid #e2e8f0',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden',
                fontFamily: "'Inter', system-ui, sans-serif",
              }}
            >
              {/* Modal Header */}
              <div
                style={{
                  padding: '16px 20px',
                  borderBottom: '1px solid #f1f5f9',
                  background: '#f8fafc',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      background: '#e0e7ff',
                      color: '#4338ca',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Edit3 size={18} />
                  </div>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#0f172a' }}>
                      Edit {editingRow.entry_type === 'payment' ? 'Payment' : editingRow.entry_type === 'credit_note' ? 'Credit Note' : editingRow.entry_type === 'opening_balance' ? 'Opening Balance' : editingRow.entry_type === 'debit_note' ? 'Debit Note' : editingRow.entry_type === 'purchase_bill' ? 'Purchase Bill' : 'Transaction'}
                    </h3>
                    <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'monospace', color: '#6366f1' }}>
                      {editingRow.ref_no}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => !savingEdit && setEditingRow(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: '#94a3b8',
                    padding: 4,
                  }}
                >
                  <X size={18} />
                </button>
              </div>

              {/* Modal Body Form */}
              <form onSubmit={handleSaveEdit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                {editError && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <AlertCircle size={15} />
                    <span>{editError}</span>
                  </div>
                )}

                {/* Amount Field */}
                {['payment', 'credit_note', 'opening_balance', 'purchase_bill', 'bill_payment', 'debit_note'].includes(editingRow.entry_type) && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Amount (₹) *
                    </label>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                      <span style={{ position: 'absolute', left: 12, fontWeight: 800, color: '#64748b', fontSize: 14 }}>₹</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        autoFocus
                        value={editFormData.amount ?? ''}
                        onChange={(e) => setEditFormData({ ...editFormData, amount: e.target.value })}
                        style={{
                          width: '100%',
                          padding: '10px 14px 10px 30px',
                          borderRadius: 10,
                          border: '1.5px solid #cbd5e1',
                          fontSize: 16,
                          fontWeight: 800,
                          color: '#0f172a',
                          background: '#f8fafc',
                          outline: 'none',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* Date Field */}
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                    Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={editFormData.entry_date || editFormData.payment_date || editFormData.return_date || editFormData.invoice_date || editFormData.bill_date || editFormData.opening_balance_date || ''}
                    onChange={(e) => {
                      const val = e.target.value;
                      setEditFormData({
                        ...editFormData,
                        entry_date: val,
                        payment_date: val,
                        return_date: val,
                        invoice_date: val,
                        bill_date: val,
                        opening_balance_date: val,
                      });
                    }}
                    style={{
                      width: '100%',
                      padding: '9px 12px',
                      borderRadius: 10,
                      border: '1.5px solid #cbd5e1',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#0f172a',
                      background: '#f8fafc',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* Payment Mode (for payments) */}
                {editingRow.entry_type === 'payment' && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Payment Mode
                    </label>
                    <select
                      value={editFormData.payment_mode || 'cash'}
                      onChange={(e) => setEditFormData({ ...editFormData, payment_mode: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1.5px solid #cbd5e1',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#0f172a',
                        background: '#f8fafc',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer (IMPS / NEFT / RTGS)</option>
                      <option value="upi">UPI / GPay / PhonePe</option>
                      <option value="cheque">Cheque</option>
                      <option value="card">Card</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                )}

                {/* Reference Number / Cheque No / UTR */}
                {editingRow.entry_type === 'payment' && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Reference / UTR / Cheque No (Optional)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. UTR12345678 or Cheque #0045"
                      value={editFormData.reference_number || ''}
                      onChange={(e) => setEditFormData({ ...editFormData, reference_number: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1.5px solid #cbd5e1',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#0f172a',
                        background: '#f8fafc',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                {/* Reason / Notes */}
                {(editingRow.entry_type === 'payment' || editingRow.entry_type === 'credit_note' || editingRow.entry_type === 'debit_note') && (
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      {editingRow.entry_type === 'credit_note' ? 'Return Reason / Notes' : 'Notes / Remarks'}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Customer return or Account adjustment"
                      value={editFormData.reason ?? editFormData.note ?? ''}
                      onChange={(e) => setEditFormData({ ...editFormData, reason: e.target.value, note: e.target.value })}
                      style={{
                        width: '100%',
                        padding: '9px 12px',
                        borderRadius: 10,
                        border: '1.5px solid #cbd5e1',
                        fontSize: 13,
                        fontWeight: 500,
                        color: '#0f172a',
                        background: '#f8fafc',
                        outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}

                {/* Footer Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 10, paddingTop: 14, borderTop: '1px solid #f1f5f9' }}>
                  <button
                    type="button"
                    disabled={savingEdit}
                    onClick={() => setEditingRow(null)}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 10,
                      border: '1.5px solid #e2e8f0',
                      background: '#fff',
                      color: '#64748b',
                      fontSize: 12,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingEdit}
                    style={{
                      padding: '8px 20px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#4f46e5',
                      color: '#fff',
                      fontSize: 12,
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      cursor: savingEdit ? 'not-allowed' : 'pointer',
                      boxShadow: '0 2px 8px rgba(79, 70, 229, 0.3)',
                    }}
                  >
                    {savingEdit ? (
                      <>
                        <RefreshCw size={13} className="animate-spin" />
                        <span>Saving…</span>
                      </>
                    ) : (
                      <>
                        <Check size={14} />
                        <span>Save Changes</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
