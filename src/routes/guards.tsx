import { LoaderCircle, Lock } from 'lucide-react';
import { Link, Navigate, Outlet, useLocation } from 'react-router';
import { EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';
import { useSession } from '@/hooks/queries';
import type { Role } from '@/types';

export function FullScreenLoader() {
  return (
    <div className="grid h-full place-items-center bg-background" aria-busy="true">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <LoaderCircle className="size-5 animate-spin text-navy-600" /> Loading workspace…
      </div>
    </div>
  );
}

/**
 * Route guard. Improves usability only — the API independently rejects
 * unauthenticated (401) and unauthorised (403) requests.
 */
export function RequireAuth() {
  const { data: session, isLoading } = useSession();
  const location = useLocation();
  if (isLoading) return <FullScreenLoader />;
  if (!session) return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

export function RequireRole({ role }: { role: Role }) {
  const { data: session } = useSession();
  if (session && session.user.role !== role) return <Forbidden role={role} />;
  return <Outlet />;
}

export function Forbidden({ role }: { role?: Role }) {
  return (
    <Card>
      <EmptyState
        icon={Lock}
        title="403 — Not available for your role"
        description={role ? `This area is restricted to ${role === 'manager' ? 'Responsible Engineers' : 'Discipline Engineers'}. Role checks are also enforced by the API.` : 'You do not have access to this page.'}
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    </Card>
  );
}
