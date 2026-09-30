// Outil de développement : affiche les conclusions du moteur pour chaque persona et niveau.
import { buildCustomerData } from '../src/data/builder';
import { PERSONAS } from '../src/data/personas';
import { defaultConsent } from '../src/domain/consent';
import { runAnticipation } from '../src/domain/engine';
import type { ConsentLevel } from '../src/domain/types';

for (const p of PERSONAS) {
  const data = buildCustomerData(p, p.referenceDate);
  for (const level of ['essentiel', 'conseils', 'complete'] as ConsentLevel[]) {
    const consent = { ...defaultConsent('t'), level, externalAuthorization: level === 'complete' ? { simulated: true as const, accountIds: ['ext-horizon'], grantedAt: 't' } : null };
    const { store, audit } = runAnticipation({ data, consent, asOf: p.referenceDate });
    console.log(`\n${p.id} / ${level} — exécutés: ${audit.executed.join(',')} — extraits: ${audit.extractedScopes.join(',')} — exclus: ${audit.excludedTransactions}`);
    for (const c of Object.values(store.conclusions)) {
      if (!c) continue;
      console.log(`  ${c.detectorId.padEnd(18)} ${c.status.padEnd(22)} score=${c.score} seuil=${c.threshold} signaux=${c.signals.map((s) => `${s.id}:${s.state}`).join(' ')}`);
    }
  }
}
