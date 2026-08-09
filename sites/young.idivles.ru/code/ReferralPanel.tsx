'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Gift, Share2, Users, ShieldCheck, Leaf, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';

type Dash = {
  code: string;
  link: string;
  registerLink: string;
  stats: {
    invited: number;
    qualified: number;
    rejected: number;
    ecoEarned: number;
    socialEarned: number;
    authorityEarned: number;
  };
  rewards: Record<string, number>;
  referredBy: { name?: string | null; code?: string | null; publicCode?: string | null } | null;
  recent: {
    id: string;
    status: string;
    createdAt: string;
    qualifiedAt: string | null;
    referee: { name?: string | null; publicCode?: string | null; image?: string | null };
  }[];
};

const STATUS_RU: Record<string, string> = {
  SIGNED_UP: 'Зарегистрировался',
  QUALIFIED: 'Пришёл на событие',
  REJECTED: 'Отклонено (антифрод)',
  PENDING: 'Ожидание',
};

export default function ReferralPanel() {
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/referrals', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.message || 'Ошибка');
      setData(json);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Не удалось загрузить рефералы');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} скопирована`);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  if (loading && !data) {
    return <div className="referral-panel is-loading">Загрузка реферальной программы…</div>;
  }
  if (!data) return null;

  return (
    <section className="referral-panel" aria-label="Реферальная программа">
      <div className="referral-panel__head">
        <div>
          <h3 className="referral-panel__title">
            <Gift size={18} aria-hidden /> Пригласи друзей
          </h3>
          <p className="referral-panel__lead">
            Делитесь ссылкой — получайте эко-баллы, социум и чуть авторитета, когда друг реально приходит на
            мероприятия. Накрутки отсекаем.
          </p>
        </div>
      </div>

      <div className="referral-panel__link-box">
        <code className="referral-panel__code">{data.code}</code>
        <div className="referral-panel__link-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void copy(data.link, 'Ссылка')}>
            <Copy size={15} /> Копировать ссылку
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void copy(data.registerLink, 'Ссылка на регистрацию')}
          >
            <Share2 size={15} /> На регистрацию
          </button>
        </div>
        <p className="referral-panel__url">{data.link}</p>
      </div>

      <div className="referral-panel__stats" aria-label="Статистика">
        <div>
          <Users size={16} /> <strong>{data.stats.invited}</strong>
          <span>приглашено</span>
        </div>
        <div>
          <ShieldCheck size={16} /> <strong>{data.stats.qualified}</strong>
          <span>с check-in</span>
        </div>
        <div>
          <Leaf size={16} /> <strong>{data.stats.ecoEarned}</strong>
          <span>эко заработано</span>
        </div>
        <div>
          <Sparkles size={16} /> <strong>+{data.stats.socialEarned}</strong>
          <span>социум</span>
        </div>
      </div>

      <div className="referral-panel__rules">
        <strong>Как начисляется</strong>
        <ul>
          <li>
            Регистрация по ссылке: вам до <b>{data.rewards.ECO_SIGNUP_REFERRER}</b> эко, другу{' '}
            <b>{data.rewards.ECO_SIGNUP_REFEREE}</b> эко (после антифрод-проверки).
          </li>
          <li>
            Друг прошёл инструктаж: +<b>{data.rewards.ECO_INSTRUCTIONS_REFERRER}</b> эко вам.
          </li>
          <li>
            Друг отметился на мероприятии (QR): +<b>{data.rewards.ECO_CHECKIN_REFERRER}</b> эко вам, +
            <b>{data.rewards.ECO_CHECKIN_REFEREE}</b> другу, +социум и +1 авторитет вам.
          </li>
          <li>
            Заполнил профиль (фото, город, «о себе») или стал вашим другом — доп. эко и социум.
          </li>
          <li>
            Вехи: 3 / 10 друзей с check-in → +{data.rewards.ECO_MILESTONE_3} / +{data.rewards.ECO_MILESTONE_10} эко.
          </li>
          <li>
            Лимиты: не больше {data.rewards.DAILY_ECO_CAP_REFERRER} эко/сутки и{' '}
            {data.rewards.WEEKLY_ECO_CAP_REFERRER}/неделя с рефералов. Один аккаунт — один пригласивший.
            Совпадение устройства / накрутка IP — награда не даётся.
          </li>
        </ul>
      </div>

      {data.referredBy ? (
        <p className="referral-panel__note">
          Вас пригласил: <strong>{data.referredBy.name || 'участник'}</strong>
          {data.referredBy.code ? ` · ${data.referredBy.code}` : ''}
        </p>
      ) : null}

      {data.recent.length > 0 ? (
        <div className="referral-panel__list">
          <strong>Недавние</strong>
          <ul>
            {data.recent.slice(0, 12).map((r) => (
              <li key={r.id}>
                <span>{r.referee.name || r.referee.publicCode || 'Участник'}</span>
                <span className={`referral-panel__badge is-${r.status.toLowerCase()}`}>
                  {STATUS_RU[r.status] || r.status}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="referral-panel__note">Пока никто не зарегистрировался по вашей ссылке — самое время поделиться.</p>
      )}
    </section>
  );
}
