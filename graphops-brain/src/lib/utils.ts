/** Class name joiner. Filters falsy values. */
export function cx(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

/** Format epoch ms → "5 min ago", "2 hr ago", "Oct 14". */
export function relativeTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  const diff = Date.now() - ts;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'Just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Format epoch ms → "Oct 15, 2026 · 14:22". */
export function formatDateTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/** Format epoch ms → "02:41:08" (24h with seconds). */
export function formatClock(ts: number | null | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toTimeString().slice(0, 8);
}

/** Format a number with thousands separators. */
export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

/** Map severity/status strings to a Badge tone. */
export function toneForSeverity(s: string): 'red' | 'yellow' | 'blue' | 'neutral' {
  if (s === 'Critical') return 'red';
  if (s === 'High') return 'yellow';
  if (s === 'Medium') return 'blue';
  return 'neutral';
}

export function toneForStatus(s: string): 'green' | 'red' | 'yellow' | 'purple' | 'neutral' {
  const green = ['Healthy', 'Resolved', 'Success', 'Completed', 'Connected', 'Synced', 'Verified', 'Active', 'succeeded', 'approved'];
  const red = ['Critical', 'Failed', 'Degraded', 'Error', 'Needs review', 'Disconnected', 'failed', 'rejected'];
  const yellow = ['Investigating', 'Running', 'Warning', 'Pending', 'Monitoring', 'running', 'waiting_approval', 'queued'];
  const purple = ['Paused', 'Cancelled', 'cancelled'];
  if (green.includes(s)) return 'green';
  if (red.includes(s)) return 'red';
  if (yellow.includes(s)) return 'yellow';
  if (purple.includes(s)) return 'purple';
  return 'neutral';
}