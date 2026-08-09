'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  beginGameSession,
  getLocalBest,
  reportGameScore,
  waitForPlaySession,
  type GameSessionCreds,
} from '@/lib/game-scores-client';
import {
  formatDuration,
  getLocalBestTime,
  setLocalBestTime,
  FIFTEEN_DIFFICULTIES,
  type FifteenDifficulty,
} from '@/lib/game-meta';
import GameShell from '@/components/games/GameShell';
import GameHallOfFame from '@/components/games/GameHallOfFame';
import { sfx } from '@/lib/game-sfx';

type Board = number[]; // 0 = empty

function sizeOf(diff: FifteenDifficulty) {
  return diff === 'easy' ? 3 : diff === 'hard' ? 5 : 4;
}

function goal(n: number): Board {
  const b = Array.from({ length: n * n }, (_, i) => (i + 1) % (n * n));
  return b;
}

function isSolved(board: Board, n: number) {
  const g = goal(n);
  return board.every((v, i) => v === g[i]);
}

/** Inversions parity solvability for sliding puzzles */
function isSolvable(board: Board, n: number): boolean {
  const flat = board.filter((x) => x !== 0);
  let inv = 0;
  for (let i = 0; i < flat.length; i++) {
    for (let j = i + 1; j < flat.length; j++) {
      if (flat[i] > flat[j]) inv++;
    }
  }
  if (n % 2 === 1) return inv % 2 === 0;
  const emptyRowFromBottom = n - Math.floor(board.indexOf(0) / n);
  if (emptyRowFromBottom % 2 === 0) return inv % 2 === 1;
  return inv % 2 === 0;
}

function shuffleBoard(n: number): Board {
  for (let attempt = 0; attempt < 80; attempt++) {
    const b = goal(n);
    for (let i = b.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [b[i], b[j]] = [b[j], b[i]];
    }
    if (!isSolved(b, n) && isSolvable(b, n)) return b;
  }
  // fallback: swap two tiles from goal carefully
  const b = goal(n);
  [b[0], b[1]] = [b[1], b[0]];
  return b;
}

function neighbors(idx: number, n: number): number[] {
  const r = Math.floor(idx / n);
  const c = idx % n;
  const out: number[] = [];
  if (r > 0) out.push(idx - n);
  if (r < n - 1) out.push(idx + n);
  if (c > 0) out.push(idx - 1);
  if (c < n - 1) out.push(idx + 1);
  return out;
}

function scoreFor(diff: FifteenDifficulty, moves: number, durationMs: number) {
  const base = diff === 'easy' ? 900 : diff === 'hard' ? 2200 : 1400;
  const movePen = moves * (diff === 'hard' ? 3 : 4);
  const timePen = Math.floor(durationMs / 1000) * 2;
  return Math.max(50, base - movePen - timePen);
}

