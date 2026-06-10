import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      const r = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const d = await r.json();
      if (r.ok) {
        login(d.token);
      } else {
        setError(d.message);
      }
    } catch {
      setError('Cannot reach server. Make sure the backend is running.');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">

        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-indigo-100 text-3xl mb-4">🛍️</div>
          <h1 className="text-2xl font-bold text-slate-800">Shopify Admin</h1>
          <p className="text-slate-500 text-sm mt-1">Sign in to your dashboard</p>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm font-medium mb-5">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Username</label>
            <input
              type="text"
              value={username}
              onChange={e => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoComplete="username"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder-slate-400 bg-slate-50"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder-slate-400 bg-slate-50"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full cursor-pointer py-3 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold rounded-xl text-sm transition shadow-lg shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
          >
            {loading ? 'Signing in…' : 'Sign In →'}
          </button>
        </form>
      </div>
    </div>
  );
}
