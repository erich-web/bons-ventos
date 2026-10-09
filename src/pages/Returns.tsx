import { useMemo, useState, type ReactNode } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine, Cell } from 'recharts';
import { PageHeader, Ledger, Panel, Note, ProvDot, provFor, CHART_COLORS as C, chartAxis, chartTooltipStyle, tipFmt } from '../components/ui';
import { useActiveScenario, useScenarios, type Proposal } from '../store/scenarios';
import { useResults } from '../lib/useResults';
import { requiredStake, currentStake, getPath } from '../engine/analysis';
import { fmtM, fmtPct, fmtX } from '../lib/format';
import { downloadBlob } from '../lib/export';
import type { Results, Scenario } from '../engine/types';
import type { PageKey } from '../App';

export default function Returns({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const m = r.metrics;
  const update = useScenarios((st) => st.update);
  const proposals = useScenarios((st) => st.proposals);
  const addProposal = useScenarios((st) => st.addProposal);
  const removeProposal = useScenarios((st) => st.removeProposal);
  const locked = s.kind === 'excel';
  const inv = s.equity.investor;
  const invParty = r.parties[r.parties.length - 1];
  const existing = r.parties[0];
  const invRow = r.capTable[r.capTable.length - 1];
  const loanIdx = Math.max(0, s.loans.findIndex((l) => l.phase === 1));
  const loan = s.loans[loanIdx];
  const minDSCR = Math.max(0, ...s.loans.filter((l) => l.enabled).map((l) => l.minDSCR));
  const hasErrors = r.alerts.some((a) => a.level === 'error');
  const viable = isViable(s, r);
  const exitProceeds = invParty.exitProceeds.reduce((t, v) => t + v, 0);
  const existingExit = existing.exitProceeds.reduce((t, v) => t + v, 0);
  const existingAllExit = r.parties.slice(0, -1).reduce((t, p) => t + p.exitProceeds.reduce((x, v) => x + v, 0), 0);
  const debtCostEff = m.debtTotal > 0 ? m.interestTotal / m.debtTotal : null;
  const annualRate = loan ? ((1 + loan.spread) * (loan.indexer === 'inflation' ? 1 + s.calendar.inflation : 1) - 1) * (1 - loan.bonusAdimplencia) : null;

  const set = (path: string, v: unknown) => { if (!locked) update(s.id, path, v); };

  // fluxo do investidor por ano
  const invFlow = useMemo(() => {
    const years = Array.from(new Set(r.monthly.months.map((mm) => +mm.slice(0, 4))));
    return years.map((y) => {
      let a = 0; let d = 0; let e = 0; let g = 0;
      r.monthly.months.forEach((mm, i) => { if (+mm.slice(0, 4) === y) { a += invParty.contributions[i]; d += invParty.distributions[i]; e += invParty.exitProceeds[i]; g += invParty.guaranteeFees[i]; } });
      return { ano: y, Aportes: -a / 1e6, Distribuições: d / 1e6, 'Fees de garantia': g / 1e6, saida: e };
    }).filter((row) => Math.abs(row.Aportes) + row.Distribuições + row.saida + row['Fees de garantia'] > 1e-9);
  }, [r, invParty]);
  const irrChart = [
    { nome: 'TIR investidor', v: (invParty.irr ?? 0) * 100, fill: C.fnb },
    { nome: 'TIR sócios atuais', v: (existing.irr ?? 0) * 100, fill: C.hotel },
    { nome: 'TIR projeto', v: (m.irrProject ?? 0) * 100, fill: C.equity },
    { nome: 'TIR-alvo', v: inv.targetIRR * 100, fill: C.cost },
  ];

  const saveProposal = () => {
    const name = window.prompt('Nome da proposta', `Proposta ${proposals.length + 1} — ${fmtM(inv.contribution)} por ${fmtPct(invRow.stakePost, 1)}`);
    if (!name) return;
    const p: Proposal = {
      id: `prop-${Date.now().toString(36)}`, name, createdAt: new Date().toISOString(), scenarioId: s.id,
      contribution: inv.contribution, stake: invRow.stakePost, guaranteeCommitted: s.guarantees.investor.committed, guaranteeFeePct: s.guarantees.investor.feePct, guaranteeModel: s.guarantees.investor.model,
      preMoney: s.equity.preMoney, exitYear: s.equity.exit.year, exitMultiple: s.equity.exit.ebitdaMultiple, payoutPct: s.equity.distribution.payoutPct, loanAmount: loan?.amount ?? 0,
      summary: { investorIRR: invParty.irr, investorNPV: invParty.npv, investorMOIC: invParty.moic, existingIRR: existing.irr, irrProject: m.irrProject, dscrMin: m.dscrMin, equityNeed: m.equityNeed, viable },
    };
    addProposal(p);
  };
  const loadProposal = (p: Proposal) => {
    if (locked) return;
    set(`loans.${loanIdx}.amount`, p.loanAmount);
    set('equity.investor.contribution', p.contribution);
    set('equity.investor.stakeNegotiated', p.stake);
    set('guarantees.investor.committed', p.guaranteeCommitted);
    set('guarantees.investor.feePct', p.guaranteeFeePct);
    set('guarantees.investor.model', p.guaranteeModel);
    set('equity.preMoney', p.preMoney);
    set('equity.exit.year', p.exitYear);
    set('equity.exit.ebitdaMultiple', p.exitMultiple);
    set('equity.distribution.payoutPct', p.payoutPct);
  };
  const exportCsv = () => {
    const head = ['Proposta', 'Data', 'Cenário', 'Aporte', 'Participação', 'Garantias', 'Fee garantia', 'Modelo', 'Pré-money', 'Dívida Fase 01', 'Saída (ano)', 'Múltiplo', 'Payout', 'TIR investidor', 'VPL investidor', 'MOIC', 'TIR sócios', 'TIR projeto', 'DSCR mín', 'Viável'];
    const rows = proposals.map((p) => [p.name, p.createdAt.slice(0, 10), p.scenarioId, p.contribution, p.stake, p.guaranteeCommitted, p.guaranteeFeePct, p.guaranteeModel, p.preMoney, p.loanAmount, p.exitYear, p.exitMultiple, p.payoutPct, p.summary.investorIRR ?? '', p.summary.investorNPV, p.summary.investorMOIC, p.summary.existingIRR ?? '', p.summary.irrProject ?? '', p.summary.dscrMin ?? '', p.summary.viable ? 'sim' : 'não']);
    const csv = [head, ...rows].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n');
    void downloadBlob(`propostas-bons-ventos-${new Date().toISOString().slice(0, 10)}.csv`, new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
  };

  return (
    <>
      <PageHeader title="Retornos do investidor" subtitle={`Simulador de negociação em tempo real sobre o cenário "${s.name}": cada controle altera a premissa correspondente e recalcula o modelo completo. Resultados são projeções, não ofertas.`} actions={<><button className="btn" onClick={() => go('equity')}>Cap table</button><button className="btn" onClick={() => go('financing')}>Financiamento</button></>} />
      <Ledger items={[
        { label: 'TIR do investidor', value: fmtPct(invParty.irr), hint: `alvo ${fmtPct(inv.targetIRR, 0)} · MOIC ${invParty.totalIn > 0 ? fmtX(invParty.moic, 1) : '—'}`, tone: invParty.irr == null ? 'muted' : invParty.irr < inv.targetIRR ? 'bad' : 'good', traceId: 'investorIRR' },
        { label: 'VPL do investidor', value: fmtM(invParty.npv), hint: `a ${fmtPct(s.valuation.discountRateEquity, 0)} a.a.`, tone: invParty.npv < 0 ? 'bad' : 'default', traceId: 'investorIRR' },
        { label: 'TIR dos sócios atuais', value: fmtPct(existing.irr), hint: `${existing.name} · ${fmtPct(existing.stakePost, 1)} pós`, traceId: 'existingIRR' },
        { label: 'TIR do projeto', value: fmtPct(m.irrProject), hint: `desalavancada · VPL ${fmtM(m.npvProject)}`, traceId: 'irrProject' },
        { label: 'DSCR mínimo', value: fmtX(m.dscrMin), hint: `covenant ${fmtX(minDSCR, 2)}${m.dscrMinYear ? ` · em ${m.dscrMinYear}` : ''}`, tone: m.dscrMin != null && m.dscrMin < minDSCR ? 'bad' : 'default', traceId: 'dscr' },
        { label: 'Proposta', value: viable ? 'viável' : 'inviável', hint: viable ? 'TIR ≥ alvo, DSCR ≥ covenant, sem erros' : invParty.irr != null && invParty.irr < inv.targetIRR ? 'TIR abaixo da mínima exigida' : m.dscrMin != null && m.dscrMin < minDSCR ? 'DSCR abaixo do covenant' : hasErrors ? 'há alertas de erro no cenário' : 'investidor sem retorno calculável', tone: viable ? 'good' : 'bad' },
      ]} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mt-6">
        {/* ---------------- Simulador ---------------- */}
        <div className="space-y-5">
          <Panel title="Simulador de negociação" subtitle="Controles ligados ao cenário ativo (gravam a premissa)">
            {locked && <div className="mb-2"><Note tone="warn">O cenário Excel é somente leitura; duplique-o no laboratório para simular.</Note></div>}
            <div className="flex items-center justify-between py-1.5 border-b border-sand-2 text-[13px]"><span className="text-ink-2">Investimento total (CAPEX)</span><span className="num text-ink">{fmtM(m.capexTotal)}</span></div>
            <div className="flex items-center justify-between py-1.5 border-b border-sand-2 text-[13px]"><span className="text-ink-2">Capital próprio necessário</span><span className="num text-ink">{fmtM(m.equityNeed)}</span></div>
            {loan && <Slider s={s} path={`loans.${loanIdx}.amount`} label="Dívida Fase 01" min={0} max={25e6} step={5e5} fmt={(v) => fmtM(v)} scale={1e6} unit="M" onChange={set} />}
            <Slider s={s} path="equity.investor.contribution" label="Aporte do investidor" min={0} max={20e6} step={1e5} fmt={(v) => fmtM(v)} scale={1e6} unit="M" onChange={set} />
            <Slider s={s} path="guarantees.investor.committed" label="Garantias oferecidas" min={0} max={12e6} step={1e5} fmt={(v) => fmtM(v)} scale={1e6} unit="M" onChange={set} />
            <Slider s={s} path="guarantees.investor.feePct" label="Fee das garantias" min={0} max={0.03} step={0.001} fmt={(v) => fmtPct(v, 1)} scale={0.01} unit="% a.a." onChange={set} />
            <Slider s={s} path="equity.preMoney" label="Pré-money" min={0} max={30e6} step={5e5} fmt={(v) => fmtM(v)} scale={1e6} unit="M" onChange={set} />
            <div className="py-1.5 border-b border-sand-2">
              <div className="flex items-center justify-between text-[13px]">
                <span className="flex items-center gap-2 text-ink-2"><ProvDot entry={provFor(s, 'equity.investor.stakeNegotiated')} path="equity.investor.stakeNegotiated" />Participação oferecida</span>
                <span className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] text-ink-3 cursor-pointer"><input type="checkbox" className="accent-green" disabled={locked} checked={inv.stakeNegotiated == null} onChange={(e) => set('equity.investor.stakeNegotiated', e.target.checked ? null : Math.round(currentStake(s) * 1000) / 1000)} />calculado</label>
                  <span className="num text-ink text-[15px]">{fmtPct(invRow.stakePost, 1)}</span>
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <input type="range" className="flex-1" min={1} max={60} step={0.5} disabled={locked || inv.stakeNegotiated == null} value={Math.round(currentStake(s) * 1000) / 10} onChange={(e) => set('equity.investor.stakeNegotiated', Number(e.target.value) / 100)} />
                <input type="number" className="w-20 text-[12px]" min={1} max={60} step={0.5} disabled={locked || inv.stakeNegotiated == null} value={Math.round(currentStake(s) * 1000) / 10} onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) set('equity.investor.stakeNegotiated', n / 100); }} />
                <span className="text-[11px] text-ink-3 w-10">%</span>
              </div>
              {inv.stakeNegotiated == null && <div className="text-[11px] text-ink-3 mt-1">calculada: aporte / (pré-money + aporte){s.guarantees.investor.model === 'C' && s.guarantees.investor.committed > 0 ? ` + ${fmtPct(s.guarantees.investor.extraStakePct)} (modelo C)` : ''}</div>}
            </div>
            <Slider s={s} path="equity.distribution.payoutPct" label="Payout do caixa excedente" min={0} max={1} step={0.05} fmt={(v) => fmtPct(v, 0)} scale={0.01} unit="%" onChange={set} />
            <Slider s={s} path="equity.exit.year" label="Ano de saída" min={5} max={15} step={1} fmt={(v) => `ano ${v}`} scale={1} unit="anos" onChange={set} />
            <Slider s={s} path="equity.exit.ebitdaMultiple" label="Múltiplo de saída (EBITDA)" min={5} max={12} step={0.5} fmt={(v) => fmtX(v, 1)} scale={1} unit="×" onChange={set} />
            <Slider s={s} path="equity.investor.targetIRR" label="TIR mínima exigida" min={0.08} max={0.35} step={0.005} fmt={(v) => fmtPct(v, 1)} scale={0.01} unit="%" onChange={set} />
            <div className="mt-3"><Note>Fee de 1,5% a.a. e múltiplo de 8× são bases de negociação, não preços de mercado. A estrutura BNB documentada limita a dívida a R$20,7M (90%).</Note></div>
          </Panel>
        </div>

        {/* ---------------- Resultados ---------------- */}
        <div className="xl:col-span-2 space-y-5">
          <Panel title="Resultado da proposta" subtitle="Recalculado a cada alteração dos controles">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
              <Stat l="Equity do investidor (DCF hoje)" v={fmtM(invRow.stakePost * r.valuation.dcf.equity)} h={`${fmtPct(invRow.stakePost, 1)} × ${fmtM(r.valuation.dcf.equity)}`} />
              <Stat l="Equity do investidor na saída" v={fmtM(exitProceeds)} h={s.equity.exit.method === 'none' ? 'sem evento de saída' : `ano ${s.equity.exit.year} · ${s.equity.exit.method === 'multiple' ? `${fmtX(s.equity.exit.ebitdaMultiple, 1)} EBITDA` : s.equity.exit.method}`} />
              <Stat l="Equity dos sócios atuais (DCF hoje)" v={fmtM((1 - invRow.stakePost) * r.valuation.dcf.equity)} h={`${fmtPct(1 - invRow.stakePost, 1)} do equity`} />
              <Stat l="Sócios atuais na saída" v={fmtM(existingAllExit)} h={`${existing.name}: ${fmtM(existingExit)}`} />
              <Stat l="TIR do investidor" v={fmtPct(invParty.irr)} h={`alvo ${fmtPct(inv.targetIRR, 0)}`} tone={invParty.irr != null && invParty.irr < inv.targetIRR ? 'bad' : 'good'} />
              <Stat l="VPL do investidor" v={fmtM(invParty.npv)} h={`a ${fmtPct(s.valuation.discountRateEquity, 0)} a.a.`} tone={invParty.npv < 0 ? 'bad' : 'default'} />
              <Stat l="MOIC do investidor" v={invParty.totalIn > 0 ? fmtX(invParty.moic, 1) : '—'} h={`aportes ${fmtM(invParty.totalIn)} · retornos ${fmtM(invParty.totalOut)}`} />
              <Stat l="TIR dos sócios atuais" v={fmtPct(existing.irr)} h={`MOIC ${existing.totalIn > 0 ? fmtX(existing.moic, 1) : '—'} · VPL ${fmtM(existing.npv)}`} />
              <Stat l="Custo da dívida" v={debtCostEff == null ? '—' : fmtPct(debtCostEff, 0)} h={debtCostEff == null ? 'sem dívida' : `juros ${fmtM(m.interestTotal)} / principal ${fmtM(m.debtTotal)} · taxa efetiva ${fmtPct(annualRate, 2)} a.a.`} />
              <Stat l="Custo das garantias" v={fmtM(m.guaranteeCostTotal)} h={`VP ${fmtM(m.guaranteeCostPV)} · vinculado ${fmtM(m.guaranteeCommittedPeak)}`} />
              <Stat l="Diluição dos sócios atuais" v={fmtPct(m.dilution)} h={`pós-money ${fmtM(s.equity.preMoney + inv.contribution)}`} />
              <Stat l="Valor patrimonial projetado" v={fmtM(r.valuation.dcf.equity)} h={`DCF · por múltiplo ${fmtM(r.valuation.multiple.equity)}`} />
              <Stat l="TIR do projeto" v={fmtPct(m.irrProject)} h={`sem valor terminal ${fmtPct(m.irrProjectNoTV)}`} />
              <Stat l="DSCR mínimo" v={fmtX(m.dscrMin)} h={`covenant ${fmtX(minDSCR, 2)}`} tone={m.dscrMin != null && m.dscrMin < minDSCR ? 'bad' : 'default'} />
            </div>
            {!viable && <div className="mt-4"><Note tone="warn">Proposta inviável nas premissas atuais: {invParty.irr != null && invParty.irr < inv.targetIRR ? `TIR do investidor (${fmtPct(invParty.irr)}) abaixo da mínima exigida (${fmtPct(inv.targetIRR, 0)}). ` : ''}{m.dscrMin != null && m.dscrMin < minDSCR ? `DSCR mínimo (${fmtX(m.dscrMin)}) abaixo do covenant (${fmtX(minDSCR, 2)}). ` : ''}{hasErrors ? r.alerts.filter((a) => a.level === 'error').map((a) => a.message).join(' ') : ''}</Note></div>}
          </Panel>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <Panel title="Fluxo do investidor por ano" subtitle="R$ milhões: aportes negativos; distribuições e fees positivos">
              {invFlow.length === 0 ? <div className="text-[13px] text-ink-3">Sem fluxos para o investidor nas premissas atuais.</div> : (
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={invFlow} margin={{ left: 0, right: 10, top: 10 }} stackOffset="sign">
                    <CartesianGrid stroke={C.grid} vertical={false} />
                    <XAxis dataKey="ano" {...chartAxis} />
                    <YAxis {...chartAxis} width={44} />
                    <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `R$ ${v.toFixed(2)} M`)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <ReferenceLine y={0} stroke={C.text} />
                    <Bar dataKey="Aportes" stackId="f" fill={C.neg} />
                    <Bar dataKey="Distribuições" stackId="f" fill={C.equity} />
                    <Bar dataKey="Fees de garantia" stackId="f" fill={C.fnb} />
                  </BarChart>
                </ResponsiveContainer>
              )}
              <div className="mt-2 text-[12px] text-ink-2">{exitProceeds > 0 ? `Saída: ${fmtM(exitProceeds)} em ${invFlow.find((x) => x.saida > 0)?.ano ?? '—'} (não incluída nas barras para preservar a escala).` : 'Sem evento de saída modelado para o investidor.'}</div>
            </Panel>
            <Panel title="Comparação de retornos" subtitle="TIR anual (%)">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={irrChart} margin={{ left: 0, right: 10, top: 10 }} barSize={44}>
                  <CartesianGrid stroke={C.grid} vertical={false} />
                  <XAxis dataKey="nome" {...chartAxis} />
                  <YAxis {...chartAxis} width={40} tickFormatter={(v) => `${v}%`} />
                  <Tooltip {...chartTooltipStyle} formatter={tipFmt((v) => `${v.toFixed(1)}%`)} />
                  <ReferenceLine y={inv.targetIRR * 100} stroke={C.neg} strokeDasharray="4 3" />
                  <Bar dataKey="v" name="TIR">{irrChart.map((d) => <Cell key={d.nome} fill={d.fill} />)}</Bar>
                </BarChart>
              </ResponsiveContainer>
            </Panel>
          </div>

          <ReversePanel s={s} />

          <Panel title="Propostas salvas" subtitle="Fotografias dos parâmetros e resultados para comparar lado a lado" actions={<div className="flex gap-2 shrink-0"><button className="btn whitespace-nowrap" disabled={proposals.length === 0} onClick={exportCsv}>Exportar propostas (CSV)</button><button className="btn btn-primary whitespace-nowrap" onClick={saveProposal}>Salvar proposta</button></div>}>
            {proposals.length === 0 ? <div className="text-[13px] text-ink-3">Nenhuma proposta salva. Ajuste os controles e clique em “Salvar proposta”.</div> : (
              <div className="overflow-x-auto">
                <table className="data text-[12px]">
                  <thead><tr><th>Parâmetro</th>{proposals.map((p) => <th key={p.id} className="r whitespace-nowrap">{p.name}</th>)}</tr></thead>
                  <tbody>
                    <PRow label="Cenário" vals={proposals.map((p) => p.scenarioId)} />
                    <PRow label="Aporte" vals={proposals.map((p) => fmtM(p.contribution))} />
                    <PRow label="Participação" vals={proposals.map((p) => fmtPct(p.stake))} />
                    <PRow label="Garantias" vals={proposals.map((p) => fmtM(p.guaranteeCommitted, 3))} />
                    <PRow label="Fee das garantias" vals={proposals.map((p) => `${fmtPct(p.guaranteeFeePct, 1)} · ${p.guaranteeModel}`)} />
                    <PRow label="Pré-money" vals={proposals.map((p) => fmtM(p.preMoney))} />
                    <PRow label="Dívida Fase 01" vals={proposals.map((p) => fmtM(p.loanAmount))} />
                    <PRow label="Saída" vals={proposals.map((p) => `ano ${p.exitYear} · ${fmtX(p.exitMultiple, 1)}`)} />
                    <PRow label="Payout" vals={proposals.map((p) => fmtPct(p.payoutPct, 0))} />
                    <PRow label="TIR investidor" vals={proposals.map((p) => fmtPct(p.summary.investorIRR))} strong />
                    <PRow label="VPL investidor" vals={proposals.map((p) => fmtM(p.summary.investorNPV))} />
                    <PRow label="MOIC" vals={proposals.map((p) => fmtX(p.summary.investorMOIC, 1))} />
                    <PRow label="TIR sócios atuais" vals={proposals.map((p) => fmtPct(p.summary.existingIRR))} strong />
                    <PRow label="TIR projeto" vals={proposals.map((p) => fmtPct(p.summary.irrProject))} />
                    <PRow label="DSCR mín." vals={proposals.map((p) => fmtX(p.summary.dscrMin))} />
                    <tr><td className="text-ink-2">Viável?</td>{proposals.map((p) => <td key={p.id} className={`r font-semibold ${p.summary.viable ? 'text-green-3' : 'text-rust'}`}>{p.summary.viable ? 'sim' : 'não'}</td>)}</tr>
                    <tr><td /><td colSpan={proposals.length} className="r"><div className="flex justify-end gap-1 flex-wrap">{proposals.map((p) => <span key={p.id} className="inline-flex gap-1"><button className="btn text-[11px]" disabled={locked} onClick={() => loadProposal(p)} title={p.name}>Carregar</button><button className="btn btn-ghost text-[11px]" onClick={() => removeProposal(p.id)}>remover</button></span>)}</div></td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

function isViable(s: Scenario, r: Results): boolean {
  const inv = r.parties[r.parties.length - 1];
  const minDSCR = Math.max(0, ...s.loans.filter((l) => l.enabled).map((l) => l.minDSCR));
  if (inv.irr == null || inv.irr < s.equity.investor.targetIRR) return false;
  if (r.metrics.dscrMin != null && r.metrics.dscrMin < minDSCR) return false;
  if (r.alerts.some((a) => a.level === 'error')) return false;
  return true;
}

/* ---------------- Slider ligado ao cenário ---------------- */
function Slider({ s, path, label, min, max, step, fmt, scale, unit, onChange }: { s: Scenario; path: string; label: string; min: number; max: number; step: number; fmt: (v: number) => string; scale: number; unit: string; onChange: (path: string, v: number) => void }) {
  const v = (getPath(s, path) as number) ?? 0;
  const locked = s.kind === 'excel';
  const dec = scale >= 1e6 ? 2 : scale === 1 ? 1 : 1;
  const shown = Math.round((v / scale) * 10 ** dec) / 10 ** dec;
  return (
    <div className="py-1.5 border-b border-sand-2 last:border-0">
      <div className="flex items-center justify-between text-[13px]">
        <span className="flex items-center gap-2 text-ink-2"><ProvDot entry={provFor(s, path)} path={path} />{label}</span>
        <span className="num text-ink text-[15px]">{fmt(v)}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <input type="range" className="flex-1" min={min} max={max} step={step} value={Math.min(max, Math.max(min, v))} disabled={locked} onChange={(e) => onChange(path, Number(e.target.value))} />
        <input type="number" className="w-20 text-[12px]" value={shown} step={step / scale} disabled={locked} onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) onChange(path, n * scale); }} />
        <span className="text-[11px] text-ink-3 w-10">{unit}</span>
      </div>
    </div>
  );
}

