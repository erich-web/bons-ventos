import { useMemo, useState } from 'react';
import { PageHeader, Panel, Note, Ledger, ProvDot, ProvLegend, DataTable, type Column } from '../components/ui';
import { useActiveScenario, useScenarios } from '../store/scenarios';
import { useResults, computeCached } from '../lib/useResults';
import { compute } from '../engine/compute';
import { withOverrides, getPath } from '../engine/analysis';
import { TRACE, traceInputs } from '../engine/trace';
import { fmtM, fmtPct, fmtYM, fmtK, fmtNum } from '../lib/format';
import excel from '../data/excel-r05.json';
import type { Scenario, Results, AnnualRow, ProvenanceEntry } from '../engine/types';
import type { PageKey } from '../App';

/** Notas de conciliação — documentação do diagnóstico, não insumo financeiro. */
const RECONCILIATION_NOTES = [
  'Diferença total de R$ 24 mil em R$ 829 milhões de resultado acumulado (0,003%), explicada por honorário contábil pré-operacional da Fase 02 (R$ 15,6 mil) e arredondamentos.',
  'TIR consolidada 26,41% (réplica) vs 26,41% (Excel); Fase 01 isolada 22,05% vs 22,05%.',
  'Payback consolidado jun/2033 no Excel vs jul/2033 na réplica — diferença de convenção de contagem (mês em que o acumulado cruza zero).',
  'A réplica reproduz a lógica do Excel inclusive seus erros (E3, E7) para permitir a conciliação; o efeito de corrigi-los está na seção "Efeito das correções".',
];

