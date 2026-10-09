import { useMemo, useState } from 'react';
import { ComposedChart, LineChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PageHeader, Ledger, Panel, Field, SelectField, ToggleField, MonthRow, GridEditor, Note, Tabs, ProvDot, provFor, CHART_COLORS as C, chartAxis, chartTooltipStyle, tipFmt } from '../components/ui';
import { MonthTable, VectorRow, sumOpYear } from '../components/editors';
import { useActiveScenario, useScenarios } from '../store/scenarios';
import { useResults, useCompareResults } from '../lib/useResults';
import { occupancyGrid } from '../engine/scenarios';
import { fmtM, fmtPct, fmtNum, fmtBRL, MONTHS_PT } from '../lib/format';
import type { RoomCategory, Scenario } from '../engine/types';
import type { PageKey } from '../App';

const YEAR_LABELS = ['Ano 2', 'Ano 3', 'Ano 4', 'Ano 5', 'Ano 6'];
const OP_COLORS = [C.gold2, C.fnb, C.ocean3, C.debt, C.equity, C.hotel];
/** Perfis de sazonalidade para o assistente de ramp-up (pesos relativos; a média anual informada é preservada). */
const SEASONS: Record<string, { label: string; weights: number[] | null }> = {
  nordeste: { label: 'Nordeste (alta jul–ago e dez–jan)', weights: [1.15, 0.95, 0.75, 0.70, 0.75, 0.90, 1.20, 1.15, 1.00, 1.05, 1.10, 1.30] },
  flat: { label: 'Uniforme (sem sazonalidade)', weights: Array(12).fill(1) },
  current: { label: 'Mesma sazonalidade do ano 1 atual', weights: null },
};

