'use client';

import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  LogOut,
  User,
  Settings,
  FileText,
  Ticket,
  Pencil,
  ImagePlus,
  BadgeCheck,
  Crown,
  Award,
  Zap,
  Briefcase,
  FolderKanban,
  Users,
  CalendarDays,
  Building2,
  MessageCircle,
  UserPlus,
  HandHeart,
  Ban,
  ChevronRight,
} from 'lucide-react';
import { signOut } from 'next-auth/react';
import toast from 'react-hot-toast';
import QRCodeDisplay from '@/components/QRCodeDisplay';
import AddToCalendarButton from '@/components/AddToCalendarButton';
import EventSoonNotifier from '@/components/EventSoonNotifier';
import AchievementsPanel from '@/components/AchievementsPanel';
import PortfolioEditor from '@/components/PortfolioEditor';
import EditBookingDetails from '@/components/EditBookingDetails';
import TagPicker from '@/components/TagPicker';
import SessionSecurityPanel from '@/components/SessionSecurityPanel';
import RecoveryPhrasePanel from '@/components/RecoveryPhrasePanel';
import AccountDeletionPanel from '@/components/AccountDeletionPanel';
import { collectDeviceFingerprint } from '@/lib/device-fingerprint';
import ProfileGameScores from '@/components/ProfileGameScores';
import ProfileHeroCard from '@/components/ProfileHeroCard';
import { RatingProgressChips, buildRatingItems, type RatingKind } from '@/components/RatingProgressIcons';
import { zodiacFromDate } from '@/lib/profile-meta';
import { formatMskDate, formatMskDateTime, formatMskTime } from '@/lib/booking-hours';
import { fairyTaleAvatarUrl, fairyTaleDisplayName } from '@/lib/privacy-alias';
import UserAvatar from '@/components/UserAvatar';
import ProfileGuides from '@/components/ProfileGuides';
import PersonalGalleryEditor from '@/components/PersonalGalleryEditor';
import ReputationHistoryModal from '@/components/ReputationHistoryModal';
import EcoPointsPanel from '@/components/EcoPointsPanel';
import ReferralPanel from '@/components/ReferralPanel';
import CollectiblesPanel from '@/components/CollectiblesPanel';
import {
  QUICK_ACCESS_TUTORIAL_DONE_EVENT,
} from '@/lib/quick-access';

