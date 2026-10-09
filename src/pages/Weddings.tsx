import { useMemo, useState } from 'react';
import { ComposedChart, BarChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PageHeader, Ledger, Panel, Field, ToggleField, MonthRow, Note, ProvDot, provFor, CHART_COLORS as C, chartAxis, chartTooltipStyle, tipFmt } from '../components/ui';
import { MonthTable, VectorRow, CellInput, CellToggle, sumOpYear } from '../components/editors';
import { useActiveScenario, useScenarios } from '../store/scenarios';
import { useResults } from '../lib/useResults';
import { compute } from '../engine/compute';
import { withOverrides } from '../engine/analysis';
import { fmtM, fmtK, fmtPct, fmtNum, fmtBRL, MONTHS_PT } from '../lib/format';
import type { AnnualRow } from '../engine/types';
import type { PageKey } from '../App';

const YEARS6 = ['Ano 1', 'Ano 2', 'Ano 3', 'Ano 4', 'Ano 5', 'Ano 6'];
const COMPONENTS: { key: keyof AnnualRow & string; label: string; color: string; short: string }[] = [
  { key: 'revWeddingLodging', label: 'Hospedagem (buyout)', color: C.weddings, short: 'Hosp.' },
  { key: 'revWeddingVenue', label: 'Locação', color: C.debt, short: 'Locação' },
  { key: 'revWeddingWelcome', label: 'Welcome party', color: C.ocean3, short: 'Welcome' },
  { key: 'revWeddingCatering', label: 'Catering', color: C.fnb, short: 'Catering' },
  { key: 'revWeddingBeverages', label: 'Bebidas', color: C.gold2, short: 'Bebidas' },
  { key: 'revWeddingPool', label: 'Pool party', color: C.equity, short: 'Pool' },
  { key: 'revWeddingOther', label: 'Outras atividades', color: C.cost, short: 'Outras' },
  { key: 'revWeddingExtra', label: 'Consumo extra', color: C.text, short: 'Extra' },
];
const PHASE_FLAGS: { key: string; label: string }[] = [
  { key: 'venueRental', label: 'Locação' }, { key: 'welcomeParty', label: 'Welcome' }, { key: 'cateringOwn', label: 'Catering próprio' },
  { key: 'beverageOwn', label: 'Bebidas próprias' }, { key: 'poolParty', label: 'Pool party' }, { key: 'otherActivities', label: 'Outras ativ.' },
];
const TICKET_PATHS = ['weddings.roomRate', 'weddings.venueFee', 'weddings.welcomePartyPerGuest', 'weddings.cateringPerGuest', 'weddings.beveragesPerGuest', 'weddings.poolPartyPerGuest', 'weddings.otherActivitiesPerWedding', 'weddings.extraConsumptionPerGuestNight'];

