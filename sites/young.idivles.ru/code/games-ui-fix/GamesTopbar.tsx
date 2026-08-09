'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { GAMES, GAME_IDS, type GameId } from '@/lib/games';
import { GAME_ICONS } from '@/lib/game-icons';

type Props = {
  siteName: string;
};

export default function GamesTopbar({ siteName }: Props) {
  const pathname = usePathname() || '/games';
  const router = useRouter();
  const onHub = pathname === '/games' || pathname === '/games/';
  const active = GAME_IDS.find(
    (id) => pathname === GAMES[id].path || pathname.startsWith(`${GAMES[id].path}/`)
  );

  useEffect(() => {
    for (const id of GAME_IDS) {
      router.prefetch(GAMES[id].path);
    }
    router.prefetch('/games');
  }, [router]);

  return (
    <header className="games-topbar">
      <div className="games-topbar-row games-topbar-row--switcher">
        <Link href={onHub ? '/' : '/games'} className="games-topbar-back" title={onHub ? 'На сайт' : 'К хабу'}>
          {onHub ? '←' : '←'}
        </Link>
        <nav className="games-switcher" aria-label="Выбор игры">
          {GAME_IDS.map((id: GameId) => {
            const g = GAMES[id];
            const Icon = GAME_ICONS[id];
            const isActive = active === id;
            return (
              <Link
                key={id}
                href={g.path}
                className={`games-switcher__btn${isActive ? ' is-active' : ''}${onHub ? '' : ''}`}
                style={{ ['--sw-accent' as string]: g.accent }}
                prefetch
                aria-current={isActive ? 'page' : undefined}
                aria-label={g.title}
                title={g.title}
              >
                <Icon size={18} strokeWidth={2.35} aria-hidden />
                <span className="games-switcher__sr">{g.title}</span>
              </Link>
            );
          })}
        </nav>
        <Link href="/" className="games-topbar-home" aria-label="На сайт" title="На сайт">
          ✕
        </Link>
      </div>
      {!onHub && active ? (
        <div className="games-topbar-game" aria-hidden>
          <span
            className="games-topbar-game__dot"
            style={{ background: GAMES[active].accent }}
          />
          {GAMES[active].title}
          <span className="games-topbar-game__site">{siteName}</span>
        </div>
      ) : (
        <div className="games-topbar-game" aria-hidden>
          <span className="games-topbar-game__dot" style={{ background: '#3b82f6' }} />
          Игры
          <span className="games-topbar-game__site">{siteName}</span>
        </div>
      )}
    </header>
  );
}
