/**
 * Motor de cálculo — função pura compute(scenario) → Results.
 * Ordem: calendário → capacidade → casamentos (bloqueio de UH) → por fase: hotelaria, A&B, folha, opex
 *        → beach club → capex/depreciação → impostos sobre receita → dívida → impostos sobre lucro
 *        → garantias → fluxos → caixa/aportes/distribuições → sócios → métricas → valuation → alertas.
 */
import type {
  Scenario, Results, MonthlyLines, Series, YM, AnnualRow, Metrics, PartyFlow, CapTableRow, ValuationResult, Alert, LoanAssumptions,
} from './types';
import {
  MONTH_DAYS, buildMonths, ymToIndex, addMonths, monthsBetween, ymToDate, yearOf, monthOf, opYearFor, gridValue, yearValue,
  growthFactor, zeros, sum, add, cumsum,
} from './calendar';
import { irr, xirr, xnpv, monthlyToAnnual, annualToMonthly, paybackIndex, pmt } from './finance';

export interface PhaseDates { constructionStart: YM; constructionEnd: YM; opening: YM }

export function phaseDates(s: Scenario, p: 1 | 2): PhaseDates {
  const ph = p === 1 ? s.hotel.phase1 : s.hotel.phase2;
  const constructionEnd = addMonths(ph.constructionStart, ph.constructionMonths - 1);
  return { constructionStart: ph.constructionStart, constructionEnd, opening: addMonths(constructionEnd, ph.openingLagMonths) };
}
export function flowEndOf(s: Scenario): YM {
  if (s.calendar.flowEnd) return s.calendar.flowEnd;
  // termina em dezembro do (ano da inauguração + horizonte − 1), para anos calendário completos
  return `${yearOf(phaseDates(s, 1).opening) + s.calendar.horizonYears - 1}-12`;
}
export function phaseRooms(s: Scenario, p: 1 | 2): number {
  const ph = p === 1 ? s.hotel.phase1 : s.hotel.phase2;
  if (ph.categories.length) return ph.categories.reduce((a, c) => a + c.count, 0);
  return ph.rooms;
}
function phaseRateIndex(s: Scenario, p: 1 | 2): number {
  const ph = p === 1 ? s.hotel.phase1 : s.hotel.phase2;
  const rooms = phaseRooms(s, p);
  if (!ph.categories.length || !rooms) return 1;
  return ph.categories.reduce((a, c) => a + c.count * c.rateIndex, 0) / rooms;
}
function phaseGuests(s: Scenario, p: 1 | 2): number | null {
  const ph = p === 1 ? s.hotel.phase1 : s.hotel.phase2;
  const rooms = phaseRooms(s, p);
  if (!ph.categories.length || !rooms) return null;
  return ph.categories.reduce((a, c) => a + c.count * c.guests, 0) / rooms;
}
/** Fator de correção de custos: Excel usa (1+i)^(1-ano)-1 (expoente invertido); 'compound' = composto correto. */
export function inflationCorrection(mode: 'excel' | 'compound', rate: number, opYear: number): number {
  if (opYear <= 0) return 0;
  if (mode === 'excel') return 1 - Math.pow(1 + rate, -(opYear - 1));
  return Math.pow(1 + rate, opYear - 1) - 1;
}
function sCurve(x: number): number {
  const k = 8;
  const f = (t: number) => 1 / (1 + Math.exp(-k * (t - 0.5)));
  return (f(x) - f(0)) / (f(1) - f(0));
}

