export default function Spinner({ text = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <div className="w-8 h-8 border-2 border-slate-200 border-t-indigo-500 rounded-full animate-spin" />
      <p className="text-sm text-slate-500 font-medium">{text}</p>
    </div>
  );
}