interface Finding {
  code: string; kind: 'erro' | 'premissa'; title: string; description: string; impact: string; treatment: string;
  fix?: { path: string; value: unknown; label: string };
}
const FINDINGS: Finding[] = [
  { code: 'E1', kind: 'erro', title: 'Amortização aponta para coluna vazia', description: 'FLUXO EV!EB usa SUM(INDIRECT("$DY$13:DY"…)) sobre a coluna DY, que está vazia; as tranches estão em DZ. A dívida nunca seria amortizada e os juros se acumulariam até 2057.', impact: 'Crítico assim que qualquer tranche for preenchida; hoje invisível porque as tranches são zero.', treatment: 'O motor calcula a dívida por contrato (SAC/Price, carência, juros capitalizados ou pagos) a partir de loans[]; não há dependência de colunas.' },
  { code: 'E2', kind: 'erro', title: 'Referências #REF! em "Net Income Distribuível"', description: 'FLUXO EV FASE 02!FX e CONSOLIDADO!FX: 802 células com #REF!.', impact: 'Coluna inutilizável; não alimenta nenhum indicador.', treatment: 'Distribuições calculadas pelo motor (equity.distribution) com reserva mínima, carência e trava de DSCR.' },
  { code: 'E3', kind: 'erro', title: 'Correção inflacionária com expoente invertido', description: 'Fórmula ((1+i)^(1−ano) − 1) aplica 1 − 1,05^−(ano−1) em vez de 1,05^(ano−1) − 1. No ano 3 dá 9,3% vs 10,25%; no ano 20, 60% vs 153%.', impact: 'Custos operacionais subestimados em R$ 24,0 M (Fase 01) e R$ 18,1 M (Fase 02) ao longo do fluxo; NOI de 2050 superestimado em ~25%, inflando o valor terminal.', treatment: "opex.inflationMode = 'compound' (correção composta); 'excel' reproduz o erro na réplica.", fix: { path: 'opex.inflationMode', value: 'compound', label: 'Usar correção composta' } },
  { code: 'E4', kind: 'erro', title: 'Checagem de CAPEX quebrada', description: 'DRE FASE 01!A111 compara com a linha 32 do fluxo em vez da linha 11; o check mostra −R$ 23,0 M em vez de 0.', impact: 'Só uma verificação, mas esconde erros futuros.', treatment: 'O motor soma as séries de CAPEX por grupo e expõe capexP1/capexP2 nos indicadores; a conciliação está nesta página.' },
  { code: 'E5', kind: 'erro', title: 'Tarifa da Fase 02 pelo calendário da Fase 01', description: 'FLUXO EV FASE 02!M usa o contador de ano da Fase 01 para o preço, mas o da Fase 02 para a ocupação: a Fase 02 abre com tarifa de "ano 3".', impact: 'Provavelmente intencional (tarifário único), mas implícito.', treatment: "hotel.phase2.rateCalendar: 'phase1' (como no Excel) ou 'own' (ramp-up próprio).", fix: { path: 'hotel.phase2.rateCalendar', value: 'own', label: 'Ramp-up tarifário próprio para a Fase 02' } },
  { code: 'E6', kind: 'erro', title: 'Horizonte dependente da Fase 02', description: 'Fim do fluxo = 20 anos após a inauguração da Fase 02; a Fase 01 acaba com 22,8 anos e o horizonte depende da Fase 02 existir.', impact: 'Horizonte de análise não é parâmetro independente.', treatment: 'calendar.horizonYears (anos de operação da Fase 01) com calendar.flowEnd opcional; o valor terminal fecha o horizonte.', fix: { path: 'calendar.flowEnd', value: null, label: 'Horizonte por calendar.horizonYears' } },
  { code: 'E7', kind: 'erro', title: 'Diária normal deflacionada nos anos 1–5', description: 'O fator de crescimento de longo prazo (1+g)^(ano−6) é aplicado em todos os anos, inclusive 1–5, em que o expoente é negativo: a diária do ano 1 vale 78% da premissa digitada.', impact: 'Receita de hospedagem dos primeiros anos subestimada; a TIR do Excel está abaixo do que suas próprias premissas implicam.', treatment: "hotel.rateLongTermMode = 'correct' aplica o crescimento só após o ano 6; 'excel' reproduz o erro.", fix: { path: 'hotel.rateLongTermMode', value: 'correct', label: 'Crescimento só após o ano 6' } },
  { code: 'P1', kind: 'premissa', title: 'Impostos sobre receita hoteleira = 0%', description: 'ISS/PIS/COFINS sobre hospedagem zerados; só A&B paga 14,65%.', impact: 'Lacuna de ~6–13% da receita hoteleira.', treatment: "tax.regime 'presumido' ou 'real' aplica ISS + PIS/COFINS sobre hospedagem; 'excelNOI' reproduz o Excel.", fix: { path: 'tax.regime', value: 'presumido', label: 'Regime Lucro Presumido' } },
  { code: 'P2', kind: 'premissa', title: 'Imposto sobre lucro = 22,5% × NOI mensal', description: 'Sem depreciação, sem regime (Presumido × Real), sem prejuízo fiscal, sem adicional de IRPJ nem dedutibilidade dos juros.', impact: 'Carga tributária irrealista; não captura o benefício fiscal da dívida.', treatment: 'tax.regime com IRPJ + adicional + CSLL, base presumida ou lucro real com compensação de prejuízo (30%).', fix: { path: 'tax.regime', value: 'presumido', label: 'Regime Lucro Presumido' } },
  { code: 'P3', kind: 'premissa', title: 'Sem depreciação', description: 'Nem contábil nem fiscal.', impact: 'Impede DRE, EBIT, lucro líquido e imposto no regime real.', treatment: 'capex.depreciation (obra 25 anos, FF&E 10 anos) a partir da inauguração de cada fase; usada no lucro real.' },
  { code: 'P4', kind: 'premissa', title: 'Sem capital de giro nem reserva de FF&E', description: 'Nenhuma linha no modelo original.', impact: 'Fluxo de caixa otimista nos primeiros anos e sem reposição de ativos.', treatment: 'opex.ffeReserve (% da receita a partir de um ano) e opex.workingCapital (dias de recebíveis/pagáveis).', fix: { path: 'opex.ffeReserve', value: { pctRevenue: 0.03, startYear: 3 }, label: 'Reserva FF&E 3% a partir do ano 3' } },
  { code: 'P6', kind: 'premissa', title: 'A&B com margem ~0 e dupla contagem de CMO', description: 'Despesas diretas de A&B = 87,5% da receita antes da folha de cozinha/bar; o CMO fixo de R$ 180 k/mês parece dobrar com os cargos de cozinha e bar na folha.', impact: 'A&B gera ~R$ 2 M em 23 anos; o resultado gastronômico fica irreconhecível frente ao padrão RPE.', treatment: 'restaurant.cmoFixedMonthly = 0 com mão de obra por cargo (payroll.positions, centro de custo fnb) e cmoVarPct para extras.', fix: { path: 'restaurant.cmoFixedMonthly', value: 0, label: 'Remover CMO fixo (folha por cargo)' } },
  { code: 'P7', kind: 'premissa', title: 'Crescimento de preços assimétrico', description: 'Diária normal cresce 5% a.a. para sempre; diária especial, ticket de restaurante, eventos e A&B congelam no ano 6; custos crescem com o bug E3.', impact: 'Mistura fluxo nominal e real por linha: margem de A&B deteriora artificialmente e margem hoteleira infla.', treatment: 'Crescimentos de longo prazo explícitos: rateSpecialLongTermGrowth, ticketLongTermGrowth, guestsTicketLongTermGrowth, legacyEvents.longTermGrowth.', fix: { path: 'restaurant.ticketLongTermGrowth', value: 0.045, label: 'Ticket do restaurante corrigido após o ano 6' } },
  { code: 'P11', kind: 'premissa', title: 'Datas desatualizadas', description: 'Data-base mar/2026; início de obra ago/2026 (já passado); inauguração mar/2028, com o BNB ainda em análise.', impact: 'Todo o cronograma de desembolsos, carência e inauguração precisa ser re-datado.', treatment: 'hotel.phase1.constructionStart, constructionMonths e openingLagMonths editáveis por cenário; CAPEX e dívida seguem as datas.' },
  { code: 'P12', kind: 'premissa', title: 'CAPEX não concilia com o BNB', description: 'Excel Fase 01: R$ 23,67 M (obra + FF&E + projetos + terreno); BNB: construção R$ 19,706 M + equipamentos R$ 3,294 M = R$ 23,0 M, financiável a 90%.', impact: 'Não está claro se o valor do BNB cobre 18 ou 35 UH nem quais itens inclui.', treatment: 'capex.phaseN.scale e contingencyPct permitem calibrar; o financiamento é pró-rata ao CAPEX (loans[].financedPct). Pendente de resposta.' },
  { code: 'P13', kind: 'premissa', title: 'Valor terminal = 12 × NOI nominal de 2050', description: 'Cap rate implícito de 8,33% sobre NOI inflado por 22 anos, sem desconto por idade do ativo nem capex de renovação.', impact: '56% do resultado da Fase 01 vem dessa célula.', treatment: "valuation.terminal.method: 'perpetuity' (g editável), 'multiple' (EBITDA) ou 'noiMultiple' (Excel); o peso do terminal é exibido.", fix: { path: 'valuation.terminal.method', value: 'perpetuity', label: 'Terminal por perpetuidade' } },
  { code: 'P15', kind: 'premissa', title: 'Índices projetados pela média do mesmo mês', description: 'A aba IDX projeta IPCA pela média histórica do mesmo mês calendário, gerando inclusive meses negativos.', impact: 'Indexação da dívida e correções irregulares.', treatment: 'calendar.inflation: inflação anual única de referência (indexador da dívida e correções).' },
];

