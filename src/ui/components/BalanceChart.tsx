import { formatDateShort } from '../../domain/dates';
import type { ForecastResult } from '../../domain/forecast';
import { formatEUR } from '../../domain/money';

/** Graphique SVG de la projection de solde (sans dépendance externe). */
export function BalanceChart({ forecast }: { forecast: ForecastResult }) {
  const W = 640;
  const H = 220;
  const pad = { l: 64, r: 16, t: 16, b: 30 };
  const values = forecast.points.map((p) => p.balance);
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const span = max - min || 1;
  const x = (i: number) => pad.l + (i / (forecast.points.length - 1)) * (W - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - min) / span) * (H - pad.t - pad.b);

  // Courbe en escalier : le solde change à la date de l'opération.
  let d = `M ${x(0)} ${y(values[0])}`;
  for (let i = 1; i < values.length; i++) d += ` H ${x(i)} V ${y(values[i])}`;

  const minIdx = forecast.points.findIndex((p) => p.date === forecast.minDate);
  const ticks = [max, (max + min) / 2, min];
  const xTicks = [0, 10, 20, 30].filter((i) => i < forecast.points.length);
  const summary = `Projection sur 30 jours : solde actuel ${formatEUR(forecast.openingBalance)}, point bas ${formatEUR(forecast.minBalance)} le ${formatDateShort(forecast.minDate)}.`;

  return (
    <figure style={{ margin: 0 }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="#e3e9f2" />
            <text x={pad.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill="#5b6b80">
              {formatEUR(Math.round(t / 100) * 100).replace(',00', '')}
            </text>
          </g>
        ))}
        {min < 0 && <rect x={pad.l} y={y(0)} width={W - pad.l - pad.r} height={y(min) - y(0)} fill="#fdecea" opacity="0.7" />}
        <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#b3261e" strokeDasharray="4 4" strokeWidth="1.2" />
        <path d={d} fill="none" stroke="#0b4f9c" strokeWidth="2.5" strokeLinejoin="round" />
        {minIdx >= 0 && (
          <g>
            <circle cx={x(minIdx)} cy={y(forecast.minBalance)} r="5" fill={forecast.minBalance < 0 ? '#b3261e' : '#0c7c78'} stroke="#fff" strokeWidth="2" />
          </g>
        )}
        {xTicks.map((i) => (
          <text key={i} x={x(i)} y={H - 8} textAnchor="middle" fontSize="11" fill="#5b6b80">
            {formatDateShort(forecast.points[i].date)}
          </text>
        ))}
      </svg>
      <figcaption className="chart-legend">
        <span><span className="legend-swatch" style={{ background: '#0b4f9c' }} />Solde projeté</span>
        <span><span className="legend-swatch" style={{ background: '#b3261e' }} />Seuil 0 €</span>
        <span>Point bas : <strong>{formatEUR(forecast.minBalance)}</strong> le {formatDateShort(forecast.minDate)}</span>
      </figcaption>
    </figure>
  );
}