export function compute(s: Scenario): Results {
  const flowEnd = flowEndOf(s);
  const months = buildMonths(s.calendar.modelStart, flowEnd);
  const N = months.length;
  const dates = months.map(ymToDate);
  const d1 = phaseDates(s, 1);
  const d2 = phaseDates(s, 2);
  const p2on = s.hotel.phase2.enabled;
  const opYear = months.map((m) => opYearFor(m, d1.opening, flowEnd));
  const opYearP2 = months.map((m) => (p2on ? opYearFor(m, d2.opening, flowEnd) : 0));
  const daysInMonth = months.map((m) => MONTH_DAYS[monthOf(m)]);
  const actualDays = months.map((m) => new Date(yearOf(m), monthOf(m) + 1, 0).getDate()); // Excel: restaurante usa DAY(EOMONTH) (ano bissexto)
  const modelStartIdx = ymToIndex(s.calendar.modelStart);
  const baseIdx = ymToIndex(s.calendar.baseDate);
  const idxOf = (ym: YM) => ymToIndex(ym) - modelStartIdx;
  const inflMonthly = annualToMonthly(s.calendar.inflation);
  const L = (): Series => zeros(N);
  const H = s.hotel, R = s.restaurant, W = s.weddings, P = s.payroll, O = s.opex, T = s.tax, G = s.guarantees, E = s.equity;

  /* ---------------- capacidade ---------------- */
  const rooms1 = phaseRooms(s, 1);
  const rooms2 = p2on ? phaseRooms(s, 2) : 0;
  const roomsByMonth = months.map((_, i) => (opYear[i] > 0 ? rooms1 : 0) + (opYearP2[i] > 0 ? rooms2 : 0));

  /* ---------------- casamentos (buyout) ---------------- */
  const weddingsCount = L(), roomNightsBlocked = L(), buyoutDays = L();
  const revWeddingLodging = L(), revWeddingVenue = L(), revWeddingWelcome = L(), revWeddingCatering = L(), revWeddingBeverages = L(),
    revWeddingPool = L(), revWeddingOther = L(), revWeddingExtra = L(), costWeddings = L();
  if (W.enabled) {
    const wsum = sum(W.monthWeights) || 1;
    for (let i = 0; i < N; i++) {
      const y = opYear[i];
      if (y <= 0) continue;
      const m = monthOf(months[i]);
      const count = yearValue(W.countByYear, y) * (W.monthWeights[m] / wsum);
      if (count <= 0) continue;
      const phase = y >= W.phases.p3.startYear ? W.phases.p3 : y >= W.phases.p2.startYear ? W.phases.p2 : W.phases.p1;
      const price = Math.pow(1 + W.priceGrowth, y - 1);
      const roomsAvail = roomsByMonth[i];
      const roomsUsed = W.roomsBlocked === 'all' ? roomsAvail : Math.min(W.roomsBlocked, roomsAvail);
      const g = W.guests;
      weddingsCount[i] = count;
      roomNightsBlocked[i] = Math.min(roomsUsed * W.nights * count, roomsAvail * daysInMonth[i]);
      buyoutDays[i] = Math.min(daysInMonth[i], W.nights * count);
      revWeddingLodging[i] = roomNightsBlocked[i] * W.roomRate * price;
      revWeddingVenue[i] = phase.venueRental ? count * W.venueFee * price : 0;
      revWeddingWelcome[i] = phase.welcomeParty ? count * g * W.welcomePartyPerGuest * price : 0;
      const cateringGross = count * g * W.cateringPerGuest * price;
      const bevGross = count * g * W.beveragesPerGuest * price;
      revWeddingCatering[i] = phase.cateringOwn ? cateringGross * (1 + W.serviceFeePct) : cateringGross * W.cateringOutsourcedCommission;
      revWeddingBeverages[i] = phase.beverageOwn ? bevGross * (1 + W.serviceFeePct) : 0;
      revWeddingPool[i] = phase.poolParty ? count * g * W.poolPartyPerGuest * price : 0;
      revWeddingOther[i] = phase.otherActivities ? count * W.otherActivitiesPerWedding * price : 0;
      revWeddingExtra[i] = count * g * W.nights * W.extraConsumptionPerGuestNight * price;
      const c = W.costPct;
      costWeddings[i] =
        revWeddingLodging[i] * c.lodging + revWeddingVenue[i] * c.venue + revWeddingWelcome[i] * c.welcomeParty +
        (phase.cateringOwn ? cateringGross * (c.catering + W.serviceFeePct) : 0) +
        (phase.beverageOwn ? bevGross * (c.beverages + W.serviceFeePct) : 0) +
        revWeddingPool[i] * c.poolParty + revWeddingOther[i] * c.other + revWeddingExtra[i] * c.catering;
    }
  }
  const revWeddings = add(revWeddingLodging, revWeddingVenue, revWeddingWelcome, revWeddingCatering, revWeddingBeverages, revWeddingPool, revWeddingOther, revWeddingExtra);

  /* ---------------- por fase: hotelaria, A&B, folha, opex ---------------- */
  const roomsAvailable = L(), roomsOccupied = L(), roomsOccupiedNormal = L(), roomsOccupiedSpecial = L(), guests = L();
  const revHotelNormal = L(), revHotelOTA = L(), revHotelSpecial = L(), otaCommission = L(), hotelVariableCost = L();
  const revRestaurant = L(), revLegacyEvents = L(), revFnbGuests = L();
  const payrollHotel = L(), payrollFnb = L(), payrollAdmin = L(), payrollExtras = L(), payrollPLR = L(), payrollCorrection = L();
  const opexDirect = L(), opexAdmin = L(), opexMarketing = L(), opexInsurance = L();
  const fnbCmoFixed = L();
  const adminFixed = O.admin.items.reduce((a, it) => a + it.monthly, 0);

  for (const p of [1, 2] as const) {
    if (p === 2 && !p2on) continue;
    const rooms = p === 1 ? rooms1 : rooms2;
    const ph = p === 1 ? H.phase1 : H.phase2;
    const rateIdx = phaseRateIndex(s, p);
    const gpr = phaseGuests(s, p);
    const fixedF = p === 2 ? O.phase2FixedCostFactor : 1;
    for (let i = 0; i < N; i++) {
      const y = p === 1 ? opYear[i] : opYearP2[i];
      if (y <= 0) continue;
      const m = monthOf(months[i]);
      const dim = daysInMonth[i];
      // --- hotelaria
      const daysN = Math.min(gridValue(H.daysNormal, y, m), dim);
      const daysS = dim - daysN;
      const share = roomsByMonth[i] ? rooms / roomsByMonth[i] : 0;
      const blocked = roomNightsBlocked[i] * share;
      const availN = Math.max(0, daysN * rooms - blocked * (daysN / dim));
      const availS = Math.max(0, daysS * rooms - blocked * (daysS / dim));
      const occN = gridValue(H.occupancyNormal, y, m);
      const occS = gridValue(H.occupancySpecial, y, m);
      const occupiedN = availN * occN, occupiedS = availS * occS;
      const ry = ph.rateCalendar === 'phase1' ? opYear[i] : y;
      const yN = Math.min(ry, 6);
      let rateN = H.rateNormalYear1[m] * growthFactor(yN, H.rateGrowth, 0) * rateIdx;
      rateN *= H.rateLongTermMode === 'excel' ? Math.pow(1 + H.rateLongTermGrowth, ry - 6) : Math.pow(1 + H.rateLongTermGrowth, Math.max(0, ry - 6));
      const rateS = H.rateSpecialYear1[m] * growthFactor(yN, H.rateSpecialGrowth, 0) * Math.pow(1 + H.rateSpecialLongTermGrowth, Math.max(0, ry - 6)) * rateIdx;
      const shareOTA = H.shareOTA[m] ?? 0;
      const revN = occupiedN * (1 - shareOTA) * rateN, revO = occupiedN * shareOTA * rateN, revS = occupiedS * rateS;
      roomsAvailable[i] += availN + availS;
      roomsOccupiedNormal[i] += occupiedN; roomsOccupiedSpecial[i] += occupiedS; roomsOccupied[i] += occupiedN + occupiedS;
      guests[i] += (occupiedN + occupiedS) * (gpr ?? H.guestsPerRoom[m]);
      revHotelNormal[i] += revN; revHotelOTA[i] += revO; revHotelSpecial[i] += revS;
      otaCommission[i] += revO * H.otaCommission;
      hotelVariableCost[i] += (occupiedN + occupiedS) * H.variableCostPerRoomNight;
      const revHotelP = revN + revO + revS;
      // --- A&B
      const openDays = W.closeRestaurantDuringBuyout ? actualDays[i] - buyoutDays[i] : actualDays[i];
      const y6 = Math.min(y, 6);
      const ticket = R.ticketYear1[m] * growthFactor(y6, R.ticketGrowth, 0) * Math.pow(1 + R.ticketLongTermGrowth, Math.max(0, y - 6));
      revRestaurant[i] += openDays * R.seats[m] * ph.seatShare * R.turnover[m] * ticket;
      const ev = R.legacyEvents;
      revLegacyEvents[i] += ev.perMonth[m] * ev.pax[m] * ev.ticketYear1[m] * growthFactor(y6, ev.ticketGrowth, 0) * Math.pow(1 + ev.longTermGrowth, Math.max(0, y - 6));
      const gt = R.guestsTicketYear1[m] * growthFactor(y6, R.guestsTicketGrowth, 0) * Math.pow(1 + R.guestsTicketLongTermGrowth, Math.max(0, y - 6));
      const revGuestsP = gt * (R.guestsTicketBasis === 'guestNight' ? (occupiedN + occupiedS) * (gpr ?? H.guestsPerRoom[m]) : occupiedN + occupiedS);
      revFnbGuests[i] += revGuestsP;
      fnbCmoFixed[i] += R.cmoFixedMonthly * fixedF;
      // --- folha
      let payBase = 0, payCorr = 0, payHotelP = 0, payFnbP = 0, payAdminP = 0, extrasP = 0;
      for (const pos of P.positions) {
        const hc = gridValue(pos.headcount, y, m) * (p === 2 ? O.phase2FixedCostFactor : 1);
        const cost = hc * pos.monthlyCost;
        const extras = (pos.extrasPerRoomNight ?? 0) * (occupiedN + occupiedS) + (pos.extrasPerWedding ?? 0) * weddingsCount[i] * share;
        if (pos.costCenter === 'fnb') payFnbP += cost; else if (pos.costCenter === 'admin') payAdminP += cost; else payHotelP += cost;
        payBase += cost; extrasP += extras;
      }
      payCorr = (payBase + extrasP) * inflationCorrection(O.inflationMode, P.inflation, y);
      payrollHotel[i] += payHotelP; payrollFnb[i] += payFnbP; payrollAdmin[i] += payAdminP; payrollExtras[i] += extrasP; payrollCorrection[i] += payCorr;
      // --- opex
      const laundry = rooms * (daysN * occN + daysS * occS) * O.direct.laundryPerRoomNight;
      const directP = ((O.direct.internet + O.direct.utilities + O.direct.maintenance) * fixedF + laundry) * (1 + inflationCorrection(O.inflationMode, O.direct.inflation, y));
      const adminP = adminFixed * fixedF * (1 + inflationCorrection(O.inflationMode, O.admin.inflation, y));
      const mktP = O.marketing.pctHotelRevenue * (revHotelP + revWeddingLodging[i] * share) + O.marketing.printMonthly * fixedF * (1 + inflationCorrection(O.inflationMode, O.marketing.inflation, y));
      const iptu = m === O.insurance.iptuMonth ? O.insurance.iptuAnnual : 0;
      const insP = (O.insurance.monthly + iptu) * fixedF * (1 + inflationCorrection(O.inflationMode, O.insurance.inflation, y));
      opexDirect[i] += directP; opexAdmin[i] += adminP; opexMarketing[i] += mktP; opexInsurance[i] += insP;
      // --- PLR (Excel: por fase, sobre resultado hoteleiro)
      if (P.plrBase === 'excelHotel') {
        const base = revHotelP + revGuestsP - payBase - extrasP - payCorr - directP - adminP - mktP - insP;
        payrollPLR[i] += base > 0 ? base * P.plrPct : 0;
      }
    }
  }
  // IPTU antes da inauguração (Excel: pago todo março a partir do início da obra de cada fase)
  for (const p of [1, 2] as const) {
    if (p === 2 && !p2on) continue;
    const ph = p === 1 ? H.phase1 : H.phase2;
    const fixedF = p === 2 ? O.phase2FixedCostFactor : 1;
    const from = Math.max(idxOf(ph.constructionStart), baseIdx - modelStartIdx + 1);
    for (let i = from; i < N; i++) {
      const y = p === 1 ? opYear[i] : opYearP2[i];
      if (y > 0) break;
      if (monthOf(months[i]) === O.insurance.iptuMonth) opexInsurance[i] += O.insurance.iptuAnnual * fixedF;
    }
  }
  const revHotel = add(revHotelNormal, revHotelOTA, revHotelSpecial);

  /* ---------------- beach club / day-use / experiências ---------------- */
  const revBeachClub = L(), revExperiences = L();
  const B = s.beachClub;
  if (B.enabled) {
    for (let i = 0; i < N; i++) {
      const y = opYear[i];
      if (y <= 0 || y < B.startYear) continue;
      const m = monthOf(months[i]);
      const dim = daysInMonth[i];
      const openDays = W.closeBeachClubDuringBuyout ? dim - buyoutDays[i] : dim;
      const ramp = yearValue(B.rampByYear, y - B.startYear + 1, 1);
      const price = Math.pow(1 + B.priceGrowth, y - 1);
      revBeachClub[i] = openDays * B.visitorsPerDay[m] * ramp * B.ticket * price;
      revExperiences[i] = B.experiencesRevenueMonthly * ramp * price;
    }
  }
  const revFnb = add(revRestaurant, revLegacyEvents, revFnbGuests, revBeachClub, revExperiences);
  const fnbTaxes = L(), fnbCmv = L(), fnbCmo = L(), fnbOther = L();
  for (let i = 0; i < N; i++) {
    const core = revRestaurant[i] + revLegacyEvents[i] + revFnbGuests[i];
    const wedFnb = revWeddingCatering[i] + revWeddingBeverages[i] + revWeddingWelcome[i] + revWeddingPool[i] + revWeddingExtra[i];
    fnbTaxes[i] = core * R.taxPct + (revBeachClub[i] + revExperiences[i]) * B.taxPct;
    costWeddings[i] += wedFnb * R.taxPct; // impostos sobre A&B de eventos ficam no custo dos eventos
    fnbCmv[i] = core * R.cmvPct + revBeachClub[i] * B.cmvPct;
    fnbCmo[i] = core * R.cmoVarPct + fnbCmoFixed[i] + revBeachClub[i] * B.cmoPct;
    fnbOther[i] = core * R.otherDirectPct + revBeachClub[i] * B.otherDirectPct + revExperiences[i] * (1 - B.experiencesMarginPct);
  }
  const costFnb = add(fnbTaxes, fnbCmv, fnbCmo, fnbOther);

  /* ---------------- receitas e impostos sobre receita ---------------- */
  const revenueGross = add(revHotel, revWeddings, revFnb);
  const revenueTaxes = L();
  const pisCofins = T.regime === 'real' ? T.pisCofinsReal : T.regime === 'presumido' ? T.pisCofinsPresumido : 0;
  const hotelRevFor = (i: number) => revHotel[i] + revWeddingLodging[i] + revWeddingVenue[i] + revWeddingOther[i];
  for (let i = 0; i < N; i++) revenueTaxes[i] = T.regime === 'excelNOI' ? 0 : hotelRevFor(i) * (T.hotelISS + pisCofins);
  const revenueNet = revenueGross.map((v, i) => v - revenueTaxes[i]);

  /* ---------------- CAPEX ---------------- */
  const capexConstruction = L(), capexFfe = L(), capexProjects = L(), capexLand = L(), capexPreop = L(), capexP1 = L(), capexP2 = L();
  const groupTarget = { construction: capexConstruction, ffe: capexFfe, projects: capexProjects, land: capexLand, preop: capexPreop, other: capexProjects } as const;
  for (const p of [1, 2] as const) {
    if (p === 2 && !p2on) continue;
    const cp = p === 1 ? s.capex.phase1 : s.capex.phase2;
    const ph = p === 1 ? H.phase1 : H.phase2;
    const target = p === 1 ? capexP1 : capexP2;
    if (cp.mode === 'excel') {
      const excelStart = cp.excelSeries.constructionStart;
      const shift = monthsBetween(excelStart, ph.constructionStart);
      for (const it of cp.excelSeries.items) {
        const cont = it.group === 'construction' || it.group === 'ffe' ? cp.contingencyPct : 0;
        for (let k = 0; k < it.values.length; k++) {
          const v = -it.values[k] * cp.scale * (1 + cont);
          if (!v) continue;
          const srcIdx = ymToIndex(cp.excelSeries.dates[k]);
          const realized = srcIdx <= baseIdx;
          const i = (realized ? srcIdx : srcIdx + shift) - modelStartIdx;
          if (i < 0 || i >= N) continue;
          if (realized && !s.capex.includeSunk && it.group !== 'preop') continue;
          if (it.group === 'preop') { opexAdmin[i] += v; continue; } // Excel BX/BY realizados em Adm/Gerais
          groupTarget[it.group][i] += v; target[i] += v;
        }
      }
    } else {
      for (const it of cp.parametric.items) {
        const start = idxOf(ph.constructionStart) + it.startOffset;
        const total = it.total * (1 + (it.group === 'construction' || it.group === 'ffe' ? cp.contingencyPct : 0));
        const n = Math.max(1, it.months);
        let acc = 0;
        for (let k = 0; k < n; k++) {
          const i = start + k;
          const f = it.curve === 's' ? sCurve((k + 1) / n) : (k + 1) / n;
          const v = total * f - acc; acc = total * f;
          if (i < 0 || i >= N) continue;
          groupTarget[it.group][i] += v; target[i] += v;
        }
      }
    }
  }
  const capex = add(capexConstruction, capexFfe, capexProjects, capexLand, capexPreop);

  /* ---------------- PLR (modo GOP), operador, pré-abertura, reserva ---------------- */
  const opexOperator = L(), opexPreOpening = L(), opexFfeReserve = L();
  const gop = L();
  for (let i = 0; i < N; i++) {
    const payrollNoPLR = payrollHotel[i] + payrollFnb[i] + payrollAdmin[i] + payrollExtras[i] + payrollCorrection[i];
    const gopBeforePLR = revenueNet[i] - costFnb[i] - costWeddings[i] - otaCommission[i] - hotelVariableCost[i] - payrollNoPLR - opexDirect[i] - opexAdmin[i] - opexMarketing[i] - opexInsurance[i];
    if (P.plrBase === 'gop') payrollPLR[i] = gopBeforePLR > 0 ? gopBeforePLR * P.plrPct : 0;
    gop[i] = gopBeforePLR - payrollPLR[i];
    if (opYear[i] > 0) {
      if (O.operator.mode === 'third') opexOperator[i] = O.operator.baseFeePctRevenue * revenueGross[i] + O.operator.incentiveFeePctGOP * Math.max(0, gop[i]);
      else opexOperator[i] = O.operator.ownCorporateMonthly * Math.pow(1 + inflMonthly, i - idxOf(d1.opening));
      if (opYear[i] >= O.ffeReserve.startYear) opexFfeReserve[i] = O.ffeReserve.pctRevenue * revenueGross[i];
    }
    const pre = idxOf(d1.opening) - i;
    if (O.preOpening.total > 0 && pre > 0 && pre <= O.preOpening.monthsBefore) opexPreOpening[i] = O.preOpening.total / O.preOpening.monthsBefore;
  }
  const payroll = add(payrollHotel, payrollFnb, payrollAdmin, payrollExtras, payrollPLR, payrollCorrection);

  /* ---------------- depreciação ---------------- */
  const depreciation = L();
  {
    const open1 = idxOf(d1.opening), open2 = p2on ? idxOf(d2.opening) : Infinity;
    const lifeC = s.capex.depreciation.constructionYears * 12, lifeF = s.capex.depreciation.ffeYears * 12;
    const addDep = (amount: number, from: number, life: number) => { if (amount <= 0 || life <= 0 || !isFinite(from)) return; for (let k = 0; k < life; k++) { const i = from + k; if (i >= 0 && i < N) depreciation[i] += amount / life; } };
    let p1C = 0, p1F = 0, p2C = 0, p2F = 0;
    for (let i = 0; i < N; i++) {
      const tot = capexP1[i] + capexP2[i];
      const w1 = tot > 0 ? capexP1[i] / tot : 1;
      const c = capexConstruction[i] + capexProjects[i], f = capexFfe[i];
      if (i < open1) { p1C += c * w1; p1F += f * w1; } else { addDep(c * w1, i, lifeC); addDep(f * w1, i, lifeF); }
      if (p2on) { if (i < open2) { p2C += c * (1 - w1); p2F += f * (1 - w1); } else { addDep(c * (1 - w1), i, lifeC); addDep(f * (1 - w1), i, lifeF); } }
    }
    addDep(p1C, open1, lifeC); addDep(p1F, open1, lifeF);
    if (p2on) { addDep(p2C, open2, lifeC); addDep(p2F, open2, lifeF); }
  }

  /* ---------------- resultado operacional ---------------- */
  const opex = add(payroll, opexDirect, opexAdmin, opexMarketing, opexInsurance, opexOperator, opexPreOpening, opexFfeReserve);
  const ebitda = L(), noi = L(), ebit = L();
  for (let i = 0; i < N; i++) { ebitda[i] = gop[i] - opexOperator[i] - opexPreOpening[i] - opexFfeReserve[i]; noi[i] = ebitda[i]; ebit[i] = ebitda[i] - depreciation[i]; }

  /* ---------------- capital de giro ---------------- */
  const workingCapitalDelta = L();
  {
    let prev = 0;
    for (let i = 0; i < N; i++) {
      const wc = (revenueGross[i] * O.workingCapital.receivableDays - (costFnb[i] + opexDirect[i] + opexAdmin[i] + opexMarketing[i]) * O.workingCapital.payableDays) / 30;
      workingCapitalDelta[i] = wc - prev; prev = wc;
    }
    workingCapitalDelta[N - 1] -= prev;
  }

  /* ---------------- dívida ---------------- */
  const debtDraw = L(), debtInterest = L(), debtAmortization = L(), debtFees = L(), debtBalance = L(), debtBalanceP1 = L(), interestIncurred = L();
  const debtSchedules: Results['debtSchedules'] = [];
  for (const loan of s.loans) {
    if (!loan.enabled || loan.amount <= 0) continue;
    if (loan.phase === 2 && !p2on) continue;
    const sched = computeLoan(loan, months, N, idxOf, loan.phase === 1 ? capexP1 : capexP2, s.calendar.inflation, baseIdx - modelStartIdx);
    debtSchedules.push({ id: loan.id, label: loan.label, rows: sched.rows });
    for (let i = 0; i < N; i++) {
      debtDraw[i] += sched.draw[i]; debtInterest[i] += sched.interestPaid[i]; debtAmortization[i] += sched.amort[i]; debtFees[i] += sched.fees[i]; debtBalance[i] += sched.balance[i]; interestIncurred[i] += sched.interestAccrued[i];
      if (loan.phase === 1) debtBalanceP1[i] += sched.balance[i];
    }
  }
  const debtService = add(debtInterest, debtAmortization, debtFees);
  const debtFlow = debtDraw.map((v, i) => v - debtService[i]);

  /* ---------------- impostos sobre lucro ---------------- */
  const incomeTaxUnlevered = L(), incomeTaxLevered = L();
  {
    const fnbRevFor = (i: number) => revenueGross[i] - hotelRevFor(i);
    if (T.regime === 'excelNOI') {
      for (let i = 0; i < N; i++) { const v = Math.max(0, noi[i]) * T.excelRateOnNOI; incomeTaxUnlevered[i] = v; incomeTaxLevered[i] = v; }
    } else if (T.regime === 'presumido') {
      for (let i = 0; i < N; i++) {
        const baseIR = hotelRevFor(i) * T.presumidoBaseHotelIRPJ + fnbRevFor(i) * T.presumidoBaseFnbIRPJ;
        const baseCS = hotelRevFor(i) * T.presumidoBaseHotelCSLL + fnbRevFor(i) * T.presumidoBaseFnbCSLL;
        const v = baseIR * T.irpj + Math.max(0, baseIR - T.irpjAdicionalThresholdMonthly) * T.irpjAdicional + baseCS * T.csll;
        incomeTaxUnlevered[i] = v; incomeTaxLevered[i] = v;
      }
    } else {
      const run = (interest: Series, out: Series) => {
        let pool = 0;
        for (let i = 0; i < N; i++) {
          const taxable = ebit[i] - interest[i] - debtFees[i];
          if (taxable <= 0) { pool += -taxable; out[i] = 0; continue; }
          const offset = Math.min(pool, taxable * T.lossCarryforwardCap);
          pool -= offset;
          const base = taxable - offset;
          out[i] = base * T.irpj + Math.max(0, base - T.irpjAdicionalThresholdMonthly) * T.irpjAdicional + base * T.csll;
        }
      };
      run(zeros(N), incomeTaxUnlevered);
      run(interestIncurred, incomeTaxLevered);
    }
  }

  /* ---------------- garantias ---------------- */
  const guaranteeRequired = L(), guaranteeCommitted = L(), guaranteeFeeAccrued = L(), guaranteeFeePaid = L(), guaranteeCosts = L();
  if (G.enabled) {
    const cumConstruction = cumsum(capexConstruction.map((v, i) => (capexP1[i] > 0 ? v : 0)));
    const firstDraw = debtDraw.findIndex((v) => v > 0);
    const start = G.investor.startDate ? idxOf(G.investor.startDate) : firstDraw;
    const releaseFrom = idxOf(d1.opening) + G.investor.releaseAfterOpeningMonths;
    const deferredPayStart = idxOf(d1.opening) + G.investor.deferredPaymentStartMonthsAfterOpening;
    const accrualM = annualToMonthly(G.investor.deferredAccrualRate);
    let prev = 0, deferred = 0, defPay = 0;
    for (let i = 0; i < N; i++) {
      guaranteeRequired[i] = G.requiredPctOfLoan * debtBalanceP1[i];
      const shortfall = Math.max(0, guaranteeRequired[i] - G.propertyValueBank - G.evolutionaryPct * cumConstruction[i]);
      let committed = 0;
      if (start >= 0 && i >= start) {
        committed = G.investor.releaseWithAmortization && i >= releaseFrom ? Math.min(prev, shortfall) : Math.min(G.investor.committed, Math.max(prev, shortfall));
      }
      guaranteeCommitted[i] = committed;
      if (i === start && G.investor.setupCost) guaranteeCosts[i] += G.investor.setupCost;
      const indexF = G.investor.indexed && start >= 0 ? Math.pow(1 + inflMonthly, Math.max(0, i - start)) : 1;
      const fee = G.investor.model === 'C' ? 0 : committed * (G.investor.feePct / 12) * indexF;
      guaranteeFeeAccrued[i] = fee;
      if (G.investor.model === 'A') guaranteeFeePaid[i] = fee;
      else if (G.investor.model === 'B') {
        if (i < deferredPayStart) deferred = deferred * (1 + accrualM) + fee;
        else {
          if (i === deferredPayStart) defPay = deferred / 12;
          const pay = Math.min(deferred, defPay);
          deferred = (deferred - pay) * (1 + accrualM);
          guaranteeFeePaid[i] = fee + pay;
        }
      }
      if (committed > 0) guaranteeCosts[i] += G.investor.maintenanceCostAnnual / 12;
      guaranteeCosts[i] += guaranteeFeePaid[i];
      prev = committed;
    }
  }

  /* ---------------- fluxos ---------------- */
  const terminalValue = L(), fcfProjectNoTV = L(), fcfProject = L(), fcfEquity = L();
  const endIdx = N - 1;
  {
    const V = s.valuation.terminal;
    const ltm = (ser: Series) => sum(ser.slice(Math.max(0, endIdx - 11), endIdx + 1));
    if (V.method === 'noiMultiple') terminalValue[endIdx] = ltm(noi) * V.noiMultiple;
    else if (V.method === 'multiple') terminalValue[endIdx] = ltm(ebitda) * V.ebitdaMultiple;
    else { const r = s.valuation.discountRateProject; const f = ltm(ebitda) - ltm(incomeTaxUnlevered); terminalValue[endIdx] = r > V.growth ? (f * (1 + V.growth)) / (r - V.growth) : 0; }
  }
  for (let i = 0; i < N; i++) {
    fcfProjectNoTV[i] = ebitda[i] - incomeTaxUnlevered[i] - capex[i] - workingCapitalDelta[i];
    fcfProject[i] = fcfProjectNoTV[i] + terminalValue[i];
    fcfEquity[i] = fcfProjectNoTV[i] + (incomeTaxUnlevered[i] - incomeTaxLevered[i]) + debtFlow[i] - guaranteeCosts[i] + terminalValue[i];
  }

  /* ---------------- caixa, aportes e distribuições ---------------- */
  const cashBalance = L(), equityCalls = L(), distributions = L(), cashAfterEquity = L(), dscr = L();
  {
    const distStart = idxOf(d1.opening) + E.distribution.startMonthsAfterOpening;
    const closing = idxOf(E.investor.closingDate);
    const upfront = E.investor.contribution + E.existingAdditionalContribution;
    let cash = 0;
    for (let i = 0; i < N; i++) {
      let pre = cash + fcfEquity[i];
      if (i === closing && upfront > 0) pre += upfront; // aportes negociados entram no closing
      cashBalance[i] = pre;
      const call = pre < 0 ? -pre : 0;
      const afterCall = pre + call;
      const svc = debtService[i];
      dscr[i] = svc > 0 ? (ebitda[i] - incomeTaxLevered[i]) / svc : 0;
      const dscrOk = svc <= 0 || dscr[i] >= E.distribution.blockedWhileDSCRBelow;
      let dist = 0;
      if (i >= distStart && dscrOk && afterCall > E.distribution.minCashReserve) dist = (afterCall - E.distribution.minCashReserve) * E.distribution.payoutPct;
      if (i === N - 1) dist = Math.max(0, afterCall);
      equityCalls[i] = call; distributions[i] = dist;
      cash = afterCall - dist;
      cashAfterEquity[i] = cash;
    }
  }

  const monthly: MonthlyLines = {
    months, dates, opYear, opYearP2, daysInMonth,
    roomsAvailable, roomNightsBlocked, roomsOccupied, roomsOccupiedNormal, roomsOccupiedSpecial, guests,
    revHotelNormal, revHotelOTA, revHotelSpecial, revHotel, otaCommission, hotelVariableCost,
    weddingsCount, revWeddingLodging, revWeddingVenue, revWeddingWelcome, revWeddingCatering, revWeddingBeverages, revWeddingPool, revWeddingOther, revWeddingExtra, revWeddings, costWeddings,
    revRestaurant, revLegacyEvents, revFnbGuests, revBeachClub, revExperiences, revFnb, fnbTaxes, fnbCmv, fnbCmo, fnbOther, costFnb,
    payrollHotel, payrollFnb, payrollAdmin, payrollExtras, payrollPLR, payrollCorrection, payroll,
    opexDirect, opexAdmin, opexMarketing, opexInsurance, opexOperator, opexPreOpening, opexFfeReserve, opex,
    revenueGross, revenueTaxes, revenueNet, gop, noi, ebitda, depreciation, ebit,
    capexConstruction, capexFfe, capexProjects, capexLand, capexPreop, capex, capexP1, capexP2,
    incomeTaxUnlevered, incomeTaxLevered, workingCapitalDelta,
    debtDraw, debtInterest, debtAmortization, debtFees, debtService, debtBalance, debtBalanceP1, debtFlow,
    guaranteeRequired, guaranteeCommitted, guaranteeFeeAccrued, guaranteeFeePaid, guaranteeCosts,
    terminalValue, fcfProject, fcfProjectNoTV, fcfEquity, cashBalance, equityCalls, distributions, cashAfterEquity, dscr,
  };

  const { capTable, parties, dilution } = computeParties(s, monthly, idxOf, d1.opening, endIdx);
  const metrics = computeMetrics(s, monthly, parties, idxOf);
  metrics.dilution = dilution;
  const valuation = computeValuation(s, monthly, idxOf);
  const annual = computeAnnual(monthly);
  const alerts = computeAlerts(s, monthly, metrics, capTable);
  return { scenarioId: s.id, monthly, annual, metrics, valuation, capTable, parties, alerts, debtSchedules };
}

