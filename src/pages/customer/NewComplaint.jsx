import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useOutletContext } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { createComplaint, getCategories } from '../../lib/api';
import { KINDS, PRIORITIES } from '../../lib/constants';
import { errMsg } from '../../lib/utils';
import PhotoPicker from '../../components/PhotoPicker';
import Icon from '../../components/Icons';
import { ErrorBox, Field, FlatPlate, Loading, useToast } from '../../components/UI';

const flatInfo = (cf) => ({
  id: cf.flat.id,
  flat_no: cf.flat.flat_no,
  wing: cf.flat.wing.name,
  tower: cf.flat.wing.tower.name,
  project: cf.flat.wing.tower.project.name,
  verified: cf.verified,
});

export default function NewComplaint() {
  const { settings } = useAuth();
  const { myFlats } = useOutletContext();
  const toast = useToast();
  const nav = useNavigate();
  const [cats, setCats] = useState(null);
  const [flatId, setFlatId] = useState('');
  const [form, setForm] = useState({ kind: 'complaint', category: '', area: 'flat', location_detail: '', title: '', description: '', priority: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { getCategories().then(setCats).catch((e) => setError(errMsg(e))); }, []);
  const flats = useMemo(() => (myFlats || []).map(flatInfo), [myFlats]);
  useEffect(() => { if (!flatId && flats.length) setFlatId(flats[0].id); }, [flats, flatId]);

  const cat = cats?.find((c) => c.code === form.category);
  const area = cat && cat.scope !== 'both' ? cat.scope : form.area;
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const selectedFlat = flats.find((f) => f.id === flatId);
  const needsVerification = settings.require_flat_verification === true && selectedFlat && !selectedFlat.verified;

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!flatId) return setError('Select the flat this is about.');
    if (!form.category) return setError('Choose a category.');
    if (form.title.trim().length < 3) return setError('Add a short title (at least 3 characters).');
    if (form.description.trim().length < 5) return setError('Describe the issue in a few words.');
    setBusy(true);
    try {
      const row = await createComplaint({
        flat_id: flatId,
        kind: form.kind,
        category: form.category,
        area,
        location_detail: form.location_detail.trim() || null,
        title: form.title.trim(),
        description: form.description.trim(),
        priority: form.priority || null,
      }, files, (done, total) => setProgress(`Uploading photos ${done}/${total}…`));
      toast(`Complaint ${row.complaint_no} registered`);
      nav(`/complaints/${row.id}`, { replace: true });
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
      setProgress('');
    }
  }

  if (myFlats === null || cats === null) return <Loading />;
  if (!flats.length) {
    return (
      <div className="page narrow">
        <div className="empty panel">
          <h3>Link your flat first</h3>
          <p>We need to know which flat you live in before you can raise a complaint.</p>
          <Link className="btn" to="/flats">Add my flat</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page narrow">
      <Link to="/my" className="back"><Icon name="back" />My complaints</Link>
      <div className="page-head"><div><h1>Raise a complaint</h1><p>Tell us what's wrong. The right team is assigned automatically.</p></div></div>

      <form className="stack" onSubmit={submit}>
        <ErrorBox error={error} />
        {needsVerification && <div className="alert-box warn">This flat is awaiting verification by the office. You'll be able to submit once it's verified.</div>}

        <section className="panel panel-pad stack">
          {flats.length > 1 && (
            <Field group label="Which flat is this about?">
              <div className="choice-grid">
                {flats.map((f) => (
                  <button type="button" key={f.id} className={`choice ${flatId === f.id ? 'on' : ''}`} onClick={() => setFlatId(f.id)}>
                    <FlatPlate tower={f.tower} wing={f.wing} flat={f.flat_no} /><small style={{ marginTop: 6 }}>{f.project}</small>
                  </button>
                ))}
              </div>
            </Field>
          )}
          {flats.length === 1 && (
            <div className="row"><FlatPlate tower={flats[0].tower} wing={flats[0].wing} flat={flats[0].flat_no} lg /><span className="muted">{flats[0].project}</span></div>
          )}
          <Field group label="This is a">
            <div className="seg">
              {KINDS.map((k) => <button type="button" key={k.value} className={form.kind === k.value ? 'on' : ''} onClick={() => set('kind', k.value)}>{k.label}</button>)}
            </div>
          </Field>
        </section>

        <section className="panel panel-pad stack">
          <Field group label="Category">
            <div className="choice-grid">
              {cats.map((c) => (
                <button type="button" key={c.code} className={`choice ${form.category === c.code ? 'on' : ''}`} onClick={() => set('category', c.code)}>
                  {c.name}
                  <small>{c.scope === 'flat' ? 'Inside my flat' : c.scope === 'common' ? 'Common facility' : 'Flat or common area'}</small>
                </button>
              ))}
            </div>
          </Field>
          {cat?.scope === 'both' && (
            <Field group label="Where is the problem?">
              <div className="seg">
                <button type="button" className={form.area === 'flat' ? 'on' : ''} onClick={() => set('area', 'flat')}>Inside my flat</button>
                <button type="button" className={form.area === 'common' ? 'on' : ''} onClick={() => set('area', 'common')}>Common area</button>
              </div>
            </Field>
          )}
          {area === 'common' && (
            <Field label="Exact location" hint="e.g. Lift 2 in A wing, basement parking P1 slot 14, clubhouse gym">
              <input className="input" value={form.location_detail} maxLength={200} onChange={(e) => set('location_detail', e.target.value)} />
            </Field>
          )}
        </section>

        <section className="panel panel-pad stack">
          <Field label="Title">
            <input className="input" required maxLength={150} placeholder="e.g. Water leaking from bathroom ceiling" value={form.title} onChange={(e) => set('title', e.target.value)} />
          </Field>
          <Field label="Description" hint="When did it start? How bad is it? Best time to visit?">
            <textarea className="input" required maxLength={4000} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </Field>
          <Field group label="How urgent is it?">
            <div className="seg">
              <button type="button" className={!form.priority ? 'on' : ''} onClick={() => set('priority', '')}>Let the office decide</button>
              {PRIORITIES.map((p) => <button type="button" key={p.value} className={form.priority === p.value ? 'on' : ''} onClick={() => set('priority', p.value)}>{p.label}</button>)}
            </div>
          </Field>
          <Field group label="Photos (optional, up to 5)">
            <PhotoPicker files={files} onChange={setFiles} />
          </Field>
        </section>

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          {progress && <span className="muted small">{progress}</span>}
          <Link to="/my" className="btn secondary">Cancel</Link>
          <button className="btn" disabled={busy || needsVerification}>{busy ? 'Submitting…' : 'Submit complaint'}</button>
        </div>
      </form>
    </div>
  );
}
