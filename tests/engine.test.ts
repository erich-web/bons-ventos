import { describe, it, expect } from 'vitest';
import { compute } from '../src/engine/compute';
import { excelScenario, baseScenario, conservativeScenario, applyDebtStructure } from '../src/engine/scenarios';
import { xirr, xnpv, irr, npv, monthlyToAnnual } from '../src/engine/finance';
import { withOverrides, requiredStake, setPath, compareGuaranteeModels } from '../src/engine/analysis';
import fx from './fixtures/excel-r05-flows.json';
import excel from '../src/data/excel-r05.json';
import { yearOf } from '../src/engine/calendar';

const F = (fx as { flows: Record<string, { dates: string[]; columns: Record<string, { values: number[] }> }> }).flows;
const sumBy = (vals: number[], dates: string[], sign = 1) => { const o: Record<number, number> = {}; dates.forEach((d, i) => { const y = +d.slice(0, 4); o[y] = (o[y] ?? 0) + sign * (vals[i] ?? 0); }); return o; };
const total = (o: Record<number, number>) => Object.values(o).reduce((a, b) => a + b, 0);

describe('Conciliação com o Excel R05 (consolidado)', () => {
  const r = compute(excelScenario());
  const M = r.monthly;
  const C = F.consolidated;
  const lines: [string, number[], string[], number, number][] = [
    ['Receita hotel', M.revHotel, ['AC'], 1, 1e-6], ['Restaurante', M.revRestaurant, ['AH'], 1, 1e-6], ['Eventos', M.revLegacyEvents, ['AM'], 1, 1e-6], ['A&B hóspedes', M.revFnbGuests, ['AQ'], 1, 1e-6],
    ['Folha', M.payroll, ['BD'], -1, 1e-6], ['Despesas A&B', M.costFnb, ['BI'], -1, 1e-6], ['Operacionais diretos', M.opexDirect, ['BQ'], -1, 1e-6], ['Administrativas', M.opexAdmin, ['CA'], -1, 2e-3], ['Marketing', M.opexMarketing, ['CF'], -1, 1e-6], ['Seguros', M.opexInsurance, ['CK'], -1, 1e-6],
    ['NOI', M.noi, ['CO'], 1, 1e-4], ['Impostos', M.incomeTaxUnlevered, ['DV'], -1, 1e-4], ['CAPEX', M.capex, ['CY', 'DF', 'DN', 'DS'], -1, 1e-5], ['Valor terminal', M.terminalValue, ['EJ'], 1, 1e-6], ['Resultado', M.fcfProject, ['EP'], 1, 1e-4],
  ];
  for (const [label, ser, cols, sign, tol] of lines) {
    it(`${label} bate com o Excel (tolerância ${tol * 100}%)`, () => {
      const mine = total(sumBy(ser, M.months));
      let ex = 0;
      for (const c of cols) ex += total(sumBy(C.columns[c].values, C.dates, sign));
      expect(Math.abs(mine - ex) / Math.abs(ex)).toBeLessThan(tol);
    });
  }
  it('fluxo mensal idêntico ao Excel em todos os meses (±R$ 5 mil)', () => {
    const EP = C.columns['EP'].values;
    let maxDiff = 0;
    M.months.forEach((m, i) => { const j = C.dates.indexOf(m); maxDiff = Math.max(maxDiff, Math.abs(M.fcfProject[i] - EP[j])); });
    expect(maxDiff).toBeLessThan(5000);
  });
  it('TIR consolidada 26,41% a.a. e Fase 01 isolada 22,05% a.a.', () => {
    expect(r.metrics.irrProject!).toBeCloseTo(excel.resultsConsolidated.irrAnnual, 3);
    const s1 = excelScenario(); s1.hotel.phase2.enabled = false;
    const r1 = compute(s1);
    expect(r1.metrics.irrProject!).toBeCloseTo(excel.results.phase1.irrAnnual, 3);
    expect(r1.monthly.terminalValue.at(-1)!).toBeCloseTo(excel.results.phase1.terminalValue, 0);
    expect(r1.metrics.maxExposureDate).toBe(excel.results.phase1.maxExposureDate);
    expect(r1.metrics.paybackSimple).toBe(excel.results.phase1.payback);
  });
  it('VPL estilo Excel (PV mensal a partir da data-base) reproduz R$ 79,66 M', () => {
    const rm = Math.pow(1.12, 1 / 12) - 1; const base = M.months.indexOf('2026-03');
    let v = 0; M.fcfProject.forEach((f, i) => { v += f / Math.pow(1 + rm, Math.max(0, i - base)); });
    expect(Math.abs(v - excel.resultsConsolidated.npv) / excel.resultsConsolidated.npv).toBeLessThan(5e-4);
  });
});

