# UI fix: scanner camera, profile stats, compact events

## Scanner camera
**Cause:** nginx `Permissions-Policy` had `camera=()` — браузер блокировал доступ к камере.  
**Fix:** `camera=(self)` (+ `geolocation=(self)`). Live header verified.  
Also improved `TicketScanner`: fallback `environment` → `user` → first device, clearer permission errors.

## Profile
On profile overview, **immediately under the hero**:
- Уровень · Авторитет · Социум · Эко (clickable)
- Opens modal with history; Eco tab has **Магазин** (EcoPointsPanel) + jump to cards (`#eco-shop`)
- Aside chips include **Ур**

## Ближайшие мероприятия
Homepage cards: `event-card--compact`, actions in one row (`event-card-actions--row`).  
Dashboard tickets: compact cards with QR + calendar + cancel in one button row.

## Deploy
Image: `sochi-portal_web:ui-scanner-profile`  
Nginx: `/etc/nginx/sites-available/sochi-portal` (reloaded)
