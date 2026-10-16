import type { LucideIcon } from 'lucide-react';
import {
  Bell,
  Bot,
  ChartColumn,
  CheckCheck,
  ClipboardCheck,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  FolderKanban,
  Hourglass,
  Inbox,
  LayoutDashboard,
  LogOut,
  Menu as MenuIcon,
  RefreshCw,
  Repeat,
  Search,
  Send,
  ShieldCheck,
  History,
  Upload,
  UserRound,
  X,
} from 'lucide-react';
import { Suspense, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageLoading } from '@/components/common';
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from '@/components/ui/menu';
import { useLogout, useMarkNotificationsRead, useNotifications, useResetDemo, useSession, useSwitchUser } from '@/hooks/queries';
import { cn, relativeTime } from '@/lib/utils';
import type { Role } from '@/types';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
}

export const NAV: Record<Role, { section?: string; items: NavItem[] }[]> = {
  engineer: [
    {
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/documents', label: 'My Documents', icon: FileSpreadsheet, end: true },
        { to: '/upload', label: 'Upload Document', icon: Upload },
      ],
    },
    {
      section: 'Assurance',
      items: [
        { to: '/validate', label: 'Validation Chatbot', icon: Bot },
        { to: '/reports', label: 'Validation Reports', icon: FileText },
        { to: '/manual-testing', label: 'Manual Testing', icon: ClipboardCheck },
        { to: '/tracking', label: 'Approval Tracking', icon: Hourglass },
      ],
    },
    { section: 'Records', items: [{ to: '/audit', label: 'Audit History', icon: History }] },
  ],
  manager: [
    {
      items: [
        { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { to: '/approvals', label: 'Approval Queue', icon: Inbox },
        { to: '/documents', label: 'All Documents', icon: FileSpreadsheet, end: true },
        { to: '/projects', label: 'Project Overview', icon: FolderKanban },
      ],
    },
    {
      section: 'Release',
      items: [
        { to: '/approved', label: 'Approved Documents', icon: ShieldCheck },
        { to: '/vendor', label: 'Vendor Submissions', icon: Send },
      ],
    },
    {
      section: 'Insight',
      items: [
        { to: '/analytics', label: 'Reports & Analytics', icon: ChartColumn },
        { to: '/audit', label: 'Audit History', icon: History },
      ],
    },
  ],
};

function Brand() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2.5 px-5 py-5">
      <span className="grid size-9 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
        <FileCheck2 className="size-5 text-accent" aria-hidden />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-semibold tracking-wide text-white">DIPA</span>
        <span className="block text-[10px] uppercase tracking-[0.12em] text-navy-300">Document Assurance</span>
      </span>
    </Link>
  );
}

