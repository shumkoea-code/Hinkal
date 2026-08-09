'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useVoice } from '@/components/VoiceProvider';

/** Listens for yp:eco-awarded (game daily / view unique). */
export default function EcoAwardToast() {
  const { t } = useVoice();

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      const amount = Number(detail.amount) || 0;
      const reason = String(detail.reason || '');
      if (amount <= 0) return;
      const id = `eco-${reason || 'award'}`;
      if (reason === 'view_unique') {
        toast.success(t('eco.toast.view', `+${amount} эко за просмотр`, { n: amount }), {
          id,
          duration: 2600,
        });
        return;
      }
      toast.success(t('eco.toast.game', `+${amount} эко за игру сегодня`, { n: amount }), {
        id,
        duration: 3600,
      });
    };
    window.addEventListener('yp:eco-awarded', handler as EventListener);
    return () => window.removeEventListener('yp:eco-awarded', handler as EventListener);
  }, [t]);
  return null;
}
