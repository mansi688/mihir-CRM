import { supabase, PHOTO_BUCKET } from './supabase';
import { compressImage, uid } from './utils';

const must = ({ data, error, count }) => {
  if (error) throw error;
  return count !== undefined && count !== null ? { data, count } : data;
};

// ---------------- settings & config ----------------
export async function getSettings() {
  const rows = must(await supabase.from('app_settings').select('key, value, description').order('key'));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}
export async function getSettingRows() {
  return must(await supabase.from('app_settings').select('*').order('key'));
}
export const saveSetting = async (key, value) =>
  must(await supabase.from('app_settings').update({ value, updated_at: new Date().toISOString() }).eq('key', key));

export const getCategories = async (all = false) => {
  let q = supabase.from('categories').select('*').order('sort_order');
  if (!all) q = q.eq('is_active', true);
  return must(await q);
};
export const upsertCategory = async (row) => must(await supabase.from('categories').upsert(row));
export const getTeams = async () => must(await supabase.from('teams').select('*').order('name'));
export const upsertTeam = async (row) => must(await supabase.from('teams').upsert(row).select().single());
export const deleteTeam = async (id) => must(await supabase.from('teams').delete().eq('id', id));
export const getSla = async () => must(await supabase.from('sla_rules').select('*'));
export const saveSla = async (priority, resolve_hours) =>
  must(await supabase.from('sla_rules').update({ resolve_hours }).eq('priority', priority));

// ---------------- property master ----------------
export const getProjects = async (includeInactive = false) => {
  let q = supabase.from('projects').select('*').order('name');
  if (!includeInactive) q = q.eq('is_active', true);
  return must(await q);
};
export const getTowers = async (projectId) =>
  must(await supabase.from('towers').select('*').eq('project_id', projectId).order('sort_order').order('name'));
export const getWings = async (towerId) =>
  must(await supabase.from('wings').select('*').eq('tower_id', towerId).order('sort_order').order('name'));
export const getFlats = async (wingId) =>
  must(await supabase.from('flats').select('*').eq('wing_id', wingId).order('floor').order('flat_no'));

export const saveRow = async (table, row) => must(await supabase.from(table).upsert(row).select().single());
export const deleteRow = async (table, id) => must(await supabase.from(table).delete().eq('id', id));
export const insertFlats = async (rows) => must(await supabase.from('flats').insert(rows).select());

// ---------------- people ----------------
const FLAT_SELECT =
  'id, relation, verified, is_primary, created_at, flat:flats(id, flat_no, floor, flat_type, wing:wings(id, name, tower:towers(id, name, project:projects(id, name, slug, theme, color_primary, color_accent, color_dark, project_type, hero_image_url, tagline, location_label))))';

export const getMyFlats = async (customerId) =>
  must(await supabase.from('customer_flats').select(FLAT_SELECT).eq('customer_id', customerId).order('created_at'));
export const linkFlat = async (customer_id, flat_id, relation, verified = false) =>
  must(await supabase.from('customer_flats').insert({ customer_id, flat_id, relation, verified }).select().single());
export const unlinkFlat = async (id) => must(await supabase.from('customer_flats').delete().eq('id', id));
export const setFlatVerified = async (id, verified) =>
  must(await supabase.from('customer_flats').update({ verified }).eq('id', id));

export const updateProfile = async (id, patch) =>
  must(await supabase.from('profiles').update(patch).eq('id', id).select().single());

export async function listCustomers({ search = '', page = 0, pageSize = 25, projectId = '', unverified = false } = {}) {
  const inner = projectId || unverified;
  let q = supabase
    .from('profiles')
    .select(`id, full_name, mobile, email, is_active, created_at, customer_flats!customer_id${inner ? '!inner' : ''}(project_id, ${FLAT_SELECT})`, { count: 'exact' })
    .eq('role', 'customer');
  if (projectId) q = q.eq('customer_flats.project_id', projectId);
  if (unverified) q = q.eq('customer_flats.verified', false);
  q = q
    .order('created_at', { ascending: false })
    .range(page * pageSize, page * pageSize + pageSize - 1);
  if (search) { const s = search.replace(/[%,()]/g, ' ').trim(); q = q.or(`full_name.ilike.%${s}%,mobile.ilike.%${s}%,email.ilike.%${s}%`); }
  return must(await q);
}
export const getEmployees = async (activeOnly = false) => {
  let q = supabase.from('profiles').select('*, team:teams(id, name)').neq('role', 'customer').order('full_name');
  if (activeOnly) q = q.eq('is_active', true);
  return must(await q);
};