function DashboardInner() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTab =
    searchParams.get('tab') === 'tickets'
      ? 'tickets'
      : searchParams.get('tab') === 'profile'
        ? 'profile'
        : searchParams.get('tab') === 'achievements'
          ? 'achievements'
          : searchParams.get('tab') === 'portfolio'
            ? 'portfolio'
            : 'applications';
  const [activeTab, setActiveTab] = useState(initialTab);
  const [bookings, setBookings] = useState<any[]>([]);
  const [applications, setApplications] = useState<any[]>([]);
  const [vacancyApplications, setVacancyApplications] = useState<any[]>([]);
  const [participations, setParticipations] = useState<any[]>([]);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profile, setProfile] = useState<{
    id?: string;
    publicCode?: string | null;
    nickname?: string | null;
    name?: string;
    email?: string;
    phone?: string;
    image?: string;
    socialScore?: number;
    ecoPoints?: number;
    reliabilityScore?: number;
    attendedCount?: number;
    noShowCount?: number;
    privacyAcceptedAt?: string | null;
    privacyFirstAcceptedAt?: string | null;
    privacyRefusedAt?: string | null;
    privacyPolicyVersion?: string | null;
    privacySignature?: string | null;
    cookiesAcceptedAt?: string | null;
    cookiesPolicyVersion?: string | null;
    cookiesSignature?: string | null;
    rulesAcceptedAt?: string | null;
    rulesPolicyVersion?: string | null;
    rulesSignature?: string | null;
    deletionRequestedAt?: string | null;
    deletionEffectiveAt?: string | null;
    birthDate?: string | null;
    gender?: 'MALE' | 'FEMALE' | null;
    bio?: string | null;
    city?: string | null;
    about?: string | null;
    hobbies?: string[];
    interests?: string[];
    zodiac?: string | null;
    instructionsVersion?: string | null;
    instructionsCompletedAt?: string | null;
    showcaseBadges?: string[] | null;
    profileVisibility?: 'PUBLIC' | 'FRIENDS' | 'PRIVATE';
    friendInviteToken?: string | null;
    steamUrl?: string | null;
    vkUrl?: string | null;
    telegramUrl?: string | null;
    telegramChatId?: string | null;
    maxUserId?: string | null;
    maxUrl?: string | null;
  } | null>(null);
  const [ticketBusy, setTicketBusy] = useState(false);
  const [bookingBusyId, setBookingBusyId] = useState<string | null>(null);
  const [profileHobbies, setProfileHobbies] = useState<string[]>([]);
  const [profileInterests, setProfileInterests] = useState<string[]>([]);
  const [profileBirthDate, setProfileBirthDate] = useState('');
  const [profileGender, setProfileGender] = useState<'' | 'MALE' | 'FEMALE'>('');
  const [profileVisibility, setProfileVisibility] = useState<'PUBLIC' | 'FRIENDS' | 'PRIVATE'>('PUBLIC');
  const [onlineVisibility, setOnlineVisibility] = useState<'FRIENDS' | 'PUBLIC' | 'HIDDEN'>('FRIENDS');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarName, setAvatarName] = useState('');
  const [appsSubTab, setAppsSubTab] = useState<'projects' | 'clubs' | 'programs' | 'events' | 'spaces'>('projects');
  const [profileSection, setProfileSection] = useState<'overview' | 'edit'>('overview');
  const [achievementLegend, setAchievementLegend] = useState(false);
  const [modernUserBadge, setModernUserBadge] = useState(false);
  const [repModalOpen, setRepModalOpen] = useState(false);
  const [repModalTab, setRepModalTab] = useState<'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO'>('AUTHORITY');
  const [levelMeta, setLevelMeta] = useState<{ level: number; title: string; color: string; pct: number }>({
    level: 1,
    title: 'Новичок',
    color: '#94a3b8',
    pct: 0,
  });
  const openRepModal = (tab: 'LEVEL' | 'AUTHORITY' | 'SOCIAL' | 'ECO') => {
    setRepModalTab(tab);
    setRepModalOpen(true);
  };



  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab === 'tickets' || tab === 'profile' || tab === 'applications' || tab === 'achievements' || tab === 'portfolio') {
      setActiveTab(tab);
    }
    const section = searchParams.get('section');
    if (section === 'edit' || section === 'overview') {
      setProfileSection(section);
    }
  }, [searchParams]);

  const projectApplications = useMemo(
    () => applications.filter((app) => app.project),
    [applications]
  );
  const clubApplications = useMemo(
    () => applications.filter((app) => app.club && !app.project),
    [applications]
  );
  const programApplications = useMemo(
    () => applications.filter((app) => app.program),
    [applications]
  );

  useEffect(() => {
    return () => {
      if (avatarPreview?.startsWith('blob:')) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  useEffect(() => {
    const onDone = () => setModernUserBadge(true);
    window.addEventListener(QUICK_ACCESS_TUTORIAL_DONE_EVENT, onDone);
    return () => window.removeEventListener(QUICK_ACCESS_TUTORIAL_DONE_EVENT, onDone);
  }, []);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated') {
      // @ts-ignore
      if (session?.user?.role === 'SCANNER') {
        router.push('/scanner');
        return;
      }
      fetch('/api/user/bookings')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setBookings(data);
        })
        .catch((err) => console.error(err));

      fetch('/api/vacancies/apply')
        .then((r) => r.json())
        .then((d) => setVacancyApplications(Array.isArray(d.items) ? d.items : []))
        .catch(() => setVacancyApplications([]));
      fetch('/api/user/applications')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setApplications(data);
        })
        .catch((err) => console.error(err));
      fetch('/api/user/participations')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data)) setParticipations(data);
        })
        .catch((err) => console.error(err));
      fetch('/api/user/profile')
        .then((res) => res.json())
        .then((data) => {
          if (data?.id) {
            setProfile(data);
            setProfileHobbies(Array.isArray(data.hobbies) ? data.hobbies : []);
            setProfileInterests(Array.isArray(data.interests) ? data.interests : []);
            setProfileBirthDate(
              data.birthDate ? String(data.birthDate).slice(0, 10) : ''
            );
            setProfileGender(data.gender === 'MALE' || data.gender === 'FEMALE' ? data.gender : '');
            if (data.profileVisibility === 'FRIENDS' || data.profileVisibility === 'PRIVATE') {
              setProfileVisibility(data.profileVisibility);
            }
            if (data.onlineVisibility === 'PUBLIC' || data.onlineVisibility === 'HIDDEN' || data.onlineVisibility === 'FRIENDS') {
              setOnlineVisibility(data.onlineVisibility);
            } else {
              setProfileVisibility('PUBLIC');
            }
          }
        })
        .catch((err) => console.error(err));
      fetch('/api/user/achievements')
        .then((res) => res.json())
        .then((data) => {
          if (data?.progress?.complete || data?.legend) setAchievementLegend(true);
          const hasModern = Array.isArray(data?.items)
            ? data.items.some((i: { code?: string; unlocked?: boolean }) => i.code === 'MODERN_USER' && i.unlocked)
            : false;
          setModernUserBadge(hasModern);
        })
        .catch(() => undefined);
    }
  }, [status, router, session?.user?.role]);


  const refreshProfileLive = useCallback(() => {
    fetch('/api/user/profile', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data?.id) {
          setProfile(data);
          setProfileHobbies(Array.isArray(data.hobbies) ? data.hobbies : []);
          setProfileInterests(Array.isArray(data.interests) ? data.interests : []);
          setProfileBirthDate(data.birthDate ? String(data.birthDate).slice(0, 10) : '');
          setProfileGender(data.gender === 'MALE' || data.gender === 'FEMALE' ? data.gender : '');
          if (data.profileVisibility === 'FRIENDS' || data.profileVisibility === 'PRIVATE') {
            setProfileVisibility(data.profileVisibility);
          }
          if (
            data.onlineVisibility === 'PUBLIC' ||
            data.onlineVisibility === 'HIDDEN' ||
            data.onlineVisibility === 'FRIENDS'
          ) {
            setOnlineVisibility(data.onlineVisibility);
          }
        }
      })
      .catch(() => undefined);
    fetch('/api/user/eco', { cache: 'no-store' })
      .then((res) => res.json())
      .then((d) => {
        const lvl = d?.level?.level;
        if (!lvl) return;
        setLevelMeta({
          level: lvl.level || 1,
          title: lvl.title || 'Новичок',
          color: lvl.color || '#94a3b8',
          pct: typeof d.level?.pct === 'number' ? d.level.pct : 0,
        });
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    refreshProfileLive();
    const onFocus = () => refreshProfileLive();
    const onVis = () => {
      if (document.visibilityState === 'visible') refreshProfileLive();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [status, refreshProfileLive]);

  useEffect(() => {
    if (activeTab === 'profile') refreshProfileLive();
  }, [activeTab, refreshProfileLive]);


  const upcomingTickets = useMemo(() => {
    const now = Date.now();
    return [...participations]
      .filter((p) => p?.booking?.endTime && new Date(p.booking.endTime).getTime() >= now - 6 * 3600000)
      .sort(
        (a, b) => new Date(a.booking.startTime).getTime() - new Date(b.booking.startTime).getTime()
      );
  }, [participations]);

  useEffect(() => {
    if (!selectedTicket && upcomingTickets[0]?.ticketCode) {
      setSelectedTicket(upcomingTickets[0].ticketCode);
    }
  }, [upcomingTickets, selectedTicket]);

  const refreshParticipations = async () => {
    const res = await fetch('/api/user/participations');
    const data = await res.json();
    if (Array.isArray(data)) setParticipations(data);
  };

  const refreshBookings = async () => {
    const res = await fetch('/api/user/bookings');
    const data = await res.json();
    if (Array.isArray(data)) setBookings(data);
  };

  const cancelParticipation = async (bookingId: string) => {
    if (!bookingId || ticketBusy) return;
    if (!window.confirm('Отменить участие в мероприятии? Билет станет недействительным.')) return;
    setTicketBusy(true);
    try {
      const res = await fetch(`/api/bookings/${bookingId}/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Не удалось отменить');
      toast.success(data.message || 'Участие отменено');
      setSelectedTicket(null);
      await refreshParticipations();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setTicketBusy(false);
    }
  };

  const cancelSpaceBooking = async (bookingId: string) => {
    if (!bookingId || bookingBusyId) return;
    if (!window.confirm('Отменить бронь пространства?')) return;
    setBookingBusyId(bookingId);
    try {
      const res = await fetch(`/api/user/bookings/${bookingId}/cancel`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Не удалось отменить');
      toast.success(data.message || 'Бронь отменена');
      await refreshBookings();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBookingBusyId(null);
    }
  };

  if (status === 'loading' || !session) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '50vh' }}>
        Загрузка...
      </div>
    );
  }

  const goTab = (tab: string, section?: 'overview' | 'edit') => {
    setActiveTab(tab);
    if (tab === 'profile' && section) setProfileSection(section);
    if (tab === 'applications') {
      router.replace('/dashboard', { scroll: false });
      return;
    }
    const params = new URLSearchParams();
    params.set('tab', tab);
    if (tab === 'profile' && section && section !== 'overview') params.set('section', section);
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  };

  const goProfileSection = (section: 'overview' | 'edit') => {
    setProfileSection(section);
    const params = new URLSearchParams();
    params.set('tab', 'profile');
    if (section !== 'overview') params.set('section', section);
    router.replace(`/dashboard?${params.toString()}`, { scroll: false });
  };

  const selected = upcomingTickets.find((p) => p.ticketCode === selectedTicket) || upcomingTickets[0];

  return (
    <div className="container dashboard-page" style={{ padding: '1rem' }}>
      <EventSoonNotifier tickets={upcomingTickets} />
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="dashboard-layout">
          <aside className="glass dashboard-aside">
            <div className="dashboard-aside-head">
              <button
                type="button"
                onClick={() => goTab('profile', 'overview')}
                title="Мой профиль"
                aria-label="Мой профиль"
                className={achievementLegend ? 'avatar-legend-frame' : undefined}
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: '50%',
                  backgroundColor: achievementLegend ? undefined : 'var(--primary)',
                  color: 'white',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.35rem',
                  fontWeight: 600,
                  overflow: achievementLegend ? 'visible' : 'hidden',
                  flexShrink: 0,
                  position: 'relative',
                  padding: 0,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <div
                  className={achievementLegend ? 'avatar-legend-inner' : undefined}
                  style={
                    achievementLegend
                      ? { width: '100%', height: '100%' }
                      : {
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          overflow: 'hidden',
                          borderRadius: '50%',
                        }
                  }
                >
                  {(avatarPreview || profile?.image || session.user?.image) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarPreview || profile?.image || session.user?.image || ''}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    />
                  ) : (
                    session.user?.name?.charAt(0) || <User size={22} />
                  )}
                </div>
                {achievementLegend && (
                  <span
                    title="Легенда Сочи"
                    style={{
                      position: 'absolute',
                      top: -6,
                      right: -6,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #f59e0b, #fbbf24)',
                      color: '#78350f',
                      display: 'grid',
                      placeItems: 'center',
                      boxShadow: '0 2px 6px rgba(0,0,0,0.15)',
                    }}
                  >
                    <Crown size={11} />
                  </span>
                )}
                {modernUserBadge && (
                  <span className="avatar-modern-badge" title="Современный человек">
                    <Zap size={11} strokeWidth={2.5} />
                  </span>
                )}
              </button>
              <div className="dashboard-aside-meta">
                <div className="dashboard-aside-name-row">
                  <h3 className="dashboard-aside-name">{session.user?.name}</h3>
                  <div className="dashboard-aside-actions">
                    <button
                      type="button"
                      onClick={() => goTab('profile', 'edit')}
                      title="Редактировать профиль"
                      aria-label="Редактировать профиль"
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        border: '1px solid rgba(15,23,42,0.08)',
                        background: activeTab === 'profile' ? 'rgba(59,130,246,0.12)' : '#f8fafc',
                        color: activeTab === 'profile' ? 'var(--primary)' : '#475569',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => signOut()}
                      title="Выйти"
                      aria-label="Выйти"
                      style={{
                        flexShrink: 0,
                        width: 34,
                        height: 34,
                        borderRadius: 10,
                        border: '1px solid rgba(244,63,94,0.15)',
                        background: 'rgba(244,63,94,0.06)',
                        color: 'var(--accent)',
                        display: 'grid',
                        placeItems: 'center',
                        cursor: 'pointer',
                      }}
                    >
                      <LogOut size={15} />
                    </button>
                  </div>
                </div>
                <div className="dashboard-aside-email-row">
                  <p className="dashboard-aside-email">{session.user?.email}</p>
                  {profile?.privacyAcceptedAt && (
                    <span
                      title="Согласие с политикой подписано"
                      style={{
                        flexShrink: 0,
                        width: 22,
                        height: 22,
                        borderRadius: 8,
                        background: 'rgba(37,99,235,0.1)',
                        color: 'var(--primary)',
                        display: 'grid',
                        placeItems: 'center',
                      }}
                    >
                      <BadgeCheck size={13} />
                    </span>
                  )}
                </div>
                <div className="dashboard-aside__chips" aria-label="Рейтинги">
                  <RatingProgressChips
                    items={buildRatingItems({
                      level: levelMeta.level,
                      levelTitle: levelMeta.title,
                      levelColor: levelMeta.color,
                      levelPct: levelMeta.pct,
                      authority: profile?.reliabilityScore ?? 100,
                      social: profile?.socialScore ?? 50,
                      ecoPoints: profile?.ecoPoints ?? 0,
                      ecoPct: levelMeta.pct,
                    })}
                    onSelect={(kind: RatingKind) => openRepModal(kind)}
                  />
                </div>
              </div>
            </div>

            <nav className="dashboard-nav dashboard-nav--labeled" aria-label="Разделы кабинета">
              {(
                [
                  { id: 'tickets' as const, label: 'Билеты', icon: Ticket, kind: 'link' as const, href: '/tickets' },
                  { id: 'applications' as const, label: 'Заявки', icon: FileText, kind: 'tab' as const },
                  { id: 'achievements' as const, label: 'Ачивки', icon: Award, kind: 'tab' as const },
                  { id: 'portfolio' as const, label: 'Портфолио', icon: Briefcase, kind: 'tab' as const },
                  { id: 'friends' as const, label: 'Друзья', icon: UserPlus, kind: 'link' as const, href: '/friends' },
                  { id: 'messages' as const, label: 'Чат', icon: MessageCircle, kind: 'link' as const, href: '/messages' },
                ]
              ).map((item) => {
                const active = item.kind === 'tab' && activeTab === item.id;
                const className = `dashboard-nav-btn${active ? ' is-active' : ''}${
                  item.id === 'achievements' ? ' is-achievements' : ''
                }`;
                const inner = (
                  <>
                    <span className="dashboard-nav-icon-wrap">
                      <item.icon size={17} />
                      {item.id === 'tickets' && upcomingTickets.length > 0 && (
                        <span className="dashboard-nav-badge">
                          {upcomingTickets.length > 999 ? '999+' : upcomingTickets.length}
                        </span>
                      )}
                      {item.id === 'achievements' && achievementLegend && (
                        <Crown size={11} color="#ca8a04" className="dashboard-nav-crown" aria-hidden />
                      )}
                    </span>
                    <span className="dashboard-nav-label">{item.label}</span>
                  </>
                );
                if (item.kind === 'link') {
                  return (
                    <a
                      key={item.id}
                      href={item.href}
                      title={item.label}
                      aria-label={item.label}
                      className={className}
                    >
                      {inner}
                    </a>
                  );
                }
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => goTab(item.id)}
                    title={item.label}
                    aria-label={item.label}
                    className={className}
                  >
                    {inner}
                  </button>
                );
              })}
            </nav>

            {(session.user?.role === 'ADMIN' || session.user?.role === 'MODERATOR') && (
              <button type="button" onClick={() => router.push('/admin')} className="dashboard-admin-btn">
                <Settings size={16} /> Панель управления
              </button>
            )}
          </aside>

          <div className="glass dashboard-main">
            {activeTab === 'tickets' && (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.35rem', fontWeight: 700 }}>Ближайшие мероприятия</h2>
                <p style={{ color: 'var(--muted)', marginBottom: '1.25rem', fontSize: '0.95rem' }}>
                  Ваши билеты на афишу: QR, календарь и отмена — кнопки в одной строке.
                </p>

                {upcomingTickets.length === 0 ? (
                  <div
                    style={{
                      padding: '1.5rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'rgba(0,0,0,0.02)',
                      textAlign: 'center',
                    }}
                  >
                    <p style={{ color: 'var(--muted)', marginBottom: '1rem' }}>Пока нет билетов на мероприятия</p>
                    <a href="/events" className="btn btn-primary" style={{ display: 'inline-block' }}>
                      Открыть афишу
                    </a>
                  </div>
                ) : (
                  <div className="dash-ticket-list">
                    <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem', color: 'var(--muted)' }}>
                      Компактные карточки ближайших мероприятий. QR и действия — в одной строке.
                    </p>
                    {upcomingTickets.map((part) => {
                      const active = (selected?.ticketCode || '') === part.ticketCode;
                      return (
                        <article
                          key={part.id}
                          className={`dash-ticket-card${active ? ' is-active' : ''}`}
                        >
                          <button
                            type="button"
                            className="dash-ticket-card__qr"
                            onClick={() => setSelectedTicket(part.ticketCode)}
                            aria-label={`Показать QR: ${part.booking.title}`}
                            title="Показать QR"
                          >
                            <QRCodeDisplay value={part.ticketCode || ''} size={active ? 88 : 64} />
                          </button>
                          <div className="dash-ticket-card__body">
                            <h3 className="dash-ticket-card__title">{part.booking.title}</h3>
                            <div className="dash-ticket-card__meta">
                              {part.booking.space?.title || 'Площадка'} ·{' '}
                              {formatMskDateTime(part.booking.startTime)} (МСК)
                            </div>
                            <div className="dash-ticket-card__actions">
                              <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setSelectedTicket(part.ticketCode)}
                              >
                                QR
                              </button>
                              <AddToCalendarButton
                                uid={part.booking.id}
                                title={part.booking.title}
                                description={part.booking.description}
                                location={[part.booking.space?.title, part.booking.space?.address]
                                  .filter(Boolean)
                                  .join(', ')}
                                start={part.booking.startTime}
                                end={part.booking.endTime}
                                compact
                              />
                              <button
                                type="button"
                                className="btn btn-secondary ticket-cancel-btn"
                                disabled={ticketBusy}
                                onClick={() => cancelParticipation(part.booking.id)}
                              >
                                <Ban size={15} />
                                {ticketBusy ? '…' : 'Отменить'}
                              </button>
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {activeTab === 'applications' && (
              <>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '0.85rem', fontWeight: 700 }}>Мои заявки</h2>
                {vacancyApplications.length > 0 && (
                  <div style={{ marginBottom: '1.25rem' }}>
                    <h3 style={{ fontSize: '1.05rem', marginBottom: '0.5rem' }}>Мои отклики на вакансии</h3>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gap: 8 }}>
                      {vacancyApplications.map((va: any) => (
                        <li key={va.id} className="card-surface" style={{ padding: '0.75rem 1rem' }}>
                          <a href={`/vacancies/${va.vacancy?.id}`} style={{ fontWeight: 700 }}>
                            {va.vacancy?.title || 'Вакансия'}
                          </a>
                          <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                            {va.vacancy?.employer?.title} · {va.status}
                            {va.autoScore != null ? ` · скрининг ${va.autoScore}%` : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {(() => {
                  const statusBadge = (status: string) => {
                    const pending = status === 'PENDING';
                    const approved = status === 'APPROVED';
                    return (
                      <span
                        style={{
                          padding: '0.25rem 0.5rem',
                          borderRadius: '4px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          backgroundColor: pending ? '#fef3c7' : approved ? '#dcfce7' : '#fee2e2',
                          color: pending ? '#d97706' : approved ? '#166534' : '#991b1b',
                        }}
                      >
                        {pending ? 'На модерации' : approved ? 'Одобрено' : 'Отклонено'}
                      </span>
                    );
                  };

                  const rejectNote = (reason?: string | null) =>
                    reason ? (
                      <p
                        style={{
                          margin: '0.65rem 0 0',
                          padding: '0.55rem 0.7rem',
                          borderRadius: 8,
                          background: '#fef2f2',
                          border: '1px solid rgba(153,27,27,0.15)',
                          color: '#991b1b',
                          fontSize: '0.85rem',
                          lineHeight: 1.4,
                        }}
                      >
                        <span style={{ fontWeight: 700 }}>Причина: </span>
                        {reason}
                      </p>
                    ) : null;

                  const emptyBox = (text: string, href?: string, linkLabel?: string) => (
                    <div
                      style={{
                        padding: '1.25rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'rgba(0,0,0,0.02)',
                        textAlign: 'center',
                      }}
                    >
                      <p style={{ color: 'var(--muted)', fontSize: '0.95rem', margin: href ? '0 0 0.85rem' : 0 }}>
                        {text}
                      </p>
                      {href && linkLabel && (
                        <a href={href} className="btn btn-primary" style={{ display: 'inline-block' }}>
                          {linkLabel}
                        </a>
                      )}
                    </div>
                  );

                  const subTabs = [
                    {
                      id: 'projects' as const,
                      label: 'Проекты',
                      icon: FolderKanban,
                      count: projectApplications.length,
                    },
                    { id: 'clubs' as const, label: 'Клубы', icon: Users, count: clubApplications.length },
                    {
                      id: 'programs' as const,
                      label: 'Программы',
                      icon: HandHeart,
                      count: programApplications.length,
                    },
                    {
                      id: 'events' as const,
                      label: 'Афиша',
                      icon: CalendarDays,
                      count: participations.length,
                    },
                    { id: 'spaces' as const, label: 'Брони', icon: Building2, count: bookings.length },
                  ];

                  return (
                    <>
                      <div role="tablist" aria-label="Тип заявок" className="dashboard-apps-tabs">
                        {subTabs.map((tab) => {
                          const active = appsSubTab === tab.id;
                          const Icon = tab.icon;
                          const tip =
                            tab.id === 'spaces'
                              ? 'Бронирование пространств'
                              : tab.id === 'events'
                                ? 'Мероприятия афиши'
                                : tab.id === 'programs'
                                  ? 'Гранты, добро, самоуправление'
                                  : tab.label;
                          return (
                            <button
                              key={tab.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              aria-label={tip}
                              title={tip}
                              onClick={() => setAppsSubTab(tab.id)}
                              className={`dashboard-apps-tab is-icon-only${active ? ' is-active' : ''}`}
                            >
                              <span className="dashboard-apps-tab-icon">
                                <Icon size={18} aria-hidden />
                                {tab.count > 0 && (
                                  <span
                                    className="dashboard-apps-tab-count"
                                    style={{
                                      background: active ? 'var(--primary)' : 'rgba(15,23,42,0.08)',
                                      color: active ? '#fff' : '#475569',
                                    }}
                                  >
                                    {tab.count > 99 ? '99+' : tab.count}
                                  </span>
                                )}
                              </span>
                              <span className="dashboard-apps-tab-label">{tab.label}</span>
                            </button>
                          );
                        })}
                      </div>
                      <p className="dashboard-apps-tabs-hint" aria-live="polite">
                        {subTabs.find((t) => t.id === appsSubTab)?.label ?? 'Заявки'}
                      </p>

                      {appsSubTab === 'projects' &&
                        (projectApplications.length === 0
                          ? emptyBox('Пока нет заявок в проекты', '/projects', 'Смотреть проекты')
                          : (
                            <div className="dashboard-apps-grid">
                              {projectApplications.map((app) => (
                                <a
                                  key={app.id}
                                  href={`/projects/${encodeURIComponent(app.project.id)}`}
                                  style={{
                                    padding: '1.25rem',
                                    border: '1px solid rgba(0,0,0,0.08)',
                                    borderRadius: 'var(--radius-md)',
                                    backgroundColor: 'white',
                                    textDecoration: 'none',
                                    color: 'inherit',
                                  }}
                                >
                                  <h4 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>
                                    {app.project.title}
                                  </h4>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                                      {new Date(app.createdAt).toLocaleDateString()}
                                    </span>
                                    {statusBadge(app.status)}
                                  </div>
                                  {app.status === 'REJECTED' ? rejectNote(app.rejectReason) : null}
                                </a>
                              ))}
                            </div>
                          ))}

                      {appsSubTab === 'clubs' &&
                        (clubApplications.length === 0
                          ? emptyBox('Пока нет заявок в клубы', '/clubs', 'Смотреть клубы')
                          : (
                            <div className="dashboard-apps-grid">
                              {clubApplications.map((app) => (
                                <a
                                  key={app.id}
                                  href={`/clubs/${encodeURIComponent(app.club.id)}`}
                                  style={{
                                    padding: '1.25rem',
                                    border: '1px solid rgba(0,0,0,0.08)',
                                    borderRadius: 'var(--radius-md)',
                                    backgroundColor: 'white',
                                    textDecoration: 'none',
                                    color: 'inherit',
                                  }}
                                >
                                  <h4 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>
                                    {app.club.title}
                                  </h4>
                                  <div
                                    style={{
                                      display: 'flex',
                                      justifyContent: 'space-between',
                                      alignItems: 'center',
                                      gap: '0.5rem',
                                    }}
                                  >
                                    <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                                      {new Date(app.createdAt).toLocaleDateString()}
                                    </span>
                                    {statusBadge(app.status)}
                                  </div>
                                  {app.status === 'REJECTED' ? rejectNote(app.rejectReason) : null}
                                </a>
                              ))}
                            </div>
                          ))}

                      {appsSubTab === 'programs' &&
                        (programApplications.length === 0
                          ? emptyBox('Пока нет заявок в гранты, добро и самоуправление', '/grants', 'Смотреть гранты')
                          : (
                            <div className="dashboard-apps-grid">
                              {programApplications.map((app) => {
                                const kind = app.program?.kind;
                                const href =
                                  kind === 'DOBRO'
                                    ? `/dobro/${app.program.id}`
                                    : kind === 'SELF_GOV'
                                      ? `/self-gov/${app.program.id}`
                                      : `/grants/${app.program.id}`;
                                const kindLabel =
                                  kind === 'DOBRO'
                                    ? 'Добро'
                                    : kind === 'SELF_GOV'
                                      ? 'Самоуправление'
                                      : 'Грант';
                                return (
                                  <a
                                    key={app.id}
                                    href={href}
                                    style={{
                                      padding: '1.25rem',
                                      border: '1px solid rgba(0,0,0,0.08)',
                                      borderRadius: 'var(--radius-md)',
                                      backgroundColor: 'white',
                                      textDecoration: 'none',
                                      color: 'inherit',
                                    }}
                                  >
                                    <div style={{ fontSize: '0.75rem', color: 'var(--muted)', marginBottom: 4 }}>
                                      {kindLabel}
                                    </div>
                                    <h4 style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '0.5rem' }}>
                                      {app.program.title}
                                    </h4>
                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                      }}
                                    >
                                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                                        {new Date(app.createdAt).toLocaleDateString()}
                                      </span>
                                      {statusBadge(app.status)}
                                    </div>
                                    {app.status === 'REJECTED' ? rejectNote(app.rejectReason) : null}
                                  </a>
                                );
                              })}
                            </div>
                          ))}

                      {appsSubTab === 'events' &&
                        (participations.length === 0
                          ? emptyBox('Пока нет записей на мероприятия', '/events', 'Открыть афишу')
                          : (
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'flex-end',
                                  marginBottom: '0.85rem',
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => router.push('/tickets')}
                                  className="btn btn-secondary"
                                  style={{ fontSize: '0.85rem', padding: '0.4rem 0.75rem' }}
                                >
                                  Открыть билеты
                                </button>
                              </div>
                              <div className="dashboard-apps-grid">
                                {participations.map((part: any) => {
                                  const b = part.booking;
                                  const ended = b?.endTime && new Date(b.endTime).getTime() < Date.now();
                                  return (
                                    <div
                                      key={part.id}
                                      style={{
                                        padding: '1.25rem',
                                        border: '1px solid rgba(0,0,0,0.08)',
                                        borderRadius: 'var(--radius-md)',
                                        backgroundColor: 'white',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '0.85rem',
                                      }}
                                    >
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedTicket(part.ticketCode);
                                          router.push('/tickets');
                                        }}
                                        style={{
                                          display: 'flex',
                                          justifyContent: 'space-between',
                                          gap: '1rem',
                                          textAlign: 'left',
                                          cursor: 'pointer',
                                          border: 'none',
                                          background: 'transparent',
                                          padding: 0,
                                          font: 'inherit',
                                          color: 'inherit',
                                          width: '100%',
                                        }}
                                      >
                                        <div style={{ minWidth: 0 }}>
                                          <h4
                                            style={{
                                              fontWeight: 600,
                                              fontSize: '1rem',
                                              marginBottom: '0.25rem',
                                            }}
                                          >
                                            {b.title}
                                          </h4>
                                          <p
                                            style={{
                                              color: 'var(--primary)',
                                              fontSize: '0.85rem',
                                              marginBottom: '0.75rem',
                                              fontWeight: 500,
                                            }}
                                          >
                                            {b.space?.title || 'Без площадки'}
                                          </p>
                                          <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                                            {formatMskDate(b.startTime, { day: 'numeric', month: 'short' })}{' '}
                                            {formatMskTime(b.startTime)} (МСК)
                                          </span>
                                          <div
                                            style={{
                                              marginTop: 8,
                                              fontSize: '0.78rem',
                                              fontWeight: 600,
                                              color: 'var(--primary)',
                                              display: 'inline-flex',
                                              alignItems: 'center',
                                              gap: 4,
                                            }}
                                          >
                                            Открыть билет <ChevronRight size={14} />
                                          </div>
                                        </div>
                                        <div style={{ flexShrink: 0, textAlign: 'center' }}>
                                          <QRCodeDisplay value={part.ticketCode || ''} />
                                          <div
                                            style={{
                                              fontSize: '0.7rem',
                                              color: 'var(--muted)',
                                              marginTop: '0.25rem',
                                            }}
                                          >
                                            Билет
                                          </div>
                                        </div>
                                      </button>
                                      {!ended && (
                                        <button
                                          type="button"
                                          onClick={() => cancelParticipation(b.id)}
                                          disabled={ticketBusy}
                                          style={{
                                            alignSelf: 'flex-start',
                                            border: '1px solid rgba(185,28,28,0.25)',
                                            background: 'rgba(254,226,226,0.45)',
                                            color: '#b91c1c',
                                            borderRadius: 10,
                                            padding: '0.45rem 0.75rem',
                                            fontSize: '0.82rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                          }}
                                        >
                                          <Ban size={14} />
                                          Отменить запись
                                        </button>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          ))}

                      {appsSubTab === 'spaces' &&
                        (bookings.length === 0
                          ? emptyBox(
                              'Пока нет бронирований пространств',
                              '/spaces',
                              'Смотреть пространства'
                            )
                          : (
                            <div className="dashboard-apps-grid">
                              {bookings.map((booking) => {
                                const canCancel =
                                  booking.status !== 'REJECTED' &&
                                  booking.endTime &&
                                  new Date(booking.endTime).getTime() >= Date.now();
                                return (
                                  <div
                                    key={booking.id}
                                    style={{
                                      padding: '1.25rem',
                                      border: '1px solid rgba(0,0,0,0.08)',
                                      borderRadius: 'var(--radius-md)',
                                      backgroundColor: 'white',
                                    }}
                                  >
                                    <h4
                                      style={{
                                        fontWeight: 600,
                                        fontSize: '1rem',
                                        marginBottom: '0.25rem',
                                      }}
                                    >
                                      {booking.title}
                                    </h4>
                                    <p
                                      style={{
                                        color: 'var(--primary)',
                                        fontSize: '0.85rem',
                                        marginBottom: '0.75rem',
                                        fontWeight: 500,
                                      }}
                                    >
                                      {booking.space?.title}
                                    </p>
                                    <div
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '0.5rem',
                                        flexWrap: 'wrap',
                                      }}
                                    >
                                      <span style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
                                        {formatMskDate(booking.startTime, { day: 'numeric', month: 'short' })}{' '}
                                        {formatMskTime(booking.startTime)} (МСК)
                                      </span>
                                      {statusBadge(booking.status)}
                                    </div>
                                    {booking.status === 'REJECTED' ? rejectNote(booking.rejectReason) : null}
                                    {booking.description ? (
                                      <p
                                        style={{
                                          margin: '0.65rem 0 0',
                                          fontSize: '0.82rem',
                                          color: '#64748b',
                                          lineHeight: 1.4,
                                          display: '-webkit-box',
                                          WebkitLineClamp: 2,
                                          WebkitBoxOrient: 'vertical',
                                          overflow: 'hidden',
                                        }}
                                      >
                                        {booking.description}
                                      </p>
                                    ) : (
                                      <p style={{ margin: '0.65rem 0 0', fontSize: '0.78rem', color: '#b45309' }}>
                                        Добавьте анонс — в афише пока только название
                                      </p>
                                    )}
                                    {canCancel && (
                                      <>
                                        <EditBookingDetails
                                          booking={booking}
                                          onSaved={(next) => {
                                            setBookings((prev) =>
                                              prev.map((b) => (b.id === next.id ? { ...b, ...next } : b))
                                            );
                                          }}
                                        />
                                        <button
                                          type="button"
                                          onClick={() => cancelSpaceBooking(booking.id)}
                                          disabled={bookingBusyId === booking.id}
                                          style={{
                                            marginTop: 8,
                                            border: '1px solid rgba(185,28,28,0.25)',
                                            background: 'rgba(254,226,226,0.45)',
                                            color: '#b91c1c',
                                            borderRadius: 10,
                                            padding: '0.45rem 0.75rem',
                                            fontSize: '0.82rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: 6,
                                          }}
                                        >
                                          <Ban size={14} />
                                          {bookingBusyId === booking.id ? 'Отмена…' : 'Отменить бронь'}
                                        </button>
                                      </>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ))}
                    </>
                  );
                })()}
              </>
            )}

            {activeTab === 'achievements' && (
              <div style={{ maxWidth: 720 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline', marginBottom: '0.75rem' }}>
                  <h2 style={{ fontSize: '1.25rem', margin: 0, fontWeight: 800 }}>Достижения</h2>
                  <button
                    type="button"
                    onClick={() => goTab('profile', 'edit')}
                    style={{ border: 0, background: 'transparent', color: 'var(--muted)', fontSize: '0.78rem', fontWeight: 650, cursor: 'pointer' }}
                  >
                    Профиль →
                  </button>
                </div>
                <AchievementsPanel
                  onProgress={(p) => {
                    if (p.complete || p.legend) setAchievementLegend(true);
                  }}
                />
              </div>
            )}

            {activeTab === 'portfolio' && (
              <div style={{ maxWidth: 720 }}>
                <h2 style={{ fontSize: '1.35rem', marginBottom: '0.35rem', fontWeight: 800 }}>Портфолио</h2>
                <p style={{ color: 'var(--muted)', marginBottom: '1rem', fontSize: '0.9rem' }}>
                  Соберите витрину опыта, грамот и достижений — после проверки модератором можно скачать с подписью портала.
                </p>
                <PortfolioEditor />
              </div>
            )}

            {activeTab === 'profile' && (
              <div style={{ maxWidth: '40rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <h2 className="profile-view__title">Мой профиль</h2>

                <div className="dashboard-seg" role="tablist" aria-label="Профиль">
                  {(
                    [
                      { id: 'overview' as const, label: 'Обзор' },
                      { id: 'edit' as const, label: 'Редактировать' },
                    ] as const
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={profileSection === s.id}
                      onClick={() => goProfileSection(s.id)}
                      className={`dashboard-seg-btn${profileSection === s.id ? ' is-active' : ''}`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>

                {profileSection === 'overview' && (
                  <div className="profile-view">
                    <ProfileHeroCard
                      name={session.user?.name}
                      nickname={profile?.nickname}
                      image={avatarPreview || profile?.image || session.user?.image || null}
                      publicCode={profile?.publicCode}
                      bio={profile?.bio}
                      legend={achievementLegend}
                      showcaseStored={profile?.showcaseBadges}
                      instructionsVersion={profile?.instructionsVersion}
                      instructionsCompletedAt={profile?.instructionsCompletedAt}
                      authority={profile?.reliabilityScore ?? 100}
                      social={profile?.socialScore ?? 50}
                      ecoPoints={profile?.ecoPoints ?? 0}
                      onEditBio={() => goProfileSection('edit')}
                      onShowcaseSaved={(codes) =>
                        setProfile((prev) => (prev ? { ...prev, showcaseBadges: codes } : prev))
                      }
                      onStatClick={(key) => openRepModal(key)}
                    />

                    <section className="profile-section profile-section--soft" aria-label="Активность">
                      <div className="profile-meta-row">
                        <span>
                          Пришёл: <strong>{profile?.attendedCount ?? 0}</strong>
                        </span>
                        <span>
                          Пропусков: <strong>{profile?.noShowCount ?? 0}</strong>
                        </span>
                        <span>
                          Профиль:{' '}
                          <strong>
                            {profileVisibility === 'PRIVATE'
                              ? 'закрытый'
                              : profileVisibility === 'FRIENDS'
                                ? 'для друзей'
                                : 'открытый'}
                          </strong>{' '}
                          <button type="button" onClick={() => goProfileSection('edit')}>
                            настроить
                          </button>
                        </span>
                      </div>
                    </section>

                    {(profileHobbies.length > 0 || profileInterests.length > 0 || profile?.city) && (
                      <section className="profile-section" aria-label="О себе">
                        <h3 className="profile-section__title">О себе</h3>
                        <div className="profile-about">
                          {profile?.city && (
                            <div>
                              <strong>Город:</strong> {profile.city}
                            </div>
                          )}
                          {profileHobbies.length > 0 && (
                            <div>
                              <strong>Увлечения:</strong> {profileHobbies.slice(0, 8).join(', ')}
                            </div>
                          )}
                          {profileInterests.length > 0 && (
                            <div>
                              <strong>Интересы:</strong> {profileInterests.slice(0, 8).join(', ')}
                            </div>
                          )}
                        </div>
                      </section>
                    )}

                    <section className="profile-section" aria-label="Рефералы">
                      <ReferralPanel />
                    </section>

                    <section id="eco-shop" className="profile-section collectibles-panel" aria-label="Эко-баллы">
                      <h3 className="profile-section__title">Эко-баллы и награды</h3>
                      <EcoPointsPanel
                        compact
                        onBalanceChange={(ecoPoints) =>
                          setProfile((prev) => (prev ? { ...prev, ecoPoints } : prev))
                        }
                      />
                      <details className="collectibles-fold">
                        <summary>Коллекции и паки</summary>
                        <div className="collectibles-fold__body">
                          <CollectiblesPanel
                            onBalanceChange={(ecoPoints) =>
                              setProfile((prev) => (prev ? { ...prev, ecoPoints } : prev))
                            }
                          />
                        </div>
                      </details>
                    </section>

                    <section id="guides" className="profile-section" aria-label="Инструктажи">
                      <h3 className="profile-section__title">Инструктажи</h3>
                      <ProfileGuides
                        instructionsVersion={profile?.instructionsVersion}
                        instructionsCompletedAt={profile?.instructionsCompletedAt}
                        onInstructionsSync={(state) => {
                          setProfile((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  instructionsVersion: state.completed ? state.version : null,
                                  instructionsCompletedAt: state.completedAt ?? null,
                                }
                              : prev
                          );
                          if (state.completed) {
                            setModernUserBadge(true);
                            fetch('/api/user/achievements')
                              .then((r) => r.json())
                              .then((data) => {
                                if (data?.progress?.complete || data?.legend) setAchievementLegend(true);
                              })
                              .catch(() => undefined);
                          }
                        }}
                      />
                    </section>

                    <div className="profile-actions">
                      <button type="button" className="btn btn-secondary" onClick={() => goProfileSection('edit')}>
                        Редактировать
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => goTab('achievements')}>
                        К ачивкам
                      </button>
                    </div>

                    <details className="profile-details">
                      <summary>Игры и рекорды</summary>
                      <div className="profile-details__body">
                        <ProfileGameScores />
                      </div>
                    </details>

                    <details className="profile-details">
                      <summary>Согласия и документы</summary>
                      <div className="profile-details__body">
                        <div className="profile-consent-list">
                          {[
                            {
                              key: 'privacy-first',
                              label: 'Первое согласие с политикой',
                              href: '/privacy',
                              at: profile?.privacyFirstAcceptedAt || profile?.privacyAcceptedAt,
                              version: undefined as string | null | undefined,
                              signature: undefined as string | null | undefined,
                            },
                            {
                              key: 'privacy',
                              label: 'Политика конфиденциальности',
                              href: '/privacy',
                              at: profile?.privacyAcceptedAt,
                              version: profile?.privacyPolicyVersion,
                              signature: profile?.privacySignature,
                            },
                            {
                              key: 'rules',
                              label: 'Правила сайта',
                              href: '/rules',
                              at: profile?.rulesAcceptedAt || profile?.privacyAcceptedAt,
                              version: profile?.rulesPolicyVersion,
                              signature: profile?.rulesSignature,
                            },
                            {
                              key: 'cookies',
                              label: 'Cookie и уведомления',
                              href: '/privacy',
                              at: profile?.cookiesAcceptedAt,
                              version: profile?.cookiesPolicyVersion,
                              signature: profile?.cookiesSignature,
                            },
                          ].map((row) => (
                            <div key={row.key} className={`profile-consent${row.at ? ' is-ok' : ''}`}>
                              <BadgeCheck
                                size={15}
                                style={{ marginTop: 2, color: row.at ? '#15803d' : '#94a3b8', flexShrink: 0 }}
                              />
                              <div style={{ minWidth: 0 }}>
                                <a href={row.href}>{row.label}</a>
                                <div className="profile-consent__meta">
                                  {row.at
                                    ? `Принято ${new Date(row.at).toLocaleString('ru-RU', {
                                        timeZone: 'Europe/Moscow',
                                        day: 'numeric',
                                        month: 'short',
                                        year: 'numeric',
                                        hour: '2-digit',
                                        minute: '2-digit',
                                      })} (МСК)${row.version ? ` · v${row.version}` : ''}`
                                    : 'Ещё не зафиксировано'}
                                </div>
                                {row.signature && (
                                  <div className="profile-consent__sig" title={row.signature}>
                                    Подпись: {row.signature.slice(0, 28)}…
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </details>

                    <details className="profile-details">
                      <summary>Безопасность и удаление аккаунта</summary>
                      <div className="profile-details__body">
                        {profile?.deletionRequestedAt && (
                          <div
                            style={{
                              padding: '0.85rem 1rem',
                              borderRadius: 12,
                              background: 'rgba(254,226,226,0.8)',
                              border: '1px solid rgba(220,38,38,0.25)',
                            }}
                          >
                            <div style={{ fontWeight: 750, color: '#991b1b', marginBottom: 4 }}>
                              Удаление аккаунта запланировано
                            </div>
                            <p style={{ margin: 0, fontSize: '0.85rem', color: '#7f1d1d', lineHeight: 1.45 }}>
                              До{' '}
                              {profile.deletionEffectiveAt
                                ? new Date(profile.deletionEffectiveAt).toLocaleString('ru-RU', {
                                    timeZone: 'Europe/Moscow',
                                  })
                                : 'указанной даты'}{' '}
                              (МСК) можно отменить ниже.
                            </p>
                          </div>
                        )}
                        <SessionSecurityPanel />
                        <RecoveryPhrasePanel />
                        <AccountDeletionPanel />
                      </div>
                    </details>
                  </div>
                )}

                {profileSection === 'edit' && (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const formData = new FormData(e.target as HTMLFormElement);
                    const data: Record<string, unknown> = Object.fromEntries(formData);
                    data.hobbies = profileHobbies;
                    data.interests = profileInterests;
                    data.birthDate = profileBirthDate || null;
                    data.gender = profileGender || null;
                    data.profileVisibility = profileVisibility;
                    data.onlineVisibility = onlineVisibility;

                    if (avatarFile) {
                      const fileFormData = new FormData();
                      fileFormData.append('file', avatarFile);
                      try {
                        const uploadRes = await fetch('/api/user/upload', {
                          method: 'POST',
                          body: fileFormData,
                        });
                        const uploadData = await uploadRes.json().catch(() => ({}));
                        if (uploadRes.status === 413) {
                          throw new Error('Фото слишком большое для сервера (лимит ~15–25 МБ)');
                        }
                        if (!uploadRes.ok) {
                          throw new Error(uploadData.message || 'Не удалось загрузить фото');
                        }
                        if (uploadData.url) data.image = uploadData.url;
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : 'Ошибка загрузки фото');
                        setProfileSaving(false);
                        return;
                      }
                    }

                    setProfileSaving(true);
                    try {
                      data.fingerprint = await collectDeviceFingerprint();
                      const res = await fetch('/api/user/profile', {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(data),
                      });
                      const json = await res.json();
                      if (res.ok) {
                        toast.success(json.message || 'Профиль успешно сохранен!');
                        const saved = json.user || {};
                        setProfile((prev) => ({ ...prev, ...saved }));
                        setProfileHobbies(Array.isArray(saved.hobbies) ? saved.hobbies : profileHobbies);
                        setProfileInterests(Array.isArray(saved.interests) ? saved.interests : profileInterests);
                        if (saved.birthDate) setProfileBirthDate(String(saved.birthDate).slice(0, 10));
                        setProfileGender(
                          saved.gender === 'MALE' || saved.gender === 'FEMALE' ? saved.gender : ''
                        );
                        if (saved.profileVisibility === 'FRIENDS' || saved.profileVisibility === 'PRIVATE') {
                          setProfileVisibility(saved.profileVisibility);
                        } else if (saved.profileVisibility) {
                          setProfileVisibility('PUBLIC');
                        }
                        if (
                          saved.onlineVisibility === 'PUBLIC' ||
                          saved.onlineVisibility === 'HIDDEN' ||
                          saved.onlineVisibility === 'FRIENDS'
                        ) {
                          setOnlineVisibility(saved.onlineVisibility);
                        }
                        setAvatarFile(null);
                        setAvatarName('');
                        if (saved.image) setAvatarPreview(saved.image);
                        await update({
                          name: saved.name || data.name,
                          email: saved.email || data.email,
                          phone: saved.phone || data.phone || '',
                          image: saved.image || data.image || session.user?.image,
                          ...(typeof json.keepAlive === 'string' && json.keepAlive
                            ? { keepAlive: json.keepAlive }
                            : {}),
                        });
                        fetch('/api/user/achievements')
                          .then((r) => r.json())
                          .then((d) => {
                            if (d?.progress?.complete || d?.legend) setAchievementLegend(true);
                          })
                          .catch(() => undefined);
                        router.refresh();
                      } else {
                        toast.error(json.message || 'Ошибка при сохранении');
                      }
                    } catch {
                      toast.error('Ошибка сети при сохранении профиля');
                    } finally {
                      setProfileSaving(false);
                    }
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
                >
                  <div>
                    <span
                      style={{
                        display: 'block',
                        marginBottom: '0.5rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Аватар
                    </span>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '1rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <div
                        style={{
                          width: '72px',
                          height: '72px',
                          borderRadius: '50%',
                          overflow: 'hidden',
                          background: 'linear-gradient(135deg, var(--primary), #60a5fa)',
                          color: 'white',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '1.5rem',
                          fontWeight: 700,
                          flexShrink: 0,
                          border: '2px solid rgba(37,99,235,0.15)',
                        }}
                      >
                        {(avatarPreview || profile?.image || session.user?.image) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={avatarPreview || profile?.image || session.user?.image || ''}
                            alt=""
                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                          />
                        ) : (
                          session.user?.name?.charAt(0) || <User size={28} />
                        )}
                      </div>
                      <div style={{ flex: 1, minWidth: '180px' }}>
                        <label
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.45rem',
                            padding: '0.65rem 1rem',
                            borderRadius: '999px',
                            border: '1px solid rgba(37,99,235,0.25)',
                            background: 'rgba(37,99,235,0.06)',
                            color: 'var(--primary)',
                            fontWeight: 600,
                            fontSize: '0.9rem',
                            cursor: 'pointer',
                          }}
                        >
                          <ImagePlus size={16} />
                          Выбрать фото
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/webp,image/gif"
                            style={{ display: 'none' }}
                            onChange={(e) => {
                              const file = e.target.files?.[0] || null;
                              setAvatarFile(file);
                              if (file) {
                                setAvatarPreview(URL.createObjectURL(file));
                                setAvatarName(file.name);
                              } else {
                                setAvatarPreview(null);
                                setAvatarName('');
                              }
                            }}
                          />
                        </label>
                        <p
                          style={{
                            margin: '0.45rem 0 0',
                            fontSize: '0.8rem',
                            color: 'var(--muted)',
                            wordBreak: 'break-all',
                          }}
                        >
                          {avatarName
                            ? avatarName
                            : 'PNG, JPG, WEBP или GIF — до 5 МБ'}
                        </p>
                        {avatarFile && (
                          <button
                            type="button"
                            onClick={() => {
                              setAvatarFile(null);
                              setAvatarPreview(null);
                              setAvatarName('');
                            }}
                            style={{
                              marginTop: '0.35rem',
                              background: 'none',
                              border: 'none',
                              color: '#ef4444',
                              fontSize: '0.8rem',
                              cursor: 'pointer',
                              padding: 0,
                              fontWeight: 500,
                            }}
                          >
                            Убрать выбранный файл
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                  <PersonalGalleryEditor />
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Имя
                    </label>
                    <input
                      name="name"
                      type="text"
                      key={`name-${profile?.name || session.user?.name || ''}`}
                      defaultValue={profile?.name || session.user?.name || ''}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Никнейм (публичный)
                    </label>
                    <input
                      name="nickname"
                      type="text"
                      key={`nickname-${profile?.nickname || ''}`}
                      defaultValue={profile?.nickname || ''}
                      placeholder="например sochi_leader"
                      maxLength={24}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                    <p style={{ margin: '0.35rem 0 0', fontSize: '0.78rem', color: 'var(--muted)' }}>
                      2–24 символа. Показывается вместо имени в профиле. ID:{' '}
                      <strong style={{ fontFamily: 'ui-monospace, monospace' }}>
                        {profile?.publicCode || '…'}
                      </strong>
                    </p>
                  </div>
                  <div
                    style={{
                      padding: '0.9rem 1rem',
                      borderRadius: 12,
                      border: '1px solid rgba(15,23,42,0.08)',
                      background: 'rgba(15,23,42,0.02)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Соцсети и Steam (по желанию)</div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Steam
                      </label>
                      <input
                        name="steamUrl"
                        type="url"
                        key={`steam-${profile?.steamUrl || ''}`}
                        defaultValue={profile?.steamUrl || ''}
                        placeholder="https://steamcommunity.com/id/…"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        ВКонтакте
                      </label>
                      <input
                        name="vkUrl"
                        type="text"
                        key={`vk-${profile?.vkUrl || ''}`}
                        defaultValue={profile?.vkUrl || ''}
                        placeholder="https://vk.ru/… или id123"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Telegram
                      </label>
                      <input
                        name="telegramUrl"
                        type="text"
                        key={`tg-${profile?.telegramUrl || ''}`}
                        defaultValue={profile?.telegramUrl || ''}
                        placeholder="@username или https://t.me/…"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        Telegram chat ID (для уведомлений)
                      </label>
                      <input
                        name="telegramChatId"
                        type="text"
                        inputMode="numeric"
                        key={`tgid-${profile?.telegramChatId || ''}`}
                        defaultValue={profile?.telegramChatId || ''}
                        placeholder="напр. 123456789 — узнать у бота командой /start"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        MAX ID (для уведомлений)
                      </label>
                      <input
                        name="maxUserId"
                        type="text"
                        inputMode="numeric"
                        key={`maxid-${profile?.maxUserId || ''}`}
                        defaultValue={profile?.maxUserId || ''}
                        placeholder="напр. 13771314 — узнать у бота /start"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', marginBottom: 4, fontSize: '0.8rem', color: 'var(--muted)' }}>
                        MAX
                      </label>
                      <input
                        name="maxUrl"
                        type="url"
                        key={`max-${profile?.maxUrl || ''}`}
                        defaultValue={profile?.maxUrl || ''}
                        placeholder="https://max.ru/…"
                        style={{
                          width: '100%',
                          padding: '0.65rem 0.75rem',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid rgba(0,0,0,0.1)',
                          outline: 'none',
                        }}
                      />
                    </div>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Email
                    </label>
                    <input
                      name="email"
                      type="email"
                      key={`email-${profile?.email || session.user?.email || ''}`}
                      defaultValue={profile?.email || session.user?.email || ''}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Телефон
                    </label>
                    <input
                      name="phone"
                      type="tel"
                      key={`phone-${profile?.phone || session.user?.phone || ''}`}
                      defaultValue={profile?.phone || session.user?.phone || ''}
                      placeholder="+7 (900) 000-00-00"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Город
                    </label>
                    <input
                      name="city"
                      type="text"
                      key={`city-${profile?.city || ''}`}
                      defaultValue={profile?.city || 'Сочи'}
                      placeholder="Сочи"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Дата рождения
                    </label>
                    <input
                      type="date"
                      value={profileBirthDate}
                      onChange={(e) => setProfileBirthDate(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                    {(profileBirthDate || profile?.zodiac) && (
                      <p style={{ margin: '0.4rem 0 0', fontSize: '0.85rem', color: 'var(--primary)', fontWeight: 600 }}>
                        Знак зодиака:{' '}
                        {zodiacFromDate(profileBirthDate) || profile?.zodiac || '—'}
                      </p>
                    )}
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Пол
                    </label>
                    <select
                      value={profileGender}
                      onChange={(e) =>
                        setProfileGender(
                          e.target.value === 'MALE' || e.target.value === 'FEMALE'
                            ? e.target.value
                            : ''
                        )
                      }
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                        background: '#fff',
                      }}
                    >
                      <option value="">Не указан</option>
                      <option value="FEMALE">Женский</option>
                      <option value="MALE">Мужской</option>
                    </select>
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Коротко о себе / вайб
                    </label>
                    <input
                      name="bio"
                      type="text"
                      key={`bio-${profile?.bio || ''}`}
                      defaultValue={profile?.bio || ''}
                      maxLength={280}
                      placeholder="Например: на вайбе после квиза 🎧"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      О себе подробнее
                    </label>
                    <textarea
                      name="about"
                      key={`about-${profile?.about || ''}`}
                      defaultValue={profile?.about || ''}
                      rows={4}
                      placeholder="Чем занимаешься, чего хочешь на портале…"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                        resize: 'vertical',
                        fontFamily: 'inherit',
                      }}
                    />
                  </div>
                  <TagPicker
                    label="Увлечения / хобби"
                    kind="hobbies"
                    value={profileHobbies}
                    onChange={setProfileHobbies}
                    hint="Выберите готовые или добавьте свои — популярные варианты подтягиваются из других профилей"
                  />
                  <TagPicker
                    label="Интересы"
                    kind="interests"
                    value={profileInterests}
                    onChange={setProfileInterests}
                    hint="Темы, в которых хотите развиваться"
                  />
                  <div className="profile-section" style={{ padding: '0.7rem 0.85rem' }}>
                    <div className="profile-section__title" style={{ marginBottom: 6 }}>Конфиденциальность</div>
                    <p style={{ margin: '0 0 0.75rem', fontSize: '0.82rem', color: 'var(--muted)', lineHeight: 1.45 }}>
                      Открытый — в поиске друзей. «Только друзья» и «Закрытый» скрывают настоящие имя и
                      аватар: другим показывается сказочный псевдоним и сказочная аватарка. Закрытый — не в
                      поиске, друзья по ссылке.
                    </p>
                    {(() => {
                      const aliasUserId = profile?.id || session?.user?.id;
                      if (
                        (profileVisibility !== 'FRIENDS' && profileVisibility !== 'PRIVATE') ||
                        !aliasUserId
                      ) {
                        return null;
                      }
                      const aliasName = fairyTaleDisplayName(aliasUserId);
                      return (
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            marginBottom: 12,
                            padding: '0.7rem 0.8rem',
                            borderRadius: 12,
                            background: 'linear-gradient(135deg, rgba(15,118,110,0.08), rgba(56,189,248,0.1))',
                            border: '1px solid rgba(15,118,110,0.18)',
                          }}
                        >
                          <UserAvatar
                            name={aliasName}
                            image={fairyTaleAvatarUrl(aliasUserId)}
                            size={48}
                            aliased
                          />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontSize: '0.72rem', color: '#0f766e', fontWeight: 700 }}>
                              Так вас видят другие
                            </div>
                            <div
                              style={{
                                fontWeight: 800,
                                fontSize: '0.95rem',
                                color: 'var(--foreground)',
                                overflowWrap: 'anywhere',
                              }}
                            >
                              {aliasName}
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="profile-choice-grid">
                      {(
                        [
                          { id: 'PUBLIC' as const, title: 'Открытый', desc: 'Виден всем, есть в поиске' },
                      { id: 'FRIENDS' as const, title: 'Только друзья', desc: 'Псевдоним для чужих, детали — друзьям' },
                      { id: 'PRIVATE' as const, title: 'Закрытый', desc: 'Скрыт из поиска, друзья по ссылке, псевдоним' },
                        ] as const
                      ).map((opt) => (
                        <label
                          key={opt.id}
                          className={`profile-choice${profileVisibility === opt.id ? ' is-on' : ''}`}
                        >
                          <input
                            type="radio"
                            name="profileVisibility"
                            checked={profileVisibility === opt.id}
                            onChange={() => setProfileVisibility(opt.id)}
                          />
                          <span>
                            <strong>{opt.title}</strong>
                            <span>{opt.desc}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                    {profileVisibility === 'PRIVATE' && (
                      <div style={{ marginTop: 12 }}>
                        <div style={{ fontSize: '0.8rem', color: 'var(--muted)', marginBottom: 6 }}>
                          Ссылка-приглашение в друзья
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <input
                            readOnly
                            value={
                              profile?.friendInviteToken
                                ? `${typeof window !== 'undefined' ? window.location.origin : ''}/api/invite/${profile.friendInviteToken}`
                                : 'Сохранится при сохранении профиля'
                            }
                            style={{
                              flex: '1 1 200px',
                              minWidth: 0,
                              padding: '0.55rem 0.7rem',
                              borderRadius: 10,
                              border: '1px solid rgba(15,23,42,0.1)',
                              background: '#fff',
                              fontSize: '0.78rem',
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={!profile?.friendInviteToken}
                            onClick={async () => {
                              if (!profile?.friendInviteToken) return;
                              const url = `${window.location.origin}/api/invite/${profile.friendInviteToken}`;
                              try {
                                await navigator.clipboard.writeText(url);
                                toast.success('Ссылка скопирована');
                              } catch {
                                toast.error('Не удалось скопировать');
                              }
                            }}
                          >
                            Копировать
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            disabled={inviteBusy}
                            onClick={async () => {
                              setInviteBusy(true);
                              try {
                                const res = await fetch('/api/user/profile', {
                                  method: 'PUT',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    profileVisibility: 'PRIVATE',
                                    regenerateInviteToken: true,
                                  }),
                                });
                                const json = await res.json();
                                if (!res.ok) throw new Error(json.message || 'Ошибка');
                                setProfile((prev) => ({ ...prev, ...json.user }));
                                setProfileVisibility('PRIVATE');
                                toast.success('Новая ссылка создана');
                              } catch (error) {
                                toast.error(error instanceof Error ? error.message : 'Ошибка');
                              } finally {
                                setInviteBusy(false);
                              }
                            }}
                          >
                            {inviteBusy ? '…' : 'Обновить ссылку'}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="profile-section" style={{ padding: '0.7rem 0.85rem' }}>
                    <div className="profile-section__title" style={{ marginBottom: 6 }}>Статус «в сети»</div>
                    <p style={{ margin: '0 0 0.5rem', fontSize: '0.78rem', color: 'var(--muted)', lineHeight: 1.4 }}>
                      Кому виден индикатор онлайна.
                    </p>
                    <div className="profile-choice-grid">
                      {(
                        [
                          { id: 'FRIENDS' as const, title: 'Только друзья', desc: 'По умолчанию — безопасно' },
                          { id: 'PUBLIC' as const, title: 'Всем', desc: 'Видят авторизованные пользователи' },
                          { id: 'HIDDEN' as const, title: 'Скрыт', desc: 'Статус никому не показывается' },
                        ] as const
                      ).map((opt) => (
                        <label
                          key={opt.id}
                          className={`profile-choice${onlineVisibility === opt.id ? ' is-on-green' : ''}`}
                        >
                          <input
                            type="radio"
                            name="onlineVisibility"
                            checked={onlineVisibility === opt.id}
                            onChange={() => setOnlineVisibility(opt.id)}
                          />
                          <span>
                            <strong>{opt.title}</strong>
                            <span>{opt.desc}</span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Текущий пароль
                    </label>
                    <input
                      name="currentPassword"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Нужен при смене пароля"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        marginBottom: '0.25rem',
                        fontWeight: 500,
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                      }}
                    >
                      Новый пароль
                    </label>
                    <input
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      placeholder="••••••••"
                      style={{
                        width: '100%',
                        padding: '0.75rem',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        outline: 'none',
                      }}
                    />
                  </div>

                  <div className="profile-edit-sticky">
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => goProfileSection('overview')}
                    >
                      К обзору
                    </button>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      disabled={profileSaving}
                      style={{ minWidth: '9rem' }}
                    >
                      {profileSaving ? 'Сохранение…' : 'Сохранить'}
                    </button>
                  </div>
                </form>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
      <ReputationHistoryModal
        open={repModalOpen}
        initialTab={repModalTab}
        onClose={() => setRepModalOpen(false)}
        onEcoChange={(ecoPoints) =>
          setProfile((prev) => (prev ? { ...prev, ecoPoints } : prev))
        }
        onOpenShop={() => {
          goTab('profile', 'overview');
          setTimeout(() => {
            document.getElementById('eco-shop')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }, 80);
        }}
      />
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Загрузка...</div>}>
      <DashboardInner />
    </Suspense>
  );
}
