import { useState, useEffect, useMemo, useCallback } from 'react';
import { useOutletContext } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import StatCard from '../components/ui/StatCard';
import Badge from '../components/ui/Badge';
import Spinner from '../components/ui/Spinner';
import { ErrorAlert } from '../components/ui/Alert';

const PER_PAGE = 10;
const DOT = {
  paid: 'bg-emerald-500', pending: 'bg-amber-500', refunded: 'bg-blue-500',
  voided: 'bg-slate-400', fulfilled: 'bg-emerald-500', unfulfilled: 'bg-amber-500', partial: 'bg-blue-500',
};
const PAYMENT_OPTS = ['', 'paid', 'pending', 'refunded', 'voided'];
const FULFILL_OPTS = ['', 'fulfilled', 'unfulfilled', 'partial'];

const INIT_FILTERS = { order: '', customer: '', date: '', amount: '', payment: '', fulfillment: '', items: '' };

export default function Orders() {
  const { api } = useAuth();
  const { setOrderCount } = useOutletContext();

  const [orders, setOrders] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 50, totalPages: 1 });
  const [orderStats, setOrderStats] = useState({ total: 0, revenue: 0, fulfilled: 0, pending: 0, fulfillment_rate: 0 });
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState(INIT_FILTERS);
  const [sortCol, setSortCol] = useState('created_at');
  const [sortDir, setSortDir] = useState('DESC');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(50);
  const [openFilter, setOpenFilter] = useState(null);
  const [draftFilter, setDraftFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [actionLoading, setActionLoading] = useState(false);
  const [rmPanel, setRmPanel] = useState(false);
  const [rmDespatchDate, setRmDespatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [rmStep, setRmStep] = useState('idle'); // idle | creating | labelling | manifesting | done
  const [rmResults, setRmResults] = useState([]);
  const [rmIdentifiers, setRmIdentifiers] = useState([]);
  const [rmError, setRmError] = useState('');

  // ── Load orders from DB ──────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({
        page,
        limit,
        search,
        fulfillment_status: filters.fulfillment,
        financial_status: filters.payment,
        sort: sortCol === 'date' ? 'created_at' :
          sortCol === 'order' ? 'order_number' :
            sortCol === 'amount' ? 'total_price' :
              sortCol === 'payment' ? 'financial_status' :
                sortCol === 'fulfillment' ? 'fulfillment_status' : sortCol,
        direction: sortDir
      });

      const r = await api(`/api/orders?${params.toString()}`);
      const d = await r.json();
      if (r.ok) {
        setOrders(d.orders || []);
        setPagination(d.pagination);
        setOrderStats(d.stats);
        setOrderCount(d.pagination.total);
      } else {
        setError(d.message);
      }
    } catch {
      setError('Cannot connect to backend.');
    }
    setLoading(false);
  }, [api, setOrderCount, page, limit, search, filters, sortCol, sortDir]);

  // ── Sync from Shopify ────────────────────────────────────────────────────
  const syncOrders = useCallback(async () => {
    setSyncing(true);
    try {
      const r = await api('/api/orders/sync', { method: 'POST', body: {} });
      const d = await r.json();
      if (r.ok) await loadOrders();
      else setError(d.message);
    } catch {
      setError('Sync failed.');
    }
    setSyncing(false);
  }, [api, loadOrders]);

  useEffect(() => { loadOrders(); }, [loadOrders]);

  // Listen for topbar button events
  useEffect(() => {
    window.addEventListener('orders:refresh', loadOrders);
    window.addEventListener('orders:sync', syncOrders);
    return () => {
      window.removeEventListener('orders:refresh', loadOrders);
      window.removeEventListener('orders:sync', syncOrders);
    };
  }, [loadOrders, syncOrders]);

  // Close filter dropdown on outside click
  useEffect(() => {
    const handler = () => setOpenFilter(null);
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // ── Stats ────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = orders.length;
    const rev = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
    const ful = orders.filter(o => o.fulfillment_status === 'fulfilled').length;
    const pen = orders.filter(o => !o.fulfillment_status || o.fulfillment_status === 'unfulfilled').length;
    const pct = total ? Math.round((ful / total) * 100) : 0;
    const revFmt = rev >= 1000 ? `${(rev / 1000).toFixed(1)}k` : rev.toFixed(0);
    return { total, revFmt, ful, pen, pct };
  }, [orders]);

  const handleSort = (col) => {
    const dir = (sortCol === col && sortDir === 'ASC') ? 'DESC' : 'ASC';
    setSortCol(col);
    setSortDir(dir);
    setPage(1);
  };

  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  const handleFilterApply = (col, val) => {
    setFilters(f => ({ ...f, [col]: val }));
    setOpenFilter(null); setPage(1);
  };

  const clearAllFilters = () => {
    setFilters(INIT_FILTERS); setSearch(''); setSortCol('created_at'); setSortDir('DESC'); setPage(1); setLimit(50);
  };

  const toggleFilter = (e, col) => {
    e.stopPropagation();
    setDraftFilter(filters[col] || '');
    setOpenFilter(prev => prev === col ? null : col);
  };

  // ── Bulk selection ───────────────────────────────────────────────────────
  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (orders.every(o => selectedIds.has(o.id))) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(orders.map(o => o.id)));
    }
  };

  const allPageSelected = orders.length > 0 && orders.every(o => selectedIds.has(o.id));
  const somePageSelected = orders.some(o => selectedIds.has(o.id));

  // ── Bulk export actions ──────────────────────────────────────────────────
  const exportShippingCsv = async (carrier) => {
    setActionLoading(true);
    try {
      const r = await fetch('/api/orders/shipping-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ orderIds: [...selectedIds], carrier }),
      });
      if (!r.ok) throw new Error('CSV export failed');
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${carrier.replace(' ', '_')}_${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
    setActionLoading(false);
  };

  const openS17Slips = async () => {
    setActionLoading(true);
    try {
      const r = await fetch('/api/orders/s17-packingslips', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ orderIds: [...selectedIds] }),
      });
      if (!r.ok) throw new Error('Failed to generate packing slips');
      const html = await r.text();
      const win = window.open('', '_blank');
      win.document.write(html);
      win.document.close();
      win.print();
    } catch (e) { setError(e.message); }
    setActionLoading(false);
  };

  // ── Royal Mail automation ────────────────────────────────────────────────
  const rmCreateShipments = async () => {
    setRmStep('creating'); setRmError('');
    try {
      const r = await fetch('/api/orders/royal-mail-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ orderIds: [...selectedIds], despatchDate: rmDespatchDate }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.message);
      setRmResults(d.results || []);
      const ids = (d.results || []).filter(x => x.success && x.orderIdentifier).map(x => x.orderIdentifier);
      setRmIdentifiers(ids);
      setRmStep('done');
    } catch (e) { setRmError(e.message); setRmStep('idle'); }
  };

  const rmDownloadLabels = async () => {
    if (!rmIdentifiers.length) return;
    setRmStep('labelling'); setRmError('');
    try {
      const r = await fetch('/api/orders/royal-mail-labels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ rmOrderIdentifiers: rmIdentifiers }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.message); }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `royal_mail_labels_${rmDespatchDate}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setRmStep('done');
    } catch (e) { setRmError(e.message); setRmStep('done'); }
  };

  const rmCreateManifest = async () => {
    setRmStep('manifesting'); setRmError('');
    try {
      const r = await fetch('/api/orders/royal-mail-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({}),
      });
      if (r.headers.get('content-type')?.includes('application/pdf')) {
        const blob = await r.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `manifest_${rmDespatchDate}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const d = await r.json();
        if (!r.ok) throw new Error(d.message);
        // Show manifest number in error area as info
        setRmError(`Manifest created: ${d.manifestIdentifier || JSON.stringify(d)}`);
      }
      setRmStep('done');
    } catch (e) { setRmError(e.message); setRmStep('done'); }
  };

  if (loading) return <Spinner text="Loading orders from database…" />;

  return (
    <div className="space-y-5">
      {syncing && (
        <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl px-4 py-3 text-sm font-medium">
          <div className="w-4 h-4 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
          Syncing orders from Shopify…
        </div>
      )}
      <ErrorAlert message={error} />

      {/* Royal Mail fulfil panel */}
      {rmPanel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-5">

            {/* Header */}
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">🚀 Royal Mail Click &amp; Drop</h3>
                <p className="text-xs text-slate-500 mt-0.5">{selectedIds.size} orders selected</p>
              </div>
              <button onClick={() => setRmPanel(false)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">✕</button>
            </div>

            {/* Step 1 — despatch date */}
            {rmStep === 'idle' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Planned Despatch Date</label>
                  <input
                    type="date"
                    value={rmDespatchDate}
                    onChange={e => setRmDespatchDate(e.target.value)}
                    className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-orange-400"
                  />
                </div>
                <p className="text-xs text-slate-500">
                  This will create {selectedIds.size} shipment{selectedIds.size !== 1 ? 's' : ''} in Royal Mail Click &amp; Drop using service <strong>TPS48 (Tracked 48 Parcel)</strong>.
                </p>
                {rmError && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">{rmError}</p>}
                <button
                  onClick={rmCreateShipments}
                  className="w-full py-2.5 bg-orange-500 hover:bg-orange-600 text-white font-semibold text-sm rounded-xl transition"
                >
                  Create Shipments in Royal Mail →
                </button>
              </div>
            )}

            {/* Creating progress */}
            {rmStep === 'creating' && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-8 h-8 border-4 border-orange-200 border-t-orange-500 rounded-full animate-spin" />
                <p className="text-sm font-medium text-slate-700">Creating shipments in Royal Mail…</p>
                <p className="text-xs text-slate-400">This may take a moment for large batches.</p>
              </div>
            )}

            {/* Labelling progress */}
            {rmStep === 'labelling' && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-sm font-medium text-slate-700">Fetching and merging label PDFs…</p>
              </div>
            )}

            {/* Manifesting progress */}
            {rmStep === 'manifesting' && (
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="w-8 h-8 border-4 border-emerald-200 border-t-emerald-500 rounded-full animate-spin" />
                <p className="text-sm font-medium text-slate-700">Creating Royal Mail manifest…</p>
              </div>
            )}

            {/* Done — show results */}
            {rmStep === 'done' && (
              <div className="space-y-4">
                {/* Summary chips */}
                <div className="flex gap-2 flex-wrap">
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold">
                    ✅ {rmResults.filter(r => r.success).length} created
                  </span>
                  {rmResults.filter(r => !r.success).length > 0 && (
                    <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-semibold">
                      ✕ {rmResults.filter(r => !r.success).length} failed
                    </span>
                  )}
                </div>

                {/* Tracking numbers table */}
                {rmResults.length > 0 && (
                  <div className="overflow-auto max-h-48 rounded-xl border border-slate-200">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Order</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Tracking</th>
                          <th className="px-3 py-2 text-left font-semibold text-slate-600">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rmResults.map((r, i) => (
                          <tr key={i} className="border-b border-slate-100">
                            <td className="px-3 py-2 font-medium">#{r.orderNumber}</td>
                            <td className="px-3 py-2 font-mono text-slate-700">{r.trackingNumber || (r.error ? '—' : '…')}</td>
                            <td className="px-3 py-2">
                              {r.success
                                ? <span className="text-emerald-600 font-semibold">✅ OK</span>
                                : <span className="text-red-500" title={r.error}>✕ Failed</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {rmError && (
                  <p className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-xl px-3 py-2">{rmError}</p>
                )}

                {/* Action buttons */}
                <div className="flex gap-2 flex-wrap">
                  {rmIdentifiers.length > 0 && (
                    <button
                      onClick={rmDownloadLabels}
                      className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm rounded-xl transition"
                    >
                      🖨️ Download Labels PDF
                    </button>
                  )}
                  <button
                    onClick={rmCreateManifest}
                    className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition"
                  >
                    📋 Create &amp; Download Manifest
                  </button>
                </div>
                <button
                  onClick={() => setRmPanel(false)}
                  className="w-full py-2 text-slate-500 hover:text-slate-700 text-sm transition"
                >
                  Close
                </button>
              </div>
            )}

          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📦" value={orderStats.total} label="Total Orders" tag="All" tagCls="bg-indigo-50 text-indigo-600" borderCls="border-l-indigo-500" />
        <StatCard icon="💰" value={orderStats.revenue >= 1000 ? `${(orderStats.revenue / 1000).toFixed(1)}k` : orderStats.revenue.toFixed(0)} label="Total Revenue" tag="↑ Sales" tagCls="bg-emerald-50 text-emerald-600" borderCls="border-l-emerald-500" />
        <StatCard icon="✅" value={orderStats.fulfilled} label="Fulfilled" tag={`${orderStats.fulfillment_rate}%`} tagCls="bg-blue-50 text-blue-600" borderCls="border-l-blue-500" />
        <StatCard icon="⏳" value={orderStats.pending} label="Pending" tag="Open" tagCls="bg-amber-50 text-amber-600" borderCls="border-l-amber-500" />
      </div>

      {/* Floating selection action bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-slate-900 text-white rounded-2xl px-4 py-3 shadow-2xl text-sm flex-wrap justify-center">
          <span className="font-semibold text-slate-300 mr-1">{selectedIds.size} selected</span>
          <button
            onClick={() => exportShippingCsv('Royal Mail')}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-xs transition disabled:opacity-50"
          >
            📮 Royal Mail CSV
          </button>
          <button
            onClick={() => exportShippingCsv('DPD')}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-xs transition disabled:opacity-50"
          >
            🚚 DPD CSV
          </button>
          <button
            onClick={openS17Slips}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold text-xs transition disabled:opacity-50"
          >
            📦 S/17 Packing Slips
          </button>
          <button
            onClick={() => { setRmPanel(true); setRmStep('idle'); setRmResults([]); setRmIdentifiers([]); setRmError(''); }}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-xl font-semibold text-xs transition disabled:opacity-50"
          >
            🚀 Royal Mail Fulfil
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="ml-1 text-slate-400 hover:text-white transition text-lg leading-none"
            title="Clear selection"
          >
            ✕
          </button>
          {actionLoading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
        </div>
      )}

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">All Orders</h3>
            <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-2.5 py-1 rounded-full">
              {pagination.total} records
            </span>
            {activeFilterCount > 0 && (
              <span className="bg-amber-50 text-amber-600 text-xs font-bold px-2.5 py-1 rounded-full">
                {activeFilterCount} filter{activeFilterCount > 1 ? 's' : ''} active
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 sm:flex-none">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">🔍</span>
              <input
                type="text"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search order, customer…"
                className="w-full sm:w-64 pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-slate-400 transition"
              />
            </div>

            {activeFilterCount > 0 && (
              <button
                onClick={clearAllFilters}
                className="flex items-center gap-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-xl border border-red-200 transition"
              >
                ✕ Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
            <span className="text-4xl">📭</span>
            <p className="text-sm font-medium">No orders found</p>
            <p className="text-xs">Try adjusting your search or filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      ref={el => { if (el) el.indeterminate = somePageSelected && !allPageSelected; }}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                    />
                  </th>
                  <ThCell col="order" label="Order" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} />
                  <ThCell col="customer" label="Customer" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} />
                  <ThCell col="date" label="Date" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} responsive="hidden md:table-cell" />
                  <ThCell col="amount" label="Amount" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} />
                  <ThCell col="payment" label="Payment" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} responsive="hidden sm:table-cell" dropdownOpts={PAYMENT_OPTS} />
                  <ThCell col="fulfillment" label="Fulfillment" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} dropdownOpts={FULFILL_OPTS} />
                  <ThCell col="items" label="Items" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} responsive="hidden lg:table-cell" />
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <OrderRow
                    key={o.id}
                    order={o}
                    selected={selectedIds.has(o.id)}
                    onToggle={() => toggleSelect(o.id)}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          limit={limit}
          onLimit={l => { setLimit(l); setPage(1); }}
          start={(pagination.page - 1) * pagination.limit}
          end={Math.min(pagination.page * pagination.limit, pagination.total)}
          onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
        />
      </div>
    </div>
  );
}

// ── Order row ─────────────────────────────────────────────────────────────────
function OrderRow({ order: o, selected, onToggle }) {
  const fin = o.financial_status || 'pending';
  const ful = o.fulfillment_status || 'unfulfilled';
  const dt = new Date(o.created_at);
  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50/70 transition-colors ${selected ? 'bg-indigo-50/60' : ''}`}>
      <td className="px-4 py-3.5 w-10">
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggle}
          className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
        />
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT[fin] || 'bg-slate-400'}`} />
          <span className="text-sm font-bold text-indigo-600">#{o.order_number}</span>
        </div>
      </td>
      <td className="px-4 py-3.5">
        {o.customer ? (
          <>
            <div className="font-semibold text-slate-800 text-sm leading-tight">
              {o.customer.first_name} {o.customer.last_name}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{o.customer.email || '—'}</div>
          </>
        ) : (
          <>
            <div className="font-semibold text-slate-800 text-sm">Guest</div>
            <div className="text-xs text-slate-400">—</div>
          </>
        )}
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap hidden md:table-cell">
        <div className="text-sm text-slate-700 font-medium">
          {dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
        <div className="text-xs text-slate-400 mt-0.5">
          {dt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap">
        <span className="text-sm font-extrabold text-slate-800">
          <span className="text-xs font-normal text-slate-400 mr-0.5">{o.currency}</span>
          {parseFloat(o.total_price || 0).toFixed(2)}
        </span>
      </td>
      <td className="px-4 py-3.5 whitespace-nowrap hidden sm:table-cell"><Badge value={fin} /></td>
      <td className="px-4 py-3.5 whitespace-nowrap"><Badge value={ful} /></td>
      <td className="px-4 py-3.5 whitespace-nowrap hidden lg:table-cell">
        <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-full">
          📦 {o.line_items?.length ?? '—'}
        </span>
      </td>
    </tr>
  );
}

// ── Table header cell with sort + filter ──────────────────────────────────────
function ThCell({ col, label, sortCol, sortDir, onSort, filters, openFilter, onToggleFilter, onApply, draftFilter, setDraftFilter, responsive = '', dropdownOpts = null }) {
  const isActive = sortCol === col;
  const filterActive = filters[col] !== '';
  const isOpen = openFilter === col;

  const SortIcon = () => {
    const base = 'w-3.5 h-3.5 flex-shrink-0';
    if (!isActive) return (
      <svg className={`${base} text-slate-400`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4M8 15l4 4 4-4" />
      </svg>
    );
    return (
      <svg className={`${base} text-indigo-600`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {sortDir === 'asc'
          ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
          : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />}
      </svg>
    );
  };

  return (
    <th className={`px-4 py-3 ${responsive}`}>
      <div className="relative flex items-center gap-1.5 select-none">
        <button
          onClick={() => onSort(col)}
          className="flex items-center gap-1 text-xs font-bold text-slate-500 uppercase tracking-wider hover:text-slate-800 transition"
        >
          {label} <SortIcon />
        </button>
        <button
          onClick={e => onToggleFilter(e, col)}
          className={`flex items-center justify-center w-5 h-5 rounded-md transition ${filterActive ? 'bg-indigo-100' : 'hover:bg-slate-100'}`}
        >
          <svg className={`w-3 h-3 flex-shrink-0 ${filterActive ? 'text-indigo-600' : 'text-slate-400'}`}
            fill={filterActive ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" />
          </svg>
        </button>

        {isOpen && (
          <div
            className="absolute top-full left-0 mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            {dropdownOpts ? (
              <div className="min-w-[140px] py-1">
                {dropdownOpts.map(opt => (
                  <button
                    key={opt}
                    onClick={() => onApply(col, opt)}
                    className={`w-full text-left px-3 py-2 text-xs font-medium transition-colors capitalize
                      ${filters[col] === opt ? 'bg-indigo-50 text-indigo-700 font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}
                  >
                    {opt === '' ? <span className="text-slate-400">All</span> : opt}
                  </button>
                ))}
              </div>
            ) : (
              <div className="w-52 p-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Filter by {label}</p>
                <input
                  type="text"
                  value={draftFilter}
                  onChange={e => setDraftFilter(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') onApply(col, draftFilter.trim());
                    if (e.key === 'Escape') onApply(col, filters[col]);
                  }}
                  placeholder="Type and press Enter…"
                  autoFocus
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 placeholder-slate-400 transition"
                />
                <div className="flex gap-2 mt-2">
                  <button onClick={() => onApply(col, draftFilter.trim())} className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition">Apply</button>
                  <button onClick={() => { setDraftFilter(''); onApply(col, ''); }} className="flex-1 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition">Clear</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </th>
  );
}

