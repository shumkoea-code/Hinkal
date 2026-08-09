'use client';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import {
  Award,
  Briefcase,
  Check,
  Download,
  ExternalLink,
  Lock,
  MapPin,
  MessageCircle,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import UserAvatar from '@/components/UserAvatar';
import { avatarFrameFromTiers, pickAvatarBadgeCodes } from '@/lib/avatar-frame';
import { TIER_META, type AchievementTier } from '@/lib/achievements';
import MutualOverlapChips from '@/components/MutualOverlapChips';
import PhotoGallery from '@/components/PhotoGallery';
import ReputationHistoryModal from '@/components/ReputationHistoryModal';
import {
  RatingProgressChips,
  buildRatingItems,
  type RatingKind,
} from '@/components/RatingProgressIcons';
import '@/app/messages/messages.css';

type PublicProfile = {
  user: {
    id: string;
    publicCode?: string | null;
    nickname?: string | null;
    name: string | null;
    image: string | null;
    city: string | null;
    bio: string | null;
    about?: string | null;
    hobbies?: string[];
    interests?: string[];
    attendedCount?: number | null;
    reliabilityScore: number | null;
    socialScore?: number | null;
    ecoPoints?: number | null;
    steamUrl?: string | null;
    vkUrl?: string | null;
    telegramUrl?: string | null;
    maxUrl?: string | null;
  };
  gallery?: string[];
  achievements?: {
    code: string;
    title: string;
    tier: string;
    accent: string;
    tierLabel: string;
  }[];
  showcaseBadges?: {
    code: string;
    title: string;
    tier: string;
    accent: string;
    icon?: string;
  }[];
  memberships?: {
    clubs: { id: string; title: string; href: string }[];
    projects: { id: string; title: string; href: string }[];
  };
  mutualTrust: {
    score: number;
    label: string;
    sharedEvents: number;
    messages: number;
    friendDays: number;
    overlap?: {
      clubs: { id: string; title: string }[];
      projects: { id: string; title: string }[];
      spaces: { id: string; title: string }[];
      interests: string[];
    };
  } | null;
  presence?: { online: boolean; label: string } | null;
  portfolio?: {
    status: string;
    href: string;
    downloadHref?: string;
    printHref?: string;
    headline?: string | null;
    summary?: string | null;
  } | null;
  ecoPoints?: number | null;
  level?: {
    pct?: number;
    level?: { level?: number; title?: string; color?: string };
  } | null;
  friendship: {
    id: string;
    status: string;
    direction: 'incoming' | 'outgoing';
  } | null;
  isSelf: boolean;
  visibility?: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
  isPrivate?: boolean;
  canAddFriend?: boolean;
  inviteRequired?: boolean;
  inviteOk?: boolean;
  limited?: boolean;
  aliased?: boolean;
  authenticated?: boolean;
};

const primaryButton = {
  border: 0,
  borderRadius: 11,
  padding: '0.65rem 0.9rem',
  fontWeight: 750,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 7,
  cursor: 'pointer',
  textDecoration: 'none',
} as const;

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.28rem 0.6rem',
  borderRadius: 999,
  background: 'rgba(37,99,235,0.08)',
  color: '#1d4ed8',
  fontSize: '0.78rem',
  fontWeight: 700,
  textDecoration: 'none',
};

