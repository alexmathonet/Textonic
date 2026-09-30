import type { Minor } from './types';

const fmt = new Intl.NumberFormat('fr-BE', { style: 'currency', currency: 'EUR' });

/** Formate un montant en centimes en euros (affichage uniquement). */
export function formatEUR(minor: Minor): string {
  return fmt.format(minor / 100);
}

/** Convertit des euros en centimes entiers (fixtures uniquement). */
export function eur(amount: number): Minor {
  return Math.round(amount * 100);
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export function formatPct(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits).replace('.', ',')} %`;
}
