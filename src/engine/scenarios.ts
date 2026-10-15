/**
 * Cenários: "Excel R05" (réplica fiel do modelo original, inclusive seus erros, para conciliação)
 * e cenários revisados (Base, Conservador, Otimista) com premissas novas marcadas por origem.
 */
import excel from '../data/excel-r05.json';
import ianErich from '../data/modelo-base-ian-erich.json';
import type { Scenario, ProvenanceMap, StaffPosition, CapexItemSeries, Grid, LoanAssumptions, YM } from './types';

type ExcelData = typeof excel;
const X = excel as ExcelData;

const rep = (v: number, n = 12) => new Array(n).fill(v);
const gridOf = (v: number): Grid => Array.from({ length: 6 }, () => rep(v));
const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o));

/* Mapeamento posição da folha → histograma (nomes diferem entre as abas) */
const HISTO_MAP: Record<string, string> = {
  Gerente: 'Gerente', 'Recepção | Adm': 'Recepeção | Adminstrativo', 'Chefe Bar': 'Chefe | Bar', 'Barman | Garçom': 'Barman | Garçom',
  'Chefe de Cozinha': 'Chefe de Cozinha', 'Chefe Cozinha Jr': 'Chefe de Cozinha Jr.', 'Auxiliar de Cozinha Café': 'Auxiliar de Cozinha Café',
  Segurança: 'Segurança', 'Limpeza e Manutenção': 'Limpeza | Manuntenção',
};
export const COST_CENTER: Record<string, StaffPosition['costCenter']> = {
  Gerente: 'admin', 'Recepção | Adm': 'hotel', 'Chefe Bar': 'fnb', 'Barman | Garçom': 'fnb', 'Chefe de Cozinha': 'fnb', 'Chefe Cozinha Jr': 'fnb',
  'Auxiliar de Cozinha Café': 'fnb', Segurança: 'hotel', 'Limpeza e Manutenção': 'hotel',
};

export function excelPositions(): StaffPosition[] {
  return X.payroll.positions.map((p) => {
    const h = X.histogram.find((x) => x.name === HISTO_MAP[p.name]);
    return { name: p.name, costCenter: 'hotel', monthlyCost: p.monthlyCost, headcount: h ? clone(h.headcount) : gridOf(0) };
  });
}

const CAPEX_GROUP: Record<string, CapexItemSeries['group']> = {
  CR: 'construction', CS: 'construction', CT: 'construction', CU: 'construction', CV: 'construction', CW: 'construction', CX: 'construction',
  DA: 'ffe', DB: 'ffe', DC: 'ffe', DD: 'ffe', DE: 'ffe',
  DH: 'projects', DI: 'projects', DJ: 'projects', DK: 'projects', DL: 'projects', DM: 'projects',
  DP: 'land', DQ: 'land', DR: 'land', DX: 'other', BX: 'preop', BY: 'preop',
};
function excelCapexSeries(phase: 'phase1' | 'phase2', baseDate: YM) {
  const src = X.flowSeries[phase];
  const items: CapexItemSeries[] = Object.entries(src.columns).map(([code, c]) => {
    const vals = c.values.slice();
    // BX/BY (Adm realizados) só até a data-base; depois são calculados pelo motor
    if (code === 'BX' || code === 'BY') for (let k = 0; k < vals.length; k++) if (src.dates[k] > baseDate) vals[k] = 0;
    // DX "Outras receitas" (crédito) → tratado como preop com sinal invertido (receita realizada)
    return { code, label: c.label, group: CAPEX_GROUP[code] ?? 'other', values: vals };
  });
  // comprime: remove itens totalmente zerados
  return { constructionStart: X.dates[phase].constructionStart as YM, dates: src.dates as YM[], items: items.filter((it) => it.values.some((v) => v !== 0)) };
}

