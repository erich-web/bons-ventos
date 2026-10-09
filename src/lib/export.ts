/**
 * Helpers de exportação (JSON, Excel via SheetJS, PNG dos gráficos) — sem dependência de UI.
 */
import * as XLSX from 'xlsx';
import type { Scenario, Results } from '../engine/types';
import { SUM_KEYS } from '../engine/compute';
import { METRIC_LABELS, metricOf, type MetricKey } from '../engine/analysis';

declare global { interface Window { claude?: { use: (name: string) => Promise<unknown> } } }
/** Entrega um arquivo ao usuário: capacidade `downloads` do viewer de artifacts quando disponível, senão download direto. */
export async function downloadBlob(name: string, blob: Blob): Promise<void> {
  try {
    if (window.claude?.use) {
      const dl = (await window.claude.use('downloads')) as { save: (r: { filename: string; data: Blob }) => Promise<unknown> } | null;
      if (dl) { await dl.save({ filename: name, data: blob }); return; }
    }
  } catch (e) { const code = (e as { code?: string })?.code; if (code === 'declined' || code === 'rate_limited') return; }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function slug(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'cenario';
}

export function exportScenarioJSON(s: Scenario) {
  downloadBlob(`bons-ventos-${slug(s.name)}.json`, new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' }));
}

/** Lê um arquivo JSON de cenário e valida o mínimo necessário. */
export function readScenarioFile(file: File): Promise<Scenario> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('Falha ao ler o arquivo'));
    fr.onload = () => {
      try {
        const obj = JSON.parse(String(fr.result)) as Partial<Scenario>;
        if (!obj || typeof obj !== 'object' || !obj.id || !obj.hotel || !obj.capex || !obj.loans) throw new Error('O arquivo não contém um cenário válido');
        resolve(obj as Scenario);
      } catch (e) { reject(e instanceof Error ? e : new Error('JSON inválido')); }
    };
    fr.readAsText(file);
  });
}

/** Achata o objeto de premissas em pares caminho → valor (vetores viram texto; séries de CAPEX do Excel são omitidas). */
export function flattenScenario(s: Scenario): { path: string; value: string | number | boolean }[] {
  const out: { path: string; value: string | number | boolean }[] = [];
  const walk = (v: unknown, path: string) => {
    if (path.endsWith('.excelSeries') || path === 'provenance') return;
    if (v === null || v === undefined) { out.push({ path, value: '' }); return; }
    if (Array.isArray(v)) {
      if (v.every((x) => typeof x === 'number' || typeof x === 'string')) { out.push({ path, value: v.join('; ') }); return; }
      v.forEach((x, i) => walk(x, `${path}.${i}`));
      return;
    }
    if (typeof v === 'object') { for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, path ? `${path}.${k}` : k); return; }
    out.push({ path, value: v as string | number | boolean });
  };
  walk(s, '');
  return out;
}

const METRIC_KEYS: MetricKey[] = ['irrProject', 'npvProject', 'irrEquity', 'npvEquity', 'dscrMin', 'ebitdaStabilized', 'equityNeed', 'maxExposure', 'investorIRR', 'investorNPV', 'investorMOIC', 'existingIRR', 'equityValueDCF'];

