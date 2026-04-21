const cls = {
  paid:        'bg-emerald-50 text-emerald-700',
  pending:     'bg-amber-50 text-amber-700',
  refunded:    'bg-blue-50 text-blue-700',
  voided:      'bg-slate-100 text-slate-500',
  fulfilled:   'bg-emerald-50 text-emerald-700',
  unfulfilled: 'bg-amber-50 text-amber-700',
  partial:     'bg-blue-50 text-blue-700',
};

export default function Badge({ value }) {
  const c = cls[value] || 'bg-slate-100 text-slate-500';
  return (
    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold capitalize ${c}`}>
      {value || '—'}
    </span>
  );
}
