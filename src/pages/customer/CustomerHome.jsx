import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { getCategories, listComplaints } from '../../lib/api';
import { errMsg } from '../../lib/utils';
import ComplaintList from '../../components/ComplaintList';
import { Photo } from '../../components/Media';
import Icon from '../../components/Icons';
import { Empty, ErrorBox, Loading, Pager } from '../../components/UI';

const TABS = [
  { key: 'active',   label: 'In progress', status: ['open', 'assigned', 'in_progress'] },
  { key: 'resolved', label: 'Awaiting your confirmation', status: ['resolved'] },
  { key: 'closed',   label: 'Closed', status: ['closed'] },
  { key: 'all',      label: 'All', status: [] },
];

export default function CustomerHome() {
  const { profile } = useAuth();
  const { activeProject, myFlats } = useOutletContext();
  const [tab, setTab] = useState('active');
  const [page, setPage] = useState(0);
  const [data, setData] = useState(null);
  const [counts, setCounts] = useState({});
  const [cats, setCats] = useState({});
  const [error, setError] = useState('');

  useEffect(() => { getCategories(true).then((c) => setCats(Object.fromEntries(c.map((x) => [x.code, x.name])))); }, []);
  useEffect(() => {
    Promise.all(TABS.slice(0, 3).map((t) => listComplaints({ customerId: profile.id, status: t.status, pageSize: 1, columns: 'id' })))
      .then((r) => setCounts(Object.fromEntries(TABS.slice(0, 3).map((t, i) => [t.key, r[i].count]))))
      .catch(() => {});
  }, [profile.id]);
  useEffect(() => {
    setData(null);
    const t = TABS.find((x) => x.key === tab);
    listComplaints({ customerId: profile.id, status: t.status, page, pageSize: 20 })
      .then(setData).catch((e) => setError(errMsg(e)));
  }, [tab, page, profile.id]);

  const first = profile.full_name.split(' ')[0];
  const noFlat = myFlats && myFlats.length === 0;
  const total = useMemo(() => Object.values(counts).reduce((a, b) => a + (b || 0), 0), [counts]);

  return (
    <div className="page">
      <div className="proj-banner">
        {activeProject?.hero_image_url && <Photo src={activeProject.hero_image_url} alt="" className="banner-photo" eager />}
        <div className="txt">
          <h1>Hi {first}</h1>
          <p>{activeProject ? `${activeProject.name} · ${activeProject.location_label || ''}` : 'Your service requests in one place.'}</p>
          {!noFlat && <Link to="/new" className="btn"><Icon name="plus" />Raise a complaint</Link>}
        </div>
      </div>

      {noFlat && (
        <div className="alert-box warn" style={{ marginBottom: 18 }}>
          Your account isn't linked to a flat yet. <Link to="/flats">Add your flat</Link> to start raising complaints.
        </div>
      )}
      {counts.resolved > 0 && (
        <div className="alert-box ok" style={{ marginBottom: 18 }}>
          {counts.resolved} complaint{counts.resolved > 1 ? 's are' : ' is'} marked resolved. Please confirm the fix or reopen if the issue is still there.{' '}
          <button type="button" className="linkish" onClick={() => { setTab('resolved'); setPage(0); }}>Review now</button>
        </div>
      )}

      <div className="panel">
        <div className="filters">
          <div className="chips">
            {TABS.map((t) => (
              <button key={t.key} className={`chip ${tab === t.key ? 'on' : ''}`} onClick={() => { setTab(t.key); setPage(0); }}>
                {t.label}<span className="n">{t.key === 'all' ? total : counts[t.key] ?? ''}</span>
              </button>
            ))}
          </div>
        </div>
        <ErrorBox error={error} />
        {!data ? <Loading /> : data.data.length === 0 ? (
          <Empty title={tab === 'active' ? 'Nothing pending' : 'No complaints here'}
            action={!noFlat && <Link to="/new" className="btn">Raise a complaint</Link>}>
            {tab === 'active' ? 'When you raise a complaint, you can follow its progress here.' : ''}
          </Empty>
        ) : (
          <>
            <ComplaintList rows={data.data} mode="customer" categories={cats} />
            <Pager page={page} pageSize={20} count={data.count} onPage={setPage} />
          </>
        )}
      </div>
    </div>
  );
}
