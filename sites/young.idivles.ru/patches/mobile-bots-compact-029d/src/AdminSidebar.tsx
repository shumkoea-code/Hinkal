'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  UserPlus,
  Folder,
  Calendar,
  FileText,
  Settings,
  Clock,
  Newspaper,
  BarChart3,
  ScanLine,
  LogOut,
  ScrollText,
  FileStack,
  HandHeart,
  Briefcase,
  ShieldAlert,
  DatabaseBackup,
  MapPin,
  Trophy,
  Bot,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import { hasPermission, type ModeratorPermission } from '@/lib/acl-shared';

type NavDef = {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  requiredPermission?: ModeratorPermission | ModeratorPermission[] | 'ADMIN_ONLY';
  group: 'main' | 'content' | 'ops' | 'system';
  badgeKey?: string;
};

const NAV_ITEMS: NavDef[] = [
  { href: '/admin', label: 'Дашборд', icon: LayoutDashboard, group: 'main' },
  { href: '/admin/projects', label: 'Проекты', icon: Folder, requiredPermission: 'projects', group: 'content' },
  { href: '/admin/clubs', label: 'Клубы', icon: Users, requiredPermission: 'clubs', group: 'content' },
  { href: '/admin/spaces', label: 'Пространства', icon: Calendar, requiredPermission: 'spaces', group: 'content' },
  { href: '/admin/places', label: 'Куда сходить', icon: MapPin, requiredPermission: 'places', group: 'content' },
  { href: '/admin/programs', label: 'Гранты и добро', icon: HandHeart, requiredPermission: ['programs', 'pages'], group: 'content' },
  { href: '/admin/bookings', label: 'Афиша', icon: Clock, requiredPermission: 'bookings', group: 'ops', badgeKey: '/admin/bookings' },
  { href: '/admin/pages', label: 'Страницы', icon: ScrollText, requiredPermission: 'pages', group: 'content' },
  { href: '/admin/about-team', label: 'Команда «О нас»', icon: Users, requiredPermission: ['pages', 'portfolios'], group: 'content' },
  { href: '/admin/documents', label: 'Документы', icon: FileStack, requiredPermission: 'pages', group: 'content' },
  { href: '/admin/news', label: 'Новости', icon: Newspaper, requiredPermission: ['news', 'pages'], group: 'content' },
  { href: '/admin/applications', label: 'Заявки', icon: FileText, requiredPermission: 'applications', group: 'ops', badgeKey: '/admin/applications' },
  { href: '/admin/portfolios', label: 'Портфолио', icon: Briefcase, requiredPermission: ['portfolios', 'pages'], group: 'ops', badgeKey: '/admin/portfolios' },
  { href: '/admin/vacancies', label: 'Вакансии', icon: Briefcase, requiredPermission: 'vacancies', group: 'ops' },
  { href: '/admin/contests', label: 'Конкурсы', icon: Trophy, requiredPermission: 'contests', group: 'ops' },
  { href: '/admin/moderation', label: 'Модерация', icon: ShieldAlert, requiredPermission: 'moderation', group: 'ops', badgeKey: '/admin/moderation' },
  { href: '/admin/stats', label: 'Статистика', icon: BarChart3, requiredPermission: ['stats', 'bookings'], group: 'ops' },
  { href: '/admin/scanner', label: 'Сканер', icon: ScanLine, requiredPermission: 'scanner', group: 'ops' },
  { href: '/admin/users', label: 'Пользователи', icon: Users, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/pending-users', label: 'Заявки регистрации', icon: UserPlus, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/audit-log', label: 'Журнал админов', icon: ScrollText, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/rkn', label: 'РКН / ПДн', icon: FileText, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/backup', label: 'Бэкап', icon: DatabaseBackup, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/bots', label: 'Боты', icon: Bot, requiredPermission: 'ADMIN_ONLY', group: 'system' },
  { href: '/admin/settings', label: 'Настройки', icon: Settings, requiredPermission: 'ADMIN_ONLY', group: 'system' },
];

const GROUP_LABELS: Record<NavDef['group'], string> = {
  main: 'Обзор',
  content: 'Контент',
  ops: 'Операции',
  system: 'Система',
};

function canSee(item: NavDef, userRole: string, userPermissions: string[]): boolean {
  if (userRole === 'ADMIN') return true;
  if (item.requiredPermission === 'ADMIN_ONLY') return false;
  if (!item.requiredPermission) return true;
  const raw = userPermissions.join(',');
  return hasPermission(
    'MODERATOR',
    raw,
    item.requiredPermission as ModeratorPermission | ModeratorPermission[]
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

function formatBadge(n: number) {
  if (n <= 0) return null;
  return n > 999 ? '999+' : String(n);
}

export default function AdminSidebar({
  userRole,
  userPermissions,
}: {
  userRole: string;
  userPermissions: string[];
}) {
  const pathname = usePathname() || '/admin';
  const stripRef = useRef<HTMLElement>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [navQuery, setNavQuery] = useState('');

  const items = useMemo(() => {
    const visible = NAV_ITEMS.filter((item) => canSee(item, userRole, userPermissions));
    const q = navQuery.trim().toLowerCase();
    if (!q) return visible;
    return visible.filter((item) => item.label.toLowerCase().includes(q) || item.href.toLowerCase().includes(q));
  }, [userRole, userPermissions, navQuery]);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/admin/nav-counts')
        .then((r) => r.json())
        .then((d) => {
          if (cancelled || !d?.counts) return;
          setCounts(d.counts as Record<string, number>);
        })
        .catch(() => undefined);
    };
    load();
    const t = setInterval(load, 60000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [pathname]);

  useEffect(() => {
    const active = stripRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (!active || !stripRef.current) return;
    const strip = stripRef.current;
    const a = active.getBoundingClientRect();
    const s = strip.getBoundingClientRect();
    if (a.left < s.left || a.right > s.right) {
      active.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'instant' as ScrollBehavior });
    }
  }, [pathname]);

  const linkClass = (active: boolean) => `admin-nav-link${active ? ' is-active' : ''}`;

  const badgeFor = (item: NavDef) => {
    if (!item.badgeKey) return null;
    return formatBadge(counts[item.badgeKey] || 0);
  };

  return (
    <aside className="admin-sidebar">
      <div className="admin-sidebar-desktop">
        <h2 className="admin-sidebar-title">Панель управления</h2>
        <div style={{ padding: '0 0.85rem 0.65rem' }}>
          <input
            className="admin-nav-filter"
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            placeholder="Быстрый поиск…"
            aria-label="Поиск раздела панели"
            style={{
              width: '100%',
              padding: '0.45rem 0.65rem',
              borderRadius: 10,
              border: '1px solid rgba(15,23,42,0.1)',
              fontSize: '0.82rem',
              background: 'rgba(255,255,255,0.7)',
            }}
          />
        </div>
        <nav className="admin-sidebar-nav" aria-label="Админ-навигация">
          {(['main', 'content', 'ops', 'system'] as const).map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            if (!groupItems.length) return null;
            return (
              <div key={group} className="admin-nav-group">
                <div className="admin-nav-group-label">{GROUP_LABELS[group]}</div>
                {groupItems.map((item) => {
                  const Icon = item.icon;
                  const active = isActivePath(pathname, item.href);
                  const badge = badgeFor(item);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={linkClass(active)}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon size={18} />
                      <span className="admin-nav-label">{item.label}</span>
                      {badge ? <span className="admin-nav-badge">{badge}</span> : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
          <div className="admin-nav-group" style={{ marginTop: 'auto', paddingTop: '1rem' }}>
            <Link href="/dashboard" className={linkClass(false)}>
              <Users size={18} />
              <span>Кабинет</span>
            </Link>
            <button
              type="button"
              className={linkClass(false)}
              onClick={() => signOut({ callbackUrl: '/' })}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <LogOut size={18} />
              <span>Выйти</span>
            </button>
          </div>
        </nav>
      </div>

      <div className="admin-sidebar-mobile">
        <nav ref={stripRef} className="admin-mobile-strip" aria-label="Разделы панели">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);
            const badge = badgeFor(item);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`admin-mobile-chip${active ? ' is-active' : ''}`}
                data-active={active ? 'true' : 'false'}
                aria-current={active ? 'page' : undefined}
              >
                <span className="admin-mobile-chip-inner">
                  <Icon size={15} />
                  {badge ? <span className="admin-nav-badge admin-nav-badge--chip">{badge}</span> : null}
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
          <span className="admin-mobile-chip-divider" aria-hidden />
          <Link href="/dashboard" className="admin-mobile-chip admin-mobile-chip-muted">
            <Users size={15} />
            <span>Кабинет</span>
          </Link>
          <button
            type="button"
            className="admin-mobile-chip admin-mobile-chip-muted"
            onClick={() => signOut({ callbackUrl: '/' })}
          >
            <LogOut size={15} />
            <span>Выйти</span>
          </button>
        </nav>
      </div>
    </aside>
  );
}
