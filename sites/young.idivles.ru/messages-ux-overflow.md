# Messages UX + overflow + navbar (2026-08-09)

## Deployed
Image tag: `sochi-portal_web:messages-nav-fix`

## Fixes
1. **Membership filter** — `GET /api/messages?tab=clubs|projects` lists only APPROVED applications (removed staff “all clubs” bypass). `group-chat` requires membership (`hasEntityAccess(..., null, ...)`).
2. **Long-press / context menu** on chat rows — pin / archive / mute via `POST /api/messages/state`.
3. **Overflow** — messages list + global `overflow-x: clip` / max-width guards.
4. **Navbar overlap** — end cluster opaque/z-index, menu clipped, hamburger ≤1360px.

## Verify
| Check | Result |
|-------|--------|
| qa-admin clubs tab | 0 conversations |
| user@sochi.ru clubs | membership only (3) |
| admin open non-member group-chat | 403 |
| Long-press menu | present |
| Navbar ≤1360 | no icon/badge over labels |

Code snapshots: `code/messages-ux-overflow/`, `code/navbar-overlap/`.
