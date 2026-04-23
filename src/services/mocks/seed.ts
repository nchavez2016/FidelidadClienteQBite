/**
 * Demo / seed data.
 *
 * This file is the single source of mock content. When migrating to
 * Supabase, this file can be deleted (or moved to a `supabase/seed.sql`).
 */
import { Campaign, Customer, Milestone, StaffUser, Transaction } from '@/lib/types';
import { EXPRESS_ID, MATRIZ_ID } from '@/services/storage/keys';

function daysAgo(days: number, hour: number, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

const expressMilestones: Milestone[] = [
  { id: 'mx1', requiredPoints: 3, rewardName: 'Bebida cortesía', description: 'Una bebida natural a elección', order: 1 },
  { id: 'mx2', requiredPoints: 6, rewardName: 'Entrada del día', description: 'Entrada de la casa', order: 2 },
  { id: 'mx3', requiredPoints: 10, rewardName: 'Ceviche mixto', description: 'Ceviche mixto de cortesía', order: 3 },
  { id: 'mx4', requiredPoints: 15, rewardName: 'Combo Express VIP', description: 'Combo VIP completo', order: 4 },
];

const matrizMilestones: Milestone[] = [
  { id: 'mm1', requiredPoints: 5, rewardName: 'Postre cortesía', description: 'Postre de la casa', order: 1 },
  { id: 'mm2', requiredPoints: 10, rewardName: 'Plato a elección', description: 'Plato fuerte a elección', order: 2 },
  { id: 'mm3', requiredPoints: 15, rewardName: 'Cena para 2', description: 'Cena completa para dos personas', order: 3 },
  { id: 'mm4', requiredPoints: 20, rewardName: 'Experiencia gastronómica', description: 'Experiencia completa Matriz', order: 4 },
];

export const SEED_CAMPAIGNS: Campaign[] = [
  {
    id: EXPRESS_ID,
    name: 'Ruta del Sabor Express',
    branch: 'Gaviota Azul Express',
    startDate: '2024-01-01',
    endDate: '2025-12-31',
    status: 'active',
    milestones: expressMilestones,
    termsAndConditions:
      'Cada compra mayor a $5 acumula 1 punto en la sucursal Express. Los puntos no son transferibles entre sucursales. Premios sujetos a disponibilidad.',
    createdAt: new Date().toISOString(),
  },
  {
    id: MATRIZ_ID,
    name: 'Ruta del Sabor Matriz',
    branch: 'Gaviota Azul',
    startDate: '2024-01-01',
    endDate: '2025-12-31',
    status: 'active',
    milestones: matrizMilestones,
    termsAndConditions:
      'Cada compra mayor a $8 acumula 1 punto en la sucursal Matriz. Los puntos son independientes por sucursal. Premios sujetos a disponibilidad.',
    createdAt: new Date().toISOString(),
  },
];

export const SEED_CUSTOMERS: Customer[] = [
  { id: 'cust-demo-1', phone: '0990000001', name: 'María José', password: '0990000001', gender: 'femenino', pointsByCampaign: { [EXPRESS_ID]: 7, [MATRIZ_ID]: 4 }, acceptedCampaigns: [], createdAt: daysAgo(18, 12) },
  { id: 'cust-demo-2', phone: '0990000002', name: 'Carlos Vega', password: '1234', gender: 'masculino', pointsByCampaign: { [EXPRESS_ID]: 3, [MATRIZ_ID]: 1 }, acceptedCampaigns: [EXPRESS_ID], createdAt: daysAgo(15, 13) },
  { id: 'cust-demo-3', phone: '0990000003', name: 'Andrea Ruiz', password: '1234', gender: 'femenino', pointsByCampaign: { [EXPRESS_ID]: 12, [MATRIZ_ID]: 8 }, acceptedCampaigns: [EXPRESS_ID, MATRIZ_ID], createdAt: daysAgo(12, 14) },
  { id: 'cust-demo-4', phone: '0990000004', name: 'Alex Paredes', password: '0990000004', gender: 'otro', pointsByCampaign: { [EXPRESS_ID]: 0, [MATRIZ_ID]: 2 }, acceptedCampaigns: [], createdAt: daysAgo(9, 11) },
];

export const SEED_STAFF: StaffUser[] = [
  { id: 'admin-1', username: 'admin', password: 'admin123', role: 'admin', name: 'Administrador', branchCampaignId: EXPRESS_ID },
  { id: 'cashier-1', username: 'cajero', password: 'cajero123', role: 'cashier', name: 'Cajero Express', branchCampaignId: EXPRESS_ID },
  { id: 'cashier-2', username: 'cajero2', password: 'cajero123', role: 'cashier', name: 'Cajero Matriz', branchCampaignId: MATRIZ_ID },
];

export const SEED_TRANSACTIONS: Transaction[] = [
  { id: 'tx-demo-1', customerId: 'cust-demo-1', campaignId: EXPRESS_ID, type: 'accumulation', points: 1, balanceAfter: 1, staffId: 'cashier-1', staffName: 'Cajero Express', commentCategory: 'positive', commentText: 'Excelente atención y servicio rápido.', createdAt: daysAgo(8, 12) },
  { id: 'tx-demo-2', customerId: 'cust-demo-2', campaignId: EXPRESS_ID, type: 'accumulation', points: 1, balanceAfter: 1, staffId: 'cashier-1', staffName: 'Cajero Express', commentCategory: 'complaint', commentText: 'La espera fue larga al mediodía.', createdAt: daysAgo(7, 13, 30) },
  { id: 'tx-demo-3', customerId: 'cust-demo-1', campaignId: EXPRESS_ID, type: 'accumulation', points: 1, balanceAfter: 2, staffId: 'admin-1', staffName: 'Administrador', commentCategory: 'suggestion', commentText: 'Sería ideal una promo para almuerzos ejecutivos.', createdAt: daysAgo(6, 14) },
  { id: 'tx-demo-4', customerId: 'cust-demo-3', campaignId: MATRIZ_ID, type: 'accumulation', points: 1, balanceAfter: 6, staffId: 'cashier-2', staffName: 'Cajero Matriz', commentCategory: 'observation', commentText: 'Hoy llegó con grupo familiar completo.', createdAt: daysAgo(5, 15) },
  { id: 'tx-demo-5', customerId: 'cust-demo-2', campaignId: MATRIZ_ID, type: 'accumulation', points: 1, balanceAfter: 1, staffId: 'cashier-2', staffName: 'Cajero Matriz', commentCategory: 'promotion', commentText: 'Usó la promoción del combo de camarón.', createdAt: daysAgo(4, 13) },
  { id: 'tx-demo-6', customerId: 'cust-demo-1', campaignId: EXPRESS_ID, type: 'redemption', points: -3, balanceAfter: 4, rewardId: 'mx1', rewardName: 'Bebida cortesía', staffId: 'admin-1', staffName: 'Administrador', commentCategory: 'other', commentText: 'Canje validado en caja sin novedad.', createdAt: daysAgo(3, 16) },
  { id: 'tx-demo-7', customerId: 'cust-demo-4', campaignId: MATRIZ_ID, type: 'accumulation', points: 1, balanceAfter: 1, staffId: 'cashier-2', staffName: 'Cajero Matriz', commentCategory: 'suggestion', commentText: 'Sugiere incluir opción más picante en Santa Prisca.', createdAt: daysAgo(2, 19) },
  { id: 'tx-demo-8', customerId: 'cust-demo-2', campaignId: EXPRESS_ID, type: 'reversal', points: -1, balanceAfter: 2, staffId: 'admin-1', staffName: 'Administrador', commentCategory: 'complaint', commentText: 'Se anuló un punto por cobro duplicado.', createdAt: daysAgo(1, 13, 15) },
  { id: 'tx-demo-9', customerId: 'cust-demo-3', campaignId: EXPRESS_ID, type: 'accumulation', points: 1, balanceAfter: 12, staffId: 'cashier-1', staffName: 'Cajero Express', commentCategory: 'positive', commentText: 'Regresó por recomendación de amigos.', createdAt: daysAgo(1, 20) },
  { id: 'tx-demo-10', customerId: 'cust-demo-3', campaignId: MATRIZ_ID, type: 'accumulation', points: 1, balanceAfter: 7, staffId: 'cashier-2', staffName: 'Cajero Matriz', commentCategory: 'positive', commentText: 'Cliente fiel, vino con su pareja.', createdAt: daysAgo(3, 14) },
  { id: 'tx-demo-11', customerId: 'cust-demo-3', campaignId: MATRIZ_ID, type: 'accumulation', points: 1, balanceAfter: 8, staffId: 'cashier-2', staffName: 'Cajero Matriz', commentCategory: 'observation', commentText: 'Pidió plato especial de la casa.', createdAt: daysAgo(1, 18) },
  { id: 'tx-demo-12', customerId: 'cust-demo-4', campaignId: MATRIZ_ID, type: 'accumulation', points: 1, balanceAfter: 2, staffId: 'cashier-2', staffName: 'Cajero Matriz', commentCategory: 'promotion', commentText: 'Aprovechó promoción de fin de semana.', createdAt: daysAgo(0, 13) },
];
