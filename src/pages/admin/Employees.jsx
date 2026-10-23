import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { adminUsers, getEmployees, getProjects, getTeams, updateProfile } from '../../lib/api';
import { ROLES, ROLE_LABEL } from '../../lib/constants';
import { projectColors } from '../../lib/theme';
import { errMsg, initials } from '../../lib/utils';
import { Empty, ErrorBox, Field, Loading, Modal, useToast } from '../../components/UI';

export default function Employees() {
  const { profile } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState(null);
  const [teams, setTeams] = useState([]);
  const [projects, setProjects] = useState([]);
  const [edit, setEdit] = useState(null);
  const [error, setError] = useState('');

  const load = () => getEmployees().then(setRows).catch((e) => setError(errMsg(e)));
  useEffect(() => { load(); getTeams().then(setTeams); getProjects(true).then(setProjects); }, []);
  const pname = (id) => projects.find((p) => p.id === id);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Employees</h1><p>Technicians, managers and admins. Limit people to specific projects so they only see that project's customers and complaints.</p></div>
        <button className="btn" onClick={() => setEdit({})}>Add employee</button>
      </div>
      <ErrorBox error={error} />
      <div className="panel">
        {!rows ? <Loading /> : rows.length === 0 ? <Empty title="No employees yet" /> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Name</th><th>Role</th><th>Team</th><th>Projects</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td><div className="row" style={{ gap: 10 }}><span className="avatar">{initials(e.full_name)}</span><div><div className="strong">{e.full_name}</div><div className="tiny muted">{e.designation || ''} {e.mobile ? `· ${e.mobile}` : ''}</div><div className="tiny muted">{e.email}</div></div></div></td>
                    <td>{ROLE_LABEL[e.role]}</td>
                    <td className="small">{e.team?.name || <span className="faint">—</span>}</td>
                    <td>
                      {e.role === 'admin' || !e.project_ids?.length ? <span className="small muted">All projects</span> : (
                        <div className="row" style={{ gap: 4 }}>
                          {e.project_ids.map((id) => { const p = pname(id); return p ? <span key={id} className="badge plain" style={{ background: projectColors(p).primary, color: '#fff' }}>{p.name}</span> : null; })}
                        </div>
                      )}
                    </td>
                    <td>{e.is_active ? <span className="badge ok-tag">Active</span> : <span className="badge st-closed">Inactive</span>}</td>
                    <td><button className="btn ghost sm" onClick={() => setEdit(e)}>Edit</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && (
        <EmployeeModal emp={edit} teams={teams} projects={projects} self={edit.id === profile.id}
          onClose={() => setEdit(null)} onDone={(msg) => { setEdit(null); load(); toast(msg); }} />
      )}
    </div>
  );
}

function EmployeeModal({ emp, teams, projects, self, onClose, onDone }) {
  const isNew = !emp.id;
  const [f, setF] = useState({
    full_name: emp.full_name || '', mobile: emp.mobile || '', email: emp.email || '', password: '',
    role: emp.role || 'staff', team_id: emp.team_id || '', designation: emp.designation || '',
    project_ids: emp.project_ids || [], is_active: emp.is_active ?? true,
  });
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleProject = (id) => setF({ ...f, project_ids: f.project_ids.includes(id) ? f.project_ids.filter((x) => x !== id) : [...f.project_ids, id] });

  async function save() {
    setError(''); setBusy(true);
    try {
      if (isNew) {
        await adminUsers({ action: 'create_user', ...f, team_id: f.team_id || null, mobile: f.mobile.replace(/[^0-9]/g, '').slice(-10) });
        onDone('Employee added');
      } else {
        await updateProfile(emp.id, {
          full_name: f.full_name, mobile: f.mobile || null, role: f.role, team_id: f.team_id || null,
          designation: f.designation || null, project_ids: f.role === 'admin' ? [] : f.project_ids, is_active: f.is_active,
        });
        if (newPw) await adminUsers({ action: 'reset_password', user_id: emp.id, password: newPw });
        onDone('Employee updated');
      }
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <Modal title={isNew ? 'Add employee' : `Edit ${emp.full_name}`} onClose={onClose} wide
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save'}</button></>}>
      <ErrorBox error={error} />
      <div className="grid-2">
        <Field label="Full name"><input className="input" value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Mobile" hint="Gets WhatsApp task alerts"><input className="input" type="tel" value={f.mobile} onChange={set('mobile')} /></Field>
        {isNew && <Field label="Email (login ID)"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>}
        {isNew && <Field label="Temporary password"><input className="input" value={f.password} onChange={set('password')} /></Field>}
        <Field label="Role">
          <select className="input" value={f.role} onChange={set('role')} disabled={self}>
            {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </Field>
        <Field label="Team" hint="Complaints in this team's categories are auto-assigned to its members">
          <select className="input" value={f.team_id} onChange={set('team_id')}>
            <option value="">— None —</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Designation"><input className="input" placeholder="e.g. Plumber, Facility Manager" value={f.designation} onChange={set('designation')} /></Field>
        {!isNew && <Field label="Reset password" hint="Leave blank to keep"><input className="input" value={newPw} onChange={(e) => setNewPw(e.target.value)} /></Field>}
      </div>
      {f.role !== 'admin' && (
        <Field group label="Projects handled" hint="None selected = all projects">
          <div className="row" style={{ gap: 6 }}>
            {projects.map((p) => {
              const on = f.project_ids.includes(p.id);
              return (
                <button type="button" key={p.id} className={`proj-chip ${on ? 'on' : ''}`} style={{ '--c': projectColors(p).primary }} onClick={() => toggleProject(p.id)}>{p.name}</button>
              );
            })}
          </div>
        </Field>
      )}
      {!isNew && !self && <label className="check"><input type="checkbox" checked={f.is_active} onChange={set('is_active')} />Active (untick to remove their access to the CRM)</label>}
    </Modal>
  );
}
