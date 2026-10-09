/**
 * Camada Data & Assumptions: cenários persistidos (localStorage), cenário ativo, propostas de negociação salvas.
 * O cenário "excel-r05" é sempre regenerado do JSON original (somente leitura).
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Scenario, ProvenanceEntry } from '../engine/types';
import { excelScenario, baseScenario, conservativeScenario, optimisticScenario } from '../engine/scenarios';
import { setPath, getPath } from '../engine/analysis';

export interface Proposal {
  id: string; name: string; createdAt: string; scenarioId: string;
  contribution: number; stake: number; guaranteeCommitted: number; guaranteeFeePct: number; guaranteeModel: 'A' | 'B' | 'C'; preMoney: number; exitYear: number; exitMultiple: number; payoutPct: number;
  loanAmount: number;
  summary: { investorIRR: number | null; investorNPV: number; investorMOIC: number; existingIRR: number | null; irrProject: number | null; dscrMin: number | null; equityNeed: number; viable: boolean };
}

interface State {
  scenarios: Scenario[];
  activeId: string;
  compareIds: string[];
  proposals: Proposal[];
  setActive: (id: string) => void;
  setCompare: (ids: string[]) => void;
  update: (id: string, path: string, value: unknown, prov?: Partial<ProvenanceEntry>) => void;
  replace: (s: Scenario) => void;
  duplicate: (id: string, name?: string) => string;
  remove: (id: string) => void;
  resetToOriginal: (id: string) => void;
  resetAll: () => void;
  addProposal: (p: Proposal) => void;
  removeProposal: (id: string) => void;
  importScenario: (s: Scenario) => void;
}

const factory: Record<string, () => Scenario> = { 'excel-r05': excelScenario, base: baseScenario, conservador: conservativeScenario, otimista: optimisticScenario };
const defaults = () => [excelScenario(), baseScenario(), conservativeScenario(), optimisticScenario()];

export const useScenarios = create<State>()(
  persist(
    (set, get) => ({
      scenarios: defaults(),
      activeId: 'base',
      compareIds: ['base', 'conservador', 'otimista'],
      proposals: [],
      setActive: (id) => set({ activeId: id }),
      setCompare: (ids) => set({ compareIds: ids.slice(0, 4) }),
      update: (id, path, value, prov) =>
        set((st) => ({
          scenarios: st.scenarios.map((s) => {
            if (s.id !== id || s.kind === 'excel') return s;
            const prevVal = getPath(s, path);
            if (JSON.stringify(prevVal) === JSON.stringify(value)) return s;
            const next = setPath(s, path, value);
            next.updatedAt = new Date().toISOString();
            const root = path.split('.').slice(0, 2).join('.');
            const inherited = next.provenance[path] ?? next.provenance[root] ?? {};
            const merged = { ...inherited, ...prov } as Partial<ProvenanceEntry>;
            const entry: ProvenanceEntry = { source: merged.source ?? 'hypothesis', status: 'revised', ref: merged.ref, note: merged.note ?? `Editado na plataforma (${new Date().toLocaleDateString('pt-BR')})` };
            next.provenance = { ...next.provenance, [path]: entry };
            return next;
          }),
        })),
      replace: (sc) => set((st) => ({ scenarios: st.scenarios.map((s) => (s.id === sc.id ? { ...sc, updatedAt: new Date().toISOString() } : s)) })),
      duplicate: (id, name) => {
        const src = get().scenarios.find((s) => s.id === id);
        const nid = `custom-${Date.now().toString(36)}`;
        if (src) {
          const copy = structuredClone(src);
          copy.id = nid; copy.kind = 'custom'; copy.name = name ?? `${src.name} (cópia)`; copy.createdAt = copy.updatedAt = new Date().toISOString();
          copy.description = `Derivado de "${src.name}".`;
          set((st) => ({ scenarios: [...st.scenarios, copy], activeId: nid }));
        }
        return nid;
      },
      remove: (id) => set((st) => {
        const scenarios = st.scenarios.filter((s) => s.id !== id || s.kind === 'excel' || s.kind === 'base');
        return { scenarios, activeId: st.activeId === id ? 'base' : st.activeId, compareIds: st.compareIds.filter((c) => c !== id) };
      }),
      resetToOriginal: (id) => set((st) => ({ scenarios: st.scenarios.map((s) => (s.id === id && factory[id] ? factory[id]() : s)) })),
      resetAll: () => set({ scenarios: defaults(), activeId: 'base', compareIds: ['base', 'conservador', 'otimista'], proposals: [] }),
      addProposal: (p) => set((st) => ({ proposals: [p, ...st.proposals].slice(0, 30) })),
      removeProposal: (id) => set((st) => ({ proposals: st.proposals.filter((p) => p.id !== id) })),
      importScenario: (sc) => set((st) => ({ scenarios: [...st.scenarios.filter((s) => s.id !== sc.id), { ...sc, kind: sc.kind === 'excel' ? 'custom' : sc.kind }], activeId: sc.id })),
    }),
    {
      name: 'bons-ventos-scenarios-v1',
      version: 1,
      partialize: (st) => ({ scenarios: st.scenarios.filter((s) => s.kind !== 'excel'), activeId: st.activeId, compareIds: st.compareIds, proposals: st.proposals }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<State>;
        const saved = (p.scenarios ?? []).filter((s) => s && s.id && s.kind !== 'excel');
        // garante que os três cenários padrão existam (e que tenham o schema atual)
        const ids = new Set(saved.map((s) => s.id));
        const base = defaults().filter((d) => !ids.has(d.id));
        const scenarios = [excelScenario(), ...base.filter((d) => d.kind !== 'excel'), ...saved].map((s) => ensureSchema(s));
        return { ...current, ...p, scenarios, activeId: p.activeId && scenarios.some((s) => s.id === p.activeId) ? p.activeId : 'base' };
      },
    },
  ),
);

/** Preenche campos ausentes (cenários salvos com schema antigo) a partir do Base. */
function ensureSchema(s: Scenario): Scenario {
  const ref = baseScenario();
  const fill = (target: Record<string, unknown>, src: Record<string, unknown>) => {
    for (const k of Object.keys(src)) {
      if (target[k] === undefined) target[k] = src[k];
      else if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && typeof target[k] === 'object' && !Array.isArray(target[k])) fill(target[k] as Record<string, unknown>, src[k] as Record<string, unknown>);
    }
  };
  const out = structuredClone(s) as unknown as Record<string, unknown>;
  fill(out, ref as unknown as Record<string, unknown>);
  return out as unknown as Scenario;
}

export const useActiveScenario = () => useScenarios((st) => st.scenarios.find((s) => s.id === st.activeId) ?? st.scenarios[0]);
