import { useCallback, useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { getMyFlats, unreadCount } from '../lib/api';
import { applyTheme, clearTheme } from '../lib/theme';
import { initials } from '../lib/utils';
import { ROLE_LABEL } from '../lib/constants';
import Icon from './Icons';

function navFor(role) {
  if (role === 'customer') {
    return {
      side: [
        { to: '/my', icon: 'list', label: 'My complaints' },
        { to: '/new', icon: 'plus', label: 'Raise a complaint' },
        { to: '/flats', icon: 'building', label: 'My flats' },
      ],
      bottom: [
        { to: '/my', icon: 'list', label: 'Complaints' },
        { to: '/new', icon: 'plus', label: 'Raise', raise: true },
        { to: '/notifications', icon: 'bell', label: 'Alerts', bell: true },
        { to: '/profile', icon: 'user', label: 'Profile' },
      ],
    };
  }
  if (role === 'staff') {
    return {
      side: [{ to: '/tasks', icon: 'wrench', label: 'My tasks' }],
      bottom: [
        { to: '/tasks', icon: 'wrench', label: 'Tasks' },
        { to: '/notifications', icon: 'bell', label: 'Alerts', bell: true },
        { to: '/profile', icon: 'user', label: 'Profile' },
      ],
    };
  }
  const admin = role === 'admin';
  const side = [
    { to: '/admin', icon: 'gauge', label: 'Dashboard', end: true },
    { to: '/admin/complaints', icon: 'list', label: 'Complaints' },
    { to: '/admin/complaints/new', icon: 'phone', label: 'Log a complaint' },
    { to: '/tasks', icon: 'wrench', label: 'My tasks' },
    { group: 'People' },
    { to: '/admin/customers', icon: 'users', label: 'Customers' },
    ...(admin ? [{ to: '/admin/employees', icon: 'user', label: 'Employees' }] : []),
    { group: 'Insights' },
    { to: '/admin/reports', icon: 'chart', label: 'Reports' },
    ...(admin ? [
      { group: 'Setup' },
      { to: '/admin/properties', icon: 'building', label: 'Projects & flats' },
      { to: '/admin/settings', icon: 'settings', label: 'Settings' },
    ] : []),
  ];
  return {
    side,
    bottom: [
      { to: '/admin', icon: 'gauge', label: 'Dashboard', end: true },
      { to: '/admin/complaints', icon: 'list', label: 'Complaints' },
      { to: '/admin/reports', icon: 'chart', label: 'Reports' },
      { to: '/notifications', icon: 'bell', label: 'Alerts', bell: true },
      { to: '/more', icon: 'settings', label: 'More' },
    ],
  };
}

export default function Layout() {
  const { profile, settings, signOut } = useAuth();
  const [unread, setUnread] = useState(0);
  const loc = useLocation();
  const nav = useNavigate();
  const company = settings.company_name || 'CareDesk';
  const { side, bottom } = navFor(profile.role);
  const isCustomer = profile.role === 'customer';

  // customers: load linked flats and dress the whole portal in their project's theme
  const [myFlats, setMyFlats] = useState(null);
  const reloadFlats = useCallback(
    () => (isCustomer ? getMyFlats(profile.id).then(setMyFlats).catch(() => setMyFlats([])) : Promise.resolve(setMyFlats([]))),
    [isCustomer, profile.id]
  );
  useEffect(() => { reloadFlats(); }, [reloadFlats]);
  const activeProject = useMemo(() => {
    const list = myFlats || [];
    return (list.find((f) => f.is_primary) || list[0])?.flat?.wing?.tower?.project || null;
  }, [myFlats]);
  useEffect(() => {
    if (activeProject) applyTheme(activeProject);
    return () => clearTheme();
  }, [activeProject]);

  useEffect(() => {
    let alive = true;
    const refresh = () => unreadCount().then((n) => alive && setUnread(n)).catch(() => {});
    refresh();
    const ch = supabase
      .channel(`notif-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profile.id}` }, refresh)
      .subscribe();
    const t = setInterval(refresh, 60000);
    window.addEventListener('notifications:changed', refresh);
    return () => { alive = false; supabase.removeChannel(ch); clearInterval(t); window.removeEventListener('notifications:changed', refresh); };
  }, [profile.id]);

  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);

  const brand = (
    <div className="brand">
      <img src="/icon.svg" alt="" />
      <div><b>{activeProject ? activeProject.name : company}</b><small>{activeProject ? `${company} · Customer care` : 'Customer care & CRM'}</small></div>
    </div>
  );

  return (
    <div className="shell">
      <aside className="sidebar">
        {brand}
        <nav className="nav" aria-label="Main">
          {side.map((n, i) =>
            n.group ? <div key={i} className="group">{n.group}</div> : (
              <NavLink key={n.to} to={n.to} end={n.end ?? n.to !== '/admin/complaints'}>
                <Icon name={n.icon} />{n.label}
              </NavLink>
            )
          )}
          <NavLink to="/notifications"><Icon name="bell" />Notifications{unread > 0 && <span className="count">{unread}</span>}</NavLink>
        </nav>
        <div className="me">
          <NavLink to="/profile" className="avatar" title="Profile">{initials(profile.full_name)}</NavLink>
          <div className="who"><b>{profile.full_name}</b><small>{ROLE_LABEL[profile.role]}{profile.team ? ` · ${profile.team.name}` : ''}</small></div>
          <button className="icon-btn" onClick={() => signOut().then(() => nav('/login'))} title="Sign out" aria-label="Sign out"><Icon name="logout" /></button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          {brand}
          <NavLink to="/notifications" className="icon-btn" aria-label="Notifications" style={{ color: '#fff' }}>
            <Icon name="bell" />{unread > 0 && <span className="dot">{unread > 99 ? '99+' : unread}</span>}
          </NavLink>
        </header>
        <Outlet context={{ myFlats, activeProject, reloadFlats }} />
      </div>

      <nav className="bottom-nav" aria-label="Main">
        {bottom.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={n.raise ? 'raise' : ''}>
            <Icon name={n.icon} />{n.label}{n.bell && unread > 0 ? ` (${unread})` : ''}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

// Mobile "More" page for managers/admins (sidebar items that don't fit the bottom bar)
export function MoreMenu() {
  const { profile, signOut } = useAuth();
  const nav = useNavigate();
  const items = navFor(profile.role).side.filter((n) => !n.group);
  return (
    <div className="page narrow">
      <div className="page-head"><h1>More</h1></div>
      <div className="panel list">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} className="list-item"><span className="row"><Icon name={n.icon} size={20} />{n.label}</span></NavLink>
        ))}
        <NavLink to="/profile" className="list-item"><span className="row"><Icon name="user" size={20} />My profile</span></NavLink>
        <button className="list-item linkish" style={{ textAlign: 'left', width: '100%' }} onClick={() => signOut().then(() => nav('/login'))}>
          <span className="row"><Icon name="logout" size={20} />Sign out</span>
        </button>
      </div>
    </div>
  );
}
