import { Database, KeyRound, RefreshCw, Repeat, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { KeyValue, MockTag, PageHeader } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/primitives';
import { useProjects, useResetDemo, useSession, useSwitchUser } from '@/hooks/queries';
import { formatDate } from '@/lib/utils';

export function ProfilePage() {
  const { data: session } = useSession();
  const { data: projects } = useProjects();
  const switchUser = useSwitchUser();
  const reset = useResetDemo();
  const navigate = useNavigate();
  if (!session) return null;
  const u = session.user;
  const other = u.role === 'engineer' ? 'manager.demo@meridian-energy.example' : 'engineer.demo@meridian-energy.example';
  return (
    <>
      <PageHeader title="Profile & settings" crumbs={[{ label: 'Dashboard', to: '/dashboard' }, { label: 'Profile' }]} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <MockTag>Demo account</MockTag>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="flex items-center gap-4">
              <span className="grid size-14 place-items-center rounded-full bg-navy-800 text-lg font-semibold text-white">{u.initials}</span>
              <div>
                <p className="text-base font-semibold text-slate-900">{u.name}</p>
                <p className="text-sm text-slate-500">{u.title}</p>
              </div>
            </div>
            <KeyValue
              items={[
                { label: 'Email', value: u.email },
                { label: 'Role', value: u.role === 'engineer' ? 'Engineer' : 'Manager' },
                { label: 'Department', value: u.department },
                { label: 'Session expires', value: formatDate(session.expiresAt, true) },
                { label: 'Project membership', value: projects?.map((p) => p.code).join(', ') },
              ]}
            />
            <div className="flex flex-wrap gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                onClick={async () => {
                  await switchUser.mutateAsync(other);
                  navigate('/dashboard');
                  toast.success('Switched demo user');
                }}
              >
                <Repeat /> Switch to {u.role === 'engineer' ? 'Manager' : 'Engineer'} demo
              </Button>
              <Button
                variant="outline"
                loading={reset.isPending}
                onClick={() =>
                  reset.mutate(undefined, {
                    onSuccess: () => toast.success('Demo data reset'),
                  })
                }
              >
                <RefreshCw /> Reset demo data
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="size-4 text-accent" /> Prototype security notice
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-slate-600">
            <p className="flex gap-3">
              <KeyRound className="mt-0.5 size-4 shrink-0 text-slate-400" />
              Sign-in is <strong>mock authentication</strong>. No passwords or tokens are stored. In production, sessions must be HttpOnly, Secure, SameSite cookies issued by the identity provider and invalidated server-side on logout.
            </p>
            <p className="flex gap-3">
              <Database className="mt-0.5 size-4 shrink-0 text-slate-400" />
              Browser storage holds only the demo user id and synthetic workflow metadata (documents, findings, audit events). Uploaded workbook contents stay in memory and are discarded on refresh.
            </p>
            <p className="flex gap-3">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-slate-400" />
              Role and permission checks in the browser are for usability only and can be bypassed. The backend must enforce authentication, authorisation, project membership and workflow transitions on every request.
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
