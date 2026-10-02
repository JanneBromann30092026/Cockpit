import { NavLink } from 'react-router';
import { motion } from 'motion/react';
import { Lock, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn, IconButton, Tooltip } from '@/components/ui';
import { useSettings } from '@/features/settings/settingsStore';
import { de } from '@/i18n/de';
import { vault } from '@/services/vault';
import { spring } from '@/styles/motion';
import { navItems, type NavItem } from './navItems';

const EXPANDED_WIDTH = 264;
const COLLAPSED_WIDTH = 84;
const iconUrl = `${import.meta.env.BASE_URL}icons/favicon.svg`;

function MaybeTooltip({
  show,
  content,
  children,
}: {
  show: boolean;
  content: string;
  children: React.ReactNode;
}) {
  return show ? <Tooltip content={content}>{children}</Tooltip> : <>{children}</>;
}

const itemClass = (isActive: boolean, collapsed: boolean) =>
  cn(
    'focus-ring no-callout relative flex min-h-11 w-full items-center gap-3 rounded-full px-3.5 text-base font-medium transition-colors',
    isActive ? 'text-accent' : 'text-fg-secondary hover:text-fg',
    collapsed && 'justify-center px-0',
  );

function SidebarLink({ item, collapsed }: { item: NavItem; collapsed: boolean }) {
  const { to, label, icon: Icon } = item;
  return (
    <MaybeTooltip show={collapsed} content={label}>
      <NavLink
        to={to}
        className={({ isActive }) => itemClass(isActive, collapsed)}
        aria-label={collapsed ? label : undefined}
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <motion.span
                layoutId="sidebar-nav"
                transition={spring.default}
                className="absolute inset-0 rounded-full bg-accent-soft"
              />
            )}
            <Icon size={22} aria-hidden className="relative shrink-0" />
            {!collapsed && <span className="relative flex-1 truncate">{label}</span>}
          </>
        )}
      </NavLink>
    </MaybeTooltip>
  );
}

/** Wide layout (≥ 900 px): collapsible sidebar with the main navigation. */
export function Sidebar() {
  const collapsed = useSettings((s) => s.sidebarCollapsed);
  const devMode = useSettings((s) => s.devMode);
  const setSetting = useSettings((s) => s.set);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH }}
      transition={spring.default}
      className="relative z-10 flex h-full shrink-0 flex-col border-r border-line bg-surface/80 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] pl-[env(safe-area-inset-left)]"
    >
      <div className={cn('flex items-center gap-3 px-4 pb-4', collapsed && 'flex-col px-0')}>
        <img
          src={iconUrl}
          alt=""
          width={40}
          height={40}
          className="size-10 shrink-0 rounded-md shadow-soft"
        />
        {!collapsed && (
          <span className="flex-1 text-lg font-semibold tracking-tight text-fg">{de.app.name}</span>
        )}
        <IconButton
          icon={collapsed ? PanelLeftOpen : PanelLeftClose}
          label={collapsed ? de.nav.expand : de.nav.collapse}
          onClick={() => void setSetting('sidebarCollapsed', !collapsed)}
        />
      </div>

      <nav aria-label={de.nav.label} className="flex flex-col gap-1 px-3">
        {navItems(devMode).map((item) => (
          <SidebarLink key={item.to} item={item} collapsed={collapsed} />
        ))}
      </nav>

      <div className={cn('mt-auto flex flex-col px-3', collapsed && 'items-center')}>
        <MaybeTooltip show={collapsed} content={de.nav.lock}>
          <button
            type="button"
            onClick={() => vault.lock('manual')}
            aria-label={collapsed ? de.nav.lock : undefined}
            className={itemClass(false, collapsed)}
            data-testid="sidebar-lock"
          >
            <Lock size={22} aria-hidden className="shrink-0" />
            {!collapsed && <span className="truncate">{de.nav.lock}</span>}
          </button>
        </MaybeTooltip>
      </div>
    </motion.aside>
  );
}
