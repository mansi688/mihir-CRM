import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { errMsg } from '../../lib/utils';
import { ErrorBox, Field } from '../../components/UI';
import AuthShell, { useProjectFromQuery } from './AuthShell';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const nav = useNavigate();
  const project = useProjectFromQuery();

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) return setError(errMsg(error));
    nav('/home', { replace: true });
  }

  return (
    <AuthShell project={project}>
      <h2>Sign in</h2>
      <p className="muted" style={{ marginBottom: 24 }}>Residents and staff use the same sign-in.</p>
      <form className="stack" onSubmit={submit}>
        <ErrorBox error={error} />
        <Field label="Email">
          <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password">
          <input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="spread small">
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button className="btn block" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <p className="muted small" style={{ textAlign: 'center' }}>
          New owner or tenant? <Link to={project ? `/register?project=${project.slug}` : '/register'}>Create an account</Link>
        </p>
      </form>
    </AuthShell>
  );
}
