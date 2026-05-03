import { useState, useCallback } from 'react';
import { saveCampaign } from '@/lib/store';
import { Campaign, Milestone, BonusRule } from '@/lib/types';
import { toast } from 'sonner';

export function useCampaignEditor(onSaved: () => void) {
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [newMilestoneName, setNewMilestoneName] = useState('');
  const [newMilestonePoints, setNewMilestonePoints] = useState('');
  const [newMilestoneDesc, setNewMilestoneDesc] = useState('');

  const addMilestone = useCallback(() => {
    if (!editingCampaign || !newMilestoneName || !newMilestonePoints) return;
    const pts = parseInt(newMilestonePoints);
    if (isNaN(pts) || pts <= 0) { toast.error('Puntos inválidos'); return; }
    const m: Milestone = {
      id: `m-${Date.now()}`,
      requiredPoints: pts,
      rewardName: newMilestoneName,
      description: newMilestoneDesc || undefined,
      order: editingCampaign.milestones.length + 1,
    };
    const updated = {
      ...editingCampaign,
      milestones: [...editingCampaign.milestones, m]
        .sort((a, b) => a.requiredPoints - b.requiredPoints)
        .map((mi, i) => ({ ...mi, order: i + 1 })),
    };
    setEditingCampaign(updated);
    setNewMilestoneName('');
    setNewMilestonePoints('');
    setNewMilestoneDesc('');
  }, [editingCampaign, newMilestoneName, newMilestonePoints, newMilestoneDesc]);

  const removeMilestone = useCallback((id: string) => {
    if (!editingCampaign) return;
    const updated = {
      ...editingCampaign,
      milestones: editingCampaign.milestones.filter(m => m.id !== id).map((m, i) => ({ ...m, order: i + 1 })),
    };
    setEditingCampaign(updated);
  }, [editingCampaign]);

  const addBonusRule = useCallback(() => {
    if (!editingCampaign) return;
    const rule: BonusRule = {
      id: `bonus-${Date.now()}`,
      label: '',
      multiplier: 2,
      days: [1, 2, 3], // L-M-X por defecto
      startTime: '09:00',
      endTime: '12:00',
      active: true,
    };
    setEditingCampaign({
      ...editingCampaign,
      bonusRules: [...(editingCampaign.bonusRules || []), rule],
    });
  }, [editingCampaign]);

  const updateBonusRule = useCallback((id: string, patch: Partial<BonusRule>) => {
    if (!editingCampaign) return;
    setEditingCampaign({
      ...editingCampaign,
      bonusRules: (editingCampaign.bonusRules || []).map(r =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    });
  }, [editingCampaign]);

  const removeBonusRule = useCallback((id: string) => {
    if (!editingCampaign) return;
    setEditingCampaign({
      ...editingCampaign,
      bonusRules: (editingCampaign.bonusRules || []).filter(r => r.id !== id),
    });
  }, [editingCampaign]);

  const saveCampaignChanges = useCallback(() => {
    if (!editingCampaign) return;
    if (!editingCampaign.name.trim()) { toast.error('El nombre de la campaña es obligatorio'); return; }
    if (!editingCampaign.branch?.trim()) { toast.error('El nombre de la sucursal es obligatorio'); return; }
    if (!editingCampaign.termsAndConditions.trim()) { toast.error('Los términos y condiciones son obligatorios'); return; }
    if (editingCampaign.milestones.length === 0) { toast.error('Agrega al menos un hito'); return; }
    // Validación ligera de reglas bonus
    for (const r of editingCampaign.bonusRules || []) {
      if (r.multiplier < 2) { toast.error('El multiplicador debe ser >= 2'); return; }
      if (!r.days?.length) { toast.error('Cada regla bonus necesita al menos un día'); return; }
      if (r.endTime <= r.startTime) { toast.error('La hora final debe ser mayor a la inicial'); return; }
    }
    saveCampaign(editingCampaign);
    toast.success('Campaña guardada');
    setEditingCampaign(null);
    onSaved();
  }, [editingCampaign, onSaved]);

  const startNewCampaign = useCallback(() => {
    setEditingCampaign({
      id: `camp-${Date.now()}`,
      name: '',
      branch: '',
      startDate: new Date().toISOString().slice(0, 10),
      endDate: '',
      status: 'draft',
      milestones: [],
      bonusRules: [],
      termsAndConditions: '',
      createdAt: new Date().toISOString(),
    });
  }, []);

  const startEditCampaign = useCallback((campaign: Campaign) => {
    setEditingCampaign({
      ...campaign,
      branch: campaign.branch || campaign.name,
      bonusRules: campaign.bonusRules || [],
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingCampaign(null);
  }, []);

  return {
    editingCampaign, setEditingCampaign,
    newMilestoneName, setNewMilestoneName,
    newMilestonePoints, setNewMilestonePoints,
    newMilestoneDesc, setNewMilestoneDesc,
    addMilestone, removeMilestone, saveCampaignChanges,
    startNewCampaign, startEditCampaign, cancelEdit,
    addBonusRule, updateBonusRule, removeBonusRule,
  };
}
