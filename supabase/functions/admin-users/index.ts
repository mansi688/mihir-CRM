// Supabase Edge Function: admin-users
// Creates logins for employees (admin only) and customers (manager/admin),
// and resets passwords. Runs on the server with the service-role key, which
// never reaches the browser.
//
// Deploy:  supabase functions deploy admin-users
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const url = Deno.env.get('SUPABASE_URL')!;
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(url, service, { auth: { persistSession: false } });

  // who is calling?
  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Please sign in again.' }, 401);
  const { data: caller } = await admin.from('profiles').select('id, role, is_active, project_ids').eq('id', userData.user.id).single();
  if (!caller?.is_active || !['manager', 'admin'].includes(caller.role)) return json({ error: 'Not allowed.' }, 403);
  const isAdmin = caller.role === 'admin';

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  try {
    if (body.action === 'create_user') {
      const role = body.role || 'customer';
      if (!['customer', 'staff', 'manager', 'admin'].includes(role)) return json({ error: 'Invalid role.' }, 400);
      if (role !== 'customer' && !isAdmin) return json({ error: 'Only admins can add employees.' }, 403);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'Enter a valid email.' }, 400);
      if (password.length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
      if (!String(body.full_name || '').trim()) return json({ error: 'Name is required.' }, 400);

      // managers limited to their projects may only add customers to those projects
      if (role === 'customer' && body.flat_id && !isAdmin && caller.project_ids?.length) {
        const { data: f } = await admin.from('flats').select('wing:wings(tower:towers(project_id))').eq('id', body.flat_id).single();
        const pid = (f as any)?.wing?.tower?.project_id;
        if (!caller.project_ids.includes(pid)) return json({ error: 'That flat is in a project you do not manage.' }, 403);
      }

      const { data, error } = await admin.auth.admin.createUser({
        email, password, email_confirm: true,
        user_metadata: { full_name: body.full_name, mobile: body.mobile || '', flat_id: role === 'customer' ? body.flat_id || null : null, relation: body.relation || 'owner' },
      });
      if (error) return json({ error: error.message }, 400);

      const patch: Record<string, unknown> = {};
      if (role !== 'customer') {
        patch.role = role;
        patch.team_id = body.team_id || null;
        patch.designation = body.designation || null;
        patch.project_ids = Array.isArray(body.project_ids) ? body.project_ids : [];
      }
      if (Object.keys(patch).length) {
        const { error: pe } = await admin.from('profiles').update(patch).eq('id', data.user.id);
        if (pe) return json({ error: pe.message }, 400);
      }
      if (role === 'customer' && body.flat_id && body.verified) {
        await admin.from('customer_flats').update({ verified: true, verified_by: caller.id, verified_at: new Date().toISOString() })
          .eq('customer_id', data.user.id).eq('flat_id', body.flat_id);
      }
      return json({ ok: true, id: data.user.id });
    }

    if (body.action === 'reset_password') {
      if (!isAdmin) return json({ error: 'Only admins can reset passwords.' }, 403);
      if (String(body.password || '').length < 8) return json({ error: 'Password must be at least 8 characters.' }, 400);
      const { error } = await admin.auth.admin.updateUserById(body.user_id, { password: body.password });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
