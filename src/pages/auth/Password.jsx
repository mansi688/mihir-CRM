import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../lib/auth';
import { errMsg } from '../../lib/utils';
import { ErrorBox, Field } from '../../components/UI';
import AuthShell from './AuthShell';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/reset-password` });
    setBusy(false);
    if (error) setError(errMsg(error)); else setSent(true);
  }

  return (
    <AuthShell>
      <h2>Reset your password</h2>
      {sent ? (
        <div className="stack" style={{ marginTop: 12 }}>
          <div className="alert-box ok">If an account exists for {email}, a reset link is on its way. Open it on this device.</div>
          <Link to="/login">Back to sign in</Link>
        </div>
      ) : (
        <form className="stack" style={{ marginTop: 20 }} onSubmit={submit}>
          <ErrorBox error={error} />
          <Field label="Email">
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <button className="btn block" disabled={busy}>{busy ? 'Sending…' : 'Send reset link'}</button>
          <Link to="/login" className="small">Back to sign in</Link>
        </form>
      )}
    </AuthShell>
  );
}

export function ResetPassword() {
  const { clearRecovery } = useAuth();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  async function submit(e) {
    e.preventDefault();
    if (pw.length < 8) return setError('Password must be at least 8 characters.');
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(errMsg(error));
    clearRecovery();
    nav('/home', { replace: true });
  }

  return (
    <AuthShell>
      <h2>Choose a new password</h2>
      <form className="stack" style={{ marginTop: 20 }} onSubmit={submit}>
        <ErrorBox error={error} />
        <Field label="New password" hint="At least 8 characters">
          <input className="input" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        <button className="btn block" disabled={busy}>{busy ? 'Saving…' : 'Save password'}</button>
      </form>
    </AuthShell>
  );
}
