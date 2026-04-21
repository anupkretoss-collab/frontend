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
const FULFILL_OPTS  = ['', 'fulfilled', 'unfulfilled', 'partial'];

const INIT_FILTERS = { order: '', customer: '', date: '', amount: '', payment: '', fulfillment: '', items: '' };

export default function Orders() {
  const { api } = useAuth();
  const { setOrderCount } = useOutletContext();

  const [orders, setOrders]       = useState([]);
  const [loading, setLoading]     = useState(true);
  const [syncing, setSyncing]     = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [filters, setFilters]     = useState(INIT_FILTERS);
  const [sortCol, setSortCol]     = useState('date');
  const [sortDir, setSortDir]     = useState('desc');
  const [page, setPage]           = useState(1);
  const [openFilter, setOpenFilter] = useState(null);
  const [draftFilter, setDraftFilter] = useState('');

  // ── Load orders from DB ──────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const r = await api('/api/orders');
      const d = await r.json();
      if (r.ok) {
        setOrders(d.orders || []);
        setOrderCount((d.orders || []).length);
      } else {
        setError(d.message);
      }
    } catch {
      setError('Cannot connect to backend.');
    }
    setLoading(false);
  }, [api, setOrderCount]);

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
    const rev   = orders.reduce((s, o) => s + parseFloat(o.total_price || 0), 0);
    const ful   = orders.filter(o => o.fulfillment_status === 'fulfilled').length;
    const pen   = orders.filter(o => !o.fulfillment_status || o.fulfillment_status === 'unfulfilled').length;
    const pct   = total ? Math.round((ful / total) * 100) : 0;
    const revFmt = rev >= 1000 ? `${(rev / 1000).toFixed(1)}k` : rev.toFixed(0);
    return { total, revFmt, ful, pen, pct };
  }, [orders]);

  // ── Filter + sort ────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    let list = orders.filter(o => {
      if (q) {
        const name = o.customer ? `${o.customer.first_name} ${o.customer.last_name}`.toLowerCase() : '';
        const email = (o.customer?.email || '').toLowerCase();
        if (!name.includes(q) && !email.includes(q) && !String(o.order_number).includes(q)) return false;
      }
      const fin = (o.financial_status || 'pending').toLowerCase();
      const ful = (o.fulfillment_status || 'unfulfilled').toLowerCase();
      const name = o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.toLowerCase() : 'guest';
      const email = (o.customer?.email || '').toLowerCase();
      const dt = new Date(o.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toLowerCase();
      const amt = parseFloat(o.total_price || 0).toFixed(2);
      const items = String(o.line_items?.length ?? 0);

      if (filters.order       && !String(o.order_number).includes(filters.order)) return false;
      if (filters.customer    && !name.includes(filters.customer.toLowerCase()) && !email.includes(filters.customer.toLowerCase())) return false;
      if (filters.date        && !dt.includes(filters.date.toLowerCase())) return false;
      if (filters.amount      && !amt.includes(filters.amount)) return false;
      if (filters.payment     && fin !== filters.payment) return false;
      if (filters.fulfillment && ful !== filters.fulfillment) return false;
      if (filters.items       && items !== filters.items) return false;
      return true;
    });

    list.sort((a, b) => {
      let va, vb;
      if (sortCol === 'order')       { va = a.order_number; vb = b.order_number; }
      else if (sortCol === 'customer') { va = a.customer ? `${a.customer.first_name} ${a.customer.last_name}` : ''; vb = b.customer ? `${b.customer.first_name} ${b.customer.last_name}` : ''; }
      else if (sortCol === 'date')   { va = new Date(a.created_at); vb = new Date(b.created_at); }
      else if (sortCol === 'amount') { va = parseFloat(a.total_price || 0); vb = parseFloat(b.total_price || 0); }
      else if (sortCol === 'payment')     { va = a.financial_status || ''; vb = b.financial_status || ''; }
      else if (sortCol === 'fulfillment') { va = a.fulfillment_status || ''; vb = b.fulfillment_status || ''; }
      else if (sortCol === 'items')  { va = a.line_items?.length || 0; vb = b.line_items?.length || 0; }
      else return 0;
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });
    return list;
  }, [orders, search, filters, sortCol, sortDir]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const pageStart  = (page - 1) * PER_PAGE;
  const pageEnd    = Math.min(pageStart + PER_PAGE, filtered.length);
  const pageSlice  = filtered.slice(pageStart, pageEnd);
  const activeFilterCount = Object.values(filters).filter(v => v !== '').length;

  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
    setPage(1);
  };

  const handleFilterApply = (col, val) => {
    setFilters(f => ({ ...f, [col]: val }));
    setOpenFilter(null); setPage(1);
  };

  const clearAllFilters = () => {
    setFilters(INIT_FILTERS); setSearch(''); setSortCol('date'); setSortDir('desc'); setPage(1);
  };

  const toggleFilter = (e, col) => {
    e.stopPropagation();
    setDraftFilter(filters[col] || '');
    setOpenFilter(prev => prev === col ? null : col);
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

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon="📦" value={stats.total}   label="Total Orders"  tag="All"          tagCls="bg-indigo-50 text-indigo-600"  borderCls="border-l-indigo-500" />
        <StatCard icon="💰" value={stats.revFmt}  label="Total Revenue" tag="↑ Sales"      tagCls="bg-emerald-50 text-emerald-600" borderCls="border-l-emerald-500" />
        <StatCard icon="✅" value={stats.ful}     label="Fulfilled"     tag={`${stats.pct}%`} tagCls="bg-blue-50 text-blue-600"   borderCls="border-l-blue-500" />
        <StatCard icon="⏳" value={stats.pen}     label="Pending"       tag="Open"         tagCls="bg-amber-50 text-amber-600"    borderCls="border-l-amber-500" />
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-sm font-bold text-slate-800">All Orders</h3>
            <span className="bg-indigo-50 text-indigo-600 text-xs font-bold px-2.5 py-1 rounded-full">
              {filtered.length} records
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
        {pageSlice.length === 0 ? (
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
                  <ThCell col="order"       label="Order"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} />
                  <ThCell col="customer"    label="Customer"    sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} />
                  <ThCell col="date"        label="Date"        sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} responsive="hidden md:table-cell" />
                  <ThCell col="amount"      label="Amount"      sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} />
                  <ThCell col="payment"     label="Payment"     sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} responsive="hidden sm:table-cell" dropdownOpts={PAYMENT_OPTS} />
                  <ThCell col="fulfillment" label="Fulfillment" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} dropdownOpts={FULFILL_OPTS} />
                  <ThCell col="items"       label="Items"       sortCol={sortCol} sortDir={sortDir} onSort={handleSort} filters={filters} openFilter={openFilter} onToggleFilter={toggleFilter} onApply={handleFilterApply} draftFilter={draftFilter} setDraftFilter={setDraftFilter} responsive="hidden lg:table-cell" />
                </tr>
              </thead>
              <tbody>
                {pageSlice.map(o => <OrderRow key={o.id} order={o} />)}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <Pagination page={page} totalPages={totalPages} total={filtered.length} start={pageStart} end={pageEnd} onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} />
        )}
      </div>
    </div>
  );
}

// ── Order row ─────────────────────────────────────────────────────────────────
function OrderRow({ order: o }) {
  const fin = o.financial_status || 'pending';
  const ful = o.fulfillment_status || 'unfulfilled';
  const dt  = new Date(o.created_at);
  return (
    <tr className="border-b border-slate-100 hover:bg-slate-50/70 transition-colors">
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
function Pagination({ page, totalPages, total, start, end, onPage }) {
  const nums = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    if (page <= 4) return [1, 2, 3, 4, 5, '...', totalPages];
    if (page >= totalPages - 3) return [1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages];
    return [1, '...', page - 1, page, page + 1, '...', totalPages];
  })();

  const btnBase = 'inline-flex items-center justify-center min-w-[32px] h-8 px-2 rounded-lg text-sm font-medium transition-all border';

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50/50">
      <p className="text-sm text-slate-500">
        Showing <span className="font-semibold text-slate-700">{start + 1}–{end}</span> of{' '}
        <span className="font-semibold text-slate-700">{total}</span> orders
      </p>
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
    </div>
  );
}
