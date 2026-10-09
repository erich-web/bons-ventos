import { useMemo, useState } from 'react';
import { BarChart, AreaChart, Area, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PageHeader, Ledger, Panel, Field, SelectField, ToggleField, MonthRow, GridEditor, Note, ProvDot, provFor, CHART_COLORS as C, chartAxis, chartTooltipStyle, tipFmt } from '../components/ui';
import { MonthTable, VectorRow, CellInput, sumOpYear } from '../components/editors';
import { useActiveScenario, useScenarios } from '../store/scenarios';
import { useResults } from '../lib/useResults';
import { fmtM, fmtK, fmtPct, fmtNum, fmtBRL } from '../lib/format';
import type { StaffPosition } from '../engine/types';
import type { PageKey } from '../App';

const YEAR_LABELS = ['Ano 2', 'Ano 3', 'Ano 4', 'Ano 5', 'Ano 6'];
const YEARS6 = ['Ano 1', 'Ano 2', 'Ano 3', 'Ano 4', 'Ano 5', 'Ano 6'];

export default function Gastronomy({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const M = r.monthly;
  const m = r.metrics;
  const stabY = m.stabilizedYear;
  const years = useMemo(() => r.annual.filter((a) => a.opYear > 0), [r]);
  const stab = (k: keyof typeof M) => sumOpYear(M[k] as number[], M.opYear, stabY);
  const revFnb = stab('revFnb'), revRest = stab('revRestaurant') + stab('revLegacyEvents'), revGuests = stab('revFnbGuests'), revBeach = stab('revBeachClub') + stab('revExperiences');
  const costFnb = stab('costFnb'), payFnb = stab('payrollFnb');
  const seatsAvg = s.restaurant.seats.reduce((a, b) => a + b, 0) / 12;

  const revData = years.map((a) => ({ ano: a.year, Restaurante: a.revRestaurant / 1e6, 'Eventos legados': a.revLegacyEvents / 1e6, 'A&B hóspedes': a.revFnbGuests / 1e6, 'Beach club': a.revBeachClub / 1e6, Experiências: a.revExperiences / 1e6 }));
  const costData = years.map((a) => { const d = a.revFnb || 1; return { ano: a.year, Impostos: a.fnbTaxes / d, CMV: a.fnbCmv / d, 'CMO variável': a.fnbCmo / d, 'Folha A&B': a.payrollFnb / d, Outros: a.fnbOther / d }; });

  /* buyout e fechamento por ano calendário */
  const buyout = useMemo(() => {
    const W = s.weddings;
    const map = new Map<number, { days: number; lost: number; wedFnb: number; openDays: number }>();
    for (let i = 0; i < M.months.length; i++) {
      if (M.opYear[i] <= 0) continue;
      const y = Number(M.months[i].slice(0, 4));
      const e = map.get(y) ?? { days: 0, lost: 0, wedFnb: 0, openDays: 0 };
      const dim = M.daysInMonth[i];
      const bd = W.enabled ? Math.min(dim, W.nights * M.weddingsCount[i]) : 0;
      const open = W.closeRestaurantDuringBuyout ? Math.max(1, dim - bd) : dim;
      e.days += bd; e.openDays += open;
      e.lost += (M.revRestaurant[i] / open) * bd;
      e.wedFnb += M.revWeddingCatering[i] + M.revWeddingBeverages[i] + M.revWeddingWelcome[i] + M.revWeddingPool[i] + M.revWeddingExtra[i];
      map.set(y, e);
    }
    return years.map((a) => ({ year: a.year, opYear: a.opYear, ...(map.get(a.year) ?? { days: 0, lost: 0, wedFnb: 0, openDays: 0 }) }));
  }, [M, s.weddings, years]);

  return (
    <>
      <PageHeader title="Gastronomia & Beach Club" subtitle={`Restaurante, consumo de hóspedes, beach club e experiências no cenário "${s.name}". Indicadores do ano ${stabY} de operação; margem de contribuição após impostos, CMV, CMO e folha de A&B.`} actions={<button className="btn" onClick={() => go('weddings')}>Ver buyouts de casamento</button>} />
      <Ledger items={[
        { label: 'Receita A&B total', value: fmtM(revFnb), hint: 'exclui catering de casamentos', traceId: 'revFnb' },
        { label: 'Restaurante', value: fmtM(revRest), hint: `${fmtNum(seatsAvg)} lugares em média` },
        { label: 'A&B hóspedes', value: fmtM(revGuests), hint: s.restaurant.guestsTicketBasis === 'guestNight' ? 'ticket por hóspede-noite' : 'ticket por diária ocupada' },
        { label: 'Beach club + experiências', value: fmtM(revBeach), hint: s.beachClub.enabled ? `desde o ano ${s.beachClub.startYear}` : 'beach club desligado', tone: s.beachClub.enabled ? 'default' : 'muted' },
        { label: 'Margem de contribuição', value: fmtPct(revFnb ? (revFnb - costFnb - payFnb) / revFnb : 0, 1), hint: `custos ${fmtM(costFnb)} + folha ${fmtM(payFnb)}`, traceId: 'costFnb' },
        { label: 'Receita por lugar', value: fmtK(seatsAvg ? revRest / seatsAvg : 0), hint: 'restaurante / lugar / ano' },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6">
        {/* ------------------------- premissas ------------------------- */}
        <div className="space-y-5">
          <Panel title="Restaurante" subtitle="Ticket, crescimento e estrutura de custos diretos">
            <VectorRow s={s} path="restaurant.ticketGrowth" label="Crescimento do ticket" labels={YEAR_LABELS} kind="pct" />
            <Field s={s} path="restaurant.ticketLongTermGrowth" label="Cresc. após o ano 6" kind="pct" />
            <SelectField s={s} path="restaurant.guestsTicketBasis" label="Base do A&B de hóspedes" options={[{ value: 'guestNight', label: 'Por hóspede-noite' }, { value: 'roomNight', label: 'Por diária ocupada (Excel)' }]} />
            <VectorRow s={s} path="restaurant.guestsTicketGrowth" label="Crescimento do ticket de hóspedes" labels={YEAR_LABELS} kind="pct" />
            <Field s={s} path="restaurant.taxPct" label="Impostos s/ receita A&B" kind="pct" />
            <Field s={s} path="restaurant.cmvPct" label="CMV" kind="pct" />
            <Field s={s} path="restaurant.cmoVarPct" label="CMO variável" kind="pct" />
            <Field s={s} path="restaurant.cmoFixedMonthly" label="CMO fixo mensal" kind="money" step={5000} />
            <Field s={s} path="restaurant.otherDirectPct" label="Outros custos diretos" kind="pct" />
            <div className="mt-3"><Note>Lugares, giro e tickets mensais ficam em "Premissas mensais" abaixo. Com CMO fixo zerado, a mão de obra de A&B vem da folha por cargo (evita dupla contagem).</Note></div>
          </Panel>

          <Panel title="Beach club e experiências" subtitle="Visitantes externos (day-use) e atividades especiais">
            <ToggleField s={s} path="beachClub.enabled" label="Beach club ativo" />
            <Field s={s} path="beachClub.startYear" label="Ano de operação inicial" kind="int" />
            <VectorRow s={s} path="beachClub.rampByYear" label="Ramp-up de visitantes (multiplicador)" labels={YEARS6} />
            <Field s={s} path="beachClub.ticket" label="Ticket médio (day-use + A&B)" kind="money" step={10} />
            <Field s={s} path="beachClub.dayUseFee" label="Taxa de day-use (no ticket)" kind="money" step={10} />
            <Field s={s} path="beachClub.priceGrowth" label="Cresc. anual de preços" kind="pct" />
            <Field s={s} path="beachClub.cmvPct" label="CMV" kind="pct" />
            <Field s={s} path="beachClub.cmoPct" label="CMO" kind="pct" />
            <Field s={s} path="beachClub.otherDirectPct" label="Outros custos diretos" kind="pct" />
            <Field s={s} path="beachClub.taxPct" label="Impostos s/ receita" kind="pct" />
            <Field s={s} path="beachClub.experiencesRevenueMonthly" label="Experiências / mês (ano 1)" kind="money" step={1000} />
            <Field s={s} path="beachClub.experiencesMarginPct" label="Margem de experiências" kind="pct" />
          </Panel>

          <Panel title="Fechamento durante buyouts" subtitle="Premissas do módulo de casamentos (editáveis aqui também)">
            <ToggleField s={s} path="weddings.closeRestaurantDuringBuyout" label="Fechar restaurante durante o buyout" />
            <ToggleField s={s} path="weddings.closeBeachClubDuringBuyout" label="Fechar beach club durante o buyout" />
            <div className="mt-3"><Note>Com o fechamento ativo, os dias de buyout são retirados dos dias abertos do restaurante e do beach club; a receita de A&B dos eventos é contabilizada no módulo de casamentos.</Note></div>
          </Panel>
        </div>

        {/* ------------------------- resultados ------------------------- */}
        <div className="xl:col-span-2 space-y-5">
          <div className="grid grid-cols-1 2xl:grid-cols-2 gap-5">
            <Panel title="Receita de A&B por linha" subtitle="R$ milhões por ano calendário">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={revData} margin={{ left: 0, right: 10, top: 10 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="ano" {...chartAxis} />
                  <YAxis {...chartAxis} width={40} />
                  <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(2)} M`)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Restaurante" stackId="a" fill={C.fnb} />
                  <Bar dataKey="Eventos legados" stackId="a" fill={C.cost} />
                  <Bar dataKey="A&B hóspedes" stackId="a" fill={C.gold2} />
                  <Bar dataKey="Beach club" stackId="a" fill={C.ocean3} />
                  <Bar dataKey="Experiências" stackId="a" fill={C.equity} />
                </BarChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Estrutura de custos de A&B" subtitle="% da receita de A&B por ano (inclui folha de A&B)">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={costData} margin={{ left: 0, right: 10, top: 10 }}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="ano" {...chartAxis} />
                  <YAxis {...chartAxis} width={40} tickFormatter={(v) => `${Math.round(v * 100)}%`} domain={[0, 1]} />
                  <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => fmtPct(v, 1))} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area dataKey="Impostos" stackId="a" stroke={C.cost} fill={C.cost} />
                  <Area dataKey="CMV" stackId="a" stroke={C.fnb} fill={C.fnb} />
                  <Area dataKey="CMO variável" stackId="a" stroke={C.gold2} fill={C.gold2} />
                  <Area dataKey="Folha A&B" stackId="a" stroke={C.neg} fill={C.neg} />
                  <Area dataKey="Outros" stackId="a" stroke={C.ocean3} fill={C.ocean3} />
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <Panel title="Demonstrativo anual de A&B" subtitle="R$ mil por ano calendário; CMO total = CMO variável/fixo + folha de A&B">
            <div className="overflow-x-auto">
              <table className="data text-[12px]">
                <thead>
                  <tr className="[&>th]:px-1">
                    <th>Ano</th><th className="r">Restaur.</th><th className="r" title="Eventos legados do Excel">Ev. leg.</th><th className="r">Hóspedes</th><th className="r">Beach club</th><th className="r">Experiên.</th>
                    <th className="r">Receita</th><th className="r">Impostos</th><th className="r">CMV</th><th className="r" title="CMO variável/fixo + folha de A&B">CMO+folha</th><th className="r">Outros</th><th className="r">Resultado</th><th className="r">Margem</th>
                  </tr>
                </thead>
                <tbody>
                  {years.map((a) => {
                    const res = a.revFnb - a.costFnb - a.payrollFnb;
                    return (
                      <tr key={a.year} className="[&>td]:px-1 [&>td]:whitespace-nowrap">
                        <td className="font-semibold">{a.year}<span className="text-ink-3 font-normal"> · {a.opYear}</span></td>
                        <td className="r">{fmtNum(a.revRestaurant / 1e3)}</td>
                        <td className="r">{fmtNum(a.revLegacyEvents / 1e3)}</td>
                        <td className="r">{fmtNum(a.revFnbGuests / 1e3)}</td>
                        <td className="r">{fmtNum(a.revBeachClub / 1e3)}</td>
                        <td className="r">{fmtNum(a.revExperiences / 1e3)}</td>
                        <td className="r font-semibold text-ink">{fmtNum(a.revFnb / 1e3)}</td>
                        <td className="r">{fmtNum(a.fnbTaxes / 1e3)}</td>
                        <td className="r">{fmtNum(a.fnbCmv / 1e3)}</td>
                        <td className="r">{fmtNum((a.fnbCmo + a.payrollFnb) / 1e3)}</td>
                        <td className="r">{fmtNum(a.fnbOther / 1e3)}</td>
                        <td className={`r font-semibold ${res < 0 ? 'text-rust' : 'text-ink'}`}>{fmtNum(res / 1e3)}</td>
                        <td className="r">{fmtPct(a.revFnb ? res / a.revFnb : 0, 0)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3"><Note>Os impostos de A&B incluem a tributação sobre catering e bebidas de casamentos (receita registrada no módulo de casamentos), o que reduz levemente a margem mostrada aqui.</Note></div>
          </Panel>

          <Panel title="Buyout e fechamento" subtitle="Dias de buyout por ano, receita ordinária deslocada e receita incremental de A&B dos eventos">
            <table className="data text-[12px]">
              <thead><tr><th>Ano</th><th className="r">Dias de buyout</th><th className="r">Dias abertos</th><th className="r">Receita ordinária deslocada (est.)</th><th className="r">A&B de eventos</th><th className="r">Incremental líquido</th></tr></thead>
              <tbody>
                {buyout.map((b) => (
                  <tr key={b.year}>
                    <td className="font-semibold whitespace-nowrap">{b.year}<span className="text-ink-3 font-normal"> · op. {b.opYear}</span></td>
                    <td className="r">{fmtNum(b.days, 1)}</td>
                    <td className="r">{fmtNum(b.openDays)}</td>
                    <td className="r text-rust">{fmtK(b.lost)}</td>
                    <td className="r">{fmtK(b.wedFnb)}</td>
                    <td className={`r font-semibold ${b.wedFnb - b.lost < 0 ? 'text-rust' : 'text-green-3'}`}>{fmtK(b.wedFnb - b.lost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3"><Note>Dias de buyout = Σ mínimo(dias do mês, diárias × casamentos no mês). Receita deslocada = receita diária média do restaurante × dias de buyout{s.weddings.closeRestaurantDuringBuyout ? '' : ' (restaurante segue aberto no cenário; valor apenas indicativo)'}. A&B de eventos = catering + bebidas + welcome + pool party + consumo extra.</Note></div>
          </Panel>
        </div>
      </div>

      <Panel title="Premissas mensais" subtitle="Vetores mensais do restaurante e do beach club (ano 1; crescimentos acima)" className="mt-5">
        <MonthTable>
          <MonthRow s={s} path="restaurant.seats" label="Lugares no restaurante" />
          <MonthRow s={s} path="restaurant.turnover" label="Giro médio diário" digits={2} />
          <MonthRow s={s} path="restaurant.ticketYear1" label="Ticket médio restaurante, ano 1 (R$)" />
          <MonthRow s={s} path="restaurant.guestsTicketYear1" label="Ticket A&B hóspedes, ano 1 (R$)" />
          <MonthRow s={s} path="restaurant.legacyEvents.perMonth" label="Eventos genéricos do Excel (por mês)" />
          <MonthRow s={s} path="beachClub.visitorsPerDay" label="Visitantes externos por dia (beach club)" />
        </MonthTable>
        <div className="mt-3"><Note>"Eventos genéricos do Excel" são as festas do modelo original (pax e ticket próprios); no cenário Base estão zerados, substituídos pelo módulo de casamentos. Lugares: cada fase usa a fração definida em seatShare.</Note></div>
      </Panel>

      <PayrollFnb />
    </>
  );
}

/* ---------- folha de A&B ---------- */
function PayrollFnb() {
  const s = useActiveScenario();
  const update = useScenarios((st) => st.update);
  const positions = s.payroll.positions;
  const locked = s.kind === 'excel';
  const [open, setOpen] = useState<number | null>(null);
  const fnb = positions.map((p, i) => ({ p, i })).filter((x) => x.p.costCenter === 'fnb');
  const avgYear = (p: StaffPosition, y: number) => { const row = p.headcount[Math.min(y, p.headcount.length - 1)] ?? []; return row.length ? row.reduce((a, b) => a + b, 0) / row.length : 0; };
  const add = () => {
    const np: StaffPosition = { name: 'Novo cargo A&B', costCenter: 'fnb', monthlyCost: 0, headcount: Array.from({ length: 6 }, () => Array(12).fill(0)), extrasPerWedding: 0 };
    update(s.id, 'payroll.positions', [...positions, np]);
  };
  const remove = (i: number) => { if (open === i) setOpen(null); update(s.id, 'payroll.positions', positions.filter((_, j) => j !== i)); };
  const totalMonthly = fnb.reduce((a, { p }) => a + p.monthlyCost * avgYear(p, 5), 0);
  return (
    <Panel title="Folha de A&B" subtitle="Cargos do centro de custo A&B: custo mensal (salário × encargos), quadro médio por ano e extras por casamento" className="mt-5" actions={!locked ? <button className="btn" onClick={add}>+ cargo</button> : undefined}>
      <div className="flex items-center gap-2 text-[12px] text-ink-3 mb-2"><ProvDot entry={provFor(s, 'payroll.positions')} path="payroll.positions" />Quadro por cargo · {fnb.length} cargos de A&B · custo mensal no ano 6 ≈ <span className="num text-ink">{fmtBRL(totalMonthly)}</span></div>
      <div className="overflow-x-auto">
        <table className="data text-[12px]">
          <thead><tr><th>Cargo</th><th className="r">Custo mensal</th>{YEARS6.map((y) => <th key={y} className="r">{y}</th>)}<th className="r">Extras / casamento</th><th className="r">Custo ano 6</th><th /></tr></thead>
          <tbody>
            {fnb.map(({ p, i }) => (
              <tr key={i} className={open === i ? 'bg-sand-2/50' : ''}>
                <td><CellInput s={s} path={`payroll.positions.${i}.name`} kind="text" width="w-48" /></td>
                <td className="r"><CellInput s={s} path={`payroll.positions.${i}.monthlyCost`} width="w-[88px]" step={100} /></td>
                {YEARS6.map((y, yi) => <td key={y} className="r">{fmtNum(avgYear(p, yi), 1)}</td>)}
                <td className="r"><CellInput s={s} path={`payroll.positions.${i}.extrasPerWedding`} width="w-[80px]" step={500} /></td>
                <td className="r">{fmtK(p.monthlyCost * avgYear(p, 5) * 12)}</td>
                <td className="r whitespace-nowrap">
                  <button className="btn btn-ghost text-[12px] py-0.5" onClick={() => setOpen(open === i ? null : i)}>{open === i ? 'Fechar' : 'Quadro'}</button>
                  {!locked && <button className="text-ink-3 hover:text-rust ml-1" title="Remover cargo" onClick={() => remove(i)}>×</button>}
                </td>
              </tr>
            ))}
            {fnb.length === 0 && <tr><td colSpan={11} className="text-ink-3">Nenhum cargo no centro de custo A&B (o Excel usa CMO fixo mensal).</td></tr>}
          </tbody>
        </table>
      </div>
      {open !== null && positions[open] && (
        <div className="mt-4 pt-4 rule">
          <GridEditor s={s} path={`payroll.positions.${open}.headcount`} label={`Quadro mensal · ${positions[open].name} (pessoas)`} kind="number" />
        </div>
      )}
      <div className="mt-3"><Note>Os valores por ano são médias do quadro mensal. "Custo ano 6" = custo mensal × quadro médio × 12, antes da correção inflacionária e dos extras. Cargos de hotelaria e administrativos são editados na página de equity/opex.</Note></div>
    </Panel>
  );
}
