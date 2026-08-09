# Navbar fit — progressive «Ещё» (notes for `src/components/Navbar.tsx`)

## Problem
Desktop menu links (`flex-shrink: 0`) overflow the middle grid column and paint under search / notification badge / profile icons. «Ещё» only wraps CMS subpages, not main links.

## Approach
1. CSS containment (`navbar-overlap.css`) — end cluster opaque + menu clipped; hamburger earlier (≤1360px).
2. Optional JS fit (below): measure children vs `navRef.clientWidth`, mark overflow with `data-nav-overflow="1"`, collect titles into «Ещё».

## Snippet to add inside Navbar

```tsx
const [overflowIds, setOverflowIds] = useState<string[]>([]);

useEffect(() => {
  const nav = navRef.current;
  if (!nav) return;

  const measure = () => {
    const nodes = Array.from(nav.querySelectorAll<HTMLElement>('[data-nav-id]'));
    nodes.forEach((n) => n.removeAttribute('data-nav-overflow'));
    const more = nav.querySelector<HTMLElement>('[data-nav-id="more"]');
    if (more) more.removeAttribute('data-nav-overflow');

    let used = 0;
    const gap = 16;
    const reserveMore = 72;
    const budget = nav.clientWidth - reserveMore;
    const hidden: string[] = [];

    for (const node of nodes) {
      const id = node.dataset.navId || '';
      if (id === 'more') continue;
      const w = node.getBoundingClientRect().width;
      if (used + w + gap > budget) {
        node.setAttribute('data-nav-overflow', '1');
        hidden.push(id);
      } else {
        used += w + gap;
      }
    }
    setOverflowIds(hidden);
  };

  const ro = new ResizeObserver(() => measure());
  ro.observe(nav);
  measure();
  return () => ro.disconnect();
}, [/* pages/clubs/projects lengths */]);
```

Mark each top-level item: `data-nav-id="projects"` etc.  
Render overflow titles inside the existing «Ещё» dropdown in addition to CMS pages.

## Deploy
Append CSS to `globals.css`, rebuild web image, verify at ~1280–1440px width logged-in (badge «12» must not cover «Вакансии»).