// ── Pagination ────────────────────────────────────────────────────────────────
function Pagination({ page, totalPages, total, limit, onLimit, start, end, onPage }) {
  const nums = (() => {
    const range = [];
    for (let i = 1; i <= totalPages; i++) {
      if (i === 1 || i === totalPages || i === page) {
        range.push(i);
      }
    }
    const res = [];
    let prev;
    for (let i of range) {
      if (prev !== undefined) {
        if (i - prev === 2) res.push(prev + 1);
        else if (i - prev > 2) res.push('...');
      }
      res.push(i);
      prev = i;
    }
    return res;
  })();

  const btnBase = 'inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-all border';

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50/50">
      <div className="flex items-center gap-4">
        <p className="text-sm text-slate-500">
          Showing <span className="font-semibold text-slate-700">{total === 0 ? 0 : start + 1}–{end}</span> of{' '}
          <span className="font-semibold text-slate-700">{total}</span> orders
        </p>

        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Show:</span>
          <select
            value={limit}
            onChange={e => onLimit(Number(e.target.value))}
            className="bg-white border border-slate-200 text-slate-700 text-[11px] font-bold rounded-lg px-2 py-1 focus:ring-2 focus:ring-indigo-400 outline-none transition cursor-pointer"
          >
            {[10, 25, 50, 100, 250, 500, 10000].map(v => (
              <option key={v} value={v}>{v === 10000 ? '10k' : v}</option>
            ))}
          </select>
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <button
            onClick={() => onPage(page - 1)} disabled={page === 1}
            className={`${btnBase} bg-white border-slate-200 text-slate-600 hover:bg-slate-50 ${page === 1 ? 'opacity-40 cursor-not-allowed' : ''}`}
          >‹ Prev</button>
          {nums.map((n, i) => n === '...'
            ? <span key={i} className="px-1 text-slate-400 text-sm">…</span>
            : <button key={n} onClick={() => onPage(n)}
              className={`${btnBase} ${n === page ? 'bg-indigo-600 border-indigo-600 text-white font-bold shadow-sm' : 'bg-white border-slate-200 text-slate-600 hover:bg-indigo-50 hover:border-indigo-300 hover:text-indigo-600'}`}
            >{n}</button>
          )}
          <button
            onClick={() => onPage(page + 1)} disabled={page === totalPages}
            className={`${btnBase} bg-white border-slate-200 text-slate-600 hover:bg-slate-50 ${page === totalPages ? 'opacity-40 cursor-not-allowed' : ''}`}
          >Next ›</button>
        </div>
      )}
    </div>
  );
}
