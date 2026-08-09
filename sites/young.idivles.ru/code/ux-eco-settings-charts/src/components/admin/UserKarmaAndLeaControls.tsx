'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { RotateCcw, Share2, KeyRound, ExternalLink, Copy } from 'lucide-react';

const DECRYPT_PATH = '/tools/lea-decrypt.html';

export default function UserKarmaAndLeaControls({
  userId,
  reliabilityScore,
  socialScore,
  warnCount,
}: {
  userId: string;
  reliabilityScore: number | null;
  socialScore?: number | null;
  warnCount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [leaKey, setLeaKey] = useState<string | null>(null);
  const [leaMeta, setLeaMeta] = useState<{
    exportId: string;
    downloadPath: string;
    archiveSha256: string;
    keyFingerprint: string;
  } | null>(null);
  const [reason, setReason] = useState('');
  const [ecoAmount, setEcoAmount] = useState(25);
  const [ecoReason, setEcoReason] = useState('');
  const [ecoBusy, setEcoBusy] = useState(false);

  const resetKarma = async () => {
    if (
      !confirm(
        'Сбросить авторитет до 100%, социальный рейтинг до 50% и обнулить предупреждения?'
      )
    )
      return;
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/karma`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resetKarma: true,
          note: 'Администратор сбросил авторитет и социальный рейтинг.',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success('Рейтинги сброшены');
      window.location.reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };

  const issueLea = async () => {
    if (reason.trim().length < 8) {
      toast.error('Укажите основание выдачи (мин. 8 символов)');
      return;
    }
    if (
      !confirm(
        'Сформировать шифрованный архив ПДн? Ключ будет показан один раз — сохраните его отдельно от архива.'
      )
    ) {
      return;
    }
    setBusy(true);
    setLeaKey(null);
    try {
      const res = await fetch('/api/admin/lea-export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId,
          reason: reason.trim(),
          legalBasis: 'Законное требование органа власти РФ / 152-ФЗ',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      setLeaKey(data.oneTimeKeyHex);
      setLeaMeta({
        exportId: data.exportId,
        downloadPath: data.downloadPath,
        archiveSha256: data.archiveSha256,
        keyFingerprint: data.keyFingerprint,
      });
      toast.success('Архив готов. Скопируйте ключ сейчас.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setBusy(false);
    }
  };


  const grantEco = async () => {
    setEcoBusy(true);
    try {
      const res = await fetch('/api/admin/eco', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'grant',
          userId,
          amount: ecoAmount,
          reason: ecoReason.trim() || 'admin_grant',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ошибка');
      toast.success(`Эко-баллы начислены. Баланс: ${data.ecoPoints}`);
      setEcoReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Ошибка');
    } finally {
      setEcoBusy(false);
    }
  };

  const buildBundleText = () => {
    if (!leaKey || !leaMeta) return '';
    const origin = window.location.origin;
    return [
      'Архив ПДн портала (формат YPLEA1, AES-256-GCM)',
      '',
      '1) Файл архива (.ypenc):',
      `${origin}${leaMeta.downloadPath}`,
      `SHA-256: ${leaMeta.archiveSha256}`,
      '',
      '2) Одноразовый ключ AES (передайте ОТДЕЛЬНЫМ каналом):',
      leaKey,
      `Отпечаток ключа: ${leaMeta.keyFingerprint}`,
      '',
      '3) Как открыть (7-Zip/WinRAR не подойдут):',
      `Официальный расшифровщик: ${origin}${DECRYPT_PATH}`,
      '— откройте страницу (можно «Сохранить как» и работать офлайн),',
      '— выберите .ypenc, вставьте ключ, сверьте SHA-256 / отпечаток,',
      '— скачайте JSON. Ключ обрабатывается только в браузере, на сервер не уходит.',
      '',
      `CLI: node scripts/decrypt-lea.mjs archive.ypenc --key ${leaKey} --sha ${leaMeta.archiveSha256} --fp ${leaMeta.keyFingerprint}`,
    ].join('\n');
  };

  const shareBundle = async () => {
    const text = buildBundleText();
    if (!text) return;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Выдача ПДн портала', text });
      } else {
        await navigator.clipboard.writeText(text);
        toast.success('Инструкция скопирована');
      }
    } catch {
      await navigator.clipboard.writeText(text);
      toast.success('Инструкция скопирована');
    }
  };

  const copyKey = async () => {
    if (!leaKey) return;
    await navigator.clipboard.writeText(leaKey);
    toast.success('Ключ скопирован');
  };

  return (
    <div
      style={{
        backgroundColor: 'white',
        padding: '1rem',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-sm)',
        display: 'grid',
        gap: 12,
      }}
    >
      <div>
        <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.35rem', fontWeight: 700 }}>
          Авторитет и соцрейтинг
        </h2>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--muted)' }}>
          Авторитет: {reliabilityScore ?? 100}% · Соцрейтинг: {socialScore ?? 50}% · предупреждений:{' '}
          {warnCount}
        </p>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={busy}
          onClick={() => void resetKarma()}
          style={{ marginTop: 10, display: 'inline-flex', gap: 6, alignItems: 'center' }}
        >
          <RotateCcw size={15} /> Сбросить рейтинги
        </button>
      </div>

      <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 12 }}>
        <h2 style={{ fontSize: '1.15rem', margin: '0 0 0.35rem', fontWeight: 700 }}>Выдача ПДн органам</h2>
        <p style={{ margin: '0 0 8px', fontSize: '0.82rem', color: 'var(--muted)' }}>
          Шифрованный контейнер <code>YPLEA1</code> (AES-256-GCM). Ключ показывается один раз. Открывается
          официальным расшифровщиком — не ZIP.
        </p>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          placeholder="Основание / номер запроса органа…"
          style={{
            width: '100%',
            padding: '0.55rem 0.65rem',
            borderRadius: 10,
            border: '1.5px solid #e2e8f0',
            font: 'inherit',
            boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void issueLea()}>
            Сформировать архив
          </button>
          {leaMeta ? (
            <a className="btn btn-secondary" href={leaMeta.downloadPath}>
              Скачать архив
            </a>
          ) : null}
          <a
            className="btn btn-secondary"
            href={DECRYPT_PATH}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
          >
            <KeyRound size={15} /> Расшифровщик
            <ExternalLink size={13} />
          </a>
          {leaKey ? (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => void shareBundle()}
              style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}
            >
              <Share2 size={15} /> Инструкция органу
            </button>
          ) : null}
        </div>
        {leaKey ? (
          <div
            style={{
              marginTop: 10,
              padding: '0.75rem',
              borderRadius: 10,
              background: '#fff7ed',
              border: '1px solid #fdba74',
              fontSize: '0.78rem',
              wordBreak: 'break-all',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <strong>Одноразовый ключ (сохраните сейчас, передайте отдельно от файла):</strong>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => void copyKey()}
                style={{ padding: '0.3rem 0.55rem', display: 'inline-flex', gap: 4, alignItems: 'center', flexShrink: 0 }}
              >
                <Copy size={13} /> Копировать
              </button>
            </div>
            <div style={{ fontFamily: 'ui-monospace, monospace', marginTop: 4 }}>{leaKey}</div>
            {leaMeta ? (
              <div style={{ marginTop: 8, color: '#9a3412', lineHeight: 1.45 }}>
                fingerprint: {leaMeta.keyFingerprint}
                <br />
                sha256: {leaMeta.archiveSha256}
                <br />
                Откройте: <a href={DECRYPT_PATH} target="_blank" rel="noopener noreferrer">{DECRYPT_PATH}</a>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div
        style={{
          marginTop: '0.25rem',
          paddingTop: '0.85rem',
          borderTop: '1px solid #e2e8f0',
          display: 'grid',
          gap: 8,
        }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>Эко-баллы</div>
        <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: 8 }}>
          <input
            type="number"
            min={1}
            max={50000}
            value={ecoAmount}
            onChange={(e) => setEcoAmount(Number(e.target.value) || 1)}
            style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
          <input
            placeholder="Причина"
            value={ecoReason}
            onChange={(e) => setEcoReason(e.target.value)}
            style={{ padding: '0.45rem 0.6rem', borderRadius: 8, border: '1px solid #e2e8f0' }}
          />
        </div>
        <button
          type="button"
          className="btn btn-secondary"
          disabled={ecoBusy || busy}
          onClick={() => void grantEco()}
          style={{ justifySelf: 'start' }}
        >
          {ecoBusy ? '…' : 'Выдать эко-баллы'}
        </button>
      </div>
    </div>
  );
}
