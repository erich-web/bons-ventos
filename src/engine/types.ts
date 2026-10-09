/**
 * Tipos do motor financeiro do Hotel Bons Ventos.
 * Toda premissa vive em `Scenario`; todo resultado em `Results`.
 * Grades [ano][mês]: ano 0..5 (anos de operação 1..6; após o 6º repete o último), mês 0..11.
 */

export type Provenance = 'excel' | 'doc' | 'hypothesis' | 'calculated';
export type AssumptionStatus = 'original' | 'revised' | 'pending';

/** Metadado de origem de uma premissa (chave = caminho no objeto Scenario, ex.: "hotel.phase1.rooms"). */
export interface ProvenanceEntry {
  source: Provenance;
  status: AssumptionStatus;
  ref?: string; // célula/aba do Excel ou documento
  note?: string;
}
export type ProvenanceMap = Record<string, ProvenanceEntry>;

export type Grid = number[][]; // [year][month]
export type YM = string; // 'YYYY-MM'

export interface RoomCategory {
  name: string;
  count: number;
  guests: number; // capacidade padrão (hóspedes)
  rateIndex: number; // multiplicador sobre a diária-base (1 = diária-base)
}

export interface PhaseHotel {
  enabled: boolean;
  label: string;
  constructionStart: YM;
  constructionMonths: number;
  openingLagMonths: number; // meses entre fim de obra e inauguração
  rooms: number; // se categories vazio, usa rooms
  categories: RoomCategory[];
  seatShare: number; // fração dos lugares do restaurante atribuída à fase (Excel Z14/AU14)
  /** Para Fase 02: tarifa segue o calendário da Fase 01 (Excel) ou o próprio ramp-up */
  rateCalendar: 'own' | 'phase1';
}

export interface HotelAssumptions {
  phase1: PhaseHotel;
  phase2: PhaseHotel;
  occupancyNormal: Grid; // taxa de ocupação dias normais [ano][mês]
  daysNormal: Grid; // dias "normais" por mês [ano][mês]; dias especiais = dias do mês - normais
  rateNormalYear1: number[]; // diária-base dias normais, ano 1, por mês
  rateGrowth: number[]; // crescimento anual anos 2..6 (5 valores)
  rateLongTermGrowth: number; // crescimento após o ano 6
  /** 'excel' reproduz o fator (1+g)^(ano-6) para todos os anos (deflaciona anos 1-5); 'correct' só aplica após o ano 6 */
  rateLongTermMode: 'excel' | 'correct';
  occupancySpecial: Grid;
  rateSpecialYear1: number[];
  rateSpecialGrowth: number[];
  rateSpecialLongTermGrowth: number;
  guestsPerRoom: number[]; // por mês (fator de ocupação de hóspedes)
  shareOTA: number[]; // fração da receita de diárias normais intermediada, por mês
  otaCommission: number; // comissão sobre receita intermediada
  variableCostPerRoomNight: number; // custo variável adicional por diária ocupada (nova premissa; 0 no Excel)
  averageStayNights: number; // permanência média (informativo / receita por hóspede)
}

export interface WeddingPhaseConfig {
  startYear: number; // ano de operação em que a fase comercial entra (1 = inauguração)
  venueRental: boolean;
  welcomeParty: boolean;
  cateringOwn: boolean; // catering próprio (senão terceirizado: hotel captura só comissão)
  beverageOwn: boolean;
  poolParty: boolean;
  otherActivities: boolean;
}