/* ------------------------------------------------------------------ */
/* Dívida                                                              */
/* ------------------------------------------------------------------ */
interface LoanSchedule { draw: Series; interestPaid: Series; interestAccrued: Series; amort: Series; fees: Series; balance: Series; rows: Results['debtSchedules'][number]['rows'] }
export function computeLoan(loan: LoanAssumptions, months: YM[], N: number, idxOf: (ym: YM) => number, capexPhase: Series, inflation: number, baseRel: number): LoanSchedule {
  const draw = zeros(N), interestPaid = zeros(N), interestAccrued = zeros(N), amort = zeros(N), fees = zeros(N), balance = zeros(N);
  const rateA = loan.indexer === 'inflation' ? (1 + loan.spread) * (1 + inflation) - 1 : loan.spread;
  const rateM = annualToMonthly(rateA) * (1 - loan.bonusAdimplencia);
  if (loan.disbursement === 'tranches') {
    for (const t of loan.tranches) { const i = idxOf(t.date); if (i >= 0 && i < N) draw[i] += t.amount; }
  } else {
    const start0 = loan.proCapexStart ? idxOf(loan.proCapexStart) : Math.max(0, capexPhase.findIndex((v) => v > 0));
    const start = Math.max(start0, baseRel + 1);
    let total = 0;
    for (let i = start; i < N; i++) total += capexPhase[i];
    let drawn = 0;
    for (let i = start; i < N && total > 0; i++) { const v = Math.min(loan.amount - drawn, capexPhase[i] * loan.financedPct); draw[i] = Math.max(0, v); drawn += draw[i]; }
  }
  const first = draw.findIndex((v) => v > 0);
  if (first < 0) return { draw, interestPaid, interestAccrued, amort, fees, balance, rows: [] };
  const amortStart = first + loan.graceMonths, amortEnd = first + loan.totalMonths - 1;
  const extra = new Map<number, number>();
  for (const t of loan.extraAmortizations) { const i = idxOf(t.date); extra.set(i, (extra.get(i) ?? 0) + t.amount); }
  let bal = 0;
  const rows: LoanSchedule['rows'] = [];
  for (let i = 0; i < N; i++) {
    const interest = bal * rateM;
    interestAccrued[i] = interest;
    if (i < amortStart && loan.interestDuringGrace === 'capitalize') bal += interest; else interestPaid[i] = interest;
    bal += draw[i];
    let a = 0;
    if (i >= amortStart && i <= amortEnd && bal > 0) {
      const remaining = amortEnd - i + 1;
      a = loan.system === 'SAC' ? bal / remaining : Math.max(0, pmt(rateM, remaining, bal) - bal * rateM);
      a = Math.min(a, bal);
    }
    const ex = Math.min(extra.get(i) ?? 0, Math.max(0, bal - a));
    a += ex; bal -= a; amort[i] = a;
    if (i === first) fees[i] += loan.structuringPct * loan.amount;
    if (bal > 0) fees[i] += loan.recurringMonthly + bal * (loan.insurancePctAnnual / 12);
    balance[i] = Math.max(0, bal);
    if (draw[i] || interestPaid[i] || a || fees[i] || balance[i]) rows.push({ month: months[i], draw: draw[i], interest: interestPaid[i], amortization: a, fees: fees[i], balance: balance[i], dscr: null });
  }
  return { draw, interestPaid, interestAccrued, amort, fees, balance, rows };
}

