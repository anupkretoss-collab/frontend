export default function StatCard({ icon, value, label, tag, tagCls, borderCls }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 border-l-4 ${borderCls} p-5 shadow-sm hover:shadow-md transition-shadow`}>
      <div className="flex items-center justify-between mb-3">
        <div className="w-9 h-9 rounded-xl bg-slate-50 flex items-center justify-center text-lg">{icon}</div>
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tagCls}`}>{tag}</span>
      </div>
      <div className="text-2xl font-extrabold text-slate-800 leading-none mb-1">{value}</div>
      <div className="text-xs font-medium text-slate-500">{label}</div>
    </div>
  );
}
