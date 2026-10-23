import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { deleteRow, getFlats, getProjects, getTowers, getWings, insertFlats, saveRow } from '../../lib/api';
import { supabase } from '../../lib/supabase';
import { THEME_PRESETS, projectColors } from '../../lib/theme';
import { errMsg, uid } from '../../lib/utils';
import { Photo } from '../../components/Media';
import Icon from '../../components/Icons';
import { ErrorBox, Field, Loading, Modal, useToast } from '../../components/UI';

export default function Properties() {
  const toast = useToast();
  const [projects, setProjects] = useState(null);
  const [towers, setTowers] = useState([]);
  const [wings, setWings] = useState([]);
  const [flats, setFlats] = useState([]);
  const [sel, setSel] = useState({ project: null, tower: null, wing: null });
  const [modal, setModal] = useState(null);

  const loadProjects = () => getProjects(true).then((p) => { setProjects(p); if (!sel.project && p[0]) setSel({ project: p[0].id, tower: null, wing: null }); });
  const loadTowers = () => sel.project ? getTowers(sel.project).then(setTowers) : setTowers([]);
  const loadWings = () => sel.tower ? getWings(sel.tower).then(setWings) : setWings([]);
  const loadFlats = () => sel.wing ? getFlats(sel.wing).then(setFlats) : setFlats([]);
  useEffect(() => { loadProjects(); }, []); // eslint-disable-line
  useEffect(() => { loadTowers(); }, [sel.project]); // eslint-disable-line
  useEffect(() => { loadWings(); }, [sel.tower]); // eslint-disable-line
  useEffect(() => { loadFlats(); }, [sel.wing]); // eslint-disable-line

  async function remove(table, row, label, after) {
    if (!window.confirm(`Delete ${label}? Everything under it is deleted too. This is blocked if complaints exist.`)) return;
    try { await deleteRow(table, row.id); toast('Deleted'); after(); } catch (e) { toast(errMsg(e), 'error'); }
  }
  async function quickAdd(table, parentKey, parentId, label, after) {
    const name = window.prompt(`New ${label} name`);
    if (!name?.trim()) return;
    try { await saveRow(table, { [parentKey]: parentId, name: name.trim() }); after(); } catch (e) { toast(errMsg(e), 'error'); }
  }
  async function rename(table, row, after) {
    const name = window.prompt('Rename to', row.name);
    if (!name?.trim() || name === row.name) return;
    try { await saveRow(table, { id: row.id, [table === 'towers' ? 'project_id' : 'tower_id']: row.project_id || row.tower_id, name: name.trim() }); after(); } catch (e) { toast(errMsg(e), 'error'); }
  }

  if (!projects) return <Loading />;
  const project = projects.find((p) => p.id === sel.project);
  const wing = wings.find((w) => w.id === sel.wing);
  const floors = [...new Set(flats.map((f) => f.floor ?? 0))].sort((a, b) => b - a);

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Projects & flats</h1><p>Set up each project's towers, wings and flats, and its look on the website and resident portal.</p></div>
        <button className="btn" onClick={() => setModal({ type: 'project', project: {} })}>Add project</button>
      </div>

      <div className="grid-3" style={{ marginBottom: 20 }}>
        {projects.map((p) => (
          <button key={p.id} className="panel" onClick={() => setSel({ project: p.id, tower: null, wing: null })}
            style={{ textAlign: 'left', padding: 0, overflow: 'hidden', cursor: 'pointer', font: 'inherit', outline: sel.project === p.id ? `3px solid ${projectColors(p).primary}` : 'none' }}>
            <div style={{ height: 140, background: projectColors(p).dark }}><Photo src={p.hero_image_url} alt="" label={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: 0 }} /></div>
            <div style={{ padding: '12px 14px' }} className="spread">
              <div><div className="strong">{p.name}</div><div className="tiny muted">{p.location_label || p.city} · {p.status_label || ''}{p.is_active ? '' : ' · Hidden'}</div></div>
              <span className="badge plain" style={{ background: projectColors(p).primary, color: '#fff' }}>{p.code}</span>
            </div>
          </button>
        ))}
      </div>

      {project && (
        <div className="panel">
          <div className="panel-head">
            <h3>{project.name}</h3>
            <div className="row">
              {project.slug && <Link className="btn ghost sm" to={`/register?project=${project.slug}`} target="_blank">Open registration page</Link>}
              <button className="btn secondary sm" onClick={() => setModal({ type: 'project', project })}><Icon name="edit" />Details & branding</button>
            </div>
          </div>
          <div className="tree">
            <div>
              <div className="col-head">Towers <button className="btn ghost sm" onClick={() => quickAdd('towers', 'project_id', project.id, 'tower', loadTowers)}>+ Add</button></div>
              {towers.map((t) => (
                <div key={t.id} className={`item ${sel.tower === t.id ? 'on' : ''}`} role="button" tabIndex={0} onClick={() => setSel({ ...sel, tower: t.id, wing: null })}>
                  <span className="grow">{t.name}</span>
                  <button className="icon-btn" title="Rename" onClick={(e) => { e.stopPropagation(); rename('towers', t, loadTowers); }}><Icon name="edit" size={16} /></button>
                  <button className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); remove('towers', t, t.name, loadTowers); }}><Icon name="trash" size={16} /></button>
                </div>
              ))}
              {!towers.length && <p className="small muted" style={{ padding: 14 }}>No towers yet.</p>}
            </div>
            <div>
              <div className="col-head">Wings {sel.tower && <button className="btn ghost sm" onClick={() => quickAdd('wings', 'tower_id', sel.tower, 'wing', loadWings)}>+ Add</button>}</div>
              {wings.map((w) => (
                <div key={w.id} className={`item ${sel.wing === w.id ? 'on' : ''}`} role="button" tabIndex={0} onClick={() => setSel({ ...sel, wing: w.id })}>
                  <span className="grow">Wing {w.name}</span>
                  <button className="icon-btn" title="Rename" onClick={(e) => { e.stopPropagation(); rename('wings', w, loadWings); }}><Icon name="edit" size={16} /></button>
                  <button className="icon-btn" title="Delete" onClick={(e) => { e.stopPropagation(); remove('wings', w, `wing ${w.name}`, loadWings); }}><Icon name="trash" size={16} /></button>
                </div>
              ))}
              {sel.tower && !wings.length && <p className="small muted" style={{ padding: 14 }}>No wings yet.</p>}
              {!sel.tower && <p className="small muted" style={{ padding: 14 }}>Select a tower.</p>}
            </div>
            <div>
              <div className="col-head">
                {wing ? `Flats in wing ${wing.name} (${flats.length})` : 'Flats'}
                {wing && (
                  <span className="row" style={{ gap: 6 }}>
                    <button className="btn ghost sm" onClick={() => setModal({ type: 'flat', flat: { wing_id: wing.id } })}>+ One flat</button>
                    <button className="btn secondary sm" onClick={() => setModal({ type: 'generate' })}>Generate flats</button>
                  </span>
                )}
              </div>
              {wing ? (
                <div className="flat-grid">
                  {floors.map((fl) => (
                    <FragmentFloor key={fl} floor={fl} flats={flats.filter((f) => (f.floor ?? 0) === fl)} onPick={(f) => setModal({ type: 'flat', flat: f })} />
                  ))}
                  {!flats.length && <p className="small muted">No flats yet. Use “Generate flats” to create a whole wing at once.</p>}
                </div>
              ) : <p className="small muted" style={{ padding: 14 }}>Select a wing.</p>}
            </div>
          </div>
        </div>
      )}

      {modal?.type === 'project' && <ProjectEditor project={modal.project} onClose={() => setModal(null)} onSaved={(p) => { setModal(null); toast('Project saved'); loadProjects(); if (p?.id) setSel({ project: p.id, tower: null, wing: null }); }} />}
      {modal?.type === 'generate' && <GenerateFlats wing={wing} onClose={() => setModal(null)} onDone={(n) => { setModal(null); toast(`${n} flats created`); loadFlats(); }} />}
      {modal?.type === 'flat' && <FlatEditor flat={modal.flat} onClose={() => setModal(null)} onDone={() => { setModal(null); loadFlats(); }} />}
    </div>
  );
}

