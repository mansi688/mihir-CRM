import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import {
  addComment, customerClose, customerReopen, deleteComplaint, getAttachments, getCategories, getComplaint,
  getEmployees, getTeams, getTimeline, setStatus, updateComplaint, uploadPhotos,
} from '../../lib/api';
import { ACTIVE_STATUSES, KIND_LABEL, PRIORITIES, SOURCES, STATUSES } from '../../lib/constants';
import { dueText, errMsg, fmtDateTime, hoursBetween, isOverdue, toLocalInput } from '../../lib/utils';
import Timeline, { StatusRail } from '../../components/Timeline';
import PhotoPicker from '../../components/PhotoPicker';
import Icon from '../../components/Icons';
import {
  ErrorBox, Field, FlatPlate, Loading, Modal, OverdueBadge, PriorityBadge, Stars, StatusBadge, useToast,
} from '../../components/UI';

export default function ComplaintDetail() {
  const { id } = useParams();
  const { profile, isCustomer, isManager, isAdmin, settings } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [c, setC] = useState(undefined);
  const [timeline, setTimeline] = useState([]);
  const [photos, setPhotos] = useState([]);
  const [cats, setCats] = useState({});
  const [employees, setEmployees] = useState([]);
  const [teams, setTeams] = useState([]);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const row = await getComplaint(id);
      setC(row);
      if (!row) return;
      const [t, a] = await Promise.all([getTimeline(id), getAttachments(id)]);
      setTimeline(t); setPhotos(a);
    } catch (e) { setError(errMsg(e)); setC(null); }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { getCategories(true).then((x) => setCats(Object.fromEntries(x.map((k) => [k.code, k.name])))).catch(() => {}); }, []);
  useEffect(() => {
    if (!isManager) return;
    getEmployees(true).then(setEmployees).catch(() => {});
    getTeams().then(setTeams).catch(() => {});
  }, [isManager]);

  if (c === undefined) return <Loading />;
  if (!c) {
    return (
      <div className="page narrow"><div className="panel empty">
        <h3>Complaint not found</h3><p>It may have been removed, or you don't have access to it.</p>
        <Link to="/home" className="btn secondary">Go back</Link>
      </div></div>
    );
  }

  const isAssignee = c.assigned_to === profile.id;
  const canWork = !isCustomer && (isManager || isAssignee || (profile.team_id && profile.team_id === c.team_id));
  const active = ACTIVE_STATUSES.includes(c.status);
  const reopenDays = Number(settings.reopen_window_days) || 15;
  const canReopen = isCustomer && (c.status === 'resolved' || (c.status === 'closed' && c.closed_at &&
    (Date.now() - new Date(c.closed_at)) / 864e5 <= reopenDays));
  const backTo = isCustomer ? '/my' : isManager ? '/admin/complaints' : '/tasks';
  const issuePhotos = photos.filter((p) => p.kind !== 'resolution');
  const fixPhotos = photos.filter((p) => p.kind === 'resolution');

  async function run(fn, okMsg) {
    setError('');
    try { await fn(); if (okMsg) toast(okMsg); setModal(null); await load(); return true; }
    catch (e) { toast(errMsg(e), 'error'); return false; }
  }

  return (
    <div className="page">
      <Link to={backTo} className="back"><Icon name="back" />{isCustomer ? 'My complaints' : isManager ? 'All complaints' : 'My tasks'}</Link>
      <div className="page-head">
        <div style={{ minWidth: 0 }}>
          <div className="row" style={{ gap: 8, marginBottom: 8 }}>
            <span className="mono-id muted">{c.complaint_no}</span>
            <StatusBadge status={c.status} /><PriorityBadge priority={c.priority} /><OverdueBadge complaint={c} />
            {c.reopen_count > 0 && <span className="badge warn-tag plain">Reopened ×{c.reopen_count}</span>}
          </div>
          <h1>{c.title}</h1>
        </div>
        <div className="row">
          {isCustomer && c.status === 'resolved' && (
            <button className="btn" onClick={() => setModal('close')}><Icon name="check" />Confirm fix & close</button>
          )}
          {canReopen && <button className="btn secondary" onClick={() => setModal('reopen')}>Reopen</button>}
          {canWork && (c.status === 'assigned' || c.status === 'open') && c.assigned_to && (
            <button className="btn" onClick={() => run(() => setStatus(c.id, 'in_progress'), 'Marked in progress')}>Start work</button>
          )}
          {canWork && c.status === 'in_progress' && (
            <button className="btn" onClick={() => setModal('resolve')}><Icon name="check" />Mark resolved</button>
          )}
          {isManager && c.status === 'resolved' && (
            <button className="btn secondary" onClick={() => run(() => setStatus(c.id, 'closed', 'Closed by office'), 'Complaint closed')}>Close</button>
          )}
        </div>
      </div>

      <div className="panel panel-pad" style={{ marginBottom: 20 }}><StatusRail status={c.status} /></div>
      <ErrorBox error={error} />

      <div className="detail-grid">
        <div className="stack">
          <section className="panel panel-pad stack">
            <div className="spread">
              <h3>{KIND_LABEL[c.kind]} · {cats[c.category] || c.category}</h3>
              <span className="small muted">{c.area === 'common' ? 'Common area' : 'Inside the flat'}</span>
            </div>
            {c.location_detail && <p className="small"><b>Location:</b> {c.location_detail}</p>}
            <p style={{ whiteSpace: 'pre-wrap' }}>{c.description}</p>
            {issuePhotos.length > 0 && <Gallery items={issuePhotos} />}
            {(isCustomer ? active : canWork) && (
              <button className="linkish small" style={{ alignSelf: 'flex-start' }} onClick={() => setModal('photos')}>
                <Icon name="camera" size={16} /> Add photos
              </button>
            )}
          </section>

          {(c.resolution_notes || fixPhotos.length > 0) && (
            <section className="panel panel-pad stack">
              <h3>Resolution</h3>
              {c.resolution_notes && <p style={{ whiteSpace: 'pre-wrap' }}>{c.resolution_notes}</p>}
              {fixPhotos.length > 0 && <Gallery items={fixPhotos} />}
              {c.resolved_at && <p className="small muted">Resolved {fmtDateTime(c.resolved_at)} — {hoursBetween(c.created_at, c.resolved_at)} hours after it was raised.</p>}
            </section>
          )}

          {c.customer_rating && (
            <section className="panel panel-pad stack">
              <h3>Customer feedback</h3>
              <Stars value={c.customer_rating} read />
              {c.customer_feedback && <p>{c.customer_feedback}</p>}
            </section>
          )}

          <section className="panel">
            <div className="panel-head"><h3>History & conversation</h3></div>
            <div className="panel-pad"><Timeline items={timeline} /></div>
            {c.status !== 'closed' || isManager ? (
              <CommentBox staff={!isCustomer} onSend={(msg, internal) => run(() => addComment(c.id, msg, internal), internal ? 'Note added' : 'Message sent')} />
            ) : null}
          </section>
        </div>

        <aside className="stack">
          <section className="panel panel-pad stack">
            <div className="row"><FlatPlate c={c} lg /></div>
            <dl className="kv">
              <dt>Project</dt><dd>{c.project_name}</dd>
              <dt>Building</dt><dd>{c.tower_name} / Wing {c.wing_name}</dd>
              {!isCustomer && <><dt>Customer</dt><dd>{c.customer_name}</dd></>}
              {!isCustomer && c.customer_mobile && <><dt>Mobile</dt><dd><a href={`tel:${c.customer_mobile}`}>{c.customer_mobile}</a> · <a href={`https://wa.me/91${c.customer_mobile.slice(-10)}`} target="_blank" rel="noreferrer">WhatsApp</a></dd></>}
              <dt>Raised</dt><dd>{fmtDateTime(c.created_at)}</dd>
              <dt>Deadline</dt><dd style={{ color: isOverdue(c) ? 'var(--danger)' : undefined }}>{fmtDateTime(c.due_at)}<div className="tiny muted">{active ? dueText(c) : ''}</div></dd>
              <dt>Assigned to</dt><dd>{c.assignee_name || <span className="faint">Not yet assigned</span>}</dd>
              {c.team && <><dt>Team</dt><dd>{c.team.name}</dd></>}
              {!isCustomer && <><dt>Source</dt><dd>{SOURCES.find((s) => s.value === c.source)?.label || 'Customer portal'}</dd></>}
            </dl>
          </section>

          {isManager && (
            <ManagePanel c={c} employees={employees} teams={teams}
              onSave={(patch, msg) => run(() => updateComplaint(c.id, patch), msg)}
              onStatus={(s, note) => run(() => setStatus(c.id, s, note), 'Status updated')} />
          )}
          {isAdmin && (
            <button className="btn danger secondary" onClick={() => {
              if (window.confirm(`Delete ${c.complaint_no} permanently? This also deletes its history.`)) {
                deleteComplaint(c.id).then(() => { toast('Complaint deleted'); nav('/admin/complaints'); }).catch((e) => toast(errMsg(e), 'error'));
              }
            }}><Icon name="trash" />Delete complaint</button>
          )}
        </aside>
      </div>

      {modal === 'close' && <CloseModal onClose={() => setModal(null)} onSubmit={(r, f) => run(() => customerClose(c.id, r, f), 'Thank you! Complaint closed.')} />}
      {modal === 'reopen' && <ReasonModal title="Reopen complaint" label="What is still wrong?" cta="Reopen" onClose={() => setModal(null)} onSubmit={(r) => run(() => customerReopen(c.id, r), 'Complaint reopened')} />}
      {modal === 'resolve' && <ResolveModal onClose={() => setModal(null)} onSubmit={async (notes, files) => run(async () => {
        if (files.length) await uploadPhotos(c.id, files, 'resolution');
        await setStatus(c.id, 'resolved', null, notes);
      }, 'Marked resolved — customer notified')} />}
      {modal === 'photos' && <PhotosModal onClose={() => setModal(null)} onSubmit={(files) => run(() => uploadPhotos(c.id, files, isCustomer ? 'issue' : 'resolution'), 'Photos added')} />}
    </div>
  );
}

