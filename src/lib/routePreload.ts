/**
 * Centralized lazy-route loaders.
 *
 * Each loader memoizes its dynamic import so calling it on hover/focus
 * warms the chunk cache; the subsequent navigation resolves instantly
 * without showing a Suspense flash.
 */
function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => (p ??= fn().catch((err) => {
    p = null;
    throw err;
  }));
}

export const loadCustomerLoginPage = once(() => import('@/pages/CustomerLogin'));
export const loadCustomerRegisterPage = once(() => import('@/pages/CustomerRegister'));
export const loadCustomerDashboardPage = once(() => import('@/pages/CustomerDashboard'));
export const loadStaffLoginPage = once(() => import('@/pages/StaffLogin'));
export const loadStaffPanelPage = once(() => import('@/pages/StaffPanel'));
export const loadNotFoundPage = once(() => import('@/pages/NotFound'));