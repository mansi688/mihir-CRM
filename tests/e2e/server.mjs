// Local stand-in for the Supabase APIs the app uses, backed by a real Postgres 16:
//   /rest/v1      PostgREST-compatible reads/writes/RPC, executed as the caller's role (RLS enforced)
//   /auth/v1      email+password auth issuing HS256 JWTs (signup, token, user, admin users)
//   /storage/v1   object upload/sign/download with storage.objects RLS enforced
//   /functions/v1/admin-users   runs the project's real Edge Function source
// Usage: node --experimental-strip-types server.mjs <projectDir>
import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const PORT = 54321;
const SECRET = 'local-test-jwt-secret-local-test-jwt-secret';
const BASE = `http://localhost:${PORT}`;
const projectDir = process.argv[2];
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v))); // numeric -> number (PostgREST returns JSON numbers)
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));   // bigint
const pool = new pg.Pool({ host: process.env.PGHOST || '/tmp', port: Number(process.env.PGPORT || 55432), user: 'postgres', database: 'crm', max: 12 });

// ---------------- JWT ----------------
const b64u = (b) => Buffer.from(b).toString('base64url');
export function sign(payload) {
  const h = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const p = b64u(JSON.stringify(payload));
  const s = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${s}`;
}
function verify(token) {
  const [h, p, s] = (token || '').split('.');
  if (!s) return null;
  const want = crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url');
  if (want !== s) return null;
  const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
  if (payload.exp && payload.exp < Date.now() / 1000) return null;
  return payload;
}
export const ANON_KEY = sign({ role: 'anon', iss: 'local' });
export const SERVICE_KEY = sign({ role: 'service_role', iss: 'local' });
fs.writeFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'keys.json'), JSON.stringify({ ANON_KEY, SERVICE_KEY, BASE }));

// ---------------- helpers ----------------
const log = [];
function cors(extra = {}) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, prefer, range, x-client-info, accept-profile, content-profile, x-upsert, cache-control, x-supabase-api-version, x-region',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, PUT, DELETE, HEAD, OPTIONS',
    'Access-Control-Expose-Headers': 'Content-Range, Content-Location',
    ...extra,
  };
}
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  res.writeHead(status, cors({ ...(isBuf ? {} : { 'Content-Type': 'application/json' }), ...headers }));
  res.end(body === undefined ? '' : isBuf ? body : JSON.stringify(body));
}
const readBody = (req) => new Promise((ok) => { const c = []; req.on('data', (d) => c.push(d)); req.on('end', () => ok(Buffer.concat(c))); });
const qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';

function caller(req) {
  const auth = req.headers.authorization?.replace(/^Bearer /, '') || req.headers.apikey;
  const p = verify(auth);
  if (!p) return null;
  return { role: p.role === 'authenticated' ? 'authenticated' : p.role === 'service_role' ? 'service_role' : 'anon', sub: p.sub || '' };
}
async function asRole(who, fn) {
  const c = await pool.connect();
  try {
    await c.query('begin');
    await c.query(`set local role ${who.role}`);
    await c.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claim.role', $2, true)`, [who.sub || '', who.role]);
    const r = await fn(c);
    await c.query('commit');
    return r;
  } catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
}
function pgError(res, e, who) {
  const map = { '23505': 409, '23503': 409, '42501': who?.role === 'anon' ? 401 : 403, PGRST116: 406, PGRST201: 300, PGRST200: 400 };
  const status = e.status || map[e.code] || (e.code?.startsWith('42') ? 400 : 400);
  log.push({ t: Date.now(), status, code: e.code, message: e.message });
  send(res, status, { code: e.code || 'PGRST000', message: e.message, details: e.detail || e.details || null, hint: e.hint || null });
}

