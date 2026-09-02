import { Gift, CheckCircle, Lock, ArrowRight, Hourglass, X } from 'lucide-react';
import type { Milestone, RedemptionRequest } from '@/lib/types';
import { getBranchAccent } from '@/lib/utils';

interface RewardsCardProps {
  milestones: Milestone[];
  /** Puntos actuales en la campaña seleccionada. */
  currentPoints: number;
  nextMilestoneId: string | undefined;
  /** Solicitud pendiente del cliente en esta campaña (si existe). */
  pendingRequest?: RedemptionRequest | null;
  /** Crea una solicitud de canje para el premio (cliente). */
  onRequest?: (milestone: Milestone) => void;
  /** Cancela la solicitud pendiente (cliente). */
  onCancelRequest?: (request: RedemptionRequest) => void;
  /** Modo staff: canje directo (mantiene compat). */
  onRedeem?: (milestone: Milestone) => void;
  /** Sucursal de la campaña activa (para acento visual de marca). */
  branch?: string;
}

export default function RewardsCard({
  milestones,
  currentPoints,
  pendingRequest,
  onRequest,
  onCancelRequest,
  onRedeem,
  branch,
}: RewardsCardProps) {
  if (milestones.length === 0) return null;

  const accent = getBranchAccent(branch);
  const borderColor = accent?.borderStrong ?? '#E8A145';
  const shadow = accent
    ? `0 6px 24px -8px ${accent.borderStrong}55`
    : '0 6px 24px -8px rgba(232,161,69,0.15)';

  return (
    <div
      className="bg-white p-3 sm:p-4"
      style={{ borderRadius: 16, border: `1.5px solid ${borderColor}`, boxShadow: shadow }}
    >
      <div className="flex items-center gap-2 mb-3">
        <Gift className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: '#E8A145' }} />
        <h2 className="font-heading font-bold text-sm sm:text-base" style={{ color: '#0B181E' }}>
          Premios Disponibles
        </h2>
      </div>

      {pendingRequest && (
        <div
          className="mb-3 flex items-start gap-2 rounded-lg p-2.5"
          style={{ background: 'rgba(232,161,69,0.08)', border: '1px solid rgba(232,161,69,0.25)' }}
        >
          <Hourglass className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#E8A145' }} />
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-body font-semibold leading-tight" style={{ color: '#0B181E' }}>
              Solicitud enviada — esperando confirmación del cajero
            </p>
            <p className="text-[10px] font-body mt-0.5" style={{ color: '#E8A145' }}>
              Premio: <strong>{pendingRequest.rewardName}</strong> ({pendingRequest.requiredPoints} pts)
            </p>
          </div>
          {onCancelRequest && pendingRequest.status === 'pending' && (
            <button
              onClick={() => onCancelRequest(pendingRequest)}
              className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-md transition-colors"
              style={{ background: '#fff', color: '#dc2626', border: '1px solid rgba(220,38,38,0.3)' }}
            >
              <X className="w-3 h-3" />
              Cancelar
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-2.5">
        {milestones.map((m) => {
          const unlocked = currentPoints >= m.requiredPoints;
          const missing = Math.max(0, m.requiredPoints - currentPoints);
          const isSelectedPending = pendingRequest?.rewardId === m.id;
          const blockedByOther = !!pendingRequest && !isSelectedPending;
          return (
            <div
              key={m.id}
              className="relative flex flex-col items-center gap-1.5 transition-all overflow-hidden"
              style={{
                background: isSelectedPending ? '#eef5ff' : unlocked ? '#fffdf5' : '#fff',
                borderRadius: 12,
                padding: unlocked ? '14px 12px 10px' : '12px',
                minWidth: 0,
                border: isSelectedPending
                  ? '1.5px solid #E8A145'
                  : unlocked
                    ? '1.5px solid #E8A145'
                    : '0.5px solid rgba(232,161,69,0.25)',
                boxShadow: unlocked
                  ? '0 4px 16px -4px rgba(232,161,69,0.35)'
                  : '0 2px 8px -4px rgba(0,0,0,0.05)',
                opacity: blockedByOther ? 0.55 : 1,
              }}
            >
              {unlocked && !isSelectedPending && (
                <div
                  className="absolute top-0 left-0 right-0"
                  style={{ height: 3, background: 'linear-gradient(90deg, #E8A145 0%, #EEB872 50%, #E8A145 100%)' }}
                />
              )}
              {isSelectedPending && (
                <div
                  className="absolute top-0 left-0 right-0"
                  style={{ height: 3, background: 'linear-gradient(90deg, #E8A145 0%, #EEB872 50%, #E8A145 100%)' }}
                />
              )}

              <div
                className="w-8 h-8 rounded-full flex items-center justify-center"
                style={{ background: isSelectedPending ? 'rgba(232,161,69,0.15)' : unlocked ? 'rgba(232,161,69,0.15)' : '#f0f4f8' }}
              >
                {isSelectedPending
                  ? <Hourglass className="w-4 h-4" style={{ color: '#E8A145' }} />
                  : unlocked
                    ? <CheckCircle className="w-4 h-4" style={{ color: '#E8A145' }} />
                    : <Lock className="w-3.5 h-3.5" style={{ color: '#E8A145' }} />}
              </div>
              <span className="text-[11px] font-body font-semibold text-center leading-tight" style={{ color: '#0B181E' }}>
                {m.rewardName}
              </span>
              {m.description && (
                <span
                  className="text-[10px] font-body text-center leading-tight px-1"
                  style={{ color: '#5A6B82' }}
                >
                  {m.description}
                </span>
              )}
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                style={{
                  background: isSelectedPending ? 'rgba(232,161,69,0.12)' : unlocked ? 'rgba(232,161,69,0.12)' : '#f0f4f8',
                  color: isSelectedPending ? '#E8A145' : unlocked ? '#E8A145' : '#999',
                }}
              >
                {m.requiredPoints} pts
              </span>

              {isSelectedPending ? (
                <span className="mt-1 text-[9px] font-body font-bold uppercase tracking-wider" style={{ color: '#E8A145' }}>
                  Solicitado
                </span>
              ) : unlocked ? (
                onRedeem ? (
                  <button
                    onClick={() => onRedeem(m)}
                    className="mt-1.5 w-full flex items-center justify-center gap-1 text-[10px] font-body font-bold text-white px-2 py-1.5 rounded-md transition-transform active:scale-95"
                    style={{
                      background: 'linear-gradient(135deg, #E8A145 0%, #0B181E 100%)',
                      boxShadow: '0 2px 8px -2px rgba(232,161,69,0.4)',
                    }}
                  >
                    Canjear ahora
                    <ArrowRight className="w-3 h-3" />
                  </button>
                ) : onRequest ? (
                  <button
                    onClick={() => onRequest(m)}
                    disabled={blockedByOther}
                    className="mt-1.5 w-full flex items-center justify-center gap-1 text-[10px] font-body font-bold text-white px-2 py-1.5 rounded-md transition-transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{
                      background: 'linear-gradient(135deg, #E8A145 0%, #0B181E 100%)',
                      boxShadow: '0 2px 8px -2px rgba(232,161,69,0.4)',
                    }}
                  >
                    Pedir canje
                    <ArrowRight className="w-3 h-3" />
                  </button>
                ) : (
                  <span
                    className="mt-1 text-[9px] font-body font-bold uppercase tracking-wider"
                    style={{ color: '#E8A145' }}
                  >
                    Disponible
                  </span>
                )
              ) : (
                <span className="mt-1 text-[10px] font-body" style={{ color: '#999' }}>
                  Faltan <span style={{ fontWeight: 600 }}>{missing}</span> pts
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
