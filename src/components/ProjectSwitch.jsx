import { useEffect, useState } from 'react';
import { getProjects } from '../lib/api';

// Colourful project filter chips used across admin screens
export default function ProjectSwitch({ value, onChange, allLabel = 'All projects' }) {
  const [projects, setProjects] = useState([]);
  useEffect(() => { getProjects(true).then(setProjects).catch(() => {}); }, []);
  if (projects.length < 2) return null;
  return (
    <div className="proj-switch" role="group" aria-label="Filter by project">
      <button className={`proj-chip ${!value ? 'on' : ''}`} onClick={() => onChange('')}>{allLabel}</button>
      {projects.map((p) => (
        <button key={p.id} className={`proj-chip ${value === p.id ? 'on' : ''}`} onClick={() => onChange(p.id)}>
          {p.name}
        </button>
      ))}
    </div>
  );
}
