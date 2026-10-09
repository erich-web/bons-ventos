import { compute } from '../src/engine/compute';
import { excelScenario, baseScenario, conservativeScenario, optimisticScenario } from '../src/engine/scenarios';
const s = excelScenario(); s.hotel.phase2.enabled = false;
const r = compute(s);
console.log('F1 IRR', r.metrics.irrProject, 'Excel 0.22045', 'maxExp', r.metrics.maxExposure, r.metrics.maxExposureDate, 'Excel -23571792 2028-06', 'TV', r.monthly.terminalValue.at(-1), 'Excel 237245909', 'payback', r.metrics.paybackSimple, 'Excel 2033-08');
for (const sc of [baseScenario(), conservativeScenario(), optimisticScenario()]) {
  const t0 = performance.now(); const rr = compute(sc); const dt = performance.now() - t0;
  const m = rr.metrics;
  console.log(`\n== ${sc.name} (${dt.toFixed(1)} ms) months=${rr.monthly.months.length}`);
  console.log(' capex', (m.capexTotal/1e6).toFixed(2), 'P1', (m.capexP1/1e6).toFixed(2), 'debt', (m.debtTotal/1e6).toFixed(2), 'equityCalls', (m.equityNeed/1e6).toFixed(2), 'maxExp', (m.maxExposure/1e6).toFixed(2), m.maxExposureDate);
  console.log(' rev stab', (m.revenueStabilized/1e6).toFixed(2), 'ebitda', (m.ebitdaStabilized/1e6).toFixed(2), 'margin', (m.ebitdaMarginStabilized*100).toFixed(1), 'occ', (m.occupancyStabilized*100).toFixed(1), 'adr', m.adrStabilized.toFixed(0), 'revpar', m.revparStabilized.toFixed(0), 'year', m.stabilizedYear);
  console.log(' IRR proj', m.irrProject, 'noTV', m.irrProjectNoTV, 'NPV', (m.npvProject/1e6).toFixed(2), 'IRR eq', m.irrEquity, 'NPV eq', (m.npvEquity/1e6).toFixed(2), 'payback', m.paybackSimple, 'dscrMin', m.dscrMin, m.dscrMinYear, 'dscrAvg', m.dscrAvg);
  console.log(' guarantees req peak', (m.guaranteeRequiredPeak/1e6).toFixed(2), 'committed peak', (m.guaranteeCommittedPeak/1e6).toFixed(2), 'cost', (m.guaranteeCostTotal/1e6).toFixed(2), 'PV', (m.guaranteeCostPV/1e6).toFixed(2));
  console.log(' valuation dcf EV', (rr.valuation.dcf.ev/1e6).toFixed(1), 'eq', (rr.valuation.dcf.equity/1e6).toFixed(1), 'tv share', rr.valuation.dcf.tvShareOfEv.toFixed(2), 'mult EV', (rr.valuation.multiple.ev/1e6).toFixed(1));
  console.log(' captable', rr.capTable.map(c=>`${c.name} ${(c.stakePost*100).toFixed(1)}%`).join(', '));
  for (const p of rr.parties) console.log('  ', p.name.padEnd(16), 'in', (p.totalIn/1e6).toFixed(2), 'out', (p.totalOut/1e6).toFixed(2), 'irr', p.irr===null?null:(p.irr*100).toFixed(1)+'%', 'moic', p.moic.toFixed(2));
  console.log(' alerts', rr.alerts.map(a=>a.code+': '+a.message).join(' | '));
  const yrs = rr.annual.filter(a=>a.year>=2028 && a.year<=2036);
  console.log(' year   rev    hotel  wedd   fnb    ebitda  tax   capex  debtSvc  fcfP   fcfE  calls dist  dscr');
  for (const a of yrs) console.log(' ', a.year, [a.revenueGross,a.revHotel,a.revWeddings,a.revFnb,a.ebitda,a.incomeTaxLevered,a.capex,a.debtService,a.fcfProject,a.fcfEquity,a.equityCalls,a.distributions].map(v=>(v/1e6).toFixed(1).padStart(6)).join(' '), a.dscr.toFixed(2));
}