function Sidebar({ role, onNavigate }: { role: Role; onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-navy-900 text-navy-100">
      <Brand />
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4" aria-label="Main navigation">
        {NAV[role].map((group, gi) => (
          <div key={gi}>
            {group.section && <p className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-navy-400">{group.section}</p>}
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      cn(
                        'relative flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                        isActive ? 'bg-white/10 font-medium text-white before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-accent' : 'text-navy-200 hover:bg-white/5 hover:text-white',
                      )
                    }
                  >
                    <item.icon className="size-[18px] shrink-0" aria-hidden />
                    {item.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <p className="flex items-center gap-2 border-t border-white/10 px-5 py-3 text-[11px] text-navy-300">
        <span className="size-1.5 rounded-full bg-accent" aria-hidden /> Prototype · synthetic data
      </p>
    </div>
  );
}

function Notifications() {
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const navigate = useNavigate();
  const unread = data?.filter((n) => !n.read).length ?? 0;
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="relative grid size-9 cursor-pointer place-items-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-800" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="size-[18px]" />
          {unread > 0 && <span className="absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">{unread}</span>}
        </button>
      </MenuTrigger>
      <MenuContent className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold text-slate-800">Notifications</span>
          {unread > 0 && (
            <button type="button" className="flex cursor-pointer items-center gap-1 text-xs text-navy-600 hover:underline" onClick={() => markRead.mutate(undefined)}>
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>
        <div className="max-h-96 overflow-y-auto p-1">
          {!data?.length && <p className="px-3 py-6 text-center text-sm text-slate-500">You're all caught up.</p>}
          {data?.slice(0, 8).map((n) => (
            <MenuItem
              key={n.id}
              className="items-start"
              onSelect={() => {
                if (!n.read) markRead.mutate([n.id]);
                navigate(n.link);
              }}
            >
              <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-accent')} aria-hidden />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-slate-800">{n.title}</span>
                <span className="block truncate text-xs text-slate-500">{n.body}</span>
                <span className="block text-[11px] text-slate-400">{relativeTime(n.createdAt)}</span>
              </span>
            </MenuItem>
          ))}
        </div>
        <div className="border-t border-border p-1">
          <MenuItem onSelect={() => navigate('/notifications')} className="justify-center text-xs text-navy-600">
            View all notifications
          </MenuItem>
        </div>
      </MenuContent>
    </Menu>
  );
}

function ProfileMenu() {
  const { data: session } = useSession();
  const logout = useLogout();
  const switchUser = useSwitchUser();
  const reset = useResetDemo();
  const navigate = useNavigate();
  if (!session) return null;
  const u = session.user;
  const switchTo = u.role === 'engineer' ? { email: 'manager.demo@meridian-energy.example', label: 'Manager Demo' } : { email: 'engineer.demo@meridian-energy.example', label: 'Engineer Demo' };
  return (
    <Menu>
      <MenuTrigger asChild>
        <button type="button" className="flex cursor-pointer items-center gap-2.5 rounded-md py-1 pl-1 pr-2 hover:bg-slate-100" aria-label="Account menu">
          <span className="grid size-8 place-items-center rounded-full bg-navy-800 text-xs font-semibold text-white">{u.initials}</span>
          <span className="hidden text-left leading-tight md:block">
            <span className="block text-sm font-medium text-slate-800">{u.name}</span>
            <span className="block text-[11px] text-slate-500">{u.role === 'engineer' ? 'Engineer' : 'Manager'}</span>
          </span>
        </button>
      </MenuTrigger>
      <MenuContent>
        <MenuLabel>
          <span className="block text-sm font-semibold text-slate-800">{u.name}</span>
          <span className="block font-normal">{u.title}</span>
        </MenuLabel>
        <MenuSeparator />
        <MenuItem onSelect={() => navigate('/profile')}>
          <UserRound /> Profile &amp; settings
        </MenuItem>
        <MenuItem
          onSelect={async () => {
            await switchUser.mutateAsync(switchTo.email);
            navigate('/dashboard');
            toast.success(`Switched to ${switchTo.label}`);
          }}
        >
          <Repeat /> Switch to {switchTo.label}
        </MenuItem>
        <MenuItem
          onSelect={async () => {
            await reset.mutateAsync();
            navigate('/dashboard');
            toast.success('Demo data reset to the original seed');
          }}
        >
          <RefreshCw /> Reset demo data
        </MenuItem>
        <MenuSeparator />
        <MenuItem
          onSelect={async () => {
            await logout.mutateAsync();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut /> Sign out
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

function TopSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  return (
    <form
      role="search"
      className="relative hidden w-full max-w-md sm:block"
      onSubmit={(e) => {
        e.preventDefault();
        navigate(`/documents?q=${encodeURIComponent(q.trim().slice(0, 100))}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        maxLength={100}
        placeholder="Search documents, tags, projects…"
        aria-label="Search documents"
        className="h-9 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-navy-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-navy-500/15"
      />
    </form>
  );
}

export function AppLayout() {
  const { data: session } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);
  const location = useLocation();
  if (!session) return null;
  const role = session.user.role;
  return (
    <div className="flex h-full">
      <aside className="no-print hidden w-64 shrink-0 lg:block">
        <div className="fixed inset-y-0 w-64">
          <Sidebar role={role} />
        </div>
      </aside>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-navy-950/50" onClick={() => setMobileOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-2xl">
            <Sidebar role={role} onNavigate={() => setMobileOpen(false)} />
            <button type="button" className="absolute right-2 top-5 cursor-pointer rounded p-1 text-navy-200 hover:text-white" onClick={() => setMobileOpen(false)} aria-label="Close navigation">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur sm:px-6">
          <button type="button" className="grid size-9 cursor-pointer place-items-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <MenuIcon className="size-5" />
          </button>
          <TopSearch />
          <div className="ml-auto flex items-center gap-1.5">
            <Notifications />
            <ProfileMenu />
          </div>
        </header>
        <main className="print-full mx-auto w-full max-w-[1400px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          <Suspense fallback={<PageLoading />} key={location.pathname}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  );
}
