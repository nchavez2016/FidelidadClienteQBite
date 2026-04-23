import { useMemo } from 'react';
import { Users, Plus, Gift } from 'lucide-react';
import { getTransactions } from '@/lib/store';

interface Props {
  staffId: string;
  branchCampaignId: string;
  refreshKey?: number;
}

/** Cards uniformes con stats del turno actual (hoy) para el cajero/admin en la sucursal activa. */
export default function StaffShiftStats({ staffId, branchCampaignId, refreshKey = 0 }: Props) {
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const txs = getTransactions().filter(t => {
      if (t.staffId !== staffId) return false;
      if (branchCampaignId && t.campaignId !== branchCampaignId) return false;
      return new Date(t.createdAt) >= today;
    });
    const customers = new Set<string>();
    let points = 0;
    let redemptions = 0;
    txs.forEach(t => {
      customers.add(t.customerId);
      if (t.type === 'accumulation' && !t.isReversed) points += t.points;
      if (t.type === 'redemption') redemptions += 1;
    });
    return { customers: customers.size, points, redemptions };
  }, [staffId, branchCampaignId, refreshKey]);

  const items = [
    { icon: Users, label: 'Clientes hoy', value: stats.customers, gold: false },
    { icon: Plus, label: 'Puntos emitidos', value: stats.points, gold: true },
    { icon: Gift, label: 'Premios canjeados', value: stats.redemptions, gold: false },
  ];

  return (
    <div className="grid grid-cols-3 gap-2 mt-3">
      {items.map(({ icon: Icon, label, value, gold }) => (
        <div
          key={label}
          className="rounded-[10px] p-[10px] flex flex-col gap-1.5"
          style={{
            background: 'rgba(255,255,255,0.05)',
            border: '0.5px solid rgba(255,255,255,0.09)',
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: 'rgba(255,255,255,0.4)' }} />
              <span
                className="font-heading font-bold leading-none truncate"
                style={{ fontSize: '22px', color: gold ? '#C5A059' : '#ffffff' }}
              >
                {value}
              </span>
            </div>
            {value > 0 && (
              <span
                className="inline-flex items-center gap-0.5 text-[9px] font-body font-semibold px-1.5 py-0.5 rounded-full leading-none shrink-0"
                style={{
                  background: 'rgba(127,227,181,0.15)',
                  color: '#7FE3B5',
                  border: '1px solid rgba(127,227,181,0.3)',
                }}
              >
                ↑ hoy
              </span>
            )}
          </div>
          <span
            className="font-body leading-none"
            style={{ fontSize: '10px', color: 'rgba(255,255,255,0.5)' }}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}
