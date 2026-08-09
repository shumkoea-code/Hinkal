# Messages UX + overflow (2026-08-09)

## Blocker
Deploy to VPS `176.124.204.53:4488` is blocked: root password `SochiPortal2026!` is rejected; fail2ban may also ban the agent IP after retries.

**To unblock**, add this agent SSH public key to `/root/.ssh/authorized_keys` (or provide `SOCHI_SSH_PASSWORD` / `SOCHI_SSH_PRIVATE_KEY`):

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJvcjBXIVCeBUlkn+iRLyO79Lxe9uwyqPxTLgspKAeTC cursor-cloud-agent-young-idivles
```

Then unban if needed: `fail2ban-client set sshd unbanip <agent-ip>` (jail name may differ for port 4488).

## Findings

### 1. Club/project chats shown without membership
API `GET /api/messages?tab=clubs` for **ADMIN** (`qa-admin@sochi.ru`) returns **all clubs**, including virtual rows with `id: null` (Амплитуда, Молодая семья, …), while `/api/entity-invites?scope=memberships` returns `[]`.

Regular `user@sochi.ru` correctly sees only membership clubs/projects.  
`demo@sochi.ru` sees 0 clubs (not a member) — OK.

**Cause:** staff/admin bypass listing every Club/Project as a chat.  
**Fix:** list only entities where the user is a member (same source as `entity-invites?scope=memberships`). No role-based “show all clubs” in the inbox. Also enforce membership in `GET/POST /api/group-chat`.

### 2. Long-press settings popup — missing
Pin / archive / mute already exist via `POST /api/messages/state` and thread-header buttons.  
List rows have **no** `contextmenu` / long-press handler (GUI confirmed).

**Fix:** on chat row — `contextmenu` + touch long-press (~550ms) → floating menu near the finger/cursor with Закрепить / В архив / Без уведомлений (reuse state API). Only when `conversation.id` is present.

### 3. Horizontal overflow
User screenshots show club rows flush/over the right edge on mobile.  
Automated 390px crawl did not always reproduce scrollWidth overflow, but messages list needs safer containment:

- `messages-list` / `messages-conv`: `box-sizing`, `max-width:100%`, `overflow-x:hidden`
- `messages-conv__name`: ellipsis
- `messages-tabs`: allow horizontal scroll instead of blowing layout
- Global: tighten `overflow-x: clip` on `html/body/.main-content/.container`, media `max-width:100%`

## Patch files
`sites/young.idivles.ru/code/messages-ux-overflow/`:

| File | Purpose |
|------|---------|
| `apply-on-vps.sh` | Pull sources, apply patches, rebuild |
| `messages-overflow.css` | Append to `src/app/messages/messages.css` |
| `globals-overflow.css` | Append to `src/app/globals.css` |
| `api-messages-membership.md` | Exact server filter rules |
| `page-longpress-membership.notes.md` | Client changes for `messages/page.tsx` |

## Verify (after deploy)
1. Login as admin with **no** club memberships → tab Клубы empty (“Нет чатов — вступите в команду”).
2. Login as `user@sochi.ru` → only membership clubs/projects.
3. Long-press / right-click a DM or club chat with id → popup near row; pin/mute/archive work.
4. Mobile ~390px: messages list and sample public pages — no sideways scroll (`document.documentElement.scrollWidth <= innerWidth`).
