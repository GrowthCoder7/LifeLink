import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { Field, Select } from '../components/Field.jsx';
import { Layout } from '../components/Layout.jsx';
import { usePolling } from '../components/usePolling.js';
import { BLOOD_GROUPS, COMPONENTS, URGENCIES, formatDateTime, label, seconds, shortId } from '../components/format.js';

const NEW_REQUEST = { bloodGroup: 'O+', component: 'PRBC', quantity: 1, urgency: 'ROUTINE' };

function RequestForm({ onCreated }) {
  const [form, setForm] = useState(NEW_REQUEST);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const emergency = form.urgency === 'EMERGENCY';

  async function onSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api('/api/requests', { method: 'POST', body: { ...form, quantity: Number(form.quantity) } });
      onCreated(result);
      setForm(NEW_REQUEST);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className={`card request-form${emergency ? ' is-emergency' : ''}`} onSubmit={onSubmit} aria-labelledby="new-request">
      <h2 id="new-request">Raise a blood request</h2>
      <div className="form-row">
        <Field id="bloodGroup" label="Blood group">
          {(props) => <Select {...props} options={BLOOD_GROUPS} value={form.bloodGroup} onChange={set('bloodGroup')} />}
        </Field>
        <Field id="component" label="Component">
          {(props) => <Select {...props} options={COMPONENTS} format={label} value={form.component} onChange={set('component')} />}
        </Field>
        <Field id="quantity" label="Units" error={error && error.field === 'quantity' ? error.message : null}>
          {(props) => <input {...props} type="number" min="1" max="10" value={form.quantity} onChange={set('quantity')} />}
        </Field>
      </div>
      <fieldset className="segmented">
        <legend>Urgency</legend>
        {URGENCIES.map((urgency) => (
          <label key={urgency} className={`segment segment-${urgency.toLowerCase()}`}>
            <input type="radio" name="urgency" value={urgency} checked={form.urgency === urgency} onChange={set('urgency')} />
            {label(urgency)}
          </label>
        ))}
      </fieldset>
      {error && !error.field && <p className="form-error" role="alert">{error.message}</p>}
      <button type="submit" className={`button ${emergency ? 'button-danger' : 'button-primary'}`} disabled={busy}>
        {busy ? 'Matching…' : emergency ? 'Raise emergency request' : 'Raise request'}
      </button>
    </form>
  );
}

function RequestDetail({ request, onClose }) {
  const [detail, setDetail] = useState(null);

  // Refetch whenever the row's status or matched count changes on a poll.
  useEffect(() => {
    let current = true;
    api(`/api/requests/${request.id}`).then((data) => current && setDetail(data)).catch(() => {});
    return () => { current = false; };
  }, [request.id, request.status, request.matched_units]);

  return (
    <aside className="card detail-panel" aria-labelledby="detail-title">
      <div className="detail-header">
        <h2 id="detail-title">{request.quantity} × {request.blood_group} {label(request.component)}</h2>
        <button type="button" className="icon-button" aria-label="Close details" onClick={onClose}>×</button>
      </div>
      <p><Badge value={request.status} /> <Badge value={request.urgency} /></p>
      {detail && detail.matchMs !== null && (
        <p className="match-time">Matched in {seconds(detail.matchMs)}</p>
      )}
      <h3>Allocated units ({request.matched_units} of {request.quantity})</h3>
      {!detail ? (
        <p className="muted" role="status">Loading…</p>
      ) : detail.matches.length === 0 ? (
        <p className="empty">No units allocated yet.</p>
      ) : (
        <ul className="unit-list">
          {detail.matches.map((m) => (
            <li key={m.id}>
              <span className="unit-group">{m.blood_group}</span>
              <span><strong>{m.institution_name}</strong><br /><small>Unit {shortId(m.unit_id)}</small></span>
              <span className="distance">{Number(m.distance_km).toFixed(1)} km</span>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}

export default function HospitalDashboard() {
  const requests = usePolling(() => api('/api/requests'), 5000);
  const [selectedId, setSelectedId] = useState(null);
  const [flash, setFlash] = useState(null);
  const rows = requests.data || [];
  const selected = rows.find((r) => r.id === selectedId);

  function onCreated(result) {
    const time = result.status === 'MATCHED' ? ` — matched in ${seconds(result.matchMs)}` : '';
    setFlash(`Request ${label(result.status).toLowerCase()}${time}.`);
    setSelectedId(result.id);
    requests.refresh();
  }

  return (
    <Layout title="Hospital dashboard">
      <RequestForm onCreated={onCreated} />
      {flash && <p className="flash" role="status">{flash}</p>}
      <div className={`split${selected ? ' has-detail' : ''}`}>
        <section className="card" aria-labelledby="requests-title">
          <h2 id="requests-title">Our requests</h2>
          {requests.error && <p className="form-error" role="alert">{requests.error}</p>}
          {rows.length === 0 ? (
            <p className="empty">{requests.loading ? 'Loading…' : 'No requests yet. Raise one above.'}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th scope="col">Raised</th><th scope="col">Need</th><th scope="col">Units</th><th scope="col">Urgency</th><th scope="col">Status</th></tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={r.id === selectedId ? 'selected' : ''} onClick={() => setSelectedId(r.id)}>
                      <td>
                        <button type="button" className="row-button" onClick={() => setSelectedId(r.id)}
                          aria-label={`Show details for ${r.blood_group} request raised ${formatDateTime(r.created_at)}`}>
                          {formatDateTime(r.created_at)}
                        </button>
                      </td>
                      <td>{r.blood_group} {label(r.component)}</td>
                      <td>{r.matched_units}/{r.quantity}</td>
                      <td><Badge value={r.urgency} /></td>
                      <td><Badge value={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        {selected && <RequestDetail request={selected} onClose={() => setSelectedId(null)} />}
      </div>
    </Layout>
  );
}
