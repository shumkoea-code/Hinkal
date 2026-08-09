'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import {
  FormEvent,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import {
  Archive,
  Bell,
  BellOff,
  ArrowLeft,
  CalendarPlus,
  FolderKanban,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Pin,
  Search,
  Send,
  Ticket,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import UserAvatar from '@/components/UserAvatar';
import MutualOverlapChips from '@/components/MutualOverlapChips';
import type { MutualOverlap } from '@/lib/social';
import {
  formatEventWhen,
  parseMessageMeta,
  previewForMessage,
  type EntityInviteMeta,
  type EventInviteMeta,
  type PlaceInviteMeta,
} from '@/lib/message-meta';
import './messages.css';

type Tab = 'personal' | 'clubs' | 'projects' | 'invites';
type UserPreview = { id: string; name: string | null; image: string | null; publicCode?: string | null };
type Presence = { online: boolean; label: string } | null;
type AchChip = { code: string; title: string; accent: string; tierLabel: string };

type Message = {
  id: string;
  senderId: string;
  senderName?: string;
  body: string;
  kind?: string;
  metaJson?: string | null;
  meta?: EventInviteMeta | PlaceInviteMeta | EntityInviteMeta | Record<string, unknown> | null;
  flagged?: boolean;
  readAt: string | null;
  createdAt: string;
};

type DmConversation = {
  id: string;
  kind?: 'DM';
  user: UserPreview;
  lastMessage: (Message & { preview?: string }) | null;
  unreadCount: number;
  updatedAt: string;
  presence?: Presence;
  pinned?: boolean;
  archived?: boolean;
  muted?: boolean;
};

type GroupConversation = {
  id: string | null;
  kind: 'CLUB' | 'PROJECT';
  entityId: string;
  title: string;
  image?: string | null;
  href: string;
  lastMessage: (Message & { preview?: string }) | null;
  unreadCount: number;
  updatedAt: string;
  pinned?: boolean;
  archived?: boolean;
  muted?: boolean;
  needsBootstrap?: boolean;
};

type InviteRow = {
  type: 'ENTITY_INVITE' | 'EVENT_INVITE' | 'PLACE_INVITE';
  id: string;
  inviteId: string;
  title: string;
  subtitle: string;
  note?: string | null;
  href: string;
  createdAt: string;
  from: UserPreview;
  entityKind?: string;
  entityId?: string;
  bookingId?: string;
};

type InvitableEvent = { id: string; title: string; startTime: string; endTime: string; spaceTitle: string | null };
type MembershipItem = { kind: 'PROJECT' | 'CLUB'; entityId: string; title: string };

function Avatar({ user, size = 42, presence }: { user: UserPreview; size?: number; presence?: Presence }) {
  return (
    <UserAvatar
      name={user.name}
      image={user.image}
      size={size}
      online={presence?.online ?? null}
      showStatus={presence != null}
    />
  );
}

function dayKey(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', timeZone: 'Europe/Moscow' });
}
function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Moscow' });
}
function groupClass(messages: Message[], index: number) {
  const cur = messages[index];
  const prev = messages[index - 1];
  const next = messages[index + 1];
  const samePrev = prev && prev.senderId === cur.senderId && Math.abs(new Date(cur.createdAt).getTime() - new Date(prev.createdAt).getTime()) < 5 * 60 * 1000;
  const sameNext = next && next.senderId === cur.senderId && Math.abs(new Date(next.createdAt).getTime() - new Date(cur.createdAt).getTime()) < 5 * 60 * 1000;
  if (samePrev && sameNext) return 'is-group-mid';
  if (samePrev) return 'is-group-end';
  if (sameNext) return 'is-group-start';
  return '';
}

const TABS: { id: Tab; label: string }[] = [
  { id: 'personal', label: 'Личные' },
  { id: 'clubs', label: 'Клубы' },
  { id: 'projects', label: 'Проекты' },
  { id: 'invites', label: 'Приглашения' },
];

