-- =====================================================================
--  CareDesk CRM — Construction CRM & Customer Complaint Management
--  Database schema for Supabase (Postgres 15+)
--
--  Run this ONCE in Supabase → SQL Editor → New query → Run.
--  It creates: tables, triggers (auto complaint ID, auto-assignment,
--  SLA deadlines, history, notifications), row-level security (RLS),
--  the private photo bucket, reports, and the overdue-alert job.
-- =====================================================================

-- gen_random_uuid() is built into Postgres 13+; no extension needed.

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
create type public.user_role          as enum ('customer','staff','manager','admin');
create type public.complaint_status   as enum ('open','assigned','in_progress','resolved','closed');
create type public.complaint_priority as enum ('low','medium','high','urgent');
create type public.complaint_area     as enum ('flat','common');
create type public.complaint_kind     as enum ('complaint','query','request');

-- ---------------------------------------------------------------------
-- 2. SETTINGS
-- ---------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

insert into public.app_settings (key, value, description) values
  ('company_name',              '"Your Construction Co."', 'Shown in the app header and notifications'),
  ('support_phone',             '""',                      'Helpdesk phone shown to customers'),
  ('require_flat_verification', 'false',                   'If true, customers can raise complaints only after admin verifies their flat'),
  ('reopen_window_days',        '15',                      'Days after closure during which a customer can reopen a complaint');

-- ---------------------------------------------------------------------
-- 3. ORGANISATION: teams
-- ---------------------------------------------------------------------
create table public.teams (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  description text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4. PROPERTY MASTER: project → tower → wing → flat
-- ---------------------------------------------------------------------
create table public.projects (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  code       text not null unique,
  address    text,
  city       text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),

  -- public website content & branding (edited in Admin → Projects & flats)
  slug           text unique,
  project_type   text not null default 'residential' check (project_type in ('residential','commercial','mixed')),
  status_label   text,                       -- e.g. "Ongoing", "Coming soon"
  tagline        text,
  description    text,
  location_label text,                       -- e.g. "Wakadkar Wasti, Wakad"
  highlights     text[] not null default '{}',
  configurations text,                       -- e.g. "3 & 2 bed premium residences"
  rera_no        text,
  possession     text,
  brochure_url   text,
  contact_phone  text,
  contact_email  text,
  lat            numeric(9,6),
  lng            numeric(9,6),
  theme          text not null default 'residence',   -- showcase layout + palette preset
  color_primary  text not null default '#2f5d7c',
  color_accent   text not null default '#f0a331',
  color_dark     text not null default '#17191c',
  hero_image_url text,
  logo_url       text,
  video_url      text,                       -- mp4 link or YouTube link
  gallery        jsonb not null default '[]',  -- [{ "src": "...", "alt": "...", "caption": "..." }]
  image_credit   text,                       -- e.g. "Artist's impression. Source: mihirgroup.com"
  show_on_landing boolean not null default true,
  landing_order  int not null default 0
);

