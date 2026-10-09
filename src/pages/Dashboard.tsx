import { useMemo } from 'react';
import { ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { PageHeader, Ledger, Panel, AlertList, DataTable, CHART_COLORS as C, chartAxis, chartTooltipStyle, Note, tipFmt, type Column } from '../components/ui';
import { useActiveScenario } from '../store/scenarios';
import { useResults } from '../lib/useResults';
import { fmtM, fmtPct, fmtYM, fmtX, fmtNum } from '../lib/format';
import type { AnnualRow } from '../engine/types';
import type { PageKey } from '../App';

export default function Dashboard({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const m = r.metrics;
  const years = useMemo(() => r.annual.filter((a) => a.opYear > 0 || a.capex > 0), [r]);
  const chartData = years.map((a) => ({ ano: a.year, Hospedagem: a.revHotel / 1e6, Casamentos: a.revWeddings / 1e6, 'A&B': a.revFnb / 1e6, EBITDA: a.ebitda / 1e6, Margem: a.opYear > 0 ? a.ebitdaMargin : null }));
  const cashData = years.map((a) => ({ ano: a.year, 'FCF projeto': a.fcfProjectNoTV / 1e6, 'Serviço da dívida': -a.debtService / 1e6, 'Saldo devedor': a.debtBalance / 1e6 }));
  const inv = r.parties[r.parties.length - 1];
  const cols: Column<AnnualRow>[] = [
    { key: 'year', label: 'Ano', align: 'l', render: (a) => <span className="font-semibold">{a.year}{a.opYear > 0 ? <span className="text-ink-3 font-normal"> · op. {a.opYear}</span> : ''}</span> },
    { key: 'rev', label: 'Receita bruta', render: (a) => fmtM(a.revenueGross) },
    { key: 'occ', label: 'Ocupação', render: (a) => fmtPct(a.occupancy, 0) },
    { key: 'adr', label: 'ADR', render: (a) => fmtNum(a.adr) },
    { key: 'ebitda', label: 'EBITDA', render: (a) => fmtM(a.ebitda), strong: true },
    { key: 'mg', label: 'Margem', render: (a) => fmtPct(a.ebitdaMargin, 0) },
    { key: 'capex', label: 'CAPEX', render: (a) => fmtM(a.capex) },
    { key: 'svc', label: 'Serviço dívida', render: (a) => fmtM(a.debtService) },
    { key: 'dscr', label: 'DSCR', render: (a) => (a.debtService > 0 && a.opYear > 0 ? fmtX(a.dscr) : '—') },
    { key: 'fcf', label: 'FCF projeto', render: (a) => fmtM(a.fcfProjectNoTV) },
    { key: 'fcfe', label: 'FCF equity', render: (a) => fmtM(a.fcfEquity - a.terminalValue) },
    { key: 'dist', label: 'Distribuições', render: (a) => fmtM(a.distributions) },
  ];
  return (
    <>
      <PageHeader title="Investment Dashboard" subtitle={`Painel executivo do cenário "${s.name}". Valores nominais; indicadores de retorno calculados sobre fluxos mensais com datas efetivas.`} actions={<button className="btn" onClick={() => go('lab')}>Comparar cenários</button>} />
      <Ledger items={[
        { label: 'CAPEX total', value: fmtM(m.capexTotal), hint: `Fase 01 ${fmtM(m.capexP1)} · Fase 02 ${fmtM(m.capexP2)}`, traceId: 'capex' },
        { label: 'Receita estabilizada', value: fmtM(m.revenueStabilized), hint: `ano ${m.stabilizedYear} de operação`, traceId: 'revHotel' },
        { label: 'EBITDA estabilizado', value: fmtM(m.ebitdaStabilized), hint: `margem ${fmtPct(m.ebitdaMarginStabilized, 0)}`, traceId: 'ebitda' },
        { label: 'Financiamento', value: fmtM(m.debtTotal), hint: `juros totais ${fmtM(m.interestTotal)}`, traceId: 'debtService' },
        { label: 'Capital próprio', value: fmtM(m.equityTotal), hint: `exposição máx. ${fmtM(m.maxExposure)} (${fmtYM(m.maxExposureDate)})` },
        { label: 'TIR do projeto', value: fmtPct(m.irrProject), hint: `sem valor terminal ${fmtPct(m.irrProjectNoTV)}`, tone: m.irrProject != null && m.irrProject < s.valuation.discountRateProject ? 'bad' : 'good', traceId: 'irrProject' },
      ]} />
      <div className="mt-px">
        <Ledger items={[
          { label: 'VPL do projeto', value: fmtM(m.npvProject), hint: `a ${fmtPct(s.valuation.discountRateProject, 1)} a.a. na data-base`, tone: m.npvProject < 0 ? 'bad' : 'default', traceId: 'npvProject' },
          { label: 'TIR do equity', value: fmtPct(m.irrEquity), hint: `VPL equity ${fmtM(m.npvEquity)}`, traceId: 'irrEquity' },
          { label: 'Payback', value: fmtYM(m.paybackSimple), hint: `descontado ${fmtYM(m.paybackDiscounted)}` },
          { label: 'DSCR mínimo', value: m.dscrMin == null ? '—' : fmtX(m.dscrMin), hint: m.dscrMinYear ? `em ${m.dscrMinYear} · média ${fmtX(m.dscrAvg)}` : 'sem dívida', tone: m.dscrMin != null && m.dscrMin < 1.2 ? 'bad' : 'default', traceId: 'dscr' },
          { label: 'Valuation (DCF)', value: fmtM(r.valuation.dcf.ev), hint: `equity ${fmtM(r.valuation.dcf.equity)} · ${fmtPct(r.valuation.dcf.tvShareOfEv, 0)} no terminal`, traceId: 'valuation' },
          { label: 'TIR do investidor', value: fmtPct(inv.irr), hint: inv.totalIn > 0 ? `MOIC ${fmtX(inv.moic, 1)} · ${fmtPct(inv.stakePost, 1)} do capital` : 'sem investidor no cenário', traceId: 'investorIRR' },
        ]} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 mt-6">
        <Panel title="Receita por linha e EBITDA" subtitle="R$ milhões por ano calendário">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={chartData} margin={{ left: 0, right: 10, top: 10 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="ano" {...chartAxis} />
              <YAxis yAxisId="l" {...chartAxis} width={40} />
              <YAxis yAxisId="r" orientation="right" {...chartAxis} width={40} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 0.7]} />
              <Tooltip {...chartTooltipStyle} formatter={tipFmt((v, n) => (n === 'Margem' ? fmtPct(v, 0) : `R$ ${v.toFixed(1)} M`))} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar yAxisId="l" dataKey="Hospedagem" stackId="a" fill={C.hotel} />
              <Bar yAxisId="l" dataKey="Casamentos" stackId="a" fill={C.weddings} />
              <Bar yAxisId="l" dataKey="A&B" stackId="a" fill={C.fnb} />
              <Line yAxisId="l" dataKey="EBITDA" stroke={C.neg} strokeWidth={2} dot={false} />
              <Line yAxisId="r" dataKey="Margem" stroke={C.ocean3} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
        <Panel title="Geração de caixa e dívida" subtitle="FCF do projeto, serviço da dívida e saldo devedor (R$ milhões)">
          <ResponsiveContainer width="100%" height={300}>
            <ComposedChart data={cashData} margin={{ left: 0, right: 10, top: 10 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="ano" {...chartAxis} />
              <YAxis {...chartAxis} width={44} />
              <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(1)} M`)} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="FCF projeto" fill={C.equity} />
              <Bar dataKey="Serviço da dívida" fill={C.neg} />
              <Line dataKey="Saldo devedor" stroke={C.debt} strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Panel>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-5">
        <Panel title="Alertas do cenário" className="xl:col-span-1"><AlertList alerts={r.alerts} /></Panel>
        <Panel title="Fluxo de caixa acumulado do projeto" subtitle="Exposição de caixa e payback (R$ milhões)" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={cumulative(r.monthly.months, r.monthly.fcfProjectNoTV)} margin={{ left: 0, right: 10, top: 10 }}>
              <CartesianGrid stroke={C.grid} vertical={false} />
              <XAxis dataKey="m" {...chartAxis} interval={23} />
              <YAxis {...chartAxis} width={44} />
              <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(1)} M`)} />
              <Area dataKey="acumulado" stroke={C.hotel} fill={C.sand} />
            </AreaChart>
          </ResponsiveContainer>
          <Note>Fluxo sem valor terminal. Exposição máxima {fmtM(m.maxExposure)} em {fmtYM(m.maxExposureDate)}; payback simples em {fmtYM(m.paybackSimple)}.</Note>
        </Panel>
      </div>

      <Panel title="Demonstrativo anual resumido" subtitle="Clique em qualquer indicador da faixa superior para ver as premissas que o influenciam." className="mt-5">
        <DataTable rows={years} columns={cols} rowKey={(a) => a.year} dense />
      </Panel>
    </>
  );
}
function cumulative(months: string[], ser: number[]) { let c = 0; return months.map((m, i) => { c += ser[i]; return { m: m.slice(0, 4) + (m.endsWith('-01') ? '' : ''), acumulado: c / 1e6 }; }); }
