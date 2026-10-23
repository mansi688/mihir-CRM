import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { themeVars } from '../../lib/theme';
import { Photo } from '../../components/Media';
import { LogoMark } from '../../components/LogoMark';

// Reads ?project=<slug> so project links open a themed sign-in / registration
export function useProjectFromQuery() {
  const [params] = useSearchParams();
  const slug = params.get('project');
  const [project, setProject] = useState(null);
  useEffect(() => {
    if (!slug) { setProject(null); return; }
    supabase.from('projects').select('*').eq('slug', slug).maybeSingle().then(({ data }) => setProject(data || null));
  }, [slug]);
  return project;
}

export default function AuthShell({ children, project }) {
  const { settings } = useAuth();
  const L = settings.landing || {};
  const company = settings.company_name || 'Mihir Group';
  const img = project?.hero_image_url || L.hero_image_url;
  return (
    <div className="auth" style={project ? themeVars(project) : undefined}>
      <section className="auth-side">
        {img && <Photo src={img} alt="" className="auth-photo" eager />}
        <div className="auth-shade" />
        <div className="auth-side-inner">
          <Link to={project ? `/register?project=${project.slug}` : '/login'} className="auth-logo" aria-label={`${company} customer portal`}>
            <LogoMark url={L.logo_url} company={company} light />
          </Link>
          <div>
            <p className="auth-eyebrow">{project ? `${project.name} · ${project.location_label?.split('·')[0] || ''}` : 'Customer portal'}</p>
            <h1>{project ? `Welcome home to ${project.name}.` : 'Your home, cared for.'}</h1>
            <p>Raise requests about your {project?.project_type === 'commercial' ? 'unit' : 'flat'} or shared facilities, attach photos, and follow every step until it's resolved.</p>
          </div>
          <p className="foot small">{settings.support_phone ? `Helpdesk: ${settings.support_phone}` : <a href="https://mihirgroup.com" style={{ color: 'inherit' }}>mihirgroup.com</a>}</p>
        </div>
      </section>
      <main className="auth-main">
        <div className="auth-card">{children}</div>
      </main>
    </div>
  );
}
