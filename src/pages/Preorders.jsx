import { useState, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { ErrorAlert, SuccessAlert, WarnAlert } from '../components/ui/Alert';
import Spinner from '../components/ui/Spinner';

const STEPS = [
  'Receive Variety List',
  'Filter by Variety',
  'Decide Batch Volume',
  'Check Delayed Log',
  'Generate Pick List',
  'Hort Team Review',
  'Packing Slip',
  'Shipping CSV',
  'Bulk Tag Orders',
  'Mark Fulfilled',
];

const today = () => new Date().toISOString().split('T')[0];
const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtShipTag = (date) => {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y.slice(2)}`;
};

const INIT_STATE = {
  step: 1,
  type: 'seedling',
  dateFrom: '',
  dateTo: today(),
  excludeExact: '',
  excludeKeywords: '',
  filteredOrders: [],
  batchOrders: [],
  batchSize: 50,
  picklistOrders: [],
  summary: [],
  shippingDate: today(),
  limitRulesText: '',
};

export default function Preorders() {
  const { api } = useAuth();
  const [state, setState] = useState(INIT_STATE);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState([]);

  const set = (patch) => setState(s => ({ ...s, ...patch }));

  const addLog = (msg, type = 'info') => {
    setLog(l => [{ msg, type, ts: new Date().toLocaleTimeString() }, ...l]);
  };

  const goStep = (n) => set({ step: n });

  const resetBatch = () => {
    setState(INIT_STATE);
    setLog([]);
  };

  // ── Step 2: fetch & filter ──────────────────────────────────────────────
  const fetchFiltered = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/api/preorders/filter', {
        method: 'POST',
        body: {
          type: state.type,
          dateFrom: state.dateFrom,
          dateTo: state.dateTo,
          excludeExact: state.excludeExact.split('\n').map(s => s.trim()).filter(Boolean),
          excludeKeywords: state.excludeKeywords.split('\n').map(s => s.trim()).filter(Boolean),
        },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      set({ filteredOrders: d.orders, step: 3 });
      addLog(`Fetched ${d.total} preorders after filtering.`, 'success');
    } catch (e) { addLog(e.message, 'error'); }
    setLoading(false);
  }, [api, state]);

  // ── Step 3: slice batch ─────────────────────────────────────────────────
  const sliceBatch = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/api/preorders/batch', {
        method: 'POST',
        body: { orders: state.filteredOrders, batchSize: Number(state.batchSize) },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      set({ batchOrders: d.batch, step: 4 });
      addLog(`Batch of ${d.batchTotal} orders confirmed.`, 'success');
    } catch (e) { addLog(e.message, 'error'); }
    setLoading(false);
  }, [api, state]);

  // ── Step 4: delayed check ───────────────────────────────────────────────
  const checkDelayed = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/api/delayed');
      const d = await r.json();
      const delayedIds = new Set((d.entries || []).map(e => String(e.orderId)));
      const clean = state.batchOrders.filter(o => !delayedIds.has(String(o.id)));
      const removed = state.batchOrders.length - clean.length;
      set({ batchOrders: clean, step: 5 });
      addLog(`Delayed check: removed ${removed} delayed orders. ${clean.length} remain.`, removed > 0 ? 'warn' : 'success');
    } catch (e) { addLog(e.message, 'error'); }
    setLoading(false);
  }, [api, state]);

  // ── Step 5: pick list ───────────────────────────────────────────────────
  const generatePicklist = useCallback(async () => {
    setLoading(true);
    try {
      const limitRules = state.limitRulesText.split('\n').map(l => {
        const [name, qty] = l.split(':').map(s => s.trim());
        return { keyword: name, maxQty: parseInt(qty) || 0 };
      }).filter(r => r.keyword && r.maxQty > 0);

      const r = await api('/api/preorders/picklist', {
        method: 'POST',
        body: { orders: state.batchOrders, limitRules },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      set({ picklistOrders: d.orders, summary: d.summary, step: 6 });
      addLog(`Pick list: ${d.orders.length} orders, ${d.totalQty} items across ${d.summary.length} varieties.`, 'success');
    } catch (e) { addLog(e.message, 'error'); }
    setLoading(false);
  }, [api, state]);

  // ── Step 7: packing slip ────────────────────────────────────────────────
  const openPackingSlip = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/preorders/packingslip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ orders: state.picklistOrders, shippingDate: fmtDate(state.shippingDate) }),
      });
      if (!r.ok) throw new Error('Failed to generate packing slip');
      const html = await r.text();
      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
      win.print();
      addLog('Packing slip opened for printing.', 'success');
    } catch (e) { addLog(e.message, 'error'); }
    setLoading(false);
  }, [state]);

  // ── Step 8: download CSV ────────────────────────────────────────────────
  const downloadCSV = useCallback(async (carrier) => {
    setLoading(true);
    try {
      const shipTag = fmtShipTag(state.shippingDate);
      const r = await fetch('/api/preorders/shipping-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ orders: state.picklistOrders, carrier, shippingDate: shipTag }),
      });
      if (!r.ok) throw new Error('Failed to generate CSV');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${carrier.replace(' ', '_')}_${shipTag.replace(/\//g, '-')}.csv`;
      a.click(); URL.revokeObjectURL(url);
      addLog(`${carrier} CSV downloaded.`, 'success');
    } catch (e) { addLog(e.message, 'error'); }
    setLoading(false);
  }, [state]);

  // ── Step 9: bulk tag ────────────────────────────────────────────────────
  const bulkTag = useCallback(async () => {
    setLoading(true);
    try {
      const shipTag = fmtShipTag(state.shippingDate);
      const r = await api('/api/preorders/tag', {
        method: 'POST',
        body: { orderIds: state.picklistOrders.map(o => o.id), shippingDate: shipTag },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      set({ step: 10 });
      addLog(`Tagged ${d.succeeded} orders with "${d.tag}".`, 'success');
    } catch (e) { addLog(e.message, 'error'); }
    setLoading(false);
  }, [api, state]);

  // ── Step 10: fulfill ────────────────────────────────────────────────────
  const fulfillOrders = useCallback(async (notify) => {
    setLoading(true);
    try {
      const r = await api('/api/preorders/fulfill', {
        method: 'POST',
        body: { orderIds: state.picklistOrders.map(o => o.id), notifyCustomer: notify },
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      addLog(`Batch complete! ${d.succeeded} orders fulfilled.`, 'success');
    } catch (e) { addLog(e.message, 'error'); }
    setLoading(false);
  }, [api, state]);

  const pct = Math.round((state.step / 10) * 100);

  return (
    <div className="max-w-4xl space-y-5">

      {/* Progress */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-800">Preorder Batch Progress</h3>
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full">
            Step {state.step} of 10 — {STEPS[state.step - 1]}
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-2">
          <div className="bg-indigo-600 h-2 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between mt-2">
          {STEPS.map((_, i) => (
            <span key={i} className={`text-xs font-bold ${i + 1 <= state.step ? 'text-indigo-600' : 'text-slate-300'}`}>{i + 1}</span>
          ))}
        </div>
      </div>

      {/* Step panel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-slate-50 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-sm font-bold">{state.step}</div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">{STEPS[state.step - 1]}</h4>
          </div>
        </div>
        <div className="px-5 py-5">
          {loading ? <Spinner text="Processing…" /> : <StepContent state={state} set={set} goStep={goStep} fetchFiltered={fetchFiltered} sliceBatch={sliceBatch} checkDelayed={checkDelayed} generatePicklist={generatePicklist} openPackingSlip={openPackingSlip} downloadCSV={downloadCSV} bulkTag={bulkTag} fulfillOrders={fulfillOrders} resetBatch={resetBatch} />}
        </div>
      </div>

      {/* Action log */}
      {log.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Action Log</h4>
          {log.map((l, i) => (
            <div key={i} className={`flex items-start gap-2 border rounded-xl px-4 py-2.5 text-sm font-medium
              ${l.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : l.type === 'error'   ? 'bg-red-50 border-red-200 text-red-600'
              : l.type === 'warn'    ? 'bg-amber-50 border-amber-200 text-amber-700'
              : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
              <span className="text-xs text-slate-400 whitespace-nowrap mt-0.5">{l.ts}</span>
              <span>{l.msg}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Step content router ───────────────────────────────────────────────────────
function StepContent({ state, set, goStep, fetchFiltered, sliceBatch, checkDelayed, generatePicklist, openPackingSlip, downloadCSV, bulkTag, fulfillOrders, resetBatch }) {
  const [confirmed, setConfirmed] = useState(false);
  const [notifyCustomer, setNotifyCustomer] = useState(true);

  const Btn = ({ onClick, children, variant = 'primary', disabled = false }) => (
    <button onClick={onClick} disabled={disabled}
      className={`px-5 py-2.5 text-sm font-semibold rounded-xl transition disabled:opacity-50 disabled:cursor-not-allowed
        ${variant === 'primary' ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
        : variant === 'danger'  ? 'bg-red-50 hover:bg-red-100 text-red-600 border border-red-200'
        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'}`}>
      {children}
    </button>
  );

  const Textarea = ({ label, hint, value, onChange, placeholder, rows = 4 }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">{label}</label>
      {hint && <p className="text-xs text-slate-400 mb-2">{hint}</p>}
      <textarea rows={rows} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-400 resize-none transition" />
    </div>
  );

  const VarietyTable = ({ summary }) => {
    if (!summary?.length) return <p className="text-sm text-slate-400">No variety data.</p>;
    const total = summary.reduce((s, v) => s + v.quantity, 0);
    return (
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="bg-slate-50 px-3 py-2 border-b border-slate-200 flex justify-between">
          <span className="text-xs font-semibold text-slate-500">Variety Summary</span>
          <span className="text-xs font-semibold text-slate-500">Total: {total} items</span>
        </div>
        <div className="overflow-x-auto max-h-60 overflow-y-auto">
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-xs font-bold text-slate-400">Variety</th>
                <th className="px-3 py-2 text-xs font-bold text-slate-400 text-right">Qty</th>
                <th className="px-3 py-2 text-xs font-bold text-slate-400 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((v, i) => (
                <tr key={i} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 text-sm text-slate-800">{v.variety}</td>
                  <td className="px-3 py-2 text-sm font-bold text-indigo-600 text-right">{v.quantity}</td>
                  <td className="px-3 py-2 text-xs text-slate-400 text-right">{Math.round((v.quantity / total) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  switch (state.step) {

    case 1: return (
      <div className="space-y-4">
        <WarnAlert message="Do not proceed until you have received the confirmed variety list from the horticulture team." />
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm font-medium text-slate-700">I have received the variety list from the hort team.</span>
        </label>
        <Btn onClick={() => goStep(2)} disabled={!confirmed}>Proceed to Step 2 →</Btn>
      </div>
    );

    case 2: return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Preorder Type</label>
            <select value={state.type} onChange={e => set({ type: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400">
              <option value="seedling">Seedling Preorders</option>
              <option value="potplant">Pot Plant Preorders</option>
              <option value="all">All Preorders</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date From</label>
            <input type="date" value={state.dateFrom} onChange={e => set({ dateFrom: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Date To</label>
            <input type="date" value={state.dateTo} onChange={e => set({ dateTo: e.target.value })}
              className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Textarea label="Exclude — Exact Product Names" hint="One per line. Case-insensitive exact match." value={state.excludeExact} onChange={v => set({ excludeExact: v })} placeholder={"Set of three Carolina Reaper seedlings\nGhost Pepper seedling pack"} />
          <Textarea label="Exclude — Free Text Keywords" hint="One per line. Matches any product title containing this word." value={state.excludeKeywords} onChange={v => set({ excludeKeywords: v })} placeholder={"Reaper seedlings\nGhost Pepper"} />
        </div>
        <div className="flex gap-3">
          <Btn onClick={fetchFiltered}>Fetch & Filter Orders</Btn>
          <Btn variant="secondary" onClick={() => goStep(1)}>← Back</Btn>
        </div>
      </div>
    );

    case 3: return (
      <div className="space-y-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-700">
          ℹ️ <strong>{state.filteredOrders.length}</strong> eligible preorders found. Choose a realistic batch size.
        </div>
        <div className="max-w-xs">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Batch Size</label>
          <input type="number" min="1" value={state.batchSize} onChange={e => set({ batchSize: e.target.value })}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div className="flex gap-3">
          <Btn onClick={sliceBatch}>Confirm Batch →</Btn>
          <Btn variant="secondary" onClick={() => goStep(2)}>← Back</Btn>
        </div>
      </div>
    );

    case 4: return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          ⚠️ Orders in the Delayed Shipping Log are automatically removed. This step confirms the check.
        </div>
        <p className="text-sm text-slate-600">Batch currently has <strong>{state.batchOrders.length}</strong> orders.</p>
        <div className="flex gap-3">
          <Btn onClick={checkDelayed}>Run Delayed Check</Btn>
          <Btn variant="secondary" onClick={() => goStep(3)}>← Back</Btn>
        </div>
      </div>
    );

    case 5: return (
      <div className="space-y-4">
        <Textarea label="Quantity Limits (optional)" hint='Format: "variety name: max qty" — one per line' value={state.limitRulesText} onChange={v => set({ limitRulesText: v })} placeholder={"Carolina Reaper seedlings: 20\nGhost Pepper: 15"} rows={3} />
        <div className="flex gap-3">
          <Btn onClick={generatePicklist}>Generate Pick List</Btn>
          <Btn variant="secondary" onClick={() => goStep(4)}>← Back</Btn>
        </div>
      </div>
    );

    case 6: return (
      <div className="space-y-4">
        <VarietyTable summary={state.summary} />
        <p className="text-xs text-slate-500">Share this summary with the hort team. Apply any changes below, then confirm.</p>
        <div className="flex gap-3 flex-wrap">
          <Btn onClick={() => goStep(7)}>All Good — Proceed to Step 7 →</Btn>
          <Btn variant="secondary" onClick={() => goStep(5)}>← Re-generate Pick List</Btn>
        </div>
      </div>
    );

    case 7: return (
      <div className="space-y-4">
        <div className="max-w-xs">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Shipping Date</label>
          <input type="date" value={state.shippingDate} onChange={e => set({ shippingDate: e.target.value })}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
        </div>
        <div className="flex gap-3 flex-wrap">
          <Btn onClick={openPackingSlip}>🖨️ Generate & Print Packing Slip</Btn>
          <Btn onClick={() => goStep(8)}>Proceed to Step 8 →</Btn>
          <Btn variant="secondary" onClick={() => goStep(6)}>← Back</Btn>
        </div>
      </div>
    );

    case 8: return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2"><span className="text-lg">📮</span><h5 className="text-sm font-bold text-slate-800">Royal Mail</h5></div>
            <p className="text-xs text-slate-500">RM 48hr format CSV</p>
            <Btn onClick={() => downloadCSV('Royal Mail')}>Download Royal Mail CSV</Btn>
          </div>
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2"><span className="text-lg">🚚</span><h5 className="text-sm font-bold text-slate-800">DPD</h5></div>
            <p className="text-xs text-slate-500">DPD standard format CSV</p>
            <Btn onClick={() => downloadCSV('DPD')}>Download DPD CSV</Btn>
          </div>
        </div>
        <div className="flex gap-3">
          <Btn onClick={() => goStep(9)}>Proceed to Step 9 →</Btn>
          <Btn variant="secondary" onClick={() => goStep(7)}>← Back</Btn>
        </div>
      </div>
    );

    case 9: return (
      <div className="space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
          ⚠️ This will tag <strong>{state.picklistOrders.length}</strong> orders with <strong>"SEND {fmtShipTag(state.shippingDate)}"</strong> in Shopify.
        </div>
        <div className="flex gap-3">
          <Btn onClick={bulkTag}>🏷️ Tag {state.picklistOrders.length} Orders in Shopify</Btn>
          <Btn variant="secondary" onClick={() => goStep(8)}>← Back</Btn>
        </div>
      </div>
    );

    case 10: return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          ⚠️ Only run this <strong>after</strong> all orders have been physically packed and dispatched.
        </div>
        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={notifyCustomer} onChange={e => setNotifyCustomer(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          <span className="text-sm font-medium text-slate-700">Notify customers by email when fulfilled</span>
        </label>
        <div className="flex gap-3 flex-wrap">
          <Btn onClick={() => fulfillOrders(notifyCustomer)}>✅ Mark {state.picklistOrders.length} Orders as Fulfilled</Btn>
          <Btn variant="secondary" onClick={() => goStep(9)}>← Back</Btn>
          <Btn variant="secondary" onClick={resetBatch}>Start New Batch</Btn>
        </div>
      </div>
    );

    default: return null;
  }
}