create table public.towers (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

create table public.wings (
  id         uuid primary key default gen_random_uuid(),
  tower_id   uuid not null references public.towers(id) on delete cascade,
  name       text not null,
  sort_order int  not null default 0,
  created_at timestamptz not null default now(),
  unique (tower_id, name)
);

create table public.flats (
  id          uuid primary key default gen_random_uuid(),
  wing_id     uuid not null references public.wings(id) on delete cascade,
  flat_no     text not null,
  floor       int,
  flat_type   text,             -- e.g. 2 BHK
  carpet_area numeric(10,2),    -- sq.ft
  created_at  timestamptz not null default now(),
  unique (wing_id, flat_no)
);

create index on public.towers (project_id);
create index on public.wings  (tower_id);
create index on public.flats  (wing_id);

-- ---------------------------------------------------------------------
-- 5. PEOPLE: profiles (customers + employees) and customer ↔ flat links
-- ---------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text not null,
  mobile      text,
  email       text,
  role        public.user_role not null default 'customer',
  team_id     uuid references public.teams(id) on delete set null,
  designation text,
  -- employees only: projects this person handles. Empty = all projects.
  project_ids uuid[] not null default '{}',
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.profiles (role);
create index on public.profiles (team_id);

create table public.customer_flats (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.profiles(id) on delete cascade,
  flat_id     uuid not null references public.flats(id) on delete cascade,
  project_id  uuid references public.projects(id) on delete cascade,   -- filled by trigger
  relation    text not null default 'owner' check (relation in ('owner','tenant','family')),
  is_primary  boolean not null default false,
  verified    boolean not null default false,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (customer_id, flat_id)
);
create index on public.customer_flats (flat_id);
create index on public.customer_flats (project_id);

-- ---------------------------------------------------------------------
-- 6. COMPLAINT CONFIG: categories (with auto-routing) and SLA
-- ---------------------------------------------------------------------
create table public.categories (
  code                text primary key,
  name                text not null,
  scope               text not null default 'both' check (scope in ('flat','common','both')),
  default_team_id     uuid references public.teams(id) on delete set null,
  default_assignee_id uuid references public.profiles(id) on delete set null,
  default_priority    public.complaint_priority not null default 'medium',
  sort_order          int not null default 0,
  is_active           boolean not null default true
);

create table public.sla_rules (
  priority      public.complaint_priority primary key,
  resolve_hours int not null check (resolve_hours > 0)
);
insert into public.sla_rules values ('urgent',4),('high',24),('medium',72),('low',168);

-- ---------------------------------------------------------------------
-- 7. COMPLAINTS (every complaint IS the CRM task)
-- ---------------------------------------------------------------------
create sequence public.complaint_no_seq;

create table public.complaints (
  id                  uuid primary key default gen_random_uuid(),
  complaint_no        text not null unique,
  kind                public.complaint_kind not null default 'complaint',

  customer_id         uuid not null references public.profiles(id),
  flat_id             uuid not null references public.flats(id),
  project_id          uuid references public.projects(id),
  tower_id            uuid references public.towers(id),
  wing_id             uuid references public.wings(id),

  -- snapshot at creation, so the task card keeps full details forever
  customer_name       text,
  customer_mobile     text,
  project_name        text,
  tower_name          text,
  wing_name           text,
  flat_no             text,

  category            text not null references public.categories(code),
  area                public.complaint_area not null default 'flat',
  location_detail     text,
  title               text not null check (length(title) between 3 and 150),
  description         text not null check (length(description) between 5 and 4000),

  priority            public.complaint_priority not null,   -- filled by trigger when not given
  status              public.complaint_status   not null default 'open',
  team_id             uuid references public.teams(id) on delete set null,
  assigned_to         uuid references public.profiles(id) on delete set null,
  assignee_name       text,
  assigned_at         timestamptz,
  due_at              timestamptz,
  started_at          timestamptz,
  resolved_at         timestamptz,
  closed_at           timestamptz,
  resolution_notes    text,

  customer_rating     int check (customer_rating between 1 and 5),
  customer_feedback   text,
  reopen_count        int not null default 0,
  overdue_notified_at timestamptz,

  source              text not null default 'portal' check (source in ('portal','phone','walk_in','email','whatsapp')),
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index on public.complaints (customer_id, created_at desc);
create index on public.complaints (assigned_to, status);
create index on public.complaints (team_id, status);
create index on public.complaints (status, due_at);
create index on public.complaints (project_id, created_at desc);
create index on public.complaints (created_at desc);

create table public.complaint_attachments (
  id           uuid primary key default gen_random_uuid(),
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  storage_path text not null,
  file_name    text,
  mime_type    text,
  size_bytes   int,
  kind         text not null default 'issue' check (kind in ('issue','resolution','comment')),
  uploaded_by  uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);
create index on public.complaint_attachments (complaint_id);

-- history + conversation (comments) in one timeline
create table public.complaint_updates (
  id           bigint generated always as identity primary key,
  complaint_id uuid not null references public.complaints(id) on delete cascade,
  actor_id     uuid references public.profiles(id) on delete set null,
  actor_name   text,
  type         text not null check (type in ('created','status','assigned','priority','due_date','comment','reopened','rating','overdue')),
  from_value   text,
  to_value     text,
  message      text,
  is_internal  boolean not null default false,   -- internal notes are hidden from customers
  created_at   timestamptz not null default now()
);
create index on public.complaint_updates (complaint_id, created_at);

create table public.notifications (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references public.profiles(id) on delete cascade,
  complaint_id uuid references public.complaints(id) on delete cascade,
  title        text not null,
  body         text,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index on public.notifications (user_id, is_read, created_at desc);

-- Outbox for WhatsApp / SMS / email. An n8n workflow (or any worker using the
-- service-role key) picks 'pending' rows, sends them, and marks them 'sent'.
create table public.outbound_messages (
  id           bigint generated always as identity primary key,
  channel      text not null default 'whatsapp' check (channel in ('whatsapp','sms','email')),
  to_address   text not null,
  recipient_id uuid references public.profiles(id) on delete set null,
  complaint_id uuid references public.complaints(id) on delete set null,
  message      text not null,
  status       text not null default 'pending' check (status in ('pending','sent','failed')),
  error        text,
  created_at   timestamptz not null default now(),
  sent_at      timestamptz
);
create index on public.outbound_messages (status, created_at);

-- Website enquiries (public contact form)
create table public.enquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 2 and 120),
  phone       text not null check (phone ~ '^[0-9+ ()-]{8,20}$'),
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  project_id  uuid references public.projects(id) on delete set null,
  message     text check (message is null or length(message) <= 2000),
  page        text,
  status      text not null default 'new' check (status in ('new','contacted','closed')),
  notes       text,
  handled_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index on public.enquiries (status, created_at desc);

-- ---------------------------------------------------------------------
-- 8. ROLE HELPERS (used by RLS)
-- ---------------------------------------------------------------------
create or replace function public.auth_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() = 'admin', false)
$$;

create or replace function public.is_manager() returns boolean   -- manager OR admin
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('manager','admin'), false)
$$;

create or replace function public.is_staff() returns boolean     -- any employee
language sql stable security definer set search_path = public as $$
  select coalesce(public.auth_role() in ('staff','manager','admin'), false)
$$;

create or replace function public.auth_team() returns uuid
language sql stable security definer set search_path = public as $$
  select team_id from public.profiles where id = auth.uid()
$$;

-- Project scope for employees: admins and unscoped employees see every project
create or replace function public.in_scope(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select pr.role = 'admin' or cardinality(pr.project_ids) = 0 or p_project = any(pr.project_ids)
    from public.profiles pr where pr.id = auth.uid() and pr.is_active
  ), false)
$$;

-- Is this customer linked to a flat in one of my projects?
create or replace function public.customer_in_scope(p_customer uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.customer_flats cf where cf.customer_id = p_customer and public.in_scope(cf.project_id))
      or not exists (select 1 from public.customer_flats cf where cf.customer_id = p_customer)
$$;

create or replace function public.setting(p_key text) returns jsonb
language sql stable security definer set search_path = public as $$
  select value from public.app_settings where key = p_key
$$;

create or replace function public.can_access_complaint(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.complaints c
    where c.id = p_id
      and (   c.customer_id = auth.uid()
           or (public.is_manager() and public.in_scope(c.project_id))
           or (public.is_staff() and (c.assigned_to = auth.uid()
                                      or (c.team_id is not null and c.team_id = public.auth_team()
                                          and public.in_scope(c.project_id)))))
  )
$$;

