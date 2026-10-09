import type { YM } from './types';

export const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]; // Excel usa meses fixos (fev = 28)
export const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

export function ymToIndex(ym: YM): number {
  const [y, m] = ym.split('-').map(Number);
  return y * 12 + (m - 1);
}
export function indexToYM(i: number): YM {
  const y = Math.floor(i / 12);
  const m = (i % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}
export function addMonths(ym: YM, n: number): YM {
  return indexToYM(ymToIndex(ym) + n);
}
export function monthsBetween(a: YM, b: YM): number {
  return ymToIndex(b) - ymToIndex(a);
}
export function ymToDate(ym: YM): Date {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1));
}
export function yearOf(ym: YM): number {
  return Number(ym.slice(0, 4));
}
export function monthOf(ym: YM): number {
  return Number(ym.slice(5, 7)) - 1; // 0..11
}
export function buildMonths(start: YM, end: YM): YM[] {
  const out: YM[] = [];
  for (let i = ymToIndex(start); i <= ymToIndex(end); i++) out.push(indexToYM(i));
  return out;
}
/** Ano de operação (1 = mês da inauguração); 0 antes da inauguração ou após o fim do fluxo. */
export function opYearFor(ym: YM, opening: YM, flowEnd: YM): number {
  const d = monthsBetween(opening, ym);
  if (d < 0 || ymToIndex(ym) > ymToIndex(flowEnd)) return 0;
  return Math.floor(d / 12) + 1;
}
export function gridValue(grid: number[][], opYear: number, month: number): number {
  if (opYear <= 0) return 0;
  const row = grid[Math.min(opYear, grid.length) - 1] ?? grid[grid.length - 1];
  return row?.[month] ?? 0;
}
/** Valor de uma lista anual (repete o último) para o ano de operação (1-based). */
export function yearValue(list: number[], opYear: number, fallback = 0): number {
  if (opYear <= 0 || !list.length) return fallback;
  return list[Math.min(opYear, list.length) - 1];
}
/** Fator de crescimento acumulado: ano 1 = 1; anos 2..6 pelos índices; depois longTerm. */
export function growthFactor(opYear: number, growth: number[], longTerm: number): number {
  let f = 1;
  for (let y = 2; y <= opYear; y++) {
    if (y - 2 < growth.length) f *= 1 + growth[y - 2];
    else f *= 1 + longTerm;
  }
  return f;
}
export function zeros(n: number): number[] {
  return new Array(n).fill(0);
}
export function sum(a: number[]): number {
  let s = 0;
  for (const x of a) s += x;
  return s;
}
export function add(...series: number[][]): number[] {
  const n = series[0].length;
  const out = zeros(n);
  for (const s of series) for (let i = 0; i < n; i++) out[i] += s[i] ?? 0;
  return out;
}
export function scale(s: number[], k: number): number[] {
  return s.map((x) => x * k);
}
export function neg(s: number[]): number[] {
  return s.map((x) => -x);
}
export function cumsum(s: number[]): number[] {
  const out = zeros(s.length);
  let c = 0;
  for (let i = 0; i < s.length; i++) {
    c += s[i];
    out[i] = c;
  }
  return out;
}
export function fmtBRL(v: number, digits = 0): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: digits, minimumFractionDigits: digits });
}
