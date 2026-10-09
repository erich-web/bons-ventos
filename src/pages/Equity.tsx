import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { PageHeader, Ledger, Panel, Field, SelectField, ToggleField, Note, ProvDot, provFor, CHART_COLORS as C, chartAxis, chartTooltipStyle, tipFmt } from '../components/ui';
import { useActiveScenario, useScenarios } from '../store/scenarios';
import { useResults } from '../lib/useResults';
import { compareGuaranteeModels, currentStake } from '../engine/analysis';
import { fmtM, fmtPct, fmtX, fmtK } from '../lib/format';
import type { Partner } from '../engine/types';
import type { PageKey } from '../App';

const PARTY_COLORS = [C.hotel, C.weddings, C.fnb, C.equity, C.ocean3, C.gold2];

export default function Equity({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const m = r.metrics;
  const update = useScenarios((st) => st.update);
  const locked = s.kind === 'excel';
  const E = s.equity;
  const inv = E.investor;
  const invRow = r.capTable[r.capTable.length - 1];
  const invParty = r.parties[r.parties.length - 1];
  const capitalInvested = E.partners.reduce((t, p) => t + p.capitalInvested, 0);
  const stakeSum = E.partners.reduce((t, p) => t + p.stakePre, 0);
  const stakeOk = Math.abs(stakeSum - 1) < 1e-6;
  const postMoney = E.preMoney + inv.contribution;
  const preMoneyRef = E.landValueMarket + capitalInvested + E.otherAssets - E.liabilities;
  const computedStake = postMoney > 0 ? inv.contribution / postMoney : 0;
  const guaranteeModels = useMemo(() => compareGuaranteeModels(s), [s]);
  const feeIncome = invParty.guaranteeFees.reduce((t, v) => t + v, 0);
  const guarantorOnly = inv.contribution === 0 && s.guarantees.enabled && s.guarantees.investor.committed > 0;

  // cap table antes/depois (barras empilhadas horizontais)
  const capChart = [
    { etapa: 'Antes', ...Object.fromEntries(r.capTable.map((c) => [c.name, c.stakePre * 100])) },
    { etapa: 'Depois', ...Object.fromEntries(r.capTable.map((c) => [c.name, c.stakePost * 100])) },
  ];
  // aportes e distribuições por sócio por ano
  const flowChart = useMemo(() => {
    const years = Array.from(new Set(r.monthly.months.map((mm) => +mm.slice(0, 4))));
    const rows = years.map((y) => {
      const row: Record<string, number | string> = { ano: y };
      r.parties.forEach((p) => {
        let a = 0; let d = 0;
        r.monthly.months.forEach((mm, i) => { if (+mm.slice(0, 4) === y) { a += p.contributions[i]; d += p.distributions[i] + p.guaranteeFees[i]; } });
        row[`${p.name} · aportes`] = -a / 1e6; row[`${p.name} · retornos`] = d / 1e6;
      });
      return row;
    });
    return rows.filter((row) => Object.entries(row).some(([k, v]) => k !== 'ano' && Math.abs(v as number) > 1e-9));
  }, [r]);

  const setPartner = (i: number, patch: Partial<Partner>) => update(s.id, 'equity.partners', E.partners.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  const addPartner = () => update(s.id, 'equity.partners', [...E.partners, { name: `Sócio ${E.partners.length + 1}`, stakePre: 0, capitalInvested: 0 }]);
  const removePartner = (i: number) => update(s.id, 'equity.partners', E.partners.filter((_, k) => k !== i));

  return (
    <>
      <PageHeader title="Equity & estrutura do investidor" subtitle={`Cap table, valuation de entrada e termos econômicos do novo investidor no cenário "${s.name}". Pré-money e participação são parâmetros de negociação, não condições fechadas.`} actions={<><button className="btn" onClick={() => go('financing')}>Financiamento</button><button className="btn btn-primary" onClick={() => go('returns')}>Simular negociação</button></>} />
      <Ledger items={[
        { label: 'Pré-money negociado', value: fmtM(E.preMoney), hint: `referência patrimonial ${fmtM(preMoneyRef)}`, traceId: 'capTable' },
        { label: 'Aporte do investidor', value: fmtM(inv.contribution), hint: `closing ${inv.closingDate}`, traceId: 'capTable' },
        { label: 'Pós-money', value: fmtM(postMoney), hint: inv.stakeNegotiated != null ? 'participação negociada (não implícita)' : 'pré-money + aporte', traceId: 'capTable' },
        { label: 'Participação do investidor', value: fmtPct(invRow.stakePost), hint: s.guarantees.investor.model === 'C' && s.guarantees.investor.committed > 0 ? `inclui ${fmtPct(s.guarantees.investor.extraStakePct)} por garantias (modelo C)` : inv.stakeNegotiated != null ? 'negociada' : 'calculada pelo pré-money', traceId: 'capTable' },
        { label: 'Diluição dos sócios atuais', value: fmtPct(m.dilution), hint: `cada sócio × ${fmtPct(1 - m.dilution, 1)}`, tone: m.dilution > 0.5 ? 'bad' : 'default', traceId: 'capTable' },
        { label: 'Capital já investido', value: fmtM(capitalInvested, 2), hint: `terreno: banco ${fmtM(E.landValueBank, 3)} · mercado ${fmtM(E.landValueMarket, 1)}` },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6">
        {/* ---------------- Premissas ---------------- */}
        <div className="space-y-5">
          <Panel title="Cap table" subtitle="Sócios atuais e participação após a entrada do investidor" actions={<button className="btn text-[12px]" disabled={locked} onClick={addPartner}>+ sócio</button>}>
            <div className="flex items-center gap-2 text-[12px] text-ink-3 mb-2"><ProvDot entry={provFor(s, 'equity.partners')} path="equity.partners" />Participações pré-money e capital já investido</div>
            <table className="data text-[12px]">
              <thead><tr><th>Sócio</th><th className="r">% pré</th><th className="r">Capital investido</th><th className="r">% pós</th><th /></tr></thead>
              <tbody>
                {E.partners.map((p, i) => (
                  <tr key={i}>
                    <td><input type="text" className="w-20 text-[12px]" defaultValue={p.name} key={`n-${i}-${p.name}`} disabled={locked} onBlur={(e) => setPartner(i, { name: e.target.value })} /></td>
                    <td className="r"><input type="number" className="w-14 text-[12px] px-1" defaultValue={Math.round(p.stakePre * 1000) / 10} key={`s-${i}-${p.stakePre}`} step={0.5} disabled={locked} onBlur={(e) => { const n = parseFloat(e.target.value.replace(',', '.')); if (!Number.isNaN(n)) setPartner(i, { stakePre: n / 100 }); }} /></td>
                    <td className="r"><input type="number" className="w-24 text-[12px] px-1" defaultValue={p.capitalInvested} key={`c-${i}-${p.capitalInvested}`} step={1000} disabled={locked} onBlur={(e) => { const n = parseFloat(e.target.value); if (!Number.isNaN(n)) setPartner(i, { capitalInvested: n }); }} /></td>
                    <td className="r font-semibold text-ink">{fmtPct(r.capTable[i]?.stakePost ?? 0)}</td>
                    <td className="r"><button className="btn btn-ghost text-[11px]" disabled={locked || E.partners.length <= 1} onClick={() => removePartner(i)}>×</button></td>
                  </tr>
                ))}
                <tr className="font-semibold text-ink">
                  <td>{inv.name}</td><td className="r">—</td><td className="r">{fmtM(inv.contribution)}</td><td className="r">{fmtPct(invRow.stakePost)}</td><td />
                </tr>
                <tr className={stakeOk ? 'text-ink-3' : 'text-rust'}>
                  <td>Soma sócios atuais</td><td className="r">{fmtPct(stakeSum)}</td><td className="r">{fmtM(capitalInvested, 2)}</td><td className="r">{fmtPct(r.capTable.reduce((t, c) => t + c.stakePost, 0))}</td><td />
                </tr>
              </tbody>
            </table>
            {!stakeOk && <div className="mt-2"><Note tone="warn">As participações pré-money somam {fmtPct(stakeSum)} em vez de 100%. O motor normaliza as frações, mas corrija as premissas antes de apresentar.</Note></div>}
          </Panel>

          <Panel title="Investidor" subtitle="Termos de entrada">
            <Field s={s} path="equity.investor.name" label="Nome" kind="text" />
            <Field s={s} path="equity.investor.contribution" label="Aporte" kind="money" step={100000} />
            <Field s={s} path="equity.investor.stakeNegotiated" label="Participação negociada" kind="pct" hint="vazio = calculada pelo pré-money (aporte / pós-money)" />
            <div className="flex items-center justify-between gap-2 py-1.5 border-b border-sand-2 text-[12px] text-ink-3">
              <span>{inv.stakeNegotiated == null ? `Calculada: ${fmtPct(computedStake)} = aporte / (pré-money + aporte)` : `Implícita pelo pré-money seria ${fmtPct(computedStake)}`}</span>
              {inv.stakeNegotiated != null && <button className="btn text-[12px]" disabled={locked} onClick={() => update(s.id, 'equity.investor.stakeNegotiated', null)}>usar participação calculada</button>}
            </div>
            <Field s={s} path="equity.investor.closingDate" label="Data do closing (AAAA-MM)" kind="ym" />
            <Field s={s} path="equity.investor.targetIRR" label="TIR mínima exigida" kind="pct" />
            <Field s={s} path="equity.investor.horizonYears" label="Horizonte (anos)" kind="int" />
          </Panel>

          <Panel title="Valuation de entrada" subtitle="Pré-money negociado × referência patrimonial">
            <Field s={s} path="equity.preMoney" label="Pré-money negociado" kind="money" step={500000} />
            <Field s={s} path="equity.landValueMarket" label="Terreno — valor de mercado" kind="money" step={100000} />
            <Field s={s} path="equity.landValueBank" label="Terreno — avaliação do banco" kind="money" step={100000} />
            <Field s={s} path="equity.otherAssets" label="Outros ativos (projetos, licenças)" kind="money" step={50000} />
            <Field s={s} path="equity.liabilities" label="Passivos" kind="money" step={50000} />
            <div className="mt-3 rounded-sm bg-sand-2/60 px-3 py-2 text-[12px]">
              <div className="text-[11px] font-semibold text-ink-3 tracking-wide mb-1">Pré-money de referência (build-up)</div>
              <Row l="Terreno (mercado)" v={fmtM(E.landValueMarket, 2)} />
              <Row l="+ Capital já investido" v={fmtM(capitalInvested, 2)} />
              <Row l="+ Outros ativos" v={fmtM(E.otherAssets, 2)} />
              <Row l="− Passivos" v={fmtM(E.liabilities, 2)} />
              <Row l="= Pré-money de referência" v={fmtM(preMoneyRef, 2)} strong />
              <Row l="Pré-money negociado" v={fmtM(E.preMoney, 2)} strong />
              <Row l="Prêmio / (desconto)" v={preMoneyRef > 0 ? fmtPct(E.preMoney / preMoneyRef - 1) : '—'} />
              <button className="btn mt-2 text-[12px]" disabled={locked || Math.abs(preMoneyRef - E.preMoney) < 1} onClick={() => update(s.id, 'equity.preMoney', Math.round(preMoneyRef))}>aplicar referência ao pré-money</button>
            </div>
            <div className="mt-3"><Note>A avaliação do terreno pelo banco ({fmtM(E.landValueBank, 3)}) é um parâmetro de garantia, não o pré-money. O pré-money é negociado e pode incorporar valor de projeto, licenças e o trabalho de estruturação dos sócios atuais.</Note></div>
          </Panel>

          <Panel title="Aportes, distribuições e saída" subtitle="Regras de alocação de chamadas e de distribuição de caixa">
            <Field s={s} path="equity.existingAdditionalContribution" label="Aporte adicional dos sócios atuais (no closing)" kind="money" step={100000} />
            <SelectField s={s} path="equity.callAllocation" label="Chamadas de capital" options={[{ value: 'investorFirst', label: 'Sócios atuais (pré)' }, { value: 'proRata', label: 'Pró-rata pós-money' }]} />
            <Field s={s} path="equity.distribution.payoutPct" label="Payout do caixa excedente" kind="pct" />
            <Field s={s} path="equity.distribution.minCashReserve" label="Reserva mínima de caixa" kind="money" step={50000} />
            <Field s={s} path="equity.distribution.startMonthsAfterOpening" label="Início (meses após inauguração)" kind="int" />
            <Field s={s} path="equity.distribution.blockedWhileDSCRBelow" label="Bloqueio se DSCR abaixo de" kind="number" step={0.05} suffix="×" />
            <ToggleField s={s} path="equity.preferredReturn.enabled" label="Preferência simples ao investidor" />
            <Field s={s} path="equity.preferredReturn.ratePct" label="Taxa da preferência" kind="pct" />
            <Field s={s} path="equity.exit.year" label="Ano de saída (operação)" kind="int" />
            <SelectField s={s} path="equity.exit.method" label="Método de saída" options={[{ value: 'multiple', label: 'Múltiplo de EBITDA' }, { value: 'dcf', label: 'DCF' }, { value: 'bookNOI', label: 'NOI × múltiplo' }, { value: 'none', label: 'Sem saída (fluxo até o fim)' }]} />
            <Field s={s} path="equity.exit.ebitdaMultiple" label="Múltiplo de saída (EBITDA)" kind="number" step={0.5} suffix="×" />
          </Panel>
        </div>

        {/* ---------------- Resultados ---------------- */}
        <div className="xl:col-span-2 space-y-5">
          <Panel title="Cap table antes e depois" subtitle="Participação societária (%)">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={capChart} layout="vertical" margin={{ left: 0, right: 10, top: 10 }} barSize={34}>
                  <CartesianGrid stroke={C.grid} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} {...chartAxis} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="etapa" {...chartAxis} width={52} />
                  <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `${v.toFixed(1)}%`)} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  {r.capTable.map((c, i) => <Bar key={c.name} dataKey={c.name} stackId="c" fill={PARTY_COLORS[i % PARTY_COLORS.length]} />)}
                </BarChart>
              </ResponsiveContainer>
              <table className="data text-[12px]">
                <thead><tr><th>Sócio</th><th className="r">Antes</th><th className="r">Depois</th><th className="r">Δ p.p.</th><th className="r">Equity (DCF)</th></tr></thead>
                <tbody>
                  {r.capTable.map((c) => (
                    <tr key={c.name}><td>{c.name}</td><td className="r">{fmtPct(c.stakePre)}</td><td className="r font-semibold text-ink">{fmtPct(c.stakePost)}</td><td className={`r ${c.stakePost - c.stakePre < 0 ? 'text-rust' : 'text-green-3'}`}>{((c.stakePost - c.stakePre) * 100).toFixed(1)}</td><td className="r">{fmtM(c.stakePost * r.valuation.dcf.equity)}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <Panel title="Retorno por sócio" subtitle="Fluxos até a saída, inclusive fees de garantia">
              <table className="data text-[12px]">
                <thead><tr><th>Sócio</th><th className="r">% pós</th><th className="r">Aportes</th><th className="r">Retornos</th><th className="r">MOIC</th><th className="r">TIR</th><th className="r">VPL</th></tr></thead>
                <tbody>
                  {r.parties.map((p) => (
                    <tr key={p.name}><td>{p.name}</td><td className="r">{fmtPct(p.stakePost)}</td><td className="r">{fmtM(p.totalIn)}</td><td className="r">{fmtM(p.totalOut)}</td><td className="r">{p.totalIn > 0 ? fmtX(p.moic, 1) : '—'}</td><td className={`r font-semibold ${p.irr != null && p.irr < s.valuation.discountRateEquity ? 'text-rust' : 'text-ink'}`}>{fmtPct(p.irr)}</td><td className="r">{fmtM(p.npv)}</td></tr>
                  ))}
                </tbody>
              </table>
              {guarantorOnly && (
                <div className="mt-3 rounded-sm border border-gold-2 bg-sand-2/50 px-3 py-2 text-[12px]">
                  <div className="font-semibold text-ink mb-1">Garantidor sem participação</div>
                  <p className="text-ink-2">O investidor não aporta capital (participação 0%) mas disponibiliza {fmtM(s.guarantees.investor.committed, 3)} em garantias. Seu retorno econômico é o fee: <span className="num text-ink">{fmtM(feeIncome, 2)}</span> no total, com valor presente de <span className="num text-ink">{fmtM(m.guaranteeCostPV, 2)}</span> (custo do empreendimento a {fmtPct(s.valuation.discountRateEquity, 0)} a.a.).</p>
                </div>
              )}
              {!guarantorOnly && feeIncome > 0 && <div className="mt-3 text-[12px] text-ink-3">Inclui {fmtM(feeIncome, 2)} de fees de garantia recebidos pelo investidor (VP {fmtM(m.guaranteeCostPV, 2)}).</div>}
              <div className="mt-3"><Note>Participação atual do investidor segundo as premissas: {fmtPct(currentStake(s))}{s.guarantees.investor.model === 'C' && s.guarantees.investor.committed > 0 ? ` + ${fmtPct(s.guarantees.investor.extraStakePct)} pelo modelo C de garantias` : ''}. TIR em vermelho quando abaixo do custo de equity ({fmtPct(s.valuation.discountRateEquity, 0)}). Os aportes dos sócios atuais consideram apenas chamadas de capital após a data-base; o capital já investido não entra no fluxo.</Note></div>
            </Panel>

          <Panel title="Aportes e retornos por sócio" subtitle="Por ano calendário (R$ milhões): aportes negativos; distribuições e fees positivos — a saída é mostrada abaixo">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={flowChart} margin={{ left: 0, right: 10, top: 10 }} stackOffset="sign">
                <CartesianGrid stroke={C.grid} vertical={false} />
                <XAxis dataKey="ano" {...chartAxis} />
                <YAxis {...chartAxis} width={44} />
                <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(2)} M`)} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {r.parties.map((p, i) => <Bar key={`${p.name}-a`} dataKey={`${p.name} · aportes`} stackId="f" fill={PARTY_COLORS[i % PARTY_COLORS.length]} fillOpacity={0.45} />)}
                {r.parties.map((p, i) => <Bar key={`${p.name}-d`} dataKey={`${p.name} · retornos`} stackId="f" fill={PARTY_COLORS[i % PARTY_COLORS.length]} />)}
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-2 text-[12px] text-ink-2">Saída{E.exit.method === 'none' ? ' não modelada (fluxo até o fim do horizonte).' : ` no ano ${E.exit.year} de operação: ${r.parties.map((p) => `${p.name} ${fmtM(p.exitProceeds.reduce((a, b) => a + b, 0))}`).join(' · ')}.`}</div>
          </Panel>

          <Panel title="Economia da garantia × diluição" subtitle="Três formas de remunerar as garantias do investidor, recalculadas sobre o cenário ativo">
            <div className="overflow-x-auto">
              <table className="data">
                <thead><tr><th>Modelo</th><th className="r">Custo para o empreendimento</th><th className="r">VP do custo</th><th className="r">Participação do investidor</th><th className="r">Diluição extra vs. A</th><th className="r">Retorno para o investidor (TIR)</th><th className="r">VPL investidor</th><th className="r">TIR sócios atuais</th></tr></thead>
                <tbody>
                  {guaranteeModels.map((g) => {
                    const a = guaranteeModels[0];
                    const active = g.model === s.guarantees.investor.model;
                    return (
                      <tr key={g.model} className={active ? 'font-semibold text-ink' : ''}>
                        <td>{g.label}{active ? <span className="text-green-3 font-normal"> · ativo</span> : ''}</td>
                        <td className="r">{fmtM(g.costTotal)}</td><td className="r">{fmtM(g.costPV)}</td>
                        <td className="r">{fmtPct(g.dilution)}</td>
                        <td className={`r ${g.dilution - a.dilution > 0 ? 'text-rust' : ''}`}>{g.model === 'A' ? '—' : `${((g.dilution - a.dilution) * 100).toFixed(1)} p.p.`}</td>
                        <td className="r">{fmtPct(g.investorIRR)}</td><td className="r">{fmtM(g.investorNPV)}</td><td className="r">{fmtPct(g.existingIRR)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-[12px]">
              <div className="border-l-2 border-gold-2 pl-3"><div className="font-semibold text-ink">A — fee anual</div><div className="text-ink-2">Custo de caixa {fmtK(guaranteeModels[0].costTotal)} ao longo da vinculação; sem diluição adicional.</div></div>
              <div className="border-l-2 border-gold-2 pl-3"><div className="font-semibold text-ink">B — fee diferido</div><div className="text-ink-2">Preserva caixa na obra; fee acumula a {fmtPct(s.guarantees.investor.deferredAccrualRate, 0)} a.a. e é pago a partir do {s.guarantees.investor.deferredPaymentStartMonthsAfterOpening}º mês de operação.</div></div>
              <div className="border-l-2 border-gold-2 pl-3"><div className="font-semibold text-ink">C — participação adicional</div><div className="text-ink-2">Sem fee; o investidor recebe +{fmtPct(s.guarantees.investor.extraStakePct)} de participação. Custo implícito = {fmtM(s.guarantees.investor.extraStakePct * r.valuation.dcf.equity)} do equity (DCF).</div></div>
            </div>
            <div className="mt-3"><Note>O VP do fee (modelos A/B) deve ser comparado ao valor da participação cedida (modelo C) para decidir qual estrutura custa menos aos sócios atuais. Nenhuma das três é condição aprovada pelo BNB.</Note></div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Row({ l, v, strong }: { l: string; v: string; strong?: boolean }) {
  return <div className={`flex justify-between py-0.5 ${strong ? 'font-semibold text-ink border-t border-line mt-1 pt-1' : 'text-ink-2'}`}><span>{l}</span><span className="tnum">{v}</span></div>;
}