export function excelScenario(): Scenario {
  const baseDate = X.meta.baseDate as YM;
  const prov: ProvenanceMap = {};
  const P = (key: string, ref: string, note?: string) => { prov[key] = { source: 'excel', status: 'original', ref, note }; };
  P('hotel', 'CENARIO!P10:BJ109'); P('restaurant', 'CENARIO!P77:BJ105'); P('payroll', 'CENARIO!P152:P162 + HISTOGRAMA'); P('opex', 'CENARIO!P168:P210');
  P('capex', 'FLUXO EV!CR:DS (séries mensais)'); P('tax', 'CENARIO!P223 (22,5% × NOI)'); P('valuation', 'CENARIO!B215:AT215, K323'); P('calendar', 'CENARIO!P23:P27, BQ2');
  P('loans', 'CENARIO!P270:P280 (tranches zeradas)'); P('equity', 'FLUXO EV!EU:EZ (aportes Karel/RPE/Pascoal)');
  const s: Scenario = {
    id: 'excel-r05', name: 'Excel R05 (original)', kind: 'excel',
    description: 'Réplica do modelo BARR_EVB R05 com as mesmas premissas e a mesma lógica de cálculo (inclusive erros identificados), usada para conciliação.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    calendar: { modelStart: '2024-01', baseDate, horizonYears: 20, flowEnd: X.dates.phase1.flowEnd as YM, inflation: 0.045 },
    hotel: {
      phase1: { enabled: true, label: 'Fase 01', constructionStart: X.dates.phase1.constructionStart as YM, constructionMonths: X.dates.phase1.constructionMonths, openingLagMonths: 2, rooms: X.areas.phase1.rooms, categories: [], seatShare: X.restaurant.seatShare.phase1, rateCalendar: 'own' },
      phase2: { enabled: true, label: 'Fase 02', constructionStart: X.dates.phase2.constructionStart as YM, constructionMonths: X.dates.phase2.constructionMonths, openingLagMonths: 2, rooms: X.areas.phase2.rooms, categories: [], seatShare: X.restaurant.seatShare.phase2, rateCalendar: 'phase1' },
      occupancyNormal: clone(X.hotel.occupancyNormal), daysNormal: clone(X.hotel.daysNormal),
      rateNormalYear1: clone(X.hotel.rateNormalYear1), rateGrowth: clone(X.hotel.rateGrowth), rateLongTermGrowth: X.hotel.rateGrowth[4], rateLongTermMode: 'excel',
      occupancySpecial: clone(X.hotel.occupancySpecial), rateSpecialYear1: clone(X.hotel.rateSpecialYear1), rateSpecialGrowth: clone(X.hotel.rateSpecialGrowth), rateSpecialLongTermGrowth: 0,
      guestsPerRoom: clone(X.hotel.guestsPerRoom), shareOTA: clone(X.hotel.shareOTA), otaCommission: X.opexDirect.otaCommission, variableCostPerRoomNight: 0, averageStayNights: 3,
    },
    weddings: defaultWeddings(false),
    restaurant: {
      seats: clone(X.restaurant.seats), turnover: clone(X.restaurant.turnover), ticketYear1: clone(X.restaurant.ticketYear1), ticketGrowth: clone(X.restaurant.ticketGrowth), ticketLongTermGrowth: 0,
      legacyEvents: { perMonth: clone(X.events.perMonth), pax: clone(X.events.pax), ticketYear1: clone(X.events.ticketYear1), ticketGrowth: clone(X.events.ticketGrowth), longTermGrowth: 0 },
      guestsTicketYear1: clone(X.fnbGuests.ticketYear1), guestsTicketGrowth: clone(X.fnbGuests.ticketGrowth), guestsTicketLongTermGrowth: 0, guestsTicketBasis: 'roomNight',
      taxPct: X.fnbCosts.taxes, cmvPct: X.fnbCosts.cmv, cmoVarPct: X.fnbCosts.cmoVar, cmoFixedMonthly: X.fnbCosts.cmoFixedMonthly, otherDirectPct: 0,
    },
    beachClub: defaultBeachClub(false),
    payroll: { positions: excelPositions(), chargesFactor: X.payroll.chargesFactor, plrPct: X.payroll.plr, plrBase: 'excelHotel', inflation: X.payroll.inflation },
    opex: {
      inflationMode: 'excel',
      direct: { internet: X.opexDirect.internet, utilities: X.opexDirect.utilities, maintenance: X.opexDirect.maintenance, laundryPerRoomNight: X.opexDirect.laundryPerRoomNight, inflation: X.opexDirect.inflation },
      admin: { items: X.opexAdmin.items.map((it) => ({ name: it.name, monthly: it.monthly })), inflation: X.opexAdmin.inflation },
      marketing: { pctHotelRevenue: X.marketing.pctHotelRevenue, printMonthly: X.marketing.printMonthly, inflation: X.marketing.inflation },
      insurance: { monthly: X.insurance.monthly, iptuAnnual: X.insurance.iptuAnnual, iptuMonth: 2, inflation: X.insurance.inflation },
      operator: { mode: 'own', baseFeePctRevenue: 0, incentiveFeePctGOP: 0, ownCorporateMonthly: 0 },
      phase2FixedCostFactor: 1,
      ffeReserve: { pctRevenue: 0, startYear: 3 }, preOpening: { total: 0, monthsBefore: 6 }, workingCapital: { receivableDays: 0, payableDays: 0 },
    },
    capex: {
      phase1: { mode: 'excel', scale: 1, excelSeries: excelCapexSeries('phase1', baseDate), parametric: { items: [] }, contingencyPct: 0 },
      phase2: { mode: 'excel', scale: 1, excelSeries: excelCapexSeries('phase2', baseDate), parametric: { items: [] }, contingencyPct: 0 },
      includeSunk: true, depreciation: { constructionYears: 25, ffeYears: 10 },
    },
    tax: { regime: 'excelNOI', excelRateOnNOI: X.tax.rateOnNOI, hotelISS: 0.05, pisCofinsPresumido: 0.0365, pisCofinsReal: 0.0925, irpj: 0.15, irpjAdicional: 0.10, irpjAdicionalThresholdMonthly: 20000, csll: 0.09, presumidoBaseHotelIRPJ: 0.32, presumidoBaseHotelCSLL: 0.32, presumidoBaseFnbIRPJ: 0.08, presumidoBaseFnbCSLL: 0.12, lossCarryforwardCap: 0.3 },
    loans: [excelLoan(1), excelLoan(2)],
    guarantees: { enabled: false, requiredPctOfLoan: 0.8, propertyValueBank: 6025000, evolutionaryPct: 0, investor: { committed: 0, model: 'A', feePct: 0.015, startDate: null, indexed: false, deferredAccrualRate: 0.12, deferredPaymentStartMonthsAfterOpening: 12, extraStakePct: 0, releaseAfterOpeningMonths: 12, releaseWithAmortization: true, setupCost: 0, maintenanceCostAnnual: 0 } },
    equity: {
      partners: [{ name: 'Karel', stakePre: 0.40, capitalInvested: 854300 }, { name: 'RPE', stakePre: 0.30, capitalInvested: 849165 }, { name: 'Pascoal', stakePre: 0.30, capitalInvested: 849165 }],
      landValueMarket: 6025000, landValueBank: 6025000, otherAssets: 0, liabilities: 0, preMoney: 0,
      investor: { name: 'Novo investidor', contribution: 0, stakeNegotiated: null, closingDate: '2027-01', targetIRR: 0.20, horizonYears: 10 },
      existingAdditionalContribution: 0, callAllocation: 'investorFirst',
      distribution: { payoutPct: 1, minCashReserve: 0, startMonthsAfterOpening: 0, blockedWhileDSCRBelow: 0 },
      preferredReturn: { enabled: false, ratePct: 0 }, exit: { year: 10, method: 'none', ebitdaMultiple: 8 },
    },
    valuation: { discountRateProject: X.discountRate, discountRateEquity: X.discountRate, terminal: { method: 'noiMultiple', growth: 0.03, ebitdaMultiple: 8, noiMultiple: X.terminal.noiMultiple }, valuationDate: null },
    provenance: prov,
  };
  return s;
}

