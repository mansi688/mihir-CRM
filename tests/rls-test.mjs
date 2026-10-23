// Runs schema.sql + seed.sql on an embedded Postgres with Supabase-like
// auth/storage stubs, then exercises every role against the security rules.
// Usage: node tests/rls-test.mjs   (needs: npm i @electric-sql/pglite)
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', 'supabase', f), 'utf8');

const db = new PGlite();
let pass = 0, fail = 0;
process.on('unhandledRejection', (e) => { console.error('UNEXPECTED:', e.message, e.where || ''); process.exit(1); });
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗', msg); } };
async function expectError(fn, msg) {
  try { await fn(); fail++; console.log('  ✗', msg, '(no error raised)'); }
  catch (e) { pass++; console.log('  ✓', msg, '→', e.message.split('\n')[0]); }
}

// ---- Supabase stubs ----
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
  create schema auth; create schema storage;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner uuid);
  alter table storage.objects enable row level security;
  grant usage on schema auth, storage, public to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant select, insert, update, delete on storage.objects to authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`);

for (const f of ['schema.sql', 'seed.sql']) {
  console.log('Loading', f, '…');
  try { await db.exec(read(f)); }
  catch (e) { console.error('SQL ERROR in', f + ':', e.message, '| where:', e.where, '| position:', e.position); process.exit(1); }
}

// ---- helpers ----
const q = async (sql, params) => (await db.query(sql, params)).rows;
async function as(uid, fn) {
  await db.exec(`set role ${uid ? 'authenticated' : 'anon'}`);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid || '']);
  try { return await fn(); }
  finally { await db.exec(`reset role`); await db.query(`select set_config('request.jwt.claim.sub', '', false)`); }
}
const flat = async (tower, wing, no) => (await q(`
  select f.id from flats f join wings w on w.id=f.wing_id join towers t on t.id=w.tower_id
  where t.name=$1 and w.name=$2 and f.flat_no=$3`, [tower, wing, no]))[0].id;

const flat101 = await flat('Tower 1', 'A', '101');
const flat502 = await flat('Tower 2', 'B', '502');
const mkUser = async (email, meta) => (await q(
  `insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [email, JSON.stringify(meta)]))[0].id;

console.log('\n1. Registration');
const cust1 = await mkUser('ravi@example.com', { full_name: 'Ravi Kulkarni', mobile: '98220 12345', flat_id: flat101, relation: 'owner', role: 'admin' });
const cust2 = await mkUser('sneha@example.com', { full_name: 'Sneha Patil', mobile: '9811111111', flat_id: flat502 });
const admin = await mkUser('admin@co.com', { full_name: 'Office Admin', mobile: '9000000001' });
const mgr   = await mkUser('mgr@co.com',   { full_name: 'Facility Manager', mobile: '9000000002' });
const plumb = await mkUser('plumb@co.com', { full_name: 'Suresh (Plumber)', mobile: '9000000003' });
const elec  = await mkUser('elec@co.com',  { full_name: 'Amit (Electrician)', mobile: '9000000004' });
const p1 = (await q(`select * from profiles where id=$1`, [cust1]))[0];
ok(p1.role === 'customer', 'signup metadata cannot grant admin role');
ok(p1.mobile === '9822012345', 'mobile number normalised');
ok((await q(`select count(*)::int n from customer_flats where customer_id=$1 and flat_id=$2`, [cust1, flat101]))[0].n === 1, 'flat linked from registration form');

// bootstrap roles as superuser (what the README tells the owner to do once)
await q(`update profiles set role='admin' where id=$1`, [admin]);
await q(`update profiles set role='manager' where id=$1`, [mgr]);
await q(`update profiles set role='staff', team_id=(select id from teams where name='Plumbing & Water') where id=$1`, [plumb]);
await q(`update profiles set role='staff', team_id=(select id from teams where name='Electrical') where id=$1`, [elec]);

console.log('\n2. Anonymous visitor');
await as(null, async () => {
  ok((await q(`select count(*)::int n from projects`))[0].n === 4, 'can list the 4 Mihir projects for registration');
  ok((await q(`select count(*)::int n from flats`))[0].n === 812, 'can list flats/units for registration');
  ok((await q(`select count(*)::int n from complaints`))[0].n === 0, 'cannot see complaints');
  ok((await q(`select count(*)::int n from profiles`))[0].n === 0, 'cannot see profiles');
});

