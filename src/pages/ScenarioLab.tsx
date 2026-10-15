import { useMemo, useState, useRef, type ReactNode } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PageHeader, Panel, Note, CHART_COLORS as C, chartAxis, chartTooltipStyle, tipFmt, ProvDot } from '../components/ui';
import { Tornado, Heatmap, higherIsBetter } from '../components/sensitivity';
import { useActiveScenario, useScenarios } from '../store/scenarios';
import { useResults, useCompareResults, computeCached } from '../lib/useResults';
import { DRIVERS, METRIC_LABELS, tornado, heatmap, breakEvenOccupancy, breakEvenWeddings, type MetricKey } from '../engine/analysis';
import { fmtM, fmtPct, fmtX, fmtNum, fmtYM } from '../lib/format';
import { exportScenarioJSON, readScenarioFile, exportWorkbook, exportChartsPNG, captureCharts, exportPdfReport } from '../lib/export';
import type { Scenario, Results, AssumptionStatus } from '../engine/types';
import type { PageKey } from '../App';

const KIND_LABEL: Record<Scenario['kind'], string> = { excel: 'réplica Excel', base: 'base', conservative: 'conservador', optimistic: 'otimista', custom: 'personalizado' };
const KIND_CLASS: Record<Scenario['kind'], string> = { excel: 'bg-sand text-ink-2', base: 'bg-green/10 text-green', conservative: 'bg-rust/10 text-rust', optimistic: 'bg-ocean/10 text-ocean', custom: 'bg-gold-2/60 text-ink-2' };
const SERIES_COLORS = [C.hotel, C.weddings, C.fnb, C.neg];
const METRIC_KEYS = Object.keys(METRIC_LABELS) as MetricKey[];

interface CompareRow { key: string; label: string; get: (r: Results, s: Scenario) => number | null; fmt: (v: number | null) => string; better: 'high' | 'low' | 'none' }
const COMPARE_ROWS: CompareRow[] = [
  { key: 'capex', label: 'CAPEX total', get: (r) => r.metrics.capexTotal, fmt: fmtM, better: 'low' },
  { key: 'debt', label: 'Financiamento', get: (r) => r.metrics.debtTotal, fmt: fmtM, better: 'none' },
  { key: 'equity', label: 'Capital próprio', get: (r) => r.metrics.equityTotal, fmt: fmtM, better: 'low' },
  { key: 'rev', label: 'Receita estabilizada', get: (r) => r.metrics.revenueStabilized, fmt: fmtM, better: 'high' },
  { key: 'ebitda', label: 'EBITDA estabilizado', get: (r) => r.metrics.ebitdaStabilized, fmt: fmtM, better: 'high' },
  { key: 'margin', label: 'Margem EBITDA', get: (r) => r.metrics.ebitdaMarginStabilized, fmt: (v) => fmtPct(v, 0), better: 'high' },
  { key: 'occ', label: 'Ocupação estabilizada', get: (r) => r.metrics.occupancyStabilized, fmt: (v) => fmtPct(v, 0), better: 'high' },
  { key: 'adr', label: 'ADR', get: (r) => r.metrics.adrStabilized, fmt: (v) => fmtNum(v), better: 'high' },
  { key: 'revpar', label: 'RevPAR', get: (r) => r.metrics.revparStabilized, fmt: (v) => fmtNum(v), better: 'high' },
  { key: 'irr', label: 'TIR do projeto', get: (r) => r.metrics.irrProject, fmt: (v) => fmtPct(v), better: 'high' },
  { key: 'npv', label: 'VPL do projeto', get: (r) => r.metrics.npvProject, fmt: fmtM, better: 'high' },
  { key: 'irrEq', label: 'TIR do equity', get: (r) => r.metrics.irrEquity, fmt: (v) => fmtPct(v), better: 'high' },
  { key: 'payback', label: 'Payback', get: (r) => r.metrics.paybackMonths, fmt: (v) => (v == null ? '—' : `${fmtNum(v)} meses`), better: 'low' },
  { key: 'dscr', label: 'DSCR mínimo', get: (r) => r.metrics.dscrMin, fmt: (v) => fmtX(v), better: 'high' },
  { key: 'invIrr', label: 'TIR do investidor', get: (r) => r.parties[r.parties.length - 1].irr, fmt: (v) => fmtPct(v), better: 'high' },
  { key: 'invMoic', label: 'MOIC do investidor', get: (r) => r.parties[r.parties.length - 1].moic, fmt: (v) => fmtX(v, 1), better: 'high' },
  { key: 'dcf', label: 'Valuation DCF (EV)', get: (r) => r.valuation.dcf.ev, fmt: fmtM, better: 'high' },
  { key: 'tv', label: 'Peso do valor terminal', get: (r) => r.valuation.dcf.tvShareOfEv, fmt: (v) => fmtPct(v, 0), better: 'low' },
  { key: 'alerts', label: 'Alertas', get: (r) => r.alerts.length, fmt: (v) => fmtNum(v), better: 'low' },
];

