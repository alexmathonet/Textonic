// Affiche le rapport d'évaluation sur le jeu synthétique étiqueté.
import { EVALUATION_CASES } from '../src/data/evaluationCases';
import { runEvaluation } from '../src/domain/evaluation';

const r = runEvaluation(EVALUATION_CASES);
const pct = (x: { num: number; den: number; value: number | null }) => (x.value === null ? `n/d (${x.num}/${x.den})` : `${(x.value * 100).toFixed(0)} % (${x.num}/${x.den})`);
console.log(`Échantillon : ${r.sampleSize} cas`, r.tagCounts);
console.log('\nPar détecteur (tous niveaux)');
for (const row of r.rowsOverall) console.log(`  ${row.detectorId.padEnd(18)} n=${row.n} TP=${row.tp} FP=${row.fp} FN=${row.fn} TN=${row.tn} non-exéc=${row.notExecuted} P=${pct(row.precision)} R=${pct(row.recall)}`);
console.log('\nSûreté', { unauthorized: r.unauthorizedExecutions, forbiddenAccess: r.forbiddenAccess, forbiddenExtractions: r.forbiddenExtractions, stale: r.staleAfterRevocation, sensitiveLeaks: r.sensitiveLeaks, raw: r.rawDataInStore, insufficient: r.insufficient });
console.log('\nCas avec erreur :');
for (const c of r.cases) for (const o of c.outcomes) {
  if (o.status === 'non_execute') continue;
  const pred = o.status === 'detected';
  if (pred !== (o.label === 'positive') || (o.label === 'insufficient' && o.status !== 'insufficient_evidence')) console.log(`  ${c.id} ${o.detectorId} label=${o.label} status=${o.status} — ${c.description}`);
}
