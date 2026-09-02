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
      bg: 'rgba(232,161,69,0.10)',
      bgStrong: 'rgba(232,161,69,0.22)',
      color: '#8a6d1f',
      border: 'rgba(232,161,69,0.30)',
      borderStrong: '#E8A145',
      label: 'Express',
    };
  }
  if (b.includes('matriz')) {
    return {
      bg: 'rgba(11,24,30,0.07)',
      bgStrong: 'rgba(11,24,30,0.16)',
      color: '#0B181E',
      border: 'rgba(11,24,30,0.22)',
      borderStrong: '#0B181E',
      label: 'Matriz',
    };
  }
  return null;
}
