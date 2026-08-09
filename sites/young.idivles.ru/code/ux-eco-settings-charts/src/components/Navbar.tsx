'use client';

function modOn(settings: any, key: string) {
  try {
    const raw = settings?.moduleFlagsJson;
    if (!raw) return true;
    const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (o && typeof o[key] === 'boolean') return o[key] !== false;
  } catch {
    /* ignore */
  }
  return true;
}


import Link from 'next/link';
import {
  User,
  Menu,
  X,
  ChevronDown,
  Search,
  LogOut,
  Ticket,
  LayoutDashboard,
  UserCircle,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import SiteBrand from '@/components/SiteBrand';
import NavProfileCard from '@/components/NavProfileCard';
import NotificationsBell from '@/components/NotificationsBell';
import { publicPagePath } from '@/lib/public-paths';
import { encodeRouteParam } from '@/lib/route-id';

type OpenMenu = 'projects' | 'clubs' | 'spaces' | 'more' | null;

export default function Navbar({ spaces = [], clubs = [], projects = [], pages = [], siteSettings }: any) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [overflowIds, setOverflowIds] = useState<string[]>([]);
  const [openMenu, setOpenMenu] = useState<OpenMenu>(null);
  const navRef = useRef<HTMLElement>(null);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const moreId = useId();

  const userRole = (session?.user as { role?: string } | undefined)?.role;
  const isScanner = userRole === 'SCANNER';
  const isTech = userRole === 'TECH';
  const [publicCode, setPublicCode] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.user?.id || isScanner) {
      setPublicCode(null);
      return;
    }
    let cancelled = false;
    fetch('/api/user/profile', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        const code = typeof data?.publicCode === 'string' ? data.publicCode.trim() : '';
        setPublicCode(code || null);
      })
      .catch(() => {
        if (!cancelled) setPublicCode(null);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id, isScanner]);

  const profileHref = session?.user?.id
    ? isScanner
      ? '/dashboard?tab=profile'
      : `/u/${encodeRouteParam(publicCode || session.user.id)}`
    : '/dashboard?tab=profile';
  const dashboardHref = isTech ? '/ops' : isScanner ? '/scanner' : '/dashboard';

  const isActive = (path: string) => {
    if (path === '/' && pathname !== '/') return false;
    return pathname?.startsWith(path);
  };

  const getLinkStyle = (path: string, baseStyle: any = { fontWeight: 500 }) => ({
    ...baseStyle,
    color: isActive(path) ? 'var(--primary)' : 'inherit',
    fontWeight: isActive(path) ? 700 : baseStyle.fontWeight,
  });

  const toggleMenu = () => setIsMobileMenuOpen((open) => !open);
  const closeMenu = () => setIsMobileMenuOpen(false);
  const closeDesktopMenus = () => setOpenMenu(null);

  useEffect(() => {
    closeMenu();
    closeDesktopMenus();
    setSearchOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!searchOpen) return;
    const t = window.setTimeout(() => searchInputRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [searchOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.classList.add('mobile-nav-open');
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('mobile-nav-open');
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!openMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDesktopMenus();
      }
    };
    const onPointer = (e: MouseEvent) => {
      if (!navRef.current?.contains(e.target as Node)) closeDesktopMenus();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onPointer);
    };
  }, [openMenu]);

  const headerMainPages = pages.filter((p: any) => p.menuPosition === 'HEADER_MAIN');
  const headerSubPages = pages.filter((p: any) => p.menuPosition === 'HEADER_SUB');

  const renderDropdown = (
    id: Exclude<OpenMenu, null>,
    trigger: ReactNode,
    items: ReactNode,
    hasItems: boolean
  ) => (
    <div className={`nav-item${openMenu === id ? ' is-open' : ''}`}>
      {trigger}
      {hasItems && (
        <div className="dropdown" role="menu">
          {items}
        </div>
      )}
    </div>
  );

  const renderSearch = (variant: 'desktop' | 'mobile') => (
    <div className={`nav-search nav-search--${variant}${searchOpen ? ' is-open' : ''}`}>
      {searchOpen ? (
        <form action="/search" method="GET" className="nav-search-form">
          <Search size={16} className="nav-search-icon" aria-hidden />
          <input
            ref={searchInputRef}
            id={variant === 'desktop' ? 'site-search-input' : undefined}
            type="search"
            name="q"
            placeholder="Поиск… (/)"
            className="nav-search-input"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                setSearchOpen(false);
              }
            }}
          />
          <button
            type="button"
            className="nav-icon-btn nav-search-close"
            aria-label="Закрыть поиск"
            onClick={() => setSearchOpen(false)}
          >
            <X size={16} />
          </button>
        </form>
      ) : (
        <button
          type="button"
          className="nav-icon-btn"
          aria-label="Поиск"
          title="Поиск (/)"
          onClick={() => setSearchOpen(true)}
        >
          <Search size={18} />
        </button>
      )}
    </div>
  );

  const authLoading = status === 'loading';
  const authIconCount = session ? (isScanner ? 4 : 5) : 1;

  const renderAuthIcons = () => (
    <div
      className={`nav-auth-slot${authLoading ? ' is-loading' : ''}`}
      style={{ ['--nav-auth-slots' as string]: authIconCount }}
      aria-busy={authLoading}
    >
      {authLoading ? (
        <div className="nav-auth-icons nav-auth-icons--placeholder" aria-hidden>
          {Array.from({ length: 5 }).map((_, i) => (
            <span key={i} className="nav-icon-btn nav-icon-btn--ghost" />
          ))}
        </div>
      ) : !session ? (
        <div className="nav-auth-icons">
          <Link href="/login" className="nav-icon-btn nav-icon-btn--primary" title="Вход" aria-label="Вход">
            <User size={18} />
          </Link>
        </div>
      ) : (
        <div className="nav-auth-icons">
          <NotificationsBell compact useNavStyle />
          {!isScanner && (
            <Link
              href="/tickets"
              className="nav-icon-btn nav-tickets-btn"
              title="Мои билеты"
              aria-label="Мои билеты"
            >
              <Ticket size={18} />
            </Link>
          )}
          <Link href={profileHref} className="nav-icon-btn" title="Профиль" aria-label="Профиль">
            <UserCircle size={18} />
          </Link>
          <Link
            href={dashboardHref}
            className="nav-icon-btn"
            title={isTech ? 'Ops' : isScanner ? 'Сканер' : 'Панель управления'}
            aria-label={isTech ? 'Ops' : isScanner ? 'Сканер' : 'Панель управления'}
          >
            <LayoutDashboard size={18} />
          </Link>
          <button
            type="button"
            className="nav-icon-btn"
            onClick={() => signOut({ callbackUrl: '/' })}
            title="Выйти"
            aria-label="Выйти"
          >
            <LogOut size={18} />
          </button>
        </div>
      )}
    </div>
  );


  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => {
      const nodes = Array.from(nav.querySelectorAll<HTMLElement>('[data-nav-id]'));
      nodes.forEach((n) => n.removeAttribute('data-nav-overflow'));
      const more = nav.querySelector<HTMLElement>('[data-nav-id="more"]');
      if (more) more.removeAttribute('data-nav-overflow');
      let used = 0;
      const gap = 14;
      const reserveMore = 72;
      const budget = Math.max(120, nav.clientWidth - reserveMore);
      const hidden: string[] = [];
      for (const node of nodes) {
        const id = node.dataset.navId || '';
        if (!id || id === 'more') continue;
        const w = node.getBoundingClientRect().width || 0;
        if (used + w + gap > budget) {
          node.setAttribute('data-nav-overflow', '1');
          hidden.push(id);
        } else {
          used += w + gap;
        }
      }
      setOverflowIds(hidden);
    };
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => measure()) : null;
    ro?.observe(nav);
    measure();
    window.addEventListener('resize', measure);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [headerMainPages.length, projects.length, clubs.length, spaces.length]);


  return (
    <header className={`glass-nav${isMobileMenuOpen ? ' menu-open' : ''}${searchOpen ? ' search-open' : ''}`}>
      <div className="container glass-nav-inner">
        <SiteBrand
          siteName={siteSettings?.siteName}
          logoUrl={siteSettings?.logoUrl}
          size="header"
          className="site-brand-nav"
        />

        <nav
          ref={navRef}
          style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'nowrap' }}
          className="desktop-nav"
          aria-label="Основное меню"
        >
          {headerMainPages.map((page: any) => (
            <Link key={page.id} href={publicPagePath(page.slug)} data-nav-id={`page-${page.slug}`} style={getLinkStyle(publicPagePath(page.slug))}>
              {page.title}
            </Link>
          ))}

          {renderDropdown(
            'projects',
            <Link
              href="/projects"
              data-nav-id="projects"
              style={{ ...getLinkStyle('/projects'), display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              aria-expanded={openMenu === 'projects'}
              aria-haspopup="menu"
              onClick={(e) => {
                if (projects.length > 0) {
                  e.preventDefault();
                  setOpenMenu((m) => (m === 'projects' ? null : 'projects'));
                }
              }}
              onKeyDown={(e) => {
                if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && projects.length > 0) {
                  e.preventDefault();
                  setOpenMenu('projects');
                }
              }}
            >
              Проекты <ChevronDown size={14} />
            </Link>,
            <>
              {projects.map((p: any) => (
                <Link key={p.id} href={`/projects/${encodeRouteParam(p.id)}`} className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                  {p.title}
                </Link>
              ))}
              <Link
                href="/projects"
                className="dropdown-item"
                role="menuitem"
                onClick={closeDesktopMenus}
                style={{ borderTop: '1px solid #eee', fontWeight: 600, color: 'var(--primary)' }}
              >
                Все проекты &rarr;
              </Link>
            </>,
            projects.length > 0
          )}

          {renderDropdown(
            'clubs',
            <Link
              href="/clubs"
              data-nav-id="clubs"
              style={{ ...getLinkStyle('/clubs'), display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              aria-expanded={openMenu === 'clubs'}
              aria-haspopup="menu"
              onClick={(e) => {
                if (clubs.length > 0) {
                  e.preventDefault();
                  setOpenMenu((m) => (m === 'clubs' ? null : 'clubs'));
                }
              }}
              onKeyDown={(e) => {
                if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && clubs.length > 0) {
                  e.preventDefault();
                  setOpenMenu('clubs');
                }
              }}
            >
              Клубы <ChevronDown size={14} />
            </Link>,
            <>
              {clubs.map((c: any) => (
                <Link key={c.id} href={`/clubs/${encodeRouteParam(c.id)}`} className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                  {c.title}
                </Link>
              ))}
              <Link
                href="/clubs"
                className="dropdown-item"
                role="menuitem"
                onClick={closeDesktopMenus}
                style={{ borderTop: '1px solid #eee', fontWeight: 600, color: 'var(--primary)' }}
              >
                Все клубы &rarr;
              </Link>
            </>,
            clubs.length > 0
          )}

          {renderDropdown(
            'spaces',
            <Link
              href="/spaces"
              data-nav-id="spaces"
              style={{ ...getLinkStyle('/spaces'), display: 'flex', alignItems: 'center', gap: '0.25rem' }}
              aria-expanded={openMenu === 'spaces'}
              aria-haspopup="menu"
              onClick={(e) => {
                if (spaces.length > 0) {
                  e.preventDefault();
                  setOpenMenu((m) => (m === 'spaces' ? null : 'spaces'));
                }
              }}
              onKeyDown={(e) => {
                if ((e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') && spaces.length > 0) {
                  e.preventDefault();
                  setOpenMenu('spaces');
                }
              }}
            >
              Пространства <ChevronDown size={14} />
            </Link>,
            <>
              {spaces.map((s: any) => (
                <Link key={s.id} href={`/spaces/${encodeRouteParam(s.id)}`} className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>
                  {s.title}
                </Link>
              ))}
              <Link
                href="/spaces"
                className="dropdown-item"
                role="menuitem"
                onClick={closeDesktopMenus}
                style={{ borderTop: '1px solid #eee', fontWeight: 600, color: 'var(--primary)' }}
              >
                Все пространства &rarr;
              </Link>
            </>,
            spaces.length > 0
          )}

          <Link href="/events" data-nav-id="events" style={getLinkStyle('/events')}>
            Афиша
          </Link>
          {(siteSettings?.galleryPageEnabled ?? true) && modOn(siteSettings, 'gallery') && (
            <Link href="/gallery" data-nav-id="gallery" style={getLinkStyle('/gallery')}>
              Галерея
            </Link>
          )}
          <Link href="/places" data-nav-id="places" style={getLinkStyle('/places')}>
            Куда сходить
          </Link>
          <Link href="/news" data-nav-id="news" style={getLinkStyle('/news')}>
            Новости
          </Link>
          {modOn(siteSettings, 'vacancies') && (
            <Link href="/vacancies" data-nav-id="vacancies" style={getLinkStyle('/vacancies')}>
              Вакансии
            </Link>
          )}
          {modOn(siteSettings, 'contests') && (
            <Link href="/contests" data-nav-id="contests" style={getLinkStyle('/contests')}>
              Конкурсы
            </Link>
          )}

          {(headerSubPages.length > 0 || overflowIds.length > 0) &&
            renderDropdown(
              'more',
              <button
                type="button"
                id={moreId}
                className="nav-more-btn"
                data-nav-id="more"
                style={{
                  cursor: 'pointer',
                  fontWeight: openMenu === 'more' ? 700 : 500,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  font: 'inherit',
                  color: 'inherit',
                }}
                aria-expanded={openMenu === 'more'}
                aria-haspopup="menu"
                aria-controls={`${moreId}-menu`}
                onClick={() => setOpenMenu((m) => (m === 'more' ? null : 'more'))}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setOpenMenu('more');
                  }
                }}
              >
                Ещё <ChevronDown size={14} />
              </button>,
              <>
                {overflowIds.includes('projects') && (
                  <Link href="/projects" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Проекты</Link>
                )}
                {overflowIds.includes('clubs') && (
                  <Link href="/clubs" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Клубы</Link>
                )}
                {overflowIds.includes('spaces') && (
                  <Link href="/spaces" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Пространства</Link>
                )}
                {overflowIds.includes('events') && (
                  <Link href="/events" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Афиша</Link>
                )}
                {overflowIds.includes('gallery') && (
                  <Link href="/gallery" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Галерея</Link>
                )}
                {overflowIds.includes('places') && (
                  <Link href="/places" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Куда сходить</Link>
                )}
                {overflowIds.includes('news') && (
                  <Link href="/news" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Новости</Link>
                )}
                {overflowIds.includes('vacancies') && (
                  <Link href="/vacancies" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Вакансии</Link>
                )}
                {overflowIds.includes('contests') && (
                  <Link href="/contests" className="dropdown-item" role="menuitem" onClick={closeDesktopMenus}>Конкурсы</Link>
                )}
                {headerSubPages.map((page: any) => (
                  <Link
                    key={page.id}
                    href={publicPagePath(page.slug)}
                    className="dropdown-item"
                    role="menuitem"
                    onClick={closeDesktopMenus}
                  >
                    {page.title}
                  </Link>
                ))}
              </>,
              true
            )}
        </nav>

        <div className="glass-nav-end">
          <div className="nav-search-desktop">{renderSearch('desktop')}</div>
          <div className="nav-header-mobile">{renderSearch('mobile')}</div>
          <div className="nav-auth-desktop">{renderAuthIcons()}</div>
          <button
            className="mobile-menu-btn"
            onClick={toggleMenu}
            aria-expanded={isMobileMenuOpen}
            aria-label={isMobileMenuOpen ? 'Закрыть меню' : 'Открыть меню'}
          >
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        <div className="mobile-menu" role="dialog" aria-modal="true" aria-label="Навигация">
          <nav className="mobile-menu__nav">
            <div className="mobile-menu__auth">
              {authLoading ? (
                <div className="mobile-menu__auth-loading" aria-hidden />
              ) : !session ? (
                <Link href="/login" onClick={closeMenu} className="mobile-menu__login btn btn-primary">
                  <User size={20} aria-hidden />
                  Вход / Регистрация
                </Link>
              ) : (
                <>
                  <div className="mobile-menu__auth-row">
                    <NavProfileCard
                      href={profileHref}
                      fallbackName={session.user?.name}
                      active={isMobileMenuOpen}
                      onNavigate={closeMenu}
                    />
                    <NotificationsBell compact useNavStyle />
                  </div>
                  <div className="mobile-menu__auth-links">
                    <Link href={dashboardHref} onClick={closeMenu} className="mobile-menu__auth-link">
                      <LayoutDashboard size={18} aria-hidden />
                      {isTech ? 'Ops' : isScanner ? 'Сканер' : 'Панель'}
                    </Link>
                    <button
                      type="button"
                      className="mobile-menu__auth-link mobile-menu__auth-link--btn"
                      onClick={() => {
                        closeMenu();
                        signOut({ callbackUrl: '/' });
                      }}
                    >
                      <LogOut size={18} aria-hidden />
                      Выйти
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="mobile-menu__links">
            {session && !isScanner && (
              <Link href="/tickets" onClick={closeMenu} className="mobile-menu__tickets-link">
                <Ticket size={20} aria-hidden />
                Мои билеты · QR на вход
              </Link>
            )}
            {headerMainPages.map((page: any) => (
              <Link key={page.id} href={publicPagePath(page.slug)} onClick={closeMenu} style={getLinkStyle(publicPagePath(page.slug), { fontSize: '1.2rem', fontWeight: 500 })}>
                {page.title}
              </Link>
            ))}
            <Link href="/projects" onClick={closeMenu} style={getLinkStyle('/projects', { fontSize: '1.2rem', fontWeight: 500 })}>
              Проекты
            </Link>
            <Link href="/clubs" onClick={closeMenu} style={getLinkStyle('/clubs', { fontSize: '1.2rem', fontWeight: 500 })}>
              Клубы
            </Link>
            <Link href="/spaces" onClick={closeMenu} style={getLinkStyle('/spaces', { fontSize: '1.2rem', fontWeight: 500 })}>
              Пространства
            </Link>
            <Link href="/places" onClick={closeMenu} style={getLinkStyle('/places', { fontSize: '1.2rem', fontWeight: 500 })}>
              Куда сходить
            </Link>
            <Link href="/events" onClick={closeMenu} style={getLinkStyle('/events', { fontSize: '1.2rem', fontWeight: 500 })}>
              Афиша
            </Link>
            {(siteSettings?.galleryPageEnabled ?? true) && modOn(siteSettings, 'gallery') && (
              <Link href="/gallery" onClick={closeMenu} style={getLinkStyle('/gallery', { fontSize: '1.2rem', fontWeight: 500 })}>
                Галерея
              </Link>
            )}
            <Link href="/news" onClick={closeMenu} style={getLinkStyle('/news', { fontSize: '1.2rem', fontWeight: 500 })}>
              Новости
            </Link>
            {modOn(siteSettings, 'vacancies') && (
              <Link href="/vacancies" onClick={closeMenu} style={getLinkStyle('/vacancies', { fontSize: '1.2rem', fontWeight: 500 })}>
                Вакансии
              </Link>
            )}
            {modOn(siteSettings, 'contests') && (
              <Link href="/contests" onClick={closeMenu} style={getLinkStyle('/contests', { fontSize: '1.2rem', fontWeight: 500 })}>
                Конкурсы
              </Link>
            )}
            {headerSubPages.length > 0 && (
              <>
                <div className="mobile-menu__section-label">Ещё</div>
                {headerSubPages.map((page: any) => (
                  <Link key={page.id} href={publicPagePath(page.slug)} onClick={closeMenu} className="mobile-menu__sub-link">
                    {page.title}
                  </Link>
                ))}
              </>
            )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