function MessagesInner() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const withId = searchParams.get('with');
  const tabParam = (searchParams.get('tab') || 'personal') as Tab;
  const cParam = searchParams.get('c');
  const showArchived = searchParams.get('archived') === '1';

  const tab: Tab = ['personal', 'clubs', 'projects', 'invites'].includes(tabParam) ? tabParam : 'personal';

  const [dmList, setDmList] = useState<DmConversation[]>([]);
  const [groupList, setGroupList] = useState<GroupConversation[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeUser, setActiveUser] = useState<UserPreview | null>(null);
  const [activeGroup, setActiveGroup] = useState<{ kind: 'CLUB' | 'PROJECT'; entityId: string; title: string; href: string } | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [overlap, setOverlap] = useState<MutualOverlap | null>(null);
  const [presence, setPresence] = useState<Presence>(null);
  const [friendAchs, setFriendAchs] = useState<AchChip[]>([]);
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [threadLoading, setThreadLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerMode, setPickerMode] = useState<'event' | 'entity'>('event');
  const [invitable, setInvitable] = useState<InvitableEvent[]>([]);
  const [memberships, setMemberships] = useState<MembershipItem[]>([]);
  const [invitableLoading, setInvitableLoading] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [threadPinned, setThreadPinned] = useState(false);
  const [threadArchived, setThreadArchived] = useState(false);
  const [threadMuted, setThreadMuted] = useState(false);
  const [inboxQuery, setInboxQuery] = useState('');
  const [ctxMenu, setCtxMenu] = useState<null | {
    conversationId: string;
    pinned: boolean;
    archived: boolean;
    muted: boolean;
    x: number;
    y: number;
  }>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const inThread = Boolean(activeUser || activeGroup);

  const setQuery = useCallback(
    (patch: Record<string, string | null>) => {
      const sp = new URLSearchParams(searchParams.toString());
      Object.entries(patch).forEach(([k, v]) => {
        if (v == null || v === '') sp.delete(k);
        else sp.set(k, v);
      });
      router.replace(`/messages?${sp.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const loadOverlap = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(userId)}/public`);
      if (!response.ok) {
        setOverlap(null);
        setPresence(null);
        setFriendAchs([]);
        return;
      }
      const result = await response.json();
      setOverlap(result?.mutualTrust?.overlap || null);
      setPresence(result?.presence ?? null);
      const achs = Array.isArray(result?.achievements) ? result.achievements : [];
      setFriendAchs(achs.slice(0, 3).map((a: AchChip) => ({ code: a.code, title: a.title, accent: a.accent, tierLabel: a.tierLabel })));
    } catch {
      setOverlap(null);
      setPresence(null);
      setFriendAchs([]);
    }
  }, []);

  const loadList = useCallback(async () => {
    const qs = new URLSearchParams({ tab });
    if (showArchived) qs.set('showArchived', '1');
    if (inboxQuery.trim()) qs.set('q', inboxQuery.trim());
    const response = await fetch(`/api/messages?${qs}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Не удалось загрузить');
    if (tab === 'invites') {
      setInvites(result.invites || []);
      setDmList([]);
      setGroupList([]);
      return result;
    }
    if (tab === 'clubs' || tab === 'projects') {
      setGroupList(result.conversations || []);
      setDmList([]);
      setInvites([]);
      return result;
    }
    setDmList(result.conversations || []);
    setGroupList([]);
    setInvites([]);
    return result;
  }, [showArchived, tab, inboxQuery]);

  const loadDmThread = useCallback(
    async (conversationId: string) => {
      setThreadLoading(true);
      setActiveGroup(null);
      try {
        const response = await fetch(`/api/messages/${conversationId}`);
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Не удалось загрузить сообщения');
        setSelectedId(conversationId);
        setActiveUser(result.conversation.user);
        setMessages(result.messages);
        setThreadPinned(Boolean(result.conversation.pinned));
        setThreadArchived(Boolean(result.conversation.archived));
        setThreadMuted(Boolean(result.conversation.muted));
        setDmList((current) => current.map((item) => (item.id === conversationId ? { ...item, unreadCount: 0 } : item)));
        void loadOverlap(result.conversation.user.id);
      } finally {
        setThreadLoading(false);
      }
    },
    [loadOverlap]
  );

  const loadGroupThread = useCallback(async (opts: { conversationId?: string | null; kind: 'CLUB' | 'PROJECT'; entityId: string; title: string; href: string }) => {
    setThreadLoading(true);
    setActiveUser(null);
    setOverlap(null);
    setPresence(null);
    setFriendAchs([]);
    setActiveGroup({ kind: opts.kind, entityId: opts.entityId, title: opts.title, href: opts.href });
    try {
      if (opts.conversationId) {
        const response = await fetch(`/api/messages/${opts.conversationId}`);
        const result = await response.json();
        if (response.ok && result.conversation?.kind !== 'DM') {
          setSelectedId(opts.conversationId);
          setMessages(result.messages || []);
          setThreadPinned(Boolean(result.conversation.pinned));
          setThreadArchived(Boolean(result.conversation.archived));
          setThreadMuted(Boolean(result.conversation.muted));
          return;
        }
      }
      const qs = new URLSearchParams({ kind: opts.kind, entityId: opts.entityId });
      const res = await fetch(`/api/group-chat?${qs}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Чат недоступен');
      setSelectedId(data.conversationId || null);
      setMessages(
        (data.messages || []).map((m: { id: string; senderId: string; senderName: string; body: string; flagged: boolean; createdAt: string }) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName,
          body: m.body,
          kind: 'TEXT',
          flagged: m.flagged,
          readAt: null,
          createdAt: m.createdAt,
        }))
      );
      setThreadPinned(false);
      setThreadArchived(false);
      if (data.conversationId) setQuery({ tab, c: data.conversationId, with: null });
    } finally {
      setThreadLoading(false);
    }
  }, [setQuery, tab]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.replace('/login?callbackUrl=' + encodeURIComponent('/messages'));
      return;
    }
    if (status !== 'authenticated') return;
    let cancelled = false;
    const initialize = async () => {
      try {
        await loadList();
        if (cancelled) return;
        if (tab === 'invites') {
          setSelectedId(null);
          setActiveUser(null);
          setActiveGroup(null);
          setMessages([]);
          return;
        }
        if (cParam && (tab === 'clubs' || tab === 'projects')) {
          const listRes = await loadList();
          const rows: GroupConversation[] = listRes.conversations || [];
          const hit = rows.find((r) => r.id === cParam);
          if (hit) {
            await loadGroupThread({
              conversationId: hit.id,
              kind: hit.kind,
              entityId: hit.entityId,
              title: hit.title,
              href: hit.href,
            });
          } else {
            const response = await fetch(`/api/messages/${cParam}`);
            const result = await response.json();
            if (response.ok && result.conversation?.entityId) {
              await loadGroupThread({
                conversationId: cParam,
                kind: result.conversation.kind,
                entityId: result.conversation.entityId,
                title: result.conversation.title,
                href: result.conversation.href,
              });
            }
          }
          return;
        }
        if (tab === 'personal') {
          const rows = await loadList();
          const list: DmConversation[] = rows.conversations || [];
          const target = withId ? list.find((item) => item.user.id === withId) : cParam ? list.find((i) => i.id === cParam) : null;
          if (target) {
            await loadDmThread(target.id);
            return;
          }
          if (withId) {
            const response = await fetch(`/api/users/${encodeURIComponent(withId)}/public`);
            const result = await response.json();
            if (!response.ok) throw new Error(result.message || 'Пользователь не найден');
            if (!cancelled) {
              setSelectedId(null);
              setActiveUser(result.user);
              setActiveGroup(null);
              setMessages([]);
              setOverlap(result?.mutualTrust?.overlap || null);
              setPresence(result?.presence ?? null);
            }
          } else {
            setSelectedId(null);
            setActiveUser(null);
            setActiveGroup(null);
            setMessages([]);
          }
        }
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Ошибка');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    setLoading(true);
    initialize();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, tab, withId, cParam, showArchived]);

  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  }, [messages, threadLoading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 104)}px`;
  }, [body]);

  const updateState = async (conversationId: string, patch: { pinned?: boolean; archived?: boolean; muted?: boolean }) => {
    const res = await fetch('/api/messages/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, ...patch }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || 'Не удалось сохранить');
    setThreadPinned(Boolean(data.pinned));
    setThreadArchived(Boolean(data.archived));
    setThreadMuted(Boolean(data.muted));
    await loadList();
    if (patch.archived) {
      closeThread();
    }
  };

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const openCtxMenu = (
    clientX: number,
    clientY: number,
    conv: { id: string; pinned?: boolean; archived?: boolean; muted?: boolean }
  ) => {
    if (!conv?.id) return;
    const pad = 8;
    const x = Math.min(Math.max(pad, clientX), window.innerWidth - 210);
    const y = Math.min(Math.max(pad, clientY), window.innerHeight - 170);
    setCtxMenu({
      conversationId: conv.id,
      pinned: Boolean(conv.pinned),
      archived: Boolean(conv.archived),
      muted: Boolean(conv.muted),
      x,
      y,
    });
  };

  const bindConvPress = (conv: { id?: string | null; pinned?: boolean; archived?: boolean; muted?: boolean }) => {
    if (!conv?.id) return {};
    return {
      onContextMenu: (e: ReactMouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        openCtxMenu(e.clientX, e.clientY, { id: conv.id!, pinned: conv.pinned, archived: conv.archived, muted: conv.muted });
      },
      onTouchStart: (e: ReactTouchEvent) => {
        const t = e.touches[0];
        if (!t) return;
        clearLongPress();
        longPressTimer.current = setTimeout(() => {
          suppressClickRef.current = true;
          openCtxMenu(t.clientX, t.clientY, { id: conv.id!, pinned: conv.pinned, archived: conv.archived, muted: conv.muted });
        }, 550);
      },
      onTouchEnd: () => clearLongPress(),
      onTouchMove: () => clearLongPress(),
      onTouchCancel: () => clearLongPress(),
    };
  };

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);


  const openInvitePicker = async (mode: 'event' | 'entity') => {
    const next = pickerOpen && pickerMode === mode ? false : true;
    setPickerMode(mode);
    setPickerOpen(next);
    if (!next) return;
    setInvitableLoading(true);
    try {
      if (mode === 'event') {
        const res = await fetch('/api/user/bookings/invitable');
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Не удалось загрузить');
        setInvitable(data.items || []);
      } else {
        const res = await fetch('/api/entity-invites?scope=memberships');
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || 'Не удалось загрузить');
        setMemberships(data.items || []);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
      setInvitable([]);
      setMemberships([]);
    } finally {
      setInvitableLoading(false);
    }
  };

  const sendEventInvite = async (bookingId: string) => {
    if (!activeUser || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/user/bookings/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookingId, friendId: activeUser.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Не удалось пригласить');
      setSelectedId(data.conversationId);
      if (data.message) setMessages((current) => [...current, data.message]);
      setPickerOpen(false);
      toast.success('Приглашение отправлено');
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSending(false);
    }
  };

  const sendEntityInvite = async (item: MembershipItem) => {
    if (!activeUser || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/entity-invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: item.kind, entityId: item.entityId, friendId: activeUser.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Не удалось пригласить');
      setPickerOpen(false);
      toast.success('Приглашение в команду отправлено');
      if (selectedId) await loadDmThread(selectedId);
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setSending(false);
    }
  };

  const joinFromInvite = async (bookingId: string) => {
    setJoiningId(bookingId);
    try {
      const res = await fetch(`/api/bookings/${encodeURIComponent(bookingId)}/join`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Не удалось записаться');
      toast.success(data.waitlisted ? 'Вы в листе ожидания' : 'Вы записаны на мероприятие');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setJoiningId(null);
    }
  };

  const respondEntityInvite = async (inviteId: string, action: 'accept' | 'decline') => {
    setJoiningId(inviteId);
    try {
      const res = await fetch('/api/entity-invites', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteId, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Не удалось обработать');
      toast.success(action === 'accept' ? 'Вы в команде' : 'Приглашение отклонено');
      if (data.href) router.push(data.href);
      await loadList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setJoiningId(null);
    }
  };

  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = body.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      if (activeGroup) {
        const response = await fetch('/api/group-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: activeGroup.kind, entityId: activeGroup.entityId, body: text }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Не удалось отправить');
        setBody('');
        if (result.conversationId) setSelectedId(result.conversationId);
        if (result.message) {
          setMessages((current) => [
            ...current,
            {
              id: result.message.id,
              senderId: result.message.senderId,
              senderName: result.message.senderName,
              body: result.message.body,
              kind: 'TEXT',
              flagged: result.message.flagged,
              readAt: null,
              createdAt: result.message.createdAt,
            },
          ]);
        }
        if (result.warning) toast.error(result.warning, { duration: 6000 });
        await loadList();
      } else if (activeUser) {
        const response = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: activeUser.id, body: text }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.message || 'Не удалось отправить сообщение');
        setBody('');
        setSelectedId(result.conversationId);
        setMessages((current) => [...current, result.message]);
        if (result.warning) toast.error(result.warning, { duration: 6000 });
        await loadList();
        if (!selectedId) setQuery({ tab: 'personal', with: activeUser.id });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Ошибка');
    } finally {
      setSending(false);
    }
  };

  const closeThread = () => {
    setActiveUser(null);
    setActiveGroup(null);
    setSelectedId(null);
    setMessages([]);
    setOverlap(null);
    setPresence(null);
    setFriendAchs([]);
    setPickerOpen(false);
    setQuery({ with: null, c: null, tab });
  };

  const messageBlocks = useMemo(() => {
    const blocks: { key: string; day?: string; message?: Message; index?: number }[] = [];
    let lastDay = '';
    messages.forEach((message, index) => {
      const day = dayKey(message.createdAt);
      if (day !== lastDay) {
        blocks.push({ key: `day-${day}-${message.id}`, day });
        lastDay = day;
      }
      blocks.push({ key: message.id, message, index });
    });
    return blocks;
  }, [messages]);

  const renderMessage = (message: Message, index: number) => {
    const mine = message.senderId === session?.user?.id;
    const kind = message.kind || 'TEXT';
    const meta = message.meta || parseMessageMeta(kind, message.metaJson) || null;
    const group = groupClass(messages, index);

    if (kind === 'EVENT_INVITE' && meta && 'bookingId' in meta) {
      const m = meta as EventInviteMeta;
      return (
        <div key={message.id} className={`msg-bubble is-card${mine ? ' is-mine' : ''}${group ? ` ${group}` : ''}`}>
          <div className="msg-invite">
            <div className="msg-invite__banner"><Ticket size={12} style={{ display: 'inline', marginRight: 4 }} />Мероприятие</div>
            <div className="msg-invite__body">
              <h4 className="msg-invite__title">{m.title}</h4>
              <p className="msg-invite__when">{formatEventWhen(m.startTime)}</p>
              {m.spaceTitle ? <p className="msg-invite__where">{m.spaceTitle}</p> : null}
              {m.note ? <p className="msg-invite__note">{m.note}</p> : null}
              <div className="msg-invite__actions">
                {!mine ? (
                  <button type="button" className="is-primary" disabled={joiningId === m.bookingId} onClick={() => void joinFromInvite(m.bookingId)}>
                    {joiningId === m.bookingId ? '…' : 'Я пойду'}
                  </button>
                ) : null}
                <Link href={m.href || '/events'} className="is-ghost">К афише</Link>
              </div>
            </div>
          </div>
          <div className="msg-bubble__meta">{shortTime(message.createdAt)}{mine && message.readAt ? ' · прочитано' : ''}</div>
        </div>
      );
    }

    if (kind === 'PLACE_INVITE' && meta && 'placeId' in meta) {
      const m = meta as PlaceInviteMeta;
      return (
        <div key={message.id} className={`msg-bubble is-card${mine ? ' is-mine' : ''}${group ? ` ${group}` : ''}`}>
          <div className="msg-invite">
            <div className="msg-invite__banner is-place"><MapPin size={12} style={{ display: 'inline', marginRight: 4 }} />Куда сходить</div>
            <div className="msg-invite__body">
              <h4 className="msg-invite__title">{m.title}</h4>
              {m.note ? <p className="msg-invite__note">{m.note}</p> : null}
              <div className="msg-invite__actions"><Link href={m.href} className="is-primary is-place">Открыть место</Link></div>
            </div>
          </div>
          <div className="msg-bubble__meta">{shortTime(message.createdAt)}{mine && message.readAt ? ' · прочитано' : ''}</div>
        </div>
      );
    }

    if (kind === 'ENTITY_INVITE' && meta && 'inviteId' in meta) {
      const m = meta as EntityInviteMeta;
      return (
        <div key={message.id} className={`msg-bubble is-card${mine ? ' is-mine' : ''}${group ? ` ${group}` : ''}`}>
          <div className="msg-invite">
            <div className="msg-invite__banner"><Users size={12} style={{ display: 'inline', marginRight: 4 }} />{m.entityKind === 'CLUB' ? 'Клуб' : 'Проект'}</div>
            <div className="msg-invite__body">
              <h4 className="msg-invite__title">{m.title}</h4>
              {m.note ? <p className="msg-invite__note">{m.note}</p> : null}
              <div className="msg-invite__actions">
                {!mine ? (
                  <>
                    <button type="button" className="is-primary" disabled={joiningId === m.inviteId} onClick={() => void respondEntityInvite(m.inviteId, 'accept')}>Принять</button>
                    <button type="button" className="is-ghost" disabled={joiningId === m.inviteId} onClick={() => void respondEntityInvite(m.inviteId, 'decline')}>Отклонить</button>
                  </>
                ) : null}
                <Link href={m.href} className="is-ghost">Открыть</Link>
              </div>
            </div>
          </div>
          <div className="msg-bubble__meta">{shortTime(message.createdAt)}</div>
        </div>
      );
    }

    return (
      <div key={message.id} className={`msg-bubble${mine ? ' is-mine' : ''}${message.flagged ? ' is-flagged' : ''}${group ? ` ${group}` : ''}`}>
        {!mine && activeGroup && message.senderName ? (
          <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', marginBottom: 2 }}>{message.senderName}</div>
        ) : null}
        <div className={message.flagged ? 'msg-bubble__blurred' : undefined}>{message.body}</div>
        {message.flagged ? <div className="msg-bubble__flag-note">Скрыто модерацией</div> : null}
        <div className="msg-bubble__meta">{shortTime(message.createdAt)}{mine && message.readAt ? ' · прочитано' : ''}</div>
      </div>
    );
  };

  if (status === 'loading' || loading) {
    return <div className="messages-root"><div className="messages-thread__empty">Загрузка…</div></div>;
  }

  return (
    <div className={`messages-root${inThread ? ' is-thread' : ''}`}>
      {!inThread ? (
        <div className="messages-top">
          <Link href="/friends" aria-label="К друзьям" style={{ color: 'var(--foreground)', display: 'grid' }}><ArrowLeft size={21} /></Link>
          <div>
            <h1 className="text-gradient">Сообщения</h1>
            <p>Личные, клубы, проекты и приглашения</p>
          </div>
        </div>
      ) : null}

      {!inThread ? (
        <div className="messages-tabs" role="tablist" aria-label="Разделы сообщений">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`messages-tab${tab === t.id ? ' is-active' : ''}`}
              onClick={() => setQuery({ tab: t.id, with: null, c: null, archived: showArchived ? '1' : null })}
            >
              {t.label}
            </button>
          ))}
          {tab !== 'invites' ? (
            <button
              type="button"
              className={`messages-tab messages-tab--archive${showArchived ? ' is-active' : ''}`}
              onClick={() => setQuery({ tab, archived: showArchived ? null : '1', with: null, c: null })}
            >
              Архив
            </button>
          ) : null}
        </div>
      ) : null}

      {!inThread && tab !== 'invites' ? (
        <div className="messages-search">
          <Search size={14} aria-hidden />
          <input
            type="search"
            value={inboxQuery}
            onChange={(e) => setInboxQuery(e.target.value)}
            placeholder="Поиск по имени или тексту…"
            aria-label="Поиск диалогов"
          />
        </div>
      ) : null}

      <div className={`messages-shell${inThread ? ' is-thread' : ''}`}>
        <aside className="messages-list" aria-label="Список">
          {tab === 'invites' ? (
            invites.length === 0 ? (
              <div className="messages-list__empty"><MessageCircle size={27} style={{ marginBottom: 6 }} /><div>Нет активных приглашений</div></div>
            ) : (
              invites.map((inv) => (
                <div key={`${inv.type}-${inv.id}`} className="messages-conv messages-conv--invite">
                  <Avatar user={inv.from} />
                  <span className="messages-conv__meta">
                    <span className="messages-conv__row">
                      <span className="messages-conv__name">{inv.title}</span>
                      <span className="messages-conv__time">{shortTime(inv.createdAt)}</span>
                    </span>
                    <span className="messages-conv__preview">{inv.subtitle} · {inv.from.name || 'Друг'}</span>
                    <span className="messages-invite-actions">
                      {inv.type === 'ENTITY_INVITE' ? (
                        <>
                          <button type="button" className="messages-mini-btn" disabled={joiningId === inv.inviteId} onClick={() => void respondEntityInvite(inv.inviteId, 'accept')}>Принять</button>
                          <button type="button" className="messages-mini-btn is-ghost" disabled={joiningId === inv.inviteId} onClick={() => void respondEntityInvite(inv.inviteId, 'decline')}>Отклонить</button>
                        </>
                      ) : inv.type === 'EVENT_INVITE' && inv.bookingId ? (
                        <button type="button" className="messages-mini-btn" disabled={joiningId === inv.bookingId} onClick={() => void joinFromInvite(inv.bookingId!)}>Я пойду</button>
                      ) : (
                        <Link href={inv.href} className="messages-mini-btn">Открыть</Link>
                      )}
                    </span>
                  </span>
                </div>
              ))
            )
          ) : tab === 'clubs' || tab === 'projects' ? (
            groupList.length === 0 ? (
              <div className="messages-list__empty">
                <FolderKanban size={27} style={{ marginBottom: 6 }} />
                <div>{showArchived ? 'Архив пуст' : 'Нет чатов — вступите в команду'}</div>
                <Link href={tab === 'clubs' ? '/clubs' : '/projects'} style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem' }}>
                  К каталогу
                </Link>
              </div>
            ) : (
              groupList.map((row) => (
                <button
                  key={row.id || row.entityId}
                  type="button"
                  className={`messages-conv${selectedId === row.id ? ' is-active' : ''}${ctxMenu?.conversationId === row.id ? ' is-ctx' : ''}`}
                  {...bindConvPress(row)}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    setCtxMenu(null);
                    setQuery({ tab, c: row.id, with: null });
                    void loadGroupThread({
                      conversationId: row.id,
                      kind: row.kind,
                      entityId: row.entityId,
                      title: row.title,
                      href: row.href,
                    });
                  }}
                >
                  <span className="messages-conv__entity-ico">{row.kind === 'CLUB' ? 'К' : 'П'}</span>
                  <span className="messages-conv__meta">
                    <span className="messages-conv__row">
                      <span className="messages-conv__name">{row.pinned ? '📌 ' : ''}{row.muted ? '🔇 ' : ''}{row.title}</span>
                      {row.lastMessage?.createdAt ? <span className="messages-conv__time">{shortTime(row.lastMessage.createdAt)}</span> : null}
                    </span>
                    <span className="messages-conv__preview">{row.lastMessage?.preview || row.lastMessage?.body || 'Чат участников'}</span>
                  </span>
                  {row.unreadCount > 0 ? <span className="messages-conv__badge">{row.unreadCount > 999 ? '999+' : row.unreadCount}</span> : null}
                  {row.id ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="messages-conv__more"
                      title="Настройки чата"
                      aria-label="Настройки чата"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        openCtxMenu(r.left, r.bottom + 4, { id: row.id!, pinned: row.pinned, archived: row.archived, muted: row.muted });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          e.stopPropagation();
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          openCtxMenu(r.left, r.bottom + 4, { id: row.id!, pinned: row.pinned, archived: row.archived, muted: row.muted });
                        }
                      }}
                    >
                      <MoreHorizontal size={16} />
                    </span>
                  ) : null}
                </button>
              ))
            )
          ) : dmList.length === 0 ? (
            <div className="messages-list__empty">
              <MessageCircle size={27} style={{ marginBottom: 6 }} />
              <div>{showArchived ? 'Архив пуст' : 'Диалогов пока нет'}</div>
              {!showArchived ? <Link href="/friends" style={{ color: 'var(--primary)', fontWeight: 700, fontSize: '0.85rem' }}>Перейти к друзьям</Link> : null}
            </div>
          ) : (
            dmList.map((conversation) => {
              const selected = conversation.id === selectedId;
              const preview = conversation.lastMessage?.preview || (conversation.lastMessage ? previewForMessage(conversation.lastMessage.kind, conversation.lastMessage.body, conversation.lastMessage.metaJson) : 'Новый диалог');
              return (
                <button
                  key={conversation.id}
                  type="button"
                  className={`messages-conv${selected ? ' is-active' : ''}${ctxMenu?.conversationId === conversation.id ? ' is-ctx' : ''}`}
                  {...bindConvPress(conversation)}
                  onClick={() => {
                    if (suppressClickRef.current) {
                      suppressClickRef.current = false;
                      return;
                    }
                    setCtxMenu(null);
                    setQuery({ tab: 'personal', with: conversation.user.id, c: conversation.id });
                    void loadDmThread(conversation.id);
                  }}
                >
                  <Avatar user={conversation.user} presence={conversation.presence} />
                  <span className="messages-conv__meta">
                    <span className="messages-conv__row">
                      <span className="messages-conv__name">{conversation.pinned ? '📌 ' : ''}{conversation.muted ? '🔇 ' : ''}{conversation.user.name || 'Пользователь'}</span>
                      {conversation.lastMessage?.createdAt ? <span className="messages-conv__time">{shortTime(conversation.lastMessage.createdAt)}</span> : null}
                    </span>
                    <span className="messages-conv__preview">{preview}</span>
                  </span>
                  {conversation.unreadCount > 0 ? <span className="messages-conv__badge">{conversation.unreadCount > 999 ? '999+' : conversation.unreadCount}</span> : null}
                  <span
                    role="button"
                    tabIndex={0}
                    className="messages-conv__more"
                    title="Настройки чата"
                    aria-label="Настройки чата"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      openCtxMenu(r.left, r.bottom + 4, {
                        id: conversation.id,
                        pinned: conversation.pinned,
                        archived: conversation.archived,
                        muted: conversation.muted,
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        e.stopPropagation();
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        openCtxMenu(r.left, r.bottom + 4, {
                          id: conversation.id,
                          pinned: conversation.pinned,
                          archived: conversation.archived,
                          muted: conversation.muted,
                        });
                      }
                    }}
                  >
                    <MoreHorizontal size={16} />
                  </span>
                </button>
              );
            })
          )}
        </aside>

        <section className="messages-thread" aria-label="Диалог">
          {tab === 'invites' && !inThread ? (
            <div className="messages-thread__empty"><Users size={34} style={{ marginBottom: 8 }} /><div>Выберите приглашение слева или примите прямо из списка</div></div>
          ) : !activeUser && !activeGroup ? (
            <div className="messages-thread__empty"><MessageCircle size={34} style={{ marginBottom: 8 }} /><div>Выберите диалог</div></div>
          ) : (
            <>
              <div className="messages-thread-head">
                <button type="button" className="messages-thread-head__back" aria-label="К списку" onClick={closeThread}><ArrowLeft size={18} /></button>
                {activeGroup ? (
                  <Link href={activeGroup.href} className="messages-thread-head__profile">
                    <span className="messages-conv__entity-ico" style={{ width: 40, height: 40 }}>{activeGroup.kind === 'CLUB' ? 'К' : 'П'}</span>
                    <span style={{ minWidth: 0 }}>
                      <strong>{activeGroup.title}</strong>
                      <span className="messages-thread-head__sub">Чат участников · открыть страницу</span>
                    </span>
                  </Link>
                ) : activeUser ? (
                  <Link href={`/u/${activeUser.publicCode || activeUser.id}`} className="messages-thread-head__profile">
                    <Avatar user={activeUser} size={40} presence={presence} />
                    <span style={{ minWidth: 0 }}>
                      <strong>{activeUser.name || 'Пользователь'}</strong>
                      <span className="messages-thread-head__sub">{presence?.label || 'в сети скрыт'} · открыть профиль</span>
                      {friendAchs.length ? (
                        <span className="messages-thread-head__achs">
                          {friendAchs.map((a) => (
                            <span key={a.code} className="messages-ach-chip" title={`${a.tierLabel}: ${a.title}`} style={{ borderColor: `${a.accent}44`, color: a.accent }}>{a.title}</span>
                          ))}
                        </span>
                      ) : null}
                    </span>
                  </Link>
                ) : null}
                {selectedId ? (
                  <div className="messages-thread-actions">
                    <button type="button" className="messages-mini-btn is-ghost" title={threadPinned ? 'Открепить' : 'Закрепить'} onClick={() => void updateState(selectedId, { pinned: !threadPinned }).catch((e) => toast.error(e.message))}>
                      <Pin size={14} />
                    </button>
                    <button type="button" className="messages-mini-btn is-ghost" title={threadArchived ? 'Вернуть' : 'В архив'} onClick={() => void updateState(selectedId, { archived: !threadArchived }).catch((e) => toast.error(e.message))}>
                      <Archive size={14} />
                    </button>
                    <button type="button" className="messages-mini-btn is-ghost" title={threadMuted ? 'Включить уведомления' : 'Без уведомлений'} onClick={() => void updateState(selectedId, { muted: !threadMuted }).catch((e) => toast.error(e.message))}>
                      {threadMuted ? <BellOff size={14} /> : <Bell size={14} />}
                    </button>
                  </div>
                ) : null}
              </div>

              {overlap ? <div className="messages-mutual"><MutualOverlapChips overlap={overlap} compact /></div> : null}

              <div className="messages-scroll" ref={scrollRef}>
                {threadLoading ? (
                  <div style={{ margin: 'auto', color: '#64748b' }}>Загрузка…</div>
                ) : messages.length === 0 ? (
                  <div style={{ margin: 'auto', color: '#64748b', textAlign: 'center', padding: '1rem' }}>
                    {activeGroup ? 'Пока нет сообщений — напишите первым' : 'Напишите первое сообщение или пригласите'}
                  </div>
                ) : (
                  messageBlocks.map((block) =>
                    block.day ? (
                      <div key={block.key} className="messages-day">{block.day}</div>
                    ) : block.message && block.index != null ? (
                      renderMessage(block.message, block.index)
                    ) : null
                  )
                )}
                <div ref={endRef} />
              </div>

              <form className="messages-composer" onSubmit={send}>
                {activeUser && !activeGroup ? (
                  <div className="messages-composer__tools">
                    <button type="button" className={`messages-tool${pickerOpen && pickerMode === 'event' ? ' is-open' : ''}`} onClick={() => void openInvitePicker('event')}>
                      <CalendarPlus size={14} /> Событие
                    </button>
                    <button type="button" className={`messages-tool${pickerOpen && pickerMode === 'entity' ? ' is-open' : ''}`} onClick={() => void openInvitePicker('entity')}>
                      <Users size={14} /> Клуб / проект
                    </button>
                  </div>
                ) : null}
                {pickerOpen && activeUser ? (
                  <div className="messages-invite-picker" role="listbox">
                    {invitableLoading ? (
                      <p className="messages-invite-picker__empty">Загрузка…</p>
                    ) : pickerMode === 'event' ? (
                      invitable.length === 0 ? (
                        <p className="messages-invite-picker__empty">Нет ближайших мероприятий. <Link href="/events" style={{ color: 'var(--primary)', fontWeight: 700 }}>К афише</Link></p>
                      ) : (
                        invitable.map((ev) => (
                          <button key={ev.id} type="button" className="messages-invite-picker__item" disabled={sending} onClick={() => void sendEventInvite(ev.id)}>
                            <strong>{ev.title}</strong>
                            <span>{formatEventWhen(ev.startTime)}{ev.spaceTitle ? ` · ${ev.spaceTitle}` : ''}</span>
                          </button>
                        ))
                      )
                    ) : memberships.length === 0 ? (
                      <p className="messages-invite-picker__empty">Вы ещё не участник клуба или проекта</p>
                    ) : (
                      memberships.map((item) => (
                        <button key={`${item.kind}-${item.entityId}`} type="button" className="messages-invite-picker__item" disabled={sending} onClick={() => void sendEntityInvite(item)}>
                          <strong>{item.title}</strong>
                          <span>{item.kind === 'CLUB' ? 'Клуб' : 'Проект'}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
                <div className="messages-composer__row">
                  <textarea
                    ref={textareaRef}
                    value={body}
                    onChange={(event) => setBody(event.target.value.slice(0, 2000))}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                    rows={1}
                    maxLength={2000}
                    placeholder={activeGroup ? 'Сообщение команде…' : 'Сообщение… Enter — отправить'}
                    aria-label="Текст сообщения"
                  />
                  <button type="submit" className="messages-send" disabled={!body.trim() || sending} aria-label="Отправить"><Send size={18} /></button>
                </div>
              </form>
            </>
          )}
        </section>
      </div>
      {ctxMenu ? (
        <>
          <button type="button" className="messages-ctx-backdrop" aria-label="Закрыть" onClick={() => setCtxMenu(null)} />
          <div className="messages-ctx" style={{ left: ctxMenu.x, top: ctxMenu.y }} role="menu">
            <button
              type="button"
              className="messages-ctx__item"
              role="menuitem"
              onClick={() => {
                const id = ctxMenu.conversationId;
                const next = !ctxMenu.pinned;
                setCtxMenu(null);
                void updateState(id, { pinned: next }).catch((e) => toast.error(e.message));
              }}
            >
              <Pin size={14} /> {ctxMenu.pinned ? 'Открепить' : 'Закрепить'}
            </button>
            <button
              type="button"
              className="messages-ctx__item"
              role="menuitem"
              onClick={() => {
                const id = ctxMenu.conversationId;
                const next = !ctxMenu.archived;
                setCtxMenu(null);
                void updateState(id, { archived: next }).catch((e) => toast.error(e.message));
              }}
            >
              <Archive size={14} /> {ctxMenu.archived ? 'Вернуть из архива' : 'В архив'}
            </button>
            <button
              type="button"
              className="messages-ctx__item"
              role="menuitem"
              onClick={() => {
                const id = ctxMenu.conversationId;
                const next = !ctxMenu.muted;
                setCtxMenu(null);
                void updateState(id, { muted: next }).catch((e) => toast.error(e.message));
              }}
            >
              {ctxMenu.muted ? <Bell size={14} /> : <BellOff size={14} />}
              {ctxMenu.muted ? 'Включить уведомления' : 'Без уведомлений'}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense fallback={<div className="messages-root"><div className="messages-thread__empty">Загрузка…</div></div>}>
      <MessagesInner />
    </Suspense>
  );
}
