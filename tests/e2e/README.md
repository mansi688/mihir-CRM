# End-to-end test kit

Runs the real app in a browser against a local stand-in for Supabase, backed by a **real Postgres** with the
project's `schema.sql`, `seed.sql` and row-level security. The stand-in speaks the same REST, auth and storage
API as Supabase (including PostgREST's rule that ambiguous embeds are an error), and runs the real
`supabase/functions/admin-users/index.ts` source for "Add employee" / "Add customer".

The walkthrough (`e2e.py`, 34 steps) covers: sign-in/registration (themed per project), raising complaints with
photos, auto-routing, assignment, replies vs internal notes, technician start/resolve with after-photos,
customer close + rating + reopen, project-scoped managers, customers/employees admin, phone complaints,
towers/wings/flat generation, project branding + photo upload, every Settings tab, reports and CSV exports,
notifications, the overdue job, and phone-size layouts. Screenshots land in `shots/`.

## Run it
Needs Node 22+, Python 3 with `playwright` (Chromium), and a local Postgres 16 server you can reach as
`postgres` (default socket `/tmp`, port `55432`; override with `PGHOST` / `PGPORT`).

```bash
cd tests/e2e
npm install
./reset.sh      # fresh database from supabase/schema.sql + seed.sql, starts the API on :54321
./web.sh        # builds the app against it and serves on :4173
python3 e2e.py  # 34-step browser walkthrough; prints PASS/WARN/FAIL per step
```
"WARN" on the wrong-password and duplicate-account steps is expected: those steps deliberately trigger an error
and check that a friendly message is shown.
