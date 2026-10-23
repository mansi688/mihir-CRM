import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminUsers, linkFlat, listCustomers, setFlatVerified, unlinkFlat } from '../../lib/api';
import { RELATIONS } from '../../lib/constants';
import { downloadCSV, errMsg, fmtDate } from '../../lib/utils';
import FlatPicker from '../../components/FlatPicker';
import ProjectSwitch from '../../components/ProjectSwitch';
import Icon from '../../components/Icons';
import { Empty, ErrorBox, Field, FlatPlate, Loading, Modal, Pager, useToast } from '../../components/UI';

const PAGE = 25;

export default function Customers() {
  const toast = useToast();
  const [project, setProject] = useState('');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [unverified, setUnverified] = useState(false);
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);

  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(0); }, 300); return () => clearTimeout(t); }, [search]);
  const load = () => {
    setData(null);
    listCustomers({ search: q, page, pageSize: PAGE, projectId: project, unverified }).then(setData).catch((e) => setError(errMsg(e)));
  };
  useEffect(load, [q, page, project, unverified]); // eslint-disable-line

  async function toggleVerify(cf) {
    try { await setFlatVerified(cf.id, !cf.verified); toast(cf.verified ? 'Marked unverified' : 'Flat verified'); load(); }
    catch (e) { toast(errMsg(e), 'error'); }
  }
  async function removeLink(cf) {
    if (!window.confirm('Remove this flat from the customer?')) return;
    try { await unlinkFlat(cf.id); toast('Flat removed'); load(); } catch (e) { toast(errMsg(e), 'error'); }
  }
  async function exportCSV() {
    try {
      const all = await listCustomers({ search: q, pageSize: 5000, projectId: project, unverified });
      const rows = all.data.flatMap((c) => (c.customer_flats.length ? c.customer_flats : [null]).map((cf) => ({ c, cf })));
      downloadCSV(`customers-${new Date().toISOString().slice(0, 10)}.csv`, rows, [
        { label: 'Name', value: (r) => r.c.full_name }, { label: 'Mobile', value: (r) => r.c.mobile }, { label: 'Email', value: (r) => r.c.email },
        { label: 'Project', value: (r) => r.cf?.flat.wing.tower.project.name }, { label: 'Tower', value: (r) => r.cf?.flat.wing.tower.name },
        { label: 'Wing', value: (r) => r.cf?.flat.wing.name }, { label: 'Flat', value: (r) => r.cf?.flat.flat_no },
        { label: 'Relation', value: (r) => r.cf?.relation }, { label: 'Verified', value: (r) => (r.cf?.verified ? 'Yes' : 'No') },
        { label: 'Registered', value: (r) => fmtDate(r.c.created_at) },
      ]);
    } catch (e) { toast(errMsg(e), 'error'); }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Customers</h1><p>Owners and tenants, separated project by project.</p></div>
        <div className="row">
          <button className="btn secondary" onClick={exportCSV}><Icon name="download" />Export CSV</button>
          <button className="btn" onClick={() => setModal({ type: 'add' })}>Add customer</button>
        </div>
      </div>
      <ProjectSwitch value={project} onChange={(v) => { setProject(v); setPage(0); }} />
      <div className="panel">
        <div className="filters">
          <input className="input search sm" placeholder="Search name, mobile or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          <label className="check"><input type="checkbox" checked={unverified} onChange={(e) => { setUnverified(e.target.checked); setPage(0); }} />Awaiting verification</label>
          {data && <span className="small muted">{data.count} customer{data.count === 1 ? '' : 's'}</span>}
        </div>
        <ErrorBox error={error} />
        {!data ? <Loading /> : data.data.length === 0 ? <Empty title="No customers found">Customers appear here when they register, or when you add them.</Empty> : (
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Customer</th><th>Flats</th><th>Registered</th><th /></tr></thead>
              <tbody>
                {data.data.map((c) => (
                  <tr key={c.id}>
                    <td><div className="strong">{c.full_name}</div><div className="tiny muted">{c.mobile || '—'} · {c.email}</div></td>
                    <td>
                      <div className="stack" style={{ gap: 6 }}>
                        {c.customer_flats.map((cf) => (
                          <div key={cf.id} className="row" style={{ gap: 8 }}>
                            <FlatPlate tower={cf.flat.wing.tower.name} wing={cf.flat.wing.name} flat={cf.flat.flat_no} />
                            <span className="small">{cf.flat.wing.tower.project.name}</span>
                            <span className="tiny muted">{cf.relation}</span>
                            <button className={`badge ${cf.verified ? 'ok-tag' : 'warn-tag'}`} style={{ border: 0, cursor: 'pointer' }} onClick={() => toggleVerify(cf)} title="Click to toggle">
                              {cf.verified ? 'Verified' : 'Verify'}
                            </button>
                            <button className="linkish tiny" style={{ color: 'var(--muted)' }} onClick={() => removeLink(cf)}>Remove</button>
                          </div>
                        ))}
                        {c.customer_flats.length === 0 && <span className="faint small">No flat linked</span>}
                      </div>
                    </td>
                    <td className="small nowrap">{fmtDate(c.created_at)}</td>
                    <td className="nowrap">
                      <button className="btn ghost sm" onClick={() => setModal({ type: 'link', customer: c })}>Link flat</button>
                      <Link className="btn ghost sm" to={`/admin/complaints?status=all&customer=${c.id}`}>Complaints</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pager page={page} pageSize={PAGE} count={data?.count} onPage={setPage} />
      </div>
      {modal?.type === 'add' && <AddCustomer onClose={() => setModal(null)} onDone={() => { setModal(null); load(); toast('Customer added'); }} />}
      {modal?.type === 'link' && <LinkFlat customer={modal.customer} onClose={() => setModal(null)} onDone={() => { setModal(null); load(); toast('Flat linked'); }} />}
    </div>
  );
}

function AddCustomer({ onClose, onDone }) {
  const [f, setF] = useState({ full_name: '', mobile: '', email: '', password: '', relation: 'owner', verified: true });
  const [flat, setFlat] = useState({ flatId: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  async function save() {
    setError(''); setBusy(true);
    try {
      await adminUsers({ action: 'create_user', role: 'customer', ...f, mobile: f.mobile.replace(/[^0-9]/g, '').slice(-10), flat_id: flat.flatId || null });
      onDone();
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }
  return (
    <Modal title="Add customer" onClose={onClose} wide
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy} onClick={save}>{busy ? 'Adding…' : 'Add customer'}</button></>}>
      <ErrorBox error={error} />
      <div className="grid-2">
        <Field label="Full name"><input className="input" value={f.full_name} onChange={set('full_name')} /></Field>
        <Field label="Mobile"><input className="input" type="tel" value={f.mobile} onChange={set('mobile')} /></Field>
        <Field label="Email (login ID)"><input className="input" type="email" value={f.email} onChange={set('email')} /></Field>
        <Field label="Temporary password" hint="Share with the customer; they can change it in Profile"><input className="input" value={f.password} onChange={set('password')} /></Field>
      </div>
      <FlatPicker onChange={setFlat} required={false} />
      <div className="grid-2">
        <Field label="Relation"><select className="input" value={f.relation} onChange={set('relation')}>{RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
        <label className="check" style={{ marginTop: 28 }}><input type="checkbox" checked={f.verified} onChange={set('verified')} />Mark flat as verified</label>
      </div>
    </Modal>
  );
}

function LinkFlat({ customer, onClose, onDone }) {
  const [flat, setFlat] = useState({ flatId: '' });
  const [relation, setRelation] = useState('owner');
  const [error, setError] = useState('');
  async function save() {
    if (!flat.flatId) return setError('Select a flat.');
    try { await linkFlat(customer.id, flat.flatId, relation, true); onDone(); } catch (e) { setError(errMsg(e)); }
  }
  return (
    <Modal title={`Link a flat to ${customer.full_name}`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Link flat</button></>}>
      <ErrorBox error={error} />
      <FlatPicker onChange={setFlat} />
      <Field label="Relation"><select className="input" value={relation} onChange={(e) => setRelation(e.target.value)}>{RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}</select></Field>
    </Modal>
  );
}