/* ------------------------------------------------------------------ */
/* Sócios e cap table                                                  */
/* ------------------------------------------------------------------ */
function computeParties(s: Scenario, M: MonthlyLines, idxOf: (ym: YM) => number, opening: YM, endIdx: number) {
  const E = s.equity;
  const N = M.months.length;
  const totalPre = E.partners.reduce((a, p) => a + p.stakePre, 0) || 1;
  const inv = E.investor;
  const postMoney = E.preMoney + inv.contribution;
  const extraStake = s.guarantees.enabled && s.guarantees.investor.model === 'C' && s.guarantees.investor.committed > 0 ? s.guarantees.investor.extraStakePct : 0;
  let stakeInv = inv.contribution > 0 ? (inv.stakeNegotiated ?? (postMoney > 0 ? inv.contribution / postMoney : 0)) : 0;
  stakeInv = Math.min(1, Math.max(0, stakeInv + extraStake));
  const capTable: CapTableRow[] = E.partners.map((p) => ({ name: p.name, stakePre: p.stakePre / totalPre, stakePost: (p.stakePre / totalPre) * (1 - stakeInv), contribution: 0, capitalInvested: p.capitalInvested }));
  const invRow: CapTableRow = { name: inv.name, stakePre: 0, stakePost: stakeInv, contribution: inv.contribution, capitalInvested: 0 };
  const mk = (r: CapTableRow): PartyFlow => ({ name: r.name, stakePost: r.stakePost, contributions: zeros(N), distributions: zeros(N), exitProceeds: zeros(N), guaranteeFees: zeros(N), net: zeros(N), irr: null, npv: 0, moic: 0, totalIn: 0, totalOut: 0 });
  const existing = capTable.map(mk);
  const invParty = mk(invRow);
  const closing = idxOf(inv.closingDate);
  const hasInv = inv.contribution > 0 && closing >= 0 && closing < N;
  if (hasInv) invParty.contributions[closing] = inv.contribution;
  if (E.existingAdditionalContribution > 0 && closing >= 0 && closing < N) existing.forEach((p, k) => { p.contributions[closing] += E.existingAdditionalContribution * capTable[k].stakePre; });
  const exitIdx = E.exit.method !== 'none' ? Math.min(endIdx, idxOf(opening) + E.exit.year * 12 - 1) : endIdx;
  const prefM = annualToMonthly(E.preferredReturn.ratePct);
  let prefBalance = 0;
  for (let i = 0; i < N; i++) {
    const call = M.equityCalls[i];
    if (call > 0) {
      if (E.callAllocation === 'proRata' && hasInv && i >= closing) { invParty.contributions[i] += call * stakeInv; existing.forEach((p) => { p.contributions[i] += call * p.stakePost; }); }
      else existing.forEach((p, k) => { p.contributions[i] += call * capTable[k].stakePre; });
    }
    if (hasInv && E.preferredReturn.enabled) prefBalance = (prefBalance + (i === closing ? inv.contribution : 0)) * (1 + prefM);
    let dist = i <= exitIdx ? M.distributions[i] : 0;
    if (dist > 0) {
      if (hasInv && E.preferredReturn.enabled && prefBalance > 0) { const pay = Math.min(dist, prefBalance); invParty.distributions[i] += pay; dist -= pay; prefBalance -= pay; }
      invParty.distributions[i] += dist * stakeInv;
      existing.forEach((p) => { p.distributions[i] += dist * p.stakePost; });
    }
    if (s.guarantees.enabled && s.guarantees.investor.committed > 0) invParty.guaranteeFees[i] = M.guaranteeFeePaid[i];
  }
  if (E.exit.method !== 'none' && exitIdx < endIdx) {
    const eqValue = exitEquityValue(s, M, exitIdx);
    for (const p of [...existing, invParty]) { p.exitProceeds[exitIdx] = eqValue * p.stakePost; for (let i = exitIdx + 1; i < N; i++) { p.distributions[i] = 0; p.contributions[i] = 0; p.guaranteeFees[i] = 0; } }
  }
  const parties = [...existing, invParty];
  const rateEq = s.valuation.discountRateEquity;
  for (const p of parties) {
    for (let i = 0; i < N; i++) p.net[i] = -p.contributions[i] + p.distributions[i] + p.exitProceeds[i] + p.guaranteeFees[i];
    p.totalIn = sum(p.contributions); p.totalOut = sum(p.distributions) + sum(p.exitProceeds) + sum(p.guaranteeFees);
    const f = p.net.findIndex((v) => v !== 0);
    if (f >= 0) { p.irr = xirr(p.net.slice(f), M.dates.slice(f)); p.npv = xnpv(rateEq, p.net.slice(f), M.dates.slice(f)); }
    p.moic = p.totalIn > 0 ? p.totalOut / p.totalIn : 0;
  }
  return { capTable: [...capTable, invRow], parties, dilution: stakeInv };
}

