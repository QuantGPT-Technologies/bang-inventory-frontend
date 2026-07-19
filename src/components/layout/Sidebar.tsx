'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import {
  Home, Factory, Package2, Users, Building2,
  Truck, FlaskConical, Wrench, Layers, Webhook, Workflow,
  BarChart3, LogOut, ChevronRight, X
} from 'lucide-react';

// Grouped by what someone actually does, not by backend resource/admin category: the daily
// production work first, then the catalog it's made from, then partners, then insights, with
// engineering/admin setup (including the workflow-template graph editor -- not a "click here,
// enter this" operator concept) pushed to the bottom so it doesn't compete with daily work.
const navItems = [
  { href: '/dashboard', label: 'Home', icon: Home },
  {
    label: 'Production',
    subtitle: 'The daily work: batches and lots',
    items: [
      { href: '/batches', label: 'Batches', icon: Factory, resource: 'batches', action: 'read' },
      { href: '/lots', label: 'Lots', icon: Layers, resource: 'lots', action: 'read' },
    ],
  },
  {
    label: 'Catalog',
    subtitle: 'What we make things from and into',
    items: [
      { href: '/skus', label: 'SKUs', icon: Package2, resource: 'skus', action: 'read' },
      { href: '/raw-materials', label: 'Raw Materials', icon: FlaskConical, resource: 'raw_materials', action: 'read' },
      { href: '/consumables', label: 'Consumables', icon: Wrench, resource: 'consumables', action: 'read' },
    ],
  },
  {
    label: 'Partners',
    subtitle: 'Customers and vendors',
    items: [
      { href: '/customers', label: 'Customers', icon: Building2, resource: 'customers', action: 'read' },
      { href: '/vendors', label: 'Vendors', icon: Truck, resource: 'vendors', action: 'read' },
    ],
  },
  {
    label: 'Insights',
    subtitle: 'Reports & trends',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3, resource: 'reports', action: 'view' },
    ],
  },
  {
    label: 'Settings',
    subtitle: 'Users, integrations, and template setup',
    items: [
      { href: '/workflow-templates', label: 'Workflow Templates', icon: Workflow, resource: 'workflow_templates', action: 'read' },
      { href: '/users', label: 'Users', icon: Users, resource: 'users', action: 'crud' },
      { href: '/webhooks', label: 'Webhooks', icon: Webhook, resource: 'webhooks', action: 'crud' },
    ],
  },
] as const;

/**
 * Below the `lg` (1024px) breakpoint -- a tablet in portrait, the primary factory-floor device
 * class -- the sidebar would otherwise permanently eat ~29% of a narrow screen's width. There it
 * becomes a fixed off-canvas drawer (open/onClose controlled by AppShell) with a backdrop;
 * at `lg` and above it's back to the persistent static column, unaffected by open/onClose.
 */
export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          'w-56 flex-shrink-0 bg-[var(--ink)] text-[var(--paper)] flex flex-col h-screen',
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out',
          'lg:sticky lg:top-0 lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
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
          <button
            onClick={onClose}
            aria-label="Close navigation menu"
            className="lg:hidden text-white/40 hover:text-white/80 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-4">
          {navItems.map((section, si) => {
            if ('href' in section) {
              return (
                <NavLink key={section.href} href={section.href} icon={section.icon} active={isActive(section.href)} onNavigate={onClose}>
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
                <p className="text-[10px] uppercase tracking-widest text-white/30 px-2">
                  {section.label}
                </p>
                <p className="text-[10px] text-white/25 px-2 mb-1.5 leading-tight">
                  {section.subtitle}
                </p>
                <div className="space-y-0.5">
                  {visibleItems.map((item) => (
                    <NavLink key={item.href} href={item.href} icon={item.icon} active={isActive(item.href)} onNavigate={onClose}>
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
              aria-label="Log out"
              className="text-white/40 hover:text-white/80 transition-colors"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

function NavLink({
  href,
  icon: Icon,
  active,
  onNavigate,
  children,
}: {
  href: string;
  icon: React.ElementType;
  active: boolean;
  onNavigate: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
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