function FragmentFloor({ floor, flats, onPick }) {
  return (
    <>
      <div className="floor-label">{floor === 0 ? 'Ground floor' : `Floor ${floor}`}</div>
      {flats.map((f) => (
        <button key={f.id} className="flat-cell" onClick={() => onPick(f)}>{f.flat_no}<small>{f.flat_type || ''}</small></button>
      ))}
    </>
  );
}

function FlatEditor({ flat, onClose, onDone }) {
  const [f, setF] = useState({ flat_no: '', floor: '', flat_type: '', carpet_area: '', ...flat });
  const [error, setError] = useState('');
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  async function save() {
    try {
      await saveRow('flats', { ...f, floor: f.floor === '' ? null : Number(f.floor), carpet_area: f.carpet_area === '' ? null : Number(f.carpet_area) });
      onDone();
    } catch (e) { setError(errMsg(e)); }
  }
  async function del() {
    if (!window.confirm(`Delete flat ${f.flat_no}?`)) return;
    try { await deleteRow('flats', f.id); onDone(); } catch (e) { setError(errMsg(e)); }
  }
  return (
    <Modal title={flat.id ? `Flat ${flat.flat_no}` : 'Add flat'} onClose={onClose}
      footer={<>{flat.id && <button className="btn danger secondary" style={{ marginRight: 'auto' }} onClick={del}>Delete</button>}<button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" onClick={save}>Save</button></>}>
      <ErrorBox error={error} />
      <div className="grid-2">
        <Field label="Flat / unit no."><input className="input" value={f.flat_no} onChange={set('flat_no')} /></Field>
        <Field label="Floor"><input className="input" type="number" value={f.floor ?? ''} onChange={set('floor')} /></Field>
        <Field label="Type"><input className="input" placeholder="2 BHK / Office / Shop" value={f.flat_type || ''} onChange={set('flat_type')} /></Field>
        <Field label="Carpet area (sq ft)"><input className="input" type="number" value={f.carpet_area ?? ''} onChange={set('carpet_area')} /></Field>
      </div>
    </Modal>
  );
}

function GenerateFlats({ wing, onClose, onDone }) {
  const [g, setG] = useState({ from: 1, to: 12, per: 4, types: '2 BHK, 3 BHK', prefix: '' });
  const [error, setError] = useState('');
  const set = (k) => (e) => setG({ ...g, [k]: e.target.value });
  const types = g.types.split(',').map((x) => x.trim()).filter(Boolean);
  const preview = [];
  for (let fl = Number(g.from); fl <= Number(g.to) && preview.length < 2000; fl++) {
    for (let n = 1; n <= Number(g.per); n++) preview.push({ wing_id: wing.id, floor: fl, flat_no: `${g.prefix}${fl * 100 + n}`, flat_type: types.length ? types[(n - 1) % types.length] : null });
  }
  async function run() {
    try { await insertFlats(preview); onDone(preview.length); } catch (e) { setError(errMsg(e)); }
  }
  return (
    <Modal title={`Generate flats for wing ${wing.name}`} onClose={onClose}
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={!preview.length} onClick={run}>Create {preview.length} flats</button></>}>
      <ErrorBox error={error} />
      <div className="grid-3">
        <Field label="From floor"><input className="input" type="number" value={g.from} onChange={set('from')} /></Field>
        <Field label="To floor"><input className="input" type="number" value={g.to} onChange={set('to')} /></Field>
        <Field label="Flats per floor"><input className="input" type="number" value={g.per} onChange={set('per')} /></Field>
      </div>
      <div className="grid-2">
        <Field label="Types, repeating" hint="Comma separated, in order of flat position"><input className="input" value={g.types} onChange={set('types')} /></Field>
        <Field label="Number prefix" hint="Optional, e.g. A-"><input className="input" value={g.prefix} onChange={set('prefix')} /></Field>
      </div>
      <p className="small muted">Numbers will be like {preview.slice(0, 4).map((p) => p.flat_no).join(', ')}{preview.length > 4 ? ' …' : ''}. Existing numbers are rejected, so add only new floors.</p>
    </Modal>
  );
}