create or replace function public.complaint_id_from_path(p_path text) returns uuid
language plpgsql immutable as $$
begin
  return split_part(p_path, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create or replace function public.status_label(s public.complaint_status) returns text
language sql immutable as $$
  select case s when 'open' then 'Open' when 'assigned' then 'Assigned'
                when 'in_progress' then 'In Progress' when 'resolved' then 'Resolved'
                when 'closed' then 'Closed' end
$$;

-- ---------------------------------------------------------------------
-- 9. NOTIFICATION HELPERS
-- ---------------------------------------------------------------------
create or replace function public.notify_user(p_user uuid, p_complaint uuid, p_title text, p_body text, p_whatsapp boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare v_mobile text;
begin
  if p_user is null then return; end if;
  insert into public.notifications (user_id, complaint_id, title, body)
  values (p_user, p_complaint, p_title, p_body);
  if p_whatsapp then
    select mobile into v_mobile from public.profiles where id = p_user and is_active;
    if v_mobile is not null and length(v_mobile) >= 10 then
      insert into public.outbound_messages (channel, to_address, recipient_id, complaint_id, message)
      values ('whatsapp', v_mobile, p_user, p_complaint, p_title || E'\n' || coalesce(p_body, ''));
    end if;
  end if;
end $$;

create or replace function public.notify_managers(p_complaint uuid, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, complaint_id, title, body)
  select pr.id, p_complaint, p_title, p_body from public.profiles pr
  where pr.role in ('manager','admin') and pr.is_active
    and (pr.role = 'admin' or cardinality(pr.project_ids) = 0
         or (select project_id from public.complaints where id = p_complaint) = any(pr.project_ids));
$$;

-- ---------------------------------------------------------------------
-- 10. NEW USER → PROFILE (+ flat link from the registration form)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_flat     uuid;
  v_relation text := coalesce(nullif(new.raw_user_meta_data->>'relation',''), 'owner');
begin
  insert into public.profiles (id, full_name, mobile, email, role)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''), split_part(new.email,'@',1)),
          nullif(regexp_replace(coalesce(new.raw_user_meta_data->>'mobile',''), '[^0-9+]', '', 'g'), ''),
          new.email,
          'customer');                          -- role is NEVER taken from signup data

  begin
    v_flat := (new.raw_user_meta_data->>'flat_id')::uuid;
  exception when others then v_flat := null;
  end;
  if v_relation not in ('owner','tenant','family') then v_relation := 'owner'; end if;

  if v_flat is not null and exists (select 1 from public.flats where id = v_flat) then
    insert into public.customer_flats (customer_id, flat_id, relation, is_primary)
    values (new.id, v_flat, v_relation, true)
    on conflict do nothing;
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles: users may edit their own name/mobile only; admins edit anything.
create or replace function public.profiles_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.id := old.id;
  new.created_at := old.created_at;
  if auth.uid() is not null and not public.is_admin() then
    if new.id <> auth.uid() then raise exception 'You can only edit your own profile'; end if;
    new.role        := old.role;
    new.team_id     := old.team_id;
    new.is_active   := old.is_active;
    new.email       := old.email;
    new.designation := old.designation;
    new.project_ids := old.project_ids;
  end if;
  if old.role = 'admin' and old.is_active and (new.role <> 'admin' or not new.is_active)
     and not exists (select 1 from public.profiles where role = 'admin' and is_active and id <> old.id) then
    raise exception 'At least one active admin is required';
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_before_update
  before update on public.profiles
  for each row execute function public.profiles_before_update();

-- Customer ↔ flat links: only managers/admins can verify.
create or replace function public.customer_flats_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.project_id := (select t.project_id from public.flats f
                     join public.wings w on w.id = f.wing_id
                     join public.towers t on t.id = w.tower_id where f.id = new.flat_id);
  if auth.uid() is not null and public.is_manager() and not public.in_scope(new.project_id) then
    raise exception 'This flat belongs to a project you do not manage';
  end if;
  if auth.uid() is not null and not public.is_manager() then
    if tg_op = 'INSERT' then
      new.verified := false; new.verified_by := null; new.verified_at := null;
      new.customer_id := auth.uid();
    else
      raise exception 'Not allowed';
    end if;
  end if;
  if tg_op = 'UPDATE' and new.verified is distinct from old.verified then
    new.verified_by := case when new.verified then auth.uid() end;
    new.verified_at := case when new.verified then now() end;
  end if;
  return new;
end $$;

create trigger customer_flats_guard
  before insert or update on public.customer_flats
  for each row execute function public.customer_flats_guard();

-- ---------------------------------------------------------------------
-- 11. COMPLAINT TRIGGERS: ID, snapshot, routing, SLA, history, alerts
-- ---------------------------------------------------------------------
create or replace function public.complaints_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_role  public.user_role := public.auth_role();
  v_cat   public.categories%rowtype;
  v_cust  public.profiles%rowtype;
  v_hours int;
