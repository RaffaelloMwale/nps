export function formatMWK(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '—';
  const n = typeof amount === 'string' ? parseFloat(amount) : amount;
  if (isNaN(n)) return '—';
  return `K ${n.toLocaleString('en-MW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

export function formatDateTime(date: string | Date | null | undefined): string {
  if (!date) return '—';
  try {
    return new Date(date).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return '—'; }
}

export function capitalize(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '';
}

export function statusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'badge-active', pending: 'badge-pending', submitted: 'badge-pending',
    approved_1: 'badge-pending', approved_2: 'badge-pending',
    processed: 'badge-processed', paid: 'badge-paid',
    rejected: 'badge-rejected', reversed: 'badge-rejected',
    deceased: 'badge-deceased', terminated: 'badge-deceased', suspended: 'badge-pending',
  };
  return map[status] || 'badge';
}