console.log('\n3. Customer raises a complaint');
let c1;
await as(cust1, async () => {
  c1 = (await q(`insert into complaints (flat_id, category, title, description, assigned_to, status, due_at)
                 values ($1, 'flat_plumbing', 'Kitchen sink leaking', 'Water leaking under the kitchen sink since morning', $2, 'closed', now() + interval '100 days')
                 returning *`, [flat101, elec]))[0];
});
ok(/^CMP-\d{4}-00001$/.test(c1.complaint_no), `complaint ID generated (${c1.complaint_no})`);
ok(c1.assigned_to === plumb, 'auto-assigned to plumbing team member (customer cannot pick assignee)');
ok(c1.status === 'assigned', 'status forced to Assigned (customer cannot set Closed)');
ok(c1.priority === 'high', 'priority taken from category default');
ok(Math.abs(new Date(c1.due_at) - Date.now() - 24 * 3600e3) < 60e3, 'deadline = 24h SLA for High (customer cannot set)');
ok(c1.customer_name === 'Ravi Kulkarni' && c1.flat_no === '101' && c1.wing_name === 'A' && c1.project_name === 'Sierra', 'task carries customer, mobile, project, wing, flat snapshot');
ok((await q(`select count(*)::int n from notifications where user_id=$1`, [plumb]))[0].n === 1, 'assignee notified');
ok((await q(`select count(*)::int n from notifications where user_id=$1`, [cust1]))[0].n === 1, 'customer notified');
ok((await q(`select count(*)::int n from outbound_messages where status='pending'`))[0].n === 2, 'WhatsApp messages queued for customer and assignee');

await as(cust1, async () => {
  await expectError(() => q(`insert into complaints (flat_id, category, title, description) values ($1,'lift','Lift stuck','Lift B stuck on 3rd floor')`, [flat502]),
    "customer cannot raise a complaint for someone else's flat");
  await expectError(() => q(`insert into complaints (customer_id, flat_id, category, title, description) values ($1,$2,'lift','Lift stuck','Lift stuck on 3rd floor')`, [cust2, flat502]),
    'customer cannot raise a complaint as another customer');
  const lift = (await q(`insert into complaints (flat_id, category, title, description, area) values ($1,'lift','Lift not working','Lift in A wing stuck at ground floor','flat') returning *`, [flat101]))[0];
  ok(lift.area === 'common', 'lift complaint forced to common area');
  ok(lift.status === 'open' && lift.assigned_to === null, 'no lift technician yet → stays Open/unassigned');
  const upd = await q(`update complaints set status='closed' where id=$1 returning id`, [c1.id]);
  ok(upd.length === 0, 'customer cannot update complaint directly');
  await expectError(() => q(`update profiles set role='admin' where id=$1`, [cust1]).then(r => { if ((r[0]?.role ?? 'customer') !== 'admin') throw new Error('role unchanged (silently ignored)'); }),
    'customer cannot promote self to admin');
  ok((await q(`select role from profiles where id=$1`, [cust1]))[0].role === 'customer', 'role still customer');
  ok((await q(`select count(*)::int n from profiles`))[0].n === 1, 'customer sees only own profile');
});
ok((await q(`select count(*)::int n from notifications where title like 'Unassigned%'`))[0].n === 2, 'unassigned lift complaint alerts manager + admin');

console.log('\n4. Another customer');
await as(cust2, async () => {
  ok((await q(`select count(*)::int n from complaints`))[0].n === 0, "cannot see other customers' complaints");
  ok((await q(`select count(*)::int n from complaint_updates`))[0].n === 0, "cannot see other customers' history");
  await expectError(() => q(`insert into complaint_updates (complaint_id, type, message) values ($1,'comment','hi')`, [c1.id]),
    "cannot comment on someone else's complaint");
  await expectError(() => q(`insert into storage.objects (bucket_id, name, owner) values ('complaint-photos', $1, $2)`, [`${c1.id}/x.jpg`, cust2]),
    "cannot upload photos to someone else's complaint");
});
await as(cust1, async () => {
  await q(`insert into storage.objects (bucket_id, name, owner) values ('complaint-photos', $1, $2)`, [`${c1.id}/leak.jpg`, cust1]);
  await q(`insert into complaint_attachments (complaint_id, storage_path, uploaded_by) values ($1, $2, $3)`, [c1.id, `${c1.id}/leak.jpg`, cust1]);
  ok(true, 'customer can upload photo to own complaint');
});

