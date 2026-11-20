import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client.js';
import { usePolling } from './usePolling.js';
import { timeAgo } from './format.js';

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);
  const buttonRef = useRef(null);
  const { data, refresh } = usePolling(() => api('/api/notifications'), 5000);
  const notifications = data || [];
  const unread = notifications.filter((n) => !n.read_at).length;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current.focus();
      }
    };
    const onClick = (event) => {
      if (!wrapperRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  async function markRead(ids) {
    await Promise.all(ids.map((id) => api(`/api/notifications/${id}/read`, { method: 'PATCH' })));
    refresh();
  }

  return (
    <div className="bell" ref={wrapperRef}>
      <button
        ref={buttonRef}
        type="button"
        className="icon-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Notifications, ${unread} unread`}
        onClick={() => setOpen((value) => !value)}
      >
        <BellIcon />
        {unread > 0 && <span className="count-badge" aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="bell-panel" role="region" aria-label="Notifications">
          <div className="bell-header">
            <h2>Notifications</h2>
            {unread > 0 && (
              <button type="button" className="link-button"
                onClick={() => markRead(notifications.filter((n) => !n.read_at).map((n) => n.id))}>
                Mark all read
              </button>
            )}
          </div>
          {notifications.length === 0 ? (
            <p className="empty">You are all caught up.</p>
          ) : (
            <ul className="bell-list">
              {notifications.map((n) => (
                <li key={n.id} className={n.read_at ? '' : 'unread'}>
                  <button type="button" onClick={() => markRead([n.id])} disabled={Boolean(n.read_at)}>
                    <span className="bell-title">
                      {n.title}{n.channel === 'SMS' && <span className="sms-tag">SMS</span>}
                    </span>
                    <span className="bell-body">{n.body}</span>
                    <time dateTime={n.created_at}>{timeAgo(n.created_at)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
