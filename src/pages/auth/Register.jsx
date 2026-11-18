import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { RELATIONS } from '../../lib/constants';
import { errMsg, toLoginEmail } from '../../lib/utils';
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
    const login = toLoginEmail(form.email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(login) || login.startsWith('@')) return setError('Choose a username (letters and numbers) or enter your email.');
    setBusy(true);
    // Accounts are created ready to use (no confirmation email), then signed in.
    const { data, error } = await supabase.functions.invoke('register', {
      body: { email: login, password: form.password, full_name: form.full_name.trim(), mobile, flat_id: flat.flatId, relation: form.relation },
    });
    let msg = error?.message || data?.error;
    if (error) { try { msg = (await error.context.json()).error || msg; } catch { /* keep */ } }
    if (msg) { setBusy(false); return setError(errMsg({ message: msg })); }
    const { error: se } = await supabase.auth.signInWithPassword({ email: login, password: form.password });
    setBusy(false);
    if (se) { setSent(true); return; }
    nav('/home', { replace: true });
  }

  if (sent) {
    return (
      <AuthShell project={project}>
        <h2>Account created</h2>
        <p className="muted" style={{ margin: '8px 0 20px' }}>
          Your account for {flat.label} is ready. Sign in with <b>{form.email}</b> and your password.
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
        <Field label="Username or email" hint="This is what you'll sign in with, e.g. priya or priya@gmail.com">
          <input className="input" type="text" required autoCapitalize="none" spellCheck={false} autoComplete="username" value={form.email} onChange={set('email')} />
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