console.log('\n5. Staff');
await as(elec, async () => {
  ok((await q(`select count(*)::int n from complaints`))[0].n === 0, 'electrician cannot see plumbing tasks');
});
await as(plumb, async () => {
  ok((await q(`select count(*)::int n from complaints`))[0].n === 1, 'plumber sees own task');
  ok((await q(`select count(*)::int n from profiles where role='customer'`))[0].n === 0, 'staff cannot browse customer directory');
  await expectError(() => q(`update complaints set priority='low' where id=$1`, [c1.id]), 'staff cannot change priority');
  await expectError(() => q(`update complaints set due_at=now()+interval '9 days' where id=$1`, [c1.id]), 'staff cannot extend deadline');
  await expectError(() => q(`select set_complaint_status($1,'closed')`, [c1.id]), 'staff cannot close');
  await q(`select set_complaint_status($1,'in_progress','On my way')`, [c1.id]);
  await q(`insert into complaint_updates (complaint_id, type, message, is_internal) values ($1,'comment','Need new trap from store',true)`, [c1.id]);
  await q(`insert into complaint_updates (complaint_id, type, message) values ($1,'comment','Will reach by 4 pm')`, [c1.id]);
  await q(`select set_complaint_status($1,'resolved',null,'Replaced sink trap and sealed joint')`, [c1.id]);
});
let r = (await q(`select * from complaints where id=$1`, [c1.id]))[0];
ok(r.status === 'resolved' && r.started_at && r.resolved_at && r.resolution_notes, 'status flow In Progress → Resolved with timestamps & resolution');

console.log('\n6. Customer view, close, reopen');
await as(cust1, async () => {
  const tl = await q(`select type, message, is_internal from complaint_updates where complaint_id=$1 order by id`, [c1.id]);
  ok(!tl.some(x => x.is_internal), 'internal notes hidden from customer');
  ok(tl.some(x => x.message === 'Will reach by 4 pm'), 'public reply visible to customer');
  await q(`insert into complaint_updates (complaint_id, type, message, is_internal) values ($1,'comment','Thanks!',true)`, [c1.id]).catch(() => {});
  await expectError(() => q(`select customer_close_complaint($1, 9)`, [c1.id]), 'rating must be 1–5');
  await q(`select customer_close_complaint($1, 4, 'Quick work')`, [c1.id]);
});
r = (await q(`select * from complaints where id=$1`, [c1.id]))[0];
ok(r.status === 'closed' && r.customer_rating === 4 && r.closed_at, 'customer closed with rating');
await as(cust2, async () => {
  await expectError(() => q(`select customer_reopen_complaint($1,'not fixed')`, [c1.id]), "another customer cannot reopen");
});
await as(cust1, async () => { await q(`select customer_reopen_complaint($1,'Leaking again at night')`, [c1.id]); });
r = (await q(`select * from complaints where id=$1`, [c1.id]))[0];
ok(r.status === 'assigned' && r.reopen_count === 1 && !r.closed_at, 'reopened → back to Assigned, reopen count 1');
ok((await q(`select count(*)::int n from notifications where user_id=$1 and title like '%reopened%'`, [plumb]))[0].n === 1, 'assignee told about reopen');

console.log('\n7. Manager');
await as(mgr, async () => {
  ok((await q(`select count(*)::int n from complaints`))[0].n === 2, 'manager sees all complaints');
  const lift = (await q(`select id from complaints where category='lift'`))[0];
  await q(`update complaints set assigned_to=$1, priority='urgent' where id=$2`, [elec, lift.id]);
  const l = (await q(`select status, assignee_name from complaints where id=$1`, [lift.id]))[0];
  ok(l.status === 'assigned' && l.assignee_name === 'Amit (Electrician)', 'manager assigns → status Assigned');
  const rep = (await q(`select crm_report(now()-interval '30 days', now()+interval '1 day') as r`))[0].r;
  ok(rep.total === 2 && rep.by_category.length === 2 && rep.by_assignee.length === 2, 'report: totals, by category, by assignee');
  ok((await q(`update teams set name=name||'x' returning id`)).length === 0, 'manager cannot edit teams/settings (admin only)');
  // a customer added by the office on the phone
  await q(`insert into customer_flats (customer_id, flat_id, verified) values ($1,$2,true)`, [cust2, flat101]);
});
ok((await q(`select verified from customer_flats where customer_id=$1 and flat_id=$2`, [cust2, flat101]))[0].verified === true, 'manager can link & verify a flat');
await as(elec, async () => {
  ok((await q(`select count(*)::int n from complaints`))[0].n === 1, 'electrician now sees the lift task');
});
await as(plumb, async () => {
  ok((await q(`select count(*)::int n from notifications where is_read=false`))[0].n >= 2, 'staff reads own notifications');
  ok((await q(`select count(*)::int n from notifications where user_id<>$1`, [plumb]))[0].n === 0, "cannot read others' notifications");
});

