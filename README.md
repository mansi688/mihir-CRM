# Mihir Group — Customer Portal & Complaint CRM

One React + Supabase application (no PHP), with **no public marketing website** — opening the app goes straight
to sign-in, then to the right home for each role:

1. **Customer portal** — owners/tenants register against project → tower → wing → flat, raise complaints with
   photos, chat with the team, confirm & rate fixes. Each project has its own registration link:
   `/register?project=mihir-amara` (old `/p/<slug>` links redirect there).
2. **CRM for staff** — every complaint is automatically a task with an ID, deadline and assignee; dashboard,
   overdue alerts, assignments, reports, customers, employees and project/flat setup.

**Design — "site office":** a builder's look for a working CRM. Warm concrete canvas (`#F2F0EB`) with a faint
blueprint grid, graphite navigation (`#17191C`), white cards with hairline borders and corner marks, a single
safety-amber accent (`#F0A331`) for primary actions and highlights, steel blue (`#2F5D7C`) for links and information.
Type: Archivo for headings, Inter for text, IBM Plex Mono for complaint IDs, labels and table headers.
Status colours: Open steel blue, Assigned plum, In progress amber, Resolved green, Urgent/Overdue red.

**Motion:** page headers draw a measuring ruler, content rises in, dashboard figures count up from zero,
stat gauges and chart bars extend, list and table rows slide in, the active menu marker grows, primary buttons
get a light sweep on hover, dialogs and toasts ease in. Everything switches off for reduced-motion users.
Colours and motion live in `src/styles.css` (tokens at the top, theme at the end); the count-up is `src/lib/countUp.js`.
Run `supabase/theme-update.sql` once to store the new colours on existing projects (optional).

## What happens when a customer raises a complaint

| Step | Automatic |
|---|---|
| Complaint saved | ID like `CMP-2610-00042` (year-month + running number) |
| Task card | Customer name, mobile, project, tower, wing, flat, category, description, date/time, priority, status — stored on the task permanently |
| Routing | Category → team → fixed person, or the least-busy team member **who handles that project** |
| Deadline | From priority: Urgent 4h · High 24h · Medium 72h · Low 7 days (editable in Settings) |
| Notifications | Customer and assignee get in-app alerts + a WhatsApp message is queued |
| Overdue | Every 15 min, missed deadlines alert the assignee and that project's managers (once) |
| Status | Open → Assigned → In Progress → Resolved → Closed (customer confirms & rates, or reopens) |

## Who can see what (enforced in the database, not just the screen)

| | Customer | Staff / technician | Manager | Admin |
|---|---|---|---|---|
| Own complaints | ✓ | – | – | – |
| Complaints assigned to them / their team | – | ✓ | ✓ | ✓ |
| All complaints of their projects | – | – | ✓ | ✓ (all projects) |
| Assign, set priority & deadline, close | – | – | ✓ | ✓ |
| Customers | own profile | – | their projects | all |
| Employees, projects/flats, settings | – | – | – | ✓ |
| Internal notes | hidden | ✓ | ✓ | ✓ |

**Project-wise separation:** set "Projects handled" on an employee (Admin → Employees). A manager limited
to Mihir Amara sees only Amara customers, complaints, reports and alerts. Leave it empty for all projects.
Customers are always grouped by project (project chips on Customers, Complaints, Dashboard, Reports), and
each project has its own registration link: `/register?project=mihir-amara`.