function excelLoan(phase: 1 | 2): LoanAssumptions {
  const f = phase === 1 ? X.financing.phase1 : X.financing.phase2;
  return {
    id: `bnb-f${phase}`, label: `BNB — Fase 0${phase}`, phase, enabled: false, amount: 0, disbursement: 'tranches',
    tranches: f.tranches.filter((t) => t.date).map((t) => ({ date: t.date as YM, amount: t.amount })), proCapexStart: null, financedPct: 0.9,
    indexer: 'inflation', spread: f.rate, bonusAdimplencia: 0, graceMonths: f.graceMonths, interestDuringGrace: 'pay', totalMonths: f.graceMonths + f.amortMonths, system: 'SAC',
    structuringPct: f.structuringPct, insurancePctAnnual: 0, recurringMonthly: f.recurring, extraAmortizations: [], minDSCR: 1.3,
  };
}

export function defaultWeddings(enabled: boolean): Scenario['weddings'] {
  return {
    enabled,
    countByYear: [6, 10, 14, 17, 18, 18], monthWeights: [0.6, 0.4, 0.3, 0.3, 0.5, 0.8, 1.2, 1.4, 1.6, 1.6, 1.4, 0.9],
    guests: 90, nights: 3, roomsBlocked: 'all', roomRate: 2800, priceGrowth: 0.045,
    venueFee: 25000, welcomePartyPerGuest: 280 * 1.1 + 120 * 1.1, cateringPerGuest: 440, beveragesPerGuest: 145 + 38, poolPartyPerGuest: 150, otherActivitiesPerWedding: 8000, extraConsumptionPerGuestNight: 120,
    serviceFeePct: 0.10, cateringOutsourcedCommission: 0.15,
    costPct: { catering: 0.55, beverages: 0.45, welcomeParty: 0.55, poolParty: 0.5, venue: 0.25, other: 0.6, lodging: 0 },
    phases: {
      p1: { startYear: 1, venueRental: true, welcomeParty: false, cateringOwn: false, beverageOwn: false, poolParty: false, otherActivities: false },
      p2: { startYear: 2, venueRental: true, welcomeParty: true, cateringOwn: true, beverageOwn: true, poolParty: true, otherActivities: false },
      p3: { startYear: 4, venueRental: true, welcomeParty: true, cateringOwn: true, beverageOwn: true, poolParty: true, otherActivities: true },
    },
    closeBeachClubDuringBuyout: true, closeRestaurantDuringBuyout: true,
  };
}
export function defaultBeachClub(enabled: boolean): Scenario['beachClub'] {
  return {
    enabled, startYear: 1,
    visitorsPerDay: [40, 30, 20, 15, 15, 25, 45, 45, 35, 35, 40, 50], rampByYear: [0.5, 0.75, 1, 1, 1, 1],
    ticket: 180, dayUseFee: 60, priceGrowth: 0.045, cmvPct: 0.30, cmoPct: 0.18, otherDirectPct: 0.05, taxPct: 0.1465,
    experiencesRevenueMonthly: 25000, experiencesMarginPct: 0.35,
  };
}

