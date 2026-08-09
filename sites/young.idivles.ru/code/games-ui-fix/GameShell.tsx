'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Maximize2, Minimize2, Pause, Play, Volume2, VolumeX, X } from 'lucide-react';
import ViewBeacon from '@/components/ViewBeacon';
import { isGamesMuted, setGamesMuted, sfx } from '@/lib/game-sfx';

type Props = {
  title: string;
  accent?: string;
  score: number;
  best: number;
  over: boolean;
  running: boolean;
  onStart: () => void;
  onPause?: () => void;
  paused?: boolean;
  hint?: string;
  children: React.ReactNode;
  /** Touch controls dock — desktop fallback; hidden on phones via CSS */
  controls?: React.ReactNode;
  status?: string;
  level?: number;
  combo?: number;
  newRecord?: boolean;
  extra?: React.ReactNode;
  bestTimeLabel?: string;
  elapsedLabel?: string;
  className?: string;
  /** Leaderboard — always mounted (Top 3) to avoid layout jump */
  footer?: React.ReactNode;
  /** Desktop keyboard hint under HUD */
  pcHint?: string;
  /** Reserve level/combo slots so the toolbar does not jump */
  showLevelSlot?: boolean;
  showComboSlot?: boolean;
  /** Unique page views for this game */
  viewId?: string;
  initialViewCount?: number;
};