export default function FifteenPuzzleGame() {
  const [difficulty, setDifficulty] = useState<FifteenDifficulty>('medium');
  const [board, setBoard] = useState<Board>(() => shuffleBoard(4));
  const [running, setRunning] = useState(false);
  const [over, setOver] = useState(false);
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [bestTime, setBestTime] = useState(0);
  const [newRecord, setNewRecord] = useState(false);
  const [startedAt, setStartedAt] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [hofKey, setHofKey] = useState(0);

  const n = sizeOf(difficulty);
  const playSessionRef = useRef<GameSessionCreds | null>(null);
  const startedAtRef = useRef(0);
  const movesRef = useRef(0);
  const difficultyRef = useRef(difficulty);
  const finishingRef = useRef(false);

  useEffect(() => {
    difficultyRef.current = difficulty;
    setBest(getLocalBest('fifteen'));
    setBestTime(getLocalBestTime('fifteen', difficulty));
  }, [difficulty]);

  useEffect(() => {
    if (!running || over) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAtRef.current), 200);
    return () => window.clearInterval(id);
  }, [running, over]);

  const finish = useCallback(async (finalScore: number, durationMs: number, moveCount: number) => {
    if (finishingRef.current) return;
    finishingRef.current = true;
    setOver(true);
    setRunning(false);
    const prev = getLocalBest('fifteen');
    const isNew = finalScore > prev && finalScore > 0;
    setNewRecord(isNew);
    setBest((b) => Math.max(b, finalScore));
    setLocalBestTime('fifteen', durationMs, difficultyRef.current);
    setBestTime((t) => (t > 0 ? Math.min(t, durationMs) : durationMs));
    if (isNew) sfx.win();
    else sfx.bonus();
    const creds = await waitForPlaySession(() => playSessionRef.current);
    playSessionRef.current = null;
    await reportGameScore({
      game: 'fifteen',
      score: finalScore,
      sessionId: creds?.sessionId,
      token: creds?.token,
      meta: {
        won: true,
        difficulty: difficultyRef.current,
        durationMs,
        moves: moveCount,
        bestTimes: { [difficultyRef.current]: durationMs },
      },
    });
    setHofKey((k) => k + 1);
    finishingRef.current = false;
  }, []);

  const start = useCallback(() => {
    finishingRef.current = false;
    const nextN = sizeOf(difficultyRef.current);
    const b = shuffleBoard(nextN);
    setBoard(b);
    setMoves(0);
    movesRef.current = 0;
    setScore(0);
    setOver(false);
    setNewRecord(false);
    setElapsed(0);
    const now = Date.now();
    startedAtRef.current = now;
    setStartedAt(now);
    setRunning(true);
    sfx.tap();
    playSessionRef.current = null;
    void beginGameSession('fifteen').then((creds) => {
      playSessionRef.current = creds;
    });
  }, []);

  const tryMove = (idx: number) => {
    if (!running || over) return;
    const empty = board.indexOf(0);
    if (!neighbors(empty, n).includes(idx)) return;
    const next = [...board];
    [next[empty], next[idx]] = [next[idx], next[empty]];
    setBoard(next);
    const m = movesRef.current + 1;
    movesRef.current = m;
    setMoves(m);
    sfx.tap();
    if (isSolved(next, n)) {
      const durationMs = Date.now() - startedAtRef.current;
      const sc = scoreFor(difficultyRef.current, m, durationMs);
      setScore(sc);
      void finish(sc, durationMs, m);
    }
  };

  const hint = useMemo(() => {
    const meta = FIFTEEN_DIFFICULTIES.find((d) => d.id === difficulty)!;
    return `${meta.label}: ${meta.hint}`;
  }, [difficulty]);

  return (
    <GameShell
      title="Пятнашки"
      accent="#06b6d4"
      score={score}
      best={best}
      over={over}
      running={running}
      onStart={start}
      hint={hint}
      status={running ? `Ходы: ${moves}` : over ? 'Собрано!' : 'Сложность → Играть'}
      elapsedLabel={running || over ? formatDuration(elapsed || (startedAt ? Date.now() - startedAt : 0)) : undefined}
      bestTimeLabel={bestTime > 0 ? formatDuration(bestTime) : undefined}
      newRecord={newRecord}
      viewId="game:fifteen"
      extra={
        <div className="game-diff-row" role="group" aria-label="Сложность пятнашек">
          {FIFTEEN_DIFFICULTIES.map((d) => (
            <button
              key={d.id}
              type="button"
              className={`game-diff-btn${difficulty === d.id ? ' is-active' : ''}`}
              disabled={running && !over}
              onClick={() => {
                if (running && !over) return;
                setDifficulty(d.id);
                setBoard(shuffleBoard(sizeOf(d.id)));
                setOver(false);
                setMoves(0);
                setScore(0);
              }}
            >
              {d.label}
            </button>
          ))}
        </div>
      }
      footer={<GameHallOfFame key={hofKey} game="fifteen" compact topN={5} difficulty={difficulty} />}
      pcHint="Клик / тап по плитке рядом с пустой"
    >
      <div
        className={`fifteen-board fifteen-board--${n}`}
        style={{ ['--fifteen-n' as string]: String(n) }}
        role="grid"
        aria-label={`Поле ${n}×${n}`}
      >
        {board.map((val, idx) => (
          <button
            key={`${n}-${idx}`}
            type="button"
            className={`fifteen-tile${val === 0 ? ' is-empty' : ''}`}
            disabled={!running || over || val === 0}
            onClick={() => tryMove(idx)}
            aria-label={val === 0 ? 'Пусто' : `Плитка ${val}`}
          >
            {val === 0 ? '' : val}
          </button>
        ))}
      </div>
    </GameShell>
  );
}
