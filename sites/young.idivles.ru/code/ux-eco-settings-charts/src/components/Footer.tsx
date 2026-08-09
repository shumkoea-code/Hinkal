import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import SiteBrand from '@/components/SiteBrand';
import FooterContacts from '@/components/FooterContacts';
import { SocialIconLink } from '@/components/SocialIcons';
import CookieSettingsLink from '@/components/CookieSettingsLink';
import EcoPoolHint from '@/components/EcoPoolHint';
import { publishedWhere } from '@/lib/publish';

const PRIMARY_NAV: { href: string; label: string }[] = [
  { href: '/p/about', label: 'О нас' },
  { href: '/spaces', label: 'Пространства' },
  { href: '/places', label: 'Куда сходить' },
  { href: '/projects', label: 'Проекты' },
  { href: '/clubs', label: 'Клубы' },
  { href: '/events', label: 'Афиша' },
  { href: '/gallery', label: 'Галерея' },
  { href: '/news', label: 'Новости' },
  { href: '/grants', label: 'Гранты' },
  { href: '/dobro', label: 'Добро' },
  { href: '/self-gov', label: 'Самоуправление' },
  { href: '/documents', label: 'Документы' },
  { href: '/games', label: 'Игры' },
  { href: '/contacts', label: 'Контакты' },
];

export default async function Footer() {
  const [settings, footerPages] = await Promise.all([
    prisma.siteSettings.findUnique({
      where: { id: '1' },
      select: {
        siteName: true,
        logoUrl: true,
        contactEmail: true,
        contactPhone: true,
        address: true,
        vkLink: true,
        vkEnabled: true,
        tgLink: true,
        tgEnabled: true,
        okLink: true,
        okEnabled: true,
        whatsappLink: true,
        whatsappEnabled: true,
        rutubeLink: true,
        rutubeEnabled: true,
        maxLink: true,
        maxEnabled: true,
        galleryPageEnabled: true,
        galleryPublicEnabled: true,
        orgGalleryJson: true,
      },
    }),
    prisma.pageContent.findMany({
      where: { menuPosition: 'FOOTER', ...publishedWhere() },
      select: { slug: true, title: true },
      orderBy: { title: 'asc' },
    }),
  ]);

  const reservedSlugs = new Set(['privacy', 'about', 'rules', 'terms', 'contacts', 'documents']);
  const extraPages = footerPages.filter((p) => !reservedSlugs.has(p.slug));

  const socials = [
    settings?.vkEnabled && settings.vkLink ? { kind: 'vk' as const, href: settings.vkLink } : null,
    settings?.tgEnabled && settings.tgLink ? { kind: 'tg' as const, href: settings.tgLink } : null,
    settings?.okEnabled && settings.okLink ? { kind: 'ok' as const, href: settings.okLink } : null,
    settings?.whatsappEnabled && settings.whatsappLink
      ? { kind: 'whatsapp' as const, href: settings.whatsappLink }
      : null,
    settings?.rutubeEnabled && settings.rutubeLink
      ? { kind: 'rutube' as const, href: settings.rutubeLink }
      : null,
    settings?.maxEnabled && settings.maxLink ? { kind: 'max' as const, href: settings.maxLink } : null,
  ].filter(Boolean) as { kind: 'vk' | 'tg' | 'ok' | 'whatsapp' | 'rutube' | 'max'; href: string }[];

  return (
    <footer className="site-footer">
      <div className="container">
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <SiteBrand siteName={settings?.siteName} logoUrl={settings?.logoUrl} size="footer" />
            <p className="site-footer-tagline">
              Официальный портал молодежных пространств, проектов и клубов города Сочи.
            </p>
            {socials.length > 0 && (
              <div className="site-footer-socials">
                {socials.map((s) => (
                  <SocialIconLink key={s.kind} kind={s.kind} href={s.href} size={36} />
                ))}
              </div>
            )}
          </div>

          <nav className="site-footer-nav" aria-label="Навигация в подвале">
            <h3 className="site-footer-heading">Разделы</h3>
            <ul className="site-footer-nav-list">
              {PRIMARY_NAV.filter((item) => {
                if (item.href !== '/gallery') return true;
                const pageOn = (settings as { galleryPageEnabled?: boolean } | null)?.galleryPageEnabled !== false;
                const hasPhotos = Boolean(String(settings?.orgGalleryJson || '').trim());
                return pageOn && hasPhotos;
              }).map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
              {extraPages.map((p) => (
                <li key={p.slug}>
                  <Link href={`/p/${p.slug}`}>{p.title}</Link>
                </li>
              ))}
            </ul>
          </nav>

          <FooterContacts
            address={settings?.address}
            phone={settings?.contactPhone}
            email={settings?.contactEmail}
          />
        </div>

        <div className="site-footer-legal">
          <p className="site-footer-legal-copy">
            &copy; {new Date().getFullYear()} {settings?.siteName || 'Центр развития молодежи Сочи'}
          </p>
          <nav className="site-footer-legal-links" aria-label="Правовая информация">
            <Link href="/privacy">152-ФЗ / cookie</Link>
            <span className="site-footer-legal-sep" aria-hidden>
              ·
            </span>
            <CookieSettingsLink />
            <span className="site-footer-legal-sep" aria-hidden>
              ·
            </span>
            <Link href="/rules">Правила</Link>
            <span className="site-footer-legal-sep" aria-hidden>
              ·
            </span>
            <Link href="/terms">Соглашение</Link>
          </nav>
          <EcoPoolHint variant="footer" />
        </div>
      </div>
    </footer>
  );
}