export interface WeddingsAssumptions {
  enabled: boolean;
  countByYear: number[]; // casamentos por ano de operação (repete o último)
  monthWeights: number[]; // distribuição mensal (12 pesos)
  guests: number;
  nights: number; // diárias por casamento (buyout)
  roomsBlocked: number | 'all'; // apartamentos ocupados pelo buyout
  roomRate: number; // diária média por apartamento no buyout (ano 1, nominal)
  priceGrowth: number; // crescimento anual dos preços de casamento
  venueFee: number; // locação de espaços por casamento
  welcomePartyPerGuest: number;
  cateringPerGuest: number; // casamento
  beveragesPerGuest: number;
  poolPartyPerGuest: number;
  otherActivitiesPerWedding: number;
  extraConsumptionPerGuestNight: number; // consumo adicional dos hóspedes durante o evento
  serviceFeePct: number; // taxa de serviço sobre catering/bebidas (repassada; margem = 0 por padrão)
  cateringOutsourcedCommission: number; // quando catering terceirizado, % capturado pelo hotel
  costPct: { catering: number; beverages: number; welcomeParty: number; poolParty: number; venue: number; other: number; lodging: number };
  phases: { p1: WeddingPhaseConfig; p2: WeddingPhaseConfig; p3: WeddingPhaseConfig };
  closeBeachClubDuringBuyout: boolean;
  closeRestaurantDuringBuyout: boolean;
}

export interface RestaurantAssumptions {
  seats: number[]; // lugares por mês (total do hotel)
  turnover: number[]; // giro médio diário por mês
  ticketYear1: number[];
  ticketGrowth: number[]; // anos 2..6
  ticketLongTermGrowth: number; // após ano 6 (Excel: 0)
  /** eventos legados do Excel (festas) */
  legacyEvents: { perMonth: number[]; pax: number[]; ticketYear1: number[]; ticketGrowth: number[]; longTermGrowth: number };
  guestsTicketYear1: number[]; // A&B hóspedes
  guestsTicketGrowth: number[];
  guestsTicketLongTermGrowth: number;
  guestsTicketBasis: 'roomNight' | 'guestNight';
  taxPct: number; // impostos sobre receita A&B (Excel 14,65%)
  cmvPct: number;
  cmoVarPct: number; // CMO variável sobre receita
  cmoFixedMonthly: number; // Excel: R$180k/mês; no modelo revisado = 0 (folha por cargo)
  otherDirectPct: number;
}

export interface BeachClubAssumptions {
  enabled: boolean;
  startYear: number;
  visitorsPerDay: number[]; // visitantes externos por dia, por mês (ano estabilizado)
  rampByYear: number[]; // multiplicador por ano de operação
  ticket: number; // ticket médio (day-use + consumo)
  dayUseFee: number; // taxa de day-use incluída no ticket? (separado para exibição)
  priceGrowth: number;
  cmvPct: number;
  cmoPct: number;
  otherDirectPct: number;
  taxPct: number;
  experiencesRevenueMonthly: number; // experiências e atividades especiais (ano 1)
  experiencesMarginPct: number;
}

export type CostCenter = 'hotel' | 'fnb' | 'admin';

export interface StaffPosition {
  name: string;
  costCenter: CostCenter;
  monthlyCost: number; // salário × encargos
  headcount: Grid; // [ano][mês]
  extrasPerRoomNight?: number; // custo de extras por diária ocupada
  extrasPerWedding?: number; // custo de extras por casamento
}

export interface PayrollAssumptions {
  positions: StaffPosition[];
  chargesFactor: number;
  plrPct: number;
  plrBase: 'excelHotel' | 'gop'; // Excel: % sobre resultado hoteleiro (exclui restaurante)
  inflation: number;
}

export interface OpexItem { name: string; monthly: number }

export interface OpexAssumptions {
  inflationMode: 'excel' | 'compound'; // Excel: fator (1+i)^(1-ano)-1 (subestima)
  direct: { internet: number; utilities: number; maintenance: number; laundryPerRoomNight: number; inflation: number };
  admin: { items: OpexItem[]; inflation: number };
  marketing: { pctHotelRevenue: number; printMonthly: number; inflation: number };
  insurance: { monthly: number; iptuAnnual: number; iptuMonth: number; inflation: number };
  operator: { mode: 'own' | 'third'; baseFeePctRevenue: number; incentiveFeePctGOP: number; ownCorporateMonthly: number };
  phase2FixedCostFactor: number; // fração dos custos fixos (diretos/adm/seguros/folha fixa) replicada na Fase 02 (Excel = 1)
  ffeReserve: { pctRevenue: number; startYear: number };
  preOpening: { total: number; monthsBefore: number };
  workingCapital: { receivableDays: number; payableDays: number };
}

