-- =====================================================================
--  CareDesk CRM — starter data for Mihir Group
--  Run AFTER schema.sql.
--
--  Project facts below come from mihirgroup.com and public listings
--  (Oct 2026). TOWER / WING / FLAT LAYOUTS ARE SAMPLE LAYOUTS so that
--  registration works on day one — correct them in Admin → Projects & flats
--  (add/rename towers, wings, and use "Generate flats") before go-live.
-- =====================================================================

-- ---------------- Group branding (landing page) ----------------
update public.app_settings set value = '"Mihir Group"' where key = 'company_name';
insert into public.app_settings (key, value, description) values
  ('landing', $json${
     "headline": "Building Spaces. Creating Legacies.",
     "intro": "For over two decades, Mihir Group has delivered premium residential and commercial landmarks at prime locations across Pune.",
     "logo_url": "https://mihirgroup.com/images/logo01.png",
     "hero_image_url": "https://mihirgroup.com/images/sliderAmara/amara-img.jpg",
     "hero_caption": "Mihir Amara, Wakad — artist's impression",
     "film_url": "https://mihirgroup.com/images/video.mp4",
     "about_heading": "Crafting premium living spaces at prime Pune addresses",
     "about_text": "Mihir Group is a niche developer known for reliability — a group of craftsmen focused on upgrading premium living spaces. Our vision: crafting top-most luxury spaces that elevate lives.",
     "stats": [
       {"value": "22+", "label": "Years in Pune real estate"},
       {"value": "21+", "label": "Landmark creations"},
       {"value": "10 lakh+", "label": "Sq ft constructed"}
     ],
     "values": ["Quality", "Integrity", "Trust & reliability"],
     "associations": ["CREDAI Pune", "JITO Pune"],
     "completed": [
       {"name": "Mihir Classic 1", "place": "Baner"}, {"name": "Mihir Classic 2", "place": "Baner"},
       {"name": "Mihir Terraces", "place": ""}, {"name": "Cello Mihir Leon Orbit", "place": ""},
       {"name": "Friends Nook", "place": "Sakalnagar"}, {"name": "Indra Memories", "place": "Sakalnagar"},
       {"name": "Ashok", "place": "Aundh"}, {"name": "Amit Apartment", "place": "Aundh"},
       {"name": "Punit", "place": "Aundh"}, {"name": "Vibha", "place": "Aundh"},
       {"name": "Asha", "place": ""}, {"name": "Medha", "place": ""}, {"name": "Meghana", "place": ""}
     ],
     "contact_phone": "+91 98999 56284",
     "contact_email": "info@mihirgroup.com",
     "address": "1, Amogh Apartments, Lane No. 15, Prabhat Road, Pune 411004",
     "office_lat": 18.5151, "office_lng": 73.8304,
     "instagram": "https://instagram.com/mihirgroup",
     "facebook": "https://m.facebook.com/MihirGroupPune",
     "source_note": "Project images are official renders and photographs published on mihirgroup.com."
   }$json$::jsonb, 'Content of the public landing page (headline, facts, contact)')
on conflict (key) do update set value = excluded.value;

-- ---------------- Teams & categories ----------------
insert into public.teams (name, description) values
  ('Civil',               'Cracks, seepage, tiles, doors, windows, painting'),
  ('Plumbing & Water',    'Leakages, drainage, water supply, tanks, pumps'),
  ('Electrical',          'Wiring, switches, DB/MCB, common lighting, DG'),
  ('Lift Maintenance',    'Lift breakdowns and AMC coordination'),
  ('Security',            'Guards, gates, CCTV, visitor management'),
  ('Housekeeping',        'Cleaning, garbage, common area upkeep'),
  ('Facility Management', 'Parking, amenities, clubhouse, general maintenance')
on conflict (name) do nothing;

insert into public.categories (code, name, scope, default_team_id, default_priority, sort_order) values
  ('flat_civil',      'Flat – Civil / Seepage / Cracks',    'flat',   (select id from public.teams where name = 'Civil'),               'medium', 10),
  ('flat_plumbing',   'Flat – Plumbing / Leakage',          'flat',   (select id from public.teams where name = 'Plumbing & Water'),    'high',   20),
  ('flat_electrical', 'Flat – Electrical',                  'flat',   (select id from public.teams where name = 'Electrical'),          'high',   30),
  ('water_supply',    'Water Supply',                       'both',   (select id from public.teams where name = 'Plumbing & Water'),    'high',   40),
  ('lift',            'Lifts',                              'common', (select id from public.teams where name = 'Lift Maintenance'),    'high',   50),
  ('common_area',     'Common Areas (lobby, staircase, terrace)', 'common', (select id from public.teams where name = 'Housekeeping'), 'medium', 60),
  ('parking',         'Parking',                            'common', (select id from public.teams where name = 'Facility Management'), 'medium', 70),
  ('security',        'Security',                           'common', (select id from public.teams where name = 'Security'),            'high',   80),
  ('amenities',       'Amenities (gym, pool, clubhouse, garden)', 'common', (select id from public.teams where name = 'Facility Management'), 'low', 90),
  ('maintenance',     'General Maintenance',                'both',   (select id from public.teams where name = 'Facility Management'), 'medium', 100),
  ('housekeeping',    'Housekeeping / Garbage',             'common', (select id from public.teams where name = 'Housekeeping'),        'medium', 110),
  ('other',           'Other / General Query',              'both',   null,                                                             'low',    120)
