import { useMemo, useState } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, BarChart } from 'recharts';
import { PageHeader, Ledger, Panel, Field, SelectField, ToggleField, AlertList, DataTable, Note, ProvDot, ProvLegend, provFor, CHART_COLORS as C, chartAxis, chartTooltipStyle, tipFmt, useLocal, type Column } from '../components/ui';
import { useActiveScenario, useScenarios } from '../store/scenarios';
import { useResults, computeCached } from '../lib/useResults';
import { compute } from '../engine/compute';
import { applyDebtStructure } from '../engine/scenarios';
import { compareGuaranteeModels } from '../engine/analysis';
import { fmtM, fmtPct, fmtX, fmtYM, fmtK, fmtNum } from '../lib/format';
import type { AnnualRow, LoanTranche, Scenario } from '../engine/types';
import type { PageKey } from '../App';

const STRUCTURES: { key: 'A' | 'B' | 'C'; label: string }[] = [
  { key: 'A', label: 'Cenário A — alavancagem máxima (R$20,7M / R$2,3M)' },
  { key: 'B', label: 'Cenário B — intermediária (R$15M / R$8M)' },
  { key: 'C', label: 'Cenário C — reduzida (R$7,5M / R$15,5M)' },
];

const CONFIRMED = [
  'Investimento preliminar: R$23,0M (obra R$19,706M + equipamentos R$3,294M)',
  'Financiamento máximo de 90%: R$20,7M',
  'Recursos próprios mínimos: R$2,3M',
  'Imóvel avaliado pelo BNB em R$6,025M',
  'Garantia preexistente exigida: 80% do financiamento (R$16,56M)',
  'Complementação de garantias necessária: R$10,535M',
  'Fiança bancária proporcional às liberações',
  'Garantia evolutiva (obra) não substitui a preexistente',
  'Fase 01 deve ser viável isoladamente',
  'Carta Consulta como próximo passo formal',
];
const PENDING = [
  'Taxa de juros, indexador e bônus de adimplência',
  'Prazo de carência',
  'Prazo total do financiamento',
  'Sistema de amortização (SAC / Price)',
  'Cronograma de desembolso (tranches × pró-rata obra)',
  'Seguros, tarifas e custo de estruturação',
  'Covenants financeiros (DSCR mínimo, restrições)',
  'Aceitação de gastos já realizados como contrapartida',
];

const TERM_DEFAULTS: { key: string; label: string; placeholder: string }[] = [
  { key: 'maxValue', label: 'Valor máximo garantido', placeholder: 'Limitado ao valor efetivamente vinculado (complementação), nunca superior ao saldo devedor' },
  { key: 'term', label: 'Prazo da garantia', placeholder: 'Até a liberação pelo banco ou amortização que reduza a exigência abaixo do imóvel' },
  { key: 'liability', label: 'Responsabilidade do garantidor', placeholder: 'Subsidiária e limitada ao valor vinculado; sem solidariedade pessoal ilimitada' },
  { key: 'execution', label: 'Condições de execução', placeholder: 'Somente após inadimplemento declarado e esgotadas as garantias reais do projeto' },
  { key: 'regress', label: 'Direitos de regresso', placeholder: 'Regresso integral contra a SPE e sócios atuais, com correção e juros' },
  { key: 'substitution', label: 'Substituição', placeholder: 'Direito de substituir a garantia por outra aceita pelo banco a qualquer tempo' },
  { key: 'partialRelease', label: 'Liberação parcial', placeholder: 'Proporcional à amortização do principal e à constituição de garantia evolutiva' },
  { key: 'fullRelease', label: 'Liberação integral', placeholder: 'Quando 80% do saldo devedor ≤ valor do imóvel avaliado' },
  { key: 'acceleration', label: 'Vencimento antecipado', placeholder: 'Hipóteses restritas; cura de 60 dias antes de execução' },
  { key: 'dividends', label: 'Restrições a dividendos', placeholder: 'Distribuições bloqueadas enquanto DSCR < covenant ou fee de garantia em atraso' },
  { key: 'default', label: 'Eventos de inadimplemento', placeholder: 'Atraso > 90 dias, DSCR abaixo do mínimo por 2 anos consecutivos, perda de licenças' },
];

