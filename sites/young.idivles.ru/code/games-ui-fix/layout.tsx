import type { ReactNode } from 'react';
import { requireModulePage } from '@/lib/require-module-page';
import { getSiteIdentity } from '@/lib/site-identity';
import GamesTopbar from '@/components/games/GamesTopbar';
import './games.css';

export default async function Layout({ children }: { children: ReactNode }) {
  await requireModulePage('games');
  const identity = await getSiteIdentity();

  return (
    <div className="games-root">
      <GamesTopbar siteName={identity.siteName} />
      <div className="games-main">{children}</div>
    </div>
  );
}