export default function Hotel({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const m = r.metrics;
  const M = r.monthly;
  const stabY = m.stabilizedYear;
  const years = useMemo(() => r.annual.filter((a) => a.opYear > 0), [r]);
  const compare = useCompareResults();
  const [tab, setTab] = useState<'occN' | 'occS' | 'days' | 'rates'>('occN');

  const occupiedStab = sumOpYear(M.roomsOccupied, M.opYear, stabY);
  const blockedStab = sumOpYear(M.roomNightsBlocked, M.opYear, stabY);

  /* ocupação efetiva mensal por ano de operação (1..6) */
  const seasonData = useMemo(() => {
    const maxY = Math.min(6, Math.max(0, ...M.opYear));
    return MONTHS_PT.map((mes, mi) => {
      const row: Record<string, number | string | null> = { mes };
      for (let y = 1; y <= maxY; y++) {
        let occ = 0, av = 0;
        for (let i = 0; i < M.months.length; i++) if (M.opYear[i] === y && Number(M.months[i].slice(5)) - 1 === mi) { occ += M.roomsOccupied[i]; av += M.roomsAvailable[i]; }
        row[`Ano ${y}`] = av > 0 ? occ / av : null;
      }
      return row;
    });
  }, [M]);
  const opYears = useMemo(() => Array.from({ length: Math.min(6, Math.max(0, ...M.opYear)) }, (_, i) => `Ano ${i + 1}`), [M]);
  const adrData = years.map((a) => ({ ano: a.year, ADR: a.adr, RevPAR: a.revpar, Ocupação: a.occupancy }));
  const distData = years.map((a) => ({ ano: a.year, Direta: (a.revHotelNormal + a.revHotelSpecial) / 1e6, Intermediada: a.revHotelOTA / 1e6, 'Comissões': a.otaCommission / 1e6 }));


  return (
    <>
      <PageHeader title="Operação Hoteleira" subtitle={`Capacidade, ocupação, tarifas e distribuição do cenário "${s.name}". Indicadores da faixa referem-se ao ano ${stabY} de operação (estabilizado); diárias líquidas do bloqueio por buyout de casamentos.`} actions={<button className="btn" onClick={() => go('weddings')}>Ver buyouts de casamento</button>} />
      <Ledger items={[
        { label: 'Ocupação', value: fmtPct(m.occupancyStabilized, 1), hint: 'diárias ocupadas / disponíveis', traceId: 'roomsOccupied' },
        { label: 'ADR', value: fmtBRL(m.adrStabilized), hint: 'diária média convencional', traceId: 'revHotel' },
        { label: 'RevPAR', value: fmtBRL(m.revparStabilized), hint: 'receita de hospedagem / diária disponível', traceId: 'revHotel' },
        { label: 'TRevPAR', value: fmtBRL(m.trevparStabilized), hint: 'receita total / diária disponível' },
        { label: 'Receita por hóspede', value: fmtBRL(m.revenuePerGuestStabilized), hint: `permanência média ${fmtNum(s.hotel.averageStayNights, 1)} noites` },
        { label: 'Diárias ocupadas / ano', value: fmtNum(occupiedStab), hint: `${fmtNum(blockedStab)} bloqueadas por buyout`, traceId: 'roomsOccupied' },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6">
        {/* ------------------------- premissas ------------------------- */}
        <div className="space-y-5">
          <Panel title="Fases do empreendimento" subtitle="Obra, inauguração e capacidade">
            {(['phase1', 'phase2'] as const).map((p) => (
              <div key={p} className={p === 'phase2' ? 'mt-4 pt-3 rule' : ''}>
                <div className="text-[12px] font-semibold text-ink-3 mb-1">{s.hotel[p].label} · {p === 'phase1' ? 'núcleo do projeto' : 'expansão opcional'}</div>
                {p === 'phase2' && <ToggleField s={s} path="hotel.phase2.enabled" label="Fase 02 habilitada" />}
                <Field s={s} path={`hotel.${p}.constructionStart`} label="Início da obra" kind="ym" hint="AAAA-MM" />
                <Field s={s} path={`hotel.${p}.constructionMonths`} label="Duração da obra" kind="int" suffix="meses" />
                <Field s={s} path={`hotel.${p}.openingLagMonths`} label="Prazo até inaugurar" kind="int" suffix="meses" />
                <Field s={s} path={`hotel.${p}.rooms`} label="UH (se sem tipologia)" kind="int" suffix="UH" disabled={s.hotel[p].categories.length > 0} />
                {p === 'phase2' && <SelectField s={s} path="hotel.phase2.rateCalendar" label="Calendário tarifário" options={[{ value: 'phase1', label: 'Segue a Fase 01 (Excel)' }, { value: 'own', label: 'Ramp-up próprio' }]} />}
              </div>
            ))}
          </Panel>

          <Panel title="Tipologia das UH" subtitle="Categorias, capacidade e índice tarifário por fase">
            <CategoriesEditor s={s} phase="phase1" />
            <div className="mt-4 pt-3 rule"><CategoriesEditor s={s} phase="phase2" /></div>
            <div className="mt-3"><Note>Índice tarifário 1,00 = diária-base. Sem categorias, a fase usa o número de UH informado e o índice 1,00.</Note></div>
          </Panel>

          <Panel title="Tarifas" subtitle="Crescimento da diária-base (nominal)">
            <VectorRow s={s} path="hotel.rateGrowth" label="Crescimento dias normais" labels={YEAR_LABELS} kind="pct" />
            <VectorRow s={s} path="hotel.rateSpecialGrowth" label="Crescimento dias especiais" labels={YEAR_LABELS} kind="pct" />
            <Field s={s} path="hotel.rateLongTermGrowth" label="Cresc. após ano 6 (normais)" kind="pct" />
            <Field s={s} path="hotel.rateSpecialLongTermGrowth" label="Cresc. após ano 6 (especiais)" kind="pct" />
            <SelectField s={s} path="hotel.rateLongTermMode" label="Fator de longo prazo" options={[{ value: 'correct', label: 'Corrigido (só após o ano 6)' }, { value: 'excel', label: 'Excel (reproduz o erro)' }]} />
            <div className="mt-3"><Note>O Excel aplica (1+g)^(ano−6) em todos os anos, o que deflaciona a diária nos anos 1–5 (ex.: ano 1 × (1+g)^−5). O modo corrigido só aplica o crescimento após o 6º ano.</Note></div>
          </Panel>

          <Panel title="Distribuição e custo variável" subtitle="Intermediação (OTAs/agências) e custo por diária ocupada">
            <Field s={s} path="hotel.otaCommission" label="Comissão s/ receita intermediada" kind="pct" />
            <Field s={s} path="hotel.variableCostPerRoomNight" label="Custo variável / diária ocupada" kind="money" step={5} />
            <Field s={s} path="hotel.averageStayNights" label="Permanência média" kind="number" step={0.5} suffix="noites" />
            <div className="mt-2 text-[12px] text-ink-3">Participação mensal da receita intermediada e hóspedes por UH: ver "Premissas mensais" abaixo.</div>
          </Panel>

          <RampUpHelper s={s} />
        </div>

        {/* ------------------------- resultados ------------------------- */}
        <div className="xl:col-span-2 space-y-5">
          <Panel title="Comparativo entre cenários" subtitle="Indicadores do ano estabilizado de cada cenário em comparação">
            <table className="data">
              <thead><tr><th>Cenário</th><th className="r">Ano estab.</th><th className="r">Ocupação</th><th className="r">ADR</th><th className="r">RevPAR</th><th className="r">TRevPAR</th><th className="r">Receita hospedagem</th></tr></thead>
              <tbody>
                {compare.map(({ scenario: cs, results: cr }) => (
                  <tr key={cs.id} className={cs.id === s.id ? 'font-semibold text-ink' : ''}>
                    <td>{cs.name}{cs.id === s.id && <span className="text-ink-3 font-normal"> · ativo</span>}</td>
                    <td className="r">{cr.metrics.stabilizedYear}</td>
                    <td className="r">{fmtPct(cr.metrics.occupancyStabilized, 1)}</td>
                    <td className="r">{fmtBRL(cr.metrics.adrStabilized)}</td>
                    <td className="r">{fmtBRL(cr.metrics.revparStabilized)}</td>
                    <td className="r">{fmtBRL(cr.metrics.trevparStabilized)}</td>
                    <td className="r">{fmtM(sumOpYear(cr.monthly.revHotel, cr.monthly.opYear, cr.metrics.stabilizedYear))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {compare.length === 0 && <div className="text-[13px] text-ink-3">Nenhum cenário selecionado para comparação (defina em Scenario Lab).</div>}
          </Panel>

          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
            <Panel title="Ocupação efetiva mensal por ano de operação" subtitle="Diárias ocupadas / disponíveis (anos 1–6), já líquida dos buyouts">
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={seasonData} margin={{ left: 0, right: 10, top: 10 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="mes" {...chartAxis} />
                  <YAxis {...chartAxis} width={40} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
                  <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => fmtPct(v, 1))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {opYears.map((k, i) => <Line key={k} dataKey={k} stroke={OP_COLORS[i]} strokeWidth={i === opYears.length - 1 ? 2.5 : 1.5} dot={false} connectNulls />)}
                </LineChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="ADR e RevPAR por ano" subtitle="R$ por diária (nominal) e ocupação efetiva">
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={adrData} margin={{ left: 0, right: 10, top: 10 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="ano" {...chartAxis} />
                  <YAxis yAxisId="l" {...chartAxis} width={48} tickFormatter={(v) => fmtNum(v)} />
                  <YAxis yAxisId="r" orientation="right" {...chartAxis} width={40} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
                  <Tooltip {...chartTooltipStyle} formatter={tipFmt((v, n) => (n === 'Ocupação' ? fmtPct(v, 1) : fmtBRL(v)))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="l" dataKey="ADR" fill={C.sand} stroke={C.hotel} strokeWidth={0.5} />
                  <Bar yAxisId="l" dataKey="RevPAR" fill={C.hotel} />
                  <Line yAxisId="r" dataKey="Ocupação" stroke={C.ocean3} strokeWidth={1.5} strokeDasharray="4 3" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <Panel title="Receita de hospedagem: direta × intermediada" subtitle="R$ milhões por ano calendário; comissões de distribuição em linha">
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={distData} margin={{ left: 0, right: 10, top: 10 }}>
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="ano" {...chartAxis} />
                <YAxis {...chartAxis} width={40} />
                <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(2)} M`)} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Direta" stackId="a" fill={C.hotel} />
                <Bar dataKey="Intermediada" stackId="a" fill={C.ocean3} />
                <Line dataKey="Comissões" stroke={C.neg} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
            <Note>Receita direta = diárias normais vendidas sem intermediação + dias especiais. Intermediada = parcela das diárias normais via OTAs/agências (comissão {fmtPct(s.hotel.otaCommission, 0)}).</Note>
          </Panel>

          <Panel title="Demonstrativo anual da hotelaria" subtitle="Diárias e receita por ano calendário; a diária disponível já exclui o bloqueio por buyout">
            <div className="overflow-x-auto">
              <table className="data text-[12px]">
                <thead><tr className="[&>th]:px-1.5"><th>Ano</th><th className="r">Diárias disp.</th><th className="r">Bloq. buyout</th><th className="r">Ocupadas</th><th className="r">Ocupação</th><th className="r">ADR</th><th className="r">RevPAR</th><th className="r">Receita hospedagem</th><th className="r">Comissões</th><th className="r">Custo variável</th></tr></thead>
                <tbody>
                  {years.map((a) => (
                    <tr key={a.year} className="[&>td]:px-1.5 [&>td]:whitespace-nowrap">
                      <td className="font-semibold">{a.year}<span className="text-ink-3 font-normal"> · op. {a.opYear}</span></td>
                      <td className="r">{fmtNum(a.roomsAvailable)}</td>
                      <td className="r">{fmtNum(a.roomNightsBlocked)}</td>
                      <td className="r">{fmtNum(a.roomsOccupied)}</td>
                      <td className="r">{fmtPct(a.occupancy, 1)}</td>
                      <td className="r">{fmtBRL(a.adr)}</td>
                      <td className="r">{fmtBRL(a.revpar)}</td>
                      <td className="r font-semibold text-ink">{fmtM(a.revHotel)}</td>
                      <td className="r">{fmtM(a.otaCommission, 2)}</td>
                      <td className="r">{fmtM(a.hotelVariableCost, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </div>

      {/* ------------------------- premissas mensais ------------------------- */}
      <Panel title="Premissas mensais" subtitle="Grades ano × mês (ano 1–6 de operação; após o 6º repete o último) e vetores mensais" className="mt-5">
        <Tabs value={tab} onChange={setTab} items={[{ value: 'occN', label: 'Ocupação dias normais' }, { value: 'occS', label: 'Ocupação dias especiais' }, { value: 'days', label: 'Dias normais por mês' }, { value: 'rates', label: 'Diárias, distribuição e hóspedes' }]} />
        {tab === 'occN' && <GridEditor s={s} path="hotel.occupancyNormal" label="Taxa de ocupação em dias normais (%)" kind="pct" />}
        {tab === 'occS' && <GridEditor s={s} path="hotel.occupancySpecial" label="Taxa de ocupação em dias especiais (%) — feriados e datas de alta demanda" kind="pct" />}
        {tab === 'days' && (
          <>
            <GridEditor s={s} path="hotel.daysNormal" label="Dias normais por mês (dias especiais = dias do mês − normais)" kind="number" />
          </>
        )}
        {tab === 'rates' && (
          <MonthTable>
            <MonthRow s={s} path="hotel.rateNormalYear1" label="Diária-base dias normais, ano 1 (R$)" />
            <MonthRow s={s} path="hotel.rateSpecialYear1" label="Diária-base dias especiais, ano 1 (R$)" />
            <MonthRow s={s} path="hotel.shareOTA" label="Receita intermediada (%)" kind="pct" />
            <MonthRow s={s} path="hotel.guestsPerRoom" label="Hóspedes por UH ocupada" digits={2} />
          </MonthTable>
        )}
        {tab === 'rates' && s.hotel.phase1.categories.length > 0 && <div className="mt-3"><Note>Com tipologia definida, o número de hóspedes por UH é calculado pela capacidade média das categorias; o vetor acima só é usado quando a fase não tem categorias.</Note></div>}
      </Panel>
    </>
  );
}

/* ---------- editor de tipologia ---------- */
function CategoriesEditor({ s, phase }: { s: Scenario; phase: 'phase1' | 'phase2' }) {
  const update = useScenarios((st) => st.update);
  const path = `hotel.${phase}.categories`;
  const cats = s.hotel[phase].categories;
  const locked = s.kind === 'excel';
  const total = cats.reduce((a, c) => a + c.count, 0);
  const idx = total ? cats.reduce((a, c) => a + c.count * c.rateIndex, 0) / total : 1;
  const guests = total ? cats.reduce((a, c) => a + c.count * c.guests, 0) / total : null;
  const commit = (next: RoomCategory[]) => update(s.id, path, next);
  const setRow = (i: number, k: keyof RoomCategory, val: string) => {
    const next = cats.map((c) => ({ ...c }));
    if (k === 'name') next[i].name = val;
    else { const n = parseFloat(val.replace(',', '.')); if (Number.isNaN(n)) return; next[i][k] = n; }
    commit(next);
  };
  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="flex items-center gap-2 text-[13px] text-ink-2"><ProvDot entry={provFor(s, path)} path={path} />{s.hotel[phase].label}</span>
        {!locked && <button className="btn btn-ghost text-[12px] py-0.5" onClick={() => commit([...cats, { name: 'Nova categoria', count: 1, guests: 2, rateIndex: 1 }])}>+ categoria</button>}
      </div>
      {cats.length > 0 ? (
        <table className="data text-[12px]">
          <thead><tr><th>Categoria</th><th className="r">UH</th><th className="r">Hósp.</th><th className="r">Índice</th><th /></tr></thead>
          <tbody>
            {cats.map((c, i) => (
              <tr key={i}>
                <td className="pr-1"><input type="text" className="w-full min-w-[90px] text-[12px] px-1" disabled={locked} defaultValue={c.name} key={`n-${i}-${c.name}`} onBlur={(e) => setRow(i, 'name', e.target.value)} /></td>
                <td className="r px-0.5"><input type="number" className="w-[44px] text-[12px] px-1" disabled={locked} defaultValue={c.count} key={`c-${i}-${c.count}`} onBlur={(e) => setRow(i, 'count', e.target.value)} /></td>
                <td className="r px-0.5"><input type="number" className="w-[44px] text-[12px] px-1" disabled={locked} defaultValue={c.guests} key={`g-${i}-${c.guests}`} onBlur={(e) => setRow(i, 'guests', e.target.value)} /></td>
                <td className="r px-0.5"><input type="number" className="w-[62px] text-[12px] px-1" step={0.05} disabled={locked} defaultValue={c.rateIndex} key={`r-${i}-${c.rateIndex}`} onBlur={(e) => setRow(i, 'rateIndex', e.target.value)} /></td>
                <td className="r">{!locked && <button className="text-ink-3 hover:text-rust text-[12px]" title="Remover" onClick={() => commit(cats.filter((_, j) => j !== i))}>×</button>}</td>
              </tr>
            ))}
            <tr className="font-semibold text-ink"><td>Total / média</td><td className="r">{total}</td><td className="r">{guests == null ? '—' : fmtNum(guests, 2)}</td><td className="r">{fmtNum(idx, 3)}</td><td /></tr>
          </tbody>
        </table>
      ) : (
        <div className="text-[12px] text-ink-3">Sem tipologia: usa {s.hotel[phase].rooms} UH com índice tarifário 1,00.</div>
      )}
    </div>
  );
}

/* ---------- assistente de ramp-up ---------- */
function RampUpHelper({ s }: { s: Scenario }) {
  const update = useScenarios((st) => st.update);
  const grid = s.hotel.occupancyNormal;
  const avgOf = (row: number[]) => row.reduce((a, b) => a + b, 0) / row.length;
  const [annual, setAnnual] = useState<number[]>(() => Array.from({ length: 6 }, (_, y) => Math.round(avgOf(grid[Math.min(y, grid.length - 1)] ?? [0]) * 1000) / 10));
  const [season, setSeason] = useState<string>('nordeste');
  const locked = s.kind === 'excel';
  const apply = () => {
    const w = SEASONS[season].weights ?? grid[0].map((v) => v || 0.01);
    update(s.id, 'hotel.occupancyNormal', occupancyGrid(annual.map((v) => v / 100), w), { note: `Ramp-up aplicado pelo assistente (${SEASONS[season].label})` });
  };
  return (
    <Panel title="Ramp-up rápido" subtitle="Gera a grade de ocupação normal a partir de médias anuais e um perfil de sazonalidade">
      <div className="grid grid-cols-6 gap-1 mb-1">
        {annual.map((v, i) => (
          <label key={i} className="flex flex-col items-stretch gap-0.5 min-w-0">
            <span className="text-[10px] text-ink-3 text-center">Ano {i + 1}</span>
            <input type="number" className="w-full min-w-0 text-[12px] px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" value={v} step={1} min={0} max={98} disabled={locked} onChange={(e) => { const n = annual.slice(); n[i] = parseFloat(e.target.value) || 0; setAnnual(n); }} />
          </label>
        ))}
        </div>
      <div className="text-[11px] text-ink-3 mb-3">% de ocupação média anual (dias normais)</div>
      <label className="flex items-center justify-between gap-3 py-1.5 text-[13px] text-ink-2">Sazonalidade
        <select value={season} onChange={(e) => setSeason(e.target.value)} className="w-48" disabled={locked}>
          {Object.entries(SEASONS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </label>
      <div className="flex items-center justify-between mt-2">
        <span className="text-[12px] text-ink-3 leading-snug">Atual: {grid.map((row) => fmtPct(avgOf(row), 0)).join(' · ')}</span>
        <button className="btn btn-primary whitespace-nowrap shrink-0" disabled={locked} onClick={apply}>Aplicar ramp-up</button>
      </div>
      <div className="mt-3"><Note>Sobrescreve a grade "Ocupação dias normais" (limite 98% por mês). A ocupação de dias especiais não é alterada.</Note></div>
    </Panel>
  );
}
