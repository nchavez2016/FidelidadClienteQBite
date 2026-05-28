import { motion } from 'framer-motion';
import { MapPin } from 'lucide-react';
import type { Campaign, Customer } from '@/lib/types';
import { getCustomerPoints } from '@/services';

interface CampaignSwitcherProps {
  campaigns: Campaign[];
  customer: Customer;
  selectedCampaignId: string;
  onSelect: (id: string) => void;
}

export default function CampaignSwitcher({ campaigns, customer, selectedCampaignId, onSelect }: CampaignSwitcherProps) {
  if (campaigns.length === 0) return null;

  return (
    <motion.div
      className="max-w-[720px] mx-auto px-3 sm:px-4 mt-3"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
    >
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <MapPin className="w-3.5 h-3.5" style={{ color: '#1B3A6B' }} />
        <h3 className="font-heading font-bold text-xs tracking-wide" style={{ color: '#1B3A6B' }}>
          Tus rutas activas
        </h3>
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 snap-x">
        {campaigns.map(c => {
          const isActive = c.id === selectedCampaignId;
          const pts = getCustomerPoints(customer, c.id);
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className="snap-start shrink-0 flex flex-col items-start text-left transition-all"
              style={{
                background: isActive ? '#fff' : 'rgba(255,255,255,0.55)',
                border: isActive ? '2px solid #C9A84C' : '1px solid #e8edf3',
                borderRadius: 14,
                padding: '10px 14px',
                minWidth: 150,
                opacity: isActive ? 1 : 0.7,
                boxShadow: isActive ? '0 4px 16px -6px rgba(201,168,76,0.35)' : '0 2px 6px -3px rgba(27,58,107,0.06)',
                transform: isActive ? 'translateY(-1px)' : 'translateY(0)',
              }}
            >
              <span className="font-body text-[10px] uppercase tracking-wider" style={{ color: isActive ? '#C9A84C' : '#999' }}>
                Sucursal
              </span>
              <span className="font-heading font-bold text-[13px] leading-tight mt-0.5" style={{ color: '#1B3A6B' }}>
                {c.branch}
              </span>
              <span className="font-body text-[11px] mt-1.5" style={{ color: isActive ? '#1B3A6B' : '#666' }}>
                <strong style={{ fontSize: 14, color: isActive ? '#C9A84C' : '#888' }}>{pts}</strong> pts
              </span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}
