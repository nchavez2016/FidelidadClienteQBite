/**
 * SupabaseDriver — DbDriver implementation backed by `@/integrations/supabase/client`.
 *
 * Generic pass-through: table names are taken verbatim, rows are shuttled
 * as-is. Domain services are responsible for mapping between Supabase
 * snake_case columns and the in-app camelCase shape.
 *
 * Phase 4: only branches + campaigns are wired to this driver from their
 * respective services. The shared `dbAdapter` keeps using LocalStorageDriver
 * for every other entity until later phases.
 */
import { supabase } from '@/integrations/supabase/client';
import type { DbDriver, RowLike } from './DbDriver';

export class SupabaseDriver implements DbDriver {
  async getAll<T extends RowLike = RowLike>(table: string): Promise<T[]> {
    const { data, error } = await supabase.from(table as never).select('*');
    if (error) throw error;
    return (data ?? []) as unknown as T[];
  }

  async getById<T extends RowLike = RowLike>(table: string, id: string): Promise<T | null> {
    const { data, error } = await supabase
      .from(table as never)
      .select('*')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as unknown as T | null;
  }

  async insert<T extends RowLike>(table: string, row: T): Promise<T> {
    const { data, error } = await supabase
      .from(table as never)
      .insert(row as never)
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as T;
  }

  async update<T extends RowLike>(table: string, id: string, patch: Partial<T>): Promise<T | null> {
    const { data, error } = await supabase
      .from(table as never)
      .update(patch as never)
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as unknown as T | null;
  }

  async delete(table: string, id: string): Promise<void> {
    const { error } = await supabase.from(table as never).delete().eq('id', id);
    if (error) throw error;
  }
}

/** Singleton — services that opt into Supabase share this instance. */
export const supabaseDriver = new SupabaseDriver();