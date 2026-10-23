import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { useAuth, homePath } from './lib/auth';
import { supabaseConfigured } from './lib/supabase';
import Layout, { MoreMenu } from './components/Layout';
import { Loading } from './components/UI';

import Login from './pages/auth/Login';
import Register from './pages/auth/Register';
import { ForgotPassword, ResetPassword } from './pages/auth/Password';

import CustomerHome from './pages/customer/CustomerHome';
import NewComplaint from './pages/customer/NewComplaint';
import MyFlats from './pages/customer/MyFlats';

import ComplaintDetail from './pages/shared/ComplaintDetail';
import Notifications from './pages/shared/Notifications';
import Profile from './pages/shared/Profile';

const Dashboard = lazy(() => import('./pages/admin/Dashboard'));
const Complaints = lazy(() => import('./pages/admin/Complaints'));
const LogComplaint = lazy(() => import('./pages/admin/LogComplaint'));
const Customers = lazy(() => import('./pages/admin/Customers'));
const Employees = lazy(() => import('./pages/admin/Employees'));
const Properties = lazy(() => import('./pages/admin/Properties'));
const Settings = lazy(() => import('./pages/admin/Settings'));
const Reports = lazy(() => import('./pages/admin/Reports'));

function NotConfigured() {
  return (
    <div className="page narrow" style={{ margin: '40px auto' }}>
      <div className="panel panel-pad stack">
        <h1>Almost there</h1>
        <p>Connect the app to your Supabase project: copy <code>.env.example</code> to <code>.env</code>, fill in
          <code> VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then restart. See README.md for the full setup.</p>
      </div>
    </div>
  );
}

// Signed-in area. `roles` limits who may enter.
function RequireAuth({ roles, children }) {
  const { session, profile, loading, recovery } = useAuth();
  const loc = useLocation();
  if (loading) return <Loading />;
  if (recovery && loc.pathname !== '/reset-password') return <Navigate to="/reset-password" replace />;
  if (!session) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (!profile) return <Loading />;
  if (roles && !roles.includes(profile.role)) return <Navigate to={homePath(profile.role)} replace />;
  return children;
}

function PublicOnly({ children }) {
  const { session, profile, loading, recovery } = useAuth();
  if (loading) return <Loading />;
  if (recovery) return <Navigate to="/reset-password" replace />;
  if (session && profile) return <Navigate to={homePath(profile.role)} replace />;
  return children;
}

function Home() {
  const { profile } = useAuth();
  return <Navigate to={homePath(profile.role)} replace />;
}

// Old project-page links (/p/<slug>) now open that project's themed registration
function ProjectLink() {
  const { slug } = useParams();
  return <Navigate to={`/register?project=${encodeURIComponent(slug)}`} replace />;
}

const STAFF = ['staff', 'manager', 'admin'];
const MANAGERS = ['manager', 'admin'];

export default function App() {
  if (!supabaseConfigured) return <NotConfigured />;
  return (
    <Suspense fallback={<Loading />}>
    <Routes>
      {/* No public website: the app opens straight into the portal (sign-in when signed out). */}
      <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
      <Route path="/p/:slug" element={<ProjectLink />} />
      <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
      <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
      <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
      <Route path="/reset-password" element={<ResetPassword />} />

      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route path="/home" element={<Home />} />
        <Route path="/complaints/:id" element={<ComplaintDetail />} />
        <Route path="/notifications" element={<Notifications />} />
        <Route path="/profile" element={<Profile />} />

        <Route path="/my" element={<RequireAuth roles={['customer']}><CustomerHome /></RequireAuth>} />
        <Route path="/new" element={<RequireAuth roles={['customer']}><NewComplaint /></RequireAuth>} />
        <Route path="/flats" element={<RequireAuth roles={['customer']}><MyFlats /></RequireAuth>} />

        <Route path="/tasks" element={<RequireAuth roles={STAFF}><Complaints mode="mine" /></RequireAuth>} />
        <Route path="/more" element={<RequireAuth roles={STAFF}><MoreMenu /></RequireAuth>} />

        <Route path="/admin" element={<RequireAuth roles={MANAGERS}><Dashboard /></RequireAuth>} />
        <Route path="/admin/complaints" element={<RequireAuth roles={MANAGERS}><Complaints mode="all" /></RequireAuth>} />
        <Route path="/admin/complaints/new" element={<RequireAuth roles={MANAGERS}><LogComplaint /></RequireAuth>} />
        <Route path="/admin/customers" element={<RequireAuth roles={MANAGERS}><Customers /></RequireAuth>} />
        <Route path="/admin/reports" element={<RequireAuth roles={MANAGERS}><Reports /></RequireAuth>} />
        <Route path="/admin/employees" element={<RequireAuth roles={['admin']}><Employees /></RequireAuth>} />
        <Route path="/admin/properties" element={<RequireAuth roles={['admin']}><Properties /></RequireAuth>} />
        <Route path="/admin/settings" element={<RequireAuth roles={['admin']}><Settings /></RequireAuth>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
  );
}
