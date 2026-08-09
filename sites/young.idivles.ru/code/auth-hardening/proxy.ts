import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';
import { canBypassMaintenance, isMaintenanceBypassPath } from '@/lib/maintenance';
import { canAccessAdminPath, canUseScanner, isTechRole } from '@/lib/acl-shared';
import { moduleKeyForPath } from '@/lib/module-flags-edge';

// Per-request CSP: nonce + strict-dynamic for scripts (removes unsafe-inline/eval
// from script-src). style-src keeps 'unsafe-inline' (app renders inline <style>).
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https://mc.yandex.ru https://yandex.ru https://*.yandex.ru https:`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: http:",
    "font-src 'self' data:",
    "connect-src 'self' https://mc.yandex.ru https://*.yandex.ru wss: https:",
    "media-src 'self' blob: https://vk.com https://*.vk.com https://vk.ru https://*.vk.ru",
    "frame-src 'self' https://yandex.ru https://*.yandex.ru https://vk.com https://*.vk.com https://vk.ru https://*.vk.ru https://gosuslugi.ru https://*.gosuslugi.ru https://pos.gosuslugi.ru",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join('; ');
}

async function fetchPublicStatus(req: NextRequest): Promise<{
  maintenanceMode?: boolean;
  modules?: Record<string, boolean>;
}> {
  const headers = { 'x-maintenance-check': '1' };
  const candidates = [
    // Prefer loopback — avoids nginx hairpin / self-fetch failures in Docker
    'http://127.0.0.1:3000/api/public/status',
    process.env.INTERNAL_APP_URL
      ? new URL('/api/public/status', process.env.INTERNAL_APP_URL).toString()
      : '',
    new URL('/api/public/status', req.nextUrl.origin).toString(),
  ].filter(Boolean);

  for (const statusUrl of candidates) {
    try {
      const res = await fetch(statusUrl, { headers, cache: 'no-store' });
      if (!res.ok) continue;
      return await res.json();
    } catch {
      /* try next */
    }
  }
  return {};
}

async function checkMaintenance(req: NextRequest, role?: string | null) {
  const pathname = req.nextUrl.pathname;
  if (isMaintenanceBypassPath(pathname)) return null;
  if (canBypassMaintenance(role)) return null;

  const data = await fetchPublicStatus(req);
  if (data.maintenanceMode && pathname !== '/maintenance') {
    return NextResponse.redirect(new URL('/maintenance', req.url));
  }
  return null;
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set('x-pathname', pathname);

  const nonce = btoa(crypto.randomUUID());
  const csp = buildCsp(nonce);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const withCsp = (res: NextResponse) => {
    res.headers.set('Content-Security-Policy', csp);
    const ref = (req.nextUrl.searchParams.get('ref') || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, '')
      .slice(0, 24);
    if (ref) {
      res.cookies.set({
        name: 'yp_ref',
        value: ref,
        path: '/',
        maxAge: 30 * 24 * 3600,
        sameSite: 'lax',
        httpOnly: false,
        secure: req.nextUrl.protocol === 'https:',
      });
    }
    return res;
  };

  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });
  const role = token?.role as string | undefined;
  const permissions = (token?.permissions as string) || '';
  const mustChangePassword = Boolean((token as { mustChangePassword?: boolean } | null)?.mustChangePassword);

  // Staff first-login: must set own password before using the site
  if (
    token &&
    mustChangePassword &&
    !pathname.startsWith('/change-password') &&
    !pathname.startsWith('/api/auth') &&
    !pathname.startsWith('/_next') &&
    pathname !== '/login' &&
    pathname !== '/forgot-password' &&
    pathname !== '/reset-password'
  ) {
    return NextResponse.redirect(new URL('/change-password', req.url));
  }

  const maintenanceRedirect = await checkMaintenance(req, role);
  if (maintenanceRedirect) return maintenanceRedirect;

  if (!isTechRole(role) && !pathname.startsWith('/unavailable')) {
    const key = moduleKeyForPath(pathname);
    if (key && key !== 'maintenance') {
      const data = await fetchPublicStatus(req);
      if (data.modules && data.modules[key] === false) {
        if (pathname.startsWith('/api/')) {
          return NextResponse.json(
            { message: 'Модуль временно отключён', code: 'MODULE_DISABLED', module: key },
            { status: 503 }
          );
        }
        return NextResponse.redirect(new URL(`/unavailable?m=${encodeURIComponent(key)}`, req.url));
      }
    }
  }

  if ((pathname === '/login' || pathname === '/register') && token) {
    if (role === 'SCANNER') {
      return NextResponse.redirect(new URL('/scanner', req.url));
    }
    if (isTechRole(role)) {
      return NextResponse.redirect(new URL('/ops', req.url));
    }
    if (role === 'ADMIN' || role === 'MODERATOR') {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
    if (pathname === '/login') {
      const data = await fetchPublicStatus(req);
      if (data.maintenanceMode) {
        return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
      }
    }
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  if (pathname.startsWith('/ops')) {
    if (!token || !isTechRole(role)) {
      return NextResponse.redirect(new URL('/', req.url));
    }
  }

  if (pathname.startsWith('/scanner')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login?callbackUrl=/scanner&staff=1', req.url));
    }
    if (!canUseScanner(role, permissions)) {
      return NextResponse.redirect(
        new URL(role === 'USER' || role === 'PARTICIPANT' ? '/dashboard' : '/admin', req.url)
      );
    }
  }

  if (pathname.startsWith('/admin')) {
    if (!token) {
      return NextResponse.redirect(new URL('/login?callbackUrl=/admin&staff=1', req.url));
    }
    if (role === 'SCANNER') {
      return NextResponse.redirect(new URL('/scanner', req.url));
    }
    if (isTechRole(role)) {
      return withCsp(NextResponse.next({ request: { headers: requestHeaders } }));
    }
    if (role !== 'ADMIN' && role !== 'MODERATOR') {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    if (!canAccessAdminPath(role, permissions, pathname)) {
      return NextResponse.redirect(new URL('/admin', req.url));
    }
  }

  if (
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/friends') ||
    pathname.startsWith('/messages') ||
    Boolean(pathname.match(/^\/spaces\/[^/]+\/book$/))
  ) {
    if (!token) {
      return NextResponse.redirect(new URL(`/login?callbackUrl=${encodeURIComponent(pathname)}`, req.url));
    }
    if (role === 'SCANNER') {
      return NextResponse.redirect(new URL('/scanner', req.url));
    }
    if (isTechRole(role)) {
      return NextResponse.redirect(new URL('/ops', req.url));
    }
  }

  return withCsp(
    NextResponse.next({
      request: { headers: requestHeaders },
    })
  );
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml)$).*)',
  ],
};
