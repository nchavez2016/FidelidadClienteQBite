export type UserRole = 'customer' | 'cashier' | 'admin';

export type Gender = 'masculino' | 'femenino' | 'otro';

export interface Customer {
  id: string;
  phone: string;
  name: string;
  password: string;
  gender: Gender;
  /** Puntos por campaña (clave = campaignId). Reemplaza al antiguo `points`. */
  pointsByCampaign: Record<string, number>;
  /** IDs de campañas cuyos T&C ya fueron aceptados. */
  acceptedCampaigns: string[];
  /** @deprecated mantenido temporalmente por compat de migración */
  points?: number;
  /** @deprecated migrado a acceptedCampaigns */
  acceptedCampaignId?: string;
  createdAt: string;
}

export interface StaffUser {
  id: string;
  username: string;
  password: string;
  role: 'cashier' | 'admin';
  name: string;
  /** Sucursal/campaña activa de la sesión del staff. */
  branchCampaignId?: string;
}

export type TransactionType = 'accumulation' | 'redemption' | 'reversal';

export type CommentCategory = 'positive' | 'complaint' | 'observation' | 'promotion' | 'suggestion' | 'other';

export interface Transaction {
  id: string;
  customerId: string;
  /** Campaña/sucursal a la que pertenece la transacción. */
  campaignId: string;
  type: TransactionType;
  points: number; // positive for accumulation, negative for redemption/reversal
  balanceAfter: number;
  rewardId?: string;
  rewardName?: string;
  staffId: string;
  staffName: string;
  commentCategory?: CommentCategory;
  commentText?: string;
  reversedTransactionId?: string;
  isReversed?: boolean;
  createdAt: string;
}

export interface Milestone {
  id: string;
  requiredPoints: number;
  rewardName: string;
  description?: string;
  order: number;
}

export type CampaignStatus = 'draft' | 'active' | 'finished';

export interface Campaign {
  id: string;
  name: string;
  /** Nombre corto de la sucursal asociada (ej: "Gaviota Azul Express"). */
  branch: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  milestones: Milestone[];
  termsAndConditions: string;
  createdAt: string;
}