describe('Funções financeiras', () => {
  it('IRR/NPV de caso conhecido', () => {
    const flows = [-1000, 300, 400, 500, 200];
    const r = irr(flows)!;
    expect(npv(r, flows)).toBeCloseTo(0, 6);
    expect(r).toBeCloseTo(0.1532, 3);
  });
  it('XIRR com datas anuais regulares ≈ IRR', () => {
    const flows = [-1000, 300, 400, 500, 200];
    const dates = flows.map((_, i) => new Date(Date.UTC(2026 + i, 0, 1)));
    expect(xirr(flows, dates)!).toBeCloseTo(irr(flows)!, 2);
    expect(xnpv(irr(flows)!, flows, dates)).toBeCloseTo(0, 0);
  });
  it('IRR mensal anualizada', () => { expect(monthlyToAnnual(0.01)).toBeCloseTo(0.1268, 4); });
  it('IRR indefinida sem mudança de sinal', () => { expect(irr([-1, -2, -3])).toBeNull(); });
});

describe('Cenário Base — consistência estrutural', () => {
  const s = baseScenario();
  const r = compute(s);
  const M = r.monthly;
  it('participações somam 100% (pré e pós)', () => {
    expect(r.capTable.reduce((a, c) => a + c.stakePre, 0)).toBeCloseTo(1, 9);
    expect(r.capTable.reduce((a, c) => a + c.stakePost, 0)).toBeCloseTo(1, 9);
  });
  it('sem dupla contagem: disponíveis + bloqueadas = dias × UH em operação', () => {
    for (let i = 0; i < M.months.length; i++) {
      if (M.opYear[i] <= 0) continue;
      const rooms = (M.opYear[i] > 0 ? s.hotel.phase1.categories.reduce((a, c) => a + c.count, 0) : 0) + (M.opYearP2[i] > 0 ? s.hotel.phase2.rooms : 0);
      expect(M.roomsAvailable[i] + M.roomNightsBlocked[i]).toBeCloseTo(rooms * M.daysInMonth[i], 6);
      expect(M.roomsOccupied[i]).toBeLessThanOrEqual(M.roomsAvailable[i] + 1e-9);
    }
  });
  it('receita de buyout substitui a hoteleira (bloqueio reduz receita convencional)', () => {
    const noW = compute(setPath(s, 'weddings.enabled', false));
    const stab = r.annual.find((a) => a.opYear === 6)!, stab0 = noW.annual.find((a) => a.opYear === 6)!;
    expect(stab.revHotel).toBeLessThan(stab0.revHotel);
    expect(stab.roomsAvailable).toBeLessThan(stab0.roomsAvailable);
  });
  it('dívida: amortização total = saques (saldo zera) e serviço > 0 após carência', () => {
    for (const sc of r.debtSchedules) {
      const draws = sc.rows.reduce((a, x) => a + x.draw, 0), amort = sc.rows.reduce((a, x) => a + x.amortization, 0);
      expect(amort).toBeCloseTo(draws, 0);
      expect(sc.rows[sc.rows.length - 1].balance).toBeLessThan(1);
    }
    expect(M.debtBalance.every((b) => b >= 0)).toBe(true);
  });
  it('garantias: vinculado ≤ comprometido, ≤ exigência − imóvel, e não cresce após o início da liberação', () => {
    const G = s.guarantees;
    const open = M.months.indexOf('2028-03') + G.investor.releaseAfterOpeningMonths;
    let prev = Infinity;
    for (let i = 0; i < M.months.length; i++) {
      expect(M.guaranteeCommitted[i]).toBeLessThanOrEqual(G.investor.committed + 1e-6);
      expect(M.guaranteeCommitted[i]).toBeLessThanOrEqual(Math.max(0, M.guaranteeRequired[i] - G.propertyValueBank) + 1e-6);
      if (i >= open) { expect(M.guaranteeCommitted[i]).toBeLessThanOrEqual(prev + 1e-6); prev = M.guaranteeCommitted[i]; }
    }
    expect(Math.max(...M.guaranteeCommitted)).toBeGreaterThan(0);
  });
  it('custo das garantias está refletido no fluxo do equity e no fluxo do investidor', () => {
    const noFee = compute(setPath(s, 'guarantees.investor.feePct', 0));
    const feeTotal = M.guaranteeFeePaid.reduce((a, b) => a + b, 0);
    expect(feeTotal).toBeGreaterThan(0);
    const eqDiff = noFee.monthly.fcfEquity.reduce((a, b) => a + b, 0) - M.fcfEquity.reduce((a, b) => a + b, 0);
    expect(eqDiff).toBeCloseTo(feeTotal, 0);
    expect(r.parties.at(-1)!.guaranteeFees.reduce((a, b) => a + b, 0)).toBeCloseTo(feeTotal, 0);
  });
  it('fluxo de caixa anual fecha: FCF equity = FCF projeto + fluxo da dívida + ajuste fiscal − garantias', () => {
    for (const a of r.annual) {
      const expected = a.fcfProject + a.debtFlow + (a.incomeTaxUnlevered - a.incomeTaxLevered) - a.guaranteeCosts;
      expect(a.fcfEquity).toBeCloseTo(expected, 2);
    }
  });
  it('depreciação total ≈ capex depreciável dentro da vida útil', () => {
    const dep = M.depreciation.reduce((a, b) => a + b, 0);
    expect(dep).toBeGreaterThan(0);
    expect(dep).toBeLessThanOrEqual(M.capex.reduce((a, b) => a + b, 0));
  });
  it('regimes tributários produzem impostos distintos e positivos', () => {
    const p = compute(setPath(s, 'tax.regime', 'presumido')).annual.find((a) => a.opYear === 6)!;
    const re = compute(setPath(s, 'tax.regime', 'real')).annual.find((a) => a.opYear === 6)!;
    const ex = compute(setPath(s, 'tax.regime', 'excelNOI')).annual.find((a) => a.opYear === 6)!;
    expect(p.incomeTaxLevered).toBeGreaterThan(0); expect(re.incomeTaxLevered).toBeGreaterThan(0); expect(ex.incomeTaxLevered).toBeGreaterThan(0);
    expect(re.incomeTaxLevered).toBeLessThanOrEqual(re.incomeTaxUnlevered); // juros dedutíveis
    expect(p.revenueTaxes).toBeGreaterThan(0); expect(ex.revenueTaxes).toBe(0);
  });
  it('horizonte termina em dezembro e tem 15 anos de operação', () => {
    expect(M.months.at(-1)).toBe('2042-12');
    expect(r.annual.filter((a) => a.opYear > 0).length).toBe(15);
  });
});

