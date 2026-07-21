'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/store/authStore';
import { canAccess } from '@/lib/auth';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import {
  Home, Factory, Package2, Users, Building2,
  Truck, FlaskConical, Wrench, Layers, Webhook, Workflow,
  BarChart3, LogOut, ChevronRight, X
} from 'lucide-react';

// Grouped by what someone actually does, not by backend resource/admin category: the daily
// production work first, then the catalog it's made from, then partners, then insights, with
// engineering/admin setup (including the workflow-template graph editor -- not a "click here,
// enter this" operator concept) pushed to the bottom so it doesn't compete with daily work.
// Section `label` renders as a small heading above its group; the sidebar only shows the top
// level (Home, plus each group's items) -- no subtitle text is rendered anywhere in Sidebar.tsx,
// so group names alone need to be self-explanatory at a glance.
const navItems = [
  { href: '/dashboard', label: 'Home', icon: Home },
  {
    label: 'Production',
    items: [
      { href: '/batches', label: 'Batches', icon: Factory, resource: 'batches', action: 'read' },
      { href: '/lots', label: 'Lots', icon: Layers, resource: 'lots', action: 'read' },
    ],
  },
  {
    label: 'Products & Materials',
    items: [
      { href: '/skus', label: 'Products', icon: Package2, resource: 'skus', action: 'read' },
      { href: '/raw-materials', label: 'Raw Materials', icon: FlaskConical, resource: 'raw_materials', action: 'read' },
      { href: '/consumables', label: 'Consumables', icon: Wrench, resource: 'consumables', action: 'read' },
    ],
  },
  {
    label: 'Customers & Suppliers',
    items: [
      { href: '/customers', label: 'Customers', icon: Building2, resource: 'customers', action: 'read' },
      { href: '/vendors', label: 'Suppliers', icon: Truck, resource: 'vendors', action: 'read' },
    ],
  },
  {
    label: 'Reports',
    items: [
      { href: '/reports', label: 'Reports', icon: BarChart3, resource: 'reports', action: 'view' },
    ],
  },
  {
    label: 'Settings',
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
          'w-72 flex-shrink-0 bg-[var(--ink)] text-white flex flex-col h-screen',
          'fixed inset-y-0 left-0 z-50 transition-transform duration-200 ease-out',
          'lg:sticky lg:top-0 lg:translate-x-0 lg:w-64',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-[var(--accent)] flex items-center justify-center text-white font-bold text-base flex-shrink-0">
              B
            </div>
            <div>
              <p className="font-bold text-base text-white leading-tight">
                Bang Inventory
              </p>
              <p className="text-xs text-white/45 leading-tight">Production Tracker</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden flex items-center gap-1 text-sm font-bold text-white/60 hover:text-white transition-colors min-h-11 min-w-11 justify-center rounded-lg hover:bg-white/10"
          >
            <X size={22} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-3 space-y-5">
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
                <p className="text-xs font-bold uppercase tracking-widest text-white/35 px-2.5">
                  {section.label}
                </p>
                <div className="space-y-1 mt-2">
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

        {/* Theme + User */}
        <div className="px-3 py-3 border-t border-white/10 space-y-1">
          <ThemeToggle dark className="w-full justify-start" />
          <div className="flex items-center gap-2.5 px-2.5 py-2">
            <div className="w-9 h-9 rounded-full bg-[var(--accent)] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
              {user?.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{user?.name}</p>
              <p className="text-xs text-white/45 capitalize">{user?.role}</p>
            </div>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-sm font-bold text-white/55 hover:text-white transition-colors min-h-11 px-2 rounded-lg hover:bg-white/10"
            >
              <LogOut size={18} />
              Log out
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
        'flex items-center gap-3 px-2.5 min-h-12 rounded-xl text-base font-semibold transition-all duration-100 group',
        active
          ? 'bg-[var(--accent)] text-white'
          : 'text-white/65 hover:text-white hover:bg-white/10'
      )}
    >
      <Icon size={20} className="flex-shrink-0" />
      <span className="flex-1">{children}</span>
      {active && <ChevronRight size={16} className="opacity-70" />}
    </Link>
  );
}