The database ships with **73 automated security tests** (`npm run test:db`) covering all of the above,
including website enquiries (the public can submit but never read them; managers see only their projects').

---

## Setup (about 20 minutes)

### 1. Create the Supabase project
1. Sign up at supabase.com → **New project** (region: Mumbai). Note the database password.
2. **SQL Editor → New query**: paste all of `supabase/schema.sql` → **Run**.
3. New query: paste `supabase/seed.sql` → **Run**. This adds teams, complaint categories, the four
   projects with their website content and colours, and **sample** tower/wing/flat layouts.

> ⚠️ The tower, wing and flat numbers in the seed are placeholders so registration works on day one.
> Correct them in **Admin → Projects & flats** (rename/delete towers and wings; "Generate flats" creates
> a whole wing floor by floor) before giving the link to residents. Sierra has no public details yet.

### 2. Auth settings
- **Authentication → URL Configuration**: Site URL = your website address (e.g. `https://care.mihirgroup.com`).
  Add `https://care.mihirgroup.com/**` to Redirect URLs (and `http://localhost:5173/**` for testing).
- **Authentication → Providers → Email**: keep "Confirm email" on for security. Supabase's built-in mailer
  is limited to a few emails/hour — for real use add your SMTP (Authentication → SMTP, e.g. Zoho/Gmail Workspace).

### 3. Deploy the employee/customer creation function
Needed for "Add employee" and "Add customer" (it uses the secret service key on the server only).
```bash
npm i -g supabase
supabase login
supabase link --project-ref YOUR-PROJECT-REF
supabase functions deploy admin-users
```

### 4. Run the website
```bash
cp .env.example .env      # fill VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (Settings → API)
npm install
npm run dev               # http://localhost:5173
```

### 4b. Copy the official images into your own storage (recommended)
```bash
SUPABASE_URL=https://YOUR-REF.supabase.co SUPABASE_SERVICE_ROLE_KEY=your-service-role-key npm run import-media
```
Downloads every external image, the Equinox brochure and the group film into the public `project-media`
bucket and rewrites the links. Safe to re-run. Keep the service-role key on your computer only.

### 5. Make yourself admin (once)
Register normally at `/register`, confirm the email, then in SQL Editor:
```sql
update public.profiles set role = 'admin' where email = 'you@mihirgroup.com';
```
After that, add all other employees from **Admin → Employees** (no SQL needed).

### 6. Put it online (free)
- **Vercel**: import the folder/Git repo → framework "Vite" → add the two `VITE_…` environment variables → Deploy.
  `vercel.json` already handles page refreshes on deep links.
- **Netlify**: build `npm run build`, publish `dist`, same env vars (`public/_redirects` is included).
- Point a subdomain like `care.mihirgroup.com` at it, then update the Site URL in step 2.

### 7. Overdue checks
`schema.sql` schedules the check every 15 minutes with **pg_cron**. If the SQL output said pg_cron was not
available: Database → Extensions → enable **pg_cron**, then run
```sql
select cron.schedule('caredesk-overdue-check', '*/15 * * * *', 'select public.notify_overdue_complaints()');
```

---

## Photos and branding

- **Admin → Settings → Branding**: logo, the photo on the sign-in page (use a real project photograph),
  helpdesk phone and email.
- **Admin → Projects & flats → Details & branding**: each project's photo (shown on the customer's home banner and
  that project's sign-in/registration page) and its registration link name.
- Complaint photos go to a **private** bucket; only the customer and the staff handling that complaint can open them.
  Phone photos are shrunk to ≤1600px before upload.
- Earlier website enquiries stay in the `enquiries` table; the website form and its CRM screen were removed.

## WhatsApp / SMS messages

Every customer/assignee alert also writes a row to `outbound_messages` (status `pending`). Connect a sender
of your choice — e.g. an **n8n** workflow: *Schedule (1 min) → Supabase "get rows" where status = pending →
WhatsApp Business Cloud API / Interakt / Gupshup node → Supabase "update row" status = sent*. Use the
service-role key in n8n only. If you don't connect anything, the app works with in-app notifications alone.

## Folder map
```
supabase/schema.sql              tables, triggers, security rules, storage, reports, overdue job
supabase/seed.sql                Mihir Group projects, teams, categories, sample flats
supabase/functions/admin-users   creates logins securely
src/styles.css                   whole look: colours, layout and motion
src/components/Media.jsx         photo with fallback, gallery + accessible lightbox, video
scripts/import-official-media.mjs  copies external images into your own storage
src/pages/auth                   sign-in, registration (project-aware), password reset
src/pages/customer               resident home, raise complaint, my flats
src/pages/admin                  dashboard, complaints, log complaint, customers, employees,
                                 projects & flats, settings, reports
src/pages/shared                 complaint detail (all roles), notifications, profile
tests/rls-test.mjs               73 database security/workflow tests (npm run test:db)
tests/e2e/                       34-step browser walkthrough against real Postgres (see tests/e2e/README.md)
```

## Testing

- `npm run test:db` — 73 database checks: every role, project-wise separation, complaint workflow, overdue job.
- `tests/e2e/` — a browser walkthrough of the whole portal and CRM (34 steps, desktop + phone) against a real
  Postgres with this schema and its security rules, including the real `admin-users` function. See its README.

### Fixed in this version (found by the end-to-end run)
- **Customers page and the customer search on "Log a complaint" failed on Supabase**: the query for a customer's
  flats was ambiguous (flats link to people twice — the customer and whoever verified the flat), which Supabase
  rejects. The query now names the customer link.
- **Saving "Manage task" silently changed the deadline** and logged "Deadline changed" (the date box has minute
  precision). The deadline is now only sent when the manager edits it.
- **Clicking a caption selected the first option** (e.g. "How urgent is it?" picked "Let the office decide",
  "Category" picked the first category) and screen readers announced wrong names. Button groups are now
  labelled groups instead of form labels.
- A reply typed straight after sending a message could be wiped by the refresh; text is kept if sending fails.
- Priority box squeezed to "Hig" in the Manage task panel; flat nameplates spilled out of their tiles;
  the "Add photo" tile icon was misaligned.
- The "marked resolved" banner for customers now has a **Review now** button that opens those complaints.

## Good to know
- Customers sign in with email + password. Mobile OTP login is possible later via Supabase Phone Auth
  (needs an SMS provider such as MSG91, which costs per SMS).
- Turn on **Settings → Company → "must be verified"** if you want the office to verify each flat before
  the owner can raise complaints (verify from Admin → Customers).
- Deleting a project/tower/wing/flat is blocked once complaints exist for it — hide the project instead.
- Export: Complaints and Customers export to CSV (opens in Excel); Reports export team performance.
