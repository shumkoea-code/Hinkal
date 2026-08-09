import type { Metadata } from 'next';
import { Inter, Outfit } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import NavbarWrapper from '@/components/NavbarWrapper';
import Footer from '@/components/Footer';
import { Providers } from '@/components/Providers';
import { Toaster } from 'react-hot-toast';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import {
  canBypassMaintenance,
  getMaintenanceState,
  isMaintenanceChromeFreePath,
} from '@/lib/maintenance';
import MaintenanceScreen, { MaintenanceStaffBanner } from '@/components/MaintenanceScreen';
import { headers } from 'next/headers';
import PwaUpdateBanner from '@/components/PwaUpdateBanner';
import PwaInstallBanner from '@/components/PwaInstallBanner';
import ConsentBanner from '@/components/ConsentBanner';
import PrivacyPolicyGate from '@/components/PrivacyPolicyGate';
import CopyProtection from '@/components/CopyProtection';
import YandexMetrika from '@/components/YandexMetrika';
import { prisma } from '@/lib/prisma';
import { getSiteIdentity } from '@/lib/site-identity';

const inter = Inter({
  subsets: ['latin', 'cyrillic'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-outfit',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const { siteName, publicOrigin } = await getSiteIdentity();
  const titleDefault = `${siteName} | Официальный портал`;
  const description = `Проекты, клубы, гранты и мероприятия — ${siteName}.`;
  return {
    metadataBase: new URL(publicOrigin),
    title: {
      default: titleDefault,
      template: `%s | ${siteName}`,
    },
    description,
    openGraph: {
      type: 'website',
      locale: 'ru_RU',
      url: publicOrigin,
      siteName,
      title: titleDefault,
      description,
      images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: siteName }],
    },
    twitter: {
      card: 'summary',
      title: siteName,
      description,
      images: ['/icons/icon-512.png'],
    },
    manifest: '/manifest.webmanifest',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: siteName,
    },
    icons: {
      icon: [
        { url: '/icons/icon-32.png', sizes: '32x32', type: 'image/png' },
        { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
        { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
    },
  };
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
  themeColor: '#3b82f6',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await getServerSession(authOptions);
  const maintenance = await getMaintenanceState();
  const hdrs = await headers();
  const pathname = hdrs.get('x-pathname') || '';
  const staffBypass = canBypassMaintenance(session?.user?.role);
  const onStubAuthPath = isMaintenanceChromeFreePath(pathname);
  const chromeFree =
    pathname.startsWith('/maintenance') ||
    (maintenance.maintenanceMode && !staffBypass && onStubAuthPath);
  const blockPublic =
    maintenance.maintenanceMode && !staffBypass && !onStubAuthPath;

  let metrikaId: string | null = null;
  let copyProtectionEnabled = true;
  let cookieBannerEnabled = true;
  let analyticsConsentRequired = true;
  let siteName = 'Молодёжь Сочи';
  try {
    const [s, identity] = await Promise.all([
      prisma.siteSettings.findUnique({
        where: { id: '1' },
        select: {
          yandexMetrikaId: true,
          copyProtectionEnabled: true,
          cookieBannerEnabled: true,
          analyticsConsentRequired: true,
        },
      }),
      getSiteIdentity(),
    ]);
    metrikaId = s?.yandexMetrikaId || null;
    copyProtectionEnabled = s?.copyProtectionEnabled !== false;
    cookieBannerEnabled = s?.cookieBannerEnabled !== false;
    analyticsConsentRequired = s?.analyticsConsentRequired !== false;
    siteName = identity.siteName;
  } catch {
    metrikaId = null;
  }

  /* Public pages during maintenance → pure stub (no nav / PWA / FAB) */
  if (blockPublic) {
    return (
      <html lang="ru" className={`${inter.variable} ${outfit.variable}`}>
        <body className={inter.className}>
          <Providers minimal>
            <div className="animated-bg" />
            <MaintenanceScreen state={maintenance} />
          </Providers>
        </body>
      </html>
    );
  }

  /* /maintenance and staff login — children only, no site chrome / install prompts */
  if (chromeFree) {
    return (
      <html lang="ru" className={`${inter.variable} ${outfit.variable}`}>
        <body className={inter.className}>
          <Providers minimal>
            <Toaster
              position="top-center"
              reverseOrder={false}
              gutter={10}
              containerClassName="yp-toaster"
              containerStyle={{ top: 72, zIndex: 100000 }}
              toastOptions={{
                duration: 3200,
                className: 'yp-toast',
                style: {
                  maxWidth: 'min(420px, calc(100vw - 24px))',
                  padding: '10px 14px',
                  fontSize: '0.9rem',
                  fontWeight: 650,
                  borderRadius: 12,
                  boxShadow: '0 10px 28px rgba(15,23,42,0.14)',
                },
                success: { duration: 2800 },
                error: { duration: 4500 },
              }}
            />
            <div className="animated-bg" />
            <main className="main-content" style={{ minHeight: '100svh' }}>
              {children}
            </main>
          </Providers>
        </body>
      </html>
    );
  }

  return (
    <html lang="ru" className={`${inter.variable} ${outfit.variable}`}>
      <body className={inter.className}>
        <Script
          id="yp-pwa-early"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(){try{window.__ypPwa=window.__ypPwa||{deferred:null};window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__ypPwa.deferred=e;window.dispatchEvent(new Event('yp-beforeinstallprompt'))});window.addEventListener('appinstalled',function(){window.__ypPwa.deferred=null;window.dispatchEvent(new Event('yp-appinstalled'))});if('serviceWorker'in navigator){var reg=function(){navigator.serviceWorker.register('/sw.js').catch(function(){})};if(document.readyState==='complete')reg();else window.addEventListener('load',reg)}}catch(e){}})();`,
          }}
        />
        <Providers>
          <Toaster
              position="top-center"
              reverseOrder={false}
              gutter={10}
              containerClassName="yp-toaster"
              containerStyle={{ top: 72, zIndex: 100000 }}
              toastOptions={{
                duration: 3200,
                className: 'yp-toast',
                style: {
                  maxWidth: 'min(420px, calc(100vw - 24px))',
                  padding: '10px 14px',
                  fontSize: '0.9rem',
                  fontWeight: 650,
                  borderRadius: 12,
                  boxShadow: '0 10px 28px rgba(15,23,42,0.14)',
                },
                success: { duration: 2800 },
                error: { duration: 4500 },
              }}
            />
          <PwaUpdateBanner />
          <PwaInstallBanner siteName={siteName} />
          <ConsentBanner enabled={cookieBannerEnabled} />
          <PrivacyPolicyGate />
          <CopyProtection enabled={copyProtectionEnabled} />
          <YandexMetrika counterId={metrikaId} requireConsent={analyticsConsentRequired} />
          <div className="animated-bg"></div>
          {maintenance.maintenanceMode && staffBypass && <MaintenanceStaffBanner />}
          <NavbarWrapper />
          <main className="main-content">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
