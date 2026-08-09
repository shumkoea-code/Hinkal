'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { UserCircle } from 'lucide-react';
import { RatingProgressChips, buildRatingItems, type RatingItem } from '@/components/RatingProgressIcons';

type ProfileLite = {
  id?: string;
  name?: string | null;
  nickname?: string | null;
  image?: string | null;
  publicCode?: string | null;
  reliabilityScore?: number | null;
  socialScore?: number | null;
  ecoPoints?: number | null;
};

type Props = {
  href: string;
  fallbackName?: string | null;
  active?: boolean;
  onNavigate?: () => void;
};

export default function NavProfileCard({ href, fallbackName, active = true, onNavigate }: Props) {
  const [profile, setProfile] = useState<ProfileLite | null>(null);
  const [items, setItems] = useState<RatingItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, eRes] = await Promise.all([
        fetch('/api/user/profile', { cache: 'no-store' }),
        fetch('/api/user/eco', { cache: 'no-store' }),
      ]);
      const p = pRes.ok ? await pRes.json() : null;
      const e = eRes.ok ? await eRes.json() : null;

      if (p?.id) setProfile(p);

      const level = e?.level?.level;
      const ecoPoints = typeof e?.ecoPoints === 'number' ? e.ecoPoints : p?.ecoPoints ?? 0;
      setItems(
        buildRatingItems({
          level: level?.level ?? 1,
          levelTitle: level?.title,
          levelColor: level?.color,
          levelPct: typeof e?.level?.pct === 'number' ? e.level.pct : 0,
          authority: p?.reliabilityScore ?? 100,
          social: p?.socialScore ?? 50,
          ecoPoints,
          ecoPct: typeof e?.level?.pct === 'number' ? e.level.pct : Math.min(100, ecoPoints),
        })
      );
    } catch {
      /* keep previous */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  useEffect(() => {
    if (!active) return;
    const onFocus = () => void load();
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [active, load]);

  const displayName = profile?.nickname || profile?.name || fallbackName || 'Мой профиль';
  const sub =
    profile?.nickname && profile?.name && profile.nickname !== profile.name
      ? profile.name
      : profile?.publicCode
        ? `ID ${profile.publicCode}`
        : null;

  return (
    <div className={`nav-profile-card${loading ? ' is-loading' : ''}`}>
      <Link href={href} onClick={onNavigate} className="nav-profile-card__main">
        <span className="nav-profile-card__avatar" aria-hidden>
          {profile?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={profile.image} alt="" />
          ) : (
            <UserCircle size={28} strokeWidth={1.75} />
          )}
        </span>
        <span className="nav-profile-card__text">
          <span className="nav-profile-card__name">{displayName}</span>
          {sub ? <span className="nav-profile-card__sub">{sub}</span> : null}
        </span>
      </Link>
      {items.length > 0 ? (
        <RatingProgressChips items={items} className="nav-profile-card__ratings" />
      ) : (
        <div className="nav-profile-card__ratings-skeleton" aria-hidden />
      )}
    </div>
  );
}
