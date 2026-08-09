"use client";

import Link from "next/link";
import { useVoiceCopy } from "@/components/VoiceProvider";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  BarChart3,
  Brain,
  CircleDot,
  Crown,
  Gamepad2,
  Grid3x3,
  Layers,
  Puzzle,
  RectangleHorizontal,
  Trophy,
  type LucideIcon,
} from "lucide-react";
import { GAMES, GAME_IDS, isGameId, type GameId } from "@/lib/games";
import {
  flushGameScoreQueue,
  getAllLocalPlayCounts,
  getLocalBest,
} from "@/lib/game-scores-client";
import { formatDuration, getLocalBestTime, type CheckersDifficulty } from "@/lib/game-meta";
import GameHallOfFame from "@/components/games/GameHallOfFame";

const META: Record<
  GameId,
  { desc: string; accent: string; badge: string; tips: string; Icon: LucideIcon }
> = {
  snake: {
    desc: "Свайп, комбо, таблица почёта.",
    accent: "#22c55e",
    badge: "аркада",
    tips: "Тап — старт",
    Icon: CircleDot,
  },
  tetris: {
    desc: "Свайпы и превью фигуры.",
    accent: "#3b82f6",
    badge: "пазл",
    tips: "Тап — поворот",
    Icon: Layers,
  },
  checkers: {
    desc: "Три сложности, рекорд на время.",
    accent: "#f59e0b",
    badge: "дуэль",
    tips: "Выбери сложность",
    Icon: Puzzle,
  },
  breakout: {
    desc: "Уровни и жизни. ПК: мышь.",
    accent: "#ef4444",
    badge: "аркада",
    tips: "Тап — старт",
    Icon: RectangleHorizontal,
  },
  memory: {
    desc: "Пары, комбо, бонус за скорость.",
    accent: "#a855f7",
    badge: "логика",
    tips: "Тап по карточкам",
    Icon: Brain,
  },
  fifteen: {
    desc: "3×3 / 4×4 / 5×5 — собери поле на время.",
    accent: "#06b6d4",
    badge: "пазл",
    tips: "Выбери сложность",
    Icon: Grid3x3,
  },
};

const LIST = Object.values(GAMES);
type HubTab = "games" | "leaders" | "stats" | "analytics";

const TABS: { id: HubTab; label: string; icon: typeof Gamepad2 }[] = [
  { id: "games", label: "Игры", icon: Gamepad2 },
  { id: "leaders", label: "Рейтинг", icon: Trophy },
  { id: "stats", label: "Статистика", icon: Crown },
  { id: "analytics", label: "Аналитика", icon: BarChart3 },
];

function parseTab(raw: string | null): HubTab {
  if (raw === "leaders" || raw === "rating") return "leaders";
  if (raw === "stats" || raw === "statistics") return "stats";
  if (raw === "analytics") return "analytics";
  return "games";
}

type TopMap = Partial<Record<GameId, number>>;