/* ------------------------------------------------------------------ */
/* Cenário Base (revisado)                                             */
/* ------------------------------------------------------------------ */
export function baseScenario(): Scenario {
  const s = excelScenario();
  s.id = 'base'; s.name = 'Base'; s.kind = 'base';
  s.description = 'Cenário mais provável: premissas do Excel R05 corrigidas (fórmulas), tributação explícita, casamentos e beach club, financiamento BNB e novo investidor.';
  const prov = s.provenance;
  const R = (key: string, note: string, source: 'excel' | 'doc' | 'hypothesis' = 'hypothesis', status: 'revised' | 'pending' = 'revised') => { prov[key] = { source, status, note }; };

  // Calendário: obra já iniciada (ago/2026, 18 meses) → inauguração mar/2028; horizonte 15 anos de operação
  s.calendar.flowEnd = null; s.calendar.horizonYears = 15; s.calendar.inflation = 0.045;
  R('calendar.horizonYears', 'Horizonte de 15 anos de operação (prompt); Excel usava até dez/2050.');
  R('calendar.inflation', 'IPCA de referência 4,5% a.a. para indexação (hipótese; Excel projetava média histórica mensal).');
  // Fase 02 opcional: começa 12 meses após o término da obra da Fase 01 (como no Excel), rodada própria de BNB
  s.hotel.phase2.enabled = true;
  R('hotel.phase2', 'Fase 02 (17 UH) após a conclusão da Fase 01, com nova rodada BNB usando a Fase 01 como garantia.', 'doc');
  // Correções de fórmula
  s.hotel.rateLongTermMode = 'correct'; s.hotel.rateSpecialLongTermGrowth = 0.045; s.hotel.rateLongTermGrowth = 0.045;
  R('hotel.rateLongTermMode', 'Corrige o fator (1+g)^(ano−6) que deflacionava a diária nos anos 1–5 no Excel.', 'excel');
  s.opex.inflationMode = 'compound';
  R('opex.inflationMode', 'Correção inflacionária composta (Excel usava expoente invertido e subestimava custos).', 'excel');
  // Tipologia Fase 01 (hipótese a validar com projeto): 18 UH em 3 categorias
  s.hotel.phase1.categories = [
    { name: 'Jardim', count: 8, guests: 2, rateIndex: 0.9 },
    { name: 'Piscina privativa', count: 7, guests: 2, rateIndex: 1.05 },
    { name: 'Vista mar / Suíte master', count: 3, guests: 2, rateIndex: 1.15 },
  ];
  R('hotel.phase1.categories', 'Tipologia hipotética (3 categorias) com índice tarifário; ADR médio ≈ diária-base. Validar com projeto arquitetônico.', 'hypothesis', 'pending');
  // Ocupação: ramp-up mais realista com média anual 45% → 60% (Saline opera a 65–70%)
  s.hotel.occupancyNormal = occupancyGrid([0.42, 0.50, 0.56, 0.60, 0.62, 0.63], SEASON_NORMAL);
  s.hotel.occupancySpecial = occupancyGrid([0.80, 0.85, 0.90, 0.90, 0.92, 0.92], rep(1));
  R('hotel.occupancyNormal', 'Ramp-up 42% → 63% (média anual dias normais), sazonalidade do Nordeste; benchmark Saline 65–70%.', 'doc');
  // Tarifas: base Excel (R$2.200–2.500) mantida; benchmark Saline 2028 ≈ R$3.457/UH em buyout
  R('hotel.rateNormalYear1', 'Diária-base do Excel mantida (R$2.200–2.500 ano 1). Saline 2028: R$3.457/UH (buyout, 22 UH).', 'excel');
  // Distribuição: 35% intermediado (OTA/agências) a 18%
  s.hotel.shareOTA = rep(0.35);
  R('hotel.shareOTA', '35% da receita de diárias intermediada (OTAs/agências) com comissão de 18% (Excel tinha 0%).');
  s.hotel.variableCostPerRoomNight = 60;
  R('hotel.variableCostPerRoomNight', 'Custo variável por diária ocupada (amenities, café, consumíveis) R$60 — nova premissa.');
  // A&B: tickets corrigidos pela inflação após o ano 6; A&B hóspedes por hóspede; CMO fixo substituído por folha por cargo
  s.restaurant.ticketLongTermGrowth = 0.045; s.restaurant.legacyEvents.longTermGrowth = 0.045; s.restaurant.guestsTicketLongTermGrowth = 0.045;
  s.restaurant.cmoFixedMonthly = 0; s.restaurant.cmoVarPct = 0.08;
  s.restaurant.legacyEvents.perMonth = rep(0); // eventos passam a ser modelados no módulo de casamentos
  R('restaurant.cmoFixedMonthly', 'CMO fixo de R$180k/mês removido: a mão de obra de A&B passa a ser modelada por cargo × mês (evita dupla contagem).', 'excel');
  R('restaurant.cmoVarPct', 'CMO variável de A&B reduzido para 8% (extras/terceiros), já que a folha fixa está no quadro de cargos.');
  R('restaurant.legacyEvents', 'Eventos genéricos do Excel desligados; substituídos pelo módulo de casamentos.', 'excel');
  s.restaurant.guestsTicketBasis = 'guestNight'; s.restaurant.guestsTicketYear1 = rep(75);
  R('restaurant.guestsTicketYear1', 'Consumo de A&B por hóspede-noite R$75 (≈ R$150/UH, Excel R$120/UH).');
  // Casamentos e beach club
  s.weddings = defaultWeddings(true);
  R('weddings', 'Módulo novo. Benchmark Saline: ~17 casamentos/ano, 200–250 consultas, buyout 3–4 diárias, catering R$440 + 10%, bar R$145 + 10%, locação R$25–30k.', 'doc');
  s.beachClub = defaultBeachClub(true);
  R('beachClub', 'Módulo novo (day-use e visitantes externos) — volumes hipotéticos a validar.', 'hypothesis', 'pending');
  // Folha: cargos de cozinha/bar para o centro de custo A&B, extras por diária e por casamento
  s.payroll.positions = revisedStaffing();
  s.payroll.plrBase = 'gop';
  R('payroll.positions', 'Quadro de colaboradores por cargo × mês dimensionado para 18 UH + 95 lugares (hotel / A&B / adm), com extras por diária e por casamento. Hipótese a validar com RH; substitui o CMO fixo de R$180k/mês do Excel.', 'hypothesis', 'pending');
  R('payroll.plrBase', 'PLR de 10% sobre o GOP total (Excel usava resultado só hoteleiro).');
  // Opex: operação própria com custo corporativo; reserva FF&E 3% a partir do ano 3; pré-abertura; capital de giro
  s.opex.operator = { mode: 'own', baseFeePctRevenue: 0.03, incentiveFeePctGOP: 0.08, ownCorporateMonthly: 25000 };
  s.opex.phase2FixedCostFactor = 0.5;
  s.opex.ffeReserve = { pctRevenue: 0.03, startYear: 3 };
  s.opex.preOpening = { total: 600000, monthsBefore: 6 };
  s.opex.workingCapital = { receivableDays: 15, payableDays: 30 };
  R('opex.operator', 'Operação própria (RPE) com custo corporativo de R$25k/mês; alternativa operador terceiro 3% receita + 8% GOP.');
  R('opex.phase2FixedCostFactor', 'Fase 02 replica 50% dos custos fixos (Excel duplicava 100%).');
  R('opex.ffeReserve', 'Reserva de reposição de FF&E 3% da receita a partir do ano 3 (padrão hoteleiro).');
  R('opex.preOpening', 'Pré-abertura R$600k nos 6 meses antes da inauguração (treinamento, marketing de lançamento, enxoval).');
  R('opex.workingCapital', 'Capital de giro: 15 dias de recebíveis, 30 dias de pagáveis.');
  // Tributos: Presumido como hipótese-base
  s.tax.regime = 'presumido';
  R('tax.regime', 'Lucro Presumido (hipótese-base; regime não definido). ISS 5% + PIS/COFINS 3,65% sobre hospedagem; IRPJ/CSLL sobre base presumida.', 'hypothesis', 'pending');
  // CAPEX: Excel Fase 01 (R$23,67M) com contingência 0; Fase 02 Excel
  R('capex.phase1', 'CAPEX da Fase 01 conforme Excel (R$23,67M incl. terreno); BNB avalia R$19,706M de obra + R$3,294M equipamentos — em validação.', 'excel');
  // Financiamento BNB — Cenário A (alavancagem máxima) como padrão do Base
  s.loans = [
    { ...excelLoan(1), enabled: true, amount: 20700000, disbursement: 'proCapex', proCapexStart: '2026-08', indexer: 'inflation', spread: 0.0295, bonusAdimplencia: 0.15, graceMonths: 36, interestDuringGrace: 'pay', totalMonths: 180, system: 'SAC', structuringPct: 0.015, insurancePctAnnual: 0.002, recurringMonthly: 0, minDSCR: 1.3 },
    { ...excelLoan(2), enabled: true, amount: 8500000, disbursement: 'proCapex', proCapexStart: null, indexer: 'inflation', spread: 0.0295, bonusAdimplencia: 0.15, graceMonths: 24, interestDuringGrace: 'pay', totalMonths: 144, system: 'SAC', structuringPct: 0.015, insurancePctAnnual: 0.002, recurringMonthly: 0, minDSCR: 1.3 },
  ];
  R('loans', 'BNB/FNE: R$20,7M (90% de R$23M) desembolsado pró-rata à obra; IPCA + 2,95% a.a. com bônus de adimplência 15%; 36 meses de carência; 15 anos; SAC. Taxas e prazos são HIPÓTESES pendentes de confirmação com o BNB.', 'doc', 'pending');
  // Garantias
  s.guarantees = { enabled: true, requiredPctOfLoan: 0.8, propertyValueBank: 6025000, evolutionaryPct: 0, investor: { committed: 10535000, model: 'A', feePct: 0.015, startDate: null, indexed: true, deferredAccrualRate: 0.12, deferredPaymentStartMonthsAfterOpening: 12, extraStakePct: 0.05, releaseAfterOpeningMonths: 12, releaseWithAmortization: true, setupCost: 50000, maintenanceCostAnnual: 20000 } };
  R('guarantees', 'Garantia preexistente 80% do financiamento (R$16,56M); imóvel avaliado R$6,025M; complementação R$10,535M pelo investidor a 1,5% a.a. (base de negociação, não preço de mercado).', 'doc');
  // Equity: cap table atual 40/30/30; investidor R$2,3M + garantias; pré-money hipotético
  s.equity.partners = [{ name: 'Karel', stakePre: 0.40, capitalInvested: 854300 }, { name: 'RPE', stakePre: 0.30, capitalInvested: 849165 }, { name: 'Pascoal', stakePre: 0.30, capitalInvested: 849165 }];
  s.equity.preMoney = 9000000;
  s.equity.investor = { name: 'Novo investidor', contribution: 2300000, stakeNegotiated: null, closingDate: '2027-01', targetIRR: 0.20, horizonYears: 10 };
  s.equity.distribution = { payoutPct: 1, minCashReserve: 500000, startMonthsAfterOpening: 6, blockedWhileDSCRBelow: 1.2 };
  s.equity.exit = { year: 10, method: 'multiple', ebitdaMultiple: 8 };
  R('equity.partners', 'Cap table atual: Karel 40%, RPE 30%, Pascoal 30% (informado por Erich).', 'doc');
  R('equity.preMoney', 'Pré-money hipotético de R$9M (terreno R$6,0M + capital investido ≈ R$2,5M + projetos) — parâmetro de negociação.', 'hypothesis', 'pending');
  R('equity.investor', 'Aporte de referência R$2,3M (capital próprio mínimo da estrutura BNB a 90%); TIR-alvo 20% e horizonte 10 anos são hipóteses.', 'doc');
  R('equity.exit', 'Saída no ano 10 a 8× EBITDA (múltiplo hipotético, não é dado de mercado).', 'hypothesis', 'pending');
  s.valuation = { discountRateProject: 0.14, discountRateEquity: 0.18, terminal: { method: 'perpetuity', growth: 0.03, ebitdaMultiple: 8, noiMultiple: 12 }, valuationDate: null };
  R('valuation', 'WACC 14% nominal, Ke 18%, perpetuidade g = 3% (hipóteses). Excel usava 12% e NOI × 12.', 'hypothesis');
  s.capex.includeSunk = true;
  return s;
}

