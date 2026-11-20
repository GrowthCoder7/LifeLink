import { label } from './format.js';

// Status, urgency and expiry badges. The text always states the value, so colour is never the only cue.
export function Badge({ value, tone }) {
  return <span className={`badge badge-${tone || value.toLowerCase()}`}>{label(value)}</span>;
}

export function RoleBadge({ role }) {
  return <span className="role-badge">{label(role).replace('Bloodbank', 'Blood bank')}</span>;
}
