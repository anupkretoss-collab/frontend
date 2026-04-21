export function ErrorAlert({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm font-medium">
      ⚠️ {message}
    </div>
  );
}

export function SuccessAlert({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm font-medium">
      ✓ {message}
    </div>
  );
}

export function InfoAlert({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm font-medium">
      ℹ️ {message}
    </div>
  );
}

export function WarnAlert({ message }) {
  if (!message) return null;
  return (
    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-xl px-4 py-3 text-sm font-medium">
      ⚠️ {message}
    </div>
  );
}
