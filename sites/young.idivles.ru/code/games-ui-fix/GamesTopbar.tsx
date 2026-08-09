'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { GAMES, GAME_IDS, type GameId } from '@/lib/games';

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
        <Link href={onHub ? '/' : '/games'} className="games-topbar-back">
          {onHub ? '← Сайт' : '← Хаб'}
        </Link>
        {onHub ? (
          <span className="games-topbar-title" title={siteName}>
            Игры
          </span>
        ) : (
          <nav className="games-switcher" aria-label="Выбор игры">
            {GAME_IDS.map((id: GameId) => {
              const g = GAMES[id];
              const isActive = active === id;
              return (
                <Link
                  key={id}
                  href={g.path}
                  className={`games-switcher__btn${isActive ? ' is-active' : ''}`}
                  style={{ ['--sw-accent' as string]: g.accent }}
                  prefetch
                  aria-current={isActive ? 'page' : undefined}
                >
                  {g.title}
                </Link>
              );
            })}
          </nav>
        )}
        <Link href="/" className="games-topbar-home" aria-label="На сайт">
          ✕
        </Link>
      </div>
    </header>
  );
}