/** Quadro revisado (salário × 1,45 de encargos). Ano 1 opera com 90% do quadro; alta temporada (jul–ago, dez–jan) +1 em cargos operacionais. */
export function revisedStaffing(): StaffPosition[] {
  const F = 1.45;
  const grid = (base: number, highSeasonExtra = 0, year1Factor = 0.9): Grid =>
    Array.from({ length: 6 }, (_, y) => rep(0).map((_, m) => {
      const hs = [0, 6, 7, 11].includes(m) ? highSeasonExtra : 0;
      return Math.round((base + hs) * (y === 0 ? year1Factor : 1) * 10) / 10;
    }));
  const pos = (name: string, costCenter: StaffPosition['costCenter'], salary: number, base: number, hs = 0, extra: Partial<StaffPosition> = {}): StaffPosition => ({ name, costCenter, monthlyCost: salary * F, headcount: grid(base, hs), ...extra });
  return [
    // Hotelaria
    pos('Gerente geral', 'admin', 12000, 1, 0, { headcount: grid(1, 0, 1) }),
    pos('Supervisor de hospedagem', 'hotel', 5500, 1),
    pos('Recepcionista', 'hotel', 2600, 4, 1),
    pos('Governanta', 'hotel', 4200, 1),
    pos('Camareira', 'hotel', 2300, 4, 1, { extrasPerRoomNight: 12 }),
    pos('Manutenção / piscina / jardim', 'hotel', 2800, 2),
    pos('Segurança / portaria (24h)', 'hotel', 2400, 3),
    pos('Reservas / marketing', 'hotel', 4200, 1),
    // A&B
    pos('Chef executivo', 'fnb', 12000, 1, 0, { headcount: grid(1, 0, 1) }),
    pos('Sous chef', 'fnb', 5500, 1),
    pos('Cozinheiro', 'fnb', 3200, 3, 1),
    pos('Auxiliar de cozinha', 'fnb', 2300, 4, 1),
    pos('Steward / limpeza cozinha', 'fnb', 2200, 2),
    pos('Chefe de bar', 'fnb', 4200, 1),
    pos('Bartender', 'fnb', 2800, 2, 1),
    pos('Garçom', 'fnb', 2400, 5, 2, { extrasPerWedding: 9000 }),
    pos('Hostess / caixa', 'fnb', 2600, 1),
    // Administrativo
    pos('Controller / financeiro', 'admin', 6000, 1),
    pos('Assistente adm / RH', 'admin', 3200, 1),
  ];
}

