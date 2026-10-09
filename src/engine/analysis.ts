/**
 * Análises derivadas: sensibilidade (grid/tornado), break-even, análise reversa de participação,
 * comparação de modelos de garantia. Todas recomputam o cenário com overrides (função pura).
 */
import type { Scenario, Results, Metrics, Grid } from './types';
import { compute } from './compute';
import { solve } from './finance';

export type Path = string; // ex.: 'hotel.rateNormalYear1' | 'loans.0.spread'

export function getPath(obj: unknown, path: Path): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Record<string, unknown>)[k]), obj);
}
export function setPath<T>(obj: T, path: Path, value: unknown): T {
  const copy = structuredClone(obj);
  const keys = path.split('.');
  let cur = copy as unknown as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]] as Record<string, unknown>;
  cur[keys[keys.length - 1]] = value;
  return copy;
}
/** Multiplica um número, um vetor ou uma grade por um fator. */
export function scalePath<T>(obj: T, path: Path, factor: number): T {
  const v = getPath(obj, path);
  if (typeof v === 'number') return setPath(obj, path, v * factor);
  if (Array.isArray(v)) {
    if (Array.isArray(v[0])) return setPath(obj, path, (v as Grid).map((r) => r.map((x) => Math.min(0.98, x * factor))));
    return setPath(obj, path, (v as number[]).map((x) => x * factor));
  }
  return obj;
}
export function withOverrides(s: Scenario, overrides: { path: Path; value?: unknown; factor?: number }[]): Scenario {
  let out = s;
  for (const o of overrides) out = o.factor !== undefined ? scalePath(out, o.path, o.factor) : setPath(out, o.path, o.value);
  return out;
}

/* ---------------- Drivers de sensibilidade ---------------- */
export interface Driver { id: string; label: string; apply: (s: Scenario, delta: number) => Scenario; unit: 'pct' | 'pp' | 'abs'; range: [number, number]; steps?: number }

const scaleOcc = (s: Scenario, f: number) => withOverrides(s, [{ path: 'hotel.occupancyNormal', factor: f }, { path: 'hotel.occupancySpecial', factor: f }]);
export const DRIVERS: Driver[] = [
  { id: 'occupancy', label: 'Ocupação hoteleira', unit: 'pct', range: [-0.3, 0.3], apply: (s, d) => scaleOcc(s, 1 + d) },
  { id: 'adr', label: 'ADR (diária média)', unit: 'pct', range: [-0.3, 0.3], apply: (s, d) => withOverrides(s, [{ path: 'hotel.rateNormalYear1', factor: 1 + d }, { path: 'hotel.rateSpecialYear1', factor: 1 + d }]) },
  { id: 'weddings', label: 'Nº de casamentos', unit: 'pct', range: [-0.5, 0.5], apply: (s, d) => withOverrides(s, [{ path: 'weddings.countByYear', factor: 1 + d }]) },
  { id: 'weddingTicket', label: 'Ticket de eventos', unit: 'pct', range: [-0.3, 0.3], apply: (s, d) => withOverrides(s, [{ path: 'weddings.roomRate', factor: 1 + d }, { path: 'weddings.cateringPerGuest', factor: 1 + d }, { path: 'weddings.beveragesPerGuest', factor: 1 + d }, { path: 'weddings.venueFee', factor: 1 + d }]) },
  { id: 'fnb', label: 'Receita gastronômica', unit: 'pct', range: [-0.3, 0.3], apply: (s, d) => withOverrides(s, [{ path: 'restaurant.ticketYear1', factor: 1 + d }, { path: 'beachClub.ticket', factor: 1 + d }]) },
  { id: 'opex', label: 'Custos operacionais', unit: 'pct', range: [-0.2, 0.2], apply: (s, d) => withOverrides(s, [{ path: 'opex.direct.utilities', factor: 1 + d }, { path: 'opex.direct.internet', factor: 1 + d }, { path: 'opex.direct.maintenance', factor: 1 + d }, { path: 'restaurant.cmvPct', factor: 1 + d }, { path: 'payroll.positions', value: s.payroll.positions.map((p) => ({ ...p, monthlyCost: p.monthlyCost * (1 + d) })) }]) },
  { id: 'capex', label: 'CAPEX', unit: 'pct', range: [-0.2, 0.3], apply: (s, d) => withOverrides(s, [{ path: 'capex.phase1.scale', factor: 1 + d }, { path: 'capex.phase2.scale', factor: 1 + d }]) },
  { id: 'interest', label: 'Taxa de juros (spread)', unit: 'pp', range: [-0.02, 0.04], apply: (s, d) => ({ ...s, loans: s.loans.map((l) => ({ ...l, spread: l.spread + d })) }) },
  { id: 'term', label: 'Prazo da dívida', unit: 'pct', range: [-0.3, 0.3], apply: (s, d) => ({ ...s, loans: s.loans.map((l) => ({ ...l, totalMonths: Math.round(l.totalMonths * (1 + d)) })) }) },
  { id: 'guaranteeFee', label: 'Custo das garantias', unit: 'pp', range: [-0.01, 0.015], apply: (s, d) => setPath(s, 'guarantees.investor.feePct', Math.max(0, s.guarantees.investor.feePct + d)) },
  { id: 'stake', label: 'Participação do investidor', unit: 'pp', range: [-0.1, 0.15], apply: (s, d) => setPath(s, 'equity.investor.stakeNegotiated', Math.min(0.95, Math.max(0.01, currentStake(s) + d))) },
  { id: 'exitMultiple', label: 'Múltiplo de saída', unit: 'abs', range: [-3, 3], apply: (s, d) => withOverrides(s, [{ path: 'equity.exit.ebitdaMultiple', value: s.equity.exit.ebitdaMultiple + d }, { path: 'valuation.terminal.ebitdaMultiple', value: s.valuation.terminal.ebitdaMultiple + d }]) },
  { id: 'discount', label: 'Taxa de desconto', unit: 'pp', range: [-0.04, 0.04], apply: (s, d) => withOverrides(s, [{ path: 'valuation.discountRateProject', value: s.valuation.discountRateProject + d }, { path: 'valuation.discountRateEquity', value: s.valuation.discountRateEquity + d }]) },
];
export function currentStake(s: Scenario): number {
  const inv = s.equity.investor;
  if (inv.stakeNegotiated != null) return inv.stakeNegotiated;
  const post = s.equity.preMoney + inv.contribution;
  return post > 0 ? inv.contribution / post : 0;
}