function PublicUserPageInner() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const id = params.id;
  const invite = searchParams.get('invite') || '';
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [repModalOpen, setRepModalOpen] = useState(false);
  const [repModalTab, setRepModalTab] = useState<'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO'>('AUTHORITY');

  const load = useCallback(async () => {
    const qs = invite ? `?invite=${encodeURIComponent(invite)}` : '';
    const response = await fetch(`/api/users/${encodeURIComponent(id)}/public${qs}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Профиль не найден');
    setProfile(result);
  }, [id, invite]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const qs = invite ? `?invite=${encodeURIComponent(invite)}` : '';
        const response = await fetch(`/api/users/${encodeURIComponent(id)}/public${qs}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Профиль не найден');
        if (!cancelled) setProfile(result);
      } catch (error) {
        if (!cancelled) {
          toast.error(error instanceof Error ? error.message : 'Ошибка');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    initialize();
    return () => {
      cancelled = true;
    };
  }, [id, invite]);

  const addFriend = async () => {
    setBusy(true);
    try {
      const response = await fetch('/api/friends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: id, invite: invite || undefined }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Не удалось отправить заявку');
      await load();
      toast.success('Заявка отправлена');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const updateFriendship = async (action: 'accept' | 'decline' | 'cancel' | 'remove') => {
    if (!profile?.friendship) return;
    setBusy(true);
    try {
      const response = await fetch('/api/friends', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ friendshipId: profile.friendship.id, action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || 'Не удалось выполнить действие');
      await load();
      toast.success(action === 'accept' ? 'Теперь вы друзья' : 'Готово');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <div className="container" style={{ padding: '2rem 1rem' }}>Загрузка…</div>;
  }
  if (!profile) {
    return (
      <div className="container" style={{ padding: '2rem 1rem', textAlign: 'center' }}>
        Профиль не найден
      </div>
    );
  }

  const { user, friendship, mutualTrust, presence, portfolio } = profile;
  const gallery = profile.gallery || [];
  const reliability =
    user.reliabilityScore == null ? null : Math.max(0, Math.min(100, user.reliabilityScore));
  const social =
    user.socialScore == null ? null : Math.max(0, Math.min(100, user.socialScore));
  const showAdd = Boolean(profile.canAddFriend) || Boolean(profile.inviteOk && !friendship);
  const hobbies = user.hobbies || [];
  const interests = user.interests || [];
  const achievements = profile.achievements || [];
  const achTiers = achievements
    .map((a) => a.tier)
    .filter((t): t is AchievementTier => t === 'bronze' || t === 'silver' || t === 'gold');
  const frame = avatarFrameFromTiers(achTiers);
  const showcase = profile.showcaseBadges || [];
  const avatarBadges = (
    showcase.length
      ? showcase.map((b) => ({
          label: b.tier === 'gold' ? '★' : b.tier === 'silver' ? '◆' : '●',
          color: b.accent || TIER_META[(b.tier as AchievementTier) || 'bronze']?.color || '#64748b',
          title: b.title,
        }))
      : pickAvatarBadgeCodes(
          achievements.map((a) => ({ code: a.code, tier: (a.tier as AchievementTier) || 'bronze' }))
        ).map((b) => ({
          label: b.tier === 'gold' ? '★' : b.tier === 'silver' ? '◆' : '●',
          color: TIER_META[b.tier].color,
          title: achievements.find((x) => x.code === b.code)?.title || b.code,
        }))
  );
  const clubs = profile.memberships?.clubs || [];
  const projects = profile.memberships?.projects || [];
  const tags = [...new Set([...interests, ...hobbies])];

  return (
    <main className="container" style={{ padding: '1.25rem 1rem 2.5rem', maxWidth: 820 }}>
      <section className="glass" style={{ padding: 'clamp(1rem, 4vw, 1.5rem)', overflow: 'hidden' }}>
        <div style={{ display: 'flex', gap: 15, alignItems: 'center', minWidth: 0 }}>
          <UserAvatar
            name={user.name}
            image={user.image}
            size={88}
            aliased={Boolean(profile.aliased)}
            online={presence?.online}
            showStatus={presence != null}
            frameColor={frame.border}
            frameGlow={frame.glow}
            badges={avatarBadges}
          />
          <div style={{ minWidth: 0 }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(1.4rem, 5vw, 2rem)', overflowWrap: 'anywhere' }}>
              {user.name || 'Пользователь'}
            </h1>
            {user.nickname && user.nickname !== user.name ? (
              <div style={{ marginTop: 2, fontSize: '0.9rem', fontWeight: 650, color: '#475569' }}>
                @{user.nickname}
              </div>
            ) : null}
            {presence ? (
              <div
                style={{
                  marginTop: 4,
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: presence.online ? '#16a34a' : '#64748b',
                }}
              >
                {presence.label}
              </div>
            ) : null}
            {user.publicCode && (
              <div
                style={{
                  marginTop: 6,
                  fontSize: '0.82rem',
                  fontWeight: 700,
                  fontFamily: 'ui-monospace, monospace',
                  color: '#64748b',
                }}
              >
                ID {user.publicCode}
              </div>
            )}
            {user.city && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--muted)', marginTop: 5 }}>
                <MapPin size={15} /> {user.city}
              </div>
            )}
            {(profile.isPrivate || profile.visibility === 'FRIENDS' || profile.aliased) && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  marginTop: 8,
                  padding: '0.25rem 0.55rem',
                  borderRadius: 999,
                  background: 'rgba(15,23,42,0.06)',
                  color: '#475569',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}
              >
                <Lock size={12} />
                {profile.aliased
                  ? 'Сказочный псевдоним'
                  : profile.visibility === 'PRIVATE'
                    ? 'Закрытый профиль'
                    : 'Видно друзьям'}
              </div>
            )}
          </div>
        </div>

        {profile.limited && !profile.isSelf && (
          <p style={{ margin: '1rem 0 0', lineHeight: 1.55, color: '#64748b' }}>
            {profile.inviteRequired && !profile.inviteOk
              ? 'Профиль закрыт. Добавить в друзья можно только по персональной ссылке-приглашению владельца.'
              : 'Подробности профиля доступны друзьям.'}
          </p>
        )}

        
        {!profile.limited ? (
          <div className="public-profile-ratings">
            <RatingProgressChips
              items={buildRatingItems({
                level: profile.level?.level?.level ?? 1,
                levelTitle: profile.level?.level?.title,
                levelColor: profile.level?.level?.color,
                levelPct: profile.level?.pct ?? 0,
                authority: reliability ?? 100,
                social: social ?? 50,
                ecoPoints: profile.ecoPoints ?? user.ecoPoints ?? 0,
                ecoPct: profile.level?.pct ?? 0,
              })}
              onSelect={
                profile.isSelf
                  ? (kind: RatingKind) => {
                      setRepModalTab(kind);
                      setRepModalOpen(true);
                    }
                  : undefined
              }
            />
          </div>
        ) : null}

{user.bio && (
          <p style={{ margin: '1rem 0 0', lineHeight: 1.55, color: '#334155', whiteSpace: 'pre-wrap' }}>
            {user.bio}
          </p>
        )}

        {user.about && (
          <p
            style={{
              margin: user.bio ? '0.65rem 0 0' : '1rem 0 0',
              lineHeight: 1.55,
              color: '#475569',
              whiteSpace: 'pre-wrap',
              fontSize: '0.92rem',
            }}
          >
            {user.about}
          </p>
        )}

        {gallery.length > 0 ? (
          <div style={{ marginTop: '1rem' }}>
            <div style={{ fontWeight: 700, fontSize: '0.9rem', marginBottom: '0.5rem', color: '#0f172a' }}>
              Галерея
            </div>
            <PhotoGallery images={gallery} hideTitle />
          </div>
        ) : null}

        {tags.length > 0 ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: '0.9rem' }}>
            {tags.map((tag) => (
              <span key={tag} style={chipStyle}>
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {(user.steamUrl || user.vkUrl || user.telegramUrl || user.maxUrl) && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: '1rem' }}>
            {user.vkUrl && (
              <a href={user.vkUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>
                VK
              </a>
            )}
            {user.telegramUrl && (
              <a href={user.telegramUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>
                Telegram
              </a>
            )}
            {user.maxUrl && (
              <a href={user.maxUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>
                MAX
              </a>
            )}
            {user.steamUrl && (
              <a href={user.steamUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary" style={{ fontSize: '0.82rem', padding: '0.4rem 0.75rem' }}>
                Steam
              </a>
            )}
          </div>
        )}

        {profile.inviteOk && !friendship && !profile.isSelf && (
          <p
            style={{
              margin: '1rem 0 0',
              padding: '0.75rem 0.9rem',
              borderRadius: 12,
              background: 'rgba(37,99,235,0.08)',
              color: '#1e40af',
              fontSize: '0.88rem',
              lineHeight: 1.45,
            }}
          >
            Вы перешли по приглашению — можете отправить заявку в друзья.
          </p>
        )}

        {!profile.isSelf && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: '1rem' }}>
            {showAdd && !friendship && (
              <button
                type="button"
                onClick={addFriend}
                disabled={busy}
                style={{ ...primaryButton, background: '#2563eb', color: '#fff' }}
              >
                <UserPlus size={17} /> Добавить в друзья
              </button>
            )}
            {friendship?.status === 'PENDING' && friendship.direction === 'outgoing' && (
              <>
                <button
                  type="button"
                  disabled
                  style={{ ...primaryButton, background: '#eef2f7', color: '#64748b', cursor: 'default' }}
                >
                  <Check size={17} /> Заявка отправлена
                </button>
                <button
                  type="button"
                  onClick={() => updateFriendship('cancel')}
                  disabled={busy}
                  style={{ ...primaryButton, background: '#fff', color: '#475569', border: '1px solid #e2e8f0' }}
                >
                  Отменить
                </button>
              </>
            )}
            {friendship?.status === 'PENDING' && friendship.direction === 'incoming' && (
              <>
                <button
                  type="button"
                  onClick={() => updateFriendship('accept')}
                  disabled={busy}
                  style={{ ...primaryButton, background: '#16a34a', color: '#fff' }}
                >
                  <Check size={17} /> Принять заявку
                </button>
                <button
                  type="button"
                  onClick={() => updateFriendship('decline')}
                  disabled={busy}
                  style={{ ...primaryButton, background: '#eef2f7', color: '#475569' }}
                >
                  <X size={17} /> Отклонить
                </button>
              </>
            )}
            {friendship?.status === 'ACCEPTED' && (
              <>
                <Link
                  href={`/messages?with=${user.id}`}
                  style={{ ...primaryButton, background: '#2563eb', color: '#fff' }}
                >
                  <MessageCircle size={17} /> Написать
                </Link>
                <button
                  type="button"
                  onClick={() => updateFriendship('remove')}
                  disabled={busy}
                  style={{ ...primaryButton, background: '#eef2f7', color: '#475569' }}
                >
                  Удалить из друзей
                </button>
              </>
            )}
            {portfolio?.status === 'APPROVED' && portfolio.href ? (
              <>
                <Link
                  href={portfolio.href}
                  style={{ ...primaryButton, background: '#0f766e', color: '#fff' }}
                >
                  <Briefcase size={17} /> Смотреть портфолио
                </Link>
                <a
                  href={portfolio.downloadHref || `/api/portfolio/${user.id}/download?mode=download`}
                  style={{ ...primaryButton, background: '#ecfdf5', color: '#0f766e' }}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={17} /> Скачать
                </a>
              </>
            ) : null}
            {friendship?.status === 'DECLINED' && (
              <div style={{ color: 'var(--muted)', fontSize: '0.88rem', padding: '0.6rem 0' }}>
                Заявка была отклонена
              </div>
            )}
          </div>
        )}

        {profile.isSelf && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: '1rem' }}>
            <Link
              href="/dashboard?tab=profile&section=edit"
              style={{ ...primaryButton, background: '#2563eb', color: '#fff' }}
            >
              Редактировать профиль
            </Link>
            <Link
              href="/dashboard?tab=portfolio"
              style={{ ...primaryButton, background: '#eef2f7', color: '#475569' }}
            >
              <Briefcase size={17} /> Портфолио
            </Link>
            {portfolio?.status === 'APPROVED' && portfolio.href ? (
              <>
                <Link href={portfolio.href} style={{ ...primaryButton, background: '#0f766e', color: '#fff' }}>
                  <ExternalLink size={17} /> Смотреть
                </Link>
                <a
                  href={portfolio.downloadHref || `/api/portfolio/${user.id}/download?mode=download`}
                  style={{ ...primaryButton, background: '#ecfdf5', color: '#0f766e' }}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Download size={17} /> Скачать
                </a>
              </>
            ) : null}
          </div>
        )}

        {profile.isSelf ? (
          <details className="profile-guide glass public-profile-guide" style={{ marginTop: '1rem' }}>
            <summary>
              Как оформить профиль
              {frame.label ? (
                <span className="public-profile-guide__meta">рамка: {frame.label}</span>
              ) : null}
            </summary>
            <ol>
              <li>Загрузите фото — рамка подсветится цветом лучших ачивок.</li>
              <li>Заполните «О себе», хобби и город — так вас находят друзья и организаторы.</li>
              <li>В кабинете → Портфолио добавьте грамоты (фото или PDF) — они войдут в печатный документ с вашей фотографией.</li>
              <li>Следите за рейтингом надёжности: посещайте мероприятия и соблюдайте правила переписки.</li>
            </ol>
          </details>
        ) : null}
      </section>

      {portfolio?.status === 'APPROVED' ? (
        <section className="glass public-profile-portfolio" style={{ padding: '1rem 1.1rem', marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800 }}>
            <Briefcase size={18} color="#0f766e" /> Портфолио
            <span style={{ marginLeft: 'auto', fontSize: '0.72rem', fontWeight: 700, color: '#0f766e', background: 'rgba(15,118,110,0.1)', padding: '0.2rem 0.5rem', borderRadius: 999 }}>
              Одобрено
            </span>
          </div>
          {portfolio.headline ? (
            <div style={{ fontWeight: 750, fontSize: '1.02rem' }}>{portfolio.headline}</div>
          ) : null}
          {portfolio.summary ? (
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem', lineHeight: 1.45 }}>{portfolio.summary}</p>
          ) : (
            <p style={{ margin: 0, color: '#64748b', fontSize: '0.88rem', lineHeight: 1.45 }}>
              Опубликованное портфолио можно открыть и скачать.
            </p>
          )}
          <div className="public-profile-portfolio__actions">
            <Link href={portfolio.href} className="btn btn-primary" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <ExternalLink size={16} /> Смотреть
            </Link>
            <a
              href={portfolio.downloadHref || `/api/portfolio/${user.id}/download?mode=download`}
              className="btn btn-secondary"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
              target="_blank"
              rel="noreferrer"
            >
              <Download size={16} /> Скачать
            </a>
          </div>
        </section>
      ) : null}

      {!profile.limited && achievements.length > 0 ? (
        <section className="glass profile-achs public-profile-section" style={{ padding: '0.85rem 1rem', marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, marginBottom: 8 }}>
            <Award size={17} color="#ca8a04" /> Достижения
            <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#64748b', fontWeight: 650 }}>
              {achievements.length}
            </span>
          </div>
          <div className="profile-achs__list">
            {achievements.map((a) => (
              <span
                key={a.code}
                className="profile-achs__chip"
                title={`${a.tierLabel}: ${a.title}`}
                style={{ ['--ach-accent' as string]: a.accent }}
              >
                <i className={`profile-achs__dot is-${a.tier}`} aria-hidden />
                {a.title}
              </span>
            ))}
          </div>
        </section>
      ) : null}

      {!profile.limited && (clubs.length > 0 || projects.length > 0) ? (
        <section className="glass public-profile-section" style={{ padding: '0.9rem 1rem', marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800, marginBottom: 10 }}>
            <Users size={18} color="#2563eb" /> Участие
          </div>
          {clubs.length > 0 ? (
            <div style={{ marginBottom: projects.length ? 12 : 0 }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Клубы</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {clubs.map((c) => (
                  <Link key={c.id} href={c.href} style={chipStyle}>
                    {c.title}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
          {projects.length > 0 ? (
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748b', marginBottom: 6 }}>Проекты</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {projects.map((p) => (
                  <Link
                    key={p.id}
                    href={p.href}
                    style={{ ...chipStyle, background: 'rgba(15,118,110,0.1)', color: '#0f766e' }}
                  >
                    {p.title}
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {!profile.isSelf ? (
        <section className="glass public-profile-section" style={{ padding: '1rem', marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontWeight: 800 }}>
              <Users size={18} color="#2563eb" /> Взаимное доверие
            </div>
            {mutualTrust ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 9 }}>
                  <strong style={{ fontSize: '1.5rem' }}>{mutualTrust.score}%</strong>
                  <span style={{ color: 'var(--muted)', fontSize: '0.78rem' }}>{mutualTrust.label}</span>
                </div>
                <div style={{ height: 7, background: '#e2e8f0', borderRadius: 999, overflow: 'hidden', marginTop: 8 }}>
                  <div
                    style={{
                      width: `${mutualTrust.score}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #2563eb, #0ea5e9)',
                    }}
                  />
                </div>
                <div style={{ color: 'var(--muted)', fontSize: '0.72rem', marginTop: 8 }}>
                  Общих событий: {mutualTrust.sharedEvents} · сообщений: {mutualTrust.messages}
                  {mutualTrust.overlap?.clubs?.length
                    ? ` · клубов: ${mutualTrust.overlap.clubs.length}`
                    : ''}
                </div>
                <MutualOverlapChips overlap={mutualTrust.overlap} />
              </>
            ) : (
              <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: '0.8rem 0 0', lineHeight: 1.45 }}>
                {profile.authenticated || friendship
                  ? friendship?.status === 'PENDING'
                    ? 'Доверие станет доступно после принятия заявки в друзья.'
                    : 'Уровень доверия появится, когда вы станете друзьями или появится общая активность.'
                  : 'Войдите, чтобы увидеть уровень доверия.'}
              </p>
            )}
        </section>
      ) : null}
      {profile.isSelf ? (
        <ReputationHistoryModal
          open={repModalOpen}
          initialTab={repModalTab}
          onClose={() => setRepModalOpen(false)}
        />
      ) : null}
    </main>
  );
}

export default function PublicUserPage() {
  return (
    <Suspense fallback={<div className="container" style={{ padding: '2rem 1rem' }}>Загрузка…</div>}>
      <PublicUserPageInner />
    </Suspense>
  );
}
