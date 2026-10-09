/* Kit de componentes compartilhado — usado por todas as páginas. */
import React, { useState, type ReactNode } from 'react';
import type { ProvenanceEntry, Scenario, Grid } from '../engine/types';
import { getPath } from '../engine/analysis';
import { useScenarios } from '../store/scenarios';
import { fmtPct, fmtNum, MONTHS_PT } from '../lib/format';
import { traceInputs } from '../engine/trace';

/* ---------- Cabeçalho de página ---------- */
export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-6 mb-6">
      <div>
        <h1 className="text-[34px] leading-none font-medium text-green">{title}</h1>
        {subtitle && <p className="mt-2 text-ink-2 max-w-3xl leading-relaxed">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0 no-print">{actions}</div>}
    </div>
  );
}

/* ---------- Faixa de indicadores (ledger) ---------- */
export interface KpiItem { label: string; value: string; hint?: string; tone?: 'default' | 'good' | 'bad' | 'muted'; traceId?: string }
export function Ledger({ items, cols }: { items: KpiItem[]; cols?: number }) {
  const [trace, setTrace] = useState<string | null>(null);
  return (
    <>
      <div className="ledger" style={{ gridTemplateColumns: `repeat(${cols ?? Math.min(items.length, 6)}, minmax(0,1fr))` }}>
        {items.map((k) => (
          <div key={k.label} className={k.traceId ? 'cursor-pointer hover:bg-sand-2/60 transition-colors' : ''} onClick={() => k.traceId && setTrace(k.traceId)} title={k.traceId ? 'Ver premissas que influenciam este indicador' : undefined}>
            <div className="text-[11px] font-semibold tracking-wide text-ink-3">{k.label}</div>
            <div className={`num text-[26px] leading-tight mt-1 ${k.tone === 'good' ? 'text-green-3' : k.tone === 'bad' ? 'text-rust' : k.tone === 'muted' ? 'text-ink-3' : 'text-ink'}`}>{k.value}</div>
            {k.hint && <div className="text-[11px] text-ink-3 mt-0.5">{k.hint}</div>}
          </div>
        ))}
      </div>
      {trace && <TraceDrawer id={trace} onClose={() => setTrace(null)} />}
    </>
  );
}

