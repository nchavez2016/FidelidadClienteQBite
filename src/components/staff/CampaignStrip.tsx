interface Props {
  campaign: { id: string; name: string } | undefined;
  selectedCustomer: { acceptedCampaigns?: string[] } | null;
}

/** Franja fina entre hero y contenido: campaña activa + alerta T&C pendientes (si aplica al cliente). */
export default function CampaignStrip({ campaign, selectedCustomer }: Props) {
  const termsPending = !!(
    campaign &&
    selectedCustomer &&
    !selectedCustomer.acceptedCampaigns?.includes(campaign.id)
  );

  return (
    <div
      className="w-full"
      style={{
        background: 'rgba(197,160,89,0.07)',
        borderTop: '1px solid rgba(197,160,89,0.15)',
        padding: '11px 20px',
      }}
    >
      <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
        <div className="flex items-center gap-[10px] min-w-0">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#C5A059" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
          </svg>
          <span style={{ fontSize: '11px', fontWeight: 400, color: 'rgba(197,160,89,0.5)' }}>
            Campaña activa
          </span>
          <span
            style={{
              width: '3px',
              height: '3px',
              borderRadius: '50%',
              background: 'rgba(197,160,89,0.35)',
              flexShrink: 0,
            }}
          />
          <span className="truncate" style={{ fontSize: '13px', fontWeight: 600, color: '#C5A059' }}>
            {campaign?.name || 'Sin campaña activa'}
          </span>
        </div>
        {termsPending && (
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-body font-semibold px-2.5 py-1 rounded-full shrink-0"
            style={{
              background: 'rgba(239,68,68,0.1)',
              color: '#dc2626',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            T&C Pendientes
          </span>
        )}
      </div>
    </div>
  );
}
