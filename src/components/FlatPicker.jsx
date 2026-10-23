import { useEffect, useState } from 'react';
import { getProjects, getTowers, getWings, getFlats } from '../lib/api';
import { Field } from './UI';

// Cascading Project → Tower/Building → Wing → Flat selector.
// onChange receives { flatId, label } (label like "Sunrise Heights, Tower 1 / A-101")
export default function FlatPicker({ onChange, required = true, projectId = '' }) {
  const [projects, setProjects] = useState([]);
  const [towers, setTowers] = useState([]);
  const [wings, setWings] = useState([]);
  const [flats, setFlats] = useState([]);
  const [sel, setSel] = useState({ project: projectId, tower: '', wing: '', flat: '' });
  const [err, setErr] = useState('');

  useEffect(() => { getProjects().then(setProjects).catch((e) => setErr(e.message)); }, []);
  useEffect(() => { if (projectId) setSel({ project: projectId, tower: '', wing: '', flat: '' }); }, [projectId]);
  useEffect(() => { setTowers([]); if (sel.project) getTowers(sel.project).then(setTowers); }, [sel.project]);
  useEffect(() => { setWings([]); if (sel.tower) getWings(sel.tower).then(setWings); }, [sel.tower]);
  useEffect(() => { setFlats([]); if (sel.wing) getFlats(sel.wing).then(setFlats); }, [sel.wing]);

  // auto-pick when there is only one option (common for single-tower projects)
  useEffect(() => { if (towers.length === 1 && !sel.tower) set('tower', towers[0].id); }, [towers]); // eslint-disable-line
  useEffect(() => { if (wings.length === 1 && !sel.wing) set('wing', wings[0].id); }, [wings]); // eslint-disable-line

  function set(key, value) {
    const order = ['project', 'tower', 'wing', 'flat'];
    const next = { ...sel, [key]: value };
    order.slice(order.indexOf(key) + 1).forEach((k) => { next[k] = ''; });
    setSel(next);
    if (key !== 'flat') onChange?.({ flatId: '', label: '' });
    else {
      const p = projects.find((x) => x.id === next.project);
      const t = towers.find((x) => x.id === next.tower);
      const w = wings.find((x) => x.id === next.wing);
      const f = flats.find((x) => x.id === value);
      onChange?.({ flatId: value, label: f ? `${p?.name}, ${t?.name} / ${w?.name}-${f.flat_no}` : '' });
    }
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      {err && <div className="alert-box error">{err}</div>}
      {!projectId && <Field label="Project">
        <select className="input" value={sel.project} required={required} onChange={(e) => set('project', e.target.value)}>
          <option value="">Select your project</option>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}{p.city ? ` — ${p.city}` : ''}</option>)}
        </select>
      </Field>}
      <div className="grid-3" style={{ gap: 12 }}>
        <Field label="Building / tower">
          <select className="input" value={sel.tower} required={required} disabled={!sel.project} onChange={(e) => set('tower', e.target.value)}>
            <option value="">Select</option>
            {towers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </Field>
        <Field label="Wing">
          <select className="input" value={sel.wing} required={required} disabled={!sel.tower} onChange={(e) => set('wing', e.target.value)}>
            <option value="">Select</option>
            {wings.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
        </Field>
        <Field label="Flat / unit no.">
          <select className="input" value={sel.flat} required={required} disabled={!sel.wing} onChange={(e) => set('flat', e.target.value)}>
            <option value="">Select</option>
            {flats.map((f) => <option key={f.id} value={f.id}>{f.flat_no}{f.flat_type ? ` · ${f.flat_type}` : ''}</option>)}
          </select>
        </Field>
      </div>
    </div>
  );
}