export default function Financing({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const m = r.metrics;
  const update = useScenarios((st) => st.update);
  const replace = useScenarios((st) => st.replace);
  const locked = s.kind === 'excel';

  const years = useMemo(() => r.annual.filter((a) => a.debtDraw > 0 || a.debtBalance > 0 || a.debtService > 0), [r]);
  const p1Ids = new Set(s.loans.filter((l) => l.phase === 1 && l.enabled).map((l) => l.id));
  const debtP1 = r.debtSchedules.filter((d) => p1Ids.has(d.id)).reduce((t, d) => t + d.rows.reduce((x, row) => x + row.draw, 0), 0);
  const pctCapexP1 = m.capexP1 > 0 ? debtP1 / m.capexP1 : null;
  const minDSCR = Math.max(0, ...s.loans.filter((l) => l.enabled).map((l) => l.minDSCR));

  const comparison = useMemo(() => (['A', 'B', 'C'] as const).map((k) => ({ key: k, s: applyDebtStructure(s, k), r: compute(applyDebtStructure(s, k)) })), [s]);
  const guaranteeModels = useMemo(() => compareGuaranteeModels(s), [s]);

  const applyStructure = (k: 'A' | 'B' | 'C') => { if (locked) return; replace(applyDebtStructure(s, k)); };

  const debtChart = years.map((a) => ({ ano: a.year, Saques: a.debtDraw / 1e6, Juros: a.debtInterest / 1e6, Amortização: a.debtAmortization / 1e6, 'Saldo devedor': a.debtBalance / 1e6 }));
  const guaranteeChart = years.map((a) => ({ ano: a.year, 'Garantia exigida': a.guaranteeRequired / 1e6, 'Imóvel (BNB)': s.guarantees.propertyValueBank / 1e6, 'Garantia do investidor': a.guaranteeCommitted / 1e6 }));
  const dscrChart = years.filter((a) => a.opYear > 0 && a.debtService > 0).map((a) => ({ ano: a.year, DSCR: a.dscr }));
  const dscrCap = Math.min(6, Math.ceil(Math.max(minDSCR, ...dscrChart.map((d) => d.DSCR)) + 0.5));
  const riskAlerts = r.alerts.filter((a) => ['dscr', 'leverage', 'guarantee', 'cash', 'equity-gap'].includes(a.code));

  const debtCols: Column<AnnualRow>[] = [
    { key: 'year', label: 'Ano', align: 'l', render: (a) => <span className="font-semibold">{a.year}</span> },
    { key: 'draw', label: 'Saques', render: (a) => fmtM(a.debtDraw) },
    { key: 'int', label: 'Juros', render: (a) => fmtM(a.debtInterest) },
    { key: 'amort', label: 'Amortização', render: (a) => fmtM(a.debtAmortization) },
    { key: 'fees', label: 'Tarifas/seguros', render: (a) => fmtK(a.debtFees) },
    { key: 'svc', label: 'Serviço', render: (a) => fmtM(a.debtService), strong: true },
    { key: 'bal', label: 'Saldo devedor', render: (a) => fmtM(a.debtBalance) },
    { key: 'dscr', label: 'DSCR', render: (a) => (a.debtService > 0 && a.opYear > 0 ? <span className={a.dscr < minDSCR ? 'text-rust' : ''}>{fmtX(a.dscr)}</span> : '—') },
    { key: 'cash', label: 'Caixa final', render: (a) => fmtM(a.cashAfterEquity) },
  ];
  const feeCols: Column<AnnualRow>[] = [
    { key: 'year', label: 'Ano', align: 'l', render: (a) => <span className="font-semibold">{a.year}</span> },
    { key: 'req', label: 'Garantia exigida', render: (a) => fmtM(a.guaranteeRequired) },
    { key: 'com', label: 'Vinculada (investidor)', render: (a) => fmtM(a.guaranteeCommitted) },
    { key: 'acc', label: 'Fee provisionado', render: (a) => fmtK(a.guaranteeFeeAccrued) },
    { key: 'paid', label: 'Fee pago', render: (a) => fmtK(a.guaranteeFeePaid) },
    { key: 'cost', label: 'Custo total', render: (a) => fmtK(a.guaranteeCosts), strong: true },
  ];

  return (
    <>
      <PageHeader title="Financiamento BNB" subtitle={`Estrutura de dívida, garantias e cobertura do serviço da dívida no cenário "${s.name}". Condições do BNB/FNE ainda não confirmadas são apresentadas como hipóteses.`} actions={<><button className="btn" onClick={() => go('equity')}>Equity e investidor</button><button className="btn" onClick={() => go('returns')}>Retornos</button></>} />
      <Ledger items={[
        { label: 'Financiamento desembolsado', value: fmtM(m.debtTotal), hint: `${fmtPct(pctCapexP1, 0)} do CAPEX Fase 01 (${fmtM(debtP1)} / ${fmtM(m.capexP1)})`, traceId: 'debtService' },
        { label: 'Juros totais', value: fmtM(m.interestTotal), hint: `serviço da dívida ${fmtM(m.debtServiceTotal)}`, traceId: 'debtService' },
        { label: 'DSCR mínimo', value: m.dscrMin == null ? '—' : fmtX(m.dscrMin), hint: m.dscrMinYear ? `em ${m.dscrMinYear} · covenant ${fmtX(minDSCR, 2)}` : 'sem dívida', tone: m.dscrMin != null && m.dscrMin < minDSCR ? 'bad' : 'good', traceId: 'dscr' },
        { label: 'Garantia preexistente exigida', value: fmtM(m.guaranteeRequiredPeak), hint: `${fmtPct(s.guarantees.requiredPctOfLoan, 0)} do saldo máximo`, traceId: 'guaranteeCosts' },
        { label: 'Imóvel avaliado', value: fmtM(s.guarantees.propertyValueBank, 3), hint: 'avaliação do BNB' },
        { label: 'Complementação necessária', value: fmtM(m.guaranteeShortfall, 3), hint: `investidor compromete ${fmtM(m.guaranteeCommittedPeak)} · custo ${fmtM(m.guaranteeCostTotal)}`, tone: m.guaranteeShortfall > s.guarantees.investor.committed + 1 ? 'bad' : 'default', traceId: 'guaranteeCosts' },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6">
        {/* ---------------- Premissas ---------------- */}
        <div className="space-y-5">
          <Panel title="Estruturas de referência" subtitle="Documento “Estrutura de Financiamento e Garantias” — dívida / equity">
            <div className="flex flex-col gap-2">
              {STRUCTURES.map((st) => <button key={st.key} className="btn justify-start text-left" disabled={locked} onClick={() => applyStructure(st.key)}>{st.label}</button>)}
            </div>
            <div className="mt-3"><Note>Valores intermediários são hipóteses para comparação, não ofertas aprovadas. Aplicar uma estrutura altera o valor do empréstimo da Fase 01, o aporte do investidor e as garantias comprometidas no cenário ativo.</Note></div>
          </Panel>

          <Panel title="Confirmado pelo BNB × hipótese" subtitle="O que está documentado e o que ainda depende da Carta Consulta">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <div className="text-[11px] font-semibold text-ink-3 tracking-wide mb-1.5">Confirmado / documentado</div>
                <ul className="space-y-1">{CONFIRMED.map((t) => <li key={t} className="flex gap-2 text-[12px] text-ink-2"><span className="mt-[5px] w-2 h-2 rounded-full shrink-0 bg-ocean-2" />{t}</li>)}</ul>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-ink-3 tracking-wide mb-1.5">Hipóteses pendentes de confirmação</div>
                <ul className="space-y-1">{PENDING.map((t) => <li key={t} className="flex gap-2 text-[12px] text-ink-2"><span className="mt-[5px] w-2 h-2 rounded-full shrink-0 bg-gold ring-2 ring-rust/60" />{t}</li>)}</ul>
              </div>
              <ProvLegend />
            </div>
          </Panel>

          {s.loans.map((l, i) => <LoanPanel key={l.id} s={s} i={i} />)}

          <Panel title="Garantias" subtitle="Exigência do banco e garantias disponibilizadas pelo investidor">
            <ToggleField s={s} path="guarantees.enabled" label="Modelar garantias" />
            <Field s={s} path="guarantees.requiredPctOfLoan" label="Garantia preexistente exigida (% do financiamento)" kind="pct" />
            <Field s={s} path="guarantees.propertyValueBank" label="Imóvel — avaliação do banco" kind="money" />
            <Field s={s} path="guarantees.evolutionaryPct" label="Obra aceita como garantia evolutiva" kind="pct" hint="0% = evolutiva não substitui a preexistente" />
            <div className="text-[11px] font-semibold text-ink-3 tracking-wide mt-4 mb-1">Garantias do investidor</div>
            <Field s={s} path="guarantees.investor.committed" label="Garantias comprometidas" kind="money" />
            <SelectField s={s} path="guarantees.investor.model" label="Modelo de remuneração" options={[{ value: 'A', label: 'A — fee anual' }, { value: 'B', label: 'B — fee diferido' }, { value: 'C', label: 'C — participação adicional' }]} />
            <Field s={s} path="guarantees.investor.feePct" label="Fee anual sobre valor vinculado" kind="pct" step={0.1} />
            <div className="flex gap-1 py-1.5 border-b border-sand-2 justify-end">
              {[0.01, 0.015, 0.02].map((f) => <button key={f} className={`btn ${Math.abs(s.guarantees.investor.feePct - f) < 1e-9 ? 'btn-primary' : ''}`} disabled={locked} onClick={() => update(s.id, 'guarantees.investor.feePct', f)}>{fmtPct(f, 1)}</button>)}
            </div>
            <Field s={s} path="guarantees.investor.startDate" label="Início (vazio = 1º desembolso)" kind="ym" />
            <ToggleField s={s} path="guarantees.investor.indexed" label="Fee corrigido pela inflação" />
            <Field s={s} path="guarantees.investor.deferredAccrualRate" label="Modelo B: taxa de acumulação" kind="pct" />
            <Field s={s} path="guarantees.investor.deferredPaymentStartMonthsAfterOpening" label="Modelo B: pagamento (meses após inauguração)" kind="int" />
            <Field s={s} path="guarantees.investor.extraStakePct" label="Modelo C: participação adicional" kind="pct" />
            <Field s={s} path="guarantees.investor.releaseAfterOpeningMonths" label="Liberação a partir de (meses após inauguração)" kind="int" />
            <ToggleField s={s} path="guarantees.investor.releaseWithAmortization" label="Libera com a amortização" />
            <Field s={s} path="guarantees.investor.setupCost" label="Custo de constituição" kind="money" />
            <Field s={s} path="guarantees.investor.maintenanceCostAnnual" label="Custo anual de manutenção" kind="money" />
            <div className="mt-3"><Note>Remuneração de 1,5% a.a. é base de negociação, não preço de mercado. Fiança bancária e seguro-garantia têm custos distintos.</Note></div>
          </Panel>
        </div>

        {/* ---------------- Resultados ---------------- */}
        <div className="xl:col-span-2 space-y-5">
          <Panel title="Comparação das estruturas A / B / C" subtitle="Recalculadas sobre o cenário ativo, mantendo as demais premissas">
            <div className="overflow-x-auto">
              <table className="data">
                <thead><tr><th>Indicador</th>{comparison.map((c) => <th key={c.key} className="r">Cenário {c.key}{c.key === currentStructure(s) ? <span className="text-green-3"> · ativo</span> : ''}</th>)}</tr></thead>
                <tbody>
                  {([
                    ['Dívida Fase 01', (c: Scenario) => fmtM(c.loans.find((l) => l.phase === 1)?.amount ?? 0), null],
                    ['Aporte do investidor', (c: Scenario) => fmtM(c.equity.investor.contribution), null],
                    ['Garantia exigida (pico)', null, (x: ReturnType<typeof compute>) => fmtM(x.metrics.guaranteeRequiredPeak)],
                    ['Complementação necessária', null, (x: ReturnType<typeof compute>) => fmtM(x.metrics.guaranteeShortfall, 3)],
                    ['Garantias do investidor', (c: Scenario) => fmtM(c.guarantees.investor.committed, 3), null],
                    ['Juros totais', null, (x: ReturnType<typeof compute>) => fmtM(x.metrics.interestTotal)],
                    ['DSCR mínimo', null, (x: ReturnType<typeof compute>) => fmtX(x.metrics.dscrMin)],
                    ['TIR do projeto', null, (x: ReturnType<typeof compute>) => fmtPct(x.metrics.irrProject)],
                    ['TIR do equity', null, (x: ReturnType<typeof compute>) => fmtPct(x.metrics.irrEquity)],
                    ['TIR do investidor', null, (x: ReturnType<typeof compute>) => fmtPct(x.parties[x.parties.length - 1].irr)],
                    ['VPL do equity', null, (x: ReturnType<typeof compute>) => fmtM(x.metrics.npvEquity)],
                    ['Custo das garantias', null, (x: ReturnType<typeof compute>) => fmtM(x.metrics.guaranteeCostTotal)],
                  ] as [string, ((c: Scenario) => string) | null, ((x: ReturnType<typeof compute>) => string) | null][]).map(([label, fs, fr]) => (
                    <tr key={label}><td className="text-ink-2">{label}</td>{comparison.map((c) => <td key={c.key} className="r">{fs ? fs(c.s) : fr ? fr(c.r) : '—'}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><Note>Cenários B e C são hipóteses de alavancagem para comparação; o BNB só documentou os limites (90% / R$20,7M). O aporte do investidor na estrutura C (R$15,5M) elimina a necessidade de garantias complementares.</Note></div>
          </Panel>

          <Panel title="Cronograma da dívida" subtitle="Saques, juros, amortização e saldo devedor por ano (R$ milhões)">
            <ResponsiveContainer width="100%" height={280}>
              <ComposedChart data={debtChart} margin={{ left: 0, right: 10, top: 10 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="ano" {...chartAxis} />
                <YAxis {...chartAxis} width={44} />
                <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(2)} M`)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Saques" fill={C.ocean3} />
                <Bar dataKey="Juros" stackId="s" fill={C.neg} />
                <Bar dataKey="Amortização" stackId="s" fill={C.cost} />
                <Line dataKey="Saldo devedor" stroke={C.debt} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-4"><DataTable rows={years} columns={debtCols} rowKey={(a) => a.year} dense /></div>
          </Panel>

          <Panel title="Cronograma mensal por empréstimo" subtitle="Saques, juros, amortização, tarifas e saldo mês a mês">
            <div className="space-y-5">{r.debtSchedules.map((d) => <ScheduleTable key={d.id} sched={d} />)}</div>
            {r.debtSchedules.length === 0 && <div className="text-[13px] text-ink-3">Nenhum empréstimo habilitado.</div>}
          </Panel>

          <Panel title="Garantias por ano" subtitle="Garantia preexistente exigida × imóvel avaliado × garantias do investidor (R$ milhões)">
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={guaranteeChart} margin={{ left: 0, right: 10, top: 10 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="ano" {...chartAxis} />
                <YAxis {...chartAxis} width={44} />
                <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(2)} M`)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Garantia exigida" fill={C.cost} />
                <Bar dataKey="Garantia do investidor" fill={C.fnb} />
                <Line dataKey="Imóvel (BNB)" stroke={C.hotel} strokeWidth={2} strokeDasharray="4 3" dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="mt-4"><DataTable rows={years.filter((a) => a.guaranteeRequired > 0 || a.guaranteeCosts > 0)} columns={feeCols} rowKey={(a) => a.year} dense /></div>
            <div className="mt-3 text-[12px] text-ink-2">Custo total das garantias <span className="num text-ink">{fmtM(m.guaranteeCostTotal)}</span> · valor presente <span className="num text-ink">{fmtM(m.guaranteeCostPV)}</span> (a {fmtPct(s.valuation.discountRateEquity, 0)} a.a.).</div>
          </Panel>

          <Panel title="Modelos de remuneração das garantias" subtitle="A — fee anual pago · B — fee diferido acumulado · C — participação adicional sem fee">
            <div className="overflow-x-auto">
              <table className="data">
                <thead><tr><th>Modelo</th><th className="r">Custo total</th><th className="r">VP do custo</th><th className="r">TIR investidor</th><th className="r">TIR sócios atuais</th><th className="r">Participação investidor</th></tr></thead>
                <tbody>
                  {guaranteeModels.map((g) => (
                    <tr key={g.model} className={g.model === s.guarantees.investor.model ? 'font-semibold text-ink' : ''}>
                      <td>{g.label}{g.model === s.guarantees.investor.model ? <span className="text-green-3 font-normal"> · ativo</span> : ''}</td>
                      <td className="r">{fmtM(g.costTotal)}</td><td className="r">{fmtM(g.costPV)}</td><td className="r">{fmtPct(g.investorIRR)}</td><td className="r">{fmtPct(g.existingIRR)}</td><td className="r">{fmtPct(g.dilution)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title="Indicadores de risco" subtitle={`DSCR por ano × covenant de ${fmtX(minDSCR, 2)}`}>
              {dscrChart.length === 0 ? <div className="text-[13px] text-ink-3">Sem serviço da dívida durante a operação.</div> : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={dscrChart} margin={{ left: 0, right: 10, top: 10 }}>
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="ano" {...chartAxis} />
                    <YAxis {...chartAxis} width={40} domain={[0, dscrCap]} allowDataOverflow tickFormatter={(v) => `${Number(v).toFixed(1)}×`} />
                    <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => fmtX(v))} />
                    <ReferenceLine y={minDSCR} stroke={C.neg} strokeDasharray="4 3" />
                    <Bar dataKey="DSCR" fill={C.equity} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              {dscrChart.some((d) => d.DSCR > dscrCap) && <div className="text-[11px] text-ink-3 mt-1">Eixo limitado a {fmtX(dscrCap, 1)}; nos últimos anos de amortização o DSCR cresce acima disso (serviço da dívida residual).</div>}
            </Panel>
            <Panel title="Alertas de dívida e garantias"><AlertList alerts={riskAlerts} /></Panel>
          </div>

          <GuaranteeTerms />
        </div>
      </div>
    </>
  );
}

function currentStructure(s: Scenario): 'A' | 'B' | 'C' | null {
  const amt = s.loans.find((l) => l.phase === 1)?.amount ?? 0;
  const c = s.equity.investor.contribution;
  if (amt === 20700000 && c === 2300000) return 'A';
  if (amt === 15000000 && c === 8000000) return 'B';
  if (amt === 7500000 && c === 15500000) return 'C';
  return null;
}

/* ---------------- Painel de premissas por empréstimo ---------------- */
function LoanPanel({ s, i }: { s: Scenario; i: number }) {
  const l = s.loans[i];
  const p = `loans.${i}`;
  return (
    <Panel title={`Empréstimo: ${l.label || `#${i + 1}`}`} subtitle={`Fase ${l.phase} · ${l.system} · ${l.indexer === 'inflation' ? 'IPCA +' : 'pré-fixado'} ${fmtPct(l.spread, 2)} a.a.`}>
      <ToggleField s={s} path={`${p}.enabled`} label="Habilitado" />
      <Field s={s} path={`${p}.label`} label="Rótulo" kind="text" />
      <PhaseSelect s={s} path={`${p}.phase`} />
      <Field s={s} path={`${p}.amount`} label="Valor financiado" kind="money" step={100000} />
      <SelectField s={s} path={`${p}.disbursement`} label="Desembolso" options={[{ value: 'proCapex', label: 'Pró-rata ao CAPEX' }, { value: 'tranches', label: 'Tranches fixas' }]} />
      {l.disbursement === 'proCapex' && <>
        <Field s={s} path={`${p}.proCapexStart`} label="Início dos desembolsos (AAAA-MM)" kind="ym" hint="vazio = início da obra" />
        <Field s={s} path={`${p}.financedPct`} label="% de cada desembolso financiado" kind="pct" />
      </>}
      {l.disbursement === 'tranches' && <TrancheEditor s={s} path={`${p}.tranches`} label="Tranches de desembolso" />}
      <SelectField s={s} path={`${p}.indexer`} label="Indexador" options={[{ value: 'inflation', label: 'IPCA + spread' }, { value: 'fixed', label: 'Pré-fixado' }]} />
      <Field s={s} path={`${p}.spread`} label="Taxa / spread anual" kind="pct" step={0.05} />
      <Field s={s} path={`${p}.bonusAdimplencia`} label="Bônus de adimplência (sobre juros)" kind="pct" />
      <Field s={s} path={`${p}.graceMonths`} label="Carência (meses)" kind="int" />
      <SelectField s={s} path={`${p}.interestDuringGrace`} label="Juros na carência" options={[{ value: 'pay', label: 'Pagos' }, { value: 'capitalize', label: 'Capitalizados' }]} />
      <Field s={s} path={`${p}.totalMonths`} label="Prazo total (meses)" kind="int" />
      <SelectField s={s} path={`${p}.system`} label="Sistema de amortização" options={[{ value: 'SAC', label: 'SAC' }, { value: 'PRICE', label: 'Price' }]} />
      <Field s={s} path={`${p}.structuringPct`} label="Tarifa de estruturação" kind="pct" step={0.1} />
      <Field s={s} path={`${p}.insurancePctAnnual`} label="Seguro anual sobre saldo" kind="pct" step={0.05} />
      <Field s={s} path={`${p}.recurringMonthly`} label="Tarifa mensal recorrente" kind="money" step={100} />
      <Field s={s} path={`${p}.minDSCR`} label="Covenant: DSCR mínimo" kind="number" step={0.05} suffix="×" />
      <TrancheEditor s={s} path={`${p}.extraAmortizations`} label="Amortizações extraordinárias" />
    </Panel>
  );
}

/** Select numérico (o SelectField genérico gravaria string). */
function PhaseSelect({ s, path }: { s: Scenario; path: string }) {
  const update = useScenarios((st) => st.update);
  const v = s.loans[Number(path.split('.')[1])].phase;
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 border-b border-sand-2">
      <span className="flex items-center gap-2 text-[13px] text-ink-2"><ProvDot entry={provFor(s, path)} path={path} />Fase</span>
      <select value={String(v)} disabled={s.kind === 'excel'} onChange={(e) => update(s.id, path, Number(e.target.value))} className="w-40"><option value="1">Fase 01</option><option value="2">Fase 02</option></select>
    </label>
  );
}

function TrancheEditor({ s, path, label }: { s: Scenario; path: string; label: string }) {
  const update = useScenarios((st) => st.update);
  const parts = path.split('.');
  const loan = s.loans[Number(parts[1])];
  const list: LoanTranche[] = (parts[2] === 'tranches' ? loan.tranches : loan.extraAmortizations) ?? [];
  const locked = s.kind === 'excel';
  const set = (next: LoanTranche[]) => update(s.id, path, next);
  const total = list.reduce((t, x) => t + x.amount, 0);
  return (
    <div className="py-2 border-b border-sand-2 last:border-0">
      <div className="flex items-center justify-between text-[13px] text-ink-2">
        <span className="flex items-center gap-2"><ProvDot entry={provFor(s, path)} path={path} />{label}</span>
        <span className="text-[11px] text-ink-3">{list.length} itens · {fmtM(total)}</span>
      </div>
      {list.length > 0 && (
        <table className="data mt-1 text-[12px]">
          <thead><tr><th>Mês</th><th className="r">Valor (R$)</th><th /></tr></thead>
          <tbody>
            {list.map((t, k) => (
              <tr key={k}>
                <td><input type="text" className="w-24 text-[12px]" defaultValue={t.date} key={`d-${k}-${t.date}`} disabled={locked} onBlur={(e) => { const next = list.map((x) => ({ ...x })); next[k].date = e.target.value; set(next); }} /></td>
                <td className="r"><input type="number" className="w-32 text-[12px]" defaultValue={t.amount} key={`a-${k}-${t.amount}`} disabled={locked} step={100000} onBlur={(e) => { const n = parseFloat(e.target.value); if (Number.isNaN(n)) return; const next = list.map((x) => ({ ...x })); next[k].amount = n; set(next); }} /></td>
                <td className="r"><button className="btn btn-ghost text-[11px]" disabled={locked} onClick={() => set(list.filter((_, j) => j !== k))}>remover</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <button className="btn mt-2 text-[12px]" disabled={locked} onClick={() => set([...list, { date: list.length ? list[list.length - 1].date : s.hotel.phase1.constructionStart, amount: 0 }])}>+ adicionar linha</button>
    </div>
  );
}

/* ---------------- Cronograma mensal ---------------- */
function ScheduleTable({ sched }: { sched: ReturnType<typeof computeCached>['debtSchedules'][number] }) {
  const [all, setAll] = useState(false);
  const rows = sched.rows.filter((x) => x.draw !== 0 || x.balance !== 0 || x.interest !== 0 || x.amortization !== 0);
  const shown = all ? rows : rows.slice(0, 36);
  const tot = rows.reduce((t, x) => ({ draw: t.draw + x.draw, interest: t.interest + x.interest, amortization: t.amortization + x.amortization, fees: t.fees + x.fees }), { draw: 0, interest: 0, amortization: 0, fees: 0 });
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[13px] font-semibold text-ink">{sched.label}</div>
        <div className="text-[11px] text-ink-3">{rows.length} meses · saques {fmtM(tot.draw)} · juros {fmtM(tot.interest)} · amortização {fmtM(tot.amortization)} · tarifas {fmtK(tot.fees)}</div>
      </div>
      <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
        <table className="data text-[12px]">
          <thead><tr><th>Mês</th><th className="r">Saque</th><th className="r">Juros</th><th className="r">Amortização</th><th className="r">Tarifas</th><th className="r">Saldo</th></tr></thead>
          <tbody>
            {shown.map((x) => (
              <tr key={x.month}><td>{fmtYM(x.month)}</td><td className="r">{x.draw ? fmtK(x.draw) : '—'}</td><td className="r">{x.interest ? fmtK(x.interest) : '—'}</td><td className="r">{x.amortization ? fmtK(x.amortization) : '—'}</td><td className="r">{x.fees ? fmtNum(x.fees) : '—'}</td><td className="r font-semibold">{fmtK(x.balance)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 36 && <button className="btn mt-2 text-[12px]" onClick={() => setAll(!all)}>{all ? 'mostrar primeiros 36 meses' : `mostrar tudo (${rows.length} meses)`}</button>}
    </div>
  );
}

/* ---------------- Proteções contratuais ---------------- */
function GuaranteeTerms() {
  const [terms, setTerms] = useLocal<Record<string, string>>('bv-guarantee-terms', {});
  return (
    <Panel title="Proteções contratuais da garantia" subtitle="Parâmetros a negociar no instrumento de garantia com o investidor e o banco" actions={<button className="btn btn-ghost text-[12px]" onClick={() => setTerms({})}>Limpar</button>}>
      <div className="space-y-1">
        {TERM_DEFAULTS.map((t) => (
          <label key={t.key} className="grid grid-cols-[220px_1fr] items-center gap-3 py-1.5 border-b border-sand-2 last:border-0">
            <span className="text-[13px] text-ink-2">{t.label}</span>
            <input type="text" className="w-full text-[12px]" placeholder={t.placeholder} value={terms[t.key] ?? ''} onChange={(e) => setTerms({ ...terms, [t.key]: e.target.value })} />
          </label>
        ))}
      </div>
      <div className="mt-3"><Note tone="warn">Parâmetros de negociação sujeitos a validação jurídica e aprovação do banco. Os textos sugeridos são pontos de partida, não cláusulas.</Note></div>
    </Panel>
  );
}