const SEASON_NORMAL = [1.15, 0.95, 0.75, 0.70, 0.75, 0.90, 1.20, 1.15, 1.00, 1.05, 1.10, 1.30];
export function occupancyGrid(annual: number[], season: number[]): Grid {
  const avg = season.reduce((a, b) => a + b, 0) / season.length;
  return annual.map((y) => season.map((f) => Math.min(0.98, (y * f) / avg)));
}

export function conservativeScenario(): Scenario {
  const s = baseScenario();
  s.id = 'conservador'; s.name = 'Conservador'; s.kind = 'conservative';
  s.description = 'Ramp-up comercial mais lento, diárias 10% inferiores, ocupação reduzida, menos casamentos e CAPEX +10%.';
  s.hotel.occupancyNormal = occupancyGrid([0.35, 0.42, 0.48, 0.52, 0.55, 0.56], SEASON_NORMAL);
  s.hotel.occupancySpecial = occupancyGrid([0.70, 0.75, 0.80, 0.85, 0.85, 0.85], rep(1));
  s.hotel.rateNormalYear1 = s.hotel.rateNormalYear1.map((v) => v * 0.9);
  s.hotel.rateSpecialYear1 = s.hotel.rateSpecialYear1.map((v) => v * 0.9);
  s.weddings.countByYear = [3, 6, 9, 12, 14, 14];
  s.weddings.phases.p2.startYear = 3; s.weddings.phases.p3.startYear = 5;
  s.beachClub.rampByYear = [0.3, 0.5, 0.7, 0.8, 0.9, 0.9];
  s.capex.phase1.contingencyPct = 0.10; s.capex.phase2.contingencyPct = 0.10;
  s.loans[0].spread = 0.035; s.loans[1].spread = 0.035;
  s.provenance['scenario'] = { source: 'hypothesis', status: 'revised', note: 'Derivado do Base: ocupação −7 p.p., diárias −10%, casamentos −30%, CAPEX +10%, juros +0,55 p.p.' };
  return s;
}