export function exitEquityValue(s: Scenario, M: MonthlyLines, i: number): number {
  const E = s.equity;
  const ltm = (ser: Series) => sum(ser.slice(Math.max(0, i - 11), i + 1));
  let ev = 0;
  if (E.exit.method === 'multiple') ev = ltm(M.ebitda) * E.exit.ebitdaMultiple;
  else if (E.exit.method === 'bookNOI') ev = ltm(M.noi) * s.valuation.terminal.noiMultiple;
  else if (E.exit.method === 'dcf') ev = dcfEV(s, M, i).ev;
  const netDebt = M.debtBalance[i] - Math.max(0, M.cashAfterEquity[i]);
  return Math.max(0, ev - netDebt);
}

/* ------------------------------------------------------------------ */
/* Valuation                                                           */
/* ------------------------------------------------------------------ */
export function dcfEV(s: Scenario, M: MonthlyLines, fromIdx: number) {
  const r = s.valuation.discountRateProject;
  const N = M.months.length;
  const d0 = M.dates[fromIdx];
  const pvFcf = xnpv(r, M.fcfProjectNoTV.slice(fromIdx + 1), M.dates.slice(fromIdx + 1), d0);
  const V = s.valuation.terminal;
  const end = N - 1;
  const ltm = (ser: Series) => sum(ser.slice(Math.max(0, end - 11), end + 1));
  let tv = 0;
  if (V.method === 'noiMultiple') tv = ltm(M.noi) * V.noiMultiple;
  else if (V.method === 'multiple') tv = ltm(M.ebitda) * V.ebitdaMultiple;
  else { const f = ltm(M.ebitda) - ltm(M.incomeTaxUnlevered); tv = r > V.growth ? (f * (1 + V.growth)) / (r - V.growth) : 0; }
  const t = (M.dates[end].getTime() - d0.getTime()) / 86400000 / 365;
  const pvTv = tv / Math.pow(1 + r, t);
  return { ev: pvFcf + pvTv, tv, pvTv, pvFcf };
}
function computeValuation(s: Scenario, M: MonthlyLines, idxOf: (ym: YM) => number): ValuationResult {
  const vd = s.valuation.valuationDate ?? s.calendar.baseDate;
  const i = Math.max(0, Math.min(M.months.length - 1, idxOf(vd)));
  const d = dcfEV(s, M, i);
  const netDebt = M.debtBalance[i] - Math.max(0, M.cashAfterEquity[i]);
  const stab = stabilizedWindow(M);
  const ebitdaStab = sum(M.ebitda.slice(stab.from, stab.to + 1));
  const mult = s.valuation.terminal.ebitdaMultiple;
  const end = M.months.length - 1;
  const noiLast12 = sum(M.noi.slice(Math.max(0, end - 11), end + 1));
  return {
    dcf: { ev: d.ev, tv: d.tv, pvTv: d.pvTv, pvFcf: d.pvFcf, netDebt, equity: d.ev - netDebt, tvShareOfEv: d.ev ? d.pvTv / d.ev : 0 },
    multiple: { ebitdaStabilized: ebitdaStab, multiple: mult, ev: ebitdaStab * mult, netDebt, equity: ebitdaStab * mult - netDebt },
    bookNOI: { noiLast12, multiple: s.valuation.terminal.noiMultiple, value: noiLast12 * s.valuation.terminal.noiMultiple },
  };
}
export function stabilizedWindow(M: MonthlyLines): { from: number; to: number; year: number } {
  let maxY = 0;
  for (const y of M.opYear) if (y > maxY) maxY = y;
  let target = Math.min(6, maxY);
  while (target > 1 && M.opYear.filter((y) => y === target).length < 12) target--;
  const from = M.opYear.indexOf(target), to = M.opYear.lastIndexOf(target);
  return { from: Math.max(0, from), to: Math.max(0, to), year: target };
}

