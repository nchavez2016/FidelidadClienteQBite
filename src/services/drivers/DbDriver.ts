/**
 * DbDriver — persistence contract.
 *
 * Defines the async, Supabase-shaped CRUD contract that any storage
 * backend must implement (LocalStorage today, Supabase tomorrow).
 *
 * A separate `SyncKeyValueDriver` interface keeps the legacy synchronous
 * helpers used by current services and session slots. It is intentionally
 * marked transitional: the Supabase driver will not implement it — once
 * all callers move to async, this interface (and its consumers) disappear.
 */

export interface RowLike {
  id: string;
  [k: string]: unknown;
}

/** Async CRUD contract — the future-facing API. */
export interface DbDriver {
  /** Read all rows from a table. */
  getAll<T extends RowLike = RowLike>(table: string): Promise<T[]>;

  /** Read a single row by id, or null if not found. */
  getById<T extends RowLike = RowLike>(table: string, id: string): Promise<T | null>;

  /** Insert a row. Generates an id if missing. Returns the inserted row. */
  insert<T extends RowLike>(table: string, row: T): Promise<T>;

  /** Patch a row by id. Returns the updated row, or null if not found. */
  update<T extends RowLike>(table: string, id: string, patch: Partial<T>): Promise<T | null>;

  /** Delete a row by id. */
  delete(table: string, id: string): Promise<void>;
}

/**
 * Synchronous key/value contract — TRANSITIONAL.
 *
 * Used by current services (session slots, legacy sync reads/writes).
 * Will be removed after the async migration. The Supabase driver does
 * NOT need to implement this interface.
 */
export interface SyncKeyValueDriver {
  readSync<T = unknown>(table: string): T[];
  writeSync<T>(table: string, rows: T[]): void;
  readValueSync<T>(table: string, fallback: T): T;
  writeValueSync<T>(table: string, value: T): void;
  removeSync(table: string): void;
}