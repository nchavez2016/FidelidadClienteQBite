export type UserRole = 'customer' | 'cashier' | 'admin';

export type Gender = 'masculino' | 'femenino' | 'otro';

export interface Customer {
  id: string;
  phone: string;
  name: string;
  gender: Gender;
  /** Puntos por campaña (clave = campaignId). Reemplaza al antiguo `points`. */
  /**
   * @deprecated Los puntos viven ahora en la tabla `customer_campaign_points`.
   * Se mantiene esta propiedad sólo como caché de lectura para no romper la UI
   * actual; será eliminada cuando los componentes consuman el servicio async.
   */
  pointsByCampaign: Record<string, number>;
  /** IDs de campañas cuyos T&C ya fueron aceptados. */
  acceptedCampaigns: string[];
  /** @deprecated mantenido temporalmente por compat de migración */
  points?: number;
  /** @deprecated migrado a acceptedCampaigns */
  acceptedCampaignId?: string;
  /** Soft-delete: false = cuenta dada de baja. Default true. */
  isActive?: boolean;
  /** Marca temporal de la baja lógica (ISO). */
  deletedAt?: string;
  createdAt: string;
}

export interface StaffUser {
  id: string;
  username: string;
  role: 'cashier' | 'admin';
  name: string;
  /** Sucursal/campaña activa de la sesión del staff. */
  branchCampaignId?: string;
  /** Si está activo. Inactivo = no puede iniciar sesión. Default true. */
  active?: boolean;
}

export type TransactionType =
  | 'accumulation'
  | 'redemption'
  | 'reversal'
  | 'terms_acceptance'
  | 'redemption_request'
  | 'redemption_request_cancelled';

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
  /** Multiplicador aplicado a una acumulación (>1 indica bonus activo). */
  bonusMultiplier?: number;
  /** Id de la regla de bonus aplicada (para trazabilidad/auditoría). */
  bonusRuleId?: string;
  /** Etiqueta legible de la regla de bonus aplicada. */
  bonusRuleLabel?: string;
  createdAt: string;
}

export interface Milestone {
  id: string;
  requiredPoints: number;
  rewardName: string;
  description?: string;
  order: number;
}

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'finished';

/**
 * Regla de bonificación de puntos (acelerador de hábito).
 * Aplica un multiplicador (x2, x3, etc.) a las acumulaciones que ocurran
 * en los días y franja horaria configurados. Es opcional y no obligatoria;
 * si ninguna regla activa coincide, se acumula el punto base (x1).
 */
export interface BonusRule {
  id: string;
  /** Etiqueta descriptiva opcional (ej: "Doble gaviota lunes 9-12"). */
  label?: string;
  /** Multiplicador entero (>=2). */
  multiplier: number;
  /** Días de la semana (0=Domingo, 1=Lunes, ... 6=Sábado). */
  days: number[];
  /** Hora de inicio en formato HH:mm (24h, hora local). */
  startTime: string;
  /** Hora de fin en formato HH:mm (24h, hora local). Exclusivo. */
  endTime: string;
  /** Si está activa. Permite pausar reglas sin borrarlas. */
  active: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  /** Nombre corto de la sucursal asociada (ej: "Gaviota Azul Express"). */
  branch: string;
  startDate: string;
  endDate: string;
  status: CampaignStatus;
  milestones: Milestone[];
  /** Reglas de bonificación opcionales (días/horas con multiplicador). */
  bonusRules?: BonusRule[];
  termsAndConditions: string;
  createdAt: string;
}

export type RedemptionRequestStatus = 'pending' | 'approved' | 'cancelled';

/**
 * Solicitud de canje iniciada por el cliente.
 * El cajero/admin debe aprobarla para que se materialice como transacción.
 */
export interface RedemptionRequest {
  id: string;
  customerId: string;
  campaignId: string;
  rewardId: string;
  rewardName: string;
  requiredPoints: number;
  status: RedemptionRequestStatus;
  /** Quién resolvió la solicitud (staff o el propio cliente al cancelar). */
  resolvedBy?: 'customer' | 'staff';
  resolvedByStaffId?: string;
  resolvedByStaffName?: string;
  resolvedAt?: string;
  createdAt: string;
}

// ===== LOPDP: consentimiento explícito =====

export type ConsentType = 'fidelity_phone_usage';

export interface ConsentRecord {
  id: string;
  userId: string;
  consentType: ConsentType;
  accepted: boolean;
  legalVersion: string;
  acceptedAt: string;
  revokedAt?: string;
  ipAddress?: string;
  userAgent?: string;
  channel: 'web' | 'staff' | 'mobile';
}

// ===== Audit log básico =====

export type AuditAction =
  | 'consent_accepted'
  | 'consent_revoked'
  | 'customer_deactivated'
  | 'customer_reactivated'
  | 'staff_login'
  | 'customer_login';

export interface AuditLogEntry {
  id: string;
  action: AuditAction;
  actorId?: string;
  actorRole?: UserRole;
  targetUserId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Puntos por (cliente, campaña) — fila normalizada.
 * Reemplaza el embedido `customer.pointsByCampaign`.
 */
export interface CustomerCampaignPoints {
  id: string; // `${customerId}:${campaignId}`
  customerId: string;
  campaignId: string;
  points: number;
  updatedAt: string;
}
