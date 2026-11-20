import { api } from '../api/client.js';
import { Badge } from '../components/Badge.jsx';
import { Layout } from '../components/Layout.jsx';
import { usePolling } from '../components/usePolling.js';
import { BLOOD_GROUPS, seconds } from '../components/format.js';

const STATUS_ORDER = ['PENDING', 'PARTIAL', 'ESCALATED', 'MATCHED', 'CANCELLED'];

function StatCard({ label, value, note }) {
  return (
    <div className="stat-card">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {note && <span className="stat-note">{note}</span>}
    </div>
  );
}

// Plain CSS bars (no chart library). Each bar carries its number as text, not just length.
function GroupBars({ counts }) {
  const max = Math.max(1, ...BLOOD_GROUPS.map((g) => counts[g] || 0));
  return (
    <ul className="bars" aria-label="Available units by blood group">
      {BLOOD_GROUPS.map((group) => {
        const count = counts[group] || 0;
        return (
          <li key={group}>
            <span className="bar-label">{group}</span>
            <span className="bar-track">
              <span className={`bar-fill${count === 0 ? ' bar-empty' : ''}`} style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span className="bar-value">{count}</span>
          </li>
        );
      })}
    </ul>
  );
}

export default function AdminConsole() {
  const { data: stats, error, loading, refresh } = usePolling(() => api('/api/admin/stats'), 15000);

  return (
    <Layout title="Network overview">
      <div className="section-header">
        <p className="muted">All blood banks and hospitals in the network.</p>
        <button type="button" className="button button-ghost" onClick={refresh}>Refresh</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {!stats ? (
        <p className="muted" role="status">{loading ? 'Loading…' : ''}</p>
      ) : (
        <>
          <section className="stat-grid" aria-label="Key figures">
            <StatCard label="Available units" value={stats.availableUnits} note="Unexpired, unallocated" />
            <StatCard label="Fulfilment rate" value={`${Math.round(stats.fulfilmentRate * 100)}%`} note={`${stats.requestsByStatus.MATCHED || 0} of ${stats.totalRequests} requests matched`} />
            <StatCard label="Expired units" value={stats.expiredUnits} note="Wastage" />
            <StatCard label="Avg match time" value={stats.avgMatchMs === null ? '—' : seconds(stats.avgMatchMs)} note="Request raised to fully matched" />
          </section>
          <div className="split">
            <section className="card" aria-labelledby="groups-title">
              <h2 id="groups-title">Available units by blood group</h2>
              <GroupBars counts={stats.availableByGroup} />
            </section>
            <section className="card" aria-labelledby="status-title">
              <h2 id="status-title">Requests by status</h2>
              <ul className="status-list">
                {STATUS_ORDER.map((status) => (
                  <li key={status}><Badge value={status} /><strong>{stats.requestsByStatus[status] || 0}</strong></li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
    </Layout>
  );
}
