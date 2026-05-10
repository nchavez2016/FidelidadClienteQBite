import { useContext } from 'react';
import { AuthContext, type AuthContextValue, type AppRole } from '@/contexts/AuthContext';

export type { AppRole };

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>');
  return ctx;
}