// ---------------- schema introspection ----------------
let FKS = [];   // { name, from, fromCols[], to, toCols[] }
let PK = {};    // table -> [cols]
let RET = {};   // function -> return type name
async function introspect() {
  const fk = await pool.query(`
    select c.conname as name, cf.relname as "from", ct.relname as "to",
      array(select a.attname from unnest(c.conkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n order by o)::text[] as "fromCols",
      array(select a.attname from unnest(c.confkey) with ordinality k(n, o) join pg_attribute a on a.attrelid = c.confrelid and a.attnum = k.n order by o)::text[] as "toCols"
    from pg_constraint c join pg_class cf on cf.oid = c.conrelid join pg_class ct on ct.oid = c.confrelid
    join pg_namespace n on n.oid = cf.relnamespace join pg_namespace n2 on n2.oid = ct.relnamespace
    where c.contype = 'f' and n.nspname = 'public' and n2.nspname = 'public'`);
  FKS = fk.rows;
  const pk = await pool.query(`
    select cl.relname as t, array(select a.attname from unnest(c.conkey) k(n) join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.n)::text[] as cols
    from pg_constraint c join pg_class cl on cl.oid = c.conrelid join pg_namespace n on n.oid = cl.relnamespace
    where c.contype = 'p' and n.nspname = 'public'`);
  PK = Object.fromEntries(pk.rows.map((r) => [r.t, r.cols]));
  const fns = await pool.query(`select p.proname, t.typname from pg_proc p join pg_type t on t.oid = p.prorettype join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`);
  RET = Object.fromEntries(fns.rows.map((r) => [r.proname, r.typname]));
}

// ---------------- select parsing ----------------
function splitTop(s, sep = ',') {
  const out = []; let depth = 0; let cur = ''; let quote = false;
  for (const ch of s) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === '(') depth++;
    if (!quote && ch === ')') depth--;
    if (!quote && depth === 0 && ch === sep) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (cur.length) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
function parseSelect(s) {
  return splitTop(s || '*').map((item) => {
    const m = item.match(/^(?:([\w]+):)?([\w]+)((?:![\w]+)*)\((.*)\)$/s);
    if (m) {
      const flags = m[3].split('!').filter(Boolean);
      return { embed: true, alias: m[1] || m[2], rel: m[2], inner: flags.includes('inner'), hint: flags.find((f) => f !== 'inner' && f !== 'left') || null, children: parseSelect(m[4]) };
    }
    const c = item.match(/^(?:([\w]+):)?([\w*]+)(?:::\w+)?$/);
    if (!c) { const e = new Error(`failed to parse select parameter (${item})`); e.code = 'PGRST100'; e.status = 400; throw e; }
    return { col: c[2], alias: c[1] || c[2] };
  });
}

// Resolve an embed exactly like PostgREST: candidates in both directions, ambiguity is an error (PGRST201)
function resolveRel(table, node) {
  let cands = [
    ...FKS.filter((f) => f.from === table && f.to === node.rel).map((f) => ({ f, kind: 'm2o' })),
    ...FKS.filter((f) => f.to === table && f.from === node.rel).map((f) => ({ f, kind: 'o2m' })),
  ];
  if (!cands.length) {
    // embedding by FK column name, e.g. team_id(...)
    cands = FKS.filter((f) => f.from === table && f.fromCols.length === 1 && f.fromCols[0] === node.rel).map((f) => ({ f, kind: 'm2o' }));
  }
  if (node.hint) cands = cands.filter(({ f }) => f.name === node.hint || f.fromCols.includes(node.hint) || f.toCols.includes(node.hint));
  if (!cands.length) {
    const e = new Error(`Could not find a relationship between '${table}' and '${node.rel}' in the schema cache`); e.code = 'PGRST200'; e.status = 400; throw e;
  }
  if (cands.length > 1) {
    const e = new Error(`Could not embed because more than one relationship was found for '${table}' and '${node.rel}'`);
    e.code = 'PGRST201'; e.status = 300;
    e.details = cands.map(({ f }) => `${f.name} (${f.from}(${f.fromCols}) -> ${f.to}(${f.toCols}))`).join('; ');
    e.hint = `Try changing '${node.rel}' to one of: ${cands.map(({ f }) => `'${node.rel}!${f.name}'`).join(', ')}`;
    throw e;
  }
  const { f, kind } = cands[0];
  const target = kind === 'm2o' ? f.to : f.from;
  return { target, kind, f };
}

