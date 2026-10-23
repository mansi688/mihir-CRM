import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { getCategories, getEmployees, listComplaints } from '../../lib/api';
import { PRIORITIES, STATUSES, STATUS_LABEL, PRIORITY_LABEL, KIND_LABEL } from '../../lib/constants';
import { downloadCSV, errMsg, fmtDateTime, hoursBetween, isOverdue } from '../../lib/utils';
import ComplaintList from '../../components/ComplaintList';
import ProjectSwitch from '../../components/ProjectSwitch';
import Icon from '../../components/Icons';
import { Empty, ErrorBox, Loading, Pager, useToast } from '../../components/UI';

const PAGE = 30;
const STATUS_TABS = [
  { key: 'active', label: 'Active', status: ['open', 'assigned', 'in_progress'] },
  ...STATUSES.map((s) => ({ key: s.value, label: s.label, status: [s.value] })),
  { key: 'all', label: 'All', status: [] },
];

// mode="all" → manager complaint desk; mode="mine" → a technician's task list
export default function Complaints({ mode = 'all' }) {
  const { profile, isManager } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [cats, setCats] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState(params.get('q') || '');

  const f = {
    tab: params.get('status') || 'active',
    project: params.get('project') || '',
    category: params.get('category') || '',
    priority: params.get('priority') || '',
    assignee: params.get('assignee') || '',
    customer: params.get('customer') || '',
    overdue: params.get('overdue') === '1',
    unassigned: params.get('unassigned') === '1',
    q: params.get('q') || '',
    page: Number(params.get('page') || 0),
  };
  const setF = (patch) => {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([k, v]) => (v === '' || v === false || v == null ? next.delete(k) : next.set(k, v === true ? '1' : String(v))));
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => { getCategories(true).then(setCats).catch(() => {}); }, []);
  useEffect(() => { if (isManager && mode === 'all') getEmployees().then(setEmployees).catch(() => {}); }, [isManager, mode]);
  useEffect(() => { const t = setTimeout(() => search !== f.q && setF({ q: search }), 350); return () => clearTimeout(t); }, [search]); // eslint-disable-line

  const query = useMemo(() => ({
    status: f.tab === 'overdue' ? [] : (STATUS_TABS.find((t) => t.key === f.tab)?.status || []),
    projectId: f.project, category: f.category, priority: f.priority,
    assignedTo: mode === 'mine' ? profile.id : f.assignee || undefined,
    customerId: f.customer || undefined,
    overdue: f.overdue, unassigned: f.unassigned, search: f.q,
    sort: f.tab === 'active' || mode === 'mine' ? 'due_at' : 'created_at',
  }), [params.toString(), mode, profile.id]); // eslint-disable-line

  useEffect(() => {
    setData(null);
    listComplaints({ ...query, page: f.page, pageSize: PAGE }).then(setData).catch((e) => setError(errMsg(e)));
  }, [query, f.page]); // eslint-disable-line

  const catMap = Object.fromEntries(cats.map((c) => [c.code, c.name]));

  async function exportCSV() {
    setExporting(true);
    try {
      const all = await listComplaints({ ...query, page: 0, pageSize: 5000, columns: '*' });
      downloadCSV(`complaints-${new Date().toISOString().slice(0, 10)}.csv`, all.data, [
        { label: 'Complaint ID', value: 'complaint_no' },
        { label: 'Type', value: (r) => KIND_LABEL[r.kind] },
        { label: 'Date & time', value: (r) => fmtDateTime(r.created_at) },
        { label: 'Customer', value: 'customer_name' },
        { label: 'Mobile', value: 'customer_mobile' },
        { label: 'Project', value: 'project_name' },
        { label: 'Tower', value: 'tower_name' },
        { label: 'Wing', value: 'wing_name' },
        { label: 'Flat', value: 'flat_no' },
        { label: 'Area', value: 'area' },
        { label: 'Category', value: (r) => catMap[r.category] || r.category },
        { label: 'Title', value: 'title' },
        { label: 'Description', value: 'description' },
        { label: 'Priority', value: (r) => PRIORITY_LABEL[r.priority] },
        { label: 'Status', value: (r) => STATUS_LABEL[r.status] },
        { label: 'Assigned to', value: 'assignee_name' },
        { label: 'Deadline', value: (r) => fmtDateTime(r.due_at) },
        { label: 'Overdue', value: (r) => (isOverdue(r) ? 'Yes' : '') },
        { label: 'Resolved at', value: (r) => fmtDateTime(r.resolved_at) },
        { label: 'Hours to resolve', value: (r) => hoursBetween(r.created_at, r.resolved_at) ?? '' },
        { label: 'Resolution', value: 'resolution_notes' },
        { label: 'Rating', value: 'customer_rating' },
        { label: 'Reopened', value: 'reopen_count' },
      ]);
    } catch (e) { toast(errMsg(e), 'error'); }
    setExporting(false);
  }

  const anyFilter = f.project || f.category || f.priority || f.assignee || f.overdue || f.unassigned || f.q || f.customer;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>{mode === 'mine' ? 'My tasks' : 'Complaints'}</h1>
          <p>{mode === 'mine' ? 'Complaints assigned to you, most urgent deadline first.' : 'Every complaint is a task — filter, assign and track to closure.'}</p>
        </div>
        <div className="row">
          <button className="btn secondary" onClick={exportCSV} disabled={exporting}><Icon name="download" />{exporting ? 'Exporting…' : 'Export CSV'}</button>
          {isManager && mode === 'all' && <Link to="/admin/complaints/new" className="btn">Log a complaint</Link>}
        </div>
      </div>

      {mode === 'all' && <ProjectSwitch value={f.project} onChange={(v) => setF({ project: v })} />}

      <div className="panel">
        <div className="filters">
          <div className="chips">
            {STATUS_TABS.map((t) => (
              <button key={t.key} className={`chip ${f.tab === t.key ? 'on' : ''}`} onClick={() => setF({ status: t.key === 'active' ? '' : t.key })}>{t.label}</button>
            ))}
          </div>
        </div>
        <div className="filters">
          <input className="input search sm" placeholder="Search ID, title, customer, mobile, flat…" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input sm" value={f.category} onChange={(e) => setF({ category: e.target.value })}>
            <option value="">All categories</option>
            {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </select>
          <select className="input sm" value={f.priority} onChange={(e) => setF({ priority: e.target.value })}>
            <option value="">Any priority</option>
            {PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          {mode === 'all' && isManager && (
            <select className="input sm" value={f.assignee} onChange={(e) => setF({ assignee: e.target.value })}>
              <option value="">Anyone</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.full_name}</option>)}
            </select>
          )}
          <label className="check"><input type="checkbox" checked={f.overdue} onChange={(e) => setF({ overdue: e.target.checked })} />Overdue</label>
          {mode === 'all' && <label className="check"><input type="checkbox" checked={f.unassigned} onChange={(e) => setF({ unassigned: e.target.checked })} />Unassigned</label>}
          {anyFilter && <button className="linkish small" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear filters</button>}
        </div>
        <ErrorBox error={error} />
        {!data ? <Loading /> : data.data.length === 0 ? (
          <Empty title={mode === 'mine' ? 'No tasks here' : 'No complaints match'}>{mode === 'mine' ? 'New assignments will show up here and in your notifications.' : 'Try a different filter.'}</Empty>
        ) : (
          <>
            <ComplaintList rows={data.data} categories={catMap} />
            <Pager page={f.page} pageSize={PAGE} count={data.count} onPage={(p) => setF({ page: p })} />
          </>
        )}
      </div>
    </div>
  );
}
