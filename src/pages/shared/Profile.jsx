import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { supabase } from '../../lib/supabase';
import { updateProfile } from '../../lib/api';
import { ROLE_LABEL } from '../../lib/constants';
import { errMsg } from '../../lib/utils';
import { ErrorBox, Field, useToast } from '../../components/UI';

export default function Profile() {
  const { profile, user, refreshProfile, signOut, isCustomer } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [name, setName] = useState(profile.full_name);
  const [mobile, setMobile] = useState(profile.mobile || '');
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setError('');
    const m = mobile.replace(/[^0-9]/g, '').slice(-10);
    if (m && m.length !== 10) return setError('Enter a valid 10-digit mobile number.');
    setBusy(true);
    try {
      await updateProfile(profile.id, { full_name: name.trim(), mobile: m || null });
      if (pw) {
        if (pw.length < 8) throw new Error('Password must be at least 8 characters.');
        const { error: pe } = await supabase.auth.updateUser({ password: pw });
        if (pe) throw pe;
        setPw('');
      }
      await refreshProfile();
      toast('Profile saved');
    } catch (err) { setError(errMsg(err)); }
    setBusy(false);
  }

  return (
    <div className="page narrow">
      <div className="page-head"><div><h1>My profile</h1><p>{ROLE_LABEL[profile.role]}{profile.team ? ` · ${profile.team.name}` : ''} · {user.email}</p></div></div>
      <form className="panel panel-pad stack" onSubmit={save}>
        <ErrorBox error={error} />
        <Field label="Full name"><input className="input" required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Mobile number" hint="Used for WhatsApp/SMS updates"><input className="input" type="tel" value={mobile} onChange={(e) => setMobile(e.target.value)} /></Field>
        <Field label="New password" hint="Leave blank to keep your current password"><input className="input" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <div className="spread">
          {isCustomer ? <Link to="/flats">Manage my flats</Link> : <span />}
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button>
        </div>
      </form>
      <div style={{ marginTop: 16 }}>
        <button className="btn secondary" onClick={() => signOut().then(() => nav('/login'))}>Sign out</button>
      </div>
    </div>
  );
}