/* ------------------------------------------------------------------ */
/* Métricas                                                            */
/* ------------------------------------------------------------------ */
function computeMetrics(s: Scenario, M: MonthlyLines, parties: PartyFlow[], idxOf: (ym: YM) => number): Metrics {
  const N = M.months.length;
  const stab = stabilizedWindow(M);
  const sl = (ser: Series) => sum(ser.slice(stab.from, stab.to + 1));
  const first = Math.max(0, M.fcfProject.findIndex((v) => v !== 0));
  const flows = M.fcfProject.slice(first), dates = M.dates.slice(first);
  const base = Math.max(0, Math.min(N - 1, idxOf(s.calendar.baseDate)));
  const r = s.valuation.discountRateProject;
  const irrM = irr(flows, 0.01);
  const irrNoTV = irr(M.fcfProjectNoTV.slice(first), 0.01);
  const eqFirst = Math.max(0, M.fcfEquity.findIndex((v) => v !== 0));
  const irrEqM = irr(M.fcfEquity.slice(eqFirst), 0.01);
  const cum = cumsum(M.fcfProject);
  let minC = 0, minI = -1;
  for (let i = 0; i < N; i++) if (cum[i] < minC) { minC = cum[i]; minI = i; }
  const pb = paybackIndex(M.fcfProject);
  const rm = annualToMonthly(r);
  const pbd = paybackIndex(M.fcfProject.map((v, i) => v / Math.pow(1 + rm, Math.max(0, i - base))));
  // DSCR anual
  const byYear = new Map<number, { num: number; den: number }>();
  for (let i = 0; i < N; i++) { if (M.debtService[i] <= 0 || M.opYear[i] <= 0) continue; const y = yearOf(M.months[i]); const e = byYear.get(y) ?? { num: 0, den: 0 }; e.num += M.ebitda[i] - M.incomeTaxLevered[i]; e.den += M.debtService[i]; byYear.set(y, e); }
  let dscrMin: number | null = null, dscrMinYear: number | null = null, dscrSum = 0, dscrN = 0;
  for (const [y, e] of byYear) { const v = e.num / e.den; dscrSum += v; dscrN++; if (dscrMin === null || v < dscrMin) { dscrMin = v; dscrMinYear = y; } }
  const capexTotal = sum(M.capex), capexP1 = sum(M.capexP1), capexP2 = sum(M.capexP2);
  const equityTotal = sum(M.equityCalls) + s.equity.investor.contribution + s.equity.existingAdditionalContribution;
  const occ = sl(M.roomsOccupied), avail = sl(M.roomsAvailable);
  const exitTotal = parties.reduce((a, p) => a + sum(p.exitProceeds), 0);
  return {
    capexTotal, capexP1, capexP2, debtTotal: sum(M.debtDraw), equityTotal, equityNeed: sum(M.equityCalls), maxExposure: minC, maxExposureDate: minI >= 0 ? M.months[minI] : null,
    guaranteeRequiredPeak: Math.max(0, ...M.guaranteeRequired),
    guaranteeShortfall: Math.max(0, Math.max(0, ...M.guaranteeRequired) - s.guarantees.propertyValueBank),
    guaranteeCommittedPeak: Math.max(0, ...M.guaranteeCommitted), guaranteeCostTotal: sum(M.guaranteeCosts),
    guaranteeCostPV: xnpv(s.valuation.discountRateEquity, M.guaranteeCosts, M.dates, M.dates[base]),
    revenueStabilized: sl(M.revenueGross), ebitdaStabilized: sl(M.ebitda), ebitdaMarginStabilized: sl(M.revenueGross) ? sl(M.ebitda) / sl(M.revenueGross) : 0, noiStabilized: sl(M.noi), stabilizedYear: stab.year,
    occupancyStabilized: avail ? occ / avail : 0, adrStabilized: occ ? sl(M.revHotel) / occ : 0, revparStabilized: avail ? sl(M.revHotel) / avail : 0, trevparStabilized: avail ? sl(M.revenueGross) / avail : 0,
    revenuePerGuestStabilized: sl(M.guests) ? sl(M.revenueGross) / sl(M.guests) : 0,
    irrProject: irrM === null ? null : monthlyToAnnual(irrM), irrProjectNoTV: irrNoTV === null ? null : monthlyToAnnual(irrNoTV),
    npvProject: xnpv(r, flows, dates, M.dates[base]),
    irrEquity: irrEqM === null ? null : monthlyToAnnual(irrEqM), npvEquity: xnpv(s.valuation.discountRateEquity, M.fcfEquity.slice(eqFirst), M.dates.slice(eqFirst), M.dates[base]),
    paybackSimple: pb === null ? null : M.months[pb], paybackDiscounted: pbd === null ? null : M.months[pbd], paybackMonths: pb === null || minI < 0 ? null : pb - minI,
    moicEquity: equityTotal > 0 ? (sum(M.distributions) + exitTotal) / equityTotal : 0,
    roic: capexTotal > 0 ? (sl(M.ebit) - sl(M.incomeTaxUnlevered)) / capexTotal : 0,
    dscrMin, dscrAvg: dscrN ? dscrSum / dscrN : null, dscrMinYear,
    breakEvenOccupancy: null, breakEvenWeddings: null,
    interestTotal: sum(M.debtInterest), debtServiceTotal: sum(M.debtService), dilution: 0,
    yieldOnCost: capexTotal > 0 ? sl(M.noi) / capexTotal : 0,
  };
}

