import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { RELATIONS } from '../../lib/constants';
import { errMsg } from '../../lib/utils';
import { ErrorBox, Field } from '../../components/UI';
import FlatPicker from '../../components/FlatPicker';
import AuthShell, { useProjectFromQuery } from './AuthShell';

export default function Register() {
  const [form, setForm] = useState({ full_name: '', mobile: '', email: '', password: '', relation: 'owner' });
  const [flat, setFlat] = useState({ flatId: '', label: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const nav = useNavigate();
  const project = useProjectFromQuery();
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setError('');
    const mobile = form.mobile.replace(/[^0-9]/g, '').slice(-10);
    if (mobile.length !== 10) return setError('Enter a valid 10-digit mobile number.');
    if (!flat.flatId) return setError('Select your flat.');
    if (form.password.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        emailRedirectTo: `${window.location.origin}/home`,
        data: { full_name: form.full_name.trim(), mobile, flat_id: flat.flatId, relation: form.relation },
      },
    });
    setBusy(false);
    if (error) return setError(errMsg(error));
    if (data.session) nav('/home', { replace: true });
    else setSent(true); // email confirmation is switched on in Supabase
  }

  if (sent) {
    return (
      <AuthShell project={project}>
        <h2>Check your email</h2>
        <p className="muted" style={{ margin: '8px 0 20px' }}>
          We sent a confirmation link to <b>{form.email}</b>. Open it on this device to finish setting up your account for {flat.label}.
        </p>
        <Link className="btn secondary" to="/login">Back to sign in</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell project={project}>
      <h2>Create your account</h2>
      <p className="muted" style={{ marginBottom: 24 }}>Link your account to your {project?.project_type === 'commercial' ? 'unit' : 'flat'}{project ? ` at ${project.name}` : ''} so you can raise and track complaints.</p>
      <form className="stack" onSubmit={submit}>
        <ErrorBox error={error} />
        <Field label="Full name">
          <input className="input" required autoComplete="name" value={form.full_name} onChange={set('full_name')} />
        </Field>
        <div className="grid-2">
          <Field label="Mobile number" hint="For updates on WhatsApp/SMS">
            <input className="input" type="tel" inputMode="numeric" required autoComplete="tel" placeholder="98XXXXXXXX" value={form.mobile} onChange={set('mobile')} />
          </Field>
          <Field label="You are the">
            <select className="input" value={form.relation} onChange={set('relation')}>
              {RELATIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </Field>
        </div>
        <div className="hr" />
        <FlatPicker onChange={setFlat} projectId={project?.id || ''} />
        <div className="hr" />
        <Field label="Email">
          <input className="input" type="email" required autoComplete="email" value={form.email} onChange={set('email')} />
        </Field>
        <Field label="Password" hint="At least 8 characters">
          <input className="input" type="password" required minLength={8} autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
        <button className="btn block" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button>
        <p className="muted small" style={{ textAlign: 'center' }}>Already registered? <Link to={project ? `/login?project=${project.slug}` : '/login'}>Sign in</Link></p>
      </form>
    </AuthShell>
  );
}