// ---------------- filters ----------------
function parseFilterValue(raw) {
  let v = raw; let neg = false;
  if (v.startsWith('not.')) { neg = true; v = v.slice(4); }
  const dot = v.indexOf('.');
  const op = dot < 0 ? v : v.slice(0, dot);
  const val = dot < 0 ? '' : v.slice(dot + 1);
  return { op, val, neg };
}
function parseInList(val) {
  return splitTop(val.replace(/^\(|\)$/g, '')).map((x) => x.replace(/^"(.*)"$/, '$1'));
}
function condSql(colExpr, { op, val, neg }, params) {
  const p = (v) => { params.push(v); return `$${params.length}`; };
  let sql;
  switch (op) {
    case 'eq': sql = `${colExpr} = ${p(val)}`; break;
    case 'neq': sql = `${colExpr} <> ${p(val)}`; break;
    case 'gt': sql = `${colExpr} > ${p(val)}`; break;
    case 'gte': sql = `${colExpr} >= ${p(val)}`; break;
    case 'lt': sql = `${colExpr} < ${p(val)}`; break;
    case 'lte': sql = `${colExpr} <= ${p(val)}`; break;
    case 'like': sql = `${colExpr}::text like ${p(val.replace(/\*/g, '%'))}`; break;
    case 'ilike': sql = `${colExpr}::text ilike ${p(val.replace(/\*/g, '%'))}`; break;
    case 'is': sql = `${colExpr} is ${val === 'null' ? 'null' : val === 'true' ? 'true' : val === 'false' ? 'false' : 'unknown'}`; break;
    case 'in': sql = `${colExpr} = any(${p(parseInList(val))})`; break;
    case 'cs': sql = `${colExpr} @> ${p(val)}`; break;
    default: { const e = new Error(`unknown operator ${op}`); e.code = 'PGRST100'; e.status = 400; throw e; }
  }
  return neg ? `not (${sql})` : sql;
}
function orSql(expr, alias, params) {
  // expr like (a.ilike.%x%,b.eq.1,and(c.eq.2,d.eq.3))
  const inner = expr.replace(/^\(|\)$/g, '');
  const parts = splitTop(inner).map((part) => {
    const nested = part.match(/^(and|or)\((.*)\)$/s);
    if (nested) {
      const sub = splitTop(nested[2]).map((x) => { const d = x.indexOf('.'); return condSql(`${alias}.${qi(x.slice(0, d))}`, parseFilterValue(x.slice(d + 1)), params); });
      return `(${sub.join(nested[1] === 'and' ? ' and ' : ' or ')})`;
    }
    const d = part.indexOf('.');
    return condSql(`${alias}.${qi(part.slice(0, d))}`, parseFilterValue(part.slice(d + 1)), params);
  });
  return `(${parts.join(' or ')})`;
}
const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
function collectFilters(searchParams) {
  const base = []; const nested = {}; const orders = { '': null };
  for (const [k, v] of searchParams) {
    if (k === 'order') { orders[''] = v; continue; }
    if (k.endsWith('.order')) { orders[k.slice(0, -6)] = v; continue; }
    if (RESERVED.has(k)) continue;
    if (k === 'or') { base.push({ or: v }); continue; }
    if (k.includes('.')) {
      const i = k.lastIndexOf('.');
      const pathKey = k.slice(0, i); const col = k.slice(i + 1);
      if (col === 'or') (nested[pathKey] ||= []).push({ or: v });
      else (nested[pathKey] ||= []).push({ col, f: parseFilterValue(v) });
      continue;
    }
    base.push({ col: k, f: parseFilterValue(v) });
  }
  return { base, nested, orders };
}
function filtersSql(list, alias, params) {
  return (list || []).map((x) => (x.or ? orSql(x.or, alias, params) : condSql(`${alias}.${qi(x.col)}`, x.f, params)));
}
function orderSql(spec, alias) {
  if (!spec) return '';
  const parts = spec.split(',').map((o) => {
    const [col, ...mods] = o.split('.');
    const dir = mods.includes('desc') ? 'desc' : 'asc';
    const nulls = mods.includes('nullsfirst') ? ' nulls first' : mods.includes('nullslast') ? ' nulls last' : '';
    return `${alias}.${qi(col)} ${dir}${nulls}`;
  });
  return ` order by ${parts.join(', ')}`;
}