// Calls the admin-users Edge Function (creates logins with the service key on the server)
export async function adminUsers(payload) {
  const { data, error } = await supabase.functions.invoke('admin-users', { body: payload });
  if (error) {
    let msg = error.message;
    try { msg = (await error.context.json()).error || msg; } catch { /* keep default */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// ---------------- complaints ----------------
export async function createComplaint(payload, files = [], onProgress) {
  const row = must(await supabase.from('complaints').insert(payload).select().single());
  if (files.length) await uploadPhotos(row.id, files, 'issue', onProgress);
  return row;
}

export async function uploadPhotos(complaintId, files, kind = 'issue', onProgress) {
  const { data: { user } } = await supabase.auth.getUser();
  let done = 0;
  for (const original of files) {
    const file = await compressImage(original);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `${complaintId}/${uid()}.${ext}`;
    const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
    if (up.error) throw up.error;
    must(await supabase.from('complaint_attachments').insert({
      complaint_id: complaintId, storage_path: path, file_name: original.name,
      mime_type: file.type, size_bytes: file.size, kind, uploaded_by: user.id,
    }));
    done += 1;
    onProgress?.(done, files.length);
  }
}

export async function getAttachments(complaintId) {
  const rows = must(await supabase.from('complaint_attachments').select('*').eq('complaint_id', complaintId).order('created_at'));
  if (!rows.length) return [];
  const { data } = await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(rows.map((r) => r.storage_path), 3600);
  return rows.map((r, i) => ({ ...r, url: data?.[i]?.signedUrl }));
}

export const LIST_COLUMNS =
  'id, complaint_no, kind, title, category, area, priority, status, customer_id, customer_name, customer_mobile, project_id, project_name, tower_name, wing_name, flat_no, assigned_to, assignee_name, team_id, due_at, created_at, updated_at, resolved_at, closed_at, customer_rating, reopen_count, source';

export async function listComplaints(f = {}) {
  const { page = 0, pageSize = 30 } = f;
  let q = supabase.from('complaints').select(f.columns || LIST_COLUMNS, { count: 'exact' });
  if (f.customerId) q = q.eq('customer_id', f.customerId);
  if (f.assignedTo) q = q.eq('assigned_to', f.assignedTo);
  if (f.unassigned) q = q.is('assigned_to', null);
  if (f.status?.length) q = q.in('status', f.status);
  if (f.priority) q = q.eq('priority', f.priority);
  if (f.category) q = q.eq('category', f.category);
  if (f.projectId) q = q.eq('project_id', f.projectId);
  if (f.teamId) q = q.eq('team_id', f.teamId);
  if (f.overdue) q = q.in('status', ['open', 'assigned', 'in_progress']).lt('due_at', new Date().toISOString());
  if (f.from) q = q.gte('created_at', f.from);
  if (f.to) q = q.lt('created_at', f.to);
  if (f.search) {
    const s = f.search.replace(/[%,()]/g, ' ').trim();
    q = q.or(`complaint_no.ilike.%${s}%,title.ilike.%${s}%,customer_name.ilike.%${s}%,customer_mobile.ilike.%${s}%,flat_no.ilike.%${s}%`);
  }
  const sort = f.sort || 'created_at';
  q = q.order(sort, { ascending: sort === 'due_at' }).range(page * pageSize, page * pageSize + pageSize - 1);
  return must(await q);
}

export const getComplaint = async (id) => {
  const { data, error } = await supabase.from('complaints').select('*, team:teams(id, name)').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
};
export const getTimeline = async (id) =>
  must(await supabase.from('complaint_updates').select('*').eq('complaint_id', id).order('created_at').order('id'));
export const addComment = async (complaint_id, message, is_internal = false) =>
  must(await supabase.from('complaint_updates').insert({ complaint_id, type: 'comment', message, is_internal }));
export const setStatus = async (id, status, note, resolution) =>
  must(await supabase.rpc('set_complaint_status', { p_complaint: id, p_status: status, p_note: note || null, p_resolution: resolution || null }));
export const updateComplaint = async (id, patch) =>
  must(await supabase.from('complaints').update(patch).eq('id', id).select().single());
export const deleteComplaint = async (id) => must(await supabase.from('complaints').delete().eq('id', id));
export const customerClose = async (id, rating, feedback) =>
  must(await supabase.rpc('customer_close_complaint', { p_complaint: id, p_rating: rating || null, p_feedback: feedback || null }));
export const customerReopen = async (id, reason) =>
  must(await supabase.rpc('customer_reopen_complaint', { p_complaint: id, p_reason: reason }));

export const getReport = async (from, to, projectId) =>
  must(await supabase.rpc('crm_report', { p_from: from, p_to: to, p_project: projectId || null }));

// ---------------- notifications ----------------
export const listNotifications = async (limit = 50) =>
  must(await supabase.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit));
export async function unreadCount() {
  const { count, error } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false);
  if (error) throw error;
  return count || 0;
}
export const markRead = async (id) => must(await supabase.from('notifications').update({ is_read: true }).eq('id', id));
export const markAllRead = async (userId) =>
  must(await supabase.from('notifications').update({ is_read: true }).eq('user_id', userId).eq('is_read', false));

// ---------------- website enquiries ----------------
export async function listEnquiries({ status = '', projectId = '', page = 0, pageSize = 30 } = {}) {
  let q = supabase.from('enquiries').select('*, project:projects(id, name)', { count: 'exact' })
    .order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
  if (status) q = q.eq('status', status);
  if (projectId) q = q.eq('project_id', projectId);
  return must(await q);
}
export const updateEnquiry = async (id, patch) => must(await supabase.from('enquiries').update(patch).eq('id', id));
