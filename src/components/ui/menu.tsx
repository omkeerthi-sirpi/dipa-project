import * as React from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import { cn } from '@/lib/utils';

export const Menu = DropdownMenu.Root;
export const MenuTrigger = DropdownMenu.Trigger;
export const MenuLabel = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownMenu.Label>) => (
  <DropdownMenu.Label className={cn('px-3 py-2 text-xs font-semibold text-slate-500', className)} {...p} />
);
export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-slate-100" />;

export function MenuContent({ className, align = 'end', ...p }: React.ComponentPropsWithoutRef<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content align={align} sideOffset={8} className={cn('z-50 min-w-56 overflow-hidden rounded-lg border border-border bg-white p-1 shadow-xl', className)} {...p} />
    </DropdownMenu.Portal>
  );
}

export function MenuItem({ className, ...p }: React.ComponentPropsWithoutRef<typeof DropdownMenu.Item>) {
  return (
    <DropdownMenu.Item
      className={cn('flex cursor-pointer select-none items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-700 outline-none data-[highlighted]:bg-slate-100 data-[highlighted]:text-slate-900 [&_svg]:size-4 [&_svg]:text-slate-400', className)}
      {...p}
    />
  );
}

export const Tabs = TabsPrimitive.Root;
export function TabsList({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn('flex gap-1 overflow-x-auto border-b border-border', className)} {...p} />;
}
export function TabsTrigger({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        '-mb-px inline-flex cursor-pointer items-center gap-2 whitespace-nowrap border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-slate-500 hover:text-slate-800 data-[state=active]:border-accent data-[state=active]:text-navy-900 [&_svg]:size-4',
        className,
      )}
      {...p}
    />
  );
}
export const TabsContent = ({ className, ...p }: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>) => <TabsPrimitive.Content className={cn('pt-5 outline-none', className)} {...p} />;