export function optimisticScenario(): Scenario {
  const s = baseScenario();
  s.id = 'otimista'; s.name = 'Otimista'; s.kind = 'optimistic';
  s.description = 'Maior ocupação (benchmark Saline 65–70%), posicionamento tarifário superior e captura plena de receitas de casamentos e beach club.';
  s.hotel.occupancyNormal = occupancyGrid([0.48, 0.58, 0.65, 0.68, 0.70, 0.70], SEASON_NORMAL);
  s.hotel.occupancySpecial = occupancyGrid([0.88, 0.92, 0.95, 0.95, 0.95, 0.95], rep(1));
  s.hotel.rateNormalYear1 = s.hotel.rateNormalYear1.map((v) => v * 1.12);
  s.hotel.rateSpecialYear1 = s.hotel.rateSpecialYear1.map((v) => v * 1.12);
  s.weddings.countByYear = [8, 14, 18, 22, 24, 24];
  s.weddings.phases.p2.startYear = 2; s.weddings.phases.p3.startYear = 3;
  s.beachClub.rampByYear = [0.7, 1, 1.1, 1.2, 1.2, 1.2];
  s.provenance['scenario'] = { source: 'hypothesis', status: 'revised', note: 'Derivado do Base: ocupação +6 p.p., diárias +12%, casamentos +30%, fases comerciais antecipadas.' };
  return s;
}

