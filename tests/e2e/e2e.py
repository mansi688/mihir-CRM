"""End-to-end walkthrough of the whole portal + CRM against the local Supabase stand-in.
Records console errors, page errors, failed HTTP calls and server-side errors per step."""
import json, os, re, subprocess, sys, time, urllib.request
from playwright.sync_api import sync_playwright, expect

APP = 'http://localhost:4173'
API = 'http://localhost:54321'
OUT = os.path.join(os.path.dirname(__file__), 'shots'); os.makedirs(OUT, exist_ok=True)
PW = 'Test@12345'
RESULTS = []
PSQL = ['psql', '-h', os.environ.get('PGHOST', '/tmp'), '-p', os.environ.get('PGPORT', '55432'), '-U', 'postgres', '-d', 'crm', '-tAq', '-c']

def sql(q):
    return subprocess.run(PSQL + [q], capture_output=True, text=True).stdout.strip()

def server_log():
    try: return json.loads(urllib.request.urlopen(API + '/__log').read())
    except Exception: return []

# a real JPEG for photo uploads
from PIL import Image, ImageDraw
PHOTO = os.path.join(OUT, 'leak.jpg')
im = Image.new('RGB', (2400, 1800), (180, 190, 200)); d = ImageDraw.Draw(im)
d.rectangle([600, 400, 1800, 1400], fill=(120, 90, 70)); d.ellipse([1000, 700, 1400, 1100], fill=(60, 110, 160)); im.save(PHOTO, quality=85)

class Run:
    def __init__(self, pw):
        self.browser = pw.chromium.launch()
        self.ctx = None; self.page = None
        self.new_context()

    def new_context(self, mobile=False):
        if self.ctx: self.ctx.close()
        vp = {'width': 390, 'height': 844} if mobile else {'width': 1440, 'height': 900}
        self.ctx = self.browser.new_context(viewport=vp, accept_downloads=True, device_scale_factor=1)
        self.page = self.ctx.new_page()
        self.errors = []
        p = self.page
        p.on('console', lambda m: m.type == 'error' and not re.search(r'realtime|websocket|fonts\.g|ERR_TUNNEL|mihirgroup\.com|Failed to load resource: the server responded with a status of 404', m.text, re.I) and self.errors.append('console: ' + m.text[:300]))
        p.on('pageerror', lambda e: self.errors.append('pageerror: ' + str(e)[:300]))
        p.on('response', lambda r: r.status >= 400 and 'localhost:54321' in r.url and '/realtime/' not in r.url and self.errors.append(f'http {r.status}: {r.request.method} {r.url[:160]}'))
        p.on('dialog', lambda dlg: dlg.accept(self.next_prompt.pop(0) if self.next_prompt else None))
        self.next_prompt = []

    def step(self, name, fn, shot=True, allow=()):
        self.errors.clear(); server_log()
        status, detail = 'PASS', ''
        try:
            fn(self.page)
            self.page.wait_for_timeout(400)
        except Exception as e:
            status, detail = 'FAIL', str(e).split('\n')[0][:400]
        srv = [f"server {x['status']} {x.get('code')}: {x['message'][:200]}" for x in server_log()]
        errs = [e for e in self.errors + srv if not any(a in e for a in allow)]
        if status == 'PASS' and errs: status = 'WARN'
        if shot:
            try: self.page.screenshot(path=os.path.join(OUT, re.sub(r'\W+', '-', name.lower()).strip('-') + '.png'), full_page=True)
            except Exception: pass
        RESULTS.append({'step': name, 'status': status, 'detail': detail, 'errors': errs[:8]})
        print(f'[{status}] {name}' + (f' — {detail}' if detail else ''))
        for e in errs[:8]: print('      ', e)

def choose(sel, contains):
    """select the first <option> whose text contains `contains`"""
    sel.wait_for(state='visible')
    for _ in range(40):
        opts = sel.locator('option').all_inner_texts()
        hit = [o for o in opts if contains in o]
        if hit: sel.select_option(label=hit[0]); return
        time.sleep(0.15)
    raise AssertionError(f'option containing {contains!r} not found in {opts}')

