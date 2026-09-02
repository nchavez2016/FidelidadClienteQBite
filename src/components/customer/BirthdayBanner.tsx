import { useEffect, useState } from 'react';
import { Cake } from 'lucide-react';
import { getBirthdayStatus, type BirthdayStatus } from '@/services/birthday.service';

interface BirthdayBannerProps {
  customerId: string;
}

/** Se muestra solo si el programa está activo y es el mes de cumpleaños del cliente. */
export default function BirthdayBanner({ customerId }: BirthdayBannerProps) {
  const [status, setStatus] = useState<BirthdayStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getBirthdayStatus(customerId)
      .then(s => { if (!cancelled) setStatus(s); })
      .catch(err => { console.error('[BirthdayBanner] status load failed', err); });
    return () => { cancelled = true; };
  }, [customerId]);

  if (!status || !status.isProgramActive || !status.isBirthdayMonth) return null;

  return (
    <div
      className="rounded-2xl px-4 py-3 flex items-center gap-3"
      style={{
        background: status.alreadyGranted ? 'rgba(232,161,69,0.08)' : 'rgba(232,161,69,0.15)',
        border: '1px solid rgba(232,161,69,0.4)',
      }}
    >
      <Cake className="w-6 h-6 shrink-0" style={{ color: '#E8A145' }} />
      <div className="min-w-0">
        {status.alreadyGranted ? (
          <p className="text-sm font-semibold" style={{ color: '#0B181E' }}>
            ¡Ya reclamaste tu premio de cumpleaños este año! 🎉
          </p>
        ) : (
          <>
            <p className="text-sm font-bold" style={{ color: '#0B181E' }}>
              {status.isBirthdayToday ? '¡Feliz cumpleaños! 🎂' : 'Es tu mes de cumpleaños 🎂'}
            </p>
            <p className="text-xs mt-0.5" style={{ color: '#0B181E' }}>
              {status.rewardDescription} — pásate por cualquier sucursal para reclamarlo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