export default function ScenarioLab({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const pageRef = useRef<HTMLDivElement>(null);
  const [busyPng, setBusyPng] = useState(false);
  return (
    <div ref={pageRef}>
      <PageHeader
        title="Scenario Lab"
        subtitle="Gestão de cenários, comparação lado a lado, sensibilidades, break-even e registro de premissas. Cada cenário guarda suas próprias premissas e a origem de cada uma."
        actions={
          <>
            <button className="btn" onClick={() => exportWorkbook(s, r)}>Exportar para Excel</button>
            <button className="btn" onClick={async () => { const charts = await captureCharts(); await exportPdfReport(s, r, { charts }); }}>Relatório PDF</button>
            <button className="btn" disabled={busyPng} onClick={async () => { setBusyPng(true); try { await exportChartsPNG(pageRef.current ?? document, `bons-ventos-${s.id}`); } finally { setBusyPng(false); } }}>{busyPng ? 'Exportando…' : 'Exportar gráficos (PNG)'}</button>
            <button className="btn" onClick={() => go('dashboard')}>Dashboard</button>
          </>
        }
      />
      <ScenarioManager />
      <Compare />
      <Sensitivity s={s} />
      <BreakEven s={s} />
      <ProvenanceRegistry />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Gerenciador de cenários                                             */
/* ------------------------------------------------------------------ */
function ScenarioManager() {
  const scenarios = useScenarios((st) => st.scenarios);
  const activeId = useScenarios((st) => st.activeId);
  const compareIds = useScenarios((st) => st.compareIds);
  const setActive = useScenarios((st) => st.setActive);
  const setCompare = useScenarios((st) => st.setCompare);
  const replace = useScenarios((st) => st.replace);
  const duplicate = useScenarios((st) => st.duplicate);
  const remove = useScenarios((st) => st.remove);
  const resetToOriginal = useScenarios((st) => st.resetToOriginal);
  const resetAll = useScenarios((st) => st.resetAll);
  const importScenario = useScenarios((st) => st.importScenario);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const toggleCompare = (id: string) => {
    if (compareIds.includes(id)) setCompare(compareIds.filter((c) => c !== id));
    else if (compareIds.length < 4) setCompare([...compareIds, id]);
    else setMsg('A comparação aceita até 4 cenários. Desmarque um para incluir outro.');
  };
  const onImport = async (f: File | undefined) => {
    if (!f) return;
    try {
      const sc = await readScenarioFile(f);
      if (scenarios.some((x) => x.id === sc.id) && !confirm(`Já existe um cenário com o id "${sc.id}". Substituir?`)) return;
      importScenario(sc); setMsg(`Cenário "${sc.name}" importado.`);
    } catch (e) { setMsg(`Falha na importação: ${(e as Error).message}`); }
    if (fileRef.current) fileRef.current.value = '';
  };
  return (
    <Panel
      title="Cenários"
      subtitle="Nome e descrição são editáveis diretamente na tabela (exceto na réplica do Excel). Marque até 4 cenários para comparar."
      className="no-print"
      actions={
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={(e) => onImport(e.target.files?.[0])} />
          <button className="btn" onClick={() => fileRef.current?.click()}>Importar JSON</button>
          <button className="btn" onClick={() => { if (confirm('Restaurar todos os cenários padrão e apagar os personalizados? Esta ação não pode ser desfeita.')) { resetAll(); setMsg('Cenários restaurados.'); } }}>Restaurar tudo</button>
        </div>
      }
    >
      {msg && <div className="mb-3 text-[12px] text-ocean-2 flex justify-between"><span>{msg}</span><button className="btn btn-ghost py-0" onClick={() => setMsg(null)}>fechar</button></div>}
      <div className="overflow-x-auto">
        <table className="data">
          <thead><tr><th>Comparar</th><th>Cenário</th><th>Descrição</th><th>Tipo</th><th>Atualizado</th><th className="r">Ações</th></tr></thead>
          <tbody>
            {scenarios.map((sc) => {
              const locked = sc.kind === 'excel';
              const active = sc.id === activeId;
              return (
                <tr key={sc.id} className={active ? 'bg-sand-2/60' : ''}>
                  <td className="w-16"><input type="checkbox" className="accent-green w-4 h-4" checked={compareIds.includes(sc.id)} onChange={() => toggleCompare(sc.id)} /></td>
                  <td className="w-[230px]">
                    <input type="text" className="w-full font-medium" defaultValue={sc.name} key={`${sc.id}-n-${sc.name}`} disabled={locked} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== sc.name) replace({ ...sc, name: v }); }} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
                    {active && <span className="chip bg-green text-cream mt-1">ativo</span>}
                  </td>
                  <td><input type="text" className="w-full text-[12px]" defaultValue={sc.description} key={`${sc.id}-d-${sc.description}`} disabled={locked} onBlur={(e) => { if (e.target.value !== sc.description) replace({ ...sc, description: e.target.value }); }} /></td>
                  <td><span className={`chip ${KIND_CLASS[sc.kind]}`}>{KIND_LABEL[sc.kind]}</span></td>
                  <td className="text-ink-3 text-[12px] whitespace-nowrap">{new Date(sc.updatedAt).toLocaleDateString('pt-BR')}</td>
                  <td className="r whitespace-nowrap">
                    <div className="flex justify-end gap-1 flex-wrap">
                      {!active && <button className="btn btn-ghost py-0.5" onClick={() => setActive(sc.id)}>Ativar</button>}
                      <button className="btn btn-ghost py-0.5" onClick={() => duplicate(sc.id)}>Duplicar</button>
                      {['base-ian-erich', 'base', 'conservador', 'otimista'].includes(sc.id) && <button className="btn btn-ghost py-0.5" onClick={() => { if (confirm(`Restaurar as premissas originais de "${sc.name}"?`)) resetToOriginal(sc.id); }}>Restaurar</button>}
                      <button className="btn btn-ghost py-0.5" onClick={() => exportScenarioJSON(sc)}>JSON</button>
                      {sc.kind !== 'excel' && sc.kind !== 'base' && <button className="btn btn-ghost py-0.5 text-rust" onClick={() => { if (confirm(`Excluir o cenário "${sc.name}"?`)) remove(sc.id); }}>Excluir</button>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------------ */
/* Comparação                                                          */
/* ------------------------------------------------------------------ */
function Compare() {
  const items = useCompareResults();
  const yearData = useMemo(() => {
    const years = new Set<number>();
    items.forEach((it) => it.results.annual.forEach((a) => { if (a.opYear > 0) years.add(a.year); }));
    return Array.from(years).sort().map((y) => {
      const row: Record<string, number | null> = { ano: y };
      items.forEach((it) => { const a = it.results.annual.find((x) => x.year === y); row[`ebitda:${it.scenario.name}`] = a ? a.ebitda / 1e6 : null; row[`rev:${it.scenario.name}`] = a ? a.revenueGross / 1e6 : null; });
      return row;
    });
  }, [items]);
  const cumData = useMemo(() => {
    const months = items[0]?.results.monthly.months ?? [];
    const cums = items.map((it) => { let c = 0; return it.results.monthly.fcfProjectNoTV.map((v) => (c += v)); });
    const out: Record<string, number | string | null>[] = [];
    months.forEach((m, i) => { if (!m.endsWith('-12') && !m.endsWith('-06')) return; const row: Record<string, number | string | null> = { m }; items.forEach((it, k) => { row[`cum:${it.scenario.name}`] = cums[k][i] != null && i < it.results.monthly.months.length ? cums[k][i] / 1e6 : null; }); out.push(row); });
    return out;
  }, [items]);
  if (!items.length) return <Panel title="Comparação de cenários" className="mt-5"><div className="text-[13px] text-ink-3">Marque cenários na tabela acima para comparar.</div></Panel>;
  const best = (row: CompareRow) => {
    if (row.better === 'none') return -1;
    const vals = items.map((it) => row.get(it.results, it.scenario));
    let bi = -1;
    vals.forEach((v, i) => { if (v == null) return; if (bi < 0) { bi = i; return; } const b = vals[bi] as number; if (row.better === 'high' ? v > b : v < b) bi = i; });
    return bi;
  };
  return (
    <>
      <Panel title="Comparação de cenários" subtitle="Indicadores lado a lado; o melhor valor de cada linha é destacado em verde." className="mt-5">
        <div className="overflow-x-auto">
          <table className="data">
            <thead><tr><th>Indicador</th>{items.map((it, i) => <th key={it.scenario.id} className="r"><span className="inline-flex items-center gap-1.5"><i className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: SERIES_COLORS[i] }} />{it.scenario.name}</span></th>)}</tr></thead>
            <tbody>
              {COMPARE_ROWS.map((row) => { const bi = best(row); return (
                <tr key={row.key}><td className="text-ink-2">{row.label}</td>{items.map((it, i) => <td key={it.scenario.id} className={`r tnum ${i === bi ? 'text-green-3 font-semibold' : 'text-ink'}`}>{row.fmt(row.get(it.results, it.scenario))}</td>)}</tr>
              ); })}
            </tbody>
          </table>
        </div>
      </Panel>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-5">
        <ChartPanel title="EBITDA por ano" subtitle="R$ milhões">
          <LineChart data={yearData} margin={{ left: 0, right: 10, top: 10 }}>
            <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="ano" {...chartAxis} /><YAxis {...chartAxis} width={40} />
            <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(1)} M`)} /><Legend wrapperStyle={{ fontSize: 11 }} />
            {items.map((it, i) => <Line key={it.scenario.id} dataKey={`ebitda:${it.scenario.name}`} name={it.scenario.name} stroke={SERIES_COLORS[i]} strokeWidth={2} dot={false} connectNulls />)}
          </LineChart>
        </ChartPanel>
        <ChartPanel title="Fluxo acumulado do projeto" subtitle="sem valor terminal, R$ milhões">
          <LineChart data={cumData} margin={{ left: 0, right: 10, top: 10 }}>
            <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="m" {...chartAxis} tickFormatter={(v) => String(v).slice(0, 4)} interval={3} /><YAxis {...chartAxis} width={44} />
            <Tooltip {...chartTooltipStyle} labelFormatter={(l) => fmtYM(String(l))} formatter={tipFmt((v) => `R$ ${v.toFixed(1)} M`)} /><Legend wrapperStyle={{ fontSize: 11 }} />
            {items.map((it, i) => <Line key={it.scenario.id} dataKey={`cum:${it.scenario.name}`} name={it.scenario.name} stroke={SERIES_COLORS[i]} strokeWidth={2} dot={false} connectNulls />)}
          </LineChart>
        </ChartPanel>
        <ChartPanel title="Receita bruta por ano" subtitle="R$ milhões">
          <LineChart data={yearData} margin={{ left: 0, right: 10, top: 10 }}>
            <CartesianGrid stroke={C.grid} vertical={false} /><XAxis dataKey="ano" {...chartAxis} /><YAxis {...chartAxis} width={40} />
            <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(1)} M`)} /><Legend wrapperStyle={{ fontSize: 11 }} />
            {items.map((it, i) => <Line key={it.scenario.id} dataKey={`rev:${it.scenario.name}`} name={it.scenario.name} stroke={SERIES_COLORS[i]} strokeWidth={2} dot={false} connectNulls />)}
          </LineChart>
        </ChartPanel>
      </div>
    </>
  );
}
function ChartPanel({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <Panel title={title} subtitle={subtitle}><ResponsiveContainer width="100%" height={240}>{children as never}</ResponsiveContainer></Panel>;
}

/* ------------------------------------------------------------------ */
/* Sensibilidade                                                       */
/* ------------------------------------------------------------------ */
function Sensitivity({ s }: { s: Scenario }) {
  const [metric, setMetric] = useState<MetricKey>('irrProject');
  const [xId, setXId] = useState('occupancy');
  const [yId, setYId] = useState('adr');
  const base = useResults(s);
  const rows = useMemo(() => tornado(s, metric, DRIVERS, base), [s, metric, base]);
  const xD = DRIVERS.find((d) => d.id === xId) ?? DRIVERS[0];
  const yD = DRIVERS.find((d) => d.id === yId) ?? DRIVERS[1];
  const grid = useMemo(() => heatmap(s, metric, xD, yD, 5), [s, metric, xD, yD]);
  const hurdle = metric === 'irrEquity' || metric === 'investorIRR' || metric === 'existingIRR' ? s.valuation.discountRateEquity : s.valuation.discountRateProject;
  const sel = (value: string, onChange: (v: string) => void, opts: { value: string; label: string }[]) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="text-[12px]">{opts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
  );
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-5">
      <Panel title="Tornado de sensibilidade" subtitle={`Efeito isolado de cada driver sobre ${METRIC_LABELS[metric]} no cenário "${s.name}"`} actions={<label className="flex items-center gap-2 text-[12px] text-ink-3 no-print">Indicador {sel(metric, (v) => setMetric(v as MetricKey), METRIC_KEYS.map((k) => ({ value: k, label: METRIC_LABELS[k] })))}</label>}>
        <Tornado rows={rows} metric={metric} />
        <div className="mt-3"><Note>Cada driver é variado isoladamente entre os extremos indicados, mantendo as demais premissas. {higherIsBetter(metric) ? 'Valores maiores são melhores.' : 'Valores menores são melhores.'}</Note></div>
      </Panel>
      <Panel title="Grade de sensibilidade (heatmap)" subtitle={`${METRIC_LABELS[metric]} em função de dois drivers (5 × 5)`}>
        <div className="flex items-center gap-3 text-[12px] text-ink-3 no-print mb-4"><span>Eixo X</span>{sel(xId, setXId, DRIVERS.map((d) => ({ value: d.id, label: d.label })))}<span>Eixo Y</span>{sel(yId, setYId, DRIVERS.map((d) => ({ value: d.id, label: d.label })))}</div>
        <Heatmap grid={grid} metric={metric} discountRate={hurdle} />
        <div className="mt-3"><Note>Escala sequencial areia → verde (melhor). Células em ferrugem indicam VPL negativo, TIR abaixo da taxa de desconto ({fmtPct(hurdle, 0)}) ou DSCR inferior a 1,0×.</Note></div>
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Break-even                                                          */
/* ------------------------------------------------------------------ */
function BreakEven({ s }: { s: Scenario }) {
  const [state, setState] = useState<{ forId: string; occNpv: ReturnType<typeof breakEvenOccupancy>; occDscr: ReturnType<typeof breakEvenOccupancy>; weddings: number | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const r = useResults(s);
  const run = () => {
    setBusy(true);
    setTimeout(() => {
      try { setState({ forId: `${s.id}:${s.updatedAt}`, occNpv: breakEvenOccupancy(s, 'npv'), occDscr: breakEvenOccupancy(s, 'dscr'), weddings: breakEvenWeddings(s) }); } finally { setBusy(false); }
    }, 30);
  };
  const stale = state && state.forId !== `${s.id}:${s.updatedAt}`;
  const hasDebt = s.loans.some((l) => l.enabled && l.amount > 0);
  return (
    <Panel title="Break-even" subtitle="Ocupação e número de casamentos a partir dos quais o projeto deixa de criar valor ou de cobrir a dívida" className="mt-5" actions={<button className="btn no-print" disabled={busy} onClick={run}>{busy ? 'Calculando…' : state ? 'Recalcular' : 'Calcular break-even'}</button>}>
      {!state && <div className="text-[13px] text-ink-3">O cálculo resolve o modelo iterativamente (alguns segundos). Clique em "Calcular break-even".</div>}
      {state && (
        <>
          {stale && <div className="mb-3"><Note tone="warn">As premissas mudaram desde o último cálculo. Recalcule para atualizar.</Note></div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <BeCard title="Ocupação para VPL = 0" value={state.occNpv ? fmtPct(state.occNpv.occupancy, 0) : 'não encontrado'} hint={state.occNpv ? `fator ${fmtX(state.occNpv.factor, 2)} sobre as grades de ocupação · cenário atual ${fmtPct(r.metrics.occupancyStabilized, 0)}` : 'o VPL não cruza zero no intervalo testado (5% a 160% da ocupação atual)'} tone={state.occNpv && state.occNpv.occupancy < r.metrics.occupancyStabilized ? 'good' : 'bad'} />
            <BeCard title="Ocupação para DSCR mín. = 1,0×" value={!hasDebt ? 'sem dívida' : state.occDscr ? fmtPct(state.occDscr.occupancy, 0) : 'não encontrado'} hint={!hasDebt ? 'o cenário não possui financiamento ativo' : state.occDscr ? `abaixo disso a geração de caixa não cobre o serviço da dívida em algum ano · DSCR mínimo atual ${fmtX(r.metrics.dscrMin)}` : 'o DSCR mínimo não cruza 1,0× no intervalo testado'} tone={!hasDebt ? 'muted' : state.occDscr && state.occDscr.occupancy < r.metrics.occupancyStabilized ? 'good' : 'bad'} />
            <BeCard title="Casamentos/ano para VPL = 0" value={!s.weddings.enabled ? 'módulo desligado' : state.weddings == null ? 'VPL positivo sem casamentos' : fmtNum(state.weddings, 1)} hint={!s.weddings.enabled ? 'ative o módulo de casamentos para avaliar' : state.weddings == null ? 'o VPL permanece positivo mesmo sem casamentos, mantendo as demais premissas' : `contra ${s.weddings.countByYear[s.weddings.countByYear.length - 1]} previstos no ano estabilizado`} tone={!s.weddings.enabled ? 'muted' : 'good'} />
          </div>
          <div className="mt-4"><Note>Os break-evens escalam as grades de ocupação (dias normais e especiais) ou a curva de casamentos por um fator único, mantendo tarifas, custos, dívida e estrutura societária.</Note></div>
        </>
      )}
    </Panel>
  );
}
function BeCard({ title, value, hint, tone }: { title: string; value: string; hint: string; tone: 'good' | 'bad' | 'muted' }) {
  return (
    <div className="border-l-2 border-line pl-4">
      <div className="text-[11px] font-semibold tracking-wide text-ink-3">{title}</div>
      <div className={`num text-[28px] leading-tight mt-1 ${tone === 'good' ? 'text-green-3' : tone === 'bad' ? 'text-rust' : 'text-ink-3'}`}>{value}</div>
      <div className="text-[12px] text-ink-3 mt-1 leading-relaxed">{hint}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Registro de premissas                                               */
/* ------------------------------------------------------------------ */
const SOURCE_LABEL: Record<string, string> = { excel: 'Excel original', doc: 'Documento de referência', hypothesis: 'Hipótese nova', calculated: 'Calculado' };
const STATUS_LABEL: Record<AssumptionStatus, string> = { original: 'original', revised: 'revisada', pending: 'pendente de validação' };
function ProvenanceRegistry() {
  const scenarios = useScenarios((st) => st.scenarios);
  const activeId = useScenarios((st) => st.activeId);
  const [id, setId] = useState<string | null>(null);
  const [status, setStatus] = useState<AssumptionStatus | 'all'>('all');
  const [open, setOpen] = useState(true);
  const sc = scenarios.find((x) => x.id === (id ?? activeId)) ?? scenarios[0];
  const entries = useMemo(() => Object.entries(sc.provenance).filter(([, e]) => status === 'all' || e.status === status).sort((a, b) => a[0].localeCompare(b[0])), [sc, status]);
  const counts = useMemo(() => { const c = { original: 0, revised: 0, pending: 0 }; for (const e of Object.values(sc.provenance)) c[e.status]++; return c; }, [sc]);
  const r = computeCached(sc);
  return (
    <Panel
      title="Registro de premissas"
      subtitle={`Origem e status de cada grupo de premissas do cenário "${sc.name}" — ${counts.original} originais · ${counts.revised} revisadas · ${counts.pending} pendentes`}
      className="mt-5"
      actions={
        <div className="flex items-center gap-2 text-[12px] text-ink-3 no-print">
          <select value={sc.id} onChange={(e) => setId(e.target.value)} className="text-[12px]">{scenarios.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
          <select value={status} onChange={(e) => setStatus(e.target.value as AssumptionStatus | 'all')} className="text-[12px]"><option value="all">todos os status</option><option value="original">originais</option><option value="revised">revisadas</option><option value="pending">pendentes</option></select>
          <button className="btn btn-ghost" onClick={() => setOpen(!open)}>{open ? 'Recolher' : 'Expandir'}</button>
        </div>
      }
    >
      {open && (
        <div className="overflow-x-auto">
          <table className="data text-[12px]">
            <thead><tr><th>Premissa (caminho)</th><th>Origem</th><th>Status</th><th>Referência</th><th>Nota</th></tr></thead>
            <tbody>
              {entries.map(([path, e]) => (
                <tr key={path}>
                  <td className="whitespace-nowrap pr-4"><span className="inline-flex items-center gap-2"><ProvDot entry={e} path={path} /><code className="text-[11px]">{path}</code></span></td>
                  <td className="whitespace-nowrap pr-4">{SOURCE_LABEL[e.source] ?? e.source}</td>
                  <td className={`whitespace-nowrap pr-4 ${e.status === 'pending' ? 'text-rust' : 'text-ink-2'}`}>{STATUS_LABEL[e.status]}</td>
                  <td className="text-ink-3 whitespace-nowrap pr-4">{e.ref ?? '—'}</td>
                  <td className="text-ink-2 leading-snug max-w-[520px]">{e.note ?? '—'}</td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={5} className="text-ink-3">Nenhuma premissa com este status.</td></tr>}
            </tbody>
          </table>
          <div className="mt-3 text-[12px] text-ink-3">Resultado do cenário com estas premissas: TIR do projeto {fmtPct(r.metrics.irrProject)} · VPL {fmtM(r.metrics.npvProject)} · {r.alerts.length} alerta{r.alerts.length === 1 ? '' : 's'}.</div>
        </div>
      )}
    </Panel>
  );
}