export type MetricKey = keyof Pick<Metrics, 'irrProject' | 'npvProject' | 'irrEquity' | 'npvEquity' | 'dscrMin' | 'ebitdaStabilized' | 'equityNeed' | 'maxExposure'> | 'investorIRR' | 'investorNPV' | 'investorMOIC' | 'existingIRR' | 'equityValueDCF';

export function metricOf(r: Results, key: MetricKey): number | null {
  const inv = r.parties[r.parties.length - 1];
  const ex = r.parties[0];
  switch (key) {
    case 'investorIRR': return inv.irr;
    case 'investorNPV': return inv.npv;
    case 'investorMOIC': return inv.moic;
    case 'existingIRR': return ex.irr;
    case 'equityValueDCF': return r.valuation.dcf.equity;
    default: return r.metrics[key] as number | null;
  }
}
export const METRIC_LABELS: Record<MetricKey, string> = {
  irrProject: 'TIR do projeto', npvProject: 'VPL do projeto', irrEquity: 'TIR do equity', npvEquity: 'VPL do equity', dscrMin: 'DSCR mínimo', ebitdaStabilized: 'EBITDA estabilizado', equityNeed: 'Necessidade de capital', maxExposure: 'Exposição máxima',
  investorIRR: 'TIR do investidor', investorNPV: 'VPL do investidor', investorMOIC: 'MOIC do investidor', existingIRR: 'TIR dos sócios atuais', equityValueDCF: 'Equity value (DCF)',
};

/* ---------------- Tornado ---------------- */
export interface TornadoRow { id: string; label: string; low: number | null; high: number | null; base: number | null; lowLabel: string; highLabel: string }
export function tornado(s: Scenario, metric: MetricKey, drivers: Driver[] = DRIVERS, baseResults?: Results): TornadoRow[] {
  const base = metricOf(baseResults ?? compute(s), metric);
  const fmtD = (d: Driver, v: number) => (d.unit === 'pct' ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%` : d.unit === 'pp' ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)} p.p.` : `${v > 0 ? '+' : ''}${v}`);
  return drivers
    .map((d) => {
      const lo = metricOf(compute(d.apply(s, d.range[0])), metric);
      const hi = metricOf(compute(d.apply(s, d.range[1])), metric);
      return { id: d.id, label: d.label, low: lo, high: hi, base, lowLabel: fmtD(d, d.range[0]), highLabel: fmtD(d, d.range[1]) };
    })
    .sort((a, b) => Math.abs((b.high ?? 0) - (b.low ?? 0)) - Math.abs((a.high ?? 0) - (a.low ?? 0)));
}