// ---------- project details + branding ----------
const blank = {
  name: '', code: '', slug: '', city: 'Pune', address: '', location_label: '', project_type: 'residential', status_label: 'Ongoing',
  tagline: '', description: '', configurations: '', highlights: [], possession: '', rera_no: '', theme: 'residence',
  color_primary: THEME_PRESETS.residence.primary, color_accent: THEME_PRESETS.residence.accent, color_dark: THEME_PRESETS.residence.dark,
  hero_image_url: '', logo_url: '', video_url: '', gallery: [], image_credit: '', brochure_url: '', contact_phone: '', contact_email: '',
  lat: '', lng: '', show_on_landing: true, landing_order: 0, is_active: true,
};

function ProjectEditor({ project, onClose, onSaved }) {
  const [p, setP] = useState({
    ...blank, ...project, highlights: project.highlights || [],
    gallery: (Array.isArray(project.gallery) ? project.gallery : []).map((g) => (typeof g === 'string' ? { src: g, alt: '' } : g)),
  });
  const [tab, setTab] = useState('details');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState('');
  const set = (k) => (e) => setP({ ...p, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  function pickTheme(key) {
    const t = THEME_PRESETS[key];
    setP({ ...p, theme: key, color_primary: t.primary, color_accent: t.accent, color_dark: t.dark });
  }
  async function upload(file, field) {
    setUploading(field);
    try {
      const ext = file.name.split('.').pop().toLowerCase();
      const path = `${p.code || 'project'}/${uid()}.${ext}`;
      const { error: e } = await supabase.storage.from('project-media').upload(path, file, { contentType: file.type });
      if (e) throw e;
      const url = supabase.storage.from('project-media').getPublicUrl(path).data.publicUrl;
      setP((cur) => (field === 'gallery' ? { ...cur, gallery: [...cur.gallery, { src: url, alt: `${cur.name} — image` }] } : field === 'brochure_url' ? { ...cur, brochure_url: url } : { ...cur, [field]: url }));
    } catch (e) { setError(errMsg(e)); }
    setUploading('');
  }
  async function save() {
    setError('');
    if (!p.name.trim() || !p.code.trim()) return setError('Name and short code are required.');
    setBusy(true);
    try {
      const row = { ...p, code: p.code.trim().toUpperCase(), slug: (p.slug || p.name).toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
        landing_order: Number(p.landing_order) || 0, hero_image_url: p.hero_image_url || null, logo_url: p.logo_url || null, video_url: p.video_url || null,
        brochure_url: p.brochure_url || null, image_credit: p.image_credit || null, contact_phone: p.contact_phone || null, contact_email: p.contact_email || null,
        lat: p.lat === '' || p.lat == null ? null : Number(p.lat), lng: p.lng === '' || p.lng == null ? null : Number(p.lng),
        gallery: p.gallery.filter((g) => g.src) };
      delete row.created_at;
      const saved = await saveRow('projects', row);
      onSaved(saved);
    } catch (e) { setError(errMsg(e)); setBusy(false); }
  }

  return (
    <Modal title={project.id ? `Edit ${project.name}` : 'Add project'} onClose={onClose} wide
      footer={<><button className="btn secondary" onClick={onClose}>Cancel</button><button className="btn" disabled={busy || !!uploading} onClick={save}>{busy ? 'Saving…' : 'Save project'}</button></>}>
      <div className="seg">
        {[['details', 'Details'], ['website', 'Website content'], ['brand', 'Look & media']].map(([k, l]) => (
          <button type="button" key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>
      <ErrorBox error={error} />
      {tab === 'details' && (
        <>
          <div className="grid-2">
            <Field label="Project name"><input className="input" value={p.name} onChange={set('name')} /></Field>
            <Field label="Short code" hint="2–5 letters, e.g. AMR"><input className="input" maxLength={5} value={p.code} onChange={set('code')} /></Field>
            <Field label="Type">
              <select className="input" value={p.project_type} onChange={set('project_type')}>
                <option value="residential">Residential</option><option value="commercial">Commercial</option><option value="mixed">Mixed use</option>
              </select>
            </Field>
            <Field label="Status label"><input className="input" placeholder="Ongoing / Ready to move / Upcoming" value={p.status_label || ''} onChange={set('status_label')} /></Field>
            <Field label="Area / locality"><input className="input" placeholder="Wakad" value={p.location_label || ''} onChange={set('location_label')} /></Field>
            <Field label="City"><input className="input" value={p.city || ''} onChange={set('city')} /></Field>
          </div>
          <Field label="Full address"><input className="input" value={p.address || ''} onChange={set('address')} /></Field>
          <div className="grid-2">
            <Field label="MahaRERA no."><input className="input" value={p.rera_no || ''} onChange={set('rera_no')} /></Field>
            <Field label="Possession" hint="Only if officially announced"><input className="input" value={p.possession || ''} onChange={set('possession')} /></Field>
            <Field label="Sales phone"><input className="input" value={p.contact_phone || ''} onChange={set('contact_phone')} /></Field>
            <Field label="Sales email"><input className="input" value={p.contact_email || ''} onChange={set('contact_email')} /></Field>
            <Field label="Latitude" hint="For the locations map, e.g. 18.5959"><input className="input" type="number" step="0.0001" value={p.lat ?? ''} onChange={set('lat')} /></Field>
            <Field label="Longitude" hint="e.g. 73.7509"><input className="input" type="number" step="0.0001" value={p.lng ?? ''} onChange={set('lng')} /></Field>
          </div>
          <label className="check"><input type="checkbox" checked={p.is_active} onChange={set('is_active')} />Active (shown on registration)</label>
        </>
      )}
      {tab === 'website' && (
        <>
          <Field label="Tagline"><input className="input" value={p.tagline || ''} onChange={set('tagline')} /></Field>
          <Field label="Description"><textarea className="input" value={p.description || ''} onChange={set('description')} /></Field>
          <Field label="Offering"><input className="input" placeholder="2 & 3 BHK residences" value={p.configurations || ''} onChange={set('configurations')} /></Field>
          <Field label="Highlights" hint="One per line">
            <textarea className="input" value={p.highlights.join('\n')} onChange={(e) => setP({ ...p, highlights: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })} />
          </Field>
          <Field label="Registration link name (slug)" hint={`Residents register at /register?project=${p.slug || 'project-name'}`}><input className="input" value={p.slug || ''} onChange={set('slug')} /></Field>
        </>
      )}
      {tab === 'brand' && (
        <div className="grid-2" style={{ alignItems: 'start' }}>
          <div className="stack">
            <Field label="Style">
              <select className="input" value={p.theme} onChange={(e) => pickTheme(e.target.value)}>
                {Object.entries(THEME_PRESETS).map(([k, t]) => <option key={k} value={k}>{t.label}</option>)}
              </select>
            </Field>
            <div className="row">
              <Field label="Main"><input type="color" className="swatch" value={p.color_primary} onChange={set('color_primary')} /></Field>
              <Field label="Accent"><input type="color" className="swatch" value={p.color_accent} onChange={set('color_accent')} /></Field>
              <Field label="Dark"><input type="color" className="swatch" value={p.color_dark} onChange={set('color_dark')} /></Field>
            </div>
            <Field group label="Hero photo / render" hint="Main image on the website and the residents' portal. Upload or paste a link.">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" value={p.hero_image_url || ''} onChange={set('hero_image_url')} aria-label="Hero photo / render link" placeholder="https://…" />
                <label className="btn secondary sm">{uploading === 'hero_image_url' ? '…' : 'Upload'}<input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && upload(e.target.files[0], 'hero_image_url')} /></label>
              </div>
            </Field>
            <Field group label="Walkthrough video" hint="YouTube link or upload an MP4 (up to 50 MB)">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" value={p.video_url || ''} onChange={set('video_url')} aria-label="Walkthrough video link" placeholder="https://youtu.be/…" />
                <label className="btn secondary sm">{uploading === 'video_url' ? '…' : 'Upload'}<input type="file" accept="video/mp4,video/webm" hidden onChange={(e) => e.target.files[0] && upload(e.target.files[0], 'video_url')} /></label>
              </div>
            </Field>
            <Field group label="Brochure (PDF)">
              <div className="row" style={{ flexWrap: 'nowrap' }}>
                <input className="input" value={p.brochure_url || ''} onChange={set('brochure_url')} aria-label="Brochure (PDF) link" placeholder="https://…pdf" />
                <label className="btn secondary sm">{uploading === 'brochure_url' ? '…' : 'Upload'}<input type="file" accept="application/pdf" hidden onChange={(e) => e.target.files[0] && upload(e.target.files[0], 'brochure_url')} /></label>
              </div>
            </Field>
            <Field label="Image credit" hint="Shown under photos, e.g. Artist's impression. Source: mihirgroup.com">
              <input className="input" value={p.image_credit || ''} onChange={set('image_credit')} />
            </Field>
            <Field group label={`Gallery (${p.gallery.length})`} hint="Add a short description for each image (used as alt text and caption)">
              <div className="stack" style={{ gap: 8 }}>
                {p.gallery.map((g, i) => (
                  <div key={g.src + i} className="row" style={{ flexWrap: 'nowrap', alignItems: 'center' }}>
                    <div className="photo" style={{ width: 64, height: 64, flex: 'none' }}><Photo src={g.src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: 0 }} /></div>
                    <input className="input sm" placeholder="Description" value={g.alt || ''} onChange={(e) => setP({ ...p, gallery: p.gallery.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} />
                    <input className="input sm" placeholder="Caption (optional)" value={g.caption || ''} onChange={(e) => setP({ ...p, gallery: p.gallery.map((x, j) => (j === i ? { ...x, caption: e.target.value } : x)) })} />
                    <button type="button" className="icon-btn" aria-label="Remove image" onClick={() => setP({ ...p, gallery: p.gallery.filter((_, j) => j !== i) })}><Icon name="trash" size={16} /></button>
                  </div>
                ))}
                <label className="btn secondary sm" style={{ alignSelf: 'flex-start' }}><Icon name="camera" />{uploading === 'gallery' ? 'Uploading…' : 'Add image'}
                  <input type="file" accept="image/*" hidden onChange={(e) => e.target.files[0] && upload(e.target.files[0], 'gallery')} /></label>
              </div>
            </Field>
          </div>
          <div className="stack">
            <span className="small strong">Preview</span>
            <div className="theme-preview"><Photo src={p.hero_image_url} alt="" label={p.name || 'Hero image'} style={{ width: '100%', height: '100%', objectFit: 'cover', minHeight: 0 }} /></div>
            <div className="row">
              <span className="btn sm" style={{ background: p.color_accent, color: '#fff' }}>Raise a complaint</span>
              <span className="badge plain" style={{ background: p.color_primary, color: '#fff' }}>{p.status_label || 'Ongoing'}</span>
              <span className="badge plain" style={{ background: p.color_dark, color: '#fff' }}>{p.name || 'Project'}</span>
            </div>
            <p className="small muted">Customers of this project see these colours and the hero photo throughout their portal.</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
