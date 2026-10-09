import { compute } from '../src/engine/compute';
import { excelScenario } from '../src/engine/scenarios';
import fx from '../tests/fixtures/excel-r05-flows.json';
import { yearOf } from '../src/engine/calendar';

const s = excelScenario();
const r = compute(s);
const M = r.monthly;
const F = (fx as any).flows.consolidated;
const col = (c: string) => F.columns[c].values as number[];
const byYear = (vals: number[], dates: string[], sign = 1) => { const o: Record<number, number> = {}; dates.forEach((d, i) => { const y = +d.slice(0, 4); o[y] = (o[y] ?? 0) + sign * (vals[i] ?? 0); }); return o; };
const mine = (ser: number[]) => byYear(ser, M.months);
const map: [string, number[], string[], number][] = [
  ['Receita hotel', M.revHotel, ['AC'], 1], ['Restaurante', M.revRestaurant, ['AH'], 1], ['Eventos', M.revLegacyEvents, ['AM'], 1], ['A&B hósp', M.revFnbGuests, ['AQ'], 1],
  ['Folha', M.payroll, ['BD'], -1], ['Desp A&B', M.costFnb, ['BI'], -1], ['Op diretos', M.opexDirect, ['BQ'], -1], ['Adm', M.opexAdmin, ['CA'], -1], ['Marketing', M.opexMarketing, ['CF'], -1], ['Seguros', M.opexInsurance, ['CK'], -1],
  ['NOI', M.noi, ['CO'], 1], ['Impostos', M.incomeTaxUnlevered, ['DV'], -1], ['CAPEX', M.capex, ['CY', 'DF', 'DN', 'DS'], -1], ['Valor terminal', M.terminalValue, ['EJ'], 1], ['Resultado', M.fcfProject, ['EP'], 1],
  ['Diárias disp', M.roomsAvailable, ['I', 'R'], 1], ['Diárias ocup', M.roomsOccupied, ['L', 'T'], 1],
];
let worst = 0;
for (const [label, ser, cols, sign] of map) {
  const a = mine(ser);
  const b: Record<number, number> = {};
  for (const c of cols) { const o = byYear(col(c), F.dates, sign); for (const k in o) b[+k] = (b[+k] ?? 0) + o[+k]; }
  const ta = Object.values(a).reduce((x, y) => x + y, 0), tb = Object.values(b).reduce((x, y) => x + y, 0);
  const diff = ta - tb; const pct = tb ? diff / Math.abs(tb) : 0;
  worst = Math.max(worst, Math.abs(pct));
  const yrs = [2028, 2030, 2033, 2040, 2050].map((y) => `${y}: ${((a[y] ?? 0) / 1e3).toFixed(0)}/${((b[y] ?? 0) / 1e3).toFixed(0)}`).join('  ');
  console.log(label.padEnd(15), 'total', (ta / 1e6).toFixed(3).padStart(10), 'excel', (tb / 1e6).toFixed(3).padStart(10), 'diff', (diff / 1e3).toFixed(1).padStart(9), 'k', (pct * 100).toFixed(3).padStart(7) + '%', '|', yrs);
}
console.log('IRR projeto', r.metrics.irrProject, 'Excel', 0.26413487440770744);
console.log('NPV', r.metrics.npvProject, 'Excel', 79657854.7);
console.log('maxExp', r.metrics.maxExposure, r.metrics.maxExposureDate, 'Excel', -30381170.48, '2030-05');
console.log('payback', r.metrics.paybackSimple, 'Excel 2033-06');
console.log('months', M.months[0], M.months[M.months.length - 1], M.months.length);
console.log('worst pct', worst);
// VPL estilo Excel: taxa mensal equivalente, meses desde a data-base, fluxos anteriores sem desconto
{
  const rm = Math.pow(1.12, 1 / 12) - 1; const base = M.months.indexOf('2026-03');
  let v = 0; M.fcfProject.forEach((f, i) => { v += f / Math.pow(1 + rm, Math.max(0, i - base)); });
  console.log('NPV estilo Excel', v, 'Excel', 79657854.7, 'diff', v - 79657854.7);
  const m = (await import('../src/engine/finance')).irr(M.fcfProject.slice(M.fcfProject.findIndex(x=>x!==0)), 0.01)!;
  console.log('IRR mensal', m, 'Excel', 0.01972433694450193);
}
