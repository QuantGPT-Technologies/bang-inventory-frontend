interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}

export function PageHeader({ title, subtitle, action, breadcrumb }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {breadcrumb && (
        <nav className="flex items-center gap-1 text-xs text-[var(--ink-muted)] mb-2">
          {breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <span>/</span>}
              {crumb.href ? (
                <a href={crumb.href} className="hover:text-[var(--ink)] transition-colors">
                  {crumb.label}
                </a>
              ) : (
                <span className={i === breadcrumb.length - 1 ? 'text-[var(--ink)]' : ''}>
                  {crumb.label}
                </span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold text-[var(--ink)]"
            style={{ fontFamily: 'Playfair Display, serif' }}
          >
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-[var(--ink-muted)] mt-0.5">{subtitle}</p>
          )}
        </div>
        {action && <div className="flex-shrink-0 flex items-center gap-2">{action}</div>}
      </div>
      <div className="mt-3 h-px bg-[var(--border-light)]" />
    </div>
  );
}
