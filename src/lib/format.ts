export const fmtBRL = (v: number | null | undefined, digits = 0) => v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: digits, minimumFractionDigits: digits });
/** R$ em milhões com 1–2 casas: R$ 23,7 M */
export const fmtM = (v: number | null | undefined, digits = 1) => v == null || !isFinite(v) ? '—' : `R$ ${(v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits })} M`;
/** R$ em milhares: R$ 1.234 k */
export const fmtK = (v: number | null | undefined) => v == null || !isFinite(v) ? '—' : `R$ ${Math.round(v / 1e3).toLocaleString('pt-BR')} k`;
export const fmtPct = (v: number | null | undefined, digits = 1) => v == null || !isFinite(v) ? '—' : `${(v * 100).toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits })}%`;
export const fmtNum = (v: number | null | undefined, digits = 0) => v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const fmtX = (v: number | null | undefined, digits = 2) => v == null || !isFinite(v) ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: digits, minimumFractionDigits: digits })}×`;
export const fmtYM = (ym: string | null | undefined) => { if (!ym) return '—'; const [y, m] = ym.split('-'); const names = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']; return `${names[+m - 1]}/${y}`; };
/** formata automaticamente em k ou M conforme a ordem de grandeza */
export const fmtAuto = (v: number | null | undefined) => { if (v == null || !isFinite(v)) return '—'; const a = Math.abs(v); if (a >= 1e6) return fmtM(v, a >= 1e8 ? 0 : 1); if (a >= 1e3) return fmtK(v); return fmtBRL(v); };
export const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
