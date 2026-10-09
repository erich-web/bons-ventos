import { useEffect, useState, type ReactNode, Suspense, lazy } from 'react';
import { useScenarios, useActiveScenario } from './store/scenarios';
import { ProvLegend } from './components/ui';
import { useResults } from './lib/useResults';
import { fmtPct, fmtM } from './lib/format';

const pages = {
  overview: { label: 'Overview', comp: lazy(() => import('./pages/Overview')) },
  dashboard: { label: 'Investment Dashboard', comp: lazy(() => import('./pages/Dashboard')) },
  hotel: { label: 'Operação Hoteleira', comp: lazy(() => import('./pages/Hotel')) },
  weddings: { label: 'Weddings & Events', comp: lazy(() => import('./pages/Weddings')) },
  fnb: { label: 'Gastronomia & Beach Club', comp: lazy(() => import('./pages/Gastronomy')) },
  financing: { label: 'Financiamento BNB', comp: lazy(() => import('./pages/Financing')) },
  equity: { label: 'Equity & Investor Structure', comp: lazy(() => import('./pages/Equity')) },
  returns: { label: 'Investor Returns', comp: lazy(() => import('./pages/Returns')) },
  lab: { label: 'Scenario Lab', comp: lazy(() => import('./pages/ScenarioLab')) },
  presentation: { label: 'Investor Presentation', comp: lazy(() => import('./pages/Presentation')) },
  audit: { label: 'Auditoria & Conciliação', comp: lazy(() => import('./pages/Audit')) },
} as const;
export type PageKey = keyof typeof pages;

function useHashPage(): [PageKey, (p: PageKey) => void] {
  const read = () => (location.hash.replace('#/', '').split('?')[0] || 'overview') as PageKey;
  const [p, setP] = useState<PageKey>(() => (pages[read()] ? read() : 'overview'));
  useEffect(() => { const h = () => setP(pages[read()] ? read() : 'overview'); window.addEventListener('hashchange', h); return () => window.removeEventListener('hashchange', h); }, []);
  return [p, (k) => { location.hash = `#/${k}`; window.scrollTo({ top: 0 }); }];
}

export default function App() {
  const [page, go] = useHashPage();
  const Page = pages[page].comp;
  const isPresentation = page === 'presentation';
  return (
    <div className="min-h-screen flex">
      {!isPresentation && <Sidebar page={page} go={go} />}
      <main className={`flex-1 min-w-0 ${isPresentation ? '' : 'px-4 py-5 lg:px-8 lg:py-7 max-w-[1500px]'}`}>
        {!isPresentation && <MobileNav page={page} go={go} />}
        {!isPresentation && <TopBar />}
        <Suspense fallback={<div className="text-ink-3 p-10">Carregando…</div>}>
          <Page go={go} />
        </Suspense>
        {!isPresentation && <footer className="mt-10 pt-4 rule text-[11px] text-ink-3 flex flex-wrap gap-6 justify-between"><ProvLegend /><span>Hotel Bons Ventos · plataforma de viabilidade, financiamento e estruturação societária · valores nominais em R$</span></footer>}
      </main>
    </div>
  );
}

function Sidebar({ page, go }: { page: PageKey; go: (p: PageKey) => void }) {
  const groups: { title: string; keys: PageKey[] }[] = [
    { title: 'Projeto', keys: ['overview', 'dashboard'] },
    { title: 'Operação', keys: ['hotel', 'weddings', 'fnb'] },
    { title: 'Capital', keys: ['financing', 'equity', 'returns'] },
    { title: 'Cenários', keys: ['lab', 'audit', 'presentation'] },
  ];
  return (
    <nav className="hidden lg:flex w-[232px] shrink-0 bg-green text-cream/90 min-h-screen sticky top-0 self-start no-print flex-col">
      <div className="px-6 pt-7 pb-5">
        <div className="display text-[26px] leading-none text-cream">Bons Ventos</div>
        <div className="text-[11px] text-cream/60 mt-1.5">Barrinha · Acaraú · Ceará</div>
      </div>
      <div className="flex-1 px-3">
        {groups.map((g) => (
          <div key={g.title} className="mb-4">
            <div className="px-3 text-[10px] font-semibold tracking-widest text-cream/40 mb-1">{g.title}</div>
            {g.keys.map((k) => (
              <button key={k} onClick={() => go(k)} className={`w-full text-left px-3 py-1.5 rounded-sm text-[13px] transition-colors ${page === k ? 'bg-cream/12 text-white font-semibold' : 'text-cream/75 hover:text-white hover:bg-cream/8'}`}>{pages[k].label}</button>
            ))}
          </div>
        ))}
      </div>
      <div className="px-6 py-5 text-[10px] text-cream/40 leading-relaxed">Motor financeiro v1 · conciliado com BARR_EVB R05</div>
    </nav>
  );
}

function MobileNav({ page, go }: { page: PageKey; go: (p: PageKey) => void }) {
  return (
    <div className="lg:hidden flex items-center justify-between gap-3 mb-4 no-print">
      <span className="display text-[20px] text-green">Bons Ventos</span>
      <select value={page} onChange={(e) => go(e.target.value as PageKey)} className="max-w-[60%]">
        {(Object.keys(pages) as PageKey[]).map((k) => <option key={k} value={k}>{pages[k].label}</option>)}
      </select>
    </div>
  );
}

function TopBar() {
  const scenarios = useScenarios((st) => st.scenarios);
  const activeId = useScenarios((st) => st.activeId);
  const setActive = useScenarios((st) => st.setActive);
  const duplicate = useScenarios((st) => st.duplicate);
  const resetToOriginal = useScenarios((st) => st.resetToOriginal);
  const s = useActiveScenario();
  const r = useResults(s);
  const m = r.metrics;
  const locked = s.kind === 'excel';
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-7 pb-4 border-b border-line no-print">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[11px] font-semibold text-ink-3 tracking-wide">Cenário ativo</span>
        <select value={activeId} onChange={(e) => setActive(e.target.value)} className="min-w-[220px] font-medium">
          {scenarios.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
        </select>
        {locked ? <span className="chip bg-sand text-ink-2">somente leitura · réplica do Excel</span> : <span className="chip bg-gold-2/60 text-ink-2">{s.kind === 'custom' ? 'personalizado' : 'revisado'}</span>}
        <button className="btn" onClick={() => duplicate(activeId)}>Duplicar</button>
        {['base', 'conservador', 'otimista'].includes(activeId) && <button className="btn" onClick={() => { if (confirm('Restaurar as premissas originais deste cenário?')) resetToOriginal(activeId); }}>Restaurar premissas</button>}
      </div>
      <div className="flex items-center gap-5 text-[12px] text-ink-2">
        <Mini label="TIR projeto" v={fmtPct(m.irrProject)} />
        <Mini label="VPL" v={fmtM(m.npvProject)} />
        <Mini label="EBITDA estab." v={fmtM(m.ebitdaStabilized)} />
        <Mini label="DSCR mín." v={m.dscrMin == null ? '—' : `${m.dscrMin.toFixed(2)}×`} />
        {r.alerts.length > 0 && <span className={`chip ${r.alerts.some((a) => a.level === 'error') ? 'bg-rust/15 text-rust' : 'bg-gold-2/60 text-ink-2'}`}>{r.alerts.length} alerta{r.alerts.length > 1 ? 's' : ''}</span>}
      </div>
    </div>
  );
}
function Mini({ label, v }: { label: string; v: ReactNode }) {
  return <span className="flex flex-col leading-tight"><span className="text-[10px] text-ink-3">{label}</span><span className="num text-[16px] text-ink">{v}</span></span>;
}