type Fix = Finding['fix'];
function isApplied(s: Scenario, fix: Fix): boolean {
  if (!fix) return false;
  return JSON.stringify(getPath(s, fix.path)) === JSON.stringify(fix.value);
}

export default function Audit({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const scenarios = useScenarios((st) => st.scenarios);
  const update = useScenarios((st) => st.update);
  const excelS = scenarios.find((x) => x.kind === 'excel') ?? scenarios[0];
  const rx = useMemo(() => computeCached(excelS), [excelS]);
  const rxP1 = useMemo(() => compute(withOverrides(excelS, [{ path: 'hotel.phase2.enabled', value: false }])), [excelS]);
  const locked = s.kind === 'excel';
  const [traceId, setTraceId] = useState('irrProject');

  const tvOf = (res: Results) => res.annual.reduce((a, row) => a + row.terminalValue, 0);
  const XC = excel.resultsConsolidated, XP = excel.results.phase1;
  const recRows = [
    { k: 'TIR do projeto (consolidado)', rep: fmtPct(rx.metrics.irrProject, 2), xl: fmtPct(XC.irrAnnual, 2), d: delta(rx.metrics.irrProject, XC.irrAnnual, 'pp') },
    { k: 'VPL @ taxa do Excel (consolidado)', rep: fmtM(rx.metrics.npvProject, 2), xl: fmtM(XC.npv, 2), d: delta(rx.metrics.npvProject, XC.npv, 'pct') },
    { k: 'Exposição máxima (consolidado)', rep: `${fmtM(rx.metrics.maxExposure, 2)} · ${fmtYM(rx.metrics.maxExposureDate)}`, xl: fmtM(XC.maxExposure, 2), d: delta(rx.metrics.maxExposure, XC.maxExposure, 'pct') },
    { k: 'Valor terminal dez/2050 (consolidado)', rep: fmtM(tvOf(rx), 1), xl: fmtM(XC.terminalValue, 1), d: delta(tvOf(rx), XC.terminalValue, 'pct') },
    { k: 'Payback simples (consolidado)', rep: fmtYM(rx.metrics.paybackSimple), xl: 'jun/2033 (ver nota)', d: '' },
    { k: 'TIR do projeto (Fase 01 isolada)', rep: fmtPct(rxP1.metrics.irrProject, 2), xl: fmtPct(XP.irrAnnual, 2), d: delta(rxP1.metrics.irrProject, XP.irrAnnual, 'pp') },
    { k: 'VPL (Fase 01 isolada)', rep: fmtM(rxP1.metrics.npvProject, 2), xl: fmtM(XP.npv, 2), d: delta(rxP1.metrics.npvProject, XP.npv, 'pct') },
    { k: 'Exposição máxima (Fase 01)', rep: `${fmtM(rxP1.metrics.maxExposure, 2)} · ${fmtYM(rxP1.metrics.maxExposureDate)}`, xl: `${fmtM(XP.maxExposure, 2)} · ${fmtYM(XP.maxExposureDate)}`, d: delta(rxP1.metrics.maxExposure, XP.maxExposure, 'pct') },
    { k: 'Payback simples (Fase 01)', rep: fmtYM(rxP1.metrics.paybackSimple), xl: fmtYM(XP.payback), d: '' },
    { k: 'CAPEX total (Fase 01)', rep: fmtM(rxP1.metrics.capexTotal, 2), xl: fmtM(-XP.capex, 2), d: delta(rxP1.metrics.capexTotal, -XP.capex, 'pct') },
    { k: 'Valor terminal (Fase 01)', rep: fmtM(tvOf(rxP1), 1), xl: fmtM(XP.terminalValue, 1), d: delta(tvOf(rxP1), XP.terminalValue, 'pct') },
  ];

  const SAMPLE_YEARS = [2028, 2030, 2033, 2040, 2050];
  const lines: { label: string; get: (a: AnnualRow) => number; strong?: boolean }[] = [
    { label: 'Receita de hospedagem', get: (a) => a.revHotel }, { label: 'Receita de restaurante', get: (a) => a.revRestaurant }, { label: 'Eventos', get: (a) => a.revLegacyEvents }, { label: 'A&B hóspedes', get: (a) => a.revFnbGuests },
    { label: 'Folha', get: (a) => -a.payroll }, { label: 'Despesas de A&B', get: (a) => -a.costFnb }, { label: 'Operacionais diretos', get: (a) => -a.opexDirect }, { label: 'Administrativas', get: (a) => -a.opexAdmin }, { label: 'Marketing', get: (a) => -a.opexMarketing }, { label: 'Seguros e IPTU', get: (a) => -a.opexInsurance },
    { label: 'NOI', get: (a) => a.noi, strong: true }, { label: 'Impostos sobre o lucro', get: (a) => -a.incomeTaxUnlevered }, { label: 'CAPEX', get: (a) => -a.capex }, { label: 'Resultado (antes do terminal)', get: (a) => a.fcfProjectNoTV, strong: true },
  ];
  const sampleRows = rx.annual.filter((a) => SAMPLE_YEARS.includes(a.year));
  const lineCols: Column<(typeof lines)[number]>[] = [
    { key: 'l', label: 'Linha (réplica, R$ mil)', align: 'l', render: (ln) => <span className={ln.strong ? 'font-semibold text-ink' : 'text-ink-2'}>{ln.label}</span> },
    ...sampleRows.map((a) => ({ key: String(a.year), label: String(a.year), render: (ln: (typeof lines)[number]) => <span className={ln.strong ? 'font-semibold' : ''}>{fmtNum(ln.get(a) / 1e3)}</span> })),
  ];

  // Efeito das correções
  const effects = useMemo(() => {
    const mk = (label: string, ov: { path: string; value: unknown }[]) => { const res = ov.length ? compute(withOverrides(excelS, ov)) : rx; return { label, res }; };
    return [
      mk('Réplica do Excel (com erros)', []),
      mk('E3 corrigido (custos compostos)', [{ path: 'opex.inflationMode', value: 'compound' }]),
      mk('E7 corrigido (tarifa anos 1–5)', [{ path: 'hotel.rateLongTermMode', value: 'correct' }]),
      mk('E3 + E7 corrigidos', [{ path: 'opex.inflationMode', value: 'compound' }, { path: 'hotel.rateLongTermMode', value: 'correct' }]),
    ];
  }, [excelS, rx]);

  const { nodes, inputs } = traceInputs(traceId);
  const provGroups = useMemo(() => {
    const g: Record<string, [string, ProvenanceEntry][]> = {};
    for (const [k, e] of Object.entries(s.provenance)) (g[e.source] ??= []).push([k, e]);
    for (const k of Object.keys(g)) g[k].sort((a, b) => a[0].localeCompare(b[0]));
    return g;
  }, [s]);
  const pending = Object.entries(s.provenance).filter(([, e]) => e.status === 'pending');
  const SOURCE_LABEL: Record<string, string> = { excel: 'Excel original', doc: 'Documento de referência', hypothesis: 'Hipótese nova', calculated: 'Calculado' };

  return (
    <>
      <PageHeader title="Auditoria & Conciliação" subtitle="Conciliação do motor com o Excel R05, inventário dos erros e inconsistências encontrados, efeito das correções, rastreabilidade dos indicadores e registro de premissas do cenário ativo." actions={<><button className="btn" onClick={() => go('lab')}>Scenario Lab</button></>} />
      <Ledger items={[
        { label: 'TIR réplica (consolidado)', value: fmtPct(rx.metrics.irrProject, 2), hint: `Excel ${fmtPct(XC.irrAnnual, 2)}` },
        { label: 'TIR réplica (Fase 01)', value: fmtPct(rxP1.metrics.irrProject, 2), hint: `Excel ${fmtPct(XP.irrAnnual, 2)}` },
        { label: 'VPL réplica (consolidado)', value: fmtM(rx.metrics.npvProject), hint: `Excel ${fmtM(XC.npv)} @ ${fmtPct(excel.discountRate, 0)}` },
        { label: 'Erros de fórmula', value: String(FINDINGS.filter((f) => f.kind === 'erro').length), hint: 'verificados no Excel' },
        { label: 'Premissas inconsistentes', value: String(FINDINGS.filter((f) => f.kind === 'premissa').length), hint: 'listadas nesta página' },
        { label: 'Pendentes de validação', value: String(pending.length), hint: `no cenário "${s.name}"`, tone: pending.length ? 'bad' : 'good' },
      ]} />

      {/* Conciliação */}
      <Panel title="Conciliação com o Excel R05" subtitle={`Réplica "${excelS.name}" calculada pelo motor vs valores em cache do arquivo ${excel.meta.file}`} className="mt-6">
        <div className="grid grid-cols-1 xl:grid-cols-[1.5fr_1fr] gap-8">
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>Indicador</th><th className="r">Réplica (motor)</th><th className="r">Excel (cache)</th><th className="r">Diferença</th></tr></thead>
              <tbody>{recRows.map((row) => <tr key={row.k}><td className="text-ink-2">{row.k}</td><td className="r tnum whitespace-nowrap pl-3">{row.rep}</td><td className="r tnum text-ink-2 whitespace-nowrap pl-3">{row.xl}</td><td className="r tnum text-ink-3 whitespace-nowrap pl-3">{row.d}</td></tr>)}</tbody>
            </table>
          </div>
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-ink-3 mb-2">Resultado da conciliação linha a linha</div>
            <ul className="space-y-2 text-[13px] leading-relaxed text-ink-2">{RECONCILIATION_NOTES.map((n, i) => <li key={i} className="flex gap-2"><span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-green-3 shrink-0" />{n}</li>)}</ul>
            <div className="mt-4"><Note>O Excel não traz payback consolidado nem valores anuais por linha em cache acessível; a conciliação mensal completa foi feita contra o fluxo exportado (fixture de testes) e está resumida acima.</Note></div>
          </div>
        </div>
        <div className="mt-6">
          <div className="text-[11px] font-semibold tracking-wide text-ink-3 mb-2">Linhas anuais da réplica consolidada em anos selecionados (R$ mil, sinais do fluxo)</div>
          <DataTable rows={lines} columns={lineCols} rowKey={(ln) => ln.label} dense />
        </div>
      </Panel>

      {/* Erros */}
      <Panel title="Erros e inconsistências encontrados no Excel" subtitle={locked ? 'O cenário ativo é a réplica do Excel (somente leitura): ative um cenário revisado para aplicar correções.' : `As correções são aplicadas ao cenário ativo "${s.name}" e registradas como premissa revisada.`} className="mt-5">
        <div className="space-y-4">
          {FINDINGS.map((f) => {
            const applied = isApplied(s, f.fix);
            return (
              <div key={f.code} className="grid grid-cols-[64px_1fr_240px] gap-4 border-b border-sand-2 pb-4 last:border-0 last:pb-0">
                <div><span className={`chip ${f.kind === 'erro' ? 'bg-rust/10 text-rust' : 'bg-gold-2/60 text-ink-2'}`}>{f.code}</span></div>
                <div>
                  <div className="text-[14px] font-semibold text-ink">{f.title}</div>
                  <p className="text-[13px] text-ink-2 leading-relaxed mt-1">{f.description}</p>
                  <p className="text-[12px] text-ink-3 leading-relaxed mt-1"><span className="font-semibold">Impacto:</span> {f.impact}</p>
                  <p className="text-[12px] text-ink-3 leading-relaxed mt-1"><span className="font-semibold">Tratamento na plataforma:</span> <code className="text-[11px] bg-sand-2 px-1 rounded-sm">{f.treatment}</code></p>
                </div>
                <div className="no-print">
                  {f.fix ? (
                    applied ? <span className="chip bg-green/10 text-green">aplicado no cenário ativo</span>
                      : <button className="btn text-[12px]" disabled={locked} title={locked ? 'Réplica do Excel é somente leitura' : `${f.fix.path} → ${JSON.stringify(f.fix.value)}`} onClick={() => update(s.id, f.fix!.path, f.fix!.value, { source: 'excel', note: `Correção ${f.code} aplicada pela página de auditoria: ${f.fix!.label}.` })}>Aplicar correção: {f.fix.label}</button>
                  ) : <span className="text-[11px] text-ink-3">Tratado estruturalmente pelo motor; sem toggle.</span>}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Efeito das correções */}
      <Panel title="Efeito das correções" subtitle="Réplica do Excel recalculada com cada correção de fórmula, mantendo todas as demais premissas originais" className="mt-5">
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Variante</th><th className="r">TIR do projeto</th><th className="r">VPL</th><th className="r">NOI estabilizado</th><th className="r">Valor terminal</th><th className="r">Δ TIR vs réplica</th></tr></thead>
            <tbody>{effects.map((e, i) => (
              <tr key={e.label}><td className={i === 0 ? 'text-ink-2' : 'font-medium text-ink'}>{e.label}</td><td className="r tnum">{fmtPct(e.res.metrics.irrProject, 2)}</td><td className="r tnum">{fmtM(e.res.metrics.npvProject)}</td><td className="r tnum">{fmtM(e.res.metrics.noiStabilized)}</td><td className="r tnum">{fmtM(tvOf(e.res), 0)}</td><td className={`r tnum ${i === 0 ? 'text-ink-3' : (e.res.metrics.irrProject ?? 0) >= (rx.metrics.irrProject ?? 0) ? 'text-green-3' : 'text-rust'}`}>{i === 0 ? '—' : delta(e.res.metrics.irrProject, rx.metrics.irrProject, 'pp')}</td></tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mt-3"><Note>E3 encarece os custos (reduz TIR e valor terminal); E7 eleva a receita dos anos 1–5 (aumenta TIR). Os efeitos se compensam parcialmente, mas por motivos distintos — ambos são erros de fórmula, não escolhas de premissa.</Note></div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-5">
        {/* Rastreabilidade */}
        <Panel title="Rastreabilidade" subtitle="Cadeia de cálculo e premissas que influenciam cada indicador" actions={<select value={traceId} onChange={(e) => setTraceId(e.target.value)} className="text-[12px] no-print">{Object.values(TRACE).map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select>}>
          <ol className="space-y-3">
            {nodes.map((n, i) => (
              <li key={n.id} className="border-l-2 border-sand pl-3">
                <div className="text-[13px] font-semibold text-ink">{i === 0 ? '' : '↳ '}{n.label}</div>
                <div className="text-[12px] text-ink-2 mt-0.5">{n.formula}</div>
                {n.inputs.length > 0 && <div className="text-[11px] text-ink-3 mt-1">Premissas: {n.inputs.join(', ')}</div>}
              </li>
            ))}
          </ol>
          <div className="mt-4 rule pt-3">
            <div className="text-[11px] font-semibold tracking-wide text-ink-3">Todas as premissas que influenciam este indicador ({inputs.length})</div>
            <div className="mt-2 flex flex-wrap gap-1">{inputs.map((p) => <span key={p} className="inline-flex items-center gap-1 text-[11px] bg-sand-2 px-1.5 py-0.5 rounded-sm"><ProvDot entry={provOf(s, p)} path={p} /><code>{p}</code></span>)}</div>
          </div>
        </Panel>

        {/* Registro de premissas */}
        <Panel title={`Registro de premissas — ${s.name}`} subtitle="Agrupado por origem; a lista de pendências é o checklist de validação" actions={<span className="text-[11px] text-ink-3">{Object.keys(s.provenance).length} entradas</span>}>
          <ProvLegend />
          <div className="mt-4 space-y-4">
            {(['excel', 'doc', 'hypothesis', 'calculated'] as const).filter((k) => provGroups[k]?.length).map((k) => (
              <div key={k}>
                <div className="text-[12px] font-semibold text-ink mb-1.5">{SOURCE_LABEL[k]} <span className="text-ink-3 font-normal">· {provGroups[k].length}</span></div>
                <div className="flex flex-wrap gap-1">{provGroups[k].map(([p, e]) => <span key={p} className="inline-flex items-center gap-1 text-[11px] bg-sand-2 px-1.5 py-0.5 rounded-sm" title={`${e.status}${e.ref ? ` · ${e.ref}` : ''}${e.note ? `\n${e.note}` : ''}`}><ProvDot entry={e} path={p} /><code>{p}</code></span>)}</div>
              </div>
            ))}
          </div>
          <div className="mt-5 rule pt-4">
            <div className="text-[12px] font-semibold text-ink mb-2">Checklist de validação ({pending.length} pendente{pending.length === 1 ? '' : 's'})</div>
            {pending.length ? (
              <ul className="space-y-2">{pending.map(([p, e]) => (
                <li key={p} className="flex gap-2 text-[12px] leading-relaxed"><span className="mt-[6px] w-2 h-2 rounded-full bg-gold ring-2 ring-rust/60 shrink-0" /><div><code className="text-[11px]">{p}</code>{e.ref && <span className="text-ink-3"> · {e.ref}</span>}<div className="text-ink-2">{e.note}</div></div></li>
              ))}</ul>
            ) : <div className="text-[13px] text-green-3">Nenhuma premissa pendente de validação neste cenário.</div>}
          </div>
        </Panel>
      </div>

      <div className="mt-5"><Note>Indicadores do cenário ativo para referência: TIR do projeto {fmtPct(r.metrics.irrProject)} · VPL {fmtM(r.metrics.npvProject)} · custo das garantias {fmtK(r.metrics.guaranteeCostTotal)} · {r.alerts.length} alerta{r.alerts.length === 1 ? '' : 's'}.</Note></div>
    </>
  );
}

function delta(a: number | null | undefined, b: number | null | undefined, mode: 'pp' | 'pct'): string {
  if (a == null || b == null || !isFinite(a) || !isFinite(b)) return '—';
  if (mode === 'pp') return `${((a - b) * 10000).toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} bps`;
  if (b === 0) return '—';
  return fmtPct((a - b) / Math.abs(b), 3);
}
function provOf(s: Scenario, path: string): ProvenanceEntry | undefined {
  const parts = path.split('.');
  for (let i = parts.length; i > 0; i--) { const e = s.provenance[parts.slice(0, i).join('.')]; if (e) return e; }
  return undefined;
}