function Stat({ l, v, h, tone }: { l: string; v: string; h?: string; tone?: 'good' | 'bad' | 'default' }) {
  return (
    <div className="border-l border-line pl-3">
      <div className="text-[11px] font-semibold text-ink-3 tracking-wide">{l}</div>
      <div className={`num text-[20px] leading-tight mt-0.5 ${tone === 'bad' ? 'text-rust' : tone === 'good' ? 'text-green-3' : 'text-ink'}`}>{v}</div>
      {h && <div className="text-[11px] text-ink-3 mt-0.5">{h}</div>}
    </div>
  );
}

function PRow({ label, vals, strong }: { label: string; vals: string[]; strong?: boolean }) {
  return <tr><td className="text-ink-2 whitespace-nowrap">{label}</td>{vals.map((v, i) => <td key={i} className={`r ${strong ? 'font-semibold text-ink' : ''}`}>{v}</td>)}</tr>;
}

/* ---------------- Análise reversa ---------------- */
function ReversePanel({ s }: { s: Scenario }) {
  const inv = s.equity.investor;
  const [inp, setInp] = useState({ contribution: inv.contribution, guaranteeCommitted: s.guarantees.investor.committed, guaranteeFeePct: s.guarantees.investor.feePct, targetIRR: inv.targetIRR, horizonYears: inv.horizonYears });
  const [snap, setSnap] = useState<typeof inp | null>(null);
  const [result, setResult] = useState<{ main: ReturnType<typeof requiredStake>; grid: ({ target: number } & ReturnType<typeof requiredStake>)[] } | null>(null);
  const run = () => {
    const snapshot = { ...inp };
    setSnap(snapshot);
    setResult({ main: requiredStake(s, snapshot), grid: [0.15, 0.2, 0.25, 0.3].map((t) => ({ target: t, ...requiredStake(s, { ...snapshot, targetIRR: t }) })) });
  };
  const num = (k: keyof typeof inp, pct = false) => (
    <input type="number" className="w-28 text-[12px]" step={pct ? 0.5 : 100000} value={pct ? Math.round(inp[k] * 1000) / 10 : inp[k]} onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) setInp({ ...inp, [k]: pct ? n / 100 : n }); }} />
  );
  const mainR = result?.main.results ?? null;
  return (
    <Panel title="Análise reversa: participação necessária" subtitle="Dado o aporte, as garantias e a TIR-alvo, qual participação o investidor precisa receber?" actions={<button className="btn btn-primary whitespace-nowrap shrink-0" onClick={run}>Calcular participação necessária</button>}>
      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        <div>
          <L l="Aporte (R$)">{num('contribution')}</L>
          <L l="Garantias (R$)">{num('guaranteeCommitted')}</L>
          <L l="Fee das garantias (% a.a.)">{num('guaranteeFeePct', true)}</L>
          <L l="TIR-alvo (%)">{num('targetIRR', true)}</L>
          <L l="Horizonte / saída (anos)"><input type="number" className="w-28 text-[12px]" step={1} min={3} max={15} value={inp.horizonYears} onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) setInp({ ...inp, horizonYears: n }); }} /></L>
          <div className="mt-2"><Note>Entradas locais (não gravam no cenário). O cálculo busca a participação que iguala a TIR do investidor à TIR-alvo, com saída no horizonte informado; leva ~0,3 s por alvo.</Note></div>
        </div>
        <div>
          {!result ? <div className="text-[13px] text-ink-3">Informe os parâmetros e clique em “Calcular participação necessária”.</div> : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-3">
                <Stat l="Participação necessária" v={result.main.stake == null ? 'não há solução' : fmtPct(result.main.stake)} h={result.main.stake == null ? 'TIR-alvo inatingível entre 0,5% e 95%' : `para TIR ${fmtPct(snap?.targetIRR, 0)} com saída no ano ${snap?.horizonYears}`} tone={result.main.stake == null ? 'bad' : 'good'} />
                <Stat l="VPL do investidor" v={mainR ? fmtM(mainR.parties[mainR.parties.length - 1].npv) : '—'} />
                <Stat l="MOIC do investidor" v={mainR ? fmtX(mainR.parties[mainR.parties.length - 1].moic, 1) : '—'} />
                <Stat l="TIR dos sócios atuais" v={mainR ? fmtPct(mainR.parties[0].irr) : '—'} h={mainR ? `diluição ${fmtPct(mainR.metrics.dilution)}` : undefined} />
              </div>
              <table className="data text-[12px] mt-4">
                <thead><tr><th>TIR-alvo</th><th className="r">Participação necessária</th><th className="r">Pré-money implícito</th><th className="r">VPL investidor</th><th className="r">MOIC</th><th className="r">TIR sócios atuais</th></tr></thead>
                <tbody>
                  {result.grid.map((g) => (
                    <tr key={g.target}>
                      <td>{fmtPct(g.target, 0)}</td>
                      <td className="r font-semibold text-ink">{g.stake == null ? 'sem solução' : fmtPct(g.stake)}</td>
                      <td className="r">{g.stake == null || g.stake <= 0 || !snap ? '—' : fmtM(snap.contribution / g.stake - snap.contribution)}</td>
                      <td className="r">{g.results ? fmtM(g.results.parties[g.results.parties.length - 1].npv) : '—'}</td>
                      <td className="r">{g.results ? fmtX(g.results.parties[g.results.parties.length - 1].moic, 1) : '—'}</td>
                      <td className="r">{g.results ? fmtPct(g.results.parties[0].irr) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-2 text-[11px] text-ink-3">Pré-money implícito = aporte / participação − aporte (ignora participação adicional por garantias no modelo C).</div>
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}
function L({ l, children }: { l: string; children: ReactNode }) {
  return <label className="flex items-center justify-between gap-3 py-1.5 border-b border-sand-2 last:border-0 text-[13px] text-ink-2"><span>{l}</span>{children}</label>;
}
