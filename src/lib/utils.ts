import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface BranchAccent {
  bg: string;
  bgStrong: string;
  color: string;
  border: string;
  borderStrong: string;
  label: 'Express' | 'Matriz';
}

export function getBranchAccent(branch: string | undefined | null): BranchAccent | null {
  const b = (branch || '').toLowerCase();
  if (b.includes('express')) {
    return {
      bg: 'rgba(201,168,76,0.10)',
      bgStrong: 'rgba(201,168,76,0.22)',
      color: '#8a6d1f',
      border: 'rgba(201,168,76,0.30)',
      borderStrong: '#C9A84C',
      label: 'Express',
    };
  }
  if (b.includes('matriz')) {
    return {
      bg: 'rgba(27,58,107,0.07)',
      bgStrong: 'rgba(27,58,107,0.16)',
      color: '#1B3A6B',
      border: 'rgba(27,58,107,0.22)',
      borderStrong: '#1B3A6B',
      label: 'Matriz',
    };
  }
  return null;
}
