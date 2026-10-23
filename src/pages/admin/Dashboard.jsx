import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { getCategories, getReport, listComplaints } from '../../lib/api';
import { dueText, errMsg, isOverdue } from '../../lib/utils';
import ProjectSwitch from '../../components/ProjectSwitch';
import { ErrorBox, FlatPlate, Loading, PriorityBadge, StatusBadge } from '../../components/UI';

export default function Dashboard() {
  const { profile } = useAuth();
  const nav = useNavigate();
  const [project, setProject] = useState('');
  const [active, setActive] = useState(null);
  const [report, setReport] = useState(null);
  const [cats, setCats] = useState({});
  const [error, setError] = useState('');

  useEffect(() => { getCategories(true).then((c) => setCats(Object.fromEntries(c.map((x) => [x.code, x.name])))); }, []);
  useEffect(() => {
    setActive(null); setReport(null);
    const from = new Date(Date.now() - 30 * 864e5).toISOString();
    const to = new Date(Date.now() + 864e5).toISOString();
    Promise.all([
      listComplaints({ status: ['open', 'assigned', 'in_progress'], projectId: project, pageSize: 1000, sort: 'due_at' }),
      getReport(from, to, project),
    ]).then(([a, r]) => { setActive(a.data); setReport(r); }).catch((e) => setError(errMsg(e)));
  }, [project]);

  const s = useMemo(() => {
    if (!active) return null;
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const load = {};
    active.forEach((c) => { const k = c.assignee_name || 'Unassigned'; load[k] = load[k] || { n: 0, late: 0 }; load[k].n++; if (isOverdue(c)) load[k].late++; });
    return {
      open: active.filter((c) => c.status === 'open').length,
      unassigned: active.filter((c) => !c.assigned_to).length,
      progress: active.filter((c) => c.status === 'in_progress').length,
      overdue: active.filter(isOverdue),
      dueToday: active.filter((c) => !isOverdue(c) && new Date(c.due_at) <= endOfDay).length,
      urgent: active.filter((c) => c.priority === 'urgent').length,
      load: Object.entries(load).sort((a, b) => b[1].n - a[1].n),
    };
  }, [active]);

  const go = (q) => nav(`/admin/complaints?${new URLSearchParams({ ...q, ...(project ? { project } : {}) })}`);
  const maxCat = Math.max(1, ...(report?.by_category || []).map((x) => x.total));
  const maxLoad = Math.max(1, ...(s?.load || []).map(([, v]) => v.n));

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {profile.full_name.split(' ')[0]}</h1><p>Live complaint desk across your projects.</p></div>
        <Link to="/admin/complaints/new" className="btn">Log a complaint</Link>
      </div>
      <ProjectSwitch value={project} onChange={setProject} />
      <ErrorBox error={error} />
      {!s ? <Loading /> : (
        <>
          <div className="stats">
            <button className={`stat ${s.overdue.length ? 'alert' : ''}`} onClick={() => go({ overdue: '1' })}><div className="v">{s.overdue.length}</div><div className="l">Overdue</div></button>
            <button className="stat" onClick={() => go({ unassigned: '1' })}><div className="v">{s.unassigned}</div><div className="l">Unassigned</div></button>
            <button className="stat" onClick={() => go({ status: 'in_progress' })}><div className="v">{s.progress}</div><div className="l">In progress</div></button>
            <div className="stat"><div className="v">{s.dueToday}</div><div className="l">Due today</div></div>
            <div className="stat"><div className="v">{active.length}</div><div className="l">Open tasks</div></div>
            <div className="stat"><div className="v">{report?.within_sla_pct ?? '—'}{report?.within_sla_pct != null ? '%' : ''}</div><div className="l">Resolved within deadline (30 days)</div></div>
          </div>

          <div className="grid-2" style={{ alignItems: 'start' }}>
            <section className="panel">
              <div className="panel-head"><h3>Overdue — act now</h3><button className="linkish small" onClick={() => go({ overdue: '1' })}>View all</button></div>
              {s.overdue.length === 0 ? <p className="panel-pad muted">Nothing overdue. Nice work.</p> : (
                <div className="list">
                  {s.overdue.slice(0, 8).map((c) => (
                    <Link key={c.id} to={`/complaints/${c.id}`} className="list-item is-overdue">
                      <div className="top"><span className="tiny mono-id muted">{c.complaint_no}</span><span className="tiny" style={{ color: 'var(--danger)', fontWeight: 600 }}>{dueText(c)}</span></div>
                      <div className="title">{c.title}</div>
                      <div className="meta"><FlatPlate c={c} /><StatusBadge status={c.status} /><PriorityBadge priority={c.priority} /><span>{c.assignee_name || 'Unassigned'}</span></div>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <div className="stack">
              <section className="panel">
                <div className="panel-head"><h3>Workload by person</h3><span className="legend"><span><i style={{ background: 'var(--graphite)' }} />Active</span><span><i style={{ background: 'var(--danger)' }} />Overdue</span></span></div>
                <div className="panel-pad bars">
                  {s.load.length === 0 && <p className="muted">No active tasks.</p>}
                  {s.load.slice(0, 10).map(([name, v]) => (
                    <div key={name} className="bar-row">
                      <span className="name">{name}</span>
                      <span className="bar"><i style={{ width: `${((v.n - v.late) / maxLoad) * 100}%` }} /><i style={{ width: `${(v.late / maxLoad) * 100}%`, background: 'var(--danger)' }} /></span>
                      <span className="n">{v.n}</span>
                    </div>
                  ))}
                </div>
              </section>
              <section className="panel">
                <div className="panel-head"><h3>Complaints by category (30 days)</h3><span className="legend"><span><i style={{ background: 'var(--graphite)' }} />Resolved</span><span><i style={{ background: 'var(--amber)' }} />Pending</span></span></div>
                <div className="panel-pad bars">
                  {(report?.by_category || []).length === 0 && <p className="muted">No complaints in the last 30 days.</p>}
                  {(report?.by_category || []).map((x) => (
                    <div key={x.code} className="bar-row">
                      <span className="name">{cats[x.code] || x.name}</span>
                      <span className="bar"><i style={{ width: `${(x.resolved / maxCat) * 100}%` }} /><i className="b2" style={{ width: `${((x.total - x.resolved) / maxCat) * 100}%` }} /></span>
                      <span className="n">{x.total}</span>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