function Gallery({ items }) {
  return (
    <div className="photos">
      {items.map((p) => (
        <a key={p.id} className="photo" href={p.url} target="_blank" rel="noreferrer">
          {p.url ? <img src={p.url} alt={p.file_name || 'Photo'} loading="lazy" /> : null}
        </a>
      ))}
    </div>
  );
}

function CommentBox({ staff, onSend }) {
  const [msg, setMsg] = useState('');
  const [internal, setInternal] = useState(false);
  const [busy, setBusy] = useState(false);
  async function send(e) {
    e.preventDefault();
    const text = msg.trim();
    if (!text || busy) return;
    setBusy(true); setMsg('');
    const ok = await onSend(text, internal);
    if (!ok) setMsg(text); // keep what they typed if it didn't send
    setBusy(false);
  }
  return (
    <form onSubmit={send} className="stack" style={{ padding: 16, borderTop: '1px solid var(--line)', gap: 10 }}>
      <textarea className="input" style={{ minHeight: 80 }} maxLength={2000} placeholder={staff ? 'Reply to the customer, or add an internal note…' : 'Write a message to the maintenance team…'}
        value={msg} onChange={(e) => setMsg(e.target.value)} />
      <div className="spread">
        {staff ? (
          <label className="check"><input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />Internal note (customer won't see it)</label>
        ) : <span />}
        <button className="btn sm" disabled={busy || !msg.trim()}>{internal ? 'Add note' : 'Send'}</button>
      </div>
    </form>
  );
}

function ManagePanel({ c, employees, teams, onSave, onStatus }) {
  const [assignee, setAssignee] = useState(c.assigned_to || '');
  const [team, setTeam] = useState(c.team_id || '');
  const [priority, setPriority] = useState(c.priority);
  const [due, setDue] = useState(toLocalInput(c.due_at));
  const [status, setSt] = useState(c.status);
  const [note, setNote] = useState('');
  useEffect(() => { setAssignee(c.assigned_to || ''); setTeam(c.team_id || ''); setPriority(c.priority); setDue(toLocalInput(c.due_at)); setSt(c.status); }, [c]);

  const forProject = employees.filter((e) => !e.project_ids?.length || e.project_ids.includes(c.project_id));
  const list = team ? [...forProject.filter((e) => e.team_id === team), ...forProject.filter((e) => e.team_id !== team)] : forProject;
  const dirty = assignee !== (c.assigned_to || '') || team !== (c.team_id || '') || priority !== c.priority || due !== toLocalInput(c.due_at);

  return (
    <section className="panel">
      <div className="panel-head"><h3>Manage task</h3></div>
      <div className="panel-pad stack" style={{ gap: 12 }}>
        <Field label="Team">
          <select className="input" value={team} onChange={(e) => setTeam(e.target.value)}>
            <option value="">— None —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Assign to">
          <select className="input" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">— Unassigned —</option>
            {list.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.team ? ` (${e.team.name})` : ''}</option>)}
          </select>
        </Field>
        <div className="stack" style={{ gap: 12 }}>
          <Field label="Priority">
            <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </Field>
          <Field label="Deadline">
            <input className="input" type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} />
          </Field>
        </div>
        <button className="btn" disabled={!dirty} onClick={() => {
          const patch = { assigned_to: assignee || null, team_id: team || null, priority };
          // the date box has minute precision; only send it when the manager changed it
          if (due && due !== toLocalInput(c.due_at)) patch.due_at = new Date(due).toISOString();
          onSave(patch, 'Task updated');
        }}>Save changes</button>

        <div className="hr" />
        <Field label="Change status">
          <select className="input" value={status} onChange={(e) => setSt(e.target.value)}>
            {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </Field>
        <input className="input" placeholder="Note for the history (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button className="btn secondary" disabled={status === c.status} onClick={() => onStatus(status, note)}>Update status</button>
      </div>
    </section>
  );
}

