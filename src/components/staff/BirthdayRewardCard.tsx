import { useEffect, useState } from 'react';
import { Cake, Check } from 'lucide-react';
import { toast } from 'sonner';
import { getBirthdayStatus, getBirthdayConfig, grantBirthdayReward, type BirthdayStatus } from '@/services/birthday.service';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface BirthdayRewardCardProps {
  customerId: string;
}

/**
 * Se muestra en Operaciones cuando el cliente seleccionado está en su mes de
 * cumpleaños. `reward_message` es el texto interno para staff (instrucciones
 * de entrega) — distinto de `reward_description`, que es lo que ve el cliente.
 */
export default function BirthdayRewardCard({ customerId }: BirthdayRewardCardProps) {
  const [status, setStatus] = useState<BirthdayStatus | null>(null);
  const [staffMessage, setStaffMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [granting, setGranting] = useState(false);

  const load = () => {
    setLoading(true);
    void Promise.all([getBirthdayStatus(customerId), getBirthdayConfig()])
      .then(([s, cfg]) => {
        setStatus(s);
        setStaffMessage(cfg.rewardMessage);
      })
      .catch(err => {
        console.error('[BirthdayRewardCard] load failed', err);
        setStatus(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [customerId]);

  if (loading || !status || !status.isBirthdayMonth) return null;

  const handleGrant = async () => {
    setGranting(true);
    try {
      await grantBirthdayReward(customerId);
      toast.success('Entrega de cumpleaños registrada 🎂');
      load();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? '';
      if (msg.includes('already_granted')) {
        toast.error('Este cliente ya recibió su premio de cumpleaños este año');
      } else if (msg.includes('program_inactive')) {
        toast.error('El programa de cumpleaños está desactivado');
      } else if (msg.includes('not_birthday_month')) {
        toast.error('Ya no es el mes de cumpleaños de este cliente');
      } else {
        toast.error('No se pudo registrar la entrega. Intenta de nuevo.');
      }
      load();
    } finally {
      setGranting(false);
    }
  };

  return (
    <Card className="rounded-xl" style={{ borderColor: 'rgba(232,161,69,0.4)', background: 'rgba(232,161,69,0.06)' }}>
      <CardContent className="pt-4 flex items-center gap-3">
        <Cake className="w-6 h-6 shrink-0" style={{ color: '#E8A145' }} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold" style={{ color: '#0B181E' }}>
            {status.isBirthdayToday ? '¡Hoy es su cumpleaños! 🎉' : 'Cliente de cumpleaños este mes'}
          </p>
          {status.alreadyGranted ? (
            <p className="text-xs mt-0.5 flex items-center gap-1 text-muted-foreground">
              <Check className="w-3.5 h-3.5" /> Premio ya entregado este año
            </p>
          ) : (
            staffMessage && <p className="text-xs mt-0.5 text-muted-foreground">{staffMessage}</p>
          )}
        </div>
        {!status.alreadyGranted && (
          <Button
            size="sm"
            disabled={!status.isProgramActive || granting}
            onClick={() => void handleGrant()}
            className="text-white shrink-0"
            style={{ background: '#E8A145' }}
            title={!status.isProgramActive ? 'El programa de cumpleaños está desactivado' : undefined}
          >
            {granting ? 'Registrando…' : 'Registrar entrega'}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
