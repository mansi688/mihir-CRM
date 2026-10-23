import { useEffect, useState } from 'react';
import { useAuth } from '../../lib/auth';
import { deleteTeam, getCategories, getEmployees, getSettingRows, getSla, getTeams, saveSetting, saveSla, upsertCategory, upsertTeam } from '../../lib/api';
import { PRIORITIES } from '../../lib/constants';
import { errMsg } from '../../lib/utils';
import { ErrorBox, Field, Loading, useToast } from '../../components/UI';

export default function Settings() {
  const [tab, setTab] = useState('company');
  return (
    <div className="page">
      <div className="page-head"><div><h1>Settings</h1><p>Company details, branding, teams, complaint routing and deadlines.</p></div></div>
      <div className="seg" style={{ marginBottom: 18 }}>
        {[['company', 'Company'], ['landing', 'Branding'], ['routing', 'Categories & routing'], ['teams', 'Teams'], ['sla', 'Deadlines (SLA)']].map(([k, l]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      {tab === 'company' && <Company />}
      {tab === 'landing' && <Landing />}
      {tab === 'routing' && <Routing />}
      {tab === 'teams' && <Teams />}
      {tab === 'sla' && <Sla />}
    </div>
  );
}

function Company() {
  const { refreshSettings } = useAuth();
  const toast = useToast();
  const [s, setS] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { getSettingRows().then((r) => setS(Object.fromEntries(r.map((x) => [x.key, x.value])))); }, []);
  if (!s) return <Loading />;
  async function save() {
    try {
      await Promise.all([
        saveSetting('company_name', s.company_name),
        saveSetting('support_phone', s.support_phone),
        saveSetting('require_flat_verification', Boolean(s.require_flat_verification)),
        saveSetting('reopen_window_days', Number(s.reopen_window_days) || 15),
      ]);
      await refreshSettings(); toast('Settings saved');
    } catch (e) { setError(errMsg(e)); }
  }
  return (
    <div className="panel panel-pad stack" style={{ maxWidth: 640 }}>
      <ErrorBox error={error} />
      <Field label="Company name"><input className="input" value={s.company_name} onChange={(e) => setS({ ...s, company_name: e.target.value })} /></Field>
      <Field label="Helpdesk phone" hint="Shown to customers on sign-in"><input className="input" value={s.support_phone} onChange={(e) => setS({ ...s, support_phone: e.target.value })} /></Field>
      <Field label="Customers can reopen closed complaints for (days)"><input className="input" type="number" min={0} value={s.reopen_window_days} onChange={(e) => setS({ ...s, reopen_window_days: e.target.value })} /></Field>
      <label className="check"><input type="checkbox" checked={!!s.require_flat_verification} onChange={(e) => setS({ ...s, require_flat_verification: e.target.checked })} />
        Customers must be verified by the office before raising complaints</label>
      <div><button className="btn" onClick={save}>Save</button></div>
    </div>
  );
}

function Landing() {
  const { refreshSettings } = useAuth();
  const toast = useToast();
  const [l, setL] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { getSettingRows().then((r) => setL(r.find((x) => x.key === 'landing')?.value || {})); }, []);
  if (!l) return <Loading />;
  const set = (k) => (e) => setL({ ...l, [k]: e.target.value });
  async function save() {
    try {
      await saveSetting('landing', { ...l });
      await refreshSettings(); toast('Branding saved');
    } catch (e) { setError(errMsg(e)); }
  }
  return (
    <div className="panel panel-pad stack" style={{ maxWidth: 820 }}>
      <ErrorBox error={error} />
      <p className="small muted">Shown on the sign-in and registration pages. Each project's own photo and colours are set under Projects &amp; flats.</p>
      <div className="grid-2">
        <Field label="Logo image link"><input className="input" value={l.logo_url || ''} onChange={set('logo_url')} /></Field>
        <Field label="Sign-in page photo link" hint="A real project photograph"><input className="input" value={l.hero_image_url || ''} onChange={set('hero_image_url')} /></Field>
        <Field label="Helpdesk phone"><input className="input" value={l.contact_phone || ''} onChange={set('contact_phone')} /></Field>
        <Field label="Helpdesk email"><input className="input" value={l.contact_email || ''} onChange={set('contact_email')} /></Field>
      </div>
      <div><button className="btn" onClick={save}>Save branding</button></div>
    </div>
  );
}

function Routing() {
  const toast = useToast();
  const [cats, setCats] = useState(null);
  const [teams, setTeams] = useState([]);
  const [emps, setEmps] = useState([]);
  const load = () => getCategories(true).then(setCats);
  useEffect(() => { load(); getTeams().then(setTeams); getEmployees(true).then(setEmps); }, []);
  if (!cats) return <Loading />;
  async function save(c, patch) {
    try { await upsertCategory({ ...c, ...patch }); toast('Saved'); load(); } catch (e) { toast(errMsg(e), 'error'); }
  }
  async function add() {
    const name = window.prompt('Category name');
    if (!name?.trim()) return;
    const code = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    save({ code, name: name.trim(), scope: 'both', default_priority: 'medium', sort_order: (cats.at(-1)?.sort_order || 0) + 10, is_active: true }, {});
  }
  return (
    <div className="panel">
      <div className="panel-head"><h3>Where each kind of complaint goes</h3><button className="btn sm" onClick={add}>Add category</button></div>
      <p className="small muted" style={{ padding: '12px 20px 0' }}>New complaints go to the fixed person if set; otherwise to the least-busy member of the team who handles that project.</p>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Category</th><th>Applies to</th><th>Team</th><th>Fixed person</th><th>Default priority</th><th>Active</th></tr></thead>
          <tbody>
            {cats.map((c) => (
              <tr key={c.code}>
                <td><input className="input sm" defaultValue={c.name} onBlur={(e) => e.target.value !== c.name && save(c, { name: e.target.value })} /></td>
                <td><select className="input sm" value={c.scope} onChange={(e) => save(c, { scope: e.target.value })}>
                  <option value="flat">Inside flat</option><option value="common">Common area</option><option value="both">Both</option></select></td>
                <td><select className="input sm" value={c.default_team_id || ''} onChange={(e) => save(c, { default_team_id: e.target.value || null })}>
                  <option value="">— None —</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></td>
                <td><select className="input sm" value={c.default_assignee_id || ''} onChange={(e) => save(c, { default_assignee_id: e.target.value || null })}>
                  <option value="">Auto (least busy)</option>{emps.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}</select></td>
                <td><select className="input sm" value={c.default_priority} onChange={(e) => save(c, { default_priority: e.target.value })}>
                  {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}</select></td>
                <td><input type="checkbox" checked={c.is_active} onChange={(e) => save(c, { is_active: e.target.checked })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Teams() {
  const toast = useToast();
  const [teams, setTeams] = useState(null);
  const load = () => getTeams().then(setTeams);
  useEffect(() => { load(); }, []);
  if (!teams) return <Loading />;
  async function save(row) { try { await upsertTeam(row); toast('Saved'); load(); } catch (e) { toast(errMsg(e), 'error'); } }
  return (
    <div className="panel" style={{ maxWidth: 820 }}>
      <div className="panel-head"><h3>Maintenance teams</h3><button className="btn sm" onClick={() => { const n = window.prompt('Team name'); if (n?.trim()) save({ name: n.trim() }); }}>Add team</button></div>
      <div className="table-wrap">
        <table className="table">
          <thead><tr><th>Name</th><th>Handles</th><th /></tr></thead>
          <tbody>
            {teams.map((t) => (
              <tr key={t.id}>
                <td><input className="input sm" defaultValue={t.name} onBlur={(e) => e.target.value !== t.name && save({ ...t, name: e.target.value })} /></td>
                <td><input className="input sm" defaultValue={t.description || ''} onBlur={(e) => e.target.value !== (t.description || '') && save({ ...t, description: e.target.value })} /></td>
                <td><button className="btn ghost sm" onClick={() => window.confirm(`Delete team ${t.name}?`) && deleteTeam(t.id).then(load).catch((e) => toast(errMsg(e), 'error'))}>Delete</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Sla() {
  const toast = useToast();
  const [rows, setRows] = useState(null);
  useEffect(() => { getSla().then(setRows); }, []);
  if (!rows) return <Loading />;
  const order = PRIORITIES.map((p) => p.value);
  return (
    <div className="panel panel-pad stack" style={{ maxWidth: 520 }}>
      <p className="small muted">Deadline set automatically on every new complaint, by priority. Managers can change a single complaint's deadline any time.</p>
      {[...rows].sort((a, b) => order.indexOf(b.priority) - order.indexOf(a.priority)).map((r) => (
        <div key={r.priority} className="spread">
          <span className={`badge pr pr-${r.priority}`}>{PRIORITIES.find((p) => p.value === r.priority)?.label}</span>
          <span className="row"><input className="input sm" style={{ width: 100 }} type="number" min={1} defaultValue={r.resolve_hours}
            onBlur={(e) => Number(e.target.value) !== r.resolve_hours && saveSla(r.priority, Number(e.target.value)).then(() => toast('Saved')).catch((er) => toast(errMsg(er), 'error'))} /> hours</span>
        </div>
      ))}
    </div>
  );
}
