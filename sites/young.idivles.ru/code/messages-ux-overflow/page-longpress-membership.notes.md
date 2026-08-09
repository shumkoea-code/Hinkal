# Client: long-press menu + membership filter

Target: `src/app/messages/page.tsx` (client component).

## A. Membership filter (defense in depth)

When `tab` is `clubs` or `projects`, after `GET /api/messages?...`:

1. Fetch `/api/entity-invites?scope=memberships` (or include memberships in the messages API response).
2. Keep only conversations whose `entityId` is in the membership set for that kind.
3. Drop rows with missing `id` unless they are confirmed memberships (prefer dropping `id: null` until conversation is ensured server-side).

Pseudo:

```tsx
const memberships = await fetch('/api/entity-invites?scope=memberships').then(r => r.json());
const allow = new Set(
  (memberships.items || [])
    .filter((m) => (tab === 'clubs' ? m.kind === 'CLUB' : m.kind === 'PROJECT'))
    .map((m) => m.entityId)
);
setGroupConversations((conversations || []).filter((c) => c.entityId && allow.has(c.entityId)));
```

## B. Long-press / context menu on list rows

State:

```tsx
type Ctx = {
  conversationId: string;
  pinned: boolean;
  archived: boolean;
  muted: boolean;
  x: number;
  y: number;
} | null;
const [ctx, setCtx] = useState<Ctx>(null);
```

On each `messages-conv` button that has `conversation.id`:

- `onContextMenu={(e) => { e.preventDefault(); openCtx(e.clientX, e.clientY, conv); }}`
- Touch: `onTouchStart` start 550ms timer → `openCtx(touch.clientX, touch.clientY, conv)`; clear on `touchend`/`touchmove`/`touchcancel`.
- Prevent click navigation when menu was opened from long-press (flag).

`openCtx` clamps position into viewport:

```tsx
const pad = 8;
const x = Math.min(Math.max(pad, clientX), window.innerWidth - 200);
const y = Math.min(Math.max(pad, clientY), window.innerHeight - 160);
```

Menu UI (portal or absolute fixed `.messages-ctx`):

- Закрепить / Открепить → existing `updateState(id, { pinned: !pinned })`
- В архив / Вернуть → `{ archived: !archived }`
- Без уведомлений / Включить → `{ muted: !muted }`

Close on: outside click, Escape, scroll, route change.

Reuse the same `POST /api/messages/state` helper already used by thread header actions.

## C. Personal (DM) rows

Same long-press menu (pin/archive/mute) — IDs always present for DMs.
