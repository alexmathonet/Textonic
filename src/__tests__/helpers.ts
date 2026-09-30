import { buildCustomerData } from '../data/builder';
import { camille } from '../data/personas';
import { defaultConsent } from '../domain/consent';
import type { ConsentLevel, ConsentRecord, Transaction } from '../domain/types';

export const ASOF = camille.referenceDate;

export function camilleData() {
  return buildCustomerData(camille, ASOF);
}

export function consentAt(level: ConsentLevel, patch: Partial<ConsentRecord> = {}): ConsentRecord {
  return { ...defaultConsent('test'), level, ...patch };
}

export const withExternal = (c: ConsentRecord, ids = ['ext-horizon']): ConsentRecord => ({
  ...c,
  externalAuthorization: { simulated: true, accountIds: ids, grantedAt: 'test' },
});

let seq = 0;
export function tx(date: string, amount: number, category: string, counterpartyId: string, status: Transaction['status'] = 'booked'): Transaction {
  return { id: `t${seq++}`, date, amount, category, label: `Libellé ${counterpartyId}`, counterpartyId, status };
}
