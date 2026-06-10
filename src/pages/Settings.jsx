import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ErrorAlert, SuccessAlert } from '../components/ui/Alert';

export default function Settings() {
  const { api, logout } = useAuth();
  const [cur, setCur]     = useState('');
  const [nw, setNw]       = useState('');
  const [conf, setConf]   = useState('');
  const [show, setShow]   = useState({ cur: false, nw: false, conf: false });
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const [success, setSuccess] = useState('');

  const strength = (pw) => {
    let s = 0;
    if (pw.length >= 6) s++;
    if (pw.length >= 10) s++;
    if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) s++;
    if (/[^A-Za-z0-9]/.test(pw)) s++;
    return Math.min(s, 3);
  };
  const strengthMap = [
    { w: '25%', bg: '#ef4444', label: 'Weak',   color: 'text-red-500' },
    { w: '50%', bg: '#f59e0b', label: 'Fair',   color: 'text-amber-500' },
    { w: '75%', bg: '#3b82f6', label: 'Good',   color: 'text-blue-500' },
    { w: '100%',bg: '#10b981', label: 'Strong', color: 'text-emerald-500' },
  ];
  const s = nw ? strengthMap[strength(nw)] : null;

  const handleSave = async () => {
    setError(''); setSuccess('');
    if (!cur || !nw || !conf) { setError('All fields are required.'); return; }
    if (nw.length < 6) { setError('New password must be at least 6 characters.'); return; }
    if (nw !== conf) { setError('New passwords do not match.'); return; }
    setLoading(true);
    try {
      const r = await api('/api/auth/change-password', {
        method: 'POST',
        body: { currentPassword: cur, newPassword: nw },
      });
      const d = await r.json();
      if (r.ok) {
        setSuccess(`${d.message} Redirecting to login…`);
        setCur(''); setNw(''); setConf('');
        setTimeout(logout, 2000);
      } else setError(d.message);
    } catch { setError('Server error. Please try again.'); }
    setLoading(false);
  };

  const InfoRow = ({ label, value }) => (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className="text-sm font-medium text-slate-700">{value}</span>
    </div>
  );

  const PwField = ({ id, label, value, onChange, showKey }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</label>
      <div className="relative">
        <input
          type={show[showKey] ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full px-4 py-2.5 pr-10 border border-slate-200 rounded-xl text-sm text-slate-800 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent placeholder-slate-400 transition"
        />
        <button
          type="button"
          onClick={() => setShow(p => ({ ...p, [showKey]: !p[showKey] }))}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm transition"
        >
          {show[showKey] ? '🙈' : '👁'}
        </button>
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-slate-800">Settings</h2>
        <p className="text-sm text-slate-500 mt-1">Manage your account preferences and security</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Profile */}
        <Card icon="👤" title="Profile Information" sub="Your account details">
          <InfoRow label="Username" value="admin" />
          <InfoRow label="Role" value={<span className="inline-block bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">Super Admin</span>} />
          <InfoRow label="Status" value={<span className="inline-block bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">Active</span>} />
          {/* <InfoRow label="Session" value={<span className="text-xs text-slate-500">Expires in 24h</span>} /> */}
        </Card>

        {/* Shopify */}
        {/* <Card icon="🔗" title="Shopify Connection" sub="API integration status">
          <InfoRow label="Store" value={<span className="text-xs text-slate-600 font-medium">{window.location.hostname}</span>} />
          <InfoRow label="API Status" value={<span className="inline-block bg-emerald-50 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">Connected</span>} />
          <InfoRow label="Permissions" value={<span className="text-xs text-slate-500 font-mono">read_orders, write_orders</span>} />
        </Card> */}

        {/* Change Password */}
        {/* <div className="lg:col-span-2">
          <Card icon="🔐" title="Change Password" sub="Update your login credentials">
            <div className="space-y-4">
              <ErrorAlert message={error} />
              <SuccessAlert message={success} />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <PwField id="cur"  label="Current Password"      value={cur}  onChange={setCur}  showKey="cur" />
                <PwField id="nw"   label="New Password"          value={nw}   onChange={setNw}   showKey="nw" />
                <PwField id="conf" label="Confirm New Password"  value={conf} onChange={setConf} showKey="conf" />
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div />
                <div>
                  {s && (
                    <>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
                        <div className="h-full rounded-full transition-all duration-300" style={{ width: s.w, background: s.bg }} />
                      </div>
                      <span className={`text-xs font-semibold ${s.color}`}>{s.label}</span>
                    </>
                  )}
                </div>
                <div className="flex items-end pb-0.5">
                  {conf && (
                    <span className={`text-xs font-semibold ${nw === conf ? 'text-emerald-600' : 'text-red-500'}`}>
                      {nw === conf ? '✓ Passwords match' : '✗ Do not match'}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={handleSave}
                  disabled={loading}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition shadow-sm disabled:opacity-50"
                >
                  {loading ? 'Updating…' : 'Update Password'}
                </button>
                <button
                  onClick={() => { setCur(''); setNw(''); setConf(''); setError(''); setSuccess(''); }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-sm font-semibold rounded-xl transition"
                >
                  Clear
                </button>
              </div>
            </div>
          </Card>
        </div> */}

        {/* Danger Zone */}
        {/* <div className="lg:col-span-2 bg-white rounded-2xl border border-red-100 shadow-sm overflow-hidden">
          <div className="flex items-center gap-3 px-5 py-4 bg-red-50 border-b border-red-100">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center text-lg">⚠️</div>
            <div>
              <h4 className="text-sm font-bold text-red-700">Danger Zone</h4>
              <p className="text-xs text-red-400 mt-0.5">Irreversible actions — proceed with caution</p>
            </div>
          </div>
          <div className="px-5 py-4 divide-y divide-slate-100">
            <DangerRow title="Sign Out" sub="End your current session" label="Sign Out" onClick={logout} />
            <DangerRow title="Clear Session Data" sub="Remove all locally stored tokens" label="Clear Data" onClick={() => { localStorage.clear(); logout(); }} />
          </div>
        </div> */}

      </div>
    </div>
  );
}

function Card({ icon, title, sub, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 bg-slate-50 border-b border-slate-100">
        <div className="w-9 h-9 rounded-xl bg-indigo-100 flex items-center justify-center text-lg">{icon}</div>
        <div>
          <h4 className="text-sm font-bold text-slate-800">{title}</h4>
          <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
        </div>
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function DangerRow({ title, sub, label, onClick }) {
  return (
    <div className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
      <div>
        <h5 className="text-sm font-semibold text-slate-800">{title}</h5>
        <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
      </div>
      <button
        onClick={onClick}
        className="px-4 py-2 bg-red-50 hover:bg-red-500 hover:text-white border border-red-200 text-red-600 text-xs font-bold rounded-xl transition"
      >
        {label}
      </button>
    </div>
  );
}