function GamesHubInner() {
  const gamesTitle = useVoiceCopy("game.hub.title", "Офлайн-игры");
  const gamesIntro = useVoiceCopy("game.hub.intro");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tab = parseTab(searchParams.get("tab"));
  const focusGameRaw = searchParams.get("game") || "";
  const focusGame = isGameId(focusGameRaw) ? focusGameRaw : null;
  const focusDiff = (searchParams.get("difficulty") || "medium") as CheckersDifficulty;

  const [scores, setScores] = useState<Partial<Record<GameId, number>>>({});
  const [times, setTimes] = useState<Partial<Record<GameId, number>>>({});
  const [plays, setPlays] = useState<Record<string, number>>({});
  const [tops, setTops] = useState<TopMap>({});

  const setTab = useCallback(
    (next: HubTab) => {
      const q = new URLSearchParams(searchParams.toString());
      if (next === "games") q.delete("tab");
      else q.set("tab", next);
      const qs = q.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams]
  );

  useEffect(() => {
    const local: Partial<Record<GameId, number>> = {};
    const localTimes: Partial<Record<GameId, number>> = {};
    for (const g of LIST) {
      const b = getLocalBest(g.id);
      if (b > 0) local[g.id] = b;
      const t = getLocalBestTime(g.id);
      if (t > 0) localTimes[g.id] = t;
    }
    setScores(local);
    setTimes(localTimes);
    setPlays(getAllLocalPlayCounts());

    void (async () => {
      await flushGameScoreQueue();
      try {
        const res = await fetch("/api/user/games", { credentials: "include" });
        if (res.ok) {
          const data = (await res.json()) as { scores?: { game: string; score: number }[] };
          const next = { ...local };
          for (const row of data.scores ?? []) {
            const id = row.game as GameId;
            if (id in GAMES) next[id] = Math.max(next[id] ?? 0, row.score);
          }
          setScores(next);
        }
      } catch {
        /* offline */
      }

      const nextTops: TopMap = {};
      await Promise.all(
        GAME_IDS.map(async (id) => {
          try {
            const r = await fetch(`/api/games/leaderboard?game=${id}&limit=1`);
            if (!r.ok) return;
            const data = await r.json();
            const top = data?.leaders?.[0];
            if (id === "checkers" && top?.durationMs) nextTops[id] = top.durationMs;
            else if (top?.score != null) nextTops[id] = top.score;
          } catch {
            /* ignore */
          }
        })
      );
      setTops(nextTops);
    })();
  }, []);

  const playedCount = useMemo(
    () => GAME_IDS.filter((id) => (scores[id] ?? 0) > 0 || (times[id] ?? 0) > 0).length,
    [scores, times]
  );
  const totalPlays = useMemo(
    () => GAME_IDS.reduce((sum, id) => sum + (plays[id] ?? 0), 0),
    [plays]
  );
  const favorite = useMemo(() => {
    let bestId: GameId | null = null;
    let bestN = 0;
    for (const id of GAME_IDS) {
      const n = plays[id] ?? 0;
      if (n > bestN) {
        bestN = n;
        bestId = id;
      }
    }
    return bestId;
  }, [plays]);

  return (
    <div className="games-hub">
      <header className="games-hub__head">
        <h1>{gamesTitle}</h1>
        <p className="games-hub__intro">{gamesIntro}</p>
      </header>

      <div className="games-hub__tabs" role="tablist" aria-label="Разделы игр">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`games-hub__tab${tab === id ? " is-active" : ""}`}
            onClick={() => setTab(id)}
          >
            <Icon size={14} aria-hidden />
            <span>{label}</span>
          </button>
        ))}
      </div>

      {tab === "games" ? (
        <div className="games-hub__grid">
          {LIST.map((g) => {
            const m = META[g.id];
            const Icon = m.Icon;
            return (
              <Link
                key={g.id}
                href={g.path}
                className="games-hub__card"
                style={{ ["--card-accent" as string]: m.accent }}
                prefetch
              >
                <span className="games-hub__icon" aria-hidden>
                  <Icon size={22} strokeWidth={2.25} />
                </span>
                <span className="games-hub__card-body">
                  <span className="games-hub__badge">{m.badge}</span>
                  <span className="games-hub__card-title">{g.title}</span>
                  <span className="games-hub__card-desc">{m.desc}</span>
                  {(scores[g.id] ?? 0) > 0 || (times[g.id] ?? 0) > 0 ? (
                    <span className="games-hub__score">
                      {g.id === "checkers" && (times[g.id] ?? 0) > 0
                        ? `Рекорд: ${formatDuration(times[g.id]!)}`
                        : `Рекорд: ${scores[g.id]}`}
                    </span>
                  ) : (
                    <span className="games-hub__score is-new">Без рекорда</span>
                  )}
                </span>
                <span className="games-hub__play">Играть</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {tab === "leaders" ? (
        <section className="games-hub__leaders" aria-label="Таблицы почёта">
          {focusGame ? (
            <div
              className="games-hub__leader-focus"
              style={{ ["--game-accent" as string]: META[focusGame].accent }}
            >
              <div className="games-hub__leader-head">
                <strong>
                  {GAMES[focusGame].title} — топ 100
                </strong>
                <div className="games-hub__leader-head-links">
                  <Link href="/games?tab=leaders" prefetch>
                    Все игры
                  </Link>
                  <Link href={GAMES[focusGame].path} prefetch>
                    Играть →
                  </Link>
                </div>
              </div>
              <GameHallOfFame
                game={focusGame}
                topN={100}
                difficulty={focusDiff}
              />
            </div>
          ) : (
            <div className="games-hub__leaders-grid">
              {LIST.map((g) => (
                <div
                  key={g.id}
                  className="games-hub__leader-card"
                  style={{ ["--game-accent" as string]: META[g.id].accent }}
                >
                  <div className="games-hub__leader-head">
                    <strong>{g.title}</strong>
                    <div className="games-hub__leader-head-links">
                      <Link href={`/games?tab=leaders&game=${g.id}`} prefetch>
                        Топ 100
                      </Link>
                      <Link href={g.path} prefetch>
                        Играть →
                      </Link>
                    </div>
                  </div>
                  <GameHallOfFame game={g.id} compact topN={3} />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === "stats" ? (
        <section className="games-hub__panel" aria-label="Моя статистика">
          <div className="games-hub__kpis">
            <div className="games-hub__kpi">
              <span>Игр с рекордом</span>
              <strong>
                {playedCount}/{GAME_IDS.length}
              </strong>
            </div>
            <div className="games-hub__kpi">
              <span>Партий на устройстве</span>
              <strong>{totalPlays}</strong>
            </div>
            <div className="games-hub__kpi">
              <span>Любимая</span>
              <strong>{favorite ? GAMES[favorite].title : "—"}</strong>
            </div>
          </div>
          <ul className="games-hub__stat-list">
            {LIST.map((g) => {
              const s = scores[g.id] ?? 0;
              const t = times[g.id] ?? 0;
              const p = plays[g.id] ?? 0;
              return (
                <li key={g.id} style={{ ["--card-accent" as string]: META[g.id].accent }}>
                  <div className="games-hub__stat-main">
                    <span className="games-hub__stat-dot" aria-hidden />
                    <div>
                      <strong>{g.title}</strong>
                      <em>{p > 0 ? `${p} парт.` : "ещё не играли"}</em>
                    </div>
                  </div>
                  <div className="games-hub__stat-vals">
                    <span>
                      {g.id === "checkers" && t > 0 ? formatDuration(t) : s > 0 ? s : "—"}
                    </span>
                    <Link href={g.path} prefetch>
                      Играть
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {tab === "analytics" ? (
        <section className="games-hub__panel" aria-label="Аналитика">
          <p className="games-hub__leaders-intro">
            Сравнение ваших рекордов с топом сайта и активность по играм.
          </p>
          <ul className="games-hub__analytics">
            {LIST.map((g) => {
              const mine = g.id === "checkers" ? times[g.id] ?? 0 : scores[g.id] ?? 0;
              const top = tops[g.id] ?? 0;
              const p = plays[g.id] ?? 0;
              const maxPlays = Math.max(1, ...GAME_IDS.map((id) => plays[id] ?? 0));
              const playPct = Math.round((p / maxPlays) * 100);
              let vsTop = "—";
              let pct = 0;
              if (g.id === "checkers") {
                if (mine > 0 && top > 0) {
                  pct = Math.min(100, Math.round((top / mine) * 100));
                  vsTop =
                    mine <= top ? "лидер / на уровне топа" : `${Math.round(mine / top)}× дольше топа`;
                } else if (mine > 0) vsTop = "есть рекорд";
              } else if (mine > 0 && top > 0) {
                pct = Math.min(100, Math.round((mine / top) * 100));
                vsTop = `${pct}% от топа (${top})`;
              } else if (mine > 0) vsTop = "есть рекорд";
              return (
                <li key={g.id} style={{ ["--card-accent" as string]: META[g.id].accent }}>
                  <div className="games-hub__an-head">
                    <strong>{g.title}</strong>
                    <Link href={g.path} prefetch>
                      Играть →
                    </Link>
                  </div>
                  <div className="games-hub__an-row">
                    <span>Ваш рекорд</span>
                    <strong>
                      {g.id === "checkers" && mine > 0
                        ? formatDuration(mine)
                        : mine > 0
                          ? mine
                          : "—"}
                    </strong>
                  </div>
                  <div className="games-hub__an-row">
                    <span>К топу</span>
                    <strong>{vsTop}</strong>
                  </div>
                  <div className="games-hub__bar" aria-hidden>
                    <i
                      style={{
                        width: `${g.id === "checkers" ? (mine > 0 && top > 0 ? pct : 0) : pct}%`,
                      }}
                    />
                  </div>
                  <div className="games-hub__an-row">
                    <span>Активность</span>
                    <strong>{p} парт.</strong>
                  </div>
                  <div className="games-hub__bar is-play" aria-hidden>
                    <i style={{ width: `${playPct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

export default function GamesHubPage() {
  return (
    <Suspense
      fallback={
        <div className="games-hub">
          <header className="games-hub__head">
            <h1>Офлайн-игры</h1>
            <p className="games-hub__intro">Загрузка…</p>
          </header>
        </div>
      }
    >
      <GamesHubInner />
    </Suspense>
  );
}