console.log('\n7b. Project-wise separation');
const amaraFlat = await flat('Tower A', 'A', '101');
const cust3 = await mkUser('amit@example.com', { full_name: 'Amit Joshi', mobile: '9822000000', flat_id: amaraFlat });
const amaraMgr = await mkUser('amara.fm@co.com', { full_name: 'Amara Facility Manager' });
await q(`update profiles set role='manager', project_ids=array[(select id from projects where code='AMR')] where id=$1`, [amaraMgr]);
ok((await q(`select project_id from customer_flats where customer_id=$1`, [cust3]))[0].project_id !== null, 'customer flat link stamped with project');
await as(cust3, async () => {
  await q(`insert into complaints (flat_id, category, title, description) values ($1,'parking','Car parked in my slot','Visitor car parked in slot 14')`, [amaraFlat]);
});
await as(amaraMgr, async () => {
  const rows = await q(`select project_name from complaints`);
  ok(rows.length === 1 && rows[0].project_name === 'Mihir Amara', 'Amara manager sees only Amara complaints');
  const cust = await q(`select full_name from profiles where role='customer'`);
  ok(cust.length === 1 && cust[0].full_name === 'Amit Joshi', 'Amara manager sees only Amara customers');
  ok((await q(`update complaints set priority='low' where project_name='Sierra' returning id`)).length === 0, 'cannot touch other project complaints');
  await expectError(() => q(`insert into customer_flats (customer_id, flat_id) values ($1,$2)`, [cust2, flat101]), 'cannot link customers to another project');
});
await as(mgr, async () => {
  ok((await q(`select count(*)::int n from complaints`))[0].n === 3, 'unscoped manager sees all projects');
});

console.log('\n8. Overdue escalation');
await q(`update complaints set due_at = now() - interval '1 hour' where category='lift'`);
const n = (await q(`select notify_overdue_complaints() n`))[0].n;
ok(n === 1, 'overdue job flags 1 complaint');
ok((await q(`select notify_overdue_complaints() n`))[0].n === 0, 'does not alert twice');
ok((await q(`select count(*)::int n from notifications where title like 'OVERDUE%'`))[0].n === 3, 'assignee + Sierra-relevant managers + admin alerted (not the Amara-only manager)');
await as(cust1, async () => {
  await expectError(() => q(`select notify_overdue_complaints()`), 'customers cannot trigger the escalation job');
});

console.log('\n9. Admin');
await as(admin, async () => {
  await q(`update categories set default_assignee_id=$1 where code='lift'`, [elec]);
  await expectError(() => q(`update profiles set role='customer' where id=$1`, [admin]), 'last admin cannot demote self');
  const pr = (await q(`insert into projects (name, code) values ('Green Valley','GV') returning id`))[0];
  ok(!!pr.id, 'admin can add a project');
});
await as(cust1, async () => {
  const c = (await q(`insert into complaints (flat_id, category, title, description) values ($1,'lift','Lift noise','Lift makes grinding noise') returning *`, [flat101]))[0];
  ok(c.assigned_to === elec, 'category default assignee is used');
});

console.log('\n10. Website enquiries');
const amr = (await q(`select id from projects where code='AMR'`))[0].id;
const sra = (await q(`select id from projects where code='SRA'`))[0].id;
await as(null, async () => {
  await q(`insert into enquiries (name, phone, email, project_id, message, status, notes) values ('Visitor One','+91 98220 11111','v1@example.com',$1,'Want a 3 BHK site visit','closed','hack')`, [amr]);
  await q(`insert into enquiries (name, phone, project_id) values ('Visitor Two','9822022222',$1)`, [sra]);
  ok((await q(`select count(*)::int n from enquiries`))[0].n === 0, 'public visitors can submit but not read enquiries');
  await expectError(() => q(`insert into enquiries (name, phone) values ('X','not a phone')`), 'invalid phone rejected');
});
const e1 = (await q(`select * from enquiries where name='Visitor One'`))[0];
ok(e1.status === 'new' && e1.notes === null, 'public cannot pre-set status or internal notes');
await as(cust1, async () => {
  ok((await q(`select count(*)::int n from enquiries`))[0].n === 0, 'customers cannot read enquiries');
});
await as(amaraMgr, async () => {
  const rows = await q(`select name from enquiries`);
  ok(rows.length === 1 && rows[0].name === 'Visitor One', 'Amara manager sees only Amara enquiries');
  await q(`update enquiries set status='contacted', notes='Called, visit Sat' where id=$1`, [e1.id]);
});
const e1b = (await q(`select * from enquiries where id=$1`, [e1.id]))[0];
ok(e1b.status === 'contacted' && e1b.handled_by === amaraMgr, 'manager updates status; handler recorded');
ok((await q(`select count(*)::int n from notifications where user_id=$1 and title like 'New website enquiry%'`, [admin]))[0].n === 2, 'admin notified of both enquiries');
ok((await q(`select count(*)::int n from notifications where user_id=$1 and title like 'New website enquiry%'`, [amaraMgr]))[0].n === 1, 'Amara manager notified only for Amara');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