/** Exporta cenário + resultados para um arquivo .xlsx com várias abas. */
export function exportWorkbook(s: Scenario, r: Results, extras?: { reconciliation?: (string | number)[][] }) {
  const wb = XLSX.utils.book_new();
  const add = (name: string, rows: unknown[][]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name.slice(0, 31));

  // Premissas
  const prem: unknown[][] = [['Caminho', 'Valor', 'Origem', 'Status', 'Referência', 'Nota']];
  for (const { path, value } of flattenScenario(s)) {
    const parts = path.split('.');
    let prov: Scenario['provenance'][string] | undefined;
    for (let i = parts.length; i > 0 && !prov; i--) prov = s.provenance[parts.slice(0, i).join('.')];
    prem.push([path, value, prov?.source ?? '', prov?.status ?? '', prov?.ref ?? '', prov?.note ?? '']);
  }
  add('Premissas', prem);

  // Mensal
  const M = r.monthly;
  const keys = SUM_KEYS.concat(['debtBalance', 'cashBalance', 'cashAfterEquity', 'dscr'] as (keyof typeof M)[]);
  const mensal: unknown[][] = [['Mês', 'Ano op.', ...keys]];
  M.months.forEach((ym, i) => mensal.push([ym, M.opYear[i], ...keys.map((k) => { const v = (M[k] as number[])[i]; return Number.isFinite(v) ? Math.round(v * 100) / 100 : ''; })]));
  add('Mensal', mensal);

  // Anual
  const akeys = Object.keys(r.annual[0] ?? {}).filter((k) => k !== 'year');
  const anual: unknown[][] = [['Ano', ...akeys]];
  r.annual.forEach((a) => anual.push([a.year, ...akeys.map((k) => (Number.isFinite(a[k]) ? Math.round(a[k] * 100) / 100 : ''))]));
  add('Anual', anual);

  // Indicadores
  const ind: unknown[][] = [['Indicador', 'Valor']];
  for (const [k, v] of Object.entries(r.metrics)) ind.push([k, v == null ? '' : v]);
  ind.push([]);
  for (const k of METRIC_KEYS) ind.push([METRIC_LABELS[k], metricOf(r, k) ?? '']);
  ind.push([]); ind.push(['Valuation DCF — EV', r.valuation.dcf.ev], ['Valuation DCF — equity', r.valuation.dcf.equity], ['Valor terminal (PV)', r.valuation.dcf.pvTv], ['Peso do terminal no EV', r.valuation.dcf.tvShareOfEv], ['Múltiplo — EV', r.valuation.multiple.ev]);
  add('Indicadores', ind);

  // Cap table
  add('CapTable', [['Sócio', 'Participação pré', 'Participação pós', 'Aporte', 'Capital já investido'], ...r.capTable.map((c) => [c.name, c.stakePre, c.stakePost, c.contribution, c.capitalInvested])]);

  // Sócios
  add('Sócios', [['Sócio', 'Participação pós', 'Total aportado', 'Total recebido', 'TIR', 'VPL', 'MOIC'], ...r.parties.map((p) => [p.name, p.stakePost, p.totalIn, p.totalOut, p.irr ?? '', p.npv, p.moic])]);

  // Dívida
  const div: unknown[][] = [['Contrato', 'Mês', 'Desembolso', 'Juros', 'Amortização', 'Tarifas', 'Saldo', 'DSCR']];
  for (const d of r.debtSchedules) for (const row of d.rows) div.push([d.label, row.month, row.draw, row.interest, row.amortization, row.fees, row.balance, row.dscr ?? '']);
  add('Dívida', div);

  // Alertas
  add('Alertas', [['Nível', 'Código', 'Mensagem', 'Mês'], ...r.alerts.map((a) => [a.level, a.code, a.message, a.month ?? ''])]);

  if (extras?.reconciliation) add('Conciliação', extras.reconciliation);

  XLSX.writeFile(wb, `bons-ventos-${slug(s.name)}.xlsx`);
}

/** Converte cada <svg class="recharts-surface"> do container em PNG e dispara o download. */
export async function exportChartsPNG(root: ParentNode = document, prefix = 'grafico') {
  const svgs = Array.from(root.querySelectorAll<SVGSVGElement>('svg.recharts-surface'));
  let n = 0;
  for (const svg of svgs) {
    const w = svg.clientWidth || Number(svg.getAttribute('width')) || 800;
    const h = svg.clientHeight || Number(svg.getAttribute('height')) || 300;
    if (!w || !h) continue;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h));
    clone.querySelectorAll('text').forEach((t) => { t.setAttribute('font-family', 'Manrope, system-ui, sans-serif'); });
    const xml = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    try {
      const png = await new Promise<Blob | null>((resolve) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const scale = 2; canvas.width = w * scale; canvas.height = h * scale;
          const ctx = canvas.getContext('2d');
          if (!ctx) return resolve(null);
          ctx.fillStyle = '#FFFDF9'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale); ctx.drawImage(img, 0, 0);
          canvas.toBlob((b) => resolve(b), 'image/png');
        };
        img.onerror = () => resolve(null);
        img.src = url;
      });
      if (png) { n++; await downloadBlob(`${prefix}-${String(n).padStart(2, '0')}.png`, png); await new Promise((r) => setTimeout(r, 250)); }
    } finally { URL.revokeObjectURL(url); }
  }
  return n;
}

