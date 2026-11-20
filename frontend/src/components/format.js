export const BLOOD_GROUPS = ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'];
export const COMPONENTS = ['WHOLE_BLOOD', 'PRBC', 'PLATELETS', 'PLASMA'];
export const URGENCIES = ['ROUTINE', 'URGENT', 'EMERGENCY'];

const DAY_MS = 24 * 60 * 60 * 1000;

export const label = (value) =>
  value ? value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ') : '';

export const seconds = (ms) => `${(ms / 1000).toFixed(1)} s`;

export const shortId = (id) => id.slice(0, 8);

export function formatDate(value) {
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(value) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export function timeAgo(value, now = Date.now()) {
  const minutes = Math.round((now - new Date(value).getTime()) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export function expiresIn(value, now = Date.now()) {
  const days = (new Date(value).getTime() - now) / DAY_MS;
  if (days < 0) return `expired ${Math.ceil(-days)} d ago`;
  if (days < 1) return `in ${Math.max(1, Math.round(days * 24))} h`;
  return `in ${Math.round(days)} d`;
}

export function toDateInput(date) {
  return date.toISOString().slice(0, 10);
}
