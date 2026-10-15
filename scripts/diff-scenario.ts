import { baseScenario } from '../src/engine/scenarios';
import { compute } from '../src/engine/compute';
import fs from 'fs';
const cand = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const base = baseScenario();
const diffs: string[] = [];
function walk(a: any, b: any, path: string) {
  if (path.includes('excelSeries') || path === 'provenance' || ['id','name','kind','description','createdAt','updatedAt'].includes(path)) return;
  if (typeof a !== 'object' || a === null || typeof b !== 'object' || b === null) { if (JSON.stringify(a) !== JSON.stringify(b)) diffs.push(`${path}: ${JSON.stringify(a)} → ${JSON.stringify(b)}`); return; }
  if (Array.isArray(a) && Array.isArray(b) && a.length !== b.length) { diffs.push(`${path}: array ${a.length} → ${b.length}`); return; }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) walk(a[k], b[k], path ? `${path}.${k}` : k);
}
walk(base, cand, '');
console.log(diffs.join('\n'));
const r0 = compute(base), r1 = compute(cand);
const f = (r: any) => `TIR ${(r.metrics.irrProject*100).toFixed(1)}% VPL ${(r.metrics.npvProject/1e6).toFixed(1)} EBITDA ${(r.metrics.ebitdaStabilized/1e6).toFixed(1)} capex ${(r.metrics.capexTotal/1e6).toFixed(1)} dscr ${r.metrics.dscrMin?.toFixed(2)} inv ${(r.parties.at(-1).irr*100).toFixed(1)}% stake ${(r.capTable.at(-1).stakePost*100).toFixed(1)}%`;
console.log('BASE ', f(r0)); console.log('IAN  ', f(r1)); console.log('alerts', r1.alerts.map((a:any)=>a.code).join(','));
