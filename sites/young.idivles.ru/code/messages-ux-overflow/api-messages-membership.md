# API: membership-only club/project chats

Target: `src/app/api/messages/route.ts` (GET list) and `src/app/api/group-chat/route.ts`.

## Observed behaviour (prod)

| User | memberships | `?tab=clubs` |
|------|-------------|--------------|
| qa-admin (ADMIN) | `[]` | 11 clubs, many `id: null` |
| user@sochi.ru | 2 clubs + 2 projects | matching memberships (+ seed_club_3) |
| demo@sochi.ru | none | 0 |

## Required rules

### GET `/api/messages?tab=clubs|projects`
1. Resolve membership entity IDs for `session.user.id` (same query as `/api/entity-invites?scope=memberships`).
2. Return conversations **only** for those entity IDs (existing Conversation rows + optional ensure for members).
3. **Do not** append “all clubs/projects” for ADMIN/MOD/TECH.
4. Never return rows with `id: null` for entities the user does not belong to.
5. Archive filter (`showArchived`) still applies to participant state.

### GET/POST `/api/group-chat`
- Before create/read/send: user must be a member of `kind`+`entityId` (or ADMIN with explicit moderation flag if product needs it — default **deny** non-members).
- Non-members → `403` `{ message: "Чат доступен участникам" }`.

## Suggested membership helper (reuse)

```ts
// src/lib/entity-membership.ts (create if missing)
export async function userEntityIds(userId: string, kind: 'CLUB' | 'PROJECT'): Promise<Set<string>> {
  // Use the same Prisma relations as entity-invites?scope=memberships
  // e.g. ClubMember / ProjectMember / Application ACCEPTED — match existing schema
}
```

In list handler for clubs/projects:

```ts
const allowed = await userEntityIds(userId, tab === 'clubs' ? 'CLUB' : 'PROJECT');
conversations = conversations.filter((c) => c.entityId && allowed.has(c.entityId));
// If code currently maps ALL Club.findMany() for staff — delete that branch.
```

## Quick SQL sanity (on VPS after fix)

```bash
# as admin with zero memberships — expect conversations: []
curl -sH "Cookie: ..." 'https://young.idivles.ru/api/messages?tab=clubs'
```
