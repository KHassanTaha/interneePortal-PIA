const DASH = '—';

function toDate(v) {
  if (v == null) return null;
  if (v === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function safeDate(v) {
  const d = toDate(v);
  return d ? d.toLocaleDateString() : DASH;
}

export function fmtDate(v) {
  return safeDate(v);
}

export function safePeriod(from, to) {
  const a = toDate(from);
  const b = toDate(to);
  if (!a && !b) return DASH;
  return `${a ? a.toLocaleDateString() : '…'} – ${b ? b.toLocaleDateString() : '…'}`;
}