export default function GameShell({
  title,
  accent = '#3b82f6',
  score,
  best,
  over,
  running,
  onStart,
  onPause,
  paused = false,
  hint,
  children,
  controls,
  status,
  level,
  combo,
  newRecord,
  extra,
  bestTimeLabel,
  elapsedLabel,
  className = '',
  footer,
  pcHint,
  showLevelSlot,
  showComboSlot,
  viewId,
  initialViewCount = 0,
}: Props) {
  const [muted, setMuted] = useState(false);
  const [fsApi, setFsApi] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const fs = fsApi || immersive;

  useEffect(() => {
    setMuted(isGamesMuted());
  }, []);

  useEffect(() => {
    const onFs = () => {
      const on = Boolean(document.fullscreenElement);
      setFsApi(on);
      if (on) setImmersive(false);
    };
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setGamesMuted(next);
    if (!next) sfx.tap();
  };

  const exitFullscreen = async () => {
    setImmersive(false);
    try {
      if (document.fullscreenElement) await document.exitFullscreen?.();
    } catch {
      /* ignore */
    }
  };

  const toggleFullscreen = async () => {
    const el = shellRef.current?.closest('.games-root') || shellRef.current;
    if (!el) return;
    if (fs) {
      await exitFullscreen();
      return;
    }
    sfx.tap();
    try {
      if (typeof (el as HTMLElement).requestFullscreen === 'function') {
        await (el as HTMLElement).requestFullscreen();
        return;
      }
    } catch {
      /* fall through to CSS immersive */
    }
    setImmersive(true);
  };

  const startLabel = !running && !over ? 'Играть' : over ? 'Ещё раз' : 'Заново';
  const showHint = Boolean(hint) && !status && !running && !over;
  /** Keep playing layout while game-over so the board does not jump */
  const inRound = running || over;
  const reserveLevel = showLevelSlot ?? typeof level === 'number';
  const reserveCombo = showComboSlot ?? typeof combo === 'number';
  /** Always reserve time chip when parent passes elapsedLabel (even "—") */
  const reserveElapsed = elapsedLabel !== undefined;
  const comboMult =
    typeof combo === 'number' && combo > 0 ? Math.min(4, 1 + Math.floor((combo - 1) / 3)) : 1;

  return (
    <div
      ref={shellRef}
      className={`game-shell is-static-layout${inRound ? ' is-playing' : ' is-idle'}${over ? ' is-over' : ''}${fs ? ' is-fullscreen' : ''}${immersive ? ' is-immersive' : ''}${className ? ` ${className}` : ''}`}
      style={{ ['--game-accent' as string]: accent }}
    >
      {fs ? (
        <div className="game-fs-bar" role="toolbar" aria-label="Полный экран">
          <Link href="/games" className="game-fs-bar__btn" onClick={() => void exitFullscreen()}>
            <ArrowLeft size={16} aria-hidden />
            <span>Назад</span>
          </Link>
          <div className="game-fs-bar__stats">
            {reserveLevel ? (
              <span>
                Ур. <strong>{typeof level === 'number' ? level : '—'}</strong>
              </span>
            ) : null}
            <span>
              Очки <strong>{score}</strong>
            </span>
            <span>
              Время <strong>{elapsedLabel && elapsedLabel !== '—' ? elapsedLabel : '—'}</strong>
            </span>
          </div>
          <button
            type="button"
            className="game-fs-bar__btn"
            onClick={() => void exitFullscreen()}
            aria-label="Закрыть полный экран"
          >
            <X size={16} aria-hidden />
            <span>Закрыть</span>
          </button>
        </div>
      ) : null}

      <div className="game-panel">
        <div className="game-hud">
          <div className="game-hud-left">
            <div className="game-hud-title">{title}</div>
            <div className="game-hud-views">
              {viewId ? (
                <ViewBeacon type="GAME" id={viewId} initialCount={initialViewCount} />
              ) : (
                <span aria-hidden>&nbsp;</span>
              )}
            </div>
            {/* Fixed-height subline — hint/status swap must not move the board */}
            <div className="game-hud-sub" aria-live="polite">
              {status ? (
                <div className="game-hud-status is-flash">{status}</div>
              ) : hint ? (
                <div className={`game-hud-hint${showHint ? '' : ' is-reserved'}`}>{hint}</div>
              ) : (
                <div className="game-hud-hint is-reserved" aria-hidden>
                  &nbsp;
                </div>
              )}
            </div>
            {pcHint ? <div className="game-pc-hint">{pcHint}</div> : null}
          </div>
          <div className="game-hud-right">
            <div className="game-hud-stats" aria-label="Статистика">
              {reserveLevel ? (
                <div className={`game-stat${typeof level !== 'number' ? ' is-placeholder' : ''}`}>
                  <span className="game-stat-label">Ур.</span>
                  <strong>{typeof level === 'number' ? level : '—'}</strong>
                </div>
              ) : null}
              {reserveCombo ? (
                <div className={`game-stat is-combo${comboMult <= 1 ? ' is-placeholder' : ''}`}>
                  <span className="game-stat-label">Комбо</span>
                  <strong>×{comboMult}</strong>
                </div>
              ) : null}
              {reserveElapsed ? (
                <div className={`game-stat${elapsedLabel === '—' || !elapsedLabel ? ' is-placeholder' : ''}`}>
                  <span className="game-stat-label">Время</span>
                  <strong>{elapsedLabel && elapsedLabel !== '—' ? elapsedLabel : '—'}</strong>
                </div>
              ) : null}
              <div className="game-stat">
                <span className="game-stat-label">Очки</span>
                <strong>{score}</strong>
              </div>
              <div className="game-stat game-stat--best">
                <span className="game-stat-label">{bestTimeLabel ? 'Лучшее' : 'Рекорд'}</span>
                <strong>{bestTimeLabel || best}</strong>
              </div>
            </div>
            <div className="game-hud-actions">
              <button
                type="button"
                className="game-mute game-fs-btn"
                onClick={() => void toggleFullscreen()}
                aria-label={fs ? 'Выйти из полного экрана' : 'На весь экран'}
                title={fs ? 'Выйти из полного экрана' : 'На весь экран'}
              >
                {fs ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
              </button>
              <button
                type="button"
                className={`game-mute${muted ? ' is-muted' : ''}`}
                onClick={toggleMute}
                aria-label={muted ? 'Включить звук' : 'Выключить звук'}
                title={muted ? 'Звук выкл' : 'Звук вкл'}
              >
                {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
              </button>
              {onPause ? (
                <button
                  type="button"
                  className="game-mute"
                  onClick={onPause}
                  disabled={!running || over}
                  aria-label={paused ? 'Продолжить' : 'Пауза'}
                  title={paused ? 'Продолжить' : 'Пауза'}
                >
                  {paused ? <Play size={16} /> : <Pause size={16} />}
                </button>
              ) : null}
              <button
                type="button"
                className="game-primary-btn"
                onClick={() => {
                  sfx.unlock();
                  sfx.start();
                  onStart();
                }}
              >
                {startLabel}
              </button>
            </div>
          </div>
        </div>

        {/* Always reserve height — empty slot keeps stage from jumping between games/states */}
        <div className={`game-extra${extra ? '' : ' is-empty'}`}>{extra}</div>

        {/* Always mounted — Top 3 stays put so the board does not jump */}
        <div className={`game-hof-slot${footer ? '' : ' is-empty'}`}>{footer}</div>

        <div className="game-stage">
          <div className="game-stage__board">{children}</div>
          <p
            className={`game-over-msg${over ? '' : ' is-hidden'}${newRecord ? ' is-record' : ''}`}
            aria-hidden={!over}
          >
            {over
              ? `${newRecord ? 'Новый рекорд! ' : 'Конец. '}${
                  newRecord ? 'Сохранено на устройстве.' : 'Ещё раз — или выберите игру сверху.'
                }`
              : '\u00a0'}
          </p>
        </div>

        <div className={`game-controls-dock${controls ? '' : ' is-empty'}`}>{controls}</div>
      </div>
    </div>
  );
}

export function GamePadButton({
  label,
  onPress,
  className = '',
  ariaLabel,
}: {
  label: React.ReactNode;
  onPress: () => void;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      className={`game-pad-btn ${className}`.trim()}
      aria-label={ariaLabel || (typeof label === 'string' ? label : undefined)}
      onPointerDown={(e) => {
        e.preventDefault();
        try {
          (e.currentTarget as HTMLButtonElement).setPointerCapture?.(e.pointerId);
        } catch {
          /* ignore */
        }
        onPress();
      }}
    >
      {label}
    </button>
  );
}