/* ---------- Painel ---------- */
export function Panel({ title, subtitle, children, actions, className = '' }: { title?: ReactNode; subtitle?: string; children: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      {(title || actions) && (
        <div className="panel-h">
          <div>
            {title && <h2 className="text-[17px] font-medium text-green leading-tight">{title}</h2>}
            {subtitle && <p className="text-[12px] text-ink-3 mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

/* ---------- Proveniência ---------- */
const PROV_LABEL: Record<string, string> = { excel: 'Excel original', doc: 'Documento de referência', hypothesis: 'Hipótese nova', calculated: 'Calculado' };
const PROV_COLOR: Record<string, string> = { excel: 'bg-green-3', doc: 'bg-ocean-2', hypothesis: 'bg-gold', calculated: 'bg-ink-3' };
export function ProvDot({ entry, path }: { entry?: ProvenanceEntry; path?: string }) {
  if (!entry) return <span className="inline-block w-2 h-2 rounded-full bg-sand border border-line" title={`Sem origem registrada${path ? ` (${path})` : ''}`} />;
  const pending = entry.status === 'pending';
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${PROV_COLOR[entry.source]} ${pending ? 'ring-2 ring-rust/60' : ''}`}
      title={`${PROV_LABEL[entry.source]} · ${entry.status === 'original' ? 'premissa original' : entry.status === 'revised' ? 'premissa revisada' : 'pendente de validação'}${entry.ref ? ` · ${entry.ref}` : ''}${entry.note ? `\n${entry.note}` : ''}`}
    />
  );
}
export function ProvLegend() {
  return (
    <div className="flex flex-wrap gap-4 text-[11px] text-ink-3">
      <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-green-3 inline-block" /> Excel original</span>
      <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-ocean-2 inline-block" /> Documento de referência</span>
      <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-gold inline-block" /> Hipótese nova</span>
      <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-gold ring-2 ring-rust/60 inline-block" /> Pendente de validação</span>
      <span className="flex items-center gap-1.5"><i className="w-2 h-2 rounded-full bg-ink-3 inline-block" /> Resultado calculado</span>
    </div>
  );
}
/** Busca a entrada de proveniência mais específica para um caminho (ex.: hotel.rateNormalYear1 → hotel). */
export function provFor(s: Scenario, path: string): ProvenanceEntry | undefined {
  const parts = path.split('.');
  for (let i = parts.length; i > 0; i--) { const e = s.provenance[parts.slice(0, i).join('.')]; if (e) return e; }
  return undefined;
}

/* ---------- Inputs ligados ao cenário ---------- */
interface FieldProps { s: Scenario; path: string; label: string; kind?: 'number' | 'pct' | 'money' | 'int' | 'text' | 'ym'; step?: number; min?: number; max?: number; hint?: string; disabled?: boolean; suffix?: string }
export function Field({ s, path, label, kind = 'number', step, min, max, hint, disabled, suffix }: FieldProps) {
  const update = useScenarios((st) => st.update);
  const raw = getPath(s, path) as number | string | null;
  const locked = disabled || s.kind === 'excel';
  const prov = provFor(s, path);
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (kind === 'pct' ? (raw == null ? '' : String(Math.round((raw as number) * 10000) / 100)) : raw == null ? '' : String(raw));
  const commit = () => {
    if (draft === null) return;
    let v: unknown = draft;
    if (kind === 'pct') v = parseFloat(draft.replace(',', '.')) / 100;
    else if (kind !== 'text' && kind !== 'ym') v = parseFloat(draft.replace(',', '.'));
    if (kind !== 'text' && kind !== 'ym' && (v === null || Number.isNaN(v))) { setDraft(null); return; }
    update(s.id, path, v);
    setDraft(null);
  };
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 border-b border-sand-2 last:border-0">
      <span className="flex items-center gap-2 text-[13px] text-ink-2 min-w-0">
        <ProvDot entry={prov} path={path} />
        <span className="truncate" title={hint ?? path}>{label}</span>
      </span>
      <span className="flex items-center gap-1 shrink-0">
        <input
          type={kind === 'text' || kind === 'ym' ? 'text' : 'number'} className="w-28" value={display} disabled={locked}
          step={step ?? (kind === 'pct' ? 0.5 : kind === 'int' ? 1 : kind === 'money' ? 1000 : 0.01)} min={min} max={max}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <span className="text-[11px] text-ink-3 w-6">{suffix ?? (kind === 'pct' ? '%' : kind === 'money' ? 'R$' : '')}</span>
      </span>
    </label>
  );
}
export function SelectField<T extends string>({ s, path, label, options, disabled }: { s: Scenario; path: string; label: string; options: { value: T; label: string }[]; disabled?: boolean }) {
  const update = useScenarios((st) => st.update);
  const v = getPath(s, path) as T;
  const prov = provFor(s, path);
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 border-b border-sand-2 last:border-0">
      <span className="flex items-center gap-2 text-[13px] text-ink-2"><ProvDot entry={prov} path={path} />{label}</span>
      <select value={v ?? ''} disabled={disabled || s.kind === 'excel'} onChange={(e) => update(s.id, path, e.target.value)} className="w-40">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
export function ToggleField({ s, path, label, disabled }: { s: Scenario; path: string; label: string; disabled?: boolean }) {
  const update = useScenarios((st) => st.update);
  const v = !!getPath(s, path);
  const prov = provFor(s, path);
  return (
    <label className="flex items-center justify-between gap-3 py-1.5 border-b border-sand-2 last:border-0 cursor-pointer">
      <span className="flex items-center gap-2 text-[13px] text-ink-2"><ProvDot entry={prov} path={path} />{label}</span>
      <input type="checkbox" checked={v} disabled={disabled || s.kind === 'excel'} onChange={(e) => update(s.id, path, e.target.checked)} className="accent-green w-4 h-4" />
    </label>
  );
}
/** Vetor de 12 meses editável (linha). */
export function MonthRow({ s, path, label, kind = 'number', digits = 0 }: { s: Scenario; path: string; label: string; kind?: 'number' | 'pct'; digits?: number }) {
  const update = useScenarios((st) => st.update);
  const arr = (getPath(s, path) as number[]) ?? [];
  const locked = s.kind === 'excel';
  const set = (m: number, val: string) => { const n = parseFloat(val.replace(',', '.')); if (Number.isNaN(n)) return; const next = arr.slice(); next[m] = kind === 'pct' ? n / 100 : n; update(s.id, path, next); };
  return (
    <tr>
      <td className="pr-3 text-ink-2 whitespace-nowrap"><span className="inline-flex items-center gap-2"><ProvDot entry={provFor(s, path)} path={path} />{label}</span></td>
      {arr.map((v, m) => (
        <td key={m} className="px-0.5">
          <input type="number" className="w-[62px] text-[12px] px-1" disabled={locked} defaultValue={kind === 'pct' ? Math.round(v * 1000) / 10 : Math.round(v * 10 ** digits) / 10 ** digits} key={`${m}-${v}`} onBlur={(e) => set(m, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        </td>
      ))}
    </tr>
  );
}
/** Grade ano × mês editável. */
export function GridEditor({ s, path, label, kind = 'pct', yearsLabel = 'Ano' }: { s: Scenario; path: string; label: string; kind?: 'pct' | 'number'; yearsLabel?: string }) {
  const update = useScenarios((st) => st.update);
  const grid = (getPath(s, path) as Grid) ?? [];
  const locked = s.kind === 'excel';
  const set = (y: number, m: number, val: string) => { const n = parseFloat(val.replace(',', '.')); if (Number.isNaN(n)) return; const next = grid.map((r) => r.slice()); next[y][m] = kind === 'pct' ? n / 100 : n; update(s.id, path, next); };
  const avg = (r: number[]) => r.reduce((a, b) => a + b, 0) / r.length;
  return (
    <div className="overflow-x-auto">
      <div className="flex items-center gap-2 mb-2 text-[13px] text-ink-2"><ProvDot entry={provFor(s, path)} path={path} />{label}</div>
      <table className="data">
        <thead><tr><th>{yearsLabel}</th>{MONTHS_PT.map((m) => <th key={m} className="r">{m}</th>)}<th className="r">Média</th></tr></thead>
        <tbody>
          {grid.map((row, y) => (
            <tr key={y}>
              <td className="text-ink-3">{y + 1}</td>
              {row.map((v, m) => (
                <td key={m} className="px-0.5"><input type="number" className="w-[58px] text-[12px] px-1" disabled={locked} key={`${y}-${m}-${v}`} defaultValue={kind === 'pct' ? Math.round(v * 1000) / 10 : v} onBlur={(e) => set(y, m, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} /></td>
              ))}
              <td className="r text-ink-2">{kind === 'pct' ? fmtPct(avg(row)) : fmtNum(avg(row), 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------- Tabela anual genérica ---------- */
export interface Column<T> { key: string; label: string; render: (row: T) => ReactNode; align?: 'r' | 'l'; strong?: boolean }
export function DataTable<T>({ rows, columns, rowKey, dense }: { rows: T[]; columns: Column<T>[]; rowKey: (r: T) => string | number; dense?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className={`data ${dense ? 'text-[12px]' : ''}`}>
        <thead><tr>{columns.map((c) => <th key={c.key} className={c.align ?? 'r'}>{c.label}</th>)}</tr></thead>
        <tbody>{rows.map((r) => <tr key={rowKey(r)}>{columns.map((c) => <td key={c.key} className={`${c.align ?? 'r'} ${c.strong ? 'font-semibold text-ink' : ''}`}>{c.render(r)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/* ---------- Alertas ---------- */
export function AlertList({ alerts }: { alerts: { level: string; message: string; code: string }[] }) {
  if (!alerts.length) return <div className="text-[13px] text-green-3">Nenhum alerta: o cenário é financeiramente consistente dentro das premissas.</div>;
  return (
    <ul className="space-y-1.5">
      {alerts.map((a, i) => (
        <li key={i} className={`flex gap-2 text-[13px] ${a.level === 'error' ? 'text-rust' : a.level === 'warning' ? 'text-gold' : 'text-ocean-2'}`}>
          <span className="mt-[5px] w-2 h-2 rounded-full shrink-0 bg-current" />{a.message}
        </li>
      ))}
    </ul>
  );
}

/* ---------- Rastreabilidade ---------- */
export function TraceDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { nodes, inputs } = traceInputs(id);
  const root = nodes[0];
  return (
    <div className="fixed inset-0 z-50 flex justify-end no-print" onClick={onClose}>
      <div className="absolute inset-0 bg-ink/30" />
      <aside className="relative w-[460px] max-w-full h-full bg-paper shadow-2xl overflow-y-auto p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div><div className="text-[11px] font-semibold text-ink-3 tracking-wide">Auditoria do indicador</div><h2 className="text-[24px] text-green mt-1">{root?.label ?? id}</h2></div>
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
        <ol className="mt-5 space-y-4">
          {nodes.map((n, i) => (
            <li key={n.id} className="border-l-2 border-sand pl-3">
              <div className="text-[13px] font-semibold text-ink">{i === 0 ? '' : '↳ '}{n.label}</div>
              <div className="text-[12px] text-ink-2 mt-0.5">{n.formula}</div>
              {n.inputs.length > 0 && <div className="text-[11px] text-ink-3 mt-1">Premissas: {n.inputs.join(', ')}</div>}
            </li>
          ))}
        </ol>
        <div className="mt-6 rule pt-4">
          <div className="text-[11px] font-semibold text-ink-3 tracking-wide">Todas as premissas que influenciam este indicador ({inputs.length})</div>
          <div className="mt-2 flex flex-wrap gap-1">{inputs.map((p) => <code key={p} className="text-[11px] bg-sand-2 px-1.5 py-0.5 rounded-sm">{p}</code>)}</div>
        </div>
      </aside>
    </div>
  );
}

/* ---------- Diversos ---------- */
export function Note({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'warn' }) {
  return <p className={`text-[12px] leading-relaxed ${tone === 'warn' ? 'text-rust' : 'text-ink-3'} border-l-2 ${tone === 'warn' ? 'border-rust/50' : 'border-gold-2'} pl-3`}>{children}</p>;
}
export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: string }[] }) {
  return (
    <div className="flex gap-1 border-b border-line mb-4 no-print">
      {items.map((it) => (
        <button key={it.value} onClick={() => onChange(it.value)} className={`px-3 py-2 text-[13px] -mb-px border-b-2 transition-colors ${value === it.value ? 'border-green text-green font-semibold' : 'border-transparent text-ink-3 hover:text-ink'}`}>{it.label}</button>
      ))}
    </div>
  );
}
export const CHART_COLORS = { hotel: '#14352C', weddings: '#1E4F6E', fnb: '#B8935A', cost: '#7C8782', debt: '#2F6F94', equity: '#2E6B5A', neg: '#9A5B3F', grid: '#E3DACB', text: '#4A5651', sand: '#E8DFCF', gold2: '#D9C39A', ocean3: '#7FA7C2' };
export const chartAxis = { tick: { fontSize: 11, fill: '#4A5651' }, axisLine: { stroke: '#D8CFBF' }, tickLine: false as const };
/** Formatter de tooltip tolerante a undefined (tipagem do Recharts 3). */
export const tipFmt = (f: (v: number, name: string) => string) => ((v: unknown, n: unknown) => f(typeof v === 'number' ? v : Number(v ?? 0), String(n ?? ''))) as never;
export const chartTooltipStyle = { contentStyle: { background: '#FFFDF9', border: '1px solid #D8CFBF', borderRadius: 4, fontSize: 12 }, labelStyle: { color: '#14352C', fontWeight: 600 } };
export function Money({ v }: { v: number }) { return <span className="tnum">{v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}</span>; }
export function useLocal<T>(key: string, init: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => { try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : init; } catch { return init; } });
  return [v, (n: T) => { setV(n); try { localStorage.setItem(key, JSON.stringify(n)); } catch { /* ignore */ } }];
}
export const React_ = React;
