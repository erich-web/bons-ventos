import { useMemo, type ReactNode } from 'react';
import { Ledger, Note } from '../components/ui';
import { useActiveScenario } from '../store/scenarios';
import { useResults } from '../lib/useResults';
import { phaseDates, phaseRooms } from '../engine/compute';
import { fmtM, fmtPct, fmtYM, fmtNum, fmtX } from '../lib/format';
import excel from '../data/excel-r05.json';
import type { PageKey } from '../App';

const AREAS = excel.areas;

export default function Overview({ go }: { go: (p: PageKey) => void }) {
  const s = useActiveScenario();
  const r = useResults(s);
  const m = r.metrics;
  const p1 = phaseDates(s, 1);
  const p2 = phaseDates(s, 2);
  const rooms1 = phaseRooms(s, 1);
  const rooms2 = s.hotel.phase2.enabled ? phaseRooms(s, 2) : 0;
  const weddingsStab = s.weddings.enabled ? s.weddings.countByYear[s.weddings.countByYear.length - 1] : 0;
  const seatsMax = Math.max(...s.restaurant.seats);
  const inv = r.parties[r.parties.length - 1];
  const stabYear = useMemo(() => r.annual.find((a) => a.opYear === m.stabilizedYear)?.year, [r, m.stabilizedYear]);
  const capexGroups = useMemo(() => {
    const t = { construction: 0, ffe: 0, projects: 0, land: 0 };
    for (const a of r.annual) { t.construction += a.capexConstruction; t.ffe += a.capexFfe; t.projects += a.capexProjects; t.land += a.capexLand; }
    return t;
  }, [r]);

  return (
    <div className="-mt-2">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-md border border-line bg-sand px-12 pt-14 pb-12">
        <WindMotif />
        <div className="relative max-w-[640px]">
          <div className="text-[12px] text-ink-2 tracking-wide">Barrinha · Acaraú · Ceará</div>
          <h1 className="display text-[72px] leading-[0.95] font-light text-green mt-4">Hotel<br />Bons Ventos</h1>
          <p className="mt-6 text-[17px] leading-relaxed text-ink-2 max-w-[520px]">Boutique hotel, beach club e destination weddings na Barrinha, Acaraú — Ceará.</p>
          <div className="mt-8 flex flex-wrap gap-3 no-print">
            <button className="btn btn-primary" onClick={() => go('dashboard')}>Ver dashboard</button>
            <button className="btn" onClick={() => go('presentation')}>Apresentação para investidores</button>
          </div>
        </div>
        <div className="relative mt-12 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-4 max-w-[760px] text-[13px]">
          <Fact label="Apartamentos" value={`${rooms1}${rooms2 ? ` + ${rooms2}` : ''} UH`} hint={rooms2 ? 'Fase 01 + Fase 02' : 'Fase 01'} />
          <Fact label="Restaurante" value={`${fmtNum(seatsMax)} lugares`} hint="capacidade máxima" />
          <Fact label="Inauguração" value={fmtYM(p1.opening)} hint={`obra ${fmtYM(p1.constructionStart)} – ${fmtYM(p1.constructionEnd)}`} />
          <Fact label="Investimento" value={fmtM(m.capexP1)} hint="Fase 01, incl. terreno" />
        </div>
      </section>

      {/* Conceito */}
      <section className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-10 mt-14">
        <div>
          <h2 className="text-[30px] leading-tight text-green font-normal">Conceito e posicionamento</h2>
          <p className="mt-3 text-[13px] text-ink-3">Hospitalidade de praia com assinatura própria.</p>
        </div>
        <div className="space-y-4 text-[15px] leading-relaxed text-ink-2 max-w-[640px]">
          <p>Hotel boutique pé na areia, de arquitetura contemporânea integrada à paisagem de dunas, vento e mar do litoral oeste cearense. Poucos apartamentos, serviço próximo e uma proposta que combina natureza, praia e kitesurf com gastronomia autoral.</p>
          <p>O negócio apoia-se em três receitas complementares: hospedagem convencional, beach club com restaurante aberto a visitantes e exclusividade do hotel para casamentos (buyout) — formato em que todo o empreendimento é reservado para o evento por alguns dias.</p>
          <p>O benchmark comercial é o Saline Taíba, referência consolidada no Ceará para destination weddings em hotel boutique, usado como parâmetro de tarifa, ocupação e número de eventos por ano.</p>
        </div>
      </section>

      <div className="rule mt-14" />

      {/* Localização + diferenciais */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 mt-12">
        <div>
          <h2 className="text-[24px] text-green font-normal">Localização</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Barrinha, município de Acaraú, litoral oeste do Ceará — cerca de 250 km de Fortaleza (a validar). Região de praias extensas, ventos constantes e forte vocação para kitesurf, com baixa densidade de hotelaria de alto padrão.</p>
          <dl className="mt-5 grid grid-cols-2 gap-y-3 text-[13px]">
            <dt className="text-ink-3">Terreno (Fase 01)</dt><dd className="tnum text-ink">{fmtNum(AREAS.phase1.land)} m²</dd>
            <dt className="text-ink-3">Área construída (Fase 01)</dt><dd className="tnum text-ink">{fmtNum(AREAS.phase1.built)} m²</dd>
            <dt className="text-ink-3">Área privativa por UH</dt><dd className="tnum text-ink">{fmtNum(AREAS.phase1.private / AREAS.phase1.rooms, 1)} m²</dd>
            <dt className="text-ink-3">Fase 02 (opcional)</dt><dd className="tnum text-ink">{fmtNum(AREAS.phase2.built)} m² · {AREAS.phase2.rooms} UH</dd>
          </dl>
        </div>
        <div>
          <h2 className="text-[24px] text-green font-normal">Diferenciais</h2>
          <ul className="mt-3 space-y-2.5 text-[15px] leading-relaxed text-ink-2">
            <Li>Escala boutique: {rooms1} apartamentos na Fase 01, com possibilidade de expansão para {rooms1 + AREAS.phase2.rooms} UH.</Li>
            <Li>Exclusividade real para casamentos: buyout do hotel inteiro, com locação de espaços, welcome party, catering e bar próprios.</Li>
            <Li>Beach club e restaurante abertos ao público, ampliando a receita por hóspede e a visibilidade da marca.</Li>
            <Li>Gastronomia autoral operada pelo Grupo RPE, com padrões de CMV e CMO dos restaurantes do grupo.</Li>
            <Li>Financiamento de longo prazo via BNB/FNE em estudo, com estrutura societária aberta a um novo investidor.</Li>
          </ul>
        </div>
      </section>

      {/* Placeholder de imagens */}
      <section className="mt-12 border border-dashed border-ink-3/50 rounded-md bg-sand-2/50 px-8 py-10 text-center">
        <div className="display text-[20px] text-green">Imagens e renders do projeto</div>
        <p className="mt-2 text-[13px] text-ink-3 max-w-[520px] mx-auto">Espaço reservado para as perspectivas arquitetônicas, implantação e fotos do terreno. Nenhuma imagem foi incorporada nesta versão.</p>
      </section>

      {/* Números do projeto */}
      <section className="mt-14">
        <h2 className="text-[30px] leading-tight text-green font-normal">Números do projeto</h2>
        <p className="mt-2 text-[13px] text-ink-3">Cenário ativo: {s.name}. Valores calculados pelo motor financeiro a partir das premissas registradas.</p>
        <div className="mt-5">
          <Ledger items={[
            { label: 'UH Fase 01', value: String(rooms1), hint: `inauguração ${fmtYM(p1.opening)}` },
            { label: 'UH Fase 02', value: s.hotel.phase2.enabled ? String(rooms2) : 'não prevista', hint: s.hotel.phase2.enabled ? `inauguração ${fmtYM(p2.opening)}` : 'expansão opcional', tone: s.hotel.phase2.enabled ? 'default' : 'muted' },
            { label: 'Lugares no restaurante', value: fmtNum(seatsMax), hint: `${AREAS.phase1.seats} na Fase 01 · ${AREAS.phase2.seats} na Fase 02` },
            { label: 'Área construída', value: `${fmtNum(AREAS.phase1.built + (s.hotel.phase2.enabled ? AREAS.phase2.built : 0))} m²`, hint: `Fase 01 ${fmtNum(AREAS.phase1.built)} m²` },
            { label: 'Casamentos / ano', value: s.weddings.enabled ? fmtNum(weddingsStab) : '—', hint: s.weddings.enabled ? `estabilizado · ${s.weddings.guests} convidados · ${s.weddings.nights} diárias` : 'módulo desligado' },
            { label: 'Ocupação estabilizada', value: fmtPct(m.occupancyStabilized, 0), hint: `ADR ${fmtNum(m.adrStabilized)} · RevPAR ${fmtNum(m.revparStabilized)}` },
          ]} />
        </div>
      </section>

      {/* Gastronomia + eventos */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-10 mt-12">
        <div>
          <h2 className="text-[24px] text-green font-normal">Estrutura gastronômica</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">Restaurante de {fmtNum(seatsMax)} lugares com giro médio de {fmtNum(avg(s.restaurant.turnover), 1)} por dia e ticket de referência {fmtNum(avg(s.restaurant.ticketYear1))} reais no primeiro ano, além do consumo de A&B dos hóspedes{s.beachClub.enabled ? ` e do beach club (ticket médio ${fmtNum(s.beachClub.ticket)} reais, ${fmtNum(avg(s.beachClub.visitorsPerDay))} visitantes/dia em média)` : ''}.</p>
          <dl className="mt-5 grid grid-cols-2 gap-y-3 text-[13px]">
            <dt className="text-ink-3">Receita A&B estabilizada</dt><dd className="tnum text-ink">{fmtM(stabRow(r, m.stabilizedYear)?.revFnb)}</dd>
            <dt className="text-ink-3">CMV / CMO variável</dt><dd className="tnum text-ink">{fmtPct(s.restaurant.cmvPct, 1)} / {fmtPct(s.restaurant.cmoVarPct, 1)}</dd>
            <dt className="text-ink-3">Beach club</dt><dd className="text-ink">{s.beachClub.enabled ? `a partir do ano ${s.beachClub.startYear}` : 'não modelado'}</dd>
          </dl>
        </div>
        <div>
          <h2 className="text-[24px] text-green font-normal">Potencial de eventos</h2>
          <p className="mt-3 text-[15px] leading-relaxed text-ink-2">{s.weddings.enabled ? `Ramp-up de ${s.weddings.countByYear[0]} para ${weddingsStab} casamentos por ano, cada um com buyout de ${s.weddings.nights} diárias e ${s.weddings.guests} convidados. A operação evolui em três fases comerciais: locação de espaços, depois welcome party, catering e bar próprios, e por fim atividades complementares.` : 'O módulo de casamentos está desligado neste cenário.'}</p>
          <dl className="mt-5 grid grid-cols-2 gap-y-3 text-[13px]">
            <dt className="text-ink-3">Receita de eventos estabilizada</dt><dd className="tnum text-ink">{fmtM(stabRow(r, m.stabilizedYear)?.revWeddings)}</dd>
            <dt className="text-ink-3">Diária de buyout (ano 1)</dt><dd className="tnum text-ink">{s.weddings.enabled ? `R$ ${fmtNum(s.weddings.roomRate)} / UH` : '—'}</dd>
            <dt className="text-ink-3">Locação de espaços</dt><dd className="tnum text-ink">{s.weddings.enabled ? `R$ ${fmtNum(s.weddings.venueFee)}` : '—'}</dd>
          </dl>
        </div>
      </section>

      <div className="rule mt-14" />

      {/* Investimento */}
      <section className="mt-12">
        <h2 className="text-[30px] leading-tight text-green font-normal">Investimento estimado</h2>
        <div className="mt-5">
          <Ledger items={[
            { label: 'CAPEX Fase 01', value: fmtM(m.capexP1), hint: 'inclui terreno e projetos', traceId: 'capex' },
            { label: 'CAPEX Fase 02', value: s.hotel.phase2.enabled ? fmtM(m.capexP2) : '—', hint: s.hotel.phase2.enabled ? `obra a partir de ${fmtYM(p2.constructionStart)}` : 'não prevista' },
            { label: 'CAPEX total', value: fmtM(m.capexTotal), hint: `obra ${fmtM(capexGroups.construction)} · FF&E ${fmtM(capexGroups.ffe)}` },
            { label: 'Financiamento', value: fmtM(m.debtTotal), hint: s.loans.some((l) => l.enabled) ? 'hipótese BNB/FNE em análise' : 'sem dívida no cenário' },
            { label: 'Capital próprio', value: fmtM(m.equityTotal), hint: `exposição máx. ${fmtM(m.maxExposure)} em ${fmtYM(m.maxExposureDate)}` },
          ]} cols={5} />
        </div>
        <div className="mt-4"><Note>Valores de referência do cenário ativo. O enquadramento no BNB (investimento, percentual financiado e garantias) está em análise e deve ser lido como hipótese, não como condição aprovada.</Note></div>
      </section>

      {/* Indicadores */}
      <section className="mt-12 mb-4">
        <h2 className="text-[30px] leading-tight text-green font-normal">Principais indicadores</h2>
        <div className="mt-5">
          <Ledger items={[
            { label: 'TIR do projeto', value: fmtPct(m.irrProject), hint: `sem valor terminal ${fmtPct(m.irrProjectNoTV)}`, tone: m.irrProject != null && m.irrProject < s.valuation.discountRateProject ? 'bad' : 'good', traceId: 'irrProject' },
            { label: 'VPL do projeto', value: fmtM(m.npvProject), hint: `a ${fmtPct(s.valuation.discountRateProject, 1)} a.a.`, tone: m.npvProject < 0 ? 'bad' : 'default', traceId: 'npvProject' },
            { label: 'EBITDA estabilizado', value: fmtM(m.ebitdaStabilized), hint: `margem ${fmtPct(m.ebitdaMarginStabilized, 0)}${stabYear ? ` · ${stabYear}` : ''}`, traceId: 'ebitda' },
            { label: 'Payback', value: fmtYM(m.paybackSimple), hint: `descontado ${fmtYM(m.paybackDiscounted)}` },
            { label: 'TIR do equity', value: fmtPct(m.irrEquity), hint: m.dscrMin != null ? `DSCR mínimo ${fmtX(m.dscrMin)}` : 'sem dívida', traceId: 'irrEquity' },
            { label: 'TIR do investidor', value: fmtPct(inv.irr), hint: inv.totalIn > 0 ? `MOIC ${fmtX(inv.moic, 1)} · ${fmtPct(inv.stakePost, 1)} do capital` : 'sem investidor no cenário', traceId: 'investorIRR' },
          ]} />
        </div>
        <div className="mt-6 flex gap-3 no-print">
          <button className="btn btn-primary" onClick={() => go('dashboard')}>Ver dashboard</button>
          <button className="btn" onClick={() => go('lab')}>Explorar cenários</button>
          <button className="btn" onClick={() => go('presentation')}>Apresentação para investidores</button>
        </div>
      </section>
    </div>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border-t border-ink/15 pt-2.5">
      <div className="text-[11px] text-ink-3 font-semibold tracking-wide">{label}</div>
      <div className="num text-[22px] text-green leading-tight mt-0.5">{value}</div>
      {hint && <div className="text-[11px] text-ink-3 mt-0.5">{hint}</div>}
    </div>
  );
}
function Li({ children }: { children: ReactNode }) {
  return <li className="flex gap-3"><span className="mt-[11px] w-1.5 h-1.5 rounded-full bg-gold shrink-0" /><span>{children}</span></li>;
}
function avg(a: number[]) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
function stabRow(r: ReturnType<typeof useResults>, opYear: number) { return r.annual.find((a) => a.opYear === opYear); }

/** Linhas de vento e dunas — motivo decorativo em SVG, sem imagens. */
function WindMotif() {
  const lines = Array.from({ length: 9 }, (_, i) => i);
  return (
    <svg className="absolute right-0 top-0 h-full w-[58%] pointer-events-none" viewBox="0 0 800 520" preserveAspectRatio="xMaxYMid slice" aria-hidden="true">
      {lines.map((i) => {
        const y = 60 + i * 48;
        const amp = 18 + i * 3;
        return <path key={i} d={`M -40 ${y} C 160 ${y - amp}, 300 ${y + amp}, 470 ${y - amp * 0.6} S 760 ${y + amp}, 860 ${y - amp * 0.4}`} fill="none" stroke={i % 3 === 0 ? '#B8935A' : '#2F6F94'} strokeOpacity={i % 3 === 0 ? 0.45 : 0.28} strokeWidth={i % 3 === 0 ? 1.4 : 0.9} />;
      })}
      <path d="M 300 520 C 420 430, 560 420, 640 470 S 790 500, 860 470 L 860 520 Z" fill="#B8935A" fillOpacity={0.14} />
      <path d="M 440 520 C 540 470, 660 462, 740 492 S 830 515, 860 505 L 860 520 Z" fill="#14352C" fillOpacity={0.10} />
    </svg>
  );
}