begin
  if v_uid is not null and (v_role is null or v_role = 'customer') then
    -- self-service by a customer: lock down every internal field
    new.customer_id := v_uid;
    new.source := 'portal';
    new.team_id := null; new.assigned_to := null; new.due_at := null;
    new.resolution_notes := null; new.customer_rating := null; new.customer_feedback := null;
    if coalesce((public.setting('require_flat_verification'))::boolean, false) then
      if not exists (select 1 from public.customer_flats
                     where customer_id = v_uid and flat_id = new.flat_id and verified) then
        raise exception 'Your flat is awaiting verification by the office. Please try again after verification.';
      end if;
    end if;
  end if;

  if new.customer_id is null then raise exception 'Customer is required'; end if;
  if not exists (select 1 from public.customer_flats where customer_id = new.customer_id and flat_id = new.flat_id) then
    raise exception 'This flat is not linked to the customer';
  end if;

  new.id           := coalesce(new.id, gen_random_uuid());
  new.complaint_no := 'CMP-' || to_char(now() at time zone 'Asia/Kolkata', 'YYMM') || '-'
                      || lpad(nextval('public.complaint_no_seq')::text, 5, '0');
  new.status       := 'open';
  new.created_by   := coalesce(v_uid, new.created_by);
  new.created_at   := now();
  new.updated_at   := now();
  new.reopen_count := 0;
  new.started_at := null; new.resolved_at := null; new.closed_at := null; new.overdue_notified_at := null;

  -- snapshot customer + location
  select * into v_cust from public.profiles where id = new.customer_id;
  new.customer_name   := v_cust.full_name;
  new.customer_mobile := v_cust.mobile;

  select f.flat_no, w.id, w.name, t.id, t.name, p.id, p.name
    into new.flat_no, new.wing_id, new.wing_name, new.tower_id, new.tower_name, new.project_id, new.project_name
  from public.flats f
  join public.wings w    on w.id = f.wing_id
  join public.towers t   on t.id = w.tower_id
  join public.projects p on p.id = t.project_id
  where f.id = new.flat_id;

  -- category routing
  select * into v_cat from public.categories where code = new.category and is_active;
  if not found then raise exception 'Please choose a valid category'; end if;
  if v_cat.scope <> 'both' then new.area := v_cat.scope::public.complaint_area; end if;
  new.priority := coalesce(new.priority, v_cat.default_priority, 'medium');
  new.team_id  := coalesce(new.team_id, v_cat.default_team_id);

  if new.assigned_to is null then
    new.assigned_to := v_cat.default_assignee_id;
  end if;
  if new.assigned_to is not null and not exists (
       select 1 from public.profiles where id = new.assigned_to and is_active and role <> 'customer') then
    new.assigned_to := null;
  end if;
  -- no fixed person: give it to the least-loaded active member of the team
  if new.assigned_to is null and new.team_id is not null then
    select p.id into new.assigned_to
    from public.profiles p
    where p.team_id = new.team_id and p.is_active and p.role in ('staff','manager')
      and (cardinality(p.project_ids) = 0 or new.project_id = any(p.project_ids))
    order by cardinality(p.project_ids) = 0,          -- prefer people dedicated to this project
             (select count(*) from public.complaints c
              where c.assigned_to = p.id and c.status in ('assigned','in_progress')), p.created_at
    limit 1;
  end if;

  if new.assigned_to is not null then
    select full_name into new.assignee_name from public.profiles where id = new.assigned_to;
    new.assigned_at := now();
    new.status := 'assigned';
  else
    new.assignee_name := null;
    new.assigned_at := null;
  end if;

  if new.due_at is null then
    select resolve_hours into v_hours from public.sla_rules where priority = new.priority;
    new.due_at := now() + make_interval(hours => coalesce(v_hours, 72));
  end if;
  return new;
end $$;

create trigger complaints_before_insert
  before insert on public.complaints
  for each row execute function public.complaints_before_insert();

create or replace function public.complaints_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_where text := new.project_name || ', ' || new.tower_name || ' / ' || new.wing_name || ' – ' || new.flat_no;
  v_actor text := (select full_name from public.profiles where id = new.created_by);