/* ------------------------------------------------------------------ */
/* Agregação anual                                                     */
/* ------------------------------------------------------------------ */
export const SUM_KEYS: (keyof MonthlyLines)[] = [
  'roomsAvailable', 'roomNightsBlocked', 'roomsOccupied', 'guests', 'revHotelNormal', 'revHotelOTA', 'revHotelSpecial', 'revHotel', 'otaCommission', 'hotelVariableCost',
  'weddingsCount', 'revWeddingLodging', 'revWeddingVenue', 'revWeddingWelcome', 'revWeddingCatering', 'revWeddingBeverages', 'revWeddingPool', 'revWeddingOther', 'revWeddingExtra', 'revWeddings', 'costWeddings',
  'revRestaurant', 'revLegacyEvents', 'revFnbGuests', 'revBeachClub', 'revExperiences', 'revFnb', 'fnbTaxes', 'fnbCmv', 'fnbCmo', 'fnbOther', 'costFnb',
  'payrollHotel', 'payrollFnb', 'payrollAdmin', 'payrollExtras', 'payrollPLR', 'payrollCorrection', 'payroll',
  'opexDirect', 'opexAdmin', 'opexMarketing', 'opexInsurance', 'opexOperator', 'opexPreOpening', 'opexFfeReserve', 'opex',
  'revenueGross', 'revenueTaxes', 'revenueNet', 'gop', 'noi', 'ebitda', 'depreciation', 'ebit',
  'capexConstruction', 'capexFfe', 'capexProjects', 'capexLand', 'capexPreop', 'capex', 'capexP1', 'capexP2',
  'incomeTaxUnlevered', 'incomeTaxLevered', 'workingCapitalDelta',
  'debtDraw', 'debtInterest', 'debtAmortization', 'debtFees', 'debtService', 'debtFlow', 'guaranteeFeeAccrued', 'guaranteeFeePaid', 'guaranteeCosts',
  'terminalValue', 'fcfProject', 'fcfProjectNoTV', 'fcfEquity', 'equityCalls', 'distributions',
];
function computeAnnual(M: MonthlyLines): AnnualRow[] {
  const years = Array.from(new Set(M.months.map(yearOf)));
  return years.map((year) => {
    const idx: number[] = [];
    M.months.forEach((m, i) => { if (yearOf(m) === year) idx.push(i); });
    const row: AnnualRow = { year };
    for (const k of SUM_KEYS) { let t = 0; const ser = M[k] as Series; for (const i of idx) t += ser[i]; row[k] = t; }
    const last = idx[idx.length - 1];
    row.debtBalance = M.debtBalance[last];
    row.guaranteeCommitted = Math.max(...idx.map((i) => M.guaranteeCommitted[i]));
    row.guaranteeRequired = Math.max(...idx.map((i) => M.guaranteeRequired[i]));
    row.cashAfterEquity = M.cashAfterEquity[last];
    row.occupancy = row.roomsAvailable ? row.roomsOccupied / row.roomsAvailable : 0;
    row.adr = row.roomsOccupied ? row.revHotel / row.roomsOccupied : 0;
    row.revpar = row.roomsAvailable ? row.revHotel / row.roomsAvailable : 0;
    row.trevpar = row.roomsAvailable ? row.revenueGross / row.roomsAvailable : 0;
    row.ebitdaMargin = row.revenueGross ? row.ebitda / row.revenueGross : 0;
    row.netIncome = row.ebit - row.debtInterest - row.debtFees - row.incomeTaxLevered;
    row.dscr = row.debtService > 0 ? (row.ebitda - row.incomeTaxLevered) / row.debtService : 0;
    row.opYear = Math.max(...idx.map((i) => M.opYear[i]));
    row.months = idx.length;
    return row;
  });
}