// Build "select list" for a table alias, recursively embedding
let aliasN = 0;
function projection(table, alias, nodes, ctx, pathKey) {
  const cols = []; const innerConds = [];
  for (const n of nodes) {
    if (!n.embed) { cols.push(n.col === '*' ? `${alias}.*` : `${alias}.${qi(n.col)} as ${qi(n.alias)}`); continue; }
    const rel = resolveRel(table, n);
    const a = `t${++aliasN}`;
    const key = pathKey ? `${pathKey}.${n.alias}` : n.alias;
    const join = rel.kind === 'm2o'
      ? rel.f.fromCols.map((c, i) => `${a}.${qi(rel.f.toCols[i])} = ${alias}.${qi(c)}`).join(' and ')
      : rel.f.fromCols.map((c, i) => `${a}.${qi(c)} = ${alias}.${qi(rel.f.toCols[i])}`).join(' and ');
    const conds = [join, ...filtersSql(ctx.nested[key], a, ctx.params)];
    const sub = projection(rel.target, a, n.children, ctx, key);
    const where = [...conds, ...sub.innerConds].join(' and ');
    const inner = `select ${sub.cols.join(', ')} from public.${qi(rel.target)} ${a} where ${where}${orderSql(ctx.orders[key], a)}`;
    cols.push(rel.kind === 'm2o'
      ? `(select to_jsonb(x) from (${inner} limit 1) x) as ${qi(n.alias)}`
      : `(select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) from (${inner}) x) as ${qi(n.alias)}`);
    if (n.inner) innerConds.push(`exists (select 1 from public.${qi(rel.target)} ${a}e where ${[join, ...filtersSql(ctx.nested[key], a, ctx.params), ...sub.innerConds].join(' and ').replaceAll(`${a}.`, `${a}e.`)})`);
  }
  return { cols, innerConds };
}

