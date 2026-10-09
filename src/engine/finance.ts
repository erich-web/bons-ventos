/** Funções financeiras: IRR/NPV periódicos e XIRR/XNPV com datas efetivas. */

const DAY_MS = 86400000;

export function npv(rate: number, flows: number[], t0 = 0): number {
  let v = 0;
  for (let i = 0; i < flows.length; i++) v += flows[i] / Math.pow(1 + rate, i - t0);
  return v;
}

/** IRR periódica (Newton + bisseção). Retorna null se não houver mudança de sinal ou não convergir. */
export function irr(flows: number[], guess = 0.01): number | null {
  let hasPos = false, hasNeg = false;
  for (const f of flows) { if (f > 0) hasPos = true; if (f < 0) hasNeg = true; }
  if (!hasPos || !hasNeg) return null;
  const f = (r: number) => npv(r, flows);
  // Newton
  let r = guess;
  for (let k = 0; k < 60; k++) {
    const v = f(r);
    const h = 1e-6;
    const d = (f(r + h) - v) / h;
    if (!isFinite(d) || d === 0) break;
    const nr = r - v / d;
    if (nr <= -0.9999) break;
    if (Math.abs(nr - r) < 1e-10) return nr;
    r = nr;
  }
  // bisseção
  let lo = -0.99, hi = 1.0;
  let flo = f(lo), fhi = f(hi);
  if (flo * fhi > 0) {
    hi = 10; fhi = f(hi);
    if (flo * fhi > 0) return null;
  }
  for (let k = 0; k < 200; k++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-7 || hi - lo < 1e-12) return mid;
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

export function xnpv(rate: number, flows: number[], dates: Date[], t0?: Date): number {
  const d0 = t0 ?? dates[0];
  let v = 0;
  for (let i = 0; i < flows.length; i++) {
    if (!flows[i]) continue;
    const t = (dates[i].getTime() - d0.getTime()) / DAY_MS / 365;
    v += flows[i] / Math.pow(1 + rate, t);
  }
  return v;
}

/** XIRR anual com datas efetivas. */
export function xirr(flows: number[], dates: Date[], guess = 0.15): number | null {
  let hasPos = false, hasNeg = false;
  for (const f of flows) { if (f > 0) hasPos = true; if (f < 0) hasNeg = true; }
  if (!hasPos || !hasNeg) return null;
  const d0 = dates[0];
  const f = (r: number) => xnpv(r, flows, dates, d0);
  let r = guess;
  for (let k = 0; k < 80; k++) {
    const v = f(r);
    const h = 1e-6;
    const d = (f(r + h) - v) / h;
    if (!isFinite(d) || d === 0) break;
    const nr = r - v / d;
    if (nr <= -0.9999 || !isFinite(nr)) break;
    if (Math.abs(nr - r) < 1e-10) return nr;
    r = nr;
  }
  let lo = -0.99, hi = 5;
  let flo = f(lo);
  if (flo * f(hi) > 0) return null;
  for (let k = 0; k < 300; k++) {
    const mid = (lo + hi) / 2;
    const fm = f(mid);
    if (Math.abs(fm) < 1e-6 || hi - lo < 1e-12) return mid;
    if (flo * fm < 0) hi = mid; else { lo = mid; flo = fm; }
  }
  return (lo + hi) / 2;
}

export function annualToMonthly(rate: number): number {
  return Math.pow(1 + rate, 1 / 12) - 1;
}
export function monthlyToAnnual(rate: number): number {
  return Math.pow(1 + rate, 12) - 1;
}

/** Payback: índice do primeiro mês em que o acumulado (a partir de start) fica >= 0 e permanece. */
export function paybackIndex(flows: number[], start = 0): number | null {
  let c = 0;
  let last: number | null = null;
  for (let i = start; i < flows.length; i++) {
    c += flows[i];
    if (c >= 0 && last === null) last = i;
    if (c < 0) last = null;
  }
  return last;
}

export function pmt(rate: number, n: number, pv: number): number {
  if (rate === 0) return pv / n;
  return (pv * rate) / (1 - Math.pow(1 + rate, -n));
}

/** Busca por bisseção de x em [lo,hi] tal que g(x) = target (g monotônica). */
export function solve(g: (x: number) => number | null, target: number, lo: number, hi: number, iters = 60): number | null {
  let glo = g(lo), ghi = g(hi);
  if (glo === null || ghi === null) return null;
  const flo = glo - target, fhi = ghi - target;
  if (flo * fhi > 0) return null;
  let a = lo, b = hi, fa = flo;
  for (let i = 0; i < iters; i++) {
    const m = (a + b) / 2;
    const gm = g(m);
    if (gm === null) return null;
    const fm = gm - target;
    if (Math.abs(fm) < 1e-7) return m;
    if (fa * fm < 0) b = m; else { a = m; fa = fm; }
  }
  return (a + b) / 2;
}
