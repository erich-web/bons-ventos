/**
 * Rastreabilidade: para cada indicador, quais módulos e premissas (caminhos do Scenario) influenciam o cálculo,
 * e a fórmula em linguagem natural. Grafo estático derivado da estrutura de compute().
 */
export interface TraceNode { id: string; label: string; formula: string; inputs: string[]; depends: string[] }

export const TRACE: Record<string, TraceNode> = {
  roomsAvailable: { id: 'roomsAvailable', label: 'Diárias disponíveis', formula: 'dias × UH − diárias bloqueadas por buyout', inputs: ['hotel.phase1.rooms', 'hotel.phase1.categories', 'hotel.phase2', 'hotel.daysNormal', 'weddings.nights', 'weddings.roomsBlocked', 'weddings.countByYear'], depends: [] },
  roomsOccupied: { id: 'roomsOccupied', label: 'Diárias ocupadas', formula: 'disponíveis (normais × ocupação normal) + (especiais × ocupação especial)', inputs: ['hotel.occupancyNormal', 'hotel.occupancySpecial'], depends: ['roomsAvailable'] },
  revHotel: { id: 'revHotel', label: 'Receita de hospedagem', formula: 'Σ diárias ocupadas × diária média (ano/mês × crescimento × índice de categoria)', inputs: ['hotel.rateNormalYear1', 'hotel.rateGrowth', 'hotel.rateLongTermGrowth', 'hotel.rateLongTermMode', 'hotel.rateSpecialYear1', 'hotel.rateSpecialGrowth', 'hotel.shareOTA'], depends: ['roomsOccupied'] },
  otaCommission: { id: 'otaCommission', label: 'Comissões de distribuição', formula: 'receita intermediada × comissão', inputs: ['hotel.shareOTA', 'hotel.otaCommission'], depends: ['revHotel'] },
  revWeddings: { id: 'revWeddings', label: 'Receita de casamentos', formula: 'casamentos × (buyout UH × diárias × tarifa + locação + welcome + catering + bebidas + pool + outros + consumo extra) × (1+g)^(ano−1), por fase comercial', inputs: ['weddings.countByYear', 'weddings.monthWeights', 'weddings.guests', 'weddings.nights', 'weddings.roomRate', 'weddings.venueFee', 'weddings.cateringPerGuest', 'weddings.beveragesPerGuest', 'weddings.welcomePartyPerGuest', 'weddings.poolPartyPerGuest', 'weddings.extraConsumptionPerGuestNight', 'weddings.phases', 'weddings.priceGrowth'], depends: [] },
  costWeddings: { id: 'costWeddings', label: 'Custos diretos de eventos', formula: 'Σ componente × % custo direto', inputs: ['weddings.costPct', 'weddings.serviceFeePct', 'weddings.cateringOutsourcedCommission'], depends: ['revWeddings'] },
  revFnb: { id: 'revFnb', label: 'Receita de A&B', formula: 'restaurante (dias abertos × lugares × giro × ticket) + A&B hóspedes (ticket × diárias/hóspedes) + beach club (dias abertos × visitantes × ticket) + experiências', inputs: ['restaurant.seats', 'restaurant.turnover', 'restaurant.ticketYear1', 'restaurant.ticketGrowth', 'restaurant.guestsTicketYear1', 'restaurant.guestsTicketBasis', 'beachClub', 'weddings.closeRestaurantDuringBuyout', 'weddings.closeBeachClubDuringBuyout'], depends: ['roomsOccupied'] },
  costFnb: { id: 'costFnb', label: 'Custos diretos de A&B', formula: 'receita × (impostos + CMV + CMO variável + outros) + CMO fixo', inputs: ['restaurant.taxPct', 'restaurant.cmvPct', 'restaurant.cmoVarPct', 'restaurant.cmoFixedMonthly', 'restaurant.otherDirectPct', 'beachClub.cmvPct', 'beachClub.cmoPct'], depends: ['revFnb', 'revWeddings'] },
  payroll: { id: 'payroll', label: 'Folha de pagamento', formula: 'Σ cargos (headcount[ano][mês] × custo mensal) + extras (por diária / por casamento) + correção inflacionária + PLR', inputs: ['payroll.positions', 'payroll.inflation', 'payroll.plrPct', 'payroll.plrBase', 'opex.inflationMode', 'opex.phase2FixedCostFactor'], depends: ['roomsOccupied', 'revWeddings'] },
  opexDirect: { id: 'opexDirect', label: 'Operacionais diretos', formula: '(internet + utilities + manutenção + lavanderia × diárias) × (1 + correção)', inputs: ['opex.direct', 'opex.inflationMode'], depends: ['roomsOccupied'] },
  opexAdmin: { id: 'opexAdmin', label: 'Administrativas / gerais', formula: 'Σ itens fixos × (1 + correção)', inputs: ['opex.admin', 'opex.inflationMode'], depends: [] },
  opexMarketing: { id: 'opexMarketing', label: 'Marketing e vendas', formula: '% receita hoteleira + impressos × (1 + correção)', inputs: ['opex.marketing'], depends: ['revHotel'] },
  opexInsurance: { id: 'opexInsurance', label: 'Seguros e IPTU', formula: '(seguro mensal + IPTU no mês) × (1 + correção)', inputs: ['opex.insurance'], depends: [] },
  revenueTaxes: { id: 'revenueTaxes', label: 'Impostos sobre receita', formula: 'receita hoteleira × (ISS + PIS/COFINS) conforme regime; A&B dentro dos custos de A&B', inputs: ['tax.regime', 'tax.hotelISS', 'tax.pisCofinsPresumido', 'tax.pisCofinsReal'], depends: ['revHotel', 'revWeddings'] },
  gop: { id: 'gop', label: 'GOP', formula: 'receita líquida − custos A&B − custos eventos − comissões − custo variável UH − folha − diretos − adm − marketing − seguros', inputs: ['hotel.variableCostPerRoomNight'], depends: ['revenueTaxes', 'costFnb', 'costWeddings', 'otaCommission', 'payroll', 'opexDirect', 'opexAdmin', 'opexMarketing', 'opexInsurance'] },
  ebitda: { id: 'ebitda', label: 'EBITDA', formula: 'GOP − taxa de operador/custo corporativo − pré-abertura − reserva FF&E', inputs: ['opex.operator', 'opex.preOpening', 'opex.ffeReserve'], depends: ['gop'] },
  depreciation: { id: 'depreciation', label: 'Depreciação', formula: 'obra+projetos / 25 anos; FF&E / 10 anos, a partir da inauguração de cada fase', inputs: ['capex.depreciation'], depends: ['capex'] },
  capex: { id: 'capex', label: 'CAPEX', formula: 'séries mensais do Excel (× escala × (1 + contingência)) ou itens paramétricos com curva', inputs: ['capex.phase1', 'capex.phase2', 'capex.includeSunk', 'hotel.phase1.constructionStart', 'hotel.phase2.constructionStart'], depends: [] },
  incomeTax: { id: 'incomeTax', label: 'Impostos sobre o lucro', formula: 'Excel: 22,5% × NOI; Presumido: base presumida × (IRPJ + adicional + CSLL); Real: (EBIT − juros) × 34% com compensação de prejuízo (30%)', inputs: ['tax'], depends: ['ebitda', 'depreciation', 'debtInterest'] },
  debtService: { id: 'debtService', label: 'Serviço da dívida', formula: 'juros (saldo × taxa mensal) + amortização (SAC/Price após carência) + tarifas/seguros', inputs: ['loans'], depends: ['capex'] },
  debtInterest: { id: 'debtInterest', label: 'Juros', formula: 'saldo devedor × ((1+spread)(1+inflação))^(1/12) × (1 − bônus)', inputs: ['loans', 'calendar.inflation'], depends: ['debtService'] },
  guaranteeCosts: { id: 'guaranteeCosts', label: 'Custo das garantias', formula: 'valor vinculado (= min(comprometido, 80% × saldo − imóvel − evolutiva)) × fee/12 (A: pago; B: diferido; C: participação) + constituição + manutenção', inputs: ['guarantees'], depends: ['debtService', 'capex'] },
  fcfProject: { id: 'fcfProject', label: 'Fluxo de caixa livre do projeto', formula: 'EBITDA − imposto desalavancado − CAPEX − Δ capital de giro + valor terminal', inputs: ['opex.workingCapital', 'valuation.terminal', 'calendar.horizonYears'], depends: ['ebitda', 'incomeTax', 'capex'] },
  fcfEquity: { id: 'fcfEquity', label: 'Fluxo de caixa do equity', formula: 'FCF projeto + benefício fiscal dos juros + saques − serviço da dívida − custo das garantias', inputs: [], depends: ['fcfProject', 'debtService', 'guaranteeCosts'] },
  irrProject: { id: 'irrProject', label: 'TIR do projeto', formula: 'IRR mensal do FCF do projeto (com valor terminal), anualizada', inputs: [], depends: ['fcfProject'] },
  npvProject: { id: 'npvProject', label: 'VPL do projeto', formula: 'XNPV do FCF do projeto à taxa de desconto do projeto, na data-base', inputs: ['valuation.discountRateProject', 'calendar.baseDate'], depends: ['fcfProject'] },
  irrEquity: { id: 'irrEquity', label: 'TIR do equity', formula: 'IRR do FCF do equity (todos os sócios)', inputs: [], depends: ['fcfEquity'] },
  dscr: { id: 'dscr', label: 'DSCR', formula: '(EBITDA − impostos) / serviço da dívida, por ano', inputs: [], depends: ['ebitda', 'debtService'] },
  distributions: { id: 'distributions', label: 'Distribuições', formula: 'caixa acima da reserva × payout, após N meses da inauguração e com DSCR acima do mínimo', inputs: ['equity.distribution'], depends: ['fcfEquity'] },
  investorIRR: { id: 'investorIRR', label: 'TIR do investidor', formula: 'XIRR de (−aporte no closing + distribuições × participação + fees de garantia + saída × participação)', inputs: ['equity.investor', 'equity.preMoney', 'equity.exit', 'equity.preferredReturn', 'guarantees.investor'], depends: ['distributions', 'guaranteeCosts', 'valuation'] },
  existingIRR: { id: 'existingIRR', label: 'TIR dos sócios atuais', formula: 'XIRR de (−chamadas de capital pró-rata + distribuições × participação pós + saída)', inputs: ['equity.partners', 'equity.callAllocation'], depends: ['distributions', 'valuation'] },
  valuation: { id: 'valuation', label: 'Valuation', formula: 'DCF: PV(FCF) + PV(valor terminal) − dívida líquida; Múltiplo: EBITDA estabilizado × múltiplo − dívida líquida', inputs: ['valuation'], depends: ['fcfProject', 'ebitda', 'debtService'] },
  capTable: { id: 'capTable', label: 'Cap table', formula: 'participação investidor = negociada ou aporte / (pré-money + aporte) + participação por garantias (modelo C); sócios atuais diluídos pró-rata', inputs: ['equity.partners', 'equity.preMoney', 'equity.investor.contribution', 'equity.investor.stakeNegotiated', 'guarantees.investor.model', 'guarantees.investor.extraStakePct'], depends: [] },
};

/** Fecho transitivo: todas as premissas e nós que influenciam um indicador. */
export function traceInputs(id: string): { nodes: TraceNode[]; inputs: string[] } {
  const seen = new Set<string>();
  const nodes: TraceNode[] = [];
  const inputs = new Set<string>();
  const visit = (k: string) => {
    if (seen.has(k) || !TRACE[k]) return;
    seen.add(k);
    const n = TRACE[k];
    nodes.push(n);
    n.inputs.forEach((i) => inputs.add(i));
    n.depends.forEach(visit);
  };
  visit(id);
  return { nodes, inputs: Array.from(inputs).sort() };
}
