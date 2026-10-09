import { useMemo, type ReactNode } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart } from 'recharts';
import { Ledger, AlertList, CHART_COLORS as C, chartAxis, chartTooltipStyle, tipFmt, Note } from '../components/ui';
import { Tornado } from '../components/sensitivity';
import { useActiveScenario, useScenarios } from '../store/scenarios';
import { useResults } from '../lib/useResults';
import { phaseDates, phaseRooms } from '../engine/compute';
import { tornado, DRIVERS, currentStake } from '../engine/analysis';
import { captureCharts, exportPdfReport } from '../lib/export';
import { fmtM, fmtPct, fmtYM, fmtX, fmtNum } from '../lib/format';
import excel from '../data/excel-r05.json';
import type { PageKey } from '../App';

const AREAS = excel.areas;
const GUARANTEE_MODEL: Record<'A' | 'B' | 'C', string> = { A: 'fee anual sobre o valor vinculado', B: 'fee diferido, acumulado e pago após a inauguração', C: 'participação societária adicional em troca da garantia' };

export default function Presentation({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const m = r.metrics;
  const scenarios = useScenarios((st) => st.scenarios);
  const setActive = useScenarios((st) => st.setActive);
  const p1 = phaseDates(s, 1);
  const p2 = phaseDates(s, 2);
  const rooms1 = phaseRooms(s, 1);
  const rooms2 = s.hotel.phase2.enabled ? phaseRooms(s, 2) : 0;
  const years = useMemo(() => r.annual.filter((a) => a.opYear > 0 && a.opYear <= 10), [r]);
  const revData = years.map((a) => ({ ano: a.year, Hospedagem: a.revHotel / 1e6, Casamentos: a.revWeddings / 1e6, 'A&B': a.revFnb / 1e6 }));
  const ebitdaData = years.map((a) => ({ ano: a.year, EBITDA: a.ebitda / 1e6, Margem: a.ebitdaMargin }));
  const capexGroups = useMemo(() => {
    const t = { construction: 0, ffe: 0, projects: 0, land: 0, preop: 0 };
    for (const a of r.annual) { t.construction += a.capexConstruction; t.ffe += a.capexFfe; t.projects += a.capexProjects; t.land += a.capexLand; t.preop += a.capexPreop; }
    return t;
  }, [r]);
  const inv = r.parties[r.parties.length - 1];
  const invRow = r.capTable[r.capTable.length - 1];
  const tornadoRows = useMemo(() => tornado(s, 'irrProject', DRIVERS, r), [s, r]);
  const weddingsStab = s.weddings.enabled ? s.weddings.countByYear[s.weddings.countByYear.length - 1] : 0;
  const loansOn = s.loans.filter((l) => l.enabled && l.amount > 0);
  const today = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const capData = [
    { nome: 'Financiamento', valor: m.debtTotal / 1e6, fill: C.debt },
    { nome: 'Capital próprio', valor: m.equityTotal / 1e6, fill: C.equity },
    { nome: 'Garantia exigida', valor: m.guaranteeRequiredPeak / 1e6, fill: C.gold2 },
    { nome: 'Imóvel (aval. BNB)', valor: s.guarantees.propertyValueBank / 1e6, fill: C.sand },
    { nome: 'Complementação', valor: m.guaranteeShortfall / 1e6, fill: C.fnb },
  ];

  return (
    <div className="bg-cream">
      {/* Controles flutuantes */}
      <div className="fixed top-4 right-5 z-40 flex items-center gap-2 bg-paper/95 border border-line rounded-sm px-3 py-2 shadow-sm no-print">
        <span className="text-[11px] text-ink-3">Cenário</span>
        <select value={s.id} onChange={(e) => setActive(e.target.value)} className="text-[12px] min-w-[180px]">{scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}</select>
        <button className="btn" onClick={async () => { const charts = await captureCharts(); await exportPdfReport(s, r, { charts, title: 'Hotel Bons Ventos — apresentação' }); }}>Baixar PDF</button>
        <button className="btn btn-ghost" onClick={() => go('overview')}>Voltar à plataforma</button>
      </div>

      {/* 1. Capa */}
      <Slide tone="sand" first>
        <div className="max-w-[820px]">
          <div className="text-[12px] text-ink-2 tracking-wide">Apresentação para investidores · {today}</div>
          <h1 className="display text-[84px] leading-[0.95] font-light text-green mt-6">Hotel<br />Bons Ventos</h1>
          <p className="mt-8 text-[20px] text-ink-2 leading-relaxed max-w-[600px]">Boutique hotel, beach club e destination weddings na Barrinha, Acaraú — Ceará.</p>
          <div className="mt-14 grid grid-cols-3 gap-8 max-w-[720px]">
            <Fact label="Cenário" value={s.name} hint={s.kind === 'excel' ? 'réplica do Excel R05' : 'premissas revisadas'} />
            <Fact label="Apartamentos" value={`${rooms1}${rooms2 ? ` + ${rooms2}` : ''} UH`} hint={rooms2 ? 'Fase 01 + Fase 02' : 'Fase 01'} />
            <Fact label="Inauguração" value={fmtYM(p1.opening)} hint={`obra a partir de ${fmtYM(p1.constructionStart)}`} />
          </div>
        </div>
        <p className="absolute bottom-10 left-[8vw] right-[8vw] text-[11px] text-ink-3 max-w-[760px] leading-relaxed">Material de discussão preliminar. Todos os valores são projeções nominais em reais calculadas a partir das premissas do cenário indicado; hipóteses de negociação e condições de financiamento ainda não foram aprovadas por nenhuma instituição.</p>
      </Slide>

      {/* 2. Oportunidade */}
      <Slide tone="cream" n={2} title="A oportunidade">
        <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-14">
          <div className="space-y-4 text-[16px] leading-relaxed text-ink-2">
            <p>Hotel boutique pé na areia no litoral oeste do Ceará, com arquitetura contemporânea integrada à paisagem de dunas e vento. Escala intimista, serviço próximo e três receitas complementares: hospedagem, beach club com gastronomia autoral e exclusividade do hotel para casamentos.</p>
            <p>O formato de destination wedding com buyout — o hotel inteiro reservado por alguns dias — é o diferencial comercial: diária garantida para todas as unidades, catering e bar próprios e locação de espaços, com baixa sazonalidade para o produto.</p>
            <p>Benchmark comercial: Saline Taíba, referência consolidada no Ceará para o mesmo formato, usado como parâmetro de tarifa, ocupação e eventos por ano. As premissas do cenário mantêm Bons Ventos abaixo da referência em tarifa.</p>
          </div>
          <div>
            <Ledger cols={2} items={[
              { label: 'UH Fase 01', value: String(rooms1), hint: `${fmtNum(AREAS.phase1.built)} m² construídos` },
              { label: 'UH Fase 02', value: s.hotel.phase2.enabled ? String(rooms2) : '—', hint: s.hotel.phase2.enabled ? `inauguração ${fmtYM(p2.opening)}` : 'expansão opcional' },
              { label: 'Restaurante', value: `${fmtNum(Math.max(...s.restaurant.seats))} lugares`, hint: `${AREAS.phase1.seats} na Fase 01` },
              { label: 'Casamentos / ano', value: s.weddings.enabled ? fmtNum(weddingsStab) : '—', hint: s.weddings.enabled ? `${s.weddings.guests} convidados · ${s.weddings.nights} diárias` : 'módulo desligado' },
              { label: 'Ocupação estabilizada', value: fmtPct(m.occupancyStabilized, 0), hint: `ano ${m.stabilizedYear} de operação` },
              { label: 'ADR estabilizado', value: `R$ ${fmtNum(m.adrStabilized)}`, hint: `RevPAR R$ ${fmtNum(m.revparStabilized)}` },
            ]} />
          </div>
        </div>
      </Slide>

      {/* 3. Investimento */}
      <Slide tone="sand" n={3} title="O investimento">
        <Ledger items={[
          { label: 'CAPEX Fase 01', value: fmtM(m.capexP1), hint: 'inclui terreno e projetos' },
          { label: 'CAPEX Fase 02', value: s.hotel.phase2.enabled ? fmtM(m.capexP2) : '—', hint: s.hotel.phase2.enabled ? `obra ${fmtYM(p2.constructionStart)} – ${fmtYM(p2.constructionEnd)}` : 'não prevista' },
          { label: 'Obra e infraestrutura', value: fmtM(capexGroups.construction) },
          { label: 'FF&E e equipamentos', value: fmtM(capexGroups.ffe) },
          { label: 'Projetos e legal', value: fmtM(capexGroups.projects) },
          { label: 'Terreno', value: fmtM(capexGroups.land), hint: s.capex.includeSunk ? 'já realizado, incluído no fluxo' : 'excluído do fluxo' },
        ]} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 mt-12">
          <Timeline label="Início da obra (Fase 01)" value={fmtYM(p1.constructionStart)} hint={`${s.hotel.phase1.constructionMonths} meses de obra`} />
          <Timeline label="Conclusão da obra" value={fmtYM(p1.constructionEnd)} hint={`${s.hotel.phase1.openingLagMonths} meses de pré-abertura`} />
          <Timeline label="Inauguração" value={fmtYM(p1.opening)} hint={s.hotel.phase2.enabled ? `Fase 02 em ${fmtYM(p2.opening)}` : 'operação em fase única'} />
        </div>
        <div className="mt-10 max-w-[760px]"><Note>O CAPEX segue as séries do modelo original (R$ {fmtNum(m.capexP1 / 1e6, 1)} M na Fase 01). O enquadramento no BNB considera obra e equipamentos em valores distintos e está em validação.</Note></div>
      </Slide>

      {/* 4. Receitas */}
      <Slide tone="cream" n={4} title="Receitas">
        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-12 items-start">
          <div>
            <div className="text-[12px] text-ink-3 mb-2">Receita bruta por linha de negócio, R$ milhões por ano (10 primeiros anos de operação)</div>
            <ResponsiveContainer width="100%" height={320}>
              <ComposedChart data={revData} margin={{ left: 0, right: 10, top: 10 }}>
                <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="ano" {...chartAxis} /><YAxis {...chartAxis} width={40} />
                <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(1)} M`)} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Hospedagem" stackId="a" fill={C.hotel} /><Bar dataKey="Casamentos" stackId="a" fill={C.weddings} /><Bar dataKey="A&B" stackId="a" fill={C.fnb} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <Ledger cols={1} items={[
            { label: 'Receita estabilizada', value: fmtM(m.revenueStabilized), hint: `ano ${m.stabilizedYear} de operação` },
            { label: 'Ocupação', value: fmtPct(m.occupancyStabilized, 0), hint: 'média das diárias disponíveis' },
            { label: 'ADR', value: `R$ ${fmtNum(m.adrStabilized)}`, hint: 'diária média de hospedagem' },
            { label: 'RevPAR / TRevPAR', value: `R$ ${fmtNum(m.revparStabilized)} / ${fmtNum(m.trevparStabilized)}`, hint: 'por diária disponível' },
          ]} />
        </div>
      </Slide>

      {/* 5. Resultado */}
      <Slide tone="sand" n={5} title="Resultado operacional">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.3fr] gap-12 items-start">
          <div>
            <div className="text-[12px] text-ink-3 mb-2">EBITDA (R$ milhões) e margem</div>
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={ebitdaData} margin={{ left: 0, right: 10, top: 10 }}>
                <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="ano" {...chartAxis} /><YAxis yAxisId="l" {...chartAxis} width={40} /><YAxis yAxisId="r" orientation="right" {...chartAxis} width={40} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 0.7]} />
                <Tooltip {...chartTooltipStyle} formatter={tipFmt((v, n) => (n === 'Margem' ? fmtPct(v, 0) : `R$ ${v.toFixed(1)} M`))} /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar yAxisId="l" dataKey="EBITDA" fill={C.equity} /><Line yAxisId="r" dataKey="Margem" stroke={C.ocean3} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="overflow-x-auto">
            <table className="data text-[12px]">
              <thead><tr><th>Ano</th><th className="r">Receita</th><th className="r">EBITDA</th><th className="r">Margem</th><th className="r">Serviço dívida</th><th className="r">DSCR</th><th className="r">FCF projeto</th></tr></thead>
              <tbody>{years.map((a) => (
                <tr key={a.year}><td className="font-semibold">{a.year}<span className="text-ink-3 font-normal"> · op. {a.opYear}</span></td><td className="r">{fmtM(a.revenueGross)}</td><td className="r font-semibold">{fmtM(a.ebitda)}</td><td className="r">{fmtPct(a.ebitdaMargin, 0)}</td><td className="r">{fmtM(a.debtService)}</td><td className="r">{a.debtService > 0 ? fmtX(a.dscr) : '—'}</td><td className="r">{fmtM(a.fcfProjectNoTV)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      </Slide>

      {/* 6. Estrutura de capital */}
      <Slide tone="cream" n={6} title="Estrutura de capital">
        <Ledger items={[
          { label: 'Financiamento', value: fmtM(m.debtTotal), hint: loansOn.length ? `${loansOn.map((l) => l.label).join(' · ')}` : 'sem dívida no cenário' },
          { label: 'Capital próprio', value: fmtM(m.equityTotal), hint: `chamadas de capital ${fmtM(m.equityNeed)}` },
          { label: 'Juros totais', value: fmtM(m.interestTotal), hint: loansOn[0] ? `${loansOn[0].indexer === 'inflation' ? 'IPCA + ' : ''}${fmtPct(loansOn[0].spread, 2)} a.a.${loansOn[0].bonusAdimplencia ? ` · bônus ${fmtPct(loansOn[0].bonusAdimplencia, 0)}` : ''}` : '' },
          { label: 'Garantia exigida (pico)', value: fmtM(m.guaranteeRequiredPeak), hint: `${fmtPct(s.guarantees.requiredPctOfLoan, 0)} do saldo financiado` },
          { label: 'Complementação', value: fmtM(m.guaranteeShortfall), hint: `imóvel avaliado ${fmtM(s.guarantees.propertyValueBank)}` },
          { label: 'DSCR mínimo', value: m.dscrMin == null ? '—' : fmtX(m.dscrMin), hint: m.dscrMinYear ? `em ${m.dscrMinYear} · covenant ${fmtX(loansOn[0]?.minDSCR ?? 0, 1)}` : 'sem dívida', tone: m.dscrMin != null && m.dscrMin < (loansOn[0]?.minDSCR ?? 1.2) ? 'bad' : 'default' },
        ]} />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1fr] gap-12 mt-10 items-start">
          <div>
            <div className="text-[12px] text-ink-3 mb-2">Fontes, garantias e complementação (R$ milhões)</div>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={capData} layout="vertical" margin={{ left: 10, right: 30, top: 5 }}>
                <CartesianGrid stroke={C.grid} horizontal={false} /><XAxis type="number" {...chartAxis} /><YAxis type="category" dataKey="nome" {...chartAxis} width={130} />
                <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(1)} M`)} />
                <Bar dataKey="valor" name="R$ M" fill={C.hotel} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-[15px] leading-relaxed text-ink-2 space-y-3">
            {loansOn.length ? loansOn.map((l) => (
              <p key={l.id}><span className="font-semibold text-ink">{l.label}:</span> {fmtM(l.amount)} em {l.disbursement === 'proCapex' ? `desembolsos pró-rata à obra (${fmtPct(l.financedPct, 0)} de cada medição)` : `${l.tranches.length} tranches`}, carência de {l.graceMonths} meses, prazo total de {l.totalMonths} meses, sistema {l.system}.</p>
            )) : <p>O cenário não considera financiamento bancário; o investimento é integralmente coberto por capital próprio.</p>}
            {s.guarantees.enabled && <p><span className="font-semibold text-ink">Garantias:</span> exigência preexistente de {fmtPct(s.guarantees.requiredPctOfLoan, 0)} do financiamento; o imóvel avaliado em {fmtM(s.guarantees.propertyValueBank)} cobre parte, e a complementação de {fmtM(m.guaranteeShortfall)} é a lacuna a preencher pelo investidor (modelo {s.guarantees.investor.model}: {GUARANTEE_MODEL[s.guarantees.investor.model]}).</p>}
            <Note tone="warn">Taxas, prazos e enquadramento do BNB/FNE são hipóteses de trabalho, pendentes de confirmação pelo banco.</Note>
          </div>
        </div>
      </Slide>

      {/* 7. Retorno */}
      <Slide tone="sand" n={7} title="Retorno">
        <Ledger items={[
          { label: 'TIR do projeto', value: fmtPct(m.irrProject), hint: `sem valor terminal ${fmtPct(m.irrProjectNoTV)}`, tone: m.irrProject != null && m.irrProject < s.valuation.discountRateProject ? 'bad' : 'good' },
          { label: 'TIR do equity', value: fmtPct(m.irrEquity), hint: `VPL equity ${fmtM(m.npvEquity)} a ${fmtPct(s.valuation.discountRateEquity, 0)}` },
          { label: 'VPL do projeto', value: fmtM(m.npvProject), hint: `a ${fmtPct(s.valuation.discountRateProject, 1)} a.a.`, tone: m.npvProject < 0 ? 'bad' : 'default' },
          { label: 'Payback', value: fmtYM(m.paybackSimple), hint: `descontado ${fmtYM(m.paybackDiscounted)}` },
          { label: 'DSCR mínimo', value: m.dscrMin == null ? '—' : fmtX(m.dscrMin), hint: m.dscrAvg != null ? `média ${fmtX(m.dscrAvg)}` : 'sem dívida' },
          { label: 'Valuation (DCF)', value: fmtM(r.valuation.dcf.ev), hint: `${fmtPct(r.valuation.dcf.tvShareOfEv, 0)} do valor no terminal` },
        ]} />
        <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
          <div>
            <h3 className="text-[22px] text-green font-normal">Retorno do investidor</h3>
            <p className="text-[13px] text-ink-3 mt-1">Para o aporte e a participação definidos neste cenário.</p>
            <div className="mt-4">
              <Ledger cols={3} items={[
                { label: 'TIR do investidor', value: fmtPct(inv.irr), hint: `alvo ${fmtPct(s.equity.investor.targetIRR, 0)}`, tone: inv.irr != null && inv.irr < s.equity.investor.targetIRR ? 'bad' : 'good' },
                { label: 'MOIC', value: inv.totalIn > 0 ? fmtX(inv.moic, 1) : '—', hint: inv.totalIn > 0 ? `${fmtM(inv.totalIn)} → ${fmtM(inv.totalOut)}` : 'sem aporte' },
                { label: 'Participação', value: fmtPct(invRow.stakePost, 1), hint: `aporte ${fmtM(invRow.contribution)}` },
              ]} />
            </div>
          </div>
          <div className="text-[15px] leading-relaxed text-ink-2 space-y-3">
            <p>A TIR do projeto é calculada sobre o fluxo desalavancado mensal, com valor terminal por {s.valuation.terminal.method === 'perpetuity' ? `perpetuidade (g = ${fmtPct(s.valuation.terminal.growth, 1)})` : s.valuation.terminal.method === 'multiple' ? `múltiplo de ${fmtX(s.valuation.terminal.ebitdaMultiple, 0)} EBITDA` : `NOI × ${fmtNum(s.valuation.terminal.noiMultiple)}`} ao fim de {s.calendar.horizonYears} anos de operação.</p>
            <p>O retorno do investidor considera o aporte na data de closing ({fmtYM(s.equity.investor.closingDate)}), as distribuições proporcionais à participação{s.guarantees.enabled && s.guarantees.investor.committed > 0 ? ', a remuneração das garantias' : ''} e a saída no ano {s.equity.exit.year} {s.equity.exit.method === 'multiple' ? `a ${fmtX(s.equity.exit.ebitdaMultiple, 0)} EBITDA` : s.equity.exit.method === 'dcf' ? 'pelo valor DCF' : s.equity.exit.method === 'bookNOI' ? 'pelo valor patrimonial (NOI × múltiplo)' : 'sem evento de liquidez'}.</p>
          </div>
        </div>
      </Slide>

      {/* 8. Proposta */}
      <Slide tone="cream" n={8} title="Proposta ao investidor">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-14 gap-y-8 max-w-[1100px]">
          <Term label="Aporte" value={fmtM(s.equity.investor.contribution)} text={`Capital a ser integralizado em ${fmtYM(s.equity.investor.closingDate)}${s.equity.callAllocation === 'investorFirst' ? ', consumido antes das chamadas aos sócios atuais' : ', com chamadas pró-rata entre os sócios'}.`} />
          <Term label="Participação" value={fmtPct(currentStake(s), 1)} text={s.equity.investor.stakeNegotiated != null ? 'Participação negociada diretamente.' : `Derivada do pré-money de ${fmtM(s.equity.preMoney)} (terreno, capital já investido e projetos) mais o aporte.`} />
          <Term label="Garantias" value={s.guarantees.enabled && s.guarantees.investor.committed > 0 ? fmtM(s.guarantees.investor.committed) : '—'} text={s.guarantees.enabled && s.guarantees.investor.committed > 0 ? `Garantias adicionais disponibilizadas ao banco (modelo ${s.guarantees.investor.model}: ${GUARANTEE_MODEL[s.guarantees.investor.model]}), liberadas ${s.guarantees.investor.releaseAfterOpeningMonths} meses após a inauguração${s.guarantees.investor.releaseWithAmortization ? ' e reduzidas com a amortização' : ''}.` : 'O cenário não prevê garantias do investidor.'} />
          <Term label="Remuneração das garantias" value={s.guarantees.enabled && s.guarantees.investor.committed > 0 ? `${fmtPct(s.guarantees.investor.feePct, 1)} a.a.` : '—'} text={s.guarantees.enabled && s.guarantees.investor.committed > 0 ? `Sobre o valor efetivamente vinculado${s.guarantees.investor.indexed ? ', corrigido pela inflação' : ''}; custo total ${fmtM(m.guaranteeCostTotal)} no cenário. Base de negociação, não preço de mercado.` : ''} />
          <Term label="Distribuições" value={fmtPct(s.equity.distribution.payoutPct, 0)} text={`Do caixa excedente acima de ${fmtM(s.equity.distribution.minCashReserve)}, a partir de ${s.equity.distribution.startMonthsAfterOpening} meses da inauguração${s.equity.distribution.blockedWhileDSCRBelow ? ` e com DSCR acima de ${fmtX(s.equity.distribution.blockedWhileDSCRBelow, 1)}` : ''}.${s.equity.preferredReturn.enabled ? ` Preferência simples de ${fmtPct(s.equity.preferredReturn.ratePct, 0)} a.a. ao investidor.` : ''}`} />
          <Term label="Saída" value={`ano ${s.equity.exit.year}`} text={s.equity.exit.method === 'multiple' ? `Valor de saída a ${fmtX(s.equity.exit.ebitdaMultiple, 0)} EBITDA, líquido da dívida; múltiplo hipotético.` : s.equity.exit.method === 'dcf' ? 'Valor de saída pelo DCF do fluxo remanescente.' : s.equity.exit.method === 'bookNOI' ? 'Valor de saída pelo valor patrimonial (NOI × múltiplo).' : 'Sem evento de liquidez modelado.'} />
        </div>
        <div className="mt-12 max-w-[900px]">
          <Note tone="warn">Hipóteses de negociação. Aporte, participação, remuneração das garantias e condições de saída são parâmetros do cenário, apresentados para discussão; nenhum deles representa oferta, compromisso ou condição aprovada pelo BNB ou pelos sócios atuais (Karel {fmtPct(s.equity.partners[0]?.stakePre ?? 0, 0)}, RPE {fmtPct(s.equity.partners[1]?.stakePre ?? 0, 0)}, Pascoal {fmtPct(s.equity.partners[2]?.stakePre ?? 0, 0)}).</Note>
        </div>
      </Slide>

      {/* 9. Riscos */}
      <Slide tone="sand" n={9} title="Riscos e sensibilidade">
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-12 items-start">
          <div>
            <div className="text-[12px] text-ink-3 mb-3">Seis drivers com maior efeito sobre a TIR do projeto</div>
            <Tornado rows={tornadoRows} metric="irrProject" limit={6} />
          </div>
          <div>
            <h3 className="text-[22px] text-green font-normal">Alertas do cenário</h3>
            <div className="mt-3"><AlertList alerts={r.alerts} /></div>
            <h3 className="text-[22px] text-green font-normal mt-8">Pontos de atenção</h3>
            <ul className="mt-3 space-y-2 text-[14px] leading-relaxed text-ink-2">
              <li>· Valor terminal responde por {fmtPct(r.valuation.dcf.tvShareOfEv, 0)} do valor DCF; a TIR sem terminal é {fmtPct(m.irrProjectNoTV)}.</li>
              <li>· CAPEX de referência ainda não conciliado com o enquadramento do BNB.</li>
              <li>· Condições do financiamento (taxa, carência, prazo) e garantias dependem de aprovação do banco.</li>
              <li>· Ramp-up de casamentos e ocupação apoiado em benchmark de terceiros; pipeline comercial a construir.</li>
            </ul>
          </div>
        </div>
      </Slide>

      {/* 10. Próximos passos */}
      <Slide tone="cream" n={10} title="Próximos passos">
        <ol className="max-w-[860px] space-y-5">
          <Step n={1} title="Carta Consulta ao BNB" text="Formalizar a consulta com o CAPEX conciliado e o cronograma re-datado; confirmar linha, taxa, carência, prazo e exigência de garantias." />
          <Step n={2} title="Validação do CAPEX" text="Orçamento executivo de obra e FF&E, compatível com o projeto arquitetônico e com o escopo financiável (obra × equipamentos)." />
          <Step n={3} title="Due diligence" text="Documentação do terreno, licenças ambientais e urbanísticas, regime tributário e estrutura de operação (própria ou operador)." />
          <Step n={4} title="Estrutura societária" text="Acordo entre os sócios atuais e o novo investidor: participação, governança, garantias e sua remuneração, política de distribuição e saída." />
          <Step n={5} title="Cronograma" text={`Obra ${fmtYM(p1.constructionStart)} – ${fmtYM(p1.constructionEnd)}, pré-abertura e inauguração em ${fmtYM(p1.opening)}; pipeline comercial de casamentos iniciado 12 meses antes.`} />
        </ol>
        <div className="mt-16 text-[12px] text-ink-3">Hotel Bons Ventos · plataforma de viabilidade, financiamento e estruturação societária · cenário "{s.name}" · {today}</div>
      </Slide>
    </div>
  );
}

