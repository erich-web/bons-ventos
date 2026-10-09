/* Componentes de sensibilidade (tornado e heatmap) compartilhados entre Scenario Lab e apresentação. */
import type { TornadoRow, HeatGrid, MetricKey } from '../engine/analysis';
import { fmtM, fmtPct, fmtX } from '../lib/format';

export function fmtMetric(key: MetricKey, v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  if (key === 'irrProject' || key === 'irrEquity' || key === 'investorIRR' || key === 'existingIRR') return fmtPct(v);
  if (key === 'dscrMin') return fmtX(v);
  if (key === 'investorMOIC') return fmtX(v, 1);
  return fmtM(v);
}
/** Métrica "boa" quando maior (todas exceto necessidade de capital e exposição, que são negativas/maiores = pior). */
export function higherIsBetter(key: MetricKey): boolean {
  return key !== 'equityNeed' && key !== 'maxExposure';
}
/** Valor "ruim" em termos absolutos (VPL negativo, TIR abaixo da taxa de desconto, DSCR < 1). */
export function isBad(key: MetricKey, v: number | null, hurdle: { discountRate: number }): boolean {
  if (v == null) return true;
  if (key === 'npvProject' || key === 'npvEquity' || key === 'investorNPV') return v < 0;
  if (key === 'irrProject' || key === 'irrEquity' || key === 'investorIRR' || key === 'existingIRR') return v < hurdle.discountRate;
  if (key === 'dscrMin') return v < 1;
  if (key === 'investorMOIC') return v < 1;
  return false;
}

/** Tornado em divs: para cada driver, barra do valor-base até o valor com driver no mínimo e no máximo. */
export function Tornado({ rows, metric, limit }: { rows: TornadoRow[]; metric: MetricKey; limit?: number }) {
  const data = (limit ? rows.slice(0, limit) : rows).filter((r) => r.base != null);
  if (!data.length) return <div className="text-[13px] text-ink-3">Sem dados de sensibilidade.</div>;
  const base = data[0].base ?? 0;
  const span = Math.max(1e-9, ...data.map((r) => Math.max(Math.abs((r.low ?? base) - base), Math.abs((r.high ?? base) - base))));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-ink-3 mb-2">
        <span>Driver (variação testada)</span>
        <span>Base: <span className="num text-ink text-[13px]">{fmtMetric(metric, base)}</span></span>
      </div>
      <div className="space-y-1.5">
        {data.map((r) => {
          const ends = [r.low, r.high].map((v, i) => ({ v: v ?? base, label: i === 0 ? r.lowLabel : r.highLabel }));
          return (
            <div key={r.id} className="grid grid-cols-[180px_1fr] items-center gap-3">
              <div className="text-[12px] text-ink-2 leading-tight truncate" title={r.label}>{r.label}<div className="text-[10px] text-ink-3">{r.lowLabel} → {r.highLabel}</div></div>
              <div className="relative h-7">
                <div className="absolute inset-y-0 left-1/2 w-px bg-ink-3/60" />
                {ends.map((e, i) => {
                  const d = e.v - base;
                  const w = (Math.abs(d) / span) * 40;
                  const positive = d >= 0;
                  if (i === 1 && d === 0 && (ends[0].v - base) === 0) return null;
                  return (
                    <div key={i}>
                      <div className={`absolute top-1 bottom-1 ${positive ? 'bg-green-3' : 'bg-rust'} opacity-85`} style={positive ? { left: '50%', width: `${w}%` } : { right: '50%', width: `${w}%` }} title={`${e.label}: ${fmtMetric(metric, e.v)}`} />
                      <span className={`absolute top-1/2 -translate-y-1/2 text-[10px] tnum text-ink-2 whitespace-nowrap`} style={positive ? { left: `calc(50% + ${w}% + 4px)` } : { right: `calc(50% + ${w}% + 4px)` }}>{fmtMetric(metric, e.v)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex gap-4 text-[11px] text-ink-3 mt-3">
        <span className="flex items-center gap-1.5"><i className="w-3 h-2 bg-green-3 inline-block" /> acima do base</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-2 bg-rust inline-block" /> abaixo do base</span>
      </div>
    </div>
  );
}

function mix(a: [number, number, number], b: [number, number, number], t: number) {
  const c = a.map((x, i) => Math.round(x + (b[i] - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
const SAND: [number, number, number] = [232, 223, 207];
const GREEN: [number, number, number] = [46, 107, 90];
const RUST: [number, number, number] = [154, 91, 63];

/** Heatmap em grade de divs; escala sequencial areia → verde; células "ruins" em ferrugem. */
export function Heatmap({ grid, metric, discountRate }: { grid: HeatGrid; metric: MetricKey; discountRate: number }) {
  const flat = grid.values.flat().filter((v): v is number => v != null && Number.isFinite(v));
  const min = Math.min(...flat), max = Math.max(...flat);
  const hib = higherIsBetter(metric);
  const color = (v: number | null) => {
    if (v == null) return { background: '#F1EBE0', color: '#7C8782' };
    if (isBad(metric, v, { discountRate })) { const t = max === min ? 0.5 : (v - min) / (max - min); return { background: mix(RUST, SAND, hib ? t : 1 - t), color: hib && t < 0.45 ? '#FAF7F1' : '#1C2421' }; }
    let t = max === min ? 0.5 : (v - min) / (max - min);
    if (!hib) t = 1 - t;
    return { background: mix(SAND, GREEN, t), color: t > 0.55 ? '#FAF7F1' : '#1C2421' };
  };
  return (
    <div className="overflow-x-auto">
      <div className="text-[11px] text-ink-3 mb-1 text-center">{grid.xDriver.label} →</div>
      <div className="grid gap-px" style={{ gridTemplateColumns: `110px repeat(${grid.xLabels.length}, minmax(64px,1fr))` }}>
        <div className="text-[10px] text-ink-3 flex items-end pb-1">{grid.yDriver.label} ↓</div>
        {grid.xLabels.map((x) => <div key={x} className="text-[11px] text-ink-2 text-center tnum pb-1">{x}</div>)}
        {grid.values.map((row, yi) => (
          <div key={yi} className="contents">
            <div className="text-[11px] text-ink-2 tnum pr-2 flex items-center">{grid.yLabels[yi]}</div>
            {row.map((v, xi) => (
              <div key={xi} className="num text-[13px] h-11 flex items-center justify-center rounded-[2px]" style={color(v)} title={`${grid.xDriver.label} ${grid.xLabels[xi]} · ${grid.yDriver.label} ${grid.yLabels[yi]}`}>{fmtMetric(metric, v)}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
