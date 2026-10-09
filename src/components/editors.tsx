/* Editores auxiliares compartilhados pelas páginas de simulador (vetores e tabelas mensais ligados ao cenário). */
import { useState, type ReactNode } from 'react';
import type { Scenario } from '../engine/types';
import { getPath } from '../engine/analysis';
import { useScenarios } from '../store/scenarios';
import { MONTHS_PT } from '../lib/format';
import { ProvDot, provFor } from './ui';

/** Tabela com cabeçalho de meses para abrigar uma ou mais `MonthRow`. */
export function MonthTable({ children, firstCol = 'Premissa' }: { children: ReactNode; firstCol?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className="data">
        <thead><tr><th>{firstCol}</th>{MONTHS_PT.map((m) => <th key={m} className="r">{m}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

/** Vetor curto editável (ex.: crescimento anos 2–6, casamentos por ano). Grava o array inteiro no cenário. */
export function VectorRow({ s, path, label, labels, kind = 'number', hint }: { s: Scenario; path: string; label: string; labels: string[]; kind?: 'number' | 'pct'; hint?: string }) {
  const update = useScenarios((st) => st.update);
  const arr = (getPath(s, path) as number[]) ?? [];
  const locked = s.kind === 'excel';
  const set = (i: number, val: string) => {
    const n = parseFloat(val.replace(',', '.'));
    if (Number.isNaN(n)) return;
    const next = arr.slice();
    while (next.length < labels.length) next.push(next[next.length - 1] ?? 0);
    next[i] = kind === 'pct' ? n / 100 : n;
    update(s.id, path, next);
  };
  return (
    <div className="py-2 border-b border-sand-2 last:border-0">
      <div className="flex items-center gap-2 text-[13px] text-ink-2 mb-1.5"><ProvDot entry={provFor(s, path)} path={path} /><span title={hint ?? path}>{label}</span>{kind === 'pct' && <span className="text-[11px] text-ink-3">(%)</span>}</div>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0,1fr))` }}>
        {labels.map((l, i) => {
          const v = arr[i] ?? arr[arr.length - 1] ?? 0;
          return (
            <label key={l} className="flex flex-col items-stretch gap-0.5 min-w-0">
              <span className="text-[10px] text-ink-3 text-center truncate">{l}</span>
              <input type="number" className="w-full min-w-0 text-[12px] px-1 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" disabled={locked} key={`${i}-${v}`} defaultValue={kind === 'pct' ? Math.round(v * 1000) / 10 : v} onBlur={(e) => set(i, e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            </label>
          );
        })}
      </div>
    </div>
  );
}

/** Input numérico compacto para uso dentro de células de tabela; grava no caminho informado ao sair do campo. */
export function CellInput({ s, path, kind = 'number', width = 'w-[72px]', step }: { s: Scenario; path: string; kind?: 'number' | 'pct' | 'text'; width?: string; step?: number }) {
  const update = useScenarios((st) => st.update);
  const raw = getPath(s, path) as number | string | null;
  const locked = s.kind === 'excel';
  const [draft, setDraft] = useState<string | null>(null);
  const display = draft ?? (raw == null ? '' : kind === 'pct' ? String(Math.round((raw as number) * 10000) / 100) : String(raw));
  const commit = () => {
    if (draft === null) return;
    if (kind === 'text') { update(s.id, path, draft); setDraft(null); return; }
    const n = parseFloat(draft.replace(',', '.'));
    if (!Number.isNaN(n)) update(s.id, path, kind === 'pct' ? n / 100 : n);
    setDraft(null);
  };
  return (
    <input type={kind === 'text' ? 'text' : 'number'} className={`${width} text-[12px] px-1`} value={display} disabled={locked} step={step}
      onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
  );
}

/** Checkbox compacto para células de tabela. */
export function CellToggle({ s, path }: { s: Scenario; path: string }) {
  const update = useScenarios((st) => st.update);
  const v = !!getPath(s, path);
  return <input type="checkbox" className="accent-green w-4 h-4" checked={v} disabled={s.kind === 'excel'} onChange={(e) => update(s.id, path, e.target.checked)} />;
}

/** Soma de uma série mensal restrita aos meses de um ano de operação. */
export function sumOpYear(ser: number[], opYear: number[], y: number): number {
  let t = 0;
  for (let i = 0; i < ser.length; i++) if (opYear[i] === y) t += ser[i];
  return t;
}