begin
  insert into public.complaint_updates (complaint_id, actor_id, actor_name, type, to_value, message)
  values (new.id, new.created_by, v_actor, 'created', 'open',
          'Complaint registered' || case when new.source <> 'portal' then ' (via ' || replace(new.source,'_',' ') || ')' else '' end);

  if new.assigned_to is not null then
    insert into public.complaint_updates (complaint_id, actor_id, actor_name, type, from_value, to_value, message)
    values (new.id, null, 'System', 'assigned', null, new.assigned_to::text, 'Auto-assigned to ' || new.assignee_name);
    perform public.notify_user(new.assigned_to, new.id,
      'New task ' || new.complaint_no || ' (' || initcap(new.priority::text) || ')',
      new.title || ' — ' || v_where || '. Due ' || to_char(new.due_at at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM'), true);
  else
    perform public.notify_managers(new.id, 'Unassigned complaint ' || new.complaint_no, new.title || ' — ' || v_where);
  end if;

  perform public.notify_user(new.customer_id, new.id,
    'Complaint ' || new.complaint_no || ' registered',
    'We have received your complaint "' || new.title || '". Target resolution: '
      || to_char(new.due_at at time zone 'Asia/Kolkata', 'DD Mon YYYY, HH12:MI AM') || '.', true);
  return null;
end $$;

create trigger complaints_after_insert
  after insert on public.complaints
  for each row execute function public.complaints_after_insert();

-- Guard updates by role and keep timestamps consistent
create or replace function public.complaints_before_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_role   public.user_role := public.auth_role();
  v_cust_action boolean := coalesce(current_setting('app.customer_action', true), '') = 'on';
begin
  -- never editable
  new.id := old.id; new.complaint_no := old.complaint_no; new.created_at := old.created_at;
  new.created_by := old.created_by; new.customer_id := old.customer_id; new.flat_id := old.flat_id;
  new.project_id := old.project_id; new.tower_id := old.tower_id; new.wing_id := old.wing_id;
  new.customer_name := old.customer_name; new.customer_mobile := old.customer_mobile;
  new.project_name := old.project_name; new.tower_name := old.tower_name;
  new.wing_name := old.wing_name; new.flat_no := old.flat_no; new.source := old.source;

  if v_uid is not null and not v_cust_action then
    if v_role is null or v_role = 'customer' then
      raise exception 'Not allowed';
    end if;
    -- rating/feedback come only from the customer
    new.customer_rating := old.customer_rating;
    new.customer_feedback := old.customer_feedback;
    if v_role = 'staff' then
      if new.assigned_to is distinct from old.assigned_to or new.team_id is distinct from old.team_id
         or new.due_at is distinct from old.due_at or new.priority is distinct from old.priority
         or new.category is distinct from old.category or new.title is distinct from old.title
         or new.description is distinct from old.description or new.area is distinct from old.area
         or new.kind is distinct from old.kind then
        raise exception 'Only a manager can change assignment, priority, category or deadline';
      end if;
      if new.status = 'closed' and old.status <> 'closed' then
        raise exception 'Only a manager or the customer can close a complaint';
      end if;
    end if;
  end if;

  -- assignment bookkeeping
  if new.assigned_to is distinct from old.assigned_to then
    if new.assigned_to is not null then
      if not exists (select 1 from public.profiles where id = new.assigned_to and is_active and role <> 'customer') then
        raise exception 'Assignee must be an active employee';
      end if;
      select full_name into new.assignee_name from public.profiles where id = new.assigned_to;
      new.assigned_at := now();
      if new.status = 'open' then new.status := 'assigned'; end if;
    else
      new.assignee_name := null;
      new.assigned_at := null;
      if new.status = 'assigned' then new.status := 'open'; end if;
    end if;
  end if;
  if new.status = 'assigned' and new.assigned_to is null then
    raise exception 'Choose an employee before setting status to Assigned';
  end if;
  if new.status in ('in_progress','resolved') and new.assigned_to is null then
    raise exception 'Assign the complaint to an employee first';
  end if;

  -- status timestamps
  if new.status is distinct from old.status then
    if new.status = 'in_progress' and new.started_at is null then new.started_at := now(); end if;
    if new.status = 'resolved' then new.resolved_at := now(); new.closed_at := null; end if;
    if new.status = 'closed' then
      new.closed_at := now();
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    if new.status in ('open','assigned','in_progress') and old.status in ('resolved','closed') then
      new.resolved_at := null;
      new.closed_at := null;
      new.reopen_count := old.reopen_count + 1;
      new.overdue_notified_at := null;
    end if;
  end if;
  if new.due_at is distinct from old.due_at then new.overdue_notified_at := null; end if;

  new.updated_at := now();
  return new;
end $$;

create trigger complaints_before_update
  before update on public.complaints
  for each row execute function public.complaints_before_update();

create or replace function public.complaints_after_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_actor text := coalesce((select full_name from public.profiles where id = auth.uid()), 'System');
  v_note  text := nullif(current_setting('app.status_note', true), '');
  v_body  text;
begin
  if new.status is distinct from old.status then
    insert into public.complaint_updates (complaint_id, actor_id, actor_name, type, from_value, to_value, message)
    values (new.id, v_uid, v_actor, 'status', old.status::text, new.status::text, v_note);

    v_body := case new.status
      when 'assigned'    then 'Your complaint has been assigned to ' || coalesce(new.assignee_name, 'our maintenance team') || '.'
      when 'in_progress' then 'Work has started on your complaint.'
      when 'resolved'    then 'Your complaint has been marked resolved. Please confirm and rate, or reopen it if the issue persists.'
      when 'closed'      then 'Your complaint is now closed. Thank you for your patience.'
      when 'open'        then 'Your complaint has been reopened.'
    end;
    if new.status = 'resolved' and new.resolution_notes is not null then
      v_body := v_body || ' Resolution: ' || new.resolution_notes;
    end if;
    if v_uid is distinct from new.customer_id then
      perform public.notify_user(new.customer_id, new.id,
        new.complaint_no || ': ' || public.status_label(new.status), v_body, true);
    end if;
    -- tell the assignee when the customer closes or reopens
    if v_uid = new.customer_id and new.assigned_to is not null then
      perform public.notify_user(new.assigned_to, new.id,
        new.complaint_no || ' ' || case when new.status = 'closed' then 'closed by customer' else 'reopened by customer' end,
        new.title, new.status <> 'closed');
    end if;
  end if;

  if new.assigned_to is distinct from old.assigned_to then
    insert into public.complaint_updates (complaint_id, actor_id, actor_name, type, from_value, to_value, message)
    values (new.id, v_uid, v_actor, 'assigned', old.assignee_name, new.assignee_name,
            case when new.assigned_to is null then 'Unassigned' else 'Assigned to ' || new.assignee_name end);
    if new.assigned_to is not null and new.assigned_to is distinct from v_uid then
      perform public.notify_user(new.assigned_to, new.id,
        'Task assigned: ' || new.complaint_no || ' (' || initcap(new.priority::text) || ')',
        new.title || ' — ' || new.project_name || ', ' || new.wing_name || '-' || new.flat_no
          || '. Due ' || to_char(new.due_at at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM'), true);
    end if;
  end if;

  if new.priority is distinct from old.priority then
    insert into public.complaint_updates (complaint_id, actor_id, actor_name, type, from_value, to_value)
    values (new.id, v_uid, v_actor, 'priority', old.priority::text, new.priority::text);
  end if;

  if new.due_at is distinct from old.due_at and old.due_at is not null then
    insert into public.complaint_updates (complaint_id, actor_id, actor_name, type, from_value, to_value)
    values (new.id, v_uid, v_actor, 'due_date', old.due_at::text, new.due_at::text);
  end if;
  return null;
end $$;

create trigger complaints_after_update
  after update on public.complaints
  for each row execute function public.complaints_after_update();

-- Comments: stamp the author and notify the other side
create or replace function public.complaint_updates_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    if new.type = 'comment' then
      new.actor_id := auth.uid();
      new.actor_name := (select full_name from public.profiles where id = auth.uid());
      if not public.is_staff() then new.is_internal := false; end if;
    elsif new.actor_id is null and new.actor_name is null then
      new.actor_id := auth.uid();
      new.actor_name := (select full_name from public.profiles where id = auth.uid());
    end if;
  end if;
  new.created_at := now();
  return new;
end $$;

create trigger complaint_updates_before_insert
  before insert on public.complaint_updates
  for each row execute function public.complaint_updates_before_insert();

create or replace function public.complaint_comment_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare c public.complaints%rowtype;
begin
  if new.type <> 'comment' then return null; end if;
  select * into c from public.complaints where id = new.complaint_id;
  if new.actor_id = c.customer_id then
    if c.assigned_to is not null then
      perform public.notify_user(c.assigned_to, c.id, 'Customer replied on ' || c.complaint_no, left(new.message, 200), true);
    else
      perform public.notify_managers(c.id, 'Customer replied on ' || c.complaint_no, left(new.message, 200));
    end if;
  elsif not new.is_internal then
    perform public.notify_user(c.customer_id, c.id, 'Update on ' || c.complaint_no, left(new.message, 200), true);
  end if;
  return null;
end $$;

create trigger complaint_comment_notify
  after insert on public.complaint_updates
  for each row execute function public.complaint_comment_notify();

-- Enquiries: public can only create 'new' ones; managers are notified
create or replace function public.enquiries_guard() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if not public.is_manager() then
      new.status := 'new'; new.notes := null; new.handled_by := null;
    end if;
    new.created_at := now();
  else
    new.id := old.id; new.created_at := old.created_at;
    new.name := old.name; new.phone := old.phone; new.email := old.email; new.message := old.message;
    if new.status is distinct from old.status then new.handled_by := auth.uid(); end if;
  end if;
  new.updated_at := now();
  return new;
end $$;

create trigger enquiries_guard
  before insert or update on public.enquiries
  for each row execute function public.enquiries_guard();

create or replace function public.enquiries_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_proj text := (select name from public.projects where id = new.project_id);
begin
  insert into public.notifications (user_id, title, body)
  select pr.id, 'New website enquiry' || coalesce(' — ' || v_proj, ''),
         new.name || ' · ' || new.phone || coalesce(' · ' || left(new.message, 120), '')
  from public.profiles pr
  where pr.role in ('manager','admin') and pr.is_active
    and (pr.role = 'admin' or cardinality(pr.project_ids) = 0 or new.project_id is null or new.project_id = any(pr.project_ids));
  return null;
end $$;

create trigger enquiries_notify
  after insert on public.enquiries
  for each row execute function public.enquiries_notify();

-- ---------------------------------------------------------------------
-- 12. CUSTOMER ACTIONS (the only way a customer changes a complaint)
-- ---------------------------------------------------------------------
create or replace function public.customer_close_complaint(p_complaint uuid, p_rating int default null, p_feedback text default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.complaints%rowtype;
begin
  select * into c from public.complaints where id = p_complaint and customer_id = auth.uid();
  if not found then raise exception 'Complaint not found'; end if;
  if c.status <> 'resolved' then raise exception 'Only a resolved complaint can be closed'; end if;
  if p_rating is not null and (p_rating < 1 or p_rating > 5) then raise exception 'Rating must be 1 to 5'; end if;

  perform set_config('app.customer_action', 'on', true);
  update public.complaints
     set status = 'closed', customer_rating = p_rating, customer_feedback = nullif(trim(p_feedback), '')
   where id = p_complaint;
  perform set_config('app.customer_action', 'off', true);

  if p_rating is not null then
    insert into public.complaint_updates (complaint_id, type, to_value, message)
    values (p_complaint, 'rating', p_rating::text, nullif(trim(p_feedback), ''));
  end if;
end $$;

create or replace function public.customer_reopen_complaint(p_complaint uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare
  c public.complaints%rowtype;
  v_days int := coalesce((public.setting('reopen_window_days'))::int, 15);
  v_hours int;
begin
  select * into c from public.complaints where id = p_complaint and customer_id = auth.uid();
  if not found then raise exception 'Complaint not found'; end if;
  if c.status not in ('resolved','closed') then raise exception 'Only a resolved or closed complaint can be reopened'; end if;
  if c.status = 'closed' and c.closed_at < now() - make_interval(days => v_days) then
    raise exception 'This complaint was closed more than % days ago. Please raise a new complaint.', v_days;
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'Please tell us why you are reopening'; end if;

  select resolve_hours into v_hours from public.sla_rules where priority = c.priority;
  perform set_config('app.customer_action', 'on', true);
  perform set_config('app.status_note', 'Reopened by customer', true);
  update public.complaints
     set status = case when assigned_to is null then 'open' else 'assigned' end::public.complaint_status,
         due_at = now() + make_interval(hours => coalesce(v_hours, 72))
   where id = p_complaint;
  perform set_config('app.customer_action', 'off', true);
  perform set_config('app.status_note', '', true);

  insert into public.complaint_updates (complaint_id, type, message)
  values (p_complaint, 'reopened', trim(p_reason));
end $$;

-- Staff/manager status change with an optional note in one call
create or replace function public.set_complaint_status(p_complaint uuid, p_status public.complaint_status, p_note text default null, p_resolution text default null)
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Not allowed'; end if;
  perform set_config('app.status_note', coalesce(p_note, ''), true);
  update public.complaints
     set status = p_status,
         resolution_notes = case when p_status = 'resolved' then coalesce(nullif(trim(p_resolution), ''), resolution_notes)
                                 else resolution_notes end
   where id = p_complaint;
  if not found then raise exception 'Complaint not found or not accessible'; end if;
  perform set_config('app.status_note', '', true);
end $$;

-- ---------------------------------------------------------------------
-- 13. OVERDUE ALERTS (scheduled every 15 minutes, see bottom)
-- ---------------------------------------------------------------------
create or replace function public.notify_overdue_complaints() returns int
language plpgsql security definer set search_path = public as $$
declare r record; n int := 0;
begin
  for r in
    select * from public.complaints
    where status in ('open','assigned','in_progress') and due_at < now() and overdue_notified_at is null
    for update skip locked
  loop
    if r.assigned_to is not null then
      perform public.notify_user(r.assigned_to, r.id, 'OVERDUE: ' || r.complaint_no,
        r.title || ' — ' || r.project_name || ', ' || r.wing_name || '-' || r.flat_no || ' was due '
        || to_char(r.due_at at time zone 'Asia/Kolkata', 'DD Mon, HH12:MI AM'), true);
    end if;
    perform public.notify_managers(r.id, 'OVERDUE: ' || r.complaint_no,
      r.title || ' — ' || coalesce(r.assignee_name, 'Unassigned'));
    update public.complaints set overdue_notified_at = now() where id = r.id;
    insert into public.complaint_updates (complaint_id, actor_name, type, message, is_internal)
    values (r.id, 'System', 'overdue', 'Deadline missed — escalated to managers', true);
    n := n + 1;
  end loop;
  return n;
end $$;

-- ---------------------------------------------------------------------
-- 14. REPORTS
-- ---------------------------------------------------------------------
create or replace function public.crm_report(p_from timestamptz, p_to timestamptz, p_project uuid default null)
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v jsonb;
begin
  if not public.is_manager() then raise exception 'Reports are available to managers and admins'; end if;
  with c as (
    select * from public.complaints
    where created_at >= p_from and created_at < p_to
      and (p_project is null or project_id = p_project)
  )
  select jsonb_build_object(
    'total',      (select count(*) from c),
    'open_now',   (select count(*) from c where status in ('open','assigned','in_progress')),
    'overdue',    (select count(*) from c where status in ('open','assigned','in_progress') and due_at < now()),
    'by_status',  (select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
                   from (select status, count(*) n from c group by status) s),
    'by_priority',(select coalesce(jsonb_object_agg(priority, n), '{}'::jsonb)
                   from (select priority, count(*) n from c group by priority) s),
    'avg_resolution_hours', (select round((avg(extract(epoch from resolved_at - created_at)) / 3600)::numeric, 1)
                             from c where resolved_at is not null),
    'within_sla_pct', (select round(100.0 * count(*) filter (where resolved_at <= due_at) / nullif(count(*), 0), 1)
                       from c where resolved_at is not null),
    'avg_rating', (select round(avg(customer_rating)::numeric, 2) from c where customer_rating is not null),
    'reopened',   (select count(*) from c where reopen_count > 0),
    'by_category',(select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc), '[]'::jsonb) from (
                     select c.category as code, coalesce(cat.name, c.category) as name, count(*) as total,
                            count(*) filter (where c.status in ('resolved','closed')) as resolved,
                            count(*) filter (where c.status in ('open','assigned','in_progress') and c.due_at < now()) as overdue
                     from c left join public.categories cat on cat.code = c.category
                     group by c.category, cat.name) x),
    'by_project', (select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc), '[]'::jsonb) from (
                     select project_id, project_name as name, count(*) as total,
                            count(*) filter (where status in ('resolved','closed')) as resolved,
                            count(*) filter (where status in ('open','assigned','in_progress') and due_at < now()) as overdue
                     from c group by project_id, project_name) x),
    'by_assignee',(select coalesce(jsonb_agg(to_jsonb(x) order by x.total desc), '[]'::jsonb) from (
                     select assigned_to, coalesce(assignee_name, 'Unassigned') as name, count(*) as total,
                            count(*) filter (where status in ('resolved','closed')) as resolved,
                            count(*) filter (where status in ('open','assigned','in_progress') and due_at < now()) as overdue,
                            round((avg(extract(epoch from resolved_at - created_at)) / 3600)::numeric, 1) as avg_hours,
                            round(avg(customer_rating)::numeric, 1) as rating
                     from c group by assigned_to, assignee_name) x),
    'daily',      (select coalesce(jsonb_agg(to_jsonb(x) order by x.day), '[]'::jsonb) from (
                     select (created_at at time zone 'Asia/Kolkata')::date as day, count(*) as total,
                            count(*) filter (where status in ('resolved','closed')) as resolved
                     from c group by 1) x)
  ) into v;
  return v;
end $$;

-- ---------------------------------------------------------------------
-- 15. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
alter table public.app_settings          enable row level security;
alter table public.teams                 enable row level security;
alter table public.projects              enable row level security;
alter table public.towers                enable row level security;
alter table public.wings                 enable row level security;
alter table public.flats                 enable row level security;
alter table public.profiles              enable row level security;
alter table public.customer_flats        enable row level security;
alter table public.categories            enable row level security;
alter table public.sla_rules             enable row level security;
alter table public.complaints            enable row level security;
alter table public.complaint_attachments enable row level security;
alter table public.complaint_updates     enable row level security;
alter table public.notifications         enable row level security;
alter table public.outbound_messages     enable row level security;
alter table public.enquiries             enable row level security;

-- settings: anyone can read (branding); admins write
create policy settings_read  on public.app_settings for select using (true);
create policy settings_write on public.app_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- property master: public read (needed on the registration page); admins write
create policy projects_read  on public.projects for select using (is_active or public.is_staff());
create policy projects_write on public.projects for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy towers_read    on public.towers for select using (true);
create policy towers_write   on public.towers for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy wings_read     on public.wings for select using (true);
create policy wings_write    on public.wings for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy flats_read     on public.flats for select using (true);
create policy flats_write    on public.flats for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- config
create policy teams_read      on public.teams for select to authenticated using (true);
create policy teams_write     on public.teams for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy categories_read on public.categories for select to authenticated using (true);
create policy categories_write on public.categories for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy sla_read        on public.sla_rules for select to authenticated using (true);
create policy sla_write       on public.sla_rules for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: self; employees can see employees; managers/admins see everyone
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid()
         or (public.is_staff() and role <> 'customer')
         or (public.is_manager() and role = 'customer' and public.customer_in_scope(id)));
create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_update_admin on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- customer ↔ flats
create policy cf_select on public.customer_flats for select to authenticated
  using (customer_id = auth.uid() or (public.is_manager() and public.in_scope(project_id)));
create policy cf_insert on public.customer_flats for insert to authenticated
  with check (customer_id = auth.uid() or (public.is_manager() and public.in_scope(project_id)));
create policy cf_update on public.customer_flats for update to authenticated
  using (public.is_manager() and public.in_scope(project_id)) with check (public.is_manager() and public.in_scope(project_id));
create policy cf_delete on public.customer_flats for delete to authenticated
  using ((public.is_manager() and public.in_scope(project_id)) or (customer_id = auth.uid() and not verified));

-- complaints: customers see only their own; employees only within their projects
create policy complaints_select on public.complaints for select to authenticated
  using (   customer_id = auth.uid()
         or (public.is_manager() and public.in_scope(project_id))
         or (public.is_staff() and (assigned_to = auth.uid()
                                    or (team_id is not null and team_id = public.auth_team() and public.in_scope(project_id)))));
create policy complaints_insert on public.complaints for insert to authenticated
  with check (customer_id = auth.uid() or (public.is_manager() and public.in_scope(project_id)));
create policy complaints_update on public.complaints for update to authenticated
  using ((public.is_manager() and public.in_scope(project_id))
         or (public.is_staff() and (assigned_to = auth.uid()
                                    or (team_id is not null and team_id = public.auth_team() and public.in_scope(project_id)))))
  with check (public.is_staff());
create policy complaints_delete on public.complaints for delete to authenticated
  using (public.is_admin());

-- attachments
create policy att_select on public.complaint_attachments for select to authenticated
  using (public.can_access_complaint(complaint_id));
create policy att_insert on public.complaint_attachments for insert to authenticated
  with check (uploaded_by = auth.uid() and public.can_access_complaint(complaint_id));
create policy att_delete on public.complaint_attachments for delete to authenticated
  using (public.is_admin() or uploaded_by = auth.uid());

-- timeline: internal notes hidden from customers; only comments can be inserted by users
create policy upd_select on public.complaint_updates for select to authenticated
  using (public.can_access_complaint(complaint_id) and (not is_internal or public.is_staff()));
create policy upd_insert on public.complaint_updates for insert to authenticated
  with check (type = 'comment' and length(coalesce(message, '')) between 1 and 2000
              and public.can_access_complaint(complaint_id)
              and (not is_internal or public.is_staff()));

-- notifications: own only
create policy notif_select on public.notifications for select to authenticated using (user_id = auth.uid());
create policy notif_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notif_delete on public.notifications for delete to authenticated using (user_id = auth.uid());

-- enquiries: anyone can submit; managers of that project (or all) can read and update
create policy enq_insert on public.enquiries for insert to anon, authenticated
  with check (status = 'new' or public.is_manager());
create policy enq_select on public.enquiries for select to authenticated
  using (public.is_manager() and (project_id is null or public.in_scope(project_id)));
create policy enq_update on public.enquiries for update to authenticated
  using (public.is_manager() and (project_id is null or public.in_scope(project_id)))
  with check (public.is_manager());
create policy enq_delete on public.enquiries for delete to authenticated using (public.is_admin());

-- outbox: admins can view; workers use the service-role key
create policy outbox_admin on public.outbound_messages for select to authenticated using (public.is_admin());

-- Functions that must not be called directly by app users
revoke execute on function public.notify_overdue_complaints() from public, anon, authenticated;
revoke execute on function public.notify_user(uuid, uuid, text, text, boolean) from public, anon, authenticated;
revoke execute on function public.notify_managers(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 16. STORAGE: private bucket for complaint photos  (path: <complaint_id>/<file>)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('complaint-photos', 'complaint-photos', false, 5242880,
        array['image/jpeg','image/png','image/webp','image/heic','image/heif'])
on conflict (id) do nothing;

create policy "complaint photos: read" on storage.objects for select to authenticated
  using (bucket_id = 'complaint-photos'
         and public.can_access_complaint(public.complaint_id_from_path(name)));
create policy "complaint photos: upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'complaint-photos'
              and public.can_access_complaint(public.complaint_id_from_path(name)));
create policy "complaint photos: delete" on storage.objects for delete to authenticated
  using (bucket_id = 'complaint-photos' and (public.is_admin() or owner = auth.uid()));

-- Public bucket for project marketing media (hero photos, renders, walkthrough videos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-media', 'project-media', true, 52428800,
        array['image/jpeg','image/png','image/webp','image/svg+xml','video/mp4','video/webm','application/pdf'])
on conflict (id) do nothing;

create policy "project media: public read" on storage.objects for select
  using (bucket_id = 'project-media');
create policy "project media: admin upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'project-media' and public.is_admin());
create policy "project media: admin update" on storage.objects for update to authenticated
  using (bucket_id = 'project-media' and public.is_admin());
create policy "project media: admin delete" on storage.objects for delete to authenticated
  using (bucket_id = 'project-media' and public.is_admin());

-- ---------------------------------------------------------------------
-- 17. REALTIME (live notification badge) + SCHEDULED OVERDUE CHECK
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
exception when others then
  raise notice 'Realtime not configured: %', sqlerrm;
end $$;

do $outer$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('caredesk-overdue-check', '*/15 * * * *',
                          'select public.notify_overdue_complaints()');
  else
    raise notice 'pg_cron not available — enable it under Database → Extensions, then run: select cron.schedule(''caredesk-overdue-check'', ''*/15 * * * *'', ''select public.notify_overdue_complaints()'');';
  end if;
exception when others then
  raise notice 'Could not schedule overdue check automatically: %', sqlerrm;
end $outer$;
