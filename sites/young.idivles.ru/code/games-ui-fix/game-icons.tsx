'use client';

import {
  Brain,
  CircleDot,
  Grid3x3,
  Layers,
  Puzzle,
  RectangleHorizontal,
  type LucideIcon,
} from 'lucide-react';
import type { GameId } from '@/lib/games';

/** Shared game icons for hub cards + topbar switcher */
export const GAME_ICONS: Record<GameId, LucideIcon> = {
  snake: CircleDot,
  tetris: Layers,
  checkers: Puzzle,
  breakout: RectangleHorizontal,
  memory: Brain,
  fifteen: Grid3x3,
};
