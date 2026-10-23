// Copies every external image/video/PDF referenced by the projects and the landing page
// (e.g. the official mihirgroup.com renders) into your own Supabase `project-media`
// bucket, then rewrites the links. Run once after seeding, and again whenever you
// paste new external links in Admin.
//
//   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=... npm run import-media
//
// The service-role key is secret — run this on your own computer only, never in the browser.
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first (Supabase → Project Settings → API).');
  process.exit(1);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const BUCKET = 'project-media';
const ours = (u) => !u || u.startsWith(`${url}/storage/`);
const cache = new Map();

async function copy(src, folder) {
  if (ours(src) || !/^https?:\/\//.test(src)) return src;
  if (cache.has(src)) return cache.get(src);
  try {
    const res = await fetch(src, { headers: { 'User-Agent': 'Mozilla/5.0 (media import)' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const type = res.headers.get('content-type')?.split(';')[0] || 'application/octet-stream';
    const buf = Buffer.from(await res.arrayBuffer());
    const name = decodeURIComponent(path.basename(new URL(src).pathname)).replace(/[^\w.-]+/g, '-');
    const dest = `official/${folder}/${name}`;
    const { error } = await db.storage.from(BUCKET).upload(dest, buf, { contentType: type, upsert: true });
    if (error) throw error;
    const pub = db.storage.from(BUCKET).getPublicUrl(dest).data.publicUrl;
    console.log(`  ✓ ${src}\n      → ${dest} (${Math.round(buf.length / 1024)} KB)`);
    cache.set(src, pub);
    return pub;
  } catch (e) {
    console.log(`  ✗ ${src} — kept the original link (${e.message})`);
    cache.set(src, src);
    return src;
  }
}

const { data: projects, error } = await db.from('projects').select('*');
if (error) { console.error(error.message); process.exit(1); }
for (const p of projects) {
  console.log(`\n${p.name}`);
  const folder = (p.code || p.slug || 'project').toLowerCase();
  const patch = {
    hero_image_url: p.hero_image_url && await copy(p.hero_image_url, folder),
    logo_url: p.logo_url && await copy(p.logo_url, folder),
    brochure_url: p.brochure_url && await copy(p.brochure_url, folder),
    video_url: p.video_url && !/youtu/.test(p.video_url) ? await copy(p.video_url, folder) : p.video_url,
    gallery: await Promise.all((p.gallery || []).map(async (g) => ({ ...g, src: await copy(g.src, folder) }))),
  };
  const { error: e } = await db.from('projects').update(patch).eq('id', p.id);
  if (e) console.log('  ! could not save:', e.message);
}

console.log('\nLanding page');
const { data: row } = await db.from('app_settings').select('value').eq('key', 'landing').single();
if (row?.value) {
  const v = { ...row.value };
  for (const k of ['hero_image_url', 'logo_url', 'film_url']) if (v[k]) v[k] = await copy(v[k], 'group');
  await db.from('app_settings').update({ value: v }).eq('key', 'landing');
}
console.log('\nDone. Reload the website — images now load from your own storage.');