/* ------------------------------------------------------------------ */
/* Relatório PDF (resumo executivo)                                    */
/* ------------------------------------------------------------------ */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { fmtM, fmtPct, fmtYM, fmtX } from './format';

/** Captura os gráficos (svg.recharts-surface) de um container como PNG dataURL. */
export async function captureCharts(root: HTMLElement | Document = document): Promise<string[]> {
  const svgs = Array.from(root.querySelectorAll<SVGSVGElement>('svg.recharts-surface'));
  const out: string[] = [];
  for (const svg of svgs) {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const w = svg.clientWidth || 800, h = svg.clientHeight || 300;
    clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h));
    const xml = new XMLSerializer().serializeToString(clone);
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
    const png = await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => { const c = document.createElement('canvas'); c.width = w * 2; c.height = h * 2; const ctx = c.getContext('2d')!; ctx.fillStyle = '#FFFDF9'; ctx.fillRect(0, 0, c.width, c.height); ctx.scale(2, 2); ctx.drawImage(img, 0, 0); resolve(c.toDataURL('image/png')); };
      img.onerror = () => resolve(null);
      img.src = url;
    });
    if (png) out.push(png);
  }
  return out;
}

export async function exportPdfReport(s: Scenario, r: Results, opts: { charts?: string[]; title?: string } = {}) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const m = r.metrics;
  const green: [number, number, number] = [20, 53, 44];
  const W = 210, margin = 16;
  let y = 20;
  doc.setFont('times', 'normal'); doc.setTextColor(...green); doc.setFontSize(26); doc.text(opts.title ?? 'Hotel Bons Ventos', margin, y); y += 8;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(74, 86, 81);
  doc.text(`Resumo executivo · cenário "${s.name}" · gerado em ${new Date().toLocaleDateString('pt-BR')} · valores nominais em R$`, margin, y); y += 5;
  doc.text(doc.splitTextToSize(s.description, W - 2 * margin), margin, y); y += 12;
  const kpis = [
    ['CAPEX total', fmtM(m.capexTotal), 'Fase 01', fmtM(m.capexP1)],
    ['Financiamento desembolsado', fmtM(m.debtTotal), 'Capital próprio', fmtM(m.equityTotal)],
    ['Receita estabilizada', fmtM(m.revenueStabilized), 'EBITDA estabilizado', `${fmtM(m.ebitdaStabilized)} (${fmtPct(m.ebitdaMarginStabilized, 0)})`],
    ['Ocupação / ADR / RevPAR', `${fmtPct(m.occupancyStabilized, 0)} / ${Math.round(m.adrStabilized)} / ${Math.round(m.revparStabilized)}`, 'Payback', fmtYM(m.paybackSimple)],
    ['TIR do projeto', fmtPct(m.irrProject), 'VPL do projeto', fmtM(m.npvProject)],
    ['TIR do equity', fmtPct(m.irrEquity), 'DSCR mínimo', m.dscrMin == null ? '—' : `${fmtX(m.dscrMin)} (${m.dscrMinYear})`],
    ['Valuation DCF (EV)', fmtM(r.valuation.dcf.ev), 'Múltiplo EBITDA (EV)', fmtM(r.valuation.multiple.ev)],
    ['Garantia preexistente exigida', fmtM(m.guaranteeRequiredPeak), 'Complementação / custo', `${fmtM(m.guaranteeCommittedPeak)} / ${fmtM(m.guaranteeCostTotal)}`],
  ];
  autoTable(doc, { startY: y, head: [['Indicador', 'Valor', 'Indicador', 'Valor']], body: kpis, theme: 'grid', styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: green }, margin: { left: margin, right: margin } });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  // cap table e sócios
  const inv = r.parties[r.parties.length - 1];
  autoTable(doc, { startY: y, head: [['Sócio', 'Pré', 'Pós', 'Aportes', 'Retornos', 'TIR', 'MOIC']], body: r.parties.map((p, i) => [p.name, fmtPct(r.capTable[i].stakePre, 1), fmtPct(p.stakePost, 1), fmtM(p.totalIn), fmtM(p.totalOut), fmtPct(p.irr), fmtX(p.moic, 1)]), theme: 'striped', styles: { fontSize: 9, cellPadding: 2 }, headStyles: { fillColor: green }, margin: { left: margin, right: margin } });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  doc.setFontSize(9); doc.setTextColor(74, 86, 81);
  doc.text(doc.splitTextToSize(`Proposta ao investidor: aporte ${fmtM(s.equity.investor.contribution)} · participação ${fmtPct(inv.stakePost, 1)} · garantias ${fmtM(s.guarantees.investor.committed)} a ${fmtPct(s.guarantees.investor.feePct, 2)} a.a. (modelo ${s.guarantees.investor.model}) · saída ano ${s.equity.exit.year} (${s.equity.exit.method === 'multiple' ? `${s.equity.exit.ebitdaMultiple}× EBITDA` : s.equity.exit.method}). Parâmetros de negociação, não condições aprovadas.`, W - 2 * margin), margin, y);
  // anual
  doc.addPage(); y = 18;
  doc.setFont('times', 'normal'); doc.setFontSize(18); doc.setTextColor(...green); doc.text('Demonstrativo anual (R$ milhões)', margin, y); y += 6;
  const rows = r.annual.filter((a) => a.opYear > 0 || a.capex > 0).map((a) => [String(a.year), (a.revenueGross / 1e6).toFixed(1), (a.revHotel / 1e6).toFixed(1), (a.revWeddings / 1e6).toFixed(1), (a.revFnb / 1e6).toFixed(1), (a.ebitda / 1e6).toFixed(1), fmtPct(a.ebitdaMargin, 0), (a.incomeTaxLevered / 1e6).toFixed(1), (a.capex / 1e6).toFixed(1), (a.debtService / 1e6).toFixed(1), a.debtService > 0 && a.opYear > 0 ? a.dscr.toFixed(2) : '—', (a.fcfProjectNoTV / 1e6).toFixed(1), ((a.fcfEquity - a.terminalValue) / 1e6).toFixed(1), (a.distributions / 1e6).toFixed(1)]);
  autoTable(doc, { startY: y, head: [['Ano', 'Receita', 'Hosp.', 'Casam.', 'A&B', 'EBITDA', 'Mg', 'Impostos', 'CAPEX', 'Serv. dívida', 'DSCR', 'FCF proj.', 'FCF equity', 'Distrib.']], body: rows, theme: 'striped', styles: { fontSize: 7.5, cellPadding: 1.5, halign: 'right' }, columnStyles: { 0: { halign: 'left' } }, headStyles: { fillColor: green }, margin: { left: margin, right: margin } });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
  if (r.alerts.length) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...green); doc.text('Alertas', margin, y); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(74, 86, 81);
    for (const a of r.alerts) { const lines = doc.splitTextToSize(`• ${a.message}`, W - 2 * margin); doc.text(lines, margin, y); y += lines.length * 4 + 1; }
  }
  // premissas pendentes
  const pend = Object.entries(s.provenance).filter(([, e]) => e.status === 'pending');
  if (pend.length) {
    y += 4; doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...green); doc.text('Premissas pendentes de validação', margin, y); y += 3;
    autoTable(doc, { startY: y, head: [['Premissa', 'Origem', 'Nota']], body: pend.map(([k, e]) => [k, e.source, e.note ?? '']), theme: 'grid', styles: { fontSize: 7.5, cellPadding: 1.5 }, headStyles: { fillColor: green }, margin: { left: margin, right: margin }, columnStyles: { 2: { cellWidth: 100 } } });
  }
  // gráficos
  for (const png of opts.charts ?? []) {
    doc.addPage();
    doc.addImage(png, 'PNG', margin, 20, W - 2 * margin, (W - 2 * margin) * 0.45);
  }
  const blob = doc.output('blob');
  await downloadBlob(`bons-ventos-${slug(s.name)}-resumo-executivo.pdf`, blob);
}