/** Cenários de endividamento do documento BNB aplicados sobre um cenário. */
export function applyDebtStructure(s: Scenario, which: 'A' | 'B' | 'C'): Scenario {
  const c = clone(s);
  const l = c.loans.find((x) => x.phase === 1)!;
  if (which === 'A') { l.amount = 20700000; c.equity.investor.contribution = 2300000; c.guarantees.investor.committed = 10535000; }
  if (which === 'B') { l.amount = 15000000; c.equity.investor.contribution = 8000000; c.guarantees.investor.committed = Math.max(0, 0.8 * 15000000 - 6025000); }
  if (which === 'C') { l.amount = 7500000; c.equity.investor.contribution = 15500000; c.guarantees.investor.committed = 0; c.guarantees.enabled = true; }
  c.provenance['loans.structure'] = { source: 'doc', status: 'revised', note: `Estrutura ${which} do documento "Estrutura de Financiamento e Garantias" — valores de referência, não ofertas aprovadas.` };
  return c;
}

/** Caminhos alterados por Ian/Erich em relação ao Base (15/10/2026), para o registro de premissas. */
const IAN_ERICH_CHANGES: [string, string][] = [
  ['hotel.phase1.constructionStart', 'Obra iniciada em set/2026, 22 meses (inauguração set/2028).'],
  ['hotel.phase1.categories', 'Índices tarifários da tipologia revistos (piscina 1,25×, vista mar 1,10×).'],
  ['hotel.occupancyNormal', 'Hotel fechado em abril e maio; junho com ocupação revista.'],
  ['hotel.occupancySpecial', 'Dias especiais: fechado abr/mai; out–dez a 90–100%.'],
  ['hotel.rateGrowth', 'Crescimento tarifário 15%, 15%, 10% nos anos 2–4.'],
  ['hotel.shareOTA', '50% da receita de diárias intermediada (OTAs/agências).'],
  ['weddings', '0 → 5 → 10 → 12 casamentos/ano, 180 convidados, catering e bebidas próprios desde o ano 1, sem locação/pool party, consumo extra R$ 250/hóspede-noite, preços +8% a.a.'],
  ['restaurant', 'Giro reduzido (0,3–1,0), ticket R$ 180–220 crescendo 15%/10% a.a., A&B hóspedes R$ 150, outros custos diretos 15%.'],
  ['beachClub', 'Fechado abr/mai, ticket R$ 300 (+10% a.a.), CMO 25%, sem experiências.'],
  ['loans', 'BNB Fase 01 de R$ 6,3 M com 60 meses de carência e juros capitalizados; Fase 02 R$ 8,0 M.'],
  ['guarantees', 'Obra executada aceita integralmente como garantia evolutiva; remuneração do garantidor pelo modelo C (participação adicional), referência 3% a.a.'],
  ['equity.investor', 'Aporte do novo investidor R$ 2,0 M.'],
];
export function ianErichScenario(): Scenario {
  const base = baseScenario();
  const s = clone(ianErich) as unknown as Scenario;
  s.capex.phase1.excelSeries = base.capex.phase1.excelSeries;
  s.capex.phase2.excelSeries = base.capex.phase2.excelSeries;
  for (const [path, note] of IAN_ERICH_CHANGES) s.provenance[path] = { source: 'doc', status: 'revised', note: `Ajustado por Ian e Erich em 15/10/2026 — ${note}` };
  return s;
}

export const ALL_SCENARIOS = () => [excelScenario(), ianErichScenario(), baseScenario(), conservativeScenario(), optimisticScenario()];
