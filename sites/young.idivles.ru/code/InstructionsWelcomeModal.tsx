'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { BookOpen, X } from 'lucide-react';

type PromptState = 'unknown' | 'show' | 'hide';

const LS_KEY = 'yp_instructions_prompt_v1';

function readLocal(): 'skipped' | 'dismissed' | null {
  try {
    const v = localStorage.getItem(LS_KEY);
    if (v === 'skipped' || v === 'dismissed') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeLocal(v: 'skipped' | 'dismissed') {
  try {
    localStorage.setItem(LS_KEY, v);
  } catch {
    /* ignore */
  }
}

/**
 * First-login / first-session prompt: pass instructions, skip, or never show again.
 */
export default function InstructionsWelcomeModal() {
  const { data: session, status } = useSession();
  const [state, setState] = useState<PromptState>('unknown');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (status !== 'authenticated' || !session?.user) {
      setState('hide');
      return;
    }
    const local = readLocal();
    if (local === 'dismissed') {
      setState('hide');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/user/instructions', { cache: 'no-store' });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (data?.completed) {
          setState('hide');
          return;
        }
        if (data?.promptDismissed) {
          writeLocal('dismissed');
          setState('hide');
          return;
        }
        // Soft-skip only hides until next login session (local skipped + sessionStorage)
        if (local === 'skipped') {
          try {
            if (sessionStorage.getItem('yp_instr_skip_session') === '1') {
              setState('hide');
              return;
            }
          } catch {
            /* ignore */
          }
        }
        const t = window.setTimeout(() => {
          if (!cancelled) setState('show');
        }, 900);
        return () => window.clearTimeout(t);
      } catch {
        if (!cancelled) setState('hide');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status, session?.user]);

  const persist = useCallback(async (action: 'skip' | 'dismiss') => {
    setBusy(true);
    writeLocal(action === 'dismiss' ? 'dismissed' : 'skipped');
    if (action === 'skip') {
      try {
        sessionStorage.setItem('yp_instr_skip_session', '1');
      } catch {
        /* ignore */
      }
    }
    try {
      await fetch('/api/user/instructions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: action === 'dismiss' ? 'dismiss_prompt' : 'skip_prompt' }),
      });
    } catch {
      /* local already set */
    }
    setBusy(false);
    setState('hide');
  }, []);

  if (state !== 'show') return null;

  return (
    <div className="instr-welcome" role="dialog" aria-modal="true" aria-label="Инструктаж портала">
      <div className="instr-welcome__card">
        <button
          type="button"
          className="instr-welcome__close"
          aria-label="Закрыть"
          disabled={busy}
          onClick={() => void persist('skip')}
        >
          <X size={18} />
        </button>
        <div className="instr-welcome__icon" aria-hidden>
          <BookOpen size={28} />
        </div>
        <h2>Добро пожаловать!</h2>
        <p>
          Короткий инструктаж поможет разобраться с билетами, рейтингами, эко-баллами и безопасностью. За полное
          прохождение — ачивка и эко-баллы.
        </p>
        <div className="instr-welcome__actions">
          <Link
            href="/dashboard?tab=profile#guides"
            className="btn btn-primary"
            onClick={() => {
              writeLocal('skipped');
              try {
                sessionStorage.setItem('yp_instr_skip_session', '1');
              } catch {
                /* ignore */
              }
              setState('hide');
            }}
          >
            Пройти инструктаж
          </Link>
          <button type="button" className="btn btn-secondary" disabled={busy} onClick={() => void persist('skip')}>
            Пропустить
          </button>
          <button
            type="button"
            className="instr-welcome__never"
            disabled={busy}
            onClick={() => void persist('dismiss')}
          >
            Больше не показывать
          </button>
        </div>
      </div>
    </div>
  );
}
