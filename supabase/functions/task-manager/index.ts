// Supabase Edge Function: task-manager
// Links CRM complaints to the Mihir Task Manager (https://mihir-task-manager.onrender.com).
// Managers/admins only. The shared secret and the task manager's address are kept in the
// private table public.integration_settings, readable only with the service role.
//
// actions:
//   options  {}                                   → projects + people in the task manager
//   create   { complaint_id, title, description, deadline, priority, project, assignees[] }
//   status   { complaint_id }                      → live status of the linked task
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region, x-supabase-api-version',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const CRM_URL = 'https://mihir-crm-portal.vercel.app';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  const token = (req.headers.get('Authorization') || '').replace('Bearer ', '');
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: 'Please sign in again.' }, 401);
  const { data: me } = await admin.from('profiles').select('id, full_name, role, is_active, project_ids').eq('id', userData.user.id).single();
  if (!me?.is_active || !['manager', 'admin'].includes(me.role)) return json({ error: 'Only managers and admins can send complaints to the task manager.' }, 403);

  let body: Record<string, any>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const { data: settings } = await admin.from('integration_settings').select('key, value');
  const cfg = Object.fromEntries((settings || []).map((r: any) => [r.key, r.value]));
  const base = String(cfg.task_manager_url || '').replace(/\/$/, '');
  const secret = String(cfg.task_manager_secret || '');
  if (!base || !secret) return json({ error: 'The task manager link is not set up.' }, 503);

  const tm = async (path: string, init: RequestInit = {}) => {
    let res: Response;
    try {
      res = await fetch(base + path, {
        ...init,
        headers: { 'Content-Type': 'application/json', 'X-CRM-Secret': secret, ...(init.headers || {}) },
        signal: AbortSignal.timeout(60000),   // the free Render server can take ~50 s to wake up
      });
    } catch {
      throw Object.assign(new Error('The task manager did not respond. It may be waking up — try again in a minute.'), { status: 504 });
    }
    let data: any = null;
    try { data = await res.json(); } catch { /* empty */ }
    if (!res.ok) {
      const msg = res.status === 401 ? 'The task manager refused the link (secret key mismatch).'
        : res.status === 503 ? 'The CRM link is not switched on in the task manager yet.'
        : data?.error || `Task manager error (${res.status}).`;
      throw Object.assign(new Error(msg), { status: res.status === 400 ? 400 : 502 });
    }
    return data;
  };

  const loadComplaint = async () => {
    const { data: c } = await admin.from('complaints').select('*').eq('id', body.complaint_id).maybeSingle();
    if (!c) throw Object.assign(new Error('Complaint not found.'), { status: 404 });
    const scoped = me.role === 'admin' || !(me.project_ids || []).length || (me.project_ids || []).includes(c.project_id);
    if (!scoped) throw Object.assign(new Error('This complaint belongs to a project you do not manage.'), { status: 403 });
    return c;
  };

  try {
    if (body.action === 'options') return json(await tm('/api/integrations/crm/options'));

    if (body.action === 'status') {
      const c = await loadComplaint();
      if (!c.tm_task_id) return json({ task: null });
      return json(await tm(`/api/integrations/crm/tasks/${encodeURIComponent(c.tm_task_id)}`));
    }

    if (body.action === 'create') {
      const c = await loadComplaint();
      const assignees = Array.isArray(body.assignees) ? body.assignees.map(String) : [];
      const out = await tm('/api/integrations/crm/tasks', {
        method: 'POST',
        body: JSON.stringify({
          complaintId: c.id,
          title: String(body.title || `[${c.complaint_no}] ${c.title}`).slice(0, 200),
          description: String(body.description || c.description || ''),
          deadline: String(body.deadline || ''),
          priority: ['high', 'medium', 'low'].includes(body.priority) ? body.priority : 'medium',
          project: String(body.project || ''),
          assignees,
          requestedBy: me.full_name,
          link: `${CRM_URL}/complaints/${c.id}`,
        }),
      });
      const task = out.task;
      if (!c.tm_task_id || c.tm_task_id !== task.id) {
        await admin.from('complaints').update({
          tm_task_id: task.id, tm_task_url: task.url, tm_project: body.project || null,
          tm_linked_at: new Date().toISOString(), tm_linked_by: me.id,
        }).eq('id', c.id);
        const who = (task.assignees || []).map((a: any) => a.name).join(', ');
        await admin.from('complaint_updates').insert({
          complaint_id: c.id, actor_id: me.id, actor_name: me.full_name, type: 'task_manager', to_value: task.id,
          message: `Added to Mihir Task Manager as ${task.id}${who ? ` — assigned to ${who}` : ''}`, is_internal: true,
        });
      }
      return json({ ok: true, duplicate: !!out.duplicate, task });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, (e as any).status || 500);
  }
});
