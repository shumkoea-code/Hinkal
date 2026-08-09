# Public profile display polish (2026-08-09)

## Scope
Visitor-facing `/u/[id|publicCode]` layout and navbar link to own public profile.

## Findings
- Rating chips inherited dashboard **2×2** grid and looked sparse on the wide public page (~820px).
- Owner-only guide «Как оформить профиль» occupied too much vertical space on self-view.
- Navbar «Профиль» used internal cuid (`/u/{cuid}`) instead of short `publicCode` (`YM-…`).
- Empty achievements already hidden for visitors; memberships/portfolio sections are conditional.

## Fixes
1. `.public-profile-ratings .rating-chips` → **4 columns** desktop, **2** on ≤640px.
2. Owner guide collapsed into `<details class="public-profile-guide">`.
3. Navbar loads `/api/user/profile` once and prefers `publicCode` in `profileHref`.
4. Trust block is a single full-width section (no lonely one-cell grid).

## Deploy files (VPS `/opt/sochi-portal`)
- `src/app/u/[id]/page.tsx`
- `src/components/Navbar.tsx`
- `src/app/globals.css` (public-profile polish block)

## Verify
- Anonymous: `https://young.idivles.ru/u/YM-3YN2HV` — ratings in one row, achievements/membership visible.
- Logged-in visitor: friend actions + mutual trust section.
- Owner self-view: guide collapsed; ratings clickable; edit CTAs present.
- Navbar profile icon → `/u/YM-…` when code exists.

## GUI verify (prod, 2026-08-09)
- Anonymous `/u/YM-3YN2HV`: ratings **4-across**, achievements + участие + доверие — PASS
- Anonymous `/u/YM-NLQX7B`: public page (not admin) — PASS
- Owner self-view: guide **collapsed** `<details>`, edit CTAs — PASS
- Image tag: `sochi-portal_web:public-profile-display`