/* ------------------------------------------------------------------ */
/* Alertas                                                             */
/* ------------------------------------------------------------------ */
function fmtM(v: number) { return 'R$ ' + (v / 1e6).toFixed(2).replace('.', ',') + ' M'; }
function computeAlerts(s: Scenario, M: MonthlyLines, m: Metrics, capTable: CapTableRow[]): Alert[] {
  const a: Alert[] = [];
  const stakeSum = capTable.reduce((x, r) => x + r.stakePost, 0);
  if (Math.abs(stakeSum - 1) > 1e-6) a.push({ level: 'error', code: 'captable', message: `Participações somam ${(stakeSum * 100).toFixed(2)}% (deveriam somar 100%).` });
  const callsAfterBase = M.equityCalls.reduce((x, v, i) => (M.months[i] > s.calendar.baseDate ? x + v : x), 0);
  if (callsAfterBase > 1) a.push({ level: 'warning', code: 'equity-gap', message: `Além dos aportes negociados, os sócios atuais precisam cobrir ${fmtM(callsAfterBase)} de chamadas de capital após a data-base.` });
  if (m.dscrMin !== null) {
    const minReq = Math.max(0, ...s.loans.filter((l) => l.enabled).map((l) => l.minDSCR));
    if (minReq && m.dscrMin < minReq) a.push({ level: 'error', code: 'dscr', message: `DSCR mínimo ${m.dscrMin.toFixed(2)}x em ${m.dscrMinYear} abaixo do covenant ${minReq.toFixed(2)}x.` });
    else if (m.dscrMin < 1) a.push({ level: 'error', code: 'dscr', message: `DSCR mínimo ${m.dscrMin.toFixed(2)}x em ${m.dscrMinYear}: geração de caixa não cobre o serviço da dívida.` });
  }
  const debtP1 = s.loans.filter((l) => l.enabled && l.phase === 1).reduce((x, l) => x + l.amount, 0);
  const debtPct = m.capexP1 ? Math.min(debtP1, m.debtTotal) / m.capexP1 : 0;
  if (debtPct > 0.9) a.push({ level: 'warning', code: 'leverage', message: `Dívida equivale a ${(debtPct * 100).toFixed(0)}% do CAPEX da Fase 01 (BNB: até 90%).` });
  if (s.guarantees.enabled && m.guaranteeShortfall > s.guarantees.investor.committed + 1) a.push({ level: 'warning', code: 'guarantee', message: `Garantias preexistentes insuficientes: faltam ${fmtM(m.guaranteeShortfall - s.guarantees.investor.committed)} além das comprometidas pelo investidor.` });
  const negIdx = M.cashBalance.findIndex((v, i) => v < -1 && M.opYear[i] > 2);
  if (negIdx >= 0) a.push({ level: 'warning', code: 'cash', message: `Fluxo de caixa negativo em operação (${M.months[negIdx]}) exige novo aporte.`, month: M.months[negIdx] });
  if (m.irrProject === null) a.push({ level: 'error', code: 'irr-none', message: 'TIR do projeto indeterminada (fluxo sem retorno positivo).' });
  else if (m.irrProject < s.valuation.discountRateProject) a.push({ level: 'error', code: 'irr', message: `TIR do projeto (${(m.irrProject * 100).toFixed(1)}%) abaixo da taxa de desconto (${(s.valuation.discountRateProject * 100).toFixed(1)}%): VPL negativo.` });
  if (s.equity.investor.contribution > 0 && capTable[capTable.length - 1].stakePost <= 0) a.push({ level: 'error', code: 'investor-stake', message: 'Investidor com aporte mas sem participação definida.' });
  if (m.paybackSimple === null) a.push({ level: 'warning', code: 'payback', message: 'Payback não ocorre dentro do horizonte.' });
  const blocked = M.roomNightsBlocked.some((v, i) => v > 0 && v >= (M.roomsAvailable[i] + v) - 1e-6);
  if (blocked) a.push({ level: 'warning', code: 'buyout', message: 'Em algum mês os buyouts de casamento ocupam 100% das diárias disponíveis.' });
  if (!s.hotel.phase2.enabled && s.loans.some((l) => l.enabled && l.phase === 2)) a.push({ level: 'info', code: 'loan-p2', message: 'Financiamento da Fase 02 habilitado, mas a Fase 02 está desligada.' });
  return a;
}

export { xirr, xnpv, irr, monthlyToAnnual };
