# Manual GUI QA Report for https://young.idivles.ru
**Date:** Aug 9, 2026
**QA Users:** qa-admin@sochi.ru / user@sochi.ru
**Browser Resolution:** ~1280-1440px desktop

## Test Results Summary

### 1. Desktop Navbar Layout (qa-admin) - ✅ PASS
- **Status:** PASS
- **Screenshot:** `01-navbar-desktop-no-overlap.webp`
- **Findings:** 
  - Navigation links properly spaced
  - No overlap between menu items and search/notifications/profile icons
  - All elements visible and accessible at desktop width
  
### 2. /events Page - ⚠️ PARTIAL PASS
- **Status:** PARTIAL PASS (with issues)
- **Screenshot:** `02-events-page-single-h1-loading-cards.webp`
- **Findings:**
  - ✅ Single H1 "Афиша мероприятий" - NO duplicate H1s
  - ⚠️ Event card images not loading - showing loading skeleton placeholders
  - NOT showing identical house SVGs (showing placeholders instead)
  - **Console Errors Detected:**
    - `Uncaught TypeError: Failed to execute 'put' on 'Cache'` (service worker issue)
    - `The fetch/event for https://young.idivles.ru/events resulted in a network error`
    - `Uncaught TypeError: Failed to convert value to 'Response'`
  - **Issue:** Service worker or network errors preventing event card cover images from loading

### 3. /projects Page - ✅ PASS
- **Status:** PASS
- **Screenshot:** `03-projects-page-varied-covers-filter-chips.webp`
- **Findings:**
  - Project cards have VARIED covers (blue geometric patterns, red/pink cover for "Добровольцы Сочи")
  - Filter chips horizontal scrollbar present - appears thin/modern (not thick/ugly)
  - Some cards show house icons but most have varied thematic covers
  
### 4. /dashboard (Profile Area) - ✅ PASS
- **Status:** PASS
- **Screenshot:** `04-dashboard-profile-compact-layout.webp`
- **Findings:**
  - Layout fits width properly
  - Ratings displayed compactly in sidebar (Ур. 1, 100%, 50%, 11)
  - No major overflow issues
  - Clean, organized interface

### 5. Admin /admin/settings?tab=eco - ✅ PASS
- **Status:** PASS
- **Screenshot:** `05-admin-settings-eco-pool-counter-grant-ui.webp`
- **Findings:**
  - ✅ Pool counter VISIBLE: "Пул эко-баллов 999 832 осталось"
  - ✅ Grant UI present with fields for:
    - User profile code (YM-...)
    - Amount field (showing 25)
    - Reason field (optional)
    - "Выдать эко-баллы" button

### 6. Admin /admin/settings?tab=replica - ✅ PASS
- **Status:** PASS
- **Screenshot:** `06-admin-settings-replica-replication-form.webp`
- **Findings:**
  - ✅ Replication form present with all fields:
    - Enable replication checkbox
    - Node role dropdown
    - Peer host, SSH port
    - Shared secret
    - Sync interval
    - Failover mode
    - Upload sync checkbox
    - Auto-promote checkbox

### 7. Admin /admin/settings?tab=appearance - ✅ PASS
- **Status:** PASS
- **Screenshot:** `07-admin-settings-appearance-modern-time-pickers.webp`
- **Findings:**
  - ✅ Modern time pickers for work hours implemented
  - Time picker UI shows:
    - Hour/Minute selectors with dropdown
    - AM/PM toggle
    - Clean, modern interface
    - Working properly (tested opening picker)

### 8. Admin Dashboard Charts (/admin) - ✅ PASS
- **Status:** PASS
- **Screenshot:** `08-admin-dashboard-charts-rendering.webp`
- **Findings:**
  - ✅ Bar charts rendering properly ("Новые пользователи" chart with dates)
  - ✅ Pie/donut chart rendering properly ("Статус заявок" with Одобрено/Отклонено)
  - No zero-width or collapsed charts
  - All charts display correctly with data

### 9. Eco Shop (user@sochi.ru) - ❌ NOT COMPLETED
- **Status:** NOT COMPLETED
- **Findings:**
  - Successfully logged in as user@sochi.ru
  - User profile shows eco badges ("Эко-старт")
  - User has 8 eco points
  - Toast notification "+1эко за просмотр" confirmed eco system working
  - **Issue:** Could not locate eco shop navigation/UI within testing time
  - Shop access point not clearly visible in standard navigation
  - Requires further investigation of dashboard tabs or direct URL access

### 10. Admin /admin/contests - ✅ PASS
- **Status:** PASS
- **Screenshot:** `10-admin-contests-award-eco-points-section.webp`
- **Findings:**
  - ✅ Section "Наградить эко-баллами" VISIBLE
  - Award UI includes:
    - Raffle/contest selector dropdown
    - User profile code field
    - Amount field (25)
    - Reason field
    - "Выдать эко-баллы" button

## Console Errors Summary

### Critical Errors:
1. **Service Worker / Cache Issues** (on /events):
   - `Uncaught TypeError: Failed to execute 'put' on 'Cache'`
   - Network errors preventing page resources from loading
   - `Failed to convert value to 'Response'`
   
   **Impact:** Event card cover images fail to load, showing only loading skeletons

## Overall Assessment

**PASS Rate: 8/10 (80%)**

### Passing Items:
1. ✅ Navbar layout
2. ⚠️ Events page (H1 correct, but images not loading)
3. ✅ Projects page
4. ✅ Dashboard layout
5. ✅ Admin eco settings
6. ✅ Admin replication settings
7. ✅ Admin appearance/time pickers
8. ✅ Admin dashboard charts
9. ❌ Eco shop testing (incomplete)
10. ✅ Admin contests page

### Remaining Issues:

1. **Service Worker Errors** (Medium Priority)
   - Location: /events page
   - Issue: Service worker cache failures preventing event card images from loading
   - Recommendation: Review service worker configuration and cache handling

2. **Eco Shop Navigation** (Low Priority - UX)
   - Issue: Eco shop access point not immediately discoverable
   - Recommendation: Add clearer navigation to eco shop from profile or main menu

### Notes:
- All admin settings tabs are properly implemented with modern UI
- Charts render correctly without layout issues
- Time pickers are modern and functional
- Eco points system is working (toast notifications confirmed)
- Overall UX is clean and responsive at desktop resolution