function Slide({ children, tone, n, title, first }: { children: ReactNode; tone: 'sand' | 'cream'; n?: number; title?: string; first?: boolean }) {
  return (
    <section className={`relative min-h-[92vh] px-[8vw] py-16 flex flex-col justify-center ${tone === 'sand' ? 'bg-sand-2' : 'bg-cream'} ${first ? '' : 'print-break'}`}>
      {title && (
        <div className="flex items-baseline gap-4 mb-10">
          {n != null && <span className="num text-[14px] text-ink-3">{String(n).padStart(2, '0')}</span>}
          <h2 className="text-[40px] leading-none font-normal text-green">{title}</h2>
        </div>
      )}
      {children}
    </section>
  );
}
function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-t border-ink/15 pt-3">
      <div className="text-[11px] text-ink-3 font-semibold tracking-wide">{label}</div>
      <div className="num text-[24px] text-green leading-tight mt-1">{value}</div>
      {hint && <div className="text-[11px] text-ink-3 mt-0.5">{hint}</div>}
    </div>
  );
}
function Timeline({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="border-t-2 border-gold-2 pt-3">
      <div className="text-[11px] text-ink-3 font-semibold tracking-wide">{label}</div>
      <div className="num text-[32px] text-green leading-tight mt-1">{value}</div>
      <div className="text-[12px] text-ink-3 mt-1">{hint}</div>
    </div>
  );
}
function Term({ label, value, text }: { label: string; value: string; text: string }) {
  return (
    <div className="border-t border-line pt-3">
      <div className="flex items-baseline justify-between gap-4"><span className="text-[12px] font-semibold tracking-wide text-ink-3">{label}</span><span className="num text-[26px] text-green">{value}</span></div>
      <p className="text-[14px] leading-relaxed text-ink-2 mt-2">{text}</p>
    </div>
  );
}
function Step({ n, title, text }: { n: number; title: string; text: string }) {
  return (
    <li className="grid grid-cols-[48px_1fr] gap-4 items-start">
      <span className="num text-[28px] text-gold leading-none">{String(n).padStart(2, '0')}</span>
      <div><div className="text-[18px] text-ink font-medium">{title}</div><p className="text-[14px] text-ink-2 leading-relaxed mt-1">{text}</p></div>
    </li>
  );
}