function CloseModal({ onClose, onSubmit }) {
  const [rating, setRating] = useState(0);
  const [fb, setFb] = useState('');
  return (
    <Modal title="Confirm the fix" onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={() => onSubmit(rating || null, fb)}>Close complaint</button></>}>
      <p>Is the problem fixed? Rate the service to help us improve.</p>
      <Stars value={rating} onChange={setRating} />
      <Field label="Comments (optional)"><textarea className="input" value={fb} onChange={(e) => setFb(e.target.value)} /></Field>
    </Modal>
  );
}

function ReasonModal({ title, label, cta, onClose, onSubmit }) {
  const [r, setR] = useState('');
  return (
    <Modal title={title} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={!r.trim()} onClick={() => onSubmit(r.trim())}>{cta}</button></>}>
      <Field label={label}><textarea className="input" value={r} onChange={(e) => setR(e.target.value)} /></Field>
    </Modal>
  );
}

function ResolveModal({ onClose, onSubmit }) {
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Mark as resolved" onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy || notes.trim().length < 3} onClick={async () => { setBusy(true); await onSubmit(notes.trim(), files); setBusy(false); }}>{busy ? 'Saving…' : 'Mark resolved'}</button></>}>
      <Field label="What was done?" hint="The customer sees this.">
        <textarea className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Replaced the sink trap and sealed the joint" />
      </Field>
      <Field group label="After photos (optional)"><PhotoPicker files={files} onChange={setFiles} /></Field>
    </Modal>
  );
}

function PhotosModal({ onClose, onSubmit }) {
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Add photos" onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button>
        <button className="btn" disabled={busy || !files.length} onClick={async () => { setBusy(true); await onSubmit(files); setBusy(false); }}>{busy ? 'Uploading…' : 'Upload'}</button></>}>
      <PhotoPicker files={files} onChange={setFiles} />
    </Modal>
  );
}
