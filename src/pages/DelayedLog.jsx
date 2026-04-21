import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import Spinner from '../components/ui/Spinner';
import { ErrorAlert, SuccessAlert } from '../components/ui/Alert';

const EMPTY = { orderId: '', orderNumber: '', customerName: '', reason: '', delayUntil: '' };

export default function DelayedLog() {
  const { api } = useAuth();
  const [entries, setEntries]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [form, setForm]         = useState(EMPTY);
  const [adding, setAdding]     = useState(false);
  const [tagging, setTagging]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState('');

  const loadLog = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api('/api/delayed');
      const d = await r.json();
      if (r.ok) setEntries(d.entries || []);
      else setError(d.message);
    } catch { setError('Cannot connect to backend.'); }
    setLoading(false);
  }, [api]);

  useEffect(() => { loadLog(); }, [loadLog]);

  const handleAdd = async (e) => {
    e.preventDefault();
    if (!form.orderId.trim()) { setError('Order ID is required.'); return; }
    setAdding(true); setError(''); setSuccess('');
    try {
      const r = await api('/api/delayed', { method: 'POST', body: form });
      const d = await r.json();
      if (r.ok) {
        setSuccess(`Order #${form.orderNumber || form.orderId} added to delayed log.`);
        setForm(EMPTY);
        setEntries(d.entries || []);
      } else setError(d.message);
    } catch { setError('Failed to add entry.'); }
    setAdding(false);
  };

  const handleRemove = async (orderId, orderNum) => {
    if (!confirm(`Remove order #${orderNum || orderId} from delayed log?`)) return;
    try {
      const r = await api(`/api/delayed/${orderId}`, { method: 'DELETE', body: {} });
      const d = await r.json();
      if (r.ok) { setEntries(d.entries || []); setSuccess('Order removed from delayed log.'); }
      else setError(d.message);
    } catch { setError('Failed to remove entry.'); }
  };

  const handleBulkTag = async () => {
    setTagging(true); setError(''); setSuccess('');
    try {
      const r = await api('/api/delayed/bulk-tag', { method: 'POST', body: {} });
      const d = await r.json();
      if (r.ok) setSuccess(d.message);
      else setError(d.message);
    } catch { setError('Failed to tag orders.'); }
    setTagging(false);
  };

  const fmtDate = (iso) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  return (
    <div className="max-w-5xl space-y-5">

      {/* Add entry card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 bg-slate-50 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-amber-100 flex items-center justify-center text-lg">⏸️</div>
          <div>
            <h4 className="text-sm font-bold text-slate-800">Add Order to Delayed Log</h4>
            <p className="text-xs text-slate-400 mt-0.5">Manually log an order that should not be shipped yet</p>
          </div>
        </div>
        <form onSubmit={handleAdd} className="px-5 py-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Field label="Order ID (Shopify)" value={form.orderId}       onChange={v => setForm(f => ({ ...f, orderId: v }))}       placeholder="e.g. 5678901234" />
            <Field label="Order Number"       value={form.orderNumber}   onChange={v => setForm(f => ({ ...f, orderNumber: v }))}   placeholder="e.g. 1234" />
            <Field label="Customer Name"      value={form.customerName}  onChange={v => setForm(f => ({ ...f, customerName: v }))}  placeholder="e.g. Jane Smith" />
            <Field label="Delay Until" type="date" value={form.delayUntil} onChange={v => setForm(f => ({ ...f, delayUntil: v }))} />
          </div>
          <Field label="Reason" value={form.reason} onChange={v => setForm(f => ({ ...f, reason: v }))} placeholder="e.g. Customer requested delay until after holiday" />

          <ErrorAlert message={error} />
          <SuccessAlert message={success} />

          <button
            type="submit"
            disabled={adding}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
          >
            {adding ? 'Adding…' : 'Add to Delayed Log'}
          </button>
        </form>
      </div>

      {/* Table header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-sm font-bold text-slate-800">
          Delayed Orders Log
          {entries.length > 0 && (
            <span className="ml-2 bg-amber-50 text-amber-600 text-xs font-bold px-2.5 py-1 rounded-full">{entries.length}</span>
          )}
        </h3>
        <div className="flex gap-2">
          <button
            onClick={handleBulkTag}
            disabled={tagging || entries.length === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition disabled:opacity-50"
          >
            {tagging ? 'Tagging…' : '🏷️ Tag All in Shopify'}
          </button>
          <button
            onClick={loadLog}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-xl transition"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <Spinner text="Loading delayed log…" />
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <span className="text-4xl">✅</span>
            <p className="text-sm font-medium">No delayed orders</p>
            <p className="text-xs">All orders are clear to ship</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Order', 'Customer', 'Reason', 'Delay Until', 'Added', 'Action'].map(h => (
                    <th key={h} className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map(e => (
                  <tr key={e.orderId} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-sm font-bold text-indigo-600">#{e.orderNumber || e.orderId}</td>
                    <td className="px-4 py-3 text-sm text-slate-700">{e.customerName || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-xs truncate">{e.reason || '—'}</td>
                    <td className="px-4 py-3 text-sm text-slate-500">{e.delayUntil ? fmtDate(e.delayUntil) : '—'}</td>
                    <td className="px-4 py-3 text-xs text-slate-400">{fmtDate(e.addedAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleRemove(e.orderId, e.orderNumber)}
                        className="text-xs font-semibold text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder = '', type = 'text' }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-slate-400 transition"
      />
    </div>
  );
}
