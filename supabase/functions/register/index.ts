// Supabase Edge Function: register
// Self-registration for residents. Creates the account already confirmed (no email
// needed), always as a customer, and links the chosen flat (unverified until the
// office checks it). Usernames become <username>@mihir.test.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const raw = String(body.email || '').trim().toLowerCase();
  const email = raw.includes('@') ? raw : `${raw.replace(/[^a-z0-9._-]/g, '')}@mihir.test`;
  const password = String(body.password || '');
  const full_name = String(body.full_name || '').trim();
  const mobile = String(body.mobile || '').replace(/[^0-9]/g, '').slice(-10);
  const relation = ['owner', 'tenant', 'family'].includes(body.relation) ? body.relation : 'owner';

  if (!/^[a-z0-9._+-]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Choose a username (letters and numbers) or enter a valid email.' }, 400);
  if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
  if (full_name.length < 2 || full_name.length > 120) return json({ error: 'Enter your full name.' }, 400);
  if (mobile.length !== 10) return json({ error: 'Enter a valid 10-digit mobile number.' }, 400);
  if (!body.flat_id) return json({ error: 'Select your flat.' }, 400);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data: flat } = await admin.from('flats').select('id').eq('id', body.flat_id).maybeSingle();
  if (!flat) return json({ error: 'Select your flat.' }, 400);

  const { error } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
    user_metadata: { full_name, mobile, flat_id: body.flat_id, relation },
  });
  if (error) {
    const taken = /already|exists|registered/i.test(error.message);
    return json({ error: taken ? 'That username or email is already taken. Try another, or sign in.' : error.message }, 400);
  }
  return json({ ok: true, login: raw.includes('@') ? email : email.split('@')[0] });
});
