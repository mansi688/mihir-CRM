import { useEffect, useState } from 'react';
import { getReport } from '../../lib/api';
import { STATUSES, PRIORITIES } from '../../lib/constants';
import { downloadCSV, errMsg } from '../../lib/utils';
import ProjectSwitch from '../../components/ProjectSwitch';
import Icon from '../../components/Icons';
import { ErrorBox, Field, Loading } from '../../components/UI';

const iso = (d) => d.toISOString().slice(0, 10);
const RANGES = [
  { k: '7', label: 'Last 7 days' }, { k: '30', label: 'Last 30 days' }, { k: '90', label: 'Last 90 days' },
  { k: 'month', label: 'This month' }, { k: 'year', label: 'This year' }, { k: 'custom', label: 'Custom' },
];

export default function Reports() {
  const [range, setRange] = useState('30');
  const [from, setFrom] = useState(iso(new Date(Date.now() - 29 * 864e5)));
  const [to, setTo] = useState(iso(new Date()));
  const [project, setProject] = useState('');
  const [r, setR] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const now = new Date();
    if (range === 'custom') return;
    if (range === 'month') setFrom(iso(new Date(now.getFullYear(), now.getMonth(), 1)));
    else if (range === 'year') setFrom(iso(new Date(now.getFullYear(), 0, 1)));
    else setFrom(iso(new Date(Date.now() - (Number(range) - 1) * 864e5)));
    setTo(iso(now));
  }, [range]);

  useEffect(() => {
    setR(null); setError('');
    const end = new Date(to); end.setDate(end.getDate() + 1);
    getReport(new Date(from).toISOString(), end.toISOString(), project).then(setR).catch((e) => setError(errMsg(e)));
  }, [from, to, project]);

  // one bar per day in the range, including days with no complaints
  const days = [];
  if (r) {
    const byDay = Object.fromEntries((r.daily || []).map((d) => [d.day, d]));
    for (let d = new Date(from); d <= new Date(to) && days.length < 400; d.setDate(d.getDate() + 1)) {
      const k = iso(d);
      days.push(byDay[k] || { day: k, total: 0, resolved: 0 });
    }
  }
  const maxDaily = Math.max(1, ...days.map((d) => d.total));
  const pct = (n) => (r?.total ? Math.round((n / r.total) * 100) : 0);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Reports</h1><p>How quickly complaints are handled, where they come from, and who resolves them.</p></div>
        {r && (
          <button className="btn secondary" onClick={() => downloadCSV(`team-performance-${from}-to-${to}.csv`, r.by_assignee, [
            { label: 'Employee', value: 'name' }, { label: 'Complaints', value: 'total' }, { label: 'Resolved', value: 'resolved' },
            { label: 'Overdue now', value: 'overdue' }, { label: 'Avg hours to resolve', value: 'avg_hours' }, { label: 'Avg rating', value: 'rating' },
          ])}><Icon name="download" />Team performance CSV</button>
        )}
      </div>
      <ProjectSwitch value={project} onChange={setProject} />
      <div className="panel filters" style={{ marginBottom: 18, borderBottom: '1px solid var(--line)' }}>
        <div className="chips">{RANGES.map((x) => <button key={x.k} className={`chip ${range === x.k ? 'on' : ''}`} onClick={() => setRange(x.k)}>{x.label}</button>)}</div>
        {range === 'custom' && (
          <div className="row">
            <Field><input className="input sm" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
            <span className="muted">to</span>
            <Field><input className="input sm" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
          </div>
        )}
      </div>
      <ErrorBox error={error} />
      {!r ? <Loading /> : (
        <div className="stack">
          <div className="stats">
            <div className="stat"><div className="v">{r.total}</div><div className="l">Complaints raised</div></div>
            <div className="stat"><div className="v">{r.open_now}</div><div className="l">Still open</div></div>
            <div className={`stat ${r.overdue ? 'alert' : ''}`}><div className="v">{r.overdue}</div><div className="l">Overdue now</div></div>
            <div className="stat"><div className="v">{r.avg_resolution_hours ?? '—'}</div><div className="l">Avg hours to resolve</div></div>
            <div className="stat"><div className="v">{r.within_sla_pct != null ? `${r.within_sla_pct}%` : '—'}</div><div className="l">Resolved within deadline</div></div>
            <div className="stat"><div className="v">{r.avg_rating ?? '—'}</div><div className="l">Avg customer rating /5</div></div>
          </div>

          <section className="panel">
            <div className="panel-head"><h3>Complaints per day</h3><span className="small muted">{from} to {to}</span></div>
            <div className="panel-pad">
              {!r.total ? <p className="muted">No complaints in this period.</p> : (
                <div className="trend" role="img" aria-label="Complaints per day">
                  {days.map((d) => <div key={d.day} className="col" title={`${d.day}: ${d.total} raised, ${d.resolved} resolved`}><i style={{ height: `${(d.total / maxDaily) * 100}%` }} /></div>)}
                </div>
              )}
            </div>
          </section>

          <div className="grid-2" style={{ alignItems: 'start' }}>
            <section className="panel">
              <div className="panel-head"><h3>By status</h3></div>
              <div className="panel-pad bars">
                {STATUSES.map((s) => (
                  <div key={s.value} className="bar-row"><span className="name"><span className={`badge st-${s.value}`}>{s.label}</span></span>
                    <span className="bar"><i style={{ width: `${pct(r.by_status[s.value] || 0)}%` }} /></span><span className="n">{r.by_status[s.value] || 0}</span></div>
                ))}
              </div>
            </section>
            <section className="panel">
              <div className="panel-head"><h3>By priority</h3></div>
              <div className="panel-pad bars">
                {PRIORITIES.map((p) => (
                  <div key={p.value} className="bar-row"><span className="name"><span className={`badge pr pr-${p.value}`}>{p.label}</span></span>
                    <span className="bar"><i style={{ width: `${pct(r.by_priority[p.value] || 0)}%` }} /></span><span className="n">{r.by_priority[p.value] || 0}</span></div>
                ))}
              </div>
            </section>
          </div>

          <div className="grid-2" style={{ alignItems: 'start' }}>
            <Breakdown title="By category" rows={r.by_category} />
            <Breakdown title="By project" rows={r.by_project} />
          </div>

          <section className="panel">
            <div className="panel-head"><h3>Team performance</h3></div>
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Employee</th><th>Complaints</th><th>Resolved</th><th>Overdue now</th><th>Avg hours</th><th>Rating</th></tr></thead>
                <tbody>
                  {r.by_assignee.map((a) => (
                    <tr key={a.assigned_to || 'none'}>
                      <td className="strong">{a.name}</td><td>{a.total}</td><td>{a.resolved}</td>
                      <td style={{ color: a.overdue ? 'var(--danger)' : undefined }}>{a.overdue}</td>
                      <td>{a.avg_hours ?? '—'}</td><td>{a.rating ?? '—'}</td>
                    </tr>
                  ))}
                  {!r.by_assignee.length && <tr><td colSpan={6} className="muted">No data.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function Breakdown({ title, rows }) {
  const max = Math.max(1, ...rows.map((x) => x.total));
  return (
    <section className="panel">
      <div className="panel-head"><h3>{title}</h3><span className="legend"><span><i style={{ background: 'var(--graphite)' }} />Resolved</span><span><i style={{ background: 'var(--amber)' }} />Pending</span></span></div>
      <div className="panel-pad bars">
        {!rows.length && <p className="muted">No data.</p>}
        {rows.map((x) => (
          <div key={x.code || x.project_id || x.name} className="bar-row">
            <span className="name" title={x.name}>{x.name}</span>
            <span className="bar"><i style={{ width: `${(x.resolved / max) * 100}%` }} /><i className="b2" style={{ width: `${((x.total - x.resolved) / max) * 100}%` }} /></span>
            <span className="n">{x.total}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