on conflict (code) do nothing;

-- ---------------- Projects (facts as published on mihirgroup.com) ----------------
insert into public.projects
  (name, code, slug, city, address, location_label, project_type, status_label, tagline, description,
   configurations, highlights, rera_no, brochure_url, contact_phone, contact_email, lat, lng,
   theme, color_primary, color_accent, color_dark, hero_image_url, logo_url, gallery, image_credit, landing_order)
values
  ('Mihir Amara', 'AMR', 'mihir-amara', 'Pune',
   'HQW2+9MR, Wakadkar Wasti, Wakad, Pimpri-Chinchwad, Maharashtra 411057', 'Wakad · Balewadi Annexe',
   'residential', 'Ongoing',
   '3 and 2 bed premium residences',
   'Six new-build towers on a handcrafted development in Wakad, with more than 60% open space, three-side-open residences and 50+ lifestyle amenities. An IGBC pre-certified project.',
   '3 & 2 bed premium residences',
   array['6 new-build towers', '4 acres* of handcrafted development', 'More than 60% open space', '3-side open residences', '50+ lifestyle amenities', 'IGBC pre-certified project'],
   null, null, '+91 98999 56284', 'info@mihirgroup.com', 18.5959, 73.7509,
   'residence', '#2f5d7c', '#f0a331', '#17191c',
   'https://mihirgroup.com/images/sliderAmara/amara-img.jpg', 'https://mihirgroup.com/images/sliderAmara/codename-logo.png',
   $json$[
     {"src": "https://mihirgroup.com/images/sliderAmara/amara-img1.jpg", "alt": "Mihir Amara — render 1"},
     {"src": "https://mihirgroup.com/images/sliderAmara/amara-img2.jpg", "alt": "Mihir Amara — render 2"},
     {"src": "https://mihirgroup.com/images/sliderAmara/amara-img3.jpg", "alt": "Mihir Amara — render 3"},
     {"src": "https://mihirgroup.com/images/sliderAmara/amara-img4.jpg", "alt": "Mihir Amara — render 4"},
     {"src": "https://mihirgroup.com/images/sliderAmara/amara-img5.jpg", "alt": "Mihir Amara — render 5"},
     {"src": "https://mihirgroup.com/images/amara01.jpg", "alt": "Mihir Amara"},
     {"src": "https://mihirgroup.com/images/sliderAmara/3d/01-big.jpg", "alt": "Mihir Amara — cut-section view 1", "caption": "Cut-section view"},
     {"src": "https://mihirgroup.com/images/sliderAmara/3d/02-big.jpg", "alt": "Mihir Amara — cut-section view 2", "caption": "Cut-section view"},
     {"src": "https://mihirgroup.com/images/sliderAmara/3d/03-big.jpg", "alt": "Mihir Amara — cut-section view 3", "caption": "Cut-section view"},
     {"src": "https://mihirgroup.com/images/sliderAmara/3d/04-big.jpg", "alt": "Mihir Amara — cut-section view 4", "caption": "Cut-section view"}
   ]$json$::jsonb,
   'Artist''s impressions. Source: mihirgroup.com', 1),

  ('Nyati Equinox', 'EQX', 'equinox', 'Pune',
   'S.No 35/1, Near PVPIT College, Mulshi Road, Bavdhan Khurd, Pune 411021', 'Bavdhan Khurd · Mulshi Road',
   'residential', 'Ongoing',
   '3 and 2 bed premium residences',
   'Homes in Bavdhan Khurd on Mulshi Road with engrossing views of a biodiversity park on one side and the city on the other, and a catalogue of 40+ lifestyle amenities.',
   '3 & 2 bed premium residences',
   array['Views of a biodiversity park and the city', '40+ lifestyle amenities', 'Mulshi Road, Bavdhan Khurd'],
   'P52100054912', 'https://mihirgroup.com/images/Equinox/EquinoxBrochure.pdf', '+91 98999 56284', 'info@mihirgroup.com', 18.5130, 73.7770,
   'forest', '#2f5d7c', '#f0a331', '#17191c',
   'https://mihirgroup.com/images/Equinox/Equinox-img.jpg', 'https://mihirgroup.com/images/Equinox/logo.png',
   $json$[
     {"src": "https://mihirgroup.com/images/Equinox/Equinox-img1.jpg", "alt": "Nyati Equinox — render 1"},
     {"src": "https://mihirgroup.com/images/Equinox/Equinox-img2.jpg", "alt": "Nyati Equinox — render 2"},
     {"src": "https://mihirgroup.com/images/Equinox/Equinox-img3.jpg", "alt": "Nyati Equinox — render 3"},
     {"src": "https://mihirgroup.com/images/Equinox/3d/01-big.jpg", "alt": "Nyati Equinox — cut-section view 1", "caption": "Cut-section view"},
     {"src": "https://mihirgroup.com/images/Equinox/3d/02-big.jpg", "alt": "Nyati Equinox — cut-section view 2", "caption": "Cut-section view"}
   ]$json$::jsonb,
   'Artist''s impressions. Source: mihirgroup.com', 2),

  ('Sierra', 'SRA', 'sierra', 'Pune', 'Tathawade, Pune', 'Tathawade',
   'residential', 'Coming soon',
   'A new Mihir Group address in Tathawade',
   'Project details, imagery and specifications will be published here at launch. Register your interest to be informed first.',
   null, array[]::text[],
   null, null, '+91 98999 56284', 'info@mihirgroup.com', 18.6185, 73.7430,
   'stone', '#2f5d7c', '#f0a331', '#17191c',
   null, null, '[]'::jsonb, null, 3),

  ('Wakad Business Bay', 'WBB', 'wakad-business-bay', 'Pune',
   'Survey No. 153/1A, Off Service Road, Mumbai–Bangalore Expressway, Behind TipTop International Hotel, Wakad, Pune 411057',
   'Wakad · Mumbai–Bangalore Expressway',
   'commercial', 'Ongoing',
   'Commercial spaces on the Mumbai–Bangalore Expressway',
   'A commercial address in Wakad with a centralized lobby featuring an exclusive grand entrance, cafeteria and centralized concierge, and a state-of-the-art Building Management System for security and energy conservation.',
   'Commercial spaces',
   array['Centralized lobby with grand entrance', 'Cafeteria and centralized concierge', 'Building Management System for security & energy conservation', 'Off the Mumbai–Bangalore Expressway'],
   null, null, '73996 67755', 'info@wbbpune.com', 18.5968, 73.7510,
   'charcoal', '#2f5d7c', '#f0a331', '#17191c',
   'https://mihirgroup.com/images/wbb-pune.png', null,
   $json$[
     {"src": "https://mihirgroup.com/images/IMG_1349_heic.webp", "alt": "Wakad Business Bay — centralized lobby", "caption": "The centralized lobby"}
   ]$json$::jsonb,
   'Source: mihirgroup.com', 4)
