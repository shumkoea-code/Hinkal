#!/usr/bin/env python3
"""Generate cohesive Sochi youth-portal cover SVGs (no text labels)."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

OUT = Path("/tmp/sochi-covers")
OUT_COVERS = OUT / "covers"
OUT_TEMPLATES = OUT / "templates"
OUT_UPLOADS = OUT / "uploads"
for d in (OUT_COVERS, OUT_TEMPLATES, OUT_UPLOADS):
    d.mkdir(parents=True, exist_ok=True)

# Category palettes — sea / mountain / sun (avoid purple neon AI look)
PALETTES = {
    "news": ("#0E7490", "#155E75", "#083344", "#F0FDFA"),
    "events": ("#F97316", "#EA580C", "#9A3412", "#FFF7ED"),
    "projects": ("#0284C7", "#0369A1", "#0C4A6E", "#F0F9FF"),
    "clubs": ("#0D9488", "#0F766E", "#134E4A", "#F0FDFA"),
    "spaces": ("#14B8A6", "#0D9488", "#115E59", "#ECFDF5"),
    "grants": ("#059669", "#047857", "#064E3B", "#ECFDF5"),
    "dobro": ("#E11D48", "#BE123C", "#881337", "#FFF1F2"),
    "selfgov": ("#1D4ED8", "#1E40AF", "#1E3A8A", "#EFF6FF"),
    "documents": ("#475569", "#334155", "#1E293B", "#F8FAFC"),
    "about": ("#0891B2", "#0E7490", "#164E63", "#ECFEFF"),
    "default": ("#0EA5E9", "#0284C7", "#075985", "#F0F9FF"),
    "film": ("#4C1D95", "#5B21B6", "#1E1B4B", "#F5F3FF"),
    "gym": ("#16A34A", "#15803D", "#14532D", "#F0FDF4"),
    "mma": ("#DC2626", "#B91C1C", "#7F1D1D", "#FEF2F2"),
    "family": ("#DB2777", "#BE185D", "#9D174D", "#FDF2F8"),
    "vocal": ("#D97706", "#B45309", "#78350F", "#FFFBEB"),
    "eco": ("#10B981", "#059669", "#065F46", "#ECFDF5"),
    "media": ("#2563EB", "#1D4ED8", "#1E3A8A", "#EFF6FF"),
    "music": ("#F59E0B", "#D97706", "#92400E", "#FFFBEB"),
    "photo": ("#64748B", "#475569", "#1E293B", "#F8FAFC"),
    "sport": ("#22C55E", "#16A34A", "#166534", "#F0FDF4"),
    "archive": ("#78716C", "#57534E", "#292524", "#FAFAF9"),
}

COVERS = {
    "news-default": ("news", "wave"),
    "news-portal": ("news", "portal"),
    "news-clubs": ("clubs", "people"),
    "news-extra-1": ("events", "spark"),
    "news-extra-2": ("projects", "mountain"),
    "project-eco": ("eco", "leaf"),
    "project-media": ("media", "lens"),
    "project-campus": ("projects", "building"),
    "project-kvn": ("events", "stage"),
    "project-volunteers": ("dobro", "hands"),
    "club-archive": ("archive", "stack"),
    "club-debate": ("selfgov", "debate"),
    "club-board": ("clubs", "board"),
    "club-photo": ("photo", "lens"),
    "club-music": ("music", "note"),
    "space-sport": ("sport", "ball"),
    "space-pavilion": ("spaces", "pavilion"),
    "space-house": ("spaces", "house"),
    "space-hall": ("spaces", "hall"),
    "space-cowork": ("spaces", "desk"),
    "grant-media": ("media", "grant"),
    "grant-initiatives": ("grants", "seed"),
    "grant-archive": ("archive", "grant"),
    "dobro-hq": ("dobro", "heart"),
    "dobro-clean": ("eco", "broom"),
    "dobro-events": ("dobro", "spark"),
    "selfgov-school": ("selfgov", "school"),
    "selfgov-council": ("selfgov", "council"),
    "selfgov-parliament": ("selfgov", "parliament"),
    "page-documents": ("documents", "doc"),
    "page-grants": ("grants", "grant"),
    "page-dobro": ("dobro", "heart"),
    "page-self-gov": ("selfgov", "council"),
    "page-about": ("about", "mark"),
}

TEMPLATES = {
    "section-news": ("news", "wave"),
    "section-events": ("events", "spark"),
    "section-projects": ("projects", "mountain"),
    "section-clubs": ("clubs", "people"),
    "section-spaces": ("spaces", "pavilion"),
    "section-documents": ("documents", "doc"),
    "section-about": ("about", "mark"),
    "section-grants": ("grants", "seed"),
    "section-dobro": ("dobro", "heart"),
    "section-selfgov": ("selfgov", "council"),
    "section-contacts": ("about", "pin"),
    "section-default": ("default", "wave"),
    "afisha-gym": ("gym", "ball"),
    "afisha-family": ("family", "people"),
    "afisha-clubs": ("clubs", "people"),
    "afisha-mma": ("mma", "fist"),
    "afisha-film": ("film", "lens"),
    "afisha-vocal": ("vocal", "note"),
}

# Exact upload filenames currently on VPS (basename without .svg)
UPLOAD_FILES = [
    "afisha-clubs",
    "afisha-family",
    "afisha-film",
    "afisha-gym",
    "afisha-mma",
    "afisha-vocal",
    "club-archive",
    "club-board",
    "club-debate",
    "club-music",
    "club-photo",
    "dobro-clean",
    "dobro-events",
    "dobro-hq",
    "grant-archive",
    "grant-initiatives",
    "grant-media",
    "news-clubs",
    "news-default",
    "news-extra-1",
    "news-extra-2",
    "news-portal",
    "page-about",
    "page-dobro",
    "page-documents",
    "page-grants",
    "page-self-gov",
    "project-campus",
    "project-day_porulit",
    "project-dobrovoltsy_sochi",
    "project-eco",
    "project-festival_ekstremalnyh_vidov_sporta",
    "project-festival_molodyh_semey",
    "project-forumnaya_kampaniya_sochinyay_smysly",
    "project-kvn",
    "project-lager_gory_vozmozhnostey",
    "project-letnie_ploschadki",
    "project-letniy_kampus_2025",
    "project-mediaforum",
    "project-media",
    "project-miss_studenchestvo",
    "project-molodezhnyy_forum_sochi",
    "project-molodezhnyy_patrul",
    "project-protvorchestvo",
    "project-shkola_media",
    "project-sochinskaya_liga_kvn",
    "project-student_goda",
    "project-trudoustroystvo_nesovershennoletnih",
    "project-volunteers",
    "project-vorkaut_festival",
    "selfgov-council",
    "selfgov-parliament",
    "selfgov-school",
    "space-cowork",
    "space-hall",
    "space-house",
    "space-pavilion",
    "space-sport",
]

KEYWORD_MAP = [
    (r"afisha-film|film", ("film", "lens")),
    (r"afisha-mma|mma", ("mma", "fist")),
    (r"afisha-family|semey|family", ("family", "people")),
    (r"afisha-gym|vorkaut|gym", ("gym", "ball")),
    (r"afisha-vocal|vocal", ("vocal", "note")),
    (r"afisha-clubs", ("clubs", "people")),
    (r"kvn", ("events", "stage")),
    (r"media", ("media", "lens")),
    (r"eco|lager|gory", ("eco", "leaf")),
    (r"campus|kampus|ploschad", ("projects", "building")),
    (r"letni", ("events", "spark")),
    (r"festival|ekstremal", ("sport", "mountain")),
    (r"student|miss", ("events", "spark")),
    (r"forum|smysly", ("selfgov", "debate")),
    (r"patrul", ("selfgov", "council")),
    (r"porulit", ("sport", "ball")),
    (r"dobrovolt|volunteer", ("dobro", "hands")),
    (r"protvorchestvo", ("projects", "spark")),
    (r"trudoustroystvo", ("projects", "desk")),
    (r"news-clubs|club-", ("clubs", "people")),
    (r"news-", ("news", "wave")),
    (r"space-", ("spaces", "pavilion")),
    (r"grant-", ("grants", "seed")),
    (r"dobro-", ("dobro", "heart")),
    (r"selfgov-|self-gov", ("selfgov", "council")),
    (r"page-documents|documents", ("documents", "doc")),
    (r"page-about|about", ("about", "mark")),
    (r"page-grants", ("grants", "grant")),
    (r"page-dobro", ("dobro", "heart")),
    (r"photo", ("photo", "lens")),
    (r"music", ("music", "note")),
    (r"archive", ("archive", "stack")),
    (r"debate|board", ("selfgov", "debate")),
]


def hseed(name: str) -> int:
    return int(hashlib.sha256(name.encode()).hexdigest()[:8], 16)


def resolve_theme(name: str) -> tuple[str, str]:
    if name in COVERS:
        return COVERS[name]
    if name in TEMPLATES:
        return TEMPLATES[name]
    for pattern, theme in KEYWORD_MAP:
        if re.search(pattern, name, re.I):
            return theme
    return ("default", "wave")


def motif_paths(kind: str, s: int) -> str:
    ox = 920 + (s % 40)
    oy = 140 + (s % 30)
    sun_x = 180 + (s % 60)
    if kind in ("wave", "default", "portal"):
        return f'''
  <path d="M0 520 C160 460, 320 580, 480 520 S800 440, 1200 520 L1200 800 L0 800 Z" fill="#000" opacity="0.12"/>
  <path d="M0 580 C200 520, 400 640, 600 580 S1000 520, 1200 600 L1200 800 L0 800 Z" fill="#fff" opacity="0.08"/>
  <path d="M0 660 C240 620, 480 700, 720 650 S1000 640, 1200 680 L1200 800 L0 800 Z" fill="#000" opacity="0.10"/>
  <circle cx="{sun_x}" cy="150" r="70" fill="#fff" opacity="0.14"/>
  <circle cx="{sun_x}" cy="150" r="38" fill="#fff" opacity="0.10"/>
'''
    if kind == "mountain":
        return f'''
  <path d="M0 800 L0 500 L200 330 L360 470 L540 250 L760 480 L940 340 L1200 500 L1200 800 Z" fill="#000" opacity="0.18"/>
  <path d="M540 250 L600 340 L480 340 Z" fill="#fff" opacity="0.22"/>
  <circle cx="{ox}" cy="110" r="52" fill="#fff" opacity="0.16"/>
  <path d="M0 680 C300 640, 600 720, 900 660 S1200 680, 1200 680 L1200 800 L0 800 Z" fill="#fff" opacity="0.06"/>
'''
    if kind in ("spark", "stage"):
        return f'''
  <path d="M0 560 C250 500, 450 620, 700 540 S1050 500, 1200 580 L1200 800 L0 800 Z" fill="#000" opacity="0.14"/>
  <polygon points="{ox-36},{oy+10} {ox},{oy-66} {ox+36},{oy+10} {ox},{oy+24}" fill="#fff" opacity="0.18"/>
  <circle cx="200" cy="150" r="78" fill="#fff" opacity="0.08"/>
  <circle cx="260" cy="190" r="24" fill="#fff" opacity="0.12"/>
  <circle cx="150" cy="210" r="16" fill="#fff" opacity="0.10"/>
'''
    if kind in ("leaf", "eco", "broom", "seed"):
        return f'''
  <ellipse cx="{ox}" cy="{oy}" rx="72" ry="118" fill="#fff" opacity="0.12" transform="rotate(-28 {ox} {oy})"/>
  <ellipse cx="{ox-90}" cy="{oy+40}" rx="44" ry="78" fill="#fff" opacity="0.08" transform="rotate(18 {ox-90} {oy+40})"/>
  <path d="M{ox} {oy-96} Q{ox+42} {oy} {ox} {oy+96}" stroke="#fff" stroke-width="4" fill="none" opacity="0.28"/>
  <path d="M0 600 C300 540, 600 680, 900 590 S1200 610, 1200 610 L1200 800 L0 800 Z" fill="#000" opacity="0.12"/>
'''
    if kind in ("lens", "photo", "film"):
        return f'''
  <circle cx="{ox}" cy="{oy+50}" r="100" fill="#fff" opacity="0.08"/>
  <circle cx="{ox}" cy="{oy+50}" r="68" fill="none" stroke="#fff" stroke-width="12" opacity="0.22"/>
  <circle cx="{ox}" cy="{oy+50}" r="28" fill="#fff" opacity="0.26"/>
  <rect x="0" y="0" width="1200" height="70" fill="#000" opacity="0.18"/>
  <rect x="0" y="730" width="1200" height="70" fill="#000" opacity="0.18"/>
'''
    if kind in ("people", "hands", "heart"):
        return f'''
  <circle cx="960" cy="170" r="46" fill="#fff" opacity="0.16"/>
  <circle cx="1035" cy="170" r="46" fill="#fff" opacity="0.12"/>
  <circle cx="885" cy="190" r="34" fill="#fff" opacity="0.10"/>
  <path d="M910 250 Q1000 320 1090 250" fill="none" stroke="#fff" stroke-width="10" opacity="0.18"/>
  <path d="M0 590 C280 530, 520 670, 780 580 S1100 550, 1200 610 L1200 800 L0 800 Z" fill="#000" opacity="0.14"/>
'''
    if kind in ("building", "house", "pavilion", "hall", "desk", "school"):
        return f'''
  <rect x="840" y="200" width="240" height="300" rx="20" fill="#fff" opacity="0.11"/>
  <rect x="880" y="260" width="54" height="54" rx="8" fill="#fff" opacity="0.18"/>
  <rect x="980" y="260" width="54" height="54" rx="8" fill="#fff" opacity="0.18"/>
  <rect x="880" y="350" width="54" height="54" rx="8" fill="#fff" opacity="0.14"/>
  <rect x="980" y="350" width="54" height="54" rx="8" fill="#fff" opacity="0.14"/>
  <path d="M820 200 L960 120 L1100 200" fill="#fff" opacity="0.14"/>
  <path d="M0 640 L1200 560 L1200 800 L0 800 Z" fill="#000" opacity="0.12"/>
'''
    if kind == "note":
        return f'''
  <circle cx="{ox}" cy="{oy+80}" r="36" fill="#fff" opacity="0.18"/>
  <circle cx="{ox-90}" cy="{oy+110}" r="28" fill="#fff" opacity="0.14"/>
  <path d="M{ox+34} {oy+80} L{ox+34} {oy-40} L{ox-56} {oy-10} L{ox-56} {oy+110}" fill="none" stroke="#fff" stroke-width="10" opacity="0.2"/>
  <path d="M0 600 C280 540, 560 680, 840 590 S1200 600, 1200 600 L1200 800 L0 800 Z" fill="#000" opacity="0.12"/>
'''
    if kind == "ball":
        return f'''
  <circle cx="{ox}" cy="{oy+40}" r="88" fill="#fff" opacity="0.12"/>
  <ellipse cx="{ox}" cy="{oy+40}" rx="88" ry="28" fill="none" stroke="#fff" stroke-width="6" opacity="0.2"/>
  <path d="M{ox} {oy-48} L{ox} {oy+128}" stroke="#fff" stroke-width="6" opacity="0.18"/>
  <path d="M0 620 C300 560, 600 700, 900 610 S1200 620, 1200 620 L1200 800 L0 800 Z" fill="#000" opacity="0.12"/>
'''
    if kind == "fist":
        return f'''
  <rect x="{ox-70}" y="{oy}" width="140" height="110" rx="36" fill="#fff" opacity="0.14"/>
  <circle cx="{ox-40}" cy="{oy-10}" r="22" fill="#fff" opacity="0.16"/>
  <circle cx="{ox}" cy="{oy-18}" r="22" fill="#fff" opacity="0.16"/>
  <circle cx="{ox+40}" cy="{oy-10}" r="22" fill="#fff" opacity="0.16"/>
  <path d="M0 600 C280 540, 560 680, 840 590 S1200 600, 1200 600 L1200 800 L0 800 Z" fill="#000" opacity="0.14"/>
'''
    if kind in ("council", "parliament", "debate", "board", "mark", "grant", "doc", "stack", "pin"):
        return f'''
  <circle cx="{ox}" cy="{oy}" r="70" fill="#fff" opacity="0.12"/>
  <circle cx="{ox-130}" cy="{oy+70}" r="38" fill="#fff" opacity="0.08"/>
  <path d="M0 540 C220 480, 480 620, 720 540 S1040 480, 1200 560 L1200 800 L0 800 Z" fill="#000" opacity="0.14"/>
  <rect x="72" y="72" width="160" height="14" rx="7" fill="#fff" opacity="0.22"/>
  <rect x="72" y="102" width="100" height="10" rx="5" fill="#fff" opacity="0.14"/>
  <rect x="72" y="128" width="128" height="10" rx="5" fill="#fff" opacity="0.10"/>
'''
    return motif_paths("wave", s)


def svg_for(name: str, palette_key: str, motif: str) -> str:
    c0, c1, c2, _ = PALETTES.get(palette_key, PALETTES["default"])
    s = hseed(name)
    rot = 18 + (s % 40)
    accent = "#FBBF24" if palette_key in ("events", "vocal", "music") else "#67E8F9"
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800" role="img" aria-hidden="true">
  <defs>
    <linearGradient id="g-{s}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="{c0}"/>
      <stop offset="45%" stop-color="{c1}"/>
      <stop offset="100%" stop-color="{c2}"/>
    </linearGradient>
    <radialGradient id="r-{s}" cx="18%" cy="14%" r="72%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.32"/>
      <stop offset="50%" stop-color="#ffffff" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="shine-{s}" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#fff" stop-opacity="0"/>
      <stop offset="50%" stop-color="#fff" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#fff" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="vignette-{s}" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="55%" stop-color="#000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0.28"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="800" fill="url(#g-{s})"/>
  <rect width="1200" height="800" fill="url(#r-{s})"/>
  <rect x="-120" y="0" width="420" height="800" fill="url(#shine-{s})" opacity="0.95" transform="skewX(-14) rotate({rot % 7})"/>
  <circle cx="1080" cy="120" r="160" fill="{accent}" opacity="0.10"/>
  {motif_paths(motif, s)}
  <rect width="1200" height="800" fill="url(#vignette-{s})"/>
</svg>
'''


def write(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def main() -> None:
    for name, (pal, motif) in COVERS.items():
        write(OUT_COVERS / f"{name}.svg", svg_for(name, pal, motif))
    for name, (pal, motif) in TEMPLATES.items():
        write(OUT_TEMPLATES / f"{name}.svg", svg_for(name, pal, motif))
    write(OUT / "afisha-week.svg", svg_for("afisha-week", "events", "spark"))
    for name in UPLOAD_FILES:
        pal, motif = resolve_theme(name)
        write(OUT_UPLOADS / f"{name}.svg", svg_for(f"upload-{name}", pal, motif))
    print("covers", len(list(OUT_COVERS.glob("*.svg"))))
    print("templates", len(list(OUT_TEMPLATES.glob("*.svg"))))
    print("uploads", len(list(OUT_UPLOADS.glob("*.svg"))))


if __name__ == "__main__":
    main()
