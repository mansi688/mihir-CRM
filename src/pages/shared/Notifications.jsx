import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { listNotifications, markAllRead, markRead } from '../../lib/api';
import { errMsg, fmtDateTime, timeAgo } from '../../lib/utils';
import { Empty, ErrorBox, Loading } from '../../components/UI';

export default function Notifications() {
  const { profile } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const nav = useNavigate();

  const load = () => listNotifications(100).then(setItems).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); }, []);
  const changed = () => window.dispatchEvent(new Event('notifications:changed'));

  async function open(n) {
    if (!n.is_read) { await markRead(n.id).catch(() => {}); changed(); }
    if (n.complaint_id) nav(`/complaints/${n.complaint_id}`);
    else load();
  }
  async function readAll() {
    await markAllRead(profile.id).catch(() => {});
    changed(); load();
  }

  const unread = items?.filter((n) => !n.is_read).length || 0;
  return (
    <div className="page narrow">
      <div className="page-head">
        <div><h1>Notifications</h1><p>{unread ? `${unread} unread` : 'You are all caught up.'}</p></div>
        {unread > 0 && <button className="btn secondary" onClick={readAll}>Mark all as read</button>}
      </div>
      <ErrorBox error={error} />
      <div className="panel">
        {!items ? <Loading /> : items.length === 0 ? <Empty title="No notifications yet">Updates about complaints will appear here.</Empty> : (
          items.map((n) => (
            <div key={n.id} className={`notif ${n.is_read ? '' : 'unread'}`} role="button" tabIndex={0}
              onClick={() => open(n)} onKeyDown={(e) => e.key === 'Enter' && open(n)}>
              <span className="u" />
              <div><div className="t">{n.title}</div>{n.body && <div className="b">{n.body}</div>}</div>
              <span className="tiny faint nowrap" title={fmtDateTime(n.created_at)}>{timeAgo(n.created_at)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