export interface CapexItemSeries { code: string; label: string; group: 'construction' | 'ffe' | 'projects' | 'land' | 'preop' | 'other'; values: number[] }

export interface CapexPhase {
  mode: 'excel' | 'parametric';
  scale: number; // multiplicador sobre a série Excel
  /** série mensal (positiva = desembolso) indexada por data YYYY-MM, origem Excel */
  excelSeries: { constructionStart: YM; dates: YM[]; items: CapexItemSeries[] };
  parametric: { items: { name: string; group: CapexItemSeries['group']; total: number; startOffset: number; months: number; curve: 'linear' | 's' }[] };
  contingencyPct: number;
}

export interface CapexAssumptions {
  phase1: CapexPhase;
  phase2: CapexPhase;
  includeSunk: boolean; // incluir gastos já realizados (terreno etc.) no fluxo do projeto
  depreciation: { constructionYears: number; ffeYears: number };
}

export interface TaxAssumptions {
  regime: 'excelNOI' | 'presumido' | 'real';
  excelRateOnNOI: number;
  hotelISS: number;
  pisCofinsPresumido: number;
  pisCofinsReal: number;
  irpj: number;
  irpjAdicional: number;
  irpjAdicionalThresholdMonthly: number;
  csll: number;
  presumidoBaseHotelIRPJ: number;
  presumidoBaseHotelCSLL: number;
  presumidoBaseFnbIRPJ: number;
  presumidoBaseFnbCSLL: number;
  lossCarryforwardCap: number; // 30%
}

export interface LoanTranche { date: YM; amount: number }
export interface LoanAssumptions {
  id: string;
  label: string;
  phase: 1 | 2;
  enabled: boolean;
  amount: number; // valor financiado
  disbursement: 'tranches' | 'proCapex';
  tranches: LoanTranche[];
  proCapexStart: YM | null; // se proCapex: início dos desembolsos (null = início da obra)
  financedPct: number; // se proCapex: % de cada desembolso de CAPEX financiado (BNB: até 90%)
  indexer: 'fixed' | 'inflation';
  spread: number; // taxa anual (juros reais se indexado)
  bonusAdimplencia: number; // desconto % sobre os juros (BNB/FNE)
  graceMonths: number; // carência (a partir do 1º desembolso)
  interestDuringGrace: 'pay' | 'capitalize';
  totalMonths: number;
  system: 'SAC' | 'PRICE';
  structuringPct: number;
  insurancePctAnnual: number; // sobre saldo devedor
  recurringMonthly: number;
  extraAmortizations: LoanTranche[];
  minDSCR: number; // covenant
}

export interface GuaranteeAssumptions {
  enabled: boolean;
  requiredPctOfLoan: number; // garantia preexistente exigida (80%)
  propertyValueBank: number; // avaliação BNB do imóvel
  evolutionaryPct: number; // % da obra executada aceita como garantia (0 = não substitui preexistente)
  investor: {
    committed: number; // garantias adicionais disponibilizadas
    model: 'A' | 'B' | 'C'; // A fee anual; B fee diferido; C participação adicional
    feePct: number; // % a.a. sobre valor efetivamente vinculado
    startDate: YM | null; // null = 1º desembolso do financiamento
    indexed: boolean; // corrige o fee pela inflação
    deferredAccrualRate: number; // modelo B: taxa de acumulação anual do fee diferido
    deferredPaymentStartMonthsAfterOpening: number; // modelo B
    extraStakePct: number; // modelo C
    releaseAfterOpeningMonths: number; // só reduz a partir de N meses após inauguração
    releaseWithAmortization: boolean;
    setupCost: number;
    maintenanceCostAnnual: number;
  };
}

export interface Partner { name: string; stakePre: number; capitalInvested: number }

export interface EquityAssumptions {
  partners: Partner[]; // sócios atuais
  landValueMarket: number;
  landValueBank: number;
  otherAssets: number;
  liabilities: number;
  preMoney: number; // valuation pré-money negociado
  investor: { name: string; contribution: number; stakeNegotiated: number | null; closingDate: YM; targetIRR: number; horizonYears: number };
  existingAdditionalContribution: number;
  callAllocation: 'investorFirst' | 'proRata';
  distribution: { payoutPct: number; minCashReserve: number; startMonthsAfterOpening: number; blockedWhileDSCRBelow: number };
  preferredReturn: { enabled: boolean; ratePct: number }; // preferência simples ao investidor
  exit: { year: number; method: 'multiple' | 'dcf' | 'bookNOI' | 'none'; ebitdaMultiple: number };
}

