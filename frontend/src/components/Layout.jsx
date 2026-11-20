import { getSession, logout } from '../api/client.js';
import { RoleBadge } from './Badge.jsx';
import { NotificationBell } from './NotificationBell.jsx';

export function Layout({ title, children }) {
  const { user } = getSession();
  return (
    <>
      <header className="topbar">
        <span className="brand">
          <span className="brand-mark" aria-hidden="true" />
          LifeLink
        </span>
        <div className="topbar-actions">
          <RoleBadge role={user.role} />
          <span className="topbar-email">{user.email}</span>
          <NotificationBell />
          <button type="button" className="button button-ghost" onClick={logout}>Log out</button>
        </div>
      </header>
      <main className="page">
        <h1>{title}</h1>
        {children}
      </main>
    </>
  );
}