export default function Weddings({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const W = s.weddings;
  const M = r.monthly;
  const m = r.metrics;
  const stabY = m.stabilizedYear;
  const years = useMemo(() => r.annual.filter((a) => a.opYear > 0), [r]);

  const stab = (k: keyof typeof M) => sumOpYear(M[k] as number[], M.opYear, stabY);
  const wStab = stab('weddingsCount'), revStab = stab('revWeddings'), costStab = stab('costWeddings'), blockedStab = stab('roomNightsBlocked'), grossStab = stab('revenueGross');
  const roomsP1 = s.hotel.phase1.categories.length ? s.hotel.phase1.categories.reduce((a, c) => a + c.count, 0) : s.hotel.phase1.rooms;
  const roomsBuyout = W.roomsBlocked === 'all' ? roomsP1 : Math.min(W.roomsBlocked, roomsP1);

  const compData = years.map((a) => { const row: Record<string, number | string> = { ano: a.year, Custos: a.costWeddings / 1e6 }; for (const c of COMPONENTS) row[c.label] = (a[c.key] as number) / 1e6; return row; });
  const blockData = years.map((a) => ({ ano: a.year, 'Diárias convencionais': a.roomsAvailable, 'Bloqueadas por buyout': a.roomNightsBlocked }));
  const monthData = MONTHS_PT.map((mes, mi) => { let n = 0; for (let i = 0; i < M.months.length; i++) if (M.opYear[i] === stabY && Number(M.months[i].slice(5)) - 1 === mi) n += M.weddingsCount[i]; return { mes, Casamentos: n }; });

  /* tabela anual com receita hoteleira perdida vs hospedagem do buyout */
  const rows: (AnnualRow & { lost: number; net: number; perWedding: number; margin: number })[] = years.map((a) => {
    const lost = a.roomNightsBlocked * a.adr * a.occupancy;
    return { ...a, lost, net: a.revWeddingLodging - lost, perWedding: a.weddingsCount ? a.revWeddings / a.weddingsCount : 0, margin: a.revWeddings ? (a.revWeddings - a.costWeddings) / a.revWeddings : 0 };
  });

  return (
    <>
      <PageHeader title="Weddings & Events" subtitle={`Destination weddings com buyout do hotel no cenário "${s.name}": volume, ticket por componente, fases comerciais e o efeito do bloqueio de diárias sobre a hotelaria convencional. Indicadores do ano ${stabY} de operação.`} actions={<button className="btn" onClick={() => go('hotel')}>Ver operação hoteleira</button>} />
      <Ledger items={[
        { label: 'Casamentos / ano', value: fmtNum(wStab, 1), hint: W.enabled ? `${fmtNum(W.nights)} diárias × ${roomsBuyout} UH por evento` : 'módulo desligado', tone: W.enabled ? 'default' : 'muted' },
        { label: 'Receita de casamentos', value: fmtM(revStab), hint: `${fmtPct(grossStab ? revStab / grossStab : 0, 1)} da receita total`, traceId: 'revWeddings' },
        { label: 'Receita por casamento', value: fmtK(wStab ? revStab / wStab : 0), hint: `${fmtNum(W.guests)} convidados por evento` },
        { label: 'Margem de contribuição', value: fmtPct(revStab ? (revStab - costStab) / revStab : 0, 1), hint: `custos diretos ${fmtM(costStab)}`, traceId: 'costWeddings' },
        { label: 'Diárias bloqueadas', value: fmtNum(blockedStab), hint: 'retiradas da hotelaria convencional', traceId: 'roomsAvailable' },
        { label: 'Peso na receita total', value: fmtPct(grossStab ? revStab / grossStab : 0, 1), hint: `receita total ${fmtM(grossStab)}` },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6">
        {/* ------------------------- premissas ------------------------- */}
        <div className="space-y-5">
          <Panel title="Volume e buyout" subtitle="Casamentos por ano de operação e formato do bloqueio">
            <ToggleField s={s} path="weddings.enabled" label="Módulo de casamentos ativo" />
            <VectorRow s={s} path="weddings.countByYear" label="Casamentos por ano (após o 6º repete)" labels={YEARS6} />
            <Field s={s} path="weddings.guests" label="Convidados / casamento" kind="int" />
            <Field s={s} path="weddings.nights" label="Diárias / casamento" kind="int" suffix="noites" />
            <RoomsBlockedField />
            <Field s={s} path="weddings.roomRate" label="Diária UH no buyout (ano 1)" kind="money" step={100} />
            <Field s={s} path="weddings.priceGrowth" label="Cresc. anual de preços" kind="pct" />
            <div className="mt-2 text-[12px] text-ink-3">Buyout por diária: <span className="num text-ink">{fmtBRL(roomsBuyout * W.roomRate)}</span> · por casamento: <span className="num text-ink">{fmtBRL(roomsBuyout * W.roomRate * W.nights)}</span></div>
          </Panel>

          <Panel title="Receitas por componente" subtitle="Valores do ano 1 (nominais); crescem com o índice acima">
            <Field s={s} path="weddings.venueFee" label="Locação / evento" kind="money" step={1000} />
            <Field s={s} path="weddings.welcomePartyPerGuest" label="Welcome party / convidado" kind="money" step={10} />
            <Field s={s} path="weddings.cateringPerGuest" label="Catering / convidado" kind="money" step={10} />
            <Field s={s} path="weddings.beveragesPerGuest" label="Bebidas / convidado" kind="money" step={5} />
            <Field s={s} path="weddings.poolPartyPerGuest" label="Pool party / convidado" kind="money" step={10} />
            <Field s={s} path="weddings.otherActivitiesPerWedding" label="Outras atividades / evento" kind="money" step={500} />
            <Field s={s} path="weddings.extraConsumptionPerGuestNight" label="Consumo extra / hóspede-noite" kind="money" step={10} />
            <Field s={s} path="weddings.serviceFeePct" label="Taxa de serviço (A&B)" kind="pct" />
            <Field s={s} path="weddings.cateringOutsourcedCommission" label="Comissão catering terceirizado" kind="pct" />
          </Panel>

          <Panel title="Custos diretos" subtitle="% da receita de cada componente">
            <Field s={s} path="weddings.costPct.lodging" label="Hospedagem (buyout)" kind="pct" />
            <Field s={s} path="weddings.costPct.venue" label="Locação" kind="pct" />
            <Field s={s} path="weddings.costPct.welcomeParty" label="Welcome party" kind="pct" />
            <Field s={s} path="weddings.costPct.catering" label="Catering e consumo extra" kind="pct" />
            <Field s={s} path="weddings.costPct.beverages" label="Bebidas" kind="pct" />
            <Field s={s} path="weddings.costPct.poolParty" label="Pool party" kind="pct" />
            <Field s={s} path="weddings.costPct.other" label="Outras atividades" kind="pct" />
            <div className="mt-3"><Note>A taxa de serviço é repassada à equipe: entra na receita e no custo (margem zero). Custos de pessoal fixo de A&B e extras por casamento estão na folha, não aqui.</Note></div>
          </Panel>

          <Panel title="Fases comerciais" subtitle="Quais componentes o hotel captura em cada fase (ano de operação em que a fase entra)">
            <div className="flex items-center gap-2 text-[12px] text-ink-3 mb-1"><ProvDot entry={provFor(s, 'weddings.phases')} path="weddings.phases" />Ano inicial e componentes capturados pelo hotel</div>
            {(['p1', 'p2', 'p3'] as const).map((p) => (
              <div key={p} className="py-2 border-b border-sand-2 last:border-0">
                <div className="flex items-center justify-between gap-2 text-[13px] text-ink-2"><span className="font-semibold text-ink">Fase {p.slice(1)}</span><span className="flex items-center gap-1 text-[12px]">a partir do ano <CellInput s={s} path={`weddings.phases.${p}.startYear`} width="w-[44px]" /></span></div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1.5">
                  {PHASE_FLAGS.map((f) => <label key={f.key} className="flex items-center gap-1.5 text-[12px] text-ink-2 cursor-pointer"><CellToggle s={s} path={`weddings.phases.${p}.${f.key}`} />{f.label}</label>)}
                </div>
              </div>
            ))}
            <div className="mt-3 pt-2 rule">
              <ToggleField s={s} path="weddings.closeRestaurantDuringBuyout" label="Fechar restaurante durante o buyout" />
              <ToggleField s={s} path="weddings.closeBeachClubDuringBuyout" label="Fechar beach club durante o buyout" />
            </div>
            <div className="mt-3"><Note>Catering terceirizado: o hotel registra apenas a comissão sobre o valor do fornecedor. Catering próprio: receita cheia + taxa de serviço, com o custo direto correspondente.</Note></div>
          </Panel>

          <BenchmarkPanel roomsBuyout={roomsBuyout} />
        </div>

        {/* ------------------------- resultados ------------------------- */}
        <div className="xl:col-span-2 space-y-5">
          <Panel title="Receita de casamentos por componente" subtitle="R$ milhões por ano calendário; custos diretos em linha">
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={compData} margin={{ left: 0, right: 10, top: 10 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="ano" {...chartAxis} />
                <YAxis {...chartAxis} width={40} />
                <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(2)} M`)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {COMPONENTS.map((c) => <Bar key={c.key} dataKey={c.label} stackId="a" fill={c.color} />)}
                <Line dataKey="Custos" stroke={C.neg} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </Panel>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
            <Panel title="Sem dupla contagem de diárias" subtitle="Diárias bloqueadas pelo buyout saem da base disponível para hóspedes convencionais">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={blockData} margin={{ left: 0, right: 10, top: 10 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="ano" {...chartAxis} />
                  <YAxis {...chartAxis} width={48} tickFormatter={(v) => fmtNum(v)} />
                  <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `${fmtNum(v)} diárias`)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Diárias convencionais" stackId="a" fill={C.hotel} />
                  <Bar dataKey="Bloqueadas por buyout" stackId="a" fill={C.weddings} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title={`Distribuição mensal · ano ${stabY} de operação`} subtitle="Casamentos por mês, segundo os pesos mensais">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthData} margin={{ left: 0, right: 10, top: 10 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="mes" {...chartAxis} />
                  <YAxis {...chartAxis} width={36} />
                  <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => fmtNum(v, 2))} />
                  <Bar dataKey="Casamentos" fill={C.weddings} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>


          <QuickSimulator />

          <Panel title="Demonstrativo anual de casamentos" subtitle="R$ mil por ano calendário, exceto onde indicado">
            <div className="text-[12px] font-semibold text-ink-3 mb-1">Receita por componente</div>
            <table className="data text-[12px]">
              <thead><tr className="[&>th]:px-1"><th>Ano</th><th className="r">Casam.</th>{COMPONENTS.map((c) => <th key={c.key} className="r whitespace-nowrap" title={c.label}>{c.short}</th>)}<th className="r">Receita</th><th className="r" title="Receita por casamento">R$ / casam.</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.year} className="[&>td]:px-1 [&>td]:whitespace-nowrap">
                    <td className="font-semibold">{a.year}<span className="text-ink-3 font-normal"> · {a.opYear}</span></td>
                    <td className="r">{fmtNum(a.weddingsCount, 1)}</td>
                    {COMPONENTS.map((c) => <td key={c.key} className="r">{fmtNum((a[c.key] as number) / 1e3)}</td>)}
                    <td className="r font-semibold text-ink">{fmtNum(a.revWeddings / 1e3)}</td>
                    <td className="r">{fmtNum(a.perWedding / 1e3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="text-[12px] font-semibold text-ink-3 mt-5 mb-1">Custos, margem e efeito sobre a hotelaria</div>
            <table className="data text-[12px]">
              <thead><tr className="[&>th]:px-1"><th>Ano</th><th className="r">Receita</th><th className="r">Custos diretos</th><th className="r">Margem</th><th className="r">Diárias bloqueadas</th><th className="r" title="diárias bloqueadas × ADR × ocupação do ano">Hotelaria perdida (est.)</th><th className="r">Hospedagem do buyout</th><th className="r">Incremental líquido</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.year} className="[&>td]:px-1 [&>td]:whitespace-nowrap">
                    <td className="font-semibold">{a.year}<span className="text-ink-3 font-normal"> · {a.opYear}</span></td>
                    <td className="r">{fmtNum(a.revWeddings / 1e3)}</td>
                    <td className="r">{fmtNum(a.costWeddings / 1e3)}</td>
                    <td className="r">{fmtPct(a.margin, 0)}</td>
                    <td className="r">{fmtNum(a.roomNightsBlocked)}</td>
                    <td className="r text-rust">{fmtNum(a.lost / 1e3)}</td>
                    <td className="r">{fmtNum(a.revWeddingLodging / 1e3)}</td>
                    <td className={`r font-semibold ${a.net < 0 ? 'text-rust' : 'text-green-3'}`}>{fmtNum(a.net / 1e3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3"><Note>Hotelaria perdida estimada = diárias bloqueadas × ADR do ano × ocupação do ano (o que essas diárias renderiam como hospedagem convencional). Incremental líquido compara só a hospedagem do buyout com essa perda; locação, catering e demais componentes são adicionais.</Note></div>
          </Panel>
        </div>
      </div>
      <Panel title="Pesos mensais" subtitle="Distribuição dos casamentos do ano entre os meses (pesos relativos; a soma é normalizada)" className="mt-5">
            <MonthTable firstCol="Peso">
              <MonthRow s={s} path="weddings.monthWeights" label="Peso do mês" digits={2} />
            </MonthTable>
          </Panel>
    </>
  );
}

/* ---------- UH bloqueadas: 'all' ou número ---------- */
function RoomsBlockedField() {
  const s = useActiveScenario();
  const update = useScenarios((st) => st.update);
  const v = s.weddings.roomsBlocked;
  const mode = v === 'all' ? 'all' : 'number';
  return (
    <>
      <label className="flex items-center justify-between gap-3 py-1.5 border-b border-sand-2">
        <span className="flex items-center gap-2 text-[13px] text-ink-2"><ProvDot entry={provFor(s, 'weddings.roomsBlocked')} path="weddings.roomsBlocked" />UH bloqueadas no buyout</span>
        <select className="w-40" value={mode} disabled={s.kind === 'excel'} onChange={(e) => update(s.id, 'weddings.roomsBlocked', e.target.value === 'all' ? 'all' : (s.hotel.phase1.rooms || 1))}>
          <option value="all">Hotel inteiro</option>
          <option value="number">Número fixo de UH</option>
        </select>
      </label>
      {mode === 'number' && <Field s={s} path="weddings.roomsBlocked" label="Quantidade de UH bloqueadas" kind="int" suffix="UH" />}
    </>
  );
}

/* ---------- benchmark Saline Taíba ---------- */
function BenchmarkPanel({ roomsBuyout }: { roomsBuyout: number }) {
  const s = useActiveScenario();
  const W = s.weddings;
  const rows: { label: string; ref: string; cur: string }[] = [
    { label: 'Acomodações', ref: '22 UH', cur: `${roomsBuyout} UH` },
    { label: 'Buyout por diária', ref: 'R$ 76.050', cur: fmtBRL(roomsBuyout * W.roomRate) },
    { label: 'Buyout 3 diárias', ref: 'R$ 228.150', cur: fmtBRL(roomsBuyout * W.roomRate * 3) },
    { label: 'Buyout 4 diárias', ref: 'R$ 304.200', cur: fmtBRL(roomsBuyout * W.roomRate * 4) },
    { label: 'Welcome / pré-wedding', ref: 'R$ 280 + 10%', cur: fmtBRL(W.welcomePartyPerGuest) },
    { label: 'Catering casamento', ref: 'R$ 440 + 10%', cur: `${fmtBRL(W.cateringPerGuest)} + ${fmtPct(W.serviceFeePct, 0)}` },
    { label: 'Bar (open bar)', ref: 'R$ 120–145 + 10%', cur: `${fmtBRL(W.beveragesPerGuest)} + ${fmtPct(W.serviceFeePct, 0)}` },
    { label: 'Cerveja', ref: 'R$ 38', cur: 'em bebidas' },
    { label: 'Locação pré-wedding', ref: 'R$ 15.000', cur: '—' },
    { label: 'Locação casamento', ref: 'R$ 25–30 mil', cur: fmtBRL(W.venueFee) },
    { label: 'Casa de apoio', ref: 'R$ 5.000', cur: '—' },
    { label: 'Casamentos / ano', ref: '≈ 17 (2027)', cur: `${fmtNum(W.countByYear[0])} → ${fmtNum(W.countByYear[W.countByYear.length - 1])}` },
    { label: 'Consultas / ano', ref: '200 – 250', cur: '—' },
    { label: 'Mínimo de diárias', ref: '3 – 4', cur: `${fmtNum(W.nights)}` },
  ];
  return (
    <Panel title="Referência de mercado" subtitle="Saline Taíba — proposta out/2026 para 2º sem. 2028">
      <table className="data text-[12px]">
        <thead><tr><th>Item</th><th className="r">Saline</th><th className="r">Este cenário</th></tr></thead>
        <tbody>{rows.map((x) => <tr key={x.label}><td className="text-ink-2 pr-2">{x.label}</td><td className="r text-ink-3 px-1">{x.ref}</td><td className="r text-ink pl-2">{x.cur}</td></tr>)}</tbody>
      </table>
      <div className="mt-3"><Note tone="warn">Valores de referência de um concorrente; não são reproduzidos automaticamente no cenário nem representam oferta aprovada.</Note></div>
    </Panel>
  );
}

/* ---------- simulador rápido ---------- */
function QuickSimulator() {
  const s = useActiveScenario();
  const base = useResults(s);
  const [fc, setFc] = useState(1);
  const [ft, setFt] = useState(1);
  const sim = useMemo(() => {
    if (fc === 1 && ft === 1) return base;
    const ov: { path: string; value?: unknown; factor?: number }[] = [{ path: 'weddings.countByYear', value: s.weddings.countByYear.map((n) => n * fc) }];
    for (const p of TICKET_PATHS) ov.push({ path: p, factor: ft });
    return compute(withOverrides(s, ov));
  }, [s, base, fc, ft]);
  const d = (a: number | null, b: number | null) => (a == null || b == null ? null : a - b);
  const dE = sim.metrics.ebitdaStabilized - base.metrics.ebitdaStabilized;
  const dI = d(sim.metrics.irrProject, base.metrics.irrProject);
  const tone = (v: number | null) => (v == null ? 'text-ink' : v < 0 ? 'text-rust' : v > 0 ? 'text-green-3' : 'text-ink');
  return (
    <Panel title="Simulador rápido" subtitle="Efeito de volume e ticket de casamentos sobre o resultado — não altera o cenário" actions={<button className="btn btn-ghost" onClick={() => { setFc(1); setFt(1); }}>Zerar</button>}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="flex items-center justify-between text-[13px] text-ink-2">Número de casamentos <span className="num text-ink">× {fc.toFixed(2)}</span></label>
          <input type="range" min={0.5} max={2} step={0.05} value={fc} onChange={(e) => setFc(parseFloat(e.target.value))} className="w-full" />
          <div className="text-[11px] text-ink-3">{s.weddings.countByYear.map((n) => fmtNum(n * fc, 1)).join(' · ')} por ano</div>
        </div>
        <div>
          <label className="flex items-center justify-between text-[13px] text-ink-2">Ticket (todos os componentes) <span className="num text-ink">× {ft.toFixed(2)}</span></label>
          <input type="range" min={0.7} max={1.3} step={0.05} value={ft} onChange={(e) => setFt(parseFloat(e.target.value))} className="w-full" />
          <div className="text-[11px] text-ink-3">catering {fmtBRL(s.weddings.cateringPerGuest * ft)} · buyout/UH {fmtBRL(s.weddings.roomRate * ft)}</div>
        </div>
      </div>
      <div className="ledger mt-4" style={{ gridTemplateColumns: 'repeat(4, minmax(0,1fr))' }}>
        <div><div className="text-[11px] font-semibold text-ink-3">EBITDA estabilizado</div><div className="num text-[22px] text-ink mt-1">{fmtM(sim.metrics.ebitdaStabilized)}</div><div className={`text-[11px] ${tone(dE)}`}>{dE >= 0 ? '+' : ''}{fmtM(dE, 2)} vs atual</div></div>
        <div><div className="text-[11px] font-semibold text-ink-3">TIR do projeto</div><div className="num text-[22px] text-ink mt-1">{fmtPct(sim.metrics.irrProject)}</div><div className={`text-[11px] ${tone(dI)}`}>{dI == null ? '—' : `${dI >= 0 ? '+' : ''}${(dI * 100).toFixed(2)} p.p. vs atual`}</div></div>
        <div><div className="text-[11px] font-semibold text-ink-3">Receita de casamentos</div><div className="num text-[22px] text-ink mt-1">{fmtM(sumOpYear(sim.monthly.revWeddings, sim.monthly.opYear, sim.metrics.stabilizedYear))}</div><div className="text-[11px] text-ink-3">ano estabilizado</div></div>
        <div><div className="text-[11px] font-semibold text-ink-3">DSCR mínimo</div><div className="num text-[22px] text-ink mt-1">{sim.metrics.dscrMin == null ? '—' : `${sim.metrics.dscrMin.toFixed(2)}×`}</div><div className="text-[11px] text-ink-3">atual {base.metrics.dscrMin == null ? '—' : `${base.metrics.dscrMin.toFixed(2)}×`}</div></div>
      </div>
    </Panel>
  );
}
