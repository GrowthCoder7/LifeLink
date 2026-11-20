import { useState } from 'react';
import { api } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { Field, Select } from '../components/Field.jsx';
import { Layout } from '../components/Layout.jsx';
import { usePolling } from '../components/usePolling.js';
import { BLOOD_GROUPS, COMPONENTS, expiresIn, formatDate, formatDateTime, label, shortId, toDateInput } from '../components/format.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const SHELF_LIFE_DAYS = { WHOLE_BLOOD: 35, PRBC: 35, PLATELETS: 5, PLASMA: 365 };
const STATUSES = ['AVAILABLE', 'ALLOCATED', 'EXPIRED'];

function rowClass(unit) {
  if (unit.status === 'EXPIRED') return 'row-expired';
  if (unit.expiry_flag === 'NEAR_EXPIRY' && unit.status === 'AVAILABLE') return 'row-near-expiry';
  return '';
}

function newUnit(component = 'PRBC') {
  const today = new Date();
  return {
    bloodGroup: 'O-',
    component,
    collectedAt: toDateInput(today),
    expiresAt: toDateInput(new Date(today.getTime() + SHELF_LIFE_DAYS[component] * DAY_MS)),
  };
}

function AddUnitForm({ onAdded }) {
  const [form, setForm] = useState(newUnit());
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => {
    const value = event.target.value;
    // Changing the component resets the expiry to that component's shelf life.
    setForm((prev) => (key === 'component' ? { ...newUnit(value), bloodGroup: prev.bloodGroup } : { ...prev, [key]: value }));
  };

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // A collection date of "today" means now, so it is never in the future.
      const collectedAt = form.collectedAt === toDateInput(new Date()) ? new Date().toISOString() : form.collectedAt;
      await api('/api/inventory', { method: 'POST', body: { ...form, collectedAt } });
      onAdded(`${form.bloodGroup} ${label(form.component)} unit added.`);
      setForm(newUnit(form.component));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (name) => (error && error.field === name ? error.message.replace(/"/g, '') : null);
  return (
    <form className="card" onSubmit={onSubmit} aria-labelledby="add-unit">
      <h2 id="add-unit">Add unit</h2>
      <div className="form-row">
        <Field id="unit-group" label="Blood group">
          {(props) => <Select {...props} options={BLOOD_GROUPS} value={form.bloodGroup} onChange={set('bloodGroup')} />}
        </Field>
        <Field id="unit-component" label="Component">
          {(props) => <Select {...props} options={COMPONENTS} format={label} value={form.component} onChange={set('component')} />}
        </Field>
        <Field id="collectedAt" label="Collected" error={fieldError('collectedAt')}>
          {(props) => <input {...props} type="date" value={form.collectedAt} onChange={set('collectedAt')} />}
        </Field>
        <Field id="expiresAt" label="Expires" error={fieldError('expiresAt')}>
          {(props) => <input {...props} type="date" value={form.expiresAt} onChange={set('expiresAt')} />}
        </Field>
      </div>
      {error && !error.field && <p className="form-error" role="alert">{error.message}</p>}
      <button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Adding…' : 'Add unit'}</button>
    </form>
  );
}

function InventoryTable({ units, onDiscard }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr><th scope="col">Unit</th><th scope="col">Group</th><th scope="col">Component</th><th scope="col">Expires</th><th scope="col">Status</th><th scope="col"><span className="visually-hidden">Actions</span></th></tr>
        </thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id} className={rowClass(u)}>
              <td><code>{shortId(u.id)}</code></td>
              <td><strong>{u.blood_group}</strong></td>
              <td>{label(u.component)}</td>
              <td>{formatDate(u.expires_at)} <small className="muted">({expiresIn(u.expires_at)})</small></td>
              <td>
                <Badge value={u.status} />
                {u.status === 'AVAILABLE' && u.expiry_flag === 'NEAR_EXPIRY' && <> <Badge value="NEAR_EXPIRY" /></>}
              </td>
              <td>
                {u.status === 'AVAILABLE' && (
                  <button type="button" className="link-button" onClick={() => onDiscard(u)}
                    aria-label={`Discard unit ${shortId(u.id)}`}>Discard</button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecentAllocations({ units }) {
  const recent = units
    .filter((u) => u.status === 'ALLOCATED' && u.allocated_at)
    .sort((a, b) => new Date(b.allocated_at) - new Date(a.allocated_at))
    .slice(0, 8);
  return (
    <section className="card" aria-labelledby="allocations-title">
      <h2 id="allocations-title">Recent allocations</h2>
      {recent.length === 0 ? <p className="empty">No units allocated yet.</p> : (
        <ul className="unit-list">
          {recent.map((u) => (
            <li key={u.id}>
              <span className="unit-group">{u.blood_group}</span>
              <span><strong>{u.allocated_to}</strong><br /><small>{label(u.component)} · unit {shortId(u.id)}</small></span>
              <time dateTime={u.allocated_at}>{formatDateTime(u.allocated_at)}</time>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function BloodBankConsole() {
  const [filters, setFilters] = useState({ bloodGroup: '', status: '' });
  const [flash, setFlash] = useState(null);
  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const inventory = usePolling(() => api(`/api/inventory${query ? `?${query}` : ''}`), 15000, query);
  const allocations = usePolling(() => api('/api/inventory?status=ALLOCATED'), 15000);
  const units = inventory.data || [];
  const setFilter = (key) => (event) => setFilters((prev) => ({ ...prev, [key]: event.target.value }));

  function refreshAll(message) {
    setFlash(message);
    inventory.refresh();
    allocations.refresh();
  }

  async function discard(unit) {
    try {
      await api(`/api/inventory/${unit.id}`, { method: 'PATCH', body: { status: 'EXPIRED' } });
      refreshAll(`Unit ${shortId(unit.id)} discarded.`);
    } catch (err) {
      setFlash(err.message);
    }
  }

  const nearExpiry = units.filter((u) => u.status === 'AVAILABLE' && u.expiry_flag === 'NEAR_EXPIRY').length;
  return (
    <Layout title="Blood bank console">
      {flash && <p className="flash" role="status">{flash}</p>}
      <div className="split split-wide">
        <section className="card" aria-labelledby="inventory-title">
          <div className="section-header">
            <h2 id="inventory-title">Inventory</h2>
            {nearExpiry > 0 && <span className="badge badge-near_expiry">{nearExpiry} near expiry</span>}
          </div>
          <div className="filters">
            <Field id="filter-group" label="Blood group">
              {(props) => <Select {...props} options={['', ...BLOOD_GROUPS]} format={(v) => v || 'All'} value={filters.bloodGroup} onChange={setFilter('bloodGroup')} />}
            </Field>
            <Field id="filter-status" label="Status">
              {(props) => <Select {...props} options={['', ...STATUSES]} format={(v) => (v ? label(v) : 'All')} value={filters.status} onChange={setFilter('status')} />}
            </Field>
          </div>
          {inventory.error && <p className="form-error" role="alert">{inventory.error}</p>}
          {units.length === 0
            ? <p className="empty">{inventory.loading ? 'Loading…' : 'No units match these filters.'}</p>
            : <InventoryTable units={units} onDiscard={discard} />}
        </section>
        <div className="stack">
          <AddUnitForm onAdded={refreshAll} />
          <RecentAllocations units={allocations.data || []} />
        </div>
      </div>
    </Layout>
  );
}
