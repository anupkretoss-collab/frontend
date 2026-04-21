import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const NAV = [
  { section: 'Main' },
  { to: '/orders',   icon: '📦', label: 'Orders',              badge: true },
  // { section: 'Preorders' },
  // { to: '/preorders', icon: '🌱', label: 'Preorder Processing' },
  // { to: '/delayed',  icon: '⏸️', label: 'Delayed Shipping Log' },
  { section: 'Account' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
];

export default function Layout() {
  const { logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orderCount, setOrderCount] = useState('—');
  const location = useLocation();

  const titles = {
    '/orders':    { title: 'Orders',               sub: 'Manage your Shopify orders' },
    '/delayed':   { title: 'Delayed Shipping Log',  sub: 'Orders with deferred shipping' },
    '/preorders': { title: 'Preorder Processing',   sub: 'End-to-end batch processing' },
    '/settings':  { title: 'Settings',              sub: 'Account & preferences' },
  };
  const current = titles[location.pathname] || { title: 'Dashboard', sub: '' };

  return (
    <div className="flex min-h-screen bg-slate-50 font-['Inter']">

      {/* ── Sidebar ── */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-60 bg-white border-r border-slate-200 flex flex-col shadow-sm transition-transform duration-300
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0`}>

        {/* Brand */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-xl flex-shrink-0">🛍️</div>
          <div>
            <div className="text-sm font-bold text-slate-800 leading-tight">ShopAdmin</div>
            <div className="text-xs text-slate-400 mt-0.5">Shopify Dashboard</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV.map((item, i) => {
            if (item.section) {
              return (
                <p key={i} className="text-xs font-bold text-slate-400 uppercase tracking-widest px-3 pb-2 pt-3 first:pt-1">
                  {item.section}
                </p>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all w-full
                  ${isActive
                    ? 'bg-indigo-50 text-indigo-700 font-semibold'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'}`
                }
              >
                <span className="text-base">{item.icon}</span>
                <span className="flex-1">{item.label}</span>
                {item.badge && (
                  <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                    {orderCount}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-slate-100">
          <div className="flex items-center gap-3 px-2">
            <div className="w-8 h-8 rounded-full bg-indigo-600 text-white text-sm font-bold flex items-center justify-center flex-shrink-0">A</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-slate-800 truncate">Admin</div>
              <div className="text-xs text-slate-400">Super Admin</div>
            </div>
            <button
              onClick={logout}
              title="Logout"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition text-sm"
            >⏻</button>
          </div>
        </div>
      </aside>

      {/* ── Mobile overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-60">

        {/* Topbar */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 h-14 flex items-center justify-between px-4 lg:px-6 gap-4 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              className="lg:hidden w-9 h-9 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 transition"
              onClick={() => setSidebarOpen(true)}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <div>
              <h2 className="text-base font-bold text-slate-800 leading-tight">{current.title}</h2>
              <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{current.sub}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:flex items-center gap-1.5 bg-emerald-50 text-emerald-600 text-xs font-semibold px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live
            </span>
            {/* Page-specific actions rendered via Outlet context */}
            <TopbarActions setOrderCount={setOrderCount} />
          </div>
        </header>

        {/* Page */}
        <main className="flex-1 p-4 lg:p-6">
          <Outlet context={{ setOrderCount }} />
        </main>
      </div>
    </div>
  );
}

// Renders refresh/sync buttons only on the orders page
function TopbarActions({ setOrderCount }) {
  const location = useLocation();
  const isOrders = location.pathname === '/orders';

  if (!isOrders) return null;

  // These are wired via a custom event so Orders page can handle them
  return (
    <>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('orders:refresh'))}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg transition"
      >
        ↻ <span className="hidden sm:inline">Refresh</span>
      </button>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('orders:sync'))}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition"
      >
        ⬇ <span className="hidden sm:inline">Sync Shopify</span>
      </button>
    </>
  );
}
