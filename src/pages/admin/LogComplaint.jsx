import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createComplaint, getCategories, getEmployees, getMyFlats, listCustomers } from '../../lib/api';
import { KINDS, PRIORITIES, SOURCES } from '../../lib/constants';
import { errMsg } from '../../lib/utils';
import PhotoPicker from '../../components/PhotoPicker';
import Icon from '../../components/Icons';
import { ErrorBox, Field, FlatPlate, useToast } from '../../components/UI';

// Office staff log a complaint received by phone / walk-in on behalf of a customer
export default function LogComplaint() {
  const toast = useToast();
  const nav = useNavigate();
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [customer, setCustomer] = useState(null);
  const [flats, setFlats] = useState([]);
  const [cats, setCats] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState({ flat_id: '', source: 'phone', kind: 'complaint', category: '', area: 'flat', location_detail: '', title: '', description: '', priority: '', assigned_to: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => { getCategories().then(setCats); getEmployees(true).then(setEmployees); }, []);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return undefined; }
    const t = setTimeout(() => listCustomers({ search: q.trim(), pageSize: 8 }).then((r) => setResults(r.data)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => {
    if (!customer) return;
    getMyFlats(customer.id).then((f) => { setFlats(f); set('flat_id', f[0]?.flat?.id || ''); });
  }, [customer]);

  const cat = cats.find((c) => c.code === form.category);
  const area = cat && cat.scope !== 'both' ? cat.scope : form.area;
  const selectedFlat = flats.find((cf) => cf.flat.id === form.flat_id);
  const projectId = selectedFlat?.flat.wing.tower.project.id;
  const staffForProject = employees.filter((e) => !e.project_ids?.length || e.project_ids.includes(projectId));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!customer || !form.flat_id) return setError('Choose the customer and their flat.');
    if (!form.category) return setError('Choose a category.');
    setBusy(true);
    try {
      const row = await createComplaint({
        customer_id: customer.id, flat_id: form.flat_id, source: form.source, kind: form.kind, category: form.category, area,
        location_detail: form.location_detail.trim() || null, title: form.title.trim(), description: form.description.trim(),
        priority: form.priority || null, assigned_to: form.assigned_to || null,
      }, files);
      toast(`Logged ${row.complaint_no}`);
      nav(`/complaints/${row.id}`, { replace: true });
    } catch (err) { setError(errMsg(err)); setBusy(false); }
  }

  return (
    <div className="page narrow">
      <Link to="/admin/complaints" className="back"><Icon name="back" />Complaints</Link>
      <div className="page-head"><div><h1>Log a complaint</h1><p>For complaints received by phone, at the site office, by email or WhatsApp.</p></div></div>
      <form className="stack" onSubmit={submit}>
        <ErrorBox error={error} />
        <section className="panel panel-pad stack">
          <h3>Customer</h3>
          {customer ? (
            <div className="spread">
              <div><div className="strong">{customer.full_name}</div><div className="small muted">{customer.mobile} · {customer.email}</div></div>
              <button type="button" className="btn ghost sm" onClick={() => { setCustomer(null); setFlats([]); }}>Change</button>
            </div>
          ) : (
            <>
              <input className="input" autoFocus placeholder="Search by name, mobile or email" value={q} onChange={(e) => setQ(e.target.value)} />
              {results.length > 0 && (
                <div className="list" style={{ border: '1px solid var(--line)', borderRadius: 10 }}>
                  {results.map((r) => (
                    <button type="button" key={r.id} className="list-item linkish" style={{ textAlign: 'left', width: '100%', color: 'inherit', fontWeight: 400 }} onClick={() => setCustomer(r)}>
                      <b>{r.full_name}</b> <span className="muted small">{r.mobile} · {r.customer_flats?.map((cf) => `${cf.flat.wing.tower.project.name} ${cf.flat.wing.name}-${cf.flat.flat_no}`).join(', ')}</span>
                    </button>
                  ))}
                </div>
              )}
              <p className="small muted">Not registered yet? Add them first under <Link to="/admin/customers">Customers</Link>.</p>
            </>
          )}
          {customer && (
            flats.length === 0 ? <div className="alert-box warn">This customer has no flat linked. Link one in Customers first.</div> : (
              <Field group label="Flat">
                <div className="choice-grid">
                  {flats.map((cf) => (
                    <button type="button" key={cf.id} className={`choice ${form.flat_id === cf.flat.id ? 'on' : ''}`} onClick={() => set('flat_id', cf.flat.id)}>
                      <FlatPlate tower={cf.flat.wing.tower.name} wing={cf.flat.wing.name} flat={cf.flat.flat_no} />
                      <small style={{ marginTop: 6 }}>{cf.flat.wing.tower.project.name}</small>
                    </button>
                  ))}
                </div>
              </Field>
            )
          )}
          <div className="grid-2">
            <Field label="Received via">
              <select className="input" value={form.source} onChange={(e) => set('source', e.target.value)}>
                {SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </Field>
            <Field label="Type">
              <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
                {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
            </Field>
          </div>
        </section>

        <section className="panel panel-pad stack">
          <div className="grid-2">
            <Field label="Category">
              <select className="input" required value={form.category} onChange={(e) => set('category', e.target.value)}>
                <option value="">Select</option>
                {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Area">
              <select className="input" value={area} disabled={cat && cat.scope !== 'both'} onChange={(e) => set('area', e.target.value)}>
                <option value="flat">Inside the flat</option><option value="common">Common area</option>
              </select>
            </Field>
          </div>
          {area === 'common' && <Field label="Exact location"><input className="input" value={form.location_detail} onChange={(e) => set('location_detail', e.target.value)} /></Field>}
          <Field label="Title"><input className="input" required maxLength={150} value={form.title} onChange={(e) => set('title', e.target.value)} /></Field>
          <Field label="Description"><textarea className="input" required value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
          <div className="grid-2">
            <Field label="Priority" hint="Blank = category default">
              <select className="input" value={form.priority} onChange={(e) => set('priority', e.target.value)}>
                <option value="">Category default</option>
                {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </Field>
            <Field label="Assign to" hint="Blank = automatic routing">
              <select className="input" value={form.assigned_to} onChange={(e) => set('assigned_to', e.target.value)}>
                <option value="">Automatic</option>
                {staffForProject.map((e) => <option key={e.id} value={e.id}>{e.full_name}{e.team ? ` (${e.team.name})` : ''}</option>)}
              </select>
            </Field>
          </div>
          <Field group label="Photos"><PhotoPicker files={files} onChange={setFiles} /></Field>
        </section>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <Link to="/admin/complaints" className="btn secondary">Cancel</Link>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Log complaint'}</button>
        </div>
      </form>
    </div>
  );
}
