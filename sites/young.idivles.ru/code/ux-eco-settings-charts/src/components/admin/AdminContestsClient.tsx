'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';

type Contest = {
  id: string;
  kind: string;
  title: string;
  status: string;
  bookingId: string | null;
  booking: { title: string } | null;
  _count: { submissions: number; raffleEntries: number; winners: number };
};
type Sub = {
  id: string;
  title: string | null;
  status: string;
  user: { name: string | null; publicCode: string | null };
  contest: { title: string };
};

export default function AdminContestsClient() {
  const [contests, setContests] = useState<Contest[]>([]);
  const [pending, setPending] = useState<Sub[]>([]);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState('SUBMISSION');
  const [bookingId, setBookingId] = useState('');
  const [awardContestId, setAwardContestId] = useState('');
  const [awardCode, setAwardCode] = useState('');
  const [awardAmount, setAwardAmount] = useState(25);
  const [awardReason, setAwardReason] = useState('');

  const load = useCallback(async () => {
    const res = await fetch('/api/admin/contests');
    const data = await res.json();
    if (!res.ok) {
      toast.error(data.message || 'Нет доступа');
      return;
    }
    setContests(data.contests || []);
    setPending(data.pendingSubs || []);
    if (!awardContestId && data.contests?.[0]?.id) {
      setAwardContestId(data.contests[0].id);
    }
  }, [awardContestId]);

  useEffect(() => {
    void load();
  }, [load]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch('/api/admin/contests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Ошибка');
    return data;
  };

  return (
    <div style={{ display: 'grid', gap: '1.25rem' }}>
      <h1 style={{ margin: 0 }}>Конкурсы и розыгрыши</h1>

      <section className="card-surface" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>Создать</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="SUBMISSION">Конкурс работ</option>
            <option value="RAFFLE">Розыгрыш</option>
          </select>
          <input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          {kind === 'RAFFLE' && (
            <input
              placeholder="bookingId события (афиша)"
              value={bookingId}
              onChange={(e) => setBookingId(e.target.value)}
            />
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() =>
              void post({
                action: 'upsertContest',
                kind,
                title,
                rulesHtml: '<p>Правила конкурса</p>',
                status: 'OPEN',
                allowVoting: true,
                bookingId: kind === 'RAFFLE' ? bookingId || null : null,
                prizeText: 'Приз от Центра',
              })
                .then(() => {
                  toast.success('Создано');
                  setTitle('');
                  void load();
                })
                .catch((e) => toast.error(e.message))
            }
          >
            Опубликовать OPEN
          </button>
        </div>
      </section>

      <section className="card-surface" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>Наградить эко-баллами</h2>
        <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--muted)' }}>
          Ручная награда участнику (учитывается общий пул). Авто-начисления при одобрении/победе
          уже работают.
        </p>
        <div style={{ display: 'grid', gap: 8, maxWidth: 520 }}>
          <select value={awardContestId} onChange={(e) => setAwardContestId(e.target.value)}>
            <option value="">Конкурс…</option>
            {contests.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <input
            placeholder="Код профиля (YM-…)"
            value={awardCode}
            onChange={(e) => setAwardCode(e.target.value)}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 8 }}>
            <input
              type="number"
              min={1}
              max={5000}
              value={awardAmount}
              onChange={(e) => setAwardAmount(Number(e.target.value) || 1)}
            />
            <input
              placeholder="Причина (необязательно)"
              value={awardReason}
              onChange={(e) => setAwardReason(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!awardContestId || !awardCode.trim()}
            onClick={() =>
              void post({
                action: 'awardEco',
                contestId: awardContestId,
                publicCode: awardCode.trim(),
                amount: awardAmount,
                reason: awardReason.trim() || 'contest_manual_award',
              })
                .then((r) => {
                  toast.success(`Начислено. Баланс: ${r.ecoPoints}`);
                  setAwardCode('');
                })
                .catch((e) => toast.error(e.message))
            }
          >
            Выдать эко-баллы
          </button>
        </div>
      </section>

      <section className="card-surface" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>Список</h2>
        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
          {contests.map((c) => (
            <li key={c.id} style={{ marginBottom: 12 }}>
              <strong>{c.title}</strong> · {c.kind} · {c.status}
              {c.booking ? ` · ${c.booking.title}` : ''}
              <div style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                работ {c._count.submissions} · пул {c._count.raffleEntries} · победителей{' '}
                {c._count.winners}
              </div>
              {c.kind === 'RAFFLE' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      void post({ action: 'syncRaffle', contestId: c.id })
                        .then((r) => {
                          toast.success(`Синхронизировано: ${r.synced}`);
                          void load();
                        })
                        .catch((e) => toast.error(e.message))
                    }
                  >
                    Sync check-in
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      void post({ action: 'drawRaffle', contestId: c.id })
                        .then((r) => {
                          toast.success(`Розыгрыш: seed ${String(r.seed).slice(0, 12)}…`);
                          void load();
                        })
                        .catch((e) => toast.error(e.message))
                    }
                  >
                    Провести розыгрыш
                  </button>
                </div>
              )}
              {c.kind === 'SUBMISSION' && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 6 }}
                  onClick={() =>
                    void post({ action: 'declareSubmissionWinners', contestId: c.id, count: 3 })
                      .then(() => {
                        toast.success('Победители по голосам');
                        void load();
                      })
                      .catch((e) => toast.error(e.message))
                  }
                >
                  Топ-3 по голосам
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="card-surface" style={{ padding: '1rem' }}>
        <h2 style={{ fontSize: '1.05rem', marginTop: 0 }}>Модерация работ</h2>
        {pending.length === 0 ? (
          <p style={{ color: 'var(--muted)' }}>Нет PENDING</p>
        ) : (
          <ul>
            {pending.map((s) => (
              <li key={s.id} style={{ marginBottom: 10 }}>
                {s.user.name}
                {s.user.publicCode ? ` (${s.user.publicCode})` : ''} → {s.contest.title}:{' '}
                {s.title || 'без названия'}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() =>
                      void post({ action: 'reviewSubmission', id: s.id, status: 'APPROVED' }).then(
                        () => {
                          toast.success('Одобрено (+эко)');
                          void load();
                        }
                      )
                    }
                  >
                    Одобрить
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={() =>
                      void post({
                        action: 'reviewSubmission',
                        id: s.id,
                        status: 'REJECTED',
                      }).then(() => void load())
                    }
                  >
                    Отклонить
                  </button>
                  {s.user.publicCode ? (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={() => {
                        setAwardContestId(
                          contests.find((c) => c.title === s.contest.title)?.id || awardContestId
                        );
                        setAwardCode(s.user.publicCode || '');
                        toast.success('Код подставлен в форму награды');
                      }}
                    >
                      В награду
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
