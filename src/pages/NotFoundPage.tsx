import { Compass } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/common';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/primitives';

export function NotFoundPage() {
  return (
    <Card>
      <EmptyState
        icon={Compass}
        title="Page not found"
        description="The page you requested does not exist or has moved."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        }
      />
    </Card>
  );
}