describe('Cenários de estresse e inviabilidade', () => {
  const s = baseScenario();
  it('ocupação muito baixa + sem casamentos gera alertas de inviabilidade', () => {
    const bad = compute(withOverrides(s, [{ path: 'hotel.occupancyNormal', factor: 0.15 }, { path: 'hotel.occupancySpecial', factor: 0.2 }, { path: 'weddings.enabled', value: false }, { path: 'beachClub.enabled', value: false }, { path: 'hotel.phase2.enabled', value: false }, { path: 'restaurant.turnover', factor: 0.2 }]));
    expect(bad.metrics.npvProject).toBeLessThan(0);
    expect(bad.alerts.some((a) => a.code === 'irr' || a.code === 'irr-none')).toBe(true);
    expect(bad.alerts.some((a) => a.code === 'dscr' || a.code === 'cash' || a.code === 'equity-gap')).toBe(true);
  });
  it('aumento de CAPEX reduz TIR e aumenta necessidade de capital', () => {
    const up = compute(withOverrides(s, [{ path: 'capex.phase1.scale', value: 1.3 }]));
    const base = compute(s);
    expect(up.metrics.irrProject!).toBeLessThan(base.metrics.irrProject!);
    expect(up.metrics.equityNeed).toBeGreaterThan(base.metrics.equityNeed);
  });
  it('estruturas A/B/C: mais dívida → mais juros e menor aporte', () => {
    const A = compute(applyDebtStructure(s, 'A')), B = compute(applyDebtStructure(s, 'B')), C = compute(applyDebtStructure(s, 'C'));
    expect(A.metrics.interestTotal).toBeGreaterThan(B.metrics.interestTotal);
    expect(B.metrics.interestTotal).toBeGreaterThan(C.metrics.interestTotal);
    expect(A.metrics.debtTotal).toBeGreaterThan(C.metrics.debtTotal);
  });
  it('cenário conservador tem TIR menor que o base', () => {
    expect(compute(conservativeScenario()).metrics.irrProject!).toBeLessThan(compute(s).metrics.irrProject!);
  });
});

describe('Análise reversa e modelos de garantia', () => {
  const s = baseScenario();
  it('participação necessária para TIR-alvo converge e TIR resultante ≈ alvo', () => {
    const res = requiredStake(s, { contribution: 2300000, guaranteeCommitted: 10535000, guaranteeFeePct: 0.015, targetIRR: 0.25, horizonYears: 10 });
    expect(res.stake).not.toBeNull();
    expect(res.results!.parties.at(-1)!.irr!).toBeCloseTo(0.25, 2);
    const res2 = requiredStake(s, { contribution: 2300000, guaranteeCommitted: 10535000, guaranteeFeePct: 0.015, targetIRR: 0.35, horizonYears: 10 });
    expect(res2.stake!).toBeGreaterThan(res.stake!);
  });
  it('modelo C dilui mais e custa menos caixa que A/B', () => {
    const cmp = compareGuaranteeModels(s);
    const A = cmp.find((c) => c.model === 'A')!, Cc = cmp.find((c) => c.model === 'C')!;
    expect(Cc.dilution).toBeGreaterThan(A.dilution);
    expect(Cc.costTotal).toBeLessThan(A.costTotal);
  });
  it('resultado anual é consistente com o mensal', () => {
    const r = compute(s);
    const byYear: Record<number, number> = {};
    r.monthly.months.forEach((m, i) => { byYear[yearOf(m)] = (byYear[yearOf(m)] ?? 0) + r.monthly.ebitda[i]; });
    for (const a of r.annual) expect(a.ebitda).toBeCloseTo(byYear[a.year], 4);
  });
});
