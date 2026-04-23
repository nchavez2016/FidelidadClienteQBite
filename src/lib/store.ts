/**
 * @deprecated Façade kept for backwards compatibility.
 *
 * The real implementation lives in `src/services/`. New code should import
 * from `@/services` directly. This file only re-exports the public API so
 * existing imports (`@/lib/store`) keep working without UI changes.
 *
 * When migrating to Supabase, replace each domain service in
 * `src/services/*.service.ts` with async clients — this file does not
 * need to change.
 */
export * from '@/services';
