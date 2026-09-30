import type { ISODate } from './types';

const DAY_MS = 86_400_000;

export function toUTC(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day);
}

export function fromUTC(t: number): ISODate {
  return new Date(t).toISOString().slice(0, 10);
}

export function isValidISODate(d: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  return fromUTC(toUTC(d)) === d;
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromUTC(toUTC(d) + n * DAY_MS);
}

/** Nombre de jours de `a` à `b` (positif si b est après a). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / DAY_MS);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

/** Date du mois donné au jour `day`, bornée au dernier jour du mois. */
export function dateInMonth(year: number, month1: number, day: number): ISODate {
  const d = Math.min(Math.max(1, day), daysInMonth(year, month1));
  return `${year}-${String(month1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function monthKey(d: ISODate): string {
  return d.slice(0, 7);
}

export function parts(d: ISODate): { y: number; m: number; d: number } {
  const [y, m, day] = d.split('-').map(Number);
  return { y, m, d: day };
}

/** Liste des mois (année, mois 1-12) couvrant [from, to]. */
export function monthsBetween(from: ISODate, to: ISODate): { y: number; m: number }[] {
  const out: { y: number; m: number }[] = [];
  let { y, m } = parts(from);
  const end = parts(to);
  while (y < end.y || (y === end.y && m <= end.m)) {
    out.push({ y, m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

export function addMonths(d: ISODate, n: number): ISODate {
  const p = parts(d);
  const total = p.y * 12 + (p.m - 1) + n;
  return dateInMonth(Math.floor(total / 12), (total % 12) + 1, p.d);
}

const longFmt = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function formatDateLong(d: ISODate): string {
  return longFmt.format(new Date(toUTC(d)));
}

export function formatDateShort(d: ISODate): string {
  return shortFmt.format(new Date(toUTC(d)));
}

export function formatMonth(d: ISODate): string {
  return monthFmt.format(new Date(toUTC(d)));
}
