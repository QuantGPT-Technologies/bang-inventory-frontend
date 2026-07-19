'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import {
  LayoutDashboard, Factory, Package2, Users, Building2,
  Truck, FlaskConical, Wrench, Layers, Webhook, Workflow,
  BarChart3, LogOut, ChevronRight
} from 'lucide-react';

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  {
    label: 'Production',
    items: [
      { href: '/batches', label: 'Batches', icon: Factory, resource: 'batches', action: 'read' },
      { href: '/lots', label: 'Lots', icon: Layers, resource: 'lots', action: 'read' },
      { href: '/workflow-templates', label: 'Workflow Templates', icon: Workflow, resource: 'workflow_templates', action: 'read' },
    ],
  },
  {
    label: 'Master Data',
    items: [
      { href: '/skus', label: 'SKUs', icon: Package2, resource: 'skus', action: 'read' },
      { href: '/raw-materials', label: 'Raw Materials', icon: FlaskConical, resource: 'raw_materials', action: 'read' },
      { href: '/consumables', label: 'Consumables', icon: Wrench, resource: 'consumables', action: 'read' },
      { href: '/customers', label: 'Customers', icon: Building2, resource: 'customers', action: 'read' },
      { href: '/vendors', label: 'Vendors', icon: Truck, resource: 'vendors', action: 'read' },
    ],
  },
  {
    label: 'Admin',
    items: [
      { href: '/users', label: 'Users', icon: Users, resource: 'users', action: 'crud' },
      { href: '/webhooks', label: 'Webhooks', icon: Webhook, resource: 'webhooks', action: 'crud' },
    ],
  },
  {
    label: 'Analytics',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3, resource: 'reports', action: 'view' },
    ],
  },
] as const;

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <aside className="w-56 flex-shrink-0 bg-[var(--ink)] text-[var(--paper)] flex flex-col h-screen sticky top-0">
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-[var(--accent)] flex items-center justify-center text-white font-bold text-xs">
            B
          </div>
          <div>
            <p className="font-semibold text-sm text-[var(--paper)] leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
              Bang Inventory
            </p>
            <p className="text-[10px] text-white/40 leading-tight">Production Tracker</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
        {navItems.map((section, si) => {
          if ('href' in section) {
            return (
              <NavLink key={section.href} href={section.href} icon={section.icon} active={isActive(section.href)}>
                {section.label}
              </NavLink>
            );
          }
          const visibleItems = section.items.filter(
            (item) => !item.resource || canAccess(user, item.resource, item.action)
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={si}>
              <p className="text-[10px] uppercase tracking-widest text-white/30 px-2 mb-1.5">
                {section.label}
              </p>
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavLink key={item.href} href={item.href} icon={item.icon} active={isActive(item.href)}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User */}
      <div className="px-3 py-3 border-t border-white/10">
        <div className="flex items-center gap-2 px-2 py-2 rounded-md">
          <div className="w-7 h-7 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-xs font-semibold">
            {user?.name?.[0]?.toUpperCase() || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-[var(--paper)] truncate">{user?.name}</p>
            <p className="text-[10px] text-white/40 capitalize">{user?.role}</p>
          </div>
          <button
            onClick={logout}
            className="text-white/40 hover:text-white/80 transition-colors"
            title="Logout"
          >
            <LogOut size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  icon: Icon,
  active,
  children,
}: {
  href: string;
  icon: React.ElementType;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-2.5 px-2 py-1.5 rounded-md text-xs font-medium transition-all duration-100 group',
        active
          ? 'bg-[var(--accent)] text-white'
          : 'text-white/60 hover:text-white hover:bg-white/5'
      )}
    >
      <Icon size={14} className="flex-shrink-0" />
      <span className="flex-1">{children}</span>
      {active && <ChevronRight size={12} className="opacity-60" />}
    </Link>
  );
}