async function handleRest(req, res, url, who) {
  const table = decodeURIComponent(url.pathname.replace(/^\/rest\/v1\//, ''));
  const prefer = Object.fromEntries((req.headers.prefer || '').split(',').map((x) => x.trim().split('=')).filter((x) => x[0]));
  const accept = req.headers.accept || '';
  const single = accept.includes('vnd.pgrst.object');

  // ---------- RPC ----------
  if (table.startsWith('rpc/')) {
    const fn = table.slice(4);
    const raw = await readBody(req);
    const args = raw.length ? JSON.parse(raw.toString()) : Object.fromEntries(url.searchParams);
    const keys = Object.keys(args);
    const params = keys.map((k) => (args[k] !== null && typeof args[k] === 'object' ? JSON.stringify(args[k]) : args[k]));
    const call = `public.${qi(fn)}(${keys.map((k, i) => `${qi(k)} := $${i + 1}`).join(', ')})`;
    const out = await asRole(who, (c) => c.query(`select ${call} as r`, params));
    if (RET[fn] === 'void') return send(res, 204);
    return send(res, 200, out.rows[0]?.r ?? null);
  }
  if (!PK[table]) return send(res, 404, { code: '42P01', message: `relation "public.${table}" does not exist` });

  aliasN = 0;
  const { base, nested, orders } = collectFilters(url.searchParams);
  const params = [];
  const ctx = { nested, orders, params };
  const nodes = parseSelect(url.searchParams.get('select') || '*');

  if (req.method === 'GET' || req.method === 'HEAD') {
    const proj = projection(table, 't0', nodes, ctx, '');
    const where = [...filtersSql(base, 't0', params), ...proj.innerConds];
    const whereSql = where.length ? ` where ${where.join(' and ')}` : '';
    let limit = url.searchParams.get('limit'); let offset = url.searchParams.get('offset');
    const range = req.headers.range?.match(/(\d+)-(\d+)?/);
    if (range) { offset = range[1]; if (range[2]) limit = String(Number(range[2]) - Number(range[1]) + 1); }
    const sql = `select ${proj.cols.join(', ')} from public.${qi(table)} t0${whereSql}${orderSql(orders[''], 't0')}${limit ? ` limit ${Number(limit)}` : ''}${offset ? ` offset ${Number(offset)}` : ''}`;
    const { rows, total } = await asRole(who, async (c) => {
      const r = await c.query(sql, params);
      let t = '*';
      if ((prefer.count || '') === 'exact') {
        const cnt = await c.query(`select count(*)::int n from (select ${proj.cols.join(', ')} from public.${qi(table)} t0${whereSql}) x`, params);
        t = cnt.rows[0].n;
      }
      return { rows: r.rows, total: t };
    });
    const from = Number(offset || 0);
    const cr = rows.length ? `${from}-${from + rows.length - 1}/${total}` : `*/${total}`;
    if (req.method === 'HEAD') return send(res, 200, undefined, { 'Content-Range': cr });
    if (single) {
      if (rows.length !== 1) { const e = new Error('JSON object requested, multiple (or no) rows returned'); e.code = 'PGRST116'; e.details = `The result contains ${rows.length} rows`; e.status = 406; throw e; }
      return send(res, 200, rows[0], { 'Content-Range': cr });
    }
    return send(res, 200, rows, { 'Content-Range': cr });
  }

  const raw = await readBody(req);
  const body = raw.length ? JSON.parse(raw.toString()) : null;
  const wantRows = prefer.return === 'representation';
  const retNodes = nodes;

  const finish = async (c, returnedPkRows) => {
    if (!wantRows) return null;
    if (!returnedPkRows.length) return [];
    // Re-select returned rows through the normal projection (RLS on select applies, like PostgREST)
    const pk = PK[table];
    const p2 = []; aliasN = 0;
    const ctx2 = { nested, orders, params: p2 };
    const proj = projection(table, 't0', retNodes, ctx2, '');
    const keyConds = returnedPkRows.map((r) => `(${pk.map((k) => { p2.push(r[k]); return `t0.${qi(k)}::text = $${p2.length}::text`; }).join(' and ')})`).join(' or ');
    const r = await c.query(`select ${proj.cols.join(', ')} from public.${qi(table)} t0 where (${keyConds})`, p2);
    return r.rows;
  };
  const reply = (rows, status) => {
    if (!wantRows) return send(res, status === 201 ? 201 : 204);
    if (single) {
      if (rows.length !== 1) { const e = new Error('JSON object requested, multiple (or no) rows returned'); e.code = 'PGRST116'; e.details = `The result contains ${rows.length} rows`; e.status = 406; throw e; }
      return send(res, status, rows[0]);
    }
    return send(res, status, rows);
  };

  if (req.method === 'POST') {
    const list = Array.isArray(body) ? body : [body];
    const cols = [...new Set(list.flatMap((o) => Object.keys(o)))];
    const pk = PK[table];
    const conflict = url.searchParams.get('on_conflict')?.split(',') || pk;
    const resol = prefer.resolution;
    let sql = `insert into public.${qi(table)} (${cols.map(qi).join(', ')}) select ${cols.map(qi).join(', ')} from json_populate_recordset(null::public.${qi(table)}, $1::json)`;
    if (resol === 'merge-duplicates') {
      const upd = cols.filter((c) => !conflict.includes(c));
      sql += ` on conflict (${conflict.map(qi).join(', ')}) do ${upd.length ? `update set ${upd.map((c) => `${qi(c)} = excluded.${qi(c)}`).join(', ')}` : 'nothing'}`;
    } else if (resol === 'ignore-duplicates') sql += ` on conflict do nothing`;
    sql += ` returning ${pk.map(qi).join(', ')}`;
    const rows = await asRole(who, async (c) => { const r = await c.query(sql, [JSON.stringify(list)]); return finish(c, r.rows); });
    return reply(rows || [], 201);
  }
  if (req.method === 'PATCH') {
    const cols = Object.keys(body || {});
    const pk = PK[table];
    const where = filtersSql(base, 't0', params);
    params.push(JSON.stringify(body));
    const sql = `update public.${qi(table)} t0 set ${cols.map((c) => `${qi(c)} = r.${qi(c)}`).join(', ')}`
      + ` from json_populate_record(null::public.${qi(table)}, $${params.length}::json) r`
      + (where.length ? ` where ${where.join(' and ')}` : '') + ` returning ${pk.map((k) => `t0.${qi(k)}`).join(', ')}`;
    const rows = await asRole(who, async (c) => { const r = await c.query(sql, params); return finish(c, r.rows); });
    return reply(rows || [], 200);
  }
  if (req.method === 'DELETE') {
    const where = filtersSql(base, 't0', params);
    const pk = PK[table];
    const sql = `delete from public.${qi(table)} t0${where.length ? ` where ${where.join(' and ')}` : ''} returning t0.*`;
    const rows = await asRole(who, async (c) => (await c.query(sql, params)).rows);
    if (!wantRows) return send(res, 204);
    return send(res, 200, rows.map((r) => Object.fromEntries(Object.entries(r))));
  }
  return send(res, 405, { message: 'method not allowed' });
}

// ---------------- auth ----------------
const userObj = (u) => ({
  id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email, email_confirmed_at: u.email_confirmed_at,
  user_metadata: u.raw_user_meta_data || {}, app_metadata: { provider: 'email', providers: ['email'] }, created_at: u.created_at, updated_at: u.created_at, identities: [],
});
const refresh = new Map();
function session(u) {
  const exp = Math.floor(Date.now() / 1000) + 3600 * 6;
  const access = sign({ sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, exp });
  const rt = crypto.randomBytes(16).toString('hex');
  refresh.set(rt, u.id);
  return { access_token: access, token_type: 'bearer', expires_in: 3600 * 6, expires_at: exp, refresh_token: rt, user: userObj(u) };
}
async function handleAuth(req, res, url) {
  const p = url.pathname.replace(/^\/auth\/v1/, '');
  const raw = await readBody(req);
  const body = raw.length ? JSON.parse(raw.toString()) : {};
  const who = caller(req);
  if (p === '/signup' && req.method === 'POST') {
    const email = String(body.email || '').trim().toLowerCase();
    if ((body.password || '').length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
    const exists = await pool.query('select 1 from auth.users where email = $1', [email]);
    if (exists.rows.length) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
    const r = await pool.query(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, crypt($2, gen_salt('bf', 4)), $3) returning *`, [email, body.password, JSON.stringify(body.data || {})]);
    return send(res, 200, session(r.rows[0]));
  }
  if (p === '/token' && req.method === 'POST') {
    if (url.searchParams.get('grant_type') === 'refresh_token') {
      const id = refresh.get(body.refresh_token);
      if (!id) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid Refresh Token' });
      const u = (await pool.query('select * from auth.users where id = $1', [id])).rows[0];
      return send(res, 200, session(u));
    }
    const u = (await pool.query(`select * from auth.users where email = $1 and encrypted_password = crypt($2, encrypted_password)`, [String(body.email || '').toLowerCase(), body.password || ''])).rows[0];
    if (!u) return send(res, 400, { error: 'invalid_grant', error_description: 'Invalid login credentials', code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    return send(res, 200, session(u));
  }
  if (p === '/user' && req.method === 'GET') {
    if (!who?.sub) return send(res, 401, { code: 401, msg: 'invalid JWT' });
    const u = (await pool.query('select * from auth.users where id = $1', [who.sub])).rows[0];
    return u ? send(res, 200, userObj(u)) : send(res, 404, { msg: 'User not found' });
  }
  if (p === '/user' && req.method === 'PUT') {
    if (!who?.sub) return send(res, 401, { code: 401, msg: 'invalid JWT' });
    if (body.password) await pool.query(`update auth.users set encrypted_password = crypt($2, gen_salt('bf', 4)) where id = $1`, [who.sub, body.password]);
    const u = (await pool.query('select * from auth.users where id = $1', [who.sub])).rows[0];
    return send(res, 200, userObj(u));
  }
  if (p === '/logout') return send(res, 204);
  if (p === '/recover') return send(res, 200, {});
  if (p === '/admin/users' && req.method === 'POST') {
    if (who?.role !== 'service_role') return send(res, 403, { msg: 'User not allowed' });
    const email = String(body.email || '').toLowerCase();
    if ((await pool.query('select 1 from auth.users where email = $1', [email])).rows.length) return send(res, 422, { code: 422, error_code: 'email_exists', msg: 'A user with this email address has already been registered' });
    const r = await pool.query(`insert into auth.users (email, encrypted_password, raw_user_meta_data) values ($1, crypt($2, gen_salt('bf', 4)), $3) returning *`, [email, body.password, JSON.stringify(body.user_metadata || {})]);
    return send(res, 200, userObj(r.rows[0]));
  }
  const m = p.match(/^\/admin\/users\/([\w-]+)$/);
  if (m && req.method === 'PUT') {
    if (who?.role !== 'service_role') return send(res, 403, { msg: 'User not allowed' });
    if (body.password) await pool.query(`update auth.users set encrypted_password = crypt($2, gen_salt('bf', 4)) where id = $1`, [m[1], body.password]);
    const u = (await pool.query('select * from auth.users where id = $1', [m[1]])).rows[0];
    return send(res, 200, userObj(u));
  }
  return send(res, 404, { msg: `auth route ${p} not implemented` });
}

// ---------------- storage ----------------
const blobs = new Map(); // bucket/path -> { buf, type }
const tokens = new Map();
async function handleStorage(req, res, url) {
  const p = decodeURIComponent(url.pathname.replace(/^\/storage\/v1/, ''));
  const who = caller(req) || { role: 'anon', sub: '' };
  let m;
  if ((m = p.match(/^\/object\/public\/([^/]+)\/(.+)$/)) && req.method === 'GET') {
    const b = await pool.query('select public from storage.buckets where id = $1', [m[1]]);
    const o = blobs.get(`${m[1]}/${m[2]}`);
    if (!b.rows[0]?.public || !o) return send(res, 404, { statusCode: '404', error: 'not_found', message: 'Object not found' });
    return send(res, 200, o.buf, { 'Content-Type': o.type });
  }
  if ((m = p.match(/^\/object\/sign\/([^/]+)$/)) && req.method === 'POST') {
    const body = JSON.parse((await readBody(req)).toString());
    const paths = body.paths || [];
    const visible = await asRole(who, async (c) => (await c.query('select name from storage.objects where bucket_id = $1 and name = any($2)', [m[1], paths])).rows.map((r) => r.name));
    return send(res, 200, paths.map((pp) => {
      if (!visible.includes(pp)) return { path: pp, signedURL: null, error: 'Either the object does not exist or you do not have access to it' };
      const t = crypto.randomBytes(12).toString('hex'); tokens.set(t, `${m[1]}/${pp}`);
      return { path: pp, signedURL: `/object/sign/${m[1]}/${pp}?token=${t}`, error: null };
    }));
  }
  if ((m = p.match(/^\/object\/sign\/([^/]+)\/(.+)$/)) && req.method === 'GET') {
    const key = tokens.get(url.searchParams.get('token'));
    const o = key && blobs.get(key);
    if (!o || key !== `${m[1]}/${m[2]}`) return send(res, 400, { error: 'InvalidSignature', message: 'Invalid token' });
    return send(res, 200, o.buf, { 'Content-Type': o.type });
  }
  if ((m = p.match(/^\/object\/([^/]+)\/(.+)$/)) && (req.method === 'POST' || req.method === 'PUT')) {
    const raw = await readBody(req);
    let buf = raw; let type = req.headers['content-type'] || 'application/octet-stream';
    if (type.startsWith('multipart/form-data')) {
      const fd = await new Request('http://x', { method: 'POST', headers: { 'content-type': type }, body: raw }).formData();
      const file = [...fd.values()].find((v) => typeof v === 'object');
      buf = Buffer.from(await file.arrayBuffer()); type = file.type || 'application/octet-stream';
    }
    const bucket = (await pool.query('select * from storage.buckets where id = $1', [m[1]])).rows[0];
    if (!bucket) return send(res, 404, { statusCode: '404', error: 'Bucket not found', message: 'Bucket not found' });
    if (bucket.file_size_limit && buf.length > bucket.file_size_limit) return send(res, 413, { statusCode: '413', error: 'Payload too large', message: 'The object exceeded the maximum allowed size' });
    if (bucket.allowed_mime_types?.length && !bucket.allowed_mime_types.includes(type)) return send(res, 415, { statusCode: '415', error: 'invalid_mime_type', message: `mime type ${type} is not supported` });
    try {
      const id = await asRole(who, async (c) => (await c.query('insert into storage.objects (bucket_id, name, owner, metadata) values ($1, $2, $3, $4) returning id', [m[1], m[2], who.sub || null, JSON.stringify({ mimetype: type, size: buf.length })])).rows[0].id);
      blobs.set(`${m[1]}/${m[2]}`, { buf, type });
      return send(res, 200, { Id: id, Key: `${m[1]}/${m[2]}` });
    } catch (e) {
      log.push({ t: Date.now(), status: 403, code: e.code, message: 'storage: ' + e.message });
      return send(res, 403, { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' });
    }
  }
  return send(res, 404, { message: `storage route ${p} not implemented` });
}

// ---------------- edge function (real source) ----------------
let fnHandler = null;
async function loadFunction() {
  const src = fs.readFileSync(path.join(projectDir, 'supabase/functions/admin-users/index.ts'), 'utf8');
  const local = new URL('./node_modules/@supabase/supabase-js/dist/main/index.js', import.meta.url).href;
  const patched = src.replace(/from ['"]https:\/\/esm\.sh\/@supabase\/supabase-js@[\d.]+['"]/, `from '${local}'`);
  const out = path.join(path.dirname(new URL(import.meta.url).pathname), 'admin-users.fn.mts');
  fs.writeFileSync(out, patched);
  globalThis.Deno = {
    serve: (h) => { fnHandler = h; },
    env: { get: (k) => ({ SUPABASE_URL: BASE, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, SUPABASE_ANON_KEY: ANON_KEY })[k] },
  };
  await import(out + '?t=' + Date.now());
  if (!fnHandler) throw new Error('admin-users did not call Deno.serve');
}
async function handleFunction(req, res, url) {
  const raw = await readBody(req);
  const r = await fnHandler(new Request(BASE + url.pathname, { method: req.method, headers: req.headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : raw }));
  const buf = Buffer.from(await r.arrayBuffer());
  const headers = cors();
  for (const [k, v] of r.headers) {
    for (const h of Object.keys(headers)) if (h.toLowerCase() === k.toLowerCase()) delete headers[h];
    headers[k] = v;
  }
  if (r.status >= 400) log.push({ t: Date.now(), status: r.status, code: 'FN', message: buf.toString() });
  res.writeHead(r.status, headers);
  res.end(buf);
}

// ---------------- server ----------------
await introspect();
await loadFunction();
http.createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  if (req.method === 'OPTIONS') return send(res, 200, 'ok');
  try {
    if (url.pathname === '/__log') return send(res, 200, log.splice(0));
    if (url.pathname.startsWith('/rest/v1/')) {
      const who = caller(req);
      if (!who) return send(res, 401, { code: 'PGRST301', message: 'JWT invalid' });
      return await handleRest(req, res, url, who);
    }
    if (url.pathname.startsWith('/auth/v1/')) return await handleAuth(req, res, url);
    if (url.pathname.startsWith('/storage/v1/')) return await handleStorage(req, res, url);
    if (url.pathname.startsWith('/functions/v1/admin-users')) return await handleFunction(req, res, url);
    if (url.pathname.startsWith('/realtime/')) return send(res, 404, { message: 'realtime not available locally' });
    return send(res, 404, { message: 'not found' });
  } catch (e) {
    return pgError(res, e, caller(req));
  }
}).listen(PORT, () => console.log(`supabase stand-in on ${BASE}`));