def login(p, email, pw=PW):
    p.goto(APP + '/login'); p.get_by_label('Email').fill(email); p.get_by_label('Password').fill(pw)
    p.get_by_role('button', name='Sign in').click()
    p.wait_for_url(re.compile(r'/(my|admin|tasks)$'), timeout=15000)

def logout(r):
    r.new_context()

def register(p, name, mobile, email, project_slug, tower, wing, flat):
    p.goto(APP + f'/register?project={project_slug}')
    p.get_by_label('Full name').fill(name); p.get_by_label('Mobile number').fill(mobile)
    choose(p.get_by_label('Building / tower'), tower)
    choose(p.get_by_label('Wing'), wing)
    choose(p.get_by_label('Flat / unit no.'), flat)
    p.get_by_label('Email').fill(email); p.get_by_label('Password').fill(PW)
    p.get_by_role('button', name='Create account').click()

def main():
    with sync_playwright() as pw:
        r = Run(pw)
        S = r.step

        # ---------------- public / anonymous ----------------
        S('Open the app signed out goes to sign-in', lambda p: (p.goto(APP + '/'), p.wait_for_url('**/login'), expect(p.get_by_role('heading', name='Sign in')).to_be_visible()))
        S('Old project link opens themed registration', lambda p: (p.goto(APP + '/p/mihir-amara'), p.wait_for_url('**/register?project=mihir-amara'), expect(p.get_by_text('Welcome home to Mihir Amara')).to_be_visible()))
        S('Wrong password shows a clear error', lambda p: (p.goto(APP + '/login'), p.get_by_label('Email').fill('nobody@test.com'), p.get_by_label('Password').fill('wrong'), p.get_by_role('button', name='Sign in').click(), expect(p.get_by_text('Email or password is incorrect.')).to_be_visible()), allow=('http 400: POST http://localhost:54321/auth/v1/token',))
        S('Forgot password', lambda p: (p.goto(APP + '/forgot-password'), p.get_by_label('Email').fill('priya@test.com'), p.get_by_role('button', name='Send reset link').click(), expect(p.get_by_text('reset link is on its way')).to_be_visible()))

        # ---------------- customer registration & complaints ----------------
        def reg_priya(p):
            register(p, 'Priya Deshpande', '98220 11111', 'priya@test.com', 'mihir-amara', 'Tower B', 'B', '704')
            p.wait_for_url('**/my', timeout=15000)
            expect(p.get_by_text('Hi Priya')).to_be_visible()
        S('Customer registers for Mihir Amara B-704', reg_priya)
        S('Duplicate registration is refused clearly', lambda p: (logout(r), register(r.page, 'Priya Again', '9822011111', 'priya@test.com', 'mihir-amara', 'Tower B', 'B', '704'), expect(r.page.get_by_text('already exists')).to_be_visible()), allow=('http 422',))

        def raise_leak(p):
            login(p, 'priya@test.com')
            p.get_by_role('link', name='Raise a complaint').first.click(); p.wait_for_url('**/new')
            p.get_by_role('button', name=re.compile('Flat – Plumbing')).click()
            p.get_by_label('Title').fill('Water leaking from bathroom ceiling')
            p.get_by_label('Description').fill('Seepage from the flat above since last night; ceiling is dripping near the light.')
            p.locator('input[type=file]').set_input_files(PHOTO)
            expect(p.locator('.photo img')).to_have_count(1)
            p.get_by_role('button', name='Submit complaint').click()
            p.wait_for_url(re.compile(r'/complaints/[0-9a-f-]{36}$'), timeout=20000)
            expect(p.get_by_text(re.compile(r'CMP-\d{4}-\d{5}'))).to_be_visible()
            p.wait_for_function("() => [...document.querySelectorAll('.photos img')].some(i => i.complete && i.naturalWidth > 0)", timeout=10000)
        S('Customer raises a plumbing complaint with a photo', raise_leak)

        def raise_lift(p):
            p.goto(APP + '/new')
            p.get_by_role('button', name=re.compile('^Lifts')).click()
            p.get_by_label('Exact location').fill('Lift 2, B wing')
            p.get_by_label('Title').fill('Lift stops between floors')
            p.get_by_label('Description').fill('Lift 2 stopped between 3rd and 4th floor twice today.')
            p.get_by_role('button', name='Urgent').click()
            # clicking the caption must not change the choice (it used to select the first button)
            p.get_by_text('How urgent is it?').click()
            expect(p.get_by_role('button', name='Urgent')).to_have_class(re.compile(r'\bon\b'))
            p.get_by_role('button', name='Submit complaint').click()
            p.wait_for_url(re.compile(r'/complaints/'), timeout=20000)
            expect(p.get_by_text('Common area')).to_be_visible()
        S('Customer raises an urgent lift complaint (common area)', raise_lift)
        S('Customer home lists both complaints', lambda p: (p.goto(APP + '/my'), expect(p.get_by_text('Water leaking from bathroom ceiling').first).to_be_visible(), expect(p.get_by_text('Lift stops between floors').first).to_be_visible()))
        S('Customer flats page', lambda p: (p.goto(APP + '/flats'), expect(p.get_by_text('Awaiting verification')).to_be_visible()))
        S('Customer notifications', lambda p: (p.goto(APP + '/notifications'), expect(p.get_by_text(re.compile('registered')).first).to_be_visible()))
        S('Customer cannot open admin pages', lambda p: (p.goto(APP + '/admin/customers'), p.wait_for_url('**/my')))

        # ---------------- admin ----------------
        def make_admin(p):
            logout(r); register(r.page, 'Tanishq Muttha', '9000000001', 'admin@test.com', 'mihir-amara', 'Tower A', 'A', '101')
            r.page.wait_for_url('**/my', timeout=15000)
            sql("update profiles set role='admin' where email='admin@test.com'")
            logout(r); login(r.page, 'admin@test.com')
            r.page.wait_for_url('**/admin')
            expect(r.page.get_by_text('Live complaint desk')).to_be_visible()
        S('Admin bootstrap (register + one SQL line) and dashboard', make_admin)

        def stats_ok(p):
            p.wait_for_timeout(1800)
            vals = p.locator('.stat .v').all_inner_texts()
            assert vals and all(re.match(r'^[\d.]+%?$|^—$', v.strip()) for v in vals), vals
        S('Dashboard figures render (count-up finishes on real numbers)', stats_ok, shot=False)

        def add_emp(p, name, email, role, team, project):
            p.goto(APP + '/admin/employees'); p.get_by_role('button', name='Add employee').click()
            m = p.locator('.modal')
            m.get_by_label('Full name').fill(name); m.get_by_label('Mobile').fill('98765' + str(abs(hash(email)))[:5])
            m.get_by_label('Email (login ID)').fill(email); m.get_by_label('Temporary password').fill(PW)
            m.get_by_label('Role').select_option(label=role)
            if team: m.get_by_label('Team').select_option(label=team)
            if project: m.get_by_role('button', name=project, exact=True).click()
            m.get_by_role('button', name='Save').click()
            expect(p.get_by_text('Employee added')).to_be_visible(timeout=10000)
            expect(p.get_by_role('cell', name=re.compile(name))).to_be_visible()
        S('Admin adds a plumber (runs the admin-users function)', lambda p: add_emp(p, 'Suresh Pawar', 'suresh@test.com', 'Staff / technician', 'Plumbing & Water', 'Mihir Amara'))
        S('Admin adds an Equinox-only manager', lambda p: add_emp(p, 'Neha Kulkarni', 'neha@test.com', 'Manager', None, 'Nyati Equinox'))
        S('Duplicate employee email is refused', lambda p: (p.goto(APP + '/admin/employees'), p.get_by_role('button', name='Add employee').click(),
            p.locator('.modal').get_by_label('Full name').fill('Dup'), p.locator('.modal').get_by_label('Email (login ID)').fill('suresh@test.com'),
            p.locator('.modal').get_by_label('Temporary password').fill(PW), p.locator('.modal').get_by_role('button', name='Save').click(),
            expect(p.locator('.modal .alert-box.error')).to_be_visible()), allow=('http 400', 'server 400 FN'))

        def assign(p):
            p.goto(APP + '/admin/complaints'); p.get_by_role('link', name='Water leaking from bathroom ceiling').first.click()
            p.wait_for_url(re.compile('/complaints/'))
            panel = p.locator('section.panel', has=p.get_by_role('heading', name='Manage task'))
            choose(panel.get_by_label('Assign to'), 'Suresh Pawar')
            panel.get_by_role('button', name='Save changes').click()
            expect(p.get_by_text('Task updated')).to_be_visible()
            expect(p.locator('.page-head .badge.st-assigned')).to_be_visible()
            p.wait_for_timeout(500)
            assert p.get_by_text('Deadline changed').count() == 0, 'assigning changed the deadline'
            p.get_by_placeholder(re.compile('Reply to the customer')).fill('Plumber visiting at 11 am tomorrow. Please keep the bathroom accessible.')
            p.get_by_role('button', name='Send').click(); expect(p.get_by_text('Message sent')).to_be_visible()
            expect(p.get_by_text('Plumber visiting at 11 am tomorrow').first).to_be_visible()
            p.get_by_placeholder(re.compile('Reply to the customer')).fill('Check the flat above (C-804) too.')
            p.get_by_label(re.compile('Internal note')).check(); p.get_by_role('button', name='Add note').click()
            expect(p.get_by_text('Note added')).to_be_visible()
        S('Admin assigns the complaint, replies, adds internal note', assign)

        def customers(p):
            p.goto(APP + '/admin/customers')
            expect(p.get_by_text('Priya Deshpande')).to_be_visible(timeout=10000)
            row = p.locator('tr', has_text='Priya Deshpande')
            row.get_by_role('button', name='Verify').click(); expect(p.get_by_text('Flat verified')).to_be_visible()
            p.get_by_role('button', name='Mihir Amara', exact=True).click(); expect(p.get_by_text('Priya Deshpande')).to_be_visible()
            p.get_by_role('button', name='Nyati Equinox', exact=True).click(); expect(p.get_by_text('No customers found')).to_be_visible()
            p.get_by_role('button', name='All projects').click()
            p.get_by_label('Awaiting verification').check()
            expect(p.get_by_text('No customers found')).to_be_visible()   # Priya is verified now; staff/admins are never listed
            p.get_by_label('Awaiting verification').uncheck()
            expect(p.locator('main table tbody tr, .page table tbody tr')).to_have_count(1)
        S('Customers page loads, verifies flats, filters by project', customers)

        def add_customer(p):
            p.goto(APP + '/admin/customers'); p.get_by_role('button', name='Add customer').click()
            m = p.locator('.modal')
            m.get_by_label('Full name').fill('Rohan Kulkarni'); m.get_by_label('Mobile').fill('9811122233')
            m.get_by_label('Email (login ID)').fill('rohan@test.com'); m.get_by_label(re.compile('Temporary password')).fill(PW)
            choose(m.get_by_label('Project'), 'Nyati Equinox'); choose(m.get_by_label('Building / tower'), 'Building 2')
            choose(m.get_by_label('Wing'), 'A'); choose(m.get_by_label('Flat / unit no.'), '503')
            m.get_by_role('button', name='Add customer').click()
            expect(p.get_by_text('Customer added')).to_be_visible(timeout=10000)
            expect(p.get_by_text('Rohan Kulkarni')).to_be_visible()
        S('Admin adds a customer for Equinox (admin-users function)', add_customer)

        def log_phone(p):
            p.goto(APP + '/admin/complaints/new')
            p.get_by_placeholder('Search by name, mobile or email').fill('Rohan')
            p.get_by_role('button', name=re.compile('Rohan Kulkarni')).click()
            p.locator('label.field', has=p.get_by_text('Category', exact=True)).locator('select').select_option(label='Parking')
            p.get_by_label('Title').fill('Visitor car parked in my slot')
            p.get_by_label('Description').fill('Slot P1-14 occupied by a visitor car every evening.')
            p.get_by_role('button', name='Log complaint').click()
            p.wait_for_url(re.compile(r'/complaints/[0-9a-f-]{36}$'), timeout=15000)
            expect(p.get_by_text('Phone call')).to_be_visible()
        S('Office logs a phone complaint for that customer', log_phone)

        def properties(p):
            p.goto(APP + '/admin/properties')
            p.get_by_role('button', name=re.compile('^Sierra')).click()
            r.next_prompt = ['Tower 3']
            p.locator('.tree .col-head', has_text='Towers').get_by_role('button', name='+ Add').click()
            expect(p.locator('.tree').get_by_text('Tower 3')).to_be_visible()
            p.locator('.tree .item', has_text='Tower 3').click()
            r.next_prompt = ['C']
            p.locator('.tree .col-head', has_text='Wings').get_by_role('button', name='+ Add').click()
            p.locator('.tree .item', has_text='Wing C').click()
            p.get_by_role('button', name='Generate flats').click()
            m = p.locator('.modal'); m.get_by_label('To floor').fill('3'); m.get_by_label('Flats per floor').fill('2')
            m.get_by_role('button', name=re.compile(r'Create \d+ flats')).click()
            expect(p.get_by_text('6 flats created')).to_be_visible()
            expect(p.locator('.flat-cell')).to_have_count(6)
        S('Admin adds a tower, wing and generates flats', properties)

        def branding(p):
            p.goto(APP + '/admin/properties')
            p.get_by_role('button', name=re.compile('^Mihir Amara')).click()
            p.get_by_role('button', name=re.compile('Details & branding')).click()
            m = p.locator('.modal')
            tabs = m.locator('.seg button').all_inner_texts()
            for t in tabs:
                m.get_by_role('button', name=t, exact=True).click(); p.wait_for_timeout(150)
            m.get_by_role('button', name=tabs[1], exact=True).click()
            m.get_by_label('Tagline').fill('3 and 2 bed premium residences in Wakad')
            m.get_by_role('button', name=tabs[-1], exact=True).click()
            m.locator('input[type=file][accept="image/*"]').first.set_input_files(PHOTO)
            p.wait_for_function("() => [...document.querySelectorAll('.modal input')].some(i => i.value.includes('/storage/v1/object/public/project-media/'))", timeout=10000)
            m.get_by_role('button', name='Save project').click()
            expect(p.get_by_text('Project saved')).to_be_visible()
            assert '3 and 2 bed premium residences in Wakad' in sql("select tagline from projects where code='AMR'")
        S('Admin edits project details and uploads a hero photo', branding)

        def settings(p):
            p.goto(APP + '/admin/settings')
            for t in p.locator('.seg button').all_inner_texts():
                p.locator('.seg').get_by_role('button', name=t, exact=True).click(); p.wait_for_timeout(300)
            p.locator('.seg').get_by_role('button', name='Company').click()
            p.get_by_label('Helpdesk phone').first.fill('+91 98999 56284'); p.get_by_role('button', name='Save').first.click()
            expect(p.get_by_text('Settings saved')).to_be_visible()
            p.locator('.seg').get_by_role('button', name='Branding').click()
            p.get_by_role('button', name='Save branding').click(); expect(p.get_by_text('Branding saved')).to_be_visible()
            p.locator('.seg').get_by_role('button', name='Categories & routing').click()
            row = p.locator('tr', has=p.locator('input[value="Other / General Query"]'))
            row.locator('select').nth(3).select_option('medium'); expect(p.get_by_text('Saved').first).to_be_visible()
            p.locator('.seg').get_by_role('button', name='Teams').click()
            r.next_prompt = ['Landscaping']; p.get_by_role('button', name='Add team').click()
            expect(p.locator('input[value="Landscaping"]')).to_be_visible()
            p.locator('.seg').get_by_role('button', name='Deadlines (SLA)').click()
            box = p.locator('input[type=number]').first; box.fill('6'); box.blur(); expect(p.get_by_text('Saved').first).to_be_visible()
        S('Settings: every tab loads and saves', settings)

        def reports(p):
            p.goto(APP + '/admin/reports'); expect(p.get_by_text('Complaints raised')).to_be_visible()
            for t in ['Last 7 days', 'Last 90 days', 'This month', 'This year', 'Last 30 days']:
                p.get_by_role('button', name=t).click(); p.wait_for_timeout(250)
            with p.expect_download() as d: p.get_by_role('button', name='Team performance CSV').click()
            assert d.value.suggested_filename.endswith('.csv')
            p.get_by_role('button', name='Nyati Equinox', exact=True).click(); p.wait_for_timeout(500)
        S('Reports: ranges, project filter, CSV export', reports)

        def complaints_list(p):
            p.goto(APP + '/admin/complaints'); expect(p.get_by_text('Visitor car parked in my slot').first).to_be_visible()
            p.get_by_placeholder(re.compile('Search ID')).fill('lift'); p.wait_for_timeout(900)
            expect(p.get_by_text('Lift stops between floors').first).to_be_visible(); expect(p.get_by_text('Visitor car parked')).to_have_count(0)
            p.get_by_role('button', name='Clear filters').click()
            p.get_by_label('Unassigned').check(); p.wait_for_timeout(500)
            with p.expect_download() as d: p.get_by_role('button', name='Export CSV').click()
            path = d.value.path(); data = open(path, encoding='utf-8-sig').read()
            assert 'Complaint ID' in data and 'CMP-' in data, data[:200]
            p.get_by_role('button', name='All', exact=True).click(); p.wait_for_timeout(400)
        S('Complaints list: search, filters, CSV export', complaints_list)
        S('Customer search (Log a complaint) finds people', lambda p: (p.goto(APP + '/admin/complaints/new'), p.get_by_placeholder('Search by name, mobile or email').fill('9822'), expect(p.get_by_role('button', name=re.compile('Priya Deshpande'))).to_be_visible()))
        S('Admin notifications + mark all read', lambda p: (p.goto(APP + '/notifications'), expect(p.get_by_text(re.compile('Unassigned complaint')).first).to_be_visible(), p.get_by_role('button', name='Mark all as read').click(), expect(p.get_by_text('You are all caught up.')).to_be_visible()))

        # ---------------- staff ----------------
        def staff(p):
            logout(r); login(r.page, 'suresh@test.com'); p = r.page
            p.wait_for_url('**/tasks'); expect(p.get_by_text('Water leaking from bathroom ceiling').first).to_be_visible()
            expect(p.get_by_text('Lift stops between floors')).to_have_count(0)
            p.get_by_role('link', name='Water leaking from bathroom ceiling').first.click()
            p.get_by_role('button', name='Start work').click(); expect(p.get_by_text('Marked in progress')).to_be_visible()
            p.get_by_role('button', name='Mark resolved').click()
            m = p.locator('.modal'); m.get_by_label('What was done?').fill('Replaced the leaking joint in C-804 and resealed the ceiling.')
            m.locator('input[type=file]').set_input_files(PHOTO)
            m.get_by_role('button', name='Mark resolved').click()
            expect(p.get_by_text('Marked resolved')).to_be_visible(timeout=15000)
            expect(p.get_by_role('heading', name='Resolution')).to_be_visible()
            p.goto(APP + '/admin'); p.wait_for_url('**/tasks')
        S('Technician sees only their task, starts and resolves it with photo', staff)

        def scoped_manager(p):
            logout(r); login(r.page, 'neha@test.com'); p = r.page
            p.wait_for_url('**/admin'); p.goto(APP + '/admin/complaints')
            expect(p.get_by_text('Visitor car parked in my slot').first).to_be_visible()
            expect(p.get_by_text('Water leaking from bathroom ceiling')).to_have_count(0)
            p.goto(APP + '/admin/customers'); expect(p.get_by_text('Rohan Kulkarni')).to_be_visible(); expect(p.get_by_text('Priya Deshpande')).to_have_count(0)
            p.goto(APP + '/admin/employees'); p.wait_for_url('**/admin')
        S('Equinox manager sees only Equinox complaints & customers', scoped_manager)

        # ---------------- customer closes & reopens ----------------
        def close_reopen(p):
            logout(r); login(r.page, 'priya@test.com'); p = r.page
            expect(p.get_by_text(re.compile('marked resolved'))).to_be_visible()
            p.get_by_role('button', name='Review now').click()
            p.get_by_role('link', name='Water leaking from bathroom ceiling').first.click()
            expect(p.get_by_text('Plumber visiting at 11 am tomorrow')).to_be_visible()
            expect(p.get_by_text('Check the flat above')).to_have_count(0)
            p.get_by_role('button', name=re.compile('Confirm fix')).click()
            p.locator('.modal .stars button').nth(3).click(); p.locator('.modal textarea').fill('Quick and clean work')
            p.get_by_role('button', name='Close complaint').click()
            expect(p.get_by_text('Thank you! Complaint closed.')).to_be_visible()
            expect(p.locator('.page-head .badge.st-closed')).to_be_visible()
            p.get_by_role('button', name='Reopen').click()
            p.locator('.modal textarea').fill('Dripping again tonight'); p.locator('.modal').get_by_role('button', name='Reopen').click()
            expect(p.get_by_text('Complaint reopened')).to_be_visible()
            expect(p.get_by_text('Reopened ×1')).to_be_visible()
        S('Customer sees reply (not internal note), closes with rating, reopens', close_reopen)

        def profile(p):
            p.goto(APP + '/profile'); p.get_by_label('Mobile number').fill('9822099999'); p.get_by_role('button', name='Save profile').click()
            expect(p.get_by_text('Profile saved')).to_be_visible()
            assert sql("select mobile from profiles where email='priya@test.com'") == '9822099999'
        S('Customer updates profile', profile)

        # ---------------- overdue escalation ----------------
        def overdue(p):
            sql("update complaints set due_at = now() - interval '3 hours' where title='Lift stops between floors'")
            n = sql('select public.notify_overdue_complaints()')
            assert n == '1', n
            logout(r); login(r.page, 'admin@test.com'); p = r.page
            p.wait_for_timeout(1500)
            expect(p.locator('.stat.alert .v')).to_have_text('1')
            expect(p.get_by_text('Overdue by').first).to_be_visible()
        S('Overdue job escalates and dashboard flags it', overdue)

        # ---------------- mobile ----------------
        def mobile(p):
            r.new_context(mobile=True); p = r.page
            p.goto(APP + '/login'); p.screenshot(path=os.path.join(OUT, 'm-login.png'))
            login(p, 'priya@test.com'); p.wait_for_timeout(800); p.screenshot(path=os.path.join(OUT, 'm-home.png'))
            p.locator('.bottom-nav').get_by_role('link', name='Raise').click(); p.wait_for_url('**/new'); p.screenshot(path=os.path.join(OUT, 'm-new.png'), full_page=True)
            sw = p.evaluate('document.documentElement.scrollWidth'); assert sw <= 391, f'horizontal overflow {sw}'
            p.goto(APP + '/my'); p.locator('.list-item').first.click(); p.wait_for_timeout(800); p.screenshot(path=os.path.join(OUT, 'm-detail.png'), full_page=True)
            sw = p.evaluate('document.documentElement.scrollWidth'); assert sw <= 391, f'horizontal overflow {sw}'
            r.new_context(mobile=True); p = r.page; login(p, 'admin@test.com'); p.wait_for_timeout(1500)
            p.screenshot(path=os.path.join(OUT, 'm-admin.png'), full_page=True)
            sw = p.evaluate('document.documentElement.scrollWidth'); assert sw <= 391, f'horizontal overflow {sw}'
            p.locator('.bottom-nav').get_by_role('link', name='More').click(); p.wait_for_url('**/more')
            p.goto(APP + '/admin/complaints'); p.wait_for_timeout(800); p.screenshot(path=os.path.join(OUT, 'm-complaints.png'))
            sw = p.evaluate('document.documentElement.scrollWidth'); assert sw <= 391, f'horizontal overflow {sw}'
        S('Mobile: customer + admin screens, no sideways scrolling', mobile, shot=False)

        r.browser.close()
    json.dump(RESULTS, open(os.path.join(OUT, 'results.json'), 'w'), indent=1)
    c = {k: sum(1 for x in RESULTS if x['status'] == k) for k in ('PASS', 'WARN', 'FAIL')}
    print('\nSUMMARY', c)

if __name__ == '__main__':
    main()