on conflict (code) do nothing;

-- ---------------- SAMPLE tower / wing / flat layouts ----------------
create or replace function pg_temp.mk_wing(p_code text, p_tower text, p_wing text, p_floors int, p_per_floor int, p_types text[], p_start_floor int default 1)
returns void language plpgsql as $$
declare v_project uuid; v_tower uuid; v_wing uuid; fl int; n int;
begin
  select id into v_project from public.projects where code = p_code;
  insert into public.towers (project_id, name) values (v_project, p_tower)
    on conflict (project_id, name) do update set name = excluded.name returning id into v_tower;
  insert into public.wings (tower_id, name) values (v_tower, p_wing)
    on conflict (tower_id, name) do update set name = excluded.name returning id into v_wing;
  for fl in p_start_floor..(p_start_floor + p_floors - 1) loop
    for n in 1..p_per_floor loop
      insert into public.flats (wing_id, flat_no, floor, flat_type)
      values (v_wing, (fl * 100 + n)::text, fl, p_types[1 + ((n - 1) % array_length(p_types, 1))])
      on conflict (wing_id, flat_no) do nothing;
    end loop;
  end loop;
end $$;

-- Mihir Amara: 6 towers (sample: 12 floors × 4 homes)
select pg_temp.mk_wing('AMR', 'Tower ' || t, t, 12, 4, array['3 BHK','2 BHK','2 BHK','3 BHK'])
from unnest(array['A','B','C','D','E','F']) t;

-- Equinox: 4 buildings (sample: 10 floors × 6 homes)
select pg_temp.mk_wing('EQX', 'Building ' || b, 'A', 10, 6, array['2 BHK','3 BHK','2 BHK'])
from unnest(array['1','2','3','4']) b;

-- Sierra: sample 2 towers × 2 wings
select pg_temp.mk_wing('SRA', 'Tower ' || t, w, 12, 4, array['2 BHK','3 BHK'])
from unnest(array['1','2']) t, unnest(array['A','B']) w;

-- Wakad Business Bay: offices on floors 1–8, shops on ground floor
select pg_temp.mk_wing('WBB', 'Business Bay', 'Offices', 8, 10, array['Office']);
do $$
declare v_wing uuid; n int;
begin
  select w.id into v_wing from public.wings w join public.towers t on t.id = w.tower_id
  join public.projects p on p.id = t.project_id where p.code = 'WBB' and t.name = 'Business Bay';
  insert into public.wings (tower_id, name)
    select tower_id, 'Retail' from public.wings where id = v_wing
    on conflict do nothing;
  select w.id into v_wing from public.wings w join public.towers t on t.id = w.tower_id
  join public.projects p on p.id = t.project_id where p.code = 'WBB' and w.name = 'Retail';
  for n in 1..12 loop
    insert into public.flats (wing_id, flat_no, floor, flat_type)
    values (v_wing, 'G-' || lpad(n::text, 2, '0'), 0, 'Shop') on conflict do nothing;
  end loop;
end $$;
