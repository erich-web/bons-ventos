import { useMemo } from 'react';
import { compute } from '../engine/compute';
import type { Scenario, Results } from '../engine/types';
import { useScenarios } from '../store/scenarios';

const cache = new WeakMap<Scenario, Results>();
export function computeCached(s: Scenario): Results {
  let r = cache.get(s);
  if (!r) { r = compute(s); cache.set(s, r); }
  return r;
}
export function useResults(s: Scenario): Results {
  return useMemo(() => computeCached(s), [s]);
}
export function useCompareResults(): { scenario: Scenario; results: Results }[] {
  const scenarios = useScenarios((st) => st.scenarios);
  const ids = useScenarios((st) => st.compareIds);
  return useMemo(() => ids.map((id) => scenarios.find((s) => s.id === id)).filter((s): s is Scenario => !!s).map((s) => ({ scenario: s, results: computeCached(s) })), [scenarios, ids]);
}