export interface ValuationAssumptions {
  discountRateProject: number;
  discountRateEquity: number;
  terminal: { method: 'perpetuity' | 'multiple' | 'noiMultiple'; growth: number; ebitdaMultiple: number; noiMultiple: number };
  valuationDate: YM | null; // null = data-base
}

export interface CalendarAssumptions {
  modelStart: YM; // início do fluxo (Excel: 2024-01)
  baseDate: YM; // data-base realizado/a realizar
  horizonYears: number; // anos de operação após inauguração da Fase 01
  flowEnd: YM | null; // sobrescreve horizonte (Excel: 2050-12)
  inflation: number; // inflação de referência anual (indexador)
}

export interface Scenario {
  id: string;
  name: string;
  description: string;
  kind: 'excel' | 'base' | 'conservative' | 'optimistic' | 'custom';
  createdAt: string;
  updatedAt: string;
  calendar: CalendarAssumptions;
  hotel: HotelAssumptions;
  weddings: WeddingsAssumptions;
  restaurant: RestaurantAssumptions;
  beachClub: BeachClubAssumptions;
  payroll: PayrollAssumptions;
  opex: OpexAssumptions;
  capex: CapexAssumptions;
  tax: TaxAssumptions;
  loans: LoanAssumptions[];
  guarantees: GuaranteeAssumptions;
  equity: EquityAssumptions;
  valuation: ValuationAssumptions;
  provenance: ProvenanceMap;
}

/* ------------------------------------------------------------------ */
/* Resultados                                                          */
/* ------------------------------------------------------------------ */

export type Series = number[];

export interface MonthlyLines {
  months: YM[];
  dates: Date[];
  opYear: number[]; // ano de operação (Fase 01) por mês (0 = pré-operação)
  opYearP2: number[];
  daysInMonth: number[];
  // hotelaria
  roomsAvailable: Series; // diárias disponíveis (após bloqueio de buyout)
  roomNightsBlocked: Series;
  roomsOccupied: Series;
  roomsOccupiedNormal: Series;
  roomsOccupiedSpecial: Series;
  guests: Series;
  revHotelNormal: Series;
  revHotelOTA: Series;
  revHotelSpecial: Series;
  revHotel: Series; // total hospedagem convencional
  otaCommission: Series;
  hotelVariableCost: Series;
  // casamentos
  weddingsCount: Series;
  revWeddingLodging: Series;
  revWeddingVenue: Series;
  revWeddingWelcome: Series;
  revWeddingCatering: Series;
  revWeddingBeverages: Series;
  revWeddingPool: Series;
  revWeddingOther: Series;
  revWeddingExtra: Series;
  revWeddings: Series;
  costWeddings: Series;
  // A&B
  revRestaurant: Series;
  revLegacyEvents: Series;
  revFnbGuests: Series;
  revBeachClub: Series;
  revExperiences: Series;
  revFnb: Series; // restaurante + eventos legados + A&B hóspedes + beach club + experiências
  fnbTaxes: Series;
  fnbCmv: Series;
  fnbCmo: Series;
  fnbOther: Series;
  costFnb: Series;
  // folha
  payrollHotel: Series;
  payrollFnb: Series;
  payrollAdmin: Series;
  payrollExtras: Series;
  payrollPLR: Series;
  payrollCorrection: Series;
  payroll: Series;
  // opex
  opexDirect: Series;
  opexAdmin: Series;
  opexMarketing: Series;
  opexInsurance: Series;
  opexOperator: Series;
  opexPreOpening: Series;
  opexFfeReserve: Series;
  opex: Series; // folha + direto + adm + mkt + seguros + operador + pré-abertura + reserva
  // resultado
  revenueGross: Series;
  revenueTaxes: Series; // impostos sobre receita (ISS/PIS/COFINS hotel + A&B)
  revenueNet: Series;
  gop: Series;
  noi: Series; // = EBITDA operacional (antes de capex)
  ebitda: Series;
  depreciation: Series;
  ebit: Series;
  // capex
  capexConstruction: Series;
  capexFfe: Series;
  capexProjects: Series;
  capexLand: Series;
  capexPreop: Series;
  capex: Series;
  capexP1: Series;
  capexP2: Series;
  // impostos sobre lucro
  incomeTaxUnlevered: Series;
  incomeTaxLevered: Series;
  // capital de giro
  workingCapitalDelta: Series;
  // dívida
  debtDraw: Series;
  debtInterest: Series;
  debtAmortization: Series;
  debtFees: Series;
  debtService: Series; // juros + amortização + fees (pagos)
  debtBalance: Series;
  debtBalanceP1: Series; // saldo do financiamento da Fase 01 (base das garantias)
  debtFlow: Series; // + saques - serviço
  // garantias
  guaranteeRequired: Series;
  guaranteeCommitted: Series;
  guaranteeFeeAccrued: Series;
  guaranteeFeePaid: Series;
  guaranteeCosts: Series;
  // fluxos
  terminalValue: Series;
  fcfProject: Series; // fluxo livre do projeto (desalavancado, após imposto desalavancado, com valor terminal)
  fcfProjectNoTV: Series;
  fcfEquity: Series; // após dívida, garantias, imposto alavancado
  cashBalance: Series; // caixa acumulado antes de aportes/distribuições
  equityCalls: Series;
  distributions: Series;
  cashAfterEquity: Series;
  dscr: Series;
}

