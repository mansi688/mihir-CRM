-- =====================================================================
--  Optional: store the "site office" colours on existing projects.
--  The app already treats the old default colours as "use the theme", so this
--  only makes the saved values match what Admin → Projects & flats shows.
--  Safe to run more than once. Changes colours only.
-- =====================================================================
update public.projects
set color_primary = '#2f5d7c', color_accent = '#f0a331', color_dark = '#17191c'
where lower(coalesce(color_primary, '')) in ('', '#2f5d46', '#263b32', '#4a5a5e', '#2a2c28', '#174a91', '#2563eb')
   or lower(coalesce(color_accent, ''))  in ('', '#c5a46d', '#f5c542', '#2563eb');

alter table public.projects alter column color_primary set default '#2f5d7c';
alter table public.projects alter column color_accent  set default '#f0a331';
alter table public.projects alter column color_dark    set default '#17191c';
