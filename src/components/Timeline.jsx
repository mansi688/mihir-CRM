import { STATUS_LABEL, PRIORITY_LABEL } from '../lib/constants';
import { fmtDateTime, timeAgo } from '../lib/utils';
import Icon from './Icons';
import { Stars } from './UI';

function describe(u) {
  switch (u.type) {
    case 'created':  return { icon: 'flag', text: u.message || 'Complaint registered' };
    case 'status':   return { icon: 'refresh', text: <>Status changed to <b>{STATUS_LABEL[u.to_value] || u.to_value}</b>{u.from_value ? <> from {STATUS_LABEL[u.from_value]}</> : null}</> };
    case 'assigned': return { icon: 'user', text: u.message || 'Assignment changed' };
    case 'priority': return { icon: 'alert', text: <>Priority changed to <b>{PRIORITY_LABEL[u.to_value]}</b> from {PRIORITY_LABEL[u.from_value]}</> };
    case 'due_date': return { icon: 'clock', text: <>Deadline changed to <b>{fmtDateTime(u.to_value)}</b></> };
    case 'reopened': return { icon: 'refresh', text: <b>Reopened</b>, bubble: u.message, cls: 'alert' };
    case 'rating':   return { icon: 'star', text: <span className="row" style={{ gap: 6 }}>Rated <Stars value={Number(u.to_value)} read /></span>, bubble: u.message };
    case 'overdue':  return { icon: 'alert', text: u.message || 'Deadline missed', cls: 'alert' };
    case 'comment':  return { icon: 'message', text: u.is_internal ? 'added an internal note' : 'wrote', bubble: u.message, cls: u.is_internal ? 'internal' : 'comment' };
    default:         return { icon: 'flag', text: u.message || u.type };
  }
}

export default function Timeline({ items }) {
  if (!items.length) return <p className="muted small">No activity yet.</p>;
  return (
    <ul className="timeline">
      {items.map((u) => {
        const d = describe(u);
        const actor = u.actor_name || 'System';
        return (
          <li key={u.id}>
            <span className={`ic ${d.cls || ''}`}><Icon name={d.icon} /></span>
            <div style={{ minWidth: 0 }}>
              <div className="head">
                <b>{actor}</b> {u.type === 'comment' ? d.text : <>— {d.text}</>}
                {u.message && u.type === 'status' && <span className="muted"> · {u.message}</span>}
              </div>
              <div className="when" title={fmtDateTime(u.created_at)}>{timeAgo(u.created_at)}</div>
              {d.bubble && <div className={`bubble ${u.is_internal ? 'internal' : ''}`}>{d.bubble}</div>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function StatusRail({ status }) {
  const steps = ['open', 'assigned', 'in_progress', 'resolved', 'closed'];
  const idx = steps.indexOf(status);
  return (
    <div className="rail" aria-label={`Status: ${STATUS_LABEL[status]}`}>
      {steps.map((s, i) => {
        const cls = i < idx ? 'done' : i === idx ? (s === 'closed' ? 'done last' : 'current') : '';
        return (
          <div key={s} className={`step ${cls}`}>
            <span className="n">{i < idx || s === 'closed' && i === idx ? '✓' : i + 1}</span>
            {STATUS_LABEL[s]}
          </div>
        );
      })}
    </div>
  );
}