export interface AnnualRow { year: number; [k: string]: number }

export interface PartyFlow {
  name: string;
  stakePost: number;
  contributions: Series;
  distributions: Series;
  exitProceeds: Series;
  guaranteeFees: Series; // recebidos
  net: Series;
  irr: number | null;
  npv: number;
  moic: number;
  totalIn: number;
  totalOut: number;
}

export interface CapTableRow { name: string; stakePre: number; stakePost: number; contribution: number; capitalInvested: number }

export interface ValuationResult {
  dcf: { ev: number; tv: number; pvTv: number; pvFcf: number; netDebt: number; equity: number; tvShareOfEv: number };
  multiple: { ebitdaStabilized: number; multiple: number; ev: number; netDebt: number; equity: number };
  bookNOI: { noiLast12: number; multiple: number; value: number };
}

export interface Alert { level: 'error' | 'warning' | 'info'; code: string; message: string; month?: YM }

export interface Metrics {
  capexTotal: number; capexP1: number; capexP2: number;
  debtTotal: number; equityTotal: number; equityNeed: number; maxExposure: number; maxExposureDate: YM | null;
  guaranteeRequiredPeak: number; guaranteeShortfall: number; guaranteeCommittedPeak: number; guaranteeCostTotal: number; guaranteeCostPV: number;
  revenueStabilized: number; ebitdaStabilized: number; ebitdaMarginStabilized: number; noiStabilized: number; stabilizedYear: number;
  occupancyStabilized: number; adrStabilized: number; revparStabilized: number; trevparStabilized: number; revenuePerGuestStabilized: number;
  irrProject: number | null; irrProjectNoTV: number | null; npvProject: number; irrEquity: number | null; npvEquity: number;
  paybackSimple: YM | null; paybackDiscounted: YM | null; paybackMonths: number | null;
  moicEquity: number; roic: number; dscrMin: number | null; dscrAvg: number | null; dscrMinYear: number | null;
  breakEvenOccupancy: number | null; breakEvenWeddings: number | null;
  interestTotal: number; debtServiceTotal: number; dilution: number;
  yieldOnCost: number;
}

export interface Results {
  scenarioId: string;
  monthly: MonthlyLines;
  annual: AnnualRow[];
  metrics: Metrics;
  valuation: ValuationResult;
  capTable: CapTableRow[];
  parties: PartyFlow[];
  alerts: Alert[];
  debtSchedules: { id: string; label: string; rows: { month: YM; draw: number; interest: number; amortization: number; fees: number; balance: number; dscr: number | null }[] }[];
}
