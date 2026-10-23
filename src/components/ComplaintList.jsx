import { Link, useNavigate } from 'react-router-dom';
import { KIND_LABEL } from '../lib/constants';
import { dueText, fmtDate, isOverdue, timeAgo } from '../lib/utils';
import { FlatPlate, PriorityBadge, StatusBadge } from './UI';

// Desktop table + mobile cards for complaints. `mode` = 'customer' | 'staff'
export default function ComplaintList({ rows, mode = 'staff', categories = {} }) {
  const nav = useNavigate();
  const catName = (code) => categories[code] || code;
  const link = (c) => (mode === 'customer' ? `/complaints/${c.id}` : `/complaints/${c.id}`);

  return (
    <>
      <div className="only-desktop table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Complaint</th>
              <th>Location</th>
              {mode !== 'customer' && <th>Customer</th>}
              <th>Status</th>
              <th>Priority</th>
              {mode !== 'customer' && <th>Assigned to</th>}
              <th>{mode === 'customer' ? 'Raised' : 'Deadline'}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className={`clickable ${isOverdue(c) ? 'is-overdue' : ''}`} onClick={() => nav(link(c))}>
                <td style={{ maxWidth: 340 }}>
                  <Link to={link(c)} className="cell-title" onClick={(e) => e.stopPropagation()}>{c.title}</Link>
                  <span className="tiny muted"><span className="mono-id">{c.complaint_no}</span> · {catName(c.category)}{c.kind !== 'complaint' ? ` · ${KIND_LABEL[c.kind]}` : ''}</span>
                </td>
                <td><FlatPlate c={c} /><div className="tiny muted" style={{ marginTop: 4 }}>{c.project_name}</div></td>
                {mode !== 'customer' && (
                  <td><div className="small strong">{c.customer_name}</div><div className="tiny muted">{c.customer_mobile}</div></td>
                )}
                <td><StatusBadge status={c.status} /></td>
                <td><PriorityBadge priority={c.priority} /></td>
                {mode !== 'customer' && <td className="small">{c.assignee_name || <span className="faint">Unassigned</span>}</td>}
                <td className="small nowrap">
                  {mode === 'customer' ? (
                    <span title={fmtDate(c.created_at)}>{timeAgo(c.created_at)}</span>
                  ) : (
                    <span style={{ color: isOverdue(c) ? 'var(--danger)' : undefined, fontWeight: isOverdue(c) ? 600 : 400 }}>{dueText(c)}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="only-mobile list">
        {rows.map((c) => (
          <Link key={c.id} to={link(c)} className={`list-item ${isOverdue(c) ? 'is-overdue' : ''}`}>
            <div className="top">
              <span className="tiny muted mono-id">{c.complaint_no}</span>
              <StatusBadge status={c.status} />
            </div>
            <div className="title">{c.title}</div>
            <div className="meta">
              <FlatPlate c={c} />
              <PriorityBadge priority={c.priority} />
              <span>{catName(c.category)}</span>
            </div>
            <div className="meta" style={{ marginTop: 6 }}>
              {mode !== 'customer' && <span>{c.customer_name}</span>}
              {mode !== 'customer' && <span>· {c.assignee_name || 'Unassigned'}</span>}
              <span style={{ color: isOverdue(c) ? 'var(--danger)' : undefined }}>
                {mode === 'customer' ? `Raised ${timeAgo(c.created_at)}` : dueText(c)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