/* ---------------- Grade 2D (heatmap) ---------------- */
export interface HeatGrid { xLabels: string[]; yLabels: string[]; values: (number | null)[][]; xDriver: Driver; yDriver: Driver }
export function heatmap(s: Scenario, metric: MetricKey, xDriver: Driver, yDriver: Driver, steps = 5): HeatGrid {
  const xs = linspace(xDriver.range[0], xDriver.range[1], steps);
  const ys = linspace(yDriver.range[0], yDriver.range[1], steps);
  const lab = (d: Driver, v: number) => (d.unit === 'pct' ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%` : d.unit === 'pp' ? `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}pp` : `${v > 0 ? '+' : ''}${v}`);
  const values = ys.map((y) => xs.map((x) => metricOf(compute(yDriver.apply(xDriver.apply(s, x), y)), metric)));
  return { xLabels: xs.map((x) => lab(xDriver, x)), yLabels: ys.map((y) => lab(yDriver, y)), values, xDriver, yDriver };
}
function linspace(a: number, b: number, n: number): number[] {
  return Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1));
}

/* ---------------- Break-even ---------------- */
/** Fator de ocupação (multiplicador sobre as grades) em que o VPL do projeto = 0 ou o DSCR mínimo = 1. */
export function breakEvenOccupancy(s: Scenario, target: 'npv' | 'dscr' = 'npv'): { factor: number; occupancy: number } | null {
  const g = (f: number) => { const r = compute(scaleOcc(s, f)); return target === 'npv' ? r.metrics.npvProject : (r.metrics.dscrMin ?? 10); };
  const f = solve(g, target === 'npv' ? 0 : 1, 0.05, 1.6);
  if (f === null) return null;
  const r = compute(scaleOcc(s, f));
  return { factor: f, occupancy: r.metrics.occupancyStabilized };
}
/** Número de casamentos/ano (estabilizado) para VPL do projeto = 0, mantendo o resto. */
export function breakEvenWeddings(s: Scenario): number | null {
  if (!s.weddings.enabled) return null;
  const last = s.weddings.countByYear[s.weddings.countByYear.length - 1] || 1;
  const g = (f: number) => compute(withOverrides(s, [{ path: 'weddings.countByYear', factor: f }])).metrics.npvProject;
  const f = solve(g, 0, 0, 3);
  return f === null ? null : f * last;
}

/* ---------------- Análise reversa ---------------- */
export interface ReverseInput { contribution: number; guaranteeCommitted: number; guaranteeFeePct: number; targetIRR: number; horizonYears: number }
export function requiredStake(s: Scenario, inp: ReverseInput): { stake: number | null; results: Results | null } {
  const base = withOverrides(s, [
    { path: 'equity.investor.contribution', value: inp.contribution }, { path: 'guarantees.investor.committed', value: inp.guaranteeCommitted },
    { path: 'guarantees.investor.feePct', value: inp.guaranteeFeePct }, { path: 'equity.investor.targetIRR', value: inp.targetIRR },
    { path: 'equity.investor.horizonYears', value: inp.horizonYears }, { path: 'equity.exit.year', value: inp.horizonYears },
  ]);
  const g = (stake: number) => compute(setPath(base, 'equity.investor.stakeNegotiated', stake)).parties.slice(-1)[0].irr;
  const stake = solve(g, inp.targetIRR, 0.005, 0.95);
  if (stake === null) return { stake: null, results: null };
  return { stake, results: compute(setPath(base, 'equity.investor.stakeNegotiated', stake)) };
}

/* ---------------- Comparação de modelos de garantia ---------------- */
export interface GuaranteeComparison { model: 'A' | 'B' | 'C'; label: string; costTotal: number; costPV: number; investorIRR: number | null; investorNPV: number; existingIRR: number | null; dilution: number; results: Results }
export function compareGuaranteeModels(s: Scenario): GuaranteeComparison[] {
  const labels = { A: 'A — Fee anual', B: 'B — Fee diferido', C: 'C — Participação adicional' } as const;
  return (['A', 'B', 'C'] as const).map((m) => {
    const r = compute(setPath(s, 'guarantees.investor.model', m));
    const inv = r.parties[r.parties.length - 1];
    return { model: m, label: labels[m], costTotal: r.metrics.guaranteeCostTotal, costPV: r.metrics.guaranteeCostPV, investorIRR: inv.irr, investorNPV: inv.npv, existingIRR: r.parties[0].irr, dilution: r.metrics.dilution, results: r };
  });
}
