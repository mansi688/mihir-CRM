import { useEffect, useMemo, useState } from 'react';
import { taskManager } from '../lib/api';
import { errMsg, fmtDateTime } from '../lib/utils';
import Icon from './Icons';
import { ErrorBox, Field, Modal, useToast } from './UI';

// CRM project name → project name used in the Mihir Task Manager
function tmProjectFor(name = '', projects = []) {
  const n = name.toLowerCase();
  const hit = projects.find((p) => p.toLowerCase() === n)
    || projects.find((p) => n && (p.toLowerCase().includes(n) || n.includes(p.toLowerCase().split(' (')[0])));
  return hit || projects.find((p) => /mihir projects/i.test(p)) || projects[0] || '';
}
const TM_PRIORITY = { urgent: 'high', high: 'high', medium: 'medium', low: 'low' };
const istDate = (d) => (d ? new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');
const digits = (s) => String(s || '').replace(/\D/g, '').slice(-10);

// Shown to managers/admins on a complaint: send it to the Mihir Task Manager as a task, or follow it there.
export default function TaskManagerPanel({ c, onLinked }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');

  const refresh = () => {
    if (!c.tm_task_id) return;
    setLoading(true); setErr('');
    taskManager({ action: 'status', complaint_id: c.id })
      .then((r) => setTask(r.task)).catch((e) => setErr(errMsg(e))).finally(() => setLoading(false));
  };
  useEffect(refresh, [c.id, c.tm_task_id]); // eslint-disable-line

  const done = task ? task.assignees.filter((a) => a.done).length : 0;
  return (
    <section className="panel">
      <div className="panel-head"><h3>Mihir Task Manager</h3>{c.tm_task_id && <button className="linkish small" onClick={refresh} disabled={loading}>{loading ? 'Checking…' : 'Refresh'}</button>}</div>
      <div className="panel-pad stack" style={{ gap: 10 }}>
        {!c.tm_task_id ? (
          <>
            <p className="small muted">Allot this complaint as a task in the Mihir Task Manager, so the work is tracked with the rest of the team's tasks.</p>
            <button className="btn" onClick={() => setOpen(true)}><Icon name="list" />Add as task to Mihir Task Manager</button>
          </>
        ) : (
          <>
            <div className="spread">
              <span className="mono-id">{c.tm_task_id}</span>
              {task && <span className={`badge ${task.status === 'open' ? 'st-in_progress' : task.status === 'closed' ? 'st-resolved' : 'st-closed'}`}>{task.status === 'open' ? 'Open' : task.status === 'closed' ? 'Closed' : task.status}</span>}
            </div>
            {task && (
              <dl className="kv">
                <dt>Assigned to</dt><dd>{task.assignees.length ? task.assignees.map((a) => `${a.name}${a.done ? ' ✓' : ''}`).join(', ') : <span className="faint">Not tagged yet</span>}</dd>
                <dt>Progress</dt><dd>{task.assignees.length ? `${done} of ${task.assignees.length} done` : '—'}</dd>
                <dt>Deadline</dt><dd>{task.deadline ? fmtDateTime(task.deadline) : '—'}</dd>
                {task.closedAt && <><dt>Closed</dt><dd>{fmtDateTime(task.closedAt)}</dd></>}
              </dl>
            )}
            <ErrorBox error={err} />
            <a className="btn secondary" href={c.tm_task_url || task?.url} target="_blank" rel="noreferrer">Open in Task Manager</a>
            {task?.status === 'closed' && c.status !== 'resolved' && c.status !== 'closed' && (
              <p className="small muted">The task is closed in the task manager — mark this complaint resolved when the customer's issue is fixed.</p>
            )}
          </>
        )}
      </div>
      {open && <SendModal c={c} onClose={() => setOpen(false)} onDone={(t) => { setOpen(false); setTask(t); toast(`Added to Task Manager as ${t.id}`); onLinked?.(); }} />}
    </section>
  );
}

function SendModal({ c, onClose, onDone }) {
  const [opts, setOpts] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [f, setF] = useState({
    title: `[${c.complaint_no}] ${c.title} — ${c.project_name} ${c.wing_name}-${c.flat_no}`.slice(0, 200),
    description: [
      `Customer complaint ${c.complaint_no}`,
      `Customer: ${c.customer_name}${c.customer_mobile ? ` (${c.customer_mobile})` : ''}`,
      `Location: ${c.project_name}, ${c.tower_name} / Wing ${c.wing_name} – ${c.flat_no}${c.area === 'common' ? ` · common area${c.location_detail ? `: ${c.location_detail}` : ''}` : ''}`,
      '',
      c.description,
    ].join('\n'),
    deadline: istDate(c.due_at),
    priority: TM_PRIORITY[c.priority] || 'medium',
    project: '',
    assignees: [],
  });
  const set = (k, v) => setF((x) => ({ ...x, [k]: v }));

  useEffect(() => {
    taskManager({ action: 'options' }).then((o) => {
      setOpts(o);
      setF((x) => ({ ...x, project: tmProjectFor(c.project_name, o.projects) }));
    }).catch((e) => setError(errMsg(e)));
  }, [c.project_name]);

  const people = useMemo(() => {
    const list = opts?.people || [];
    const s = q.trim().toLowerCase();
    return s ? list.filter((p) => `${p.name} ${p.username} ${p.team || ''} ${p.designation || ''}`.toLowerCase().includes(s)) : list;
  }, [opts, q]);
  // suggest the CRM assignee if the same person (same name) exists in the task manager
  const suggested = useMemo(() => {
    if (!opts || !c.assignee_name) return null;
    return opts.people.find((p) => p.name && p.name.toLowerCase() === c.assignee_name.toLowerCase()) || null;
  }, [opts, c.assignee_name]);
  useEffect(() => { if (suggested && !f.assignees.length) set('assignees', [suggested.username]); }, [suggested]); // eslint-disable-line
  const toggle = (u) => set('assignees', f.assignees.includes(u) ? f.assignees.filter((x) => x !== u) : [...f.assignees, u]);

  async function send() {
    setError('');
    if (!f.project) return setError('Choose the project.');
    if (!f.deadline) return setError('Choose a deadline.');
    setBusy(true);
    try {
      const r = await taskManager({ action: 'create', complaint_id: c.id, ...f });
      onDone(r.task);
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <Modal title="Add as task to Mihir Task Manager" onClose={onClose} wide
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !opts} onClick={send}>{busy ? 'Sending…' : 'Create task'}</button></>}>
      <ErrorBox error={error} />
      {!opts && !error && <p className="muted small">Connecting to the task manager… (it can take up to a minute to wake up)</p>}
      {opts && (
        <>
          <Field label="Task title"><input className="input" maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <div className="grid-3">
            <Field label="Project">
              <select className="input" value={f.project} onChange={(e) => set('project', e.target.value)}>
                {opts.projects.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </Field>
            <Field label="Deadline"><input className="input" type="date" value={f.deadline} onChange={(e) => set('deadline', e.target.value)} /></Field>
            <Field label="Priority">
              <select className="input" value={f.priority} onChange={(e) => set('priority', e.target.value)}>
                <option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option>
              </select>
            </Field>
          </div>
          <Field group label={`Assign to${f.assignees.length ? ` (${f.assignees.length} selected)` : ''}`} hint="Optional — people can also be tagged later in the task manager">
            <input className="input sm" placeholder="Search name, username or department" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search people" />
            <div className="tm-people">
              {people.slice(0, 200).map((p) => (
                <label key={p.username} className={`tm-person ${f.assignees.includes(p.username) ? 'on' : ''}`}>
                  <input type="checkbox" checked={f.assignees.includes(p.username)} onChange={() => toggle(p.username)} />
                  <span><b>{p.name}</b><small>{[p.designation, p.team].filter(Boolean).join(' · ') || p.username}</small></span>
                </label>
              ))}
              {!people.length && <p className="small muted" style={{ padding: 10 }}>No one matches.</p>}
            </div>
          </Field>
          <Field label="Details sent with the task"><textarea className="input" style={{ minHeight: 140 }} value={f.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <p className="small muted">A link back to this complaint is added to the task automatically. Each complaint can be sent once.</p>
        </>
      )}
    </Modal>
  );
}
