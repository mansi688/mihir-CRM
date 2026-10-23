import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
import { getSettings } from './api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [settings, setSettings] = useState({});
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  const loadProfile = useCallback(async (s) => {
    if (!s?.user) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*, team:teams(id, name)').eq('id', s.user.id).maybeSingle();
    setProfile(data || null);
  }, []);

  useEffect(() => {
    let alive = true;
    getSettings().then((s) => alive && setSettings(s)).catch(() => {});
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      setSession(s);
      // defer to avoid calling Supabase inside the auth callback
      setTimeout(() => loadProfile(s), 0);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  const value = {
    session,
    user: session?.user || null,
    profile,
    settings,
    loading,
    recovery,
    clearRecovery: () => setRecovery(false),
    role: profile?.role || null,
    isCustomer: profile?.role === 'customer',
    isStaff: ['staff', 'manager', 'admin'].includes(profile?.role),
    isManager: ['manager', 'admin'].includes(profile?.role),
    isAdmin: profile?.role === 'admin',
    refreshProfile: () => loadProfile(session),
    refreshSettings: () => getSettings().then(setSettings),
    signOut: async () => { await supabase.auth.signOut(); setProfile(null); },
  };
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function homePath(role) {
  if (role === 'customer') return '/my';
  if (role === 'staff') return '/tasks';
  if (role === 'manager' || role === 'admin') return '/admin';
  return '/login';
}
