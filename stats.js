/* Statistiques simples – fonctions pures, sans dépendance. */
(function (root) {
  'use strict';
  const S = {};

  const clean = a => a.filter(v => typeof v === 'number' && isFinite(v));
  S.clean = clean;
  S.mean = a => { a = clean(a); return a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN; };
  S.sd = a => {
    a = clean(a); if (a.length < 2) return NaN;
    const m = S.mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
  };
  S.quantile = (a, q) => {
    a = clean(a).sort((x, y) => x - y); if (!a.length) return NaN;
    const h = (a.length - 1) * q, lo = Math.floor(h), hi = Math.ceil(h);
    return a[lo] + (h - lo) * (a[hi] - a[lo]);
  };
  S.median = a => S.quantile(a, 0.5);
  S.describe = a => {
    a = clean(a);
    return {
      n: a.length, mean: S.mean(a), sd: S.sd(a), median: S.median(a),
      q1: S.quantile(a, 0.25), q3: S.quantile(a, 0.75),
      min: a.length ? Math.min(...a) : NaN, max: a.length ? Math.max(...a) : NaN
    };
  };

  /* ---------- Fonctions spéciales ---------- */
  function lgamma(x) {
    const c = [76.18009172947146, -86.50532032941677, 24.01409824083091,
      -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
    let y = x, tmp = x + 5.5; tmp -= (x + 0.5) * Math.log(tmp);
    let ser = 1.000000000190015;
    for (let j = 0; j < 6; j++) ser += c[j] / ++y;
    return -tmp + Math.log(2.5066282746310005 * ser / x);
  }
  function betacf(a, b, x) {
    const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
    let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN; d = 1 / d; let h = d;
    for (let m = 1; m <= MAXIT; m++) {
      const m2 = 2 * m;
      let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; const del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }
  function ibeta(x, a, b) { // bêta incomplète régularisée I_x(a,b)
    if (x <= 0) return 0; if (x >= 1) return 1;
    const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
    return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
  }
  function gammaP(a, x) { // gamma incomplète régularisée inférieure
    if (x <= 0) return 0;
    if (x < a + 1) {
      let sum = 1 / a, del = sum, ap = a;
      for (let n = 0; n < 500; n++) { ap++; del *= x / ap; sum += del; if (Math.abs(del) < Math.abs(sum) * 1e-15) break; }
      return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
    }
    let b = x + 1 - a, c = 1e300, d = 1 / b, h = d;
    for (let i = 1; i < 500; i++) {
      const an = -i * (i - a); b += 2;
      d = an * d + b; if (Math.abs(d) < 1e-300) d = 1e-300;
      c = b + an / c; if (Math.abs(c) < 1e-300) c = 1e-300;
      d = 1 / d; const del = d * c; h *= del; if (Math.abs(del - 1) < 1e-15) break;
    }
    return 1 - Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  }
  S.normCdf = z => 0.5 * (1 + erf(z / Math.SQRT2));
  function erf(x) { // Abramowitz-Stegun 7.1.26 raffiné via gammaP
    const s = x < 0 ? -1 : 1; return s * gammaP(0.5, x * x);
  }
  S.normInv = p => { // Acklam
    const a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02, 1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
    const b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02, 6.680131188771972e+01, -1.328068155288572e+01];
    const c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00, -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
    const d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00, 3.754408661907416e+00];
    const pl = 0.02425; let q, r;
    if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    if (p > 1 - pl) { q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
    q = p - 0.5; r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  };
  S.tCdf = (t, df) => { const x = df / (df + t * t); const p = 0.5 * ibeta(x, df / 2, 0.5); return t > 0 ? 1 - p : p; };
  S.tInv = (p, df) => { // bissection
    let lo = -1e3, hi = 1e3;
    for (let i = 0; i < 200; i++) { const mid = (lo + hi) / 2; if (S.tCdf(mid, df) < p) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  };
  S.fSf = (f, d1, d2) => f <= 0 ? 1 : ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2); // P(F > f)
  S.chi2Sf = (x, k) => 1 - gammaP(k / 2, x / 2);

  /* ---------- Tests ---------- */
  // Test t de Welch (+ Student) avec IC 95 % de la différence (b - a) et d de Cohen
  S.tTest = (a, b) => {
    a = clean(a); b = clean(b);
    if (a.length < 2 || b.length < 2) return null;
    const ma = S.mean(a), mb = S.mean(b), va = S.sd(a) ** 2, vb = S.sd(b) ** 2, na = a.length, nb = b.length;
    const se = Math.sqrt(va / na + vb / nb);
    const df = (va / na + vb / nb) ** 2 / ((va / na) ** 2 / (na - 1) + (vb / nb) ** 2 / (nb - 1));
    const diff = mb - ma;
    const t = se > 0 ? diff / se : 0;
    const p = se > 0 ? 2 * (1 - S.tCdf(Math.abs(t), df)) : 1;
    const tc = S.tInv(0.975, df);
    const sp = Math.sqrt(((na - 1) * va + (nb - 1) * vb) / (na + nb - 2));
    return { diff, ci: [diff - tc * se, diff + tc * se], t, df, p, d: sp > 0 ? diff / sp : NaN, na, nb };
  };

  function ranks(values) { // rangs moyens + somme des t^3 - t pour les ex aequo
    const idx = values.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]);
    const r = new Array(values.length); let tie = 0;
    for (let i = 0; i < idx.length;) {
      let j = i; while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) r[idx[k][1]] = avg;
      const tcount = j - i + 1; tie += tcount ** 3 - tcount; i = j + 1;
    }
    return { r, tie };
  }
  function exactMWp(na, nb, U) { // loi exacte de U (sans ex aequo), bilatéral
    const maxU = na * nb;
    // f(i,j,u): nombre d'arrangements ; DP sur u
    let memo = new Map();
    function f(i, j, u) {
      if (u < 0) return 0; if (i === 0 || j === 0) return u === 0 ? 1 : 0;
      const k = i + ',' + j + ',' + u; if (memo.has(k)) return memo.get(k);
      const v = f(i - 1, j, u - j) + f(i, j - 1, u); memo.set(k, v); return v;
    }
    let total = 0, cum = 0; const Umin = Math.min(U, maxU - U);
    for (let u = 0; u <= maxU; u++) { const c = f(na, nb, u); total += c; if (u <= Umin) cum += c; }
    return Math.min(1, 2 * cum / total);
  }
  S.mannWhitney = (a, b) => {
    a = clean(a); b = clean(b); const na = a.length, nb = b.length;
    if (!na || !nb) return null;
    const { r, tie } = ranks(a.concat(b));
    const Ra = r.slice(0, na).reduce((s, v) => s + v, 0);
    const Ua = Ra - na * (na + 1) / 2; const U = Math.min(Ua, na * nb - Ua);
    const N = na + nb;
    let p, method;
    if (tie === 0 && na * nb <= 400) { p = exactMWp(na, nb, U); method = 'exact'; }
    else {
      const mu = na * nb / 2;
      const sigma = Math.sqrt(na * nb / 12 * ((N + 1) - tie / (N * (N - 1))));
      const z = sigma > 0 ? (Math.abs(Ua - mu) - 0.5) / sigma : 0;
      p = Math.min(1, 2 * (1 - S.normCdf(Math.max(0, z)))); method = 'approx. normale';
    }
    return { U, p, method };
  };

  S.anova = groups => {
    groups = groups.map(clean).filter(g => g.length);
    const k = groups.length, all = groups.flat(), N = all.length;
    if (k < 2 || N - k < 1) return null;
    const gm = S.mean(all);
    let ssb = 0, ssw = 0;
    groups.forEach(g => { const m = S.mean(g); ssb += g.length * (m - gm) ** 2; g.forEach(v => ssw += (v - m) ** 2); });
    const df1 = k - 1, df2 = N - k; const F = (ssb / df1) / (ssw / df2);
    return { F, df1, df2, p: isFinite(F) ? S.fSf(F, df1, df2) : NaN };
  };
  S.kruskal = groups => {
    groups = groups.map(clean).filter(g => g.length);
    const k = groups.length, all = groups.flat(), N = all.length;
    if (k < 2 || N < 3) return null;
    const { r, tie } = ranks(all); let off = 0, H = 0;
    groups.forEach(g => { const R = r.slice(off, off + g.length).reduce((s, v) => s + v, 0); off += g.length; H += R * R / g.length; });
    H = 12 / (N * (N + 1)) * H - 3 * (N + 1);
    const C = 1 - tie / (N ** 3 - N); if (C > 0) H /= C;
    return { H, df: k - 1, p: S.chi2Sf(H, k - 1) };
  };
  S.holm = ps => {
    const o = ps.map((p, i) => [p, i]).sort((x, y) => x[0] - y[0]); const out = new Array(ps.length); let run = 0;
    o.forEach(([p, i], j) => { run = Math.max(run, Math.min(1, p * (ps.length - j))); out[i] = run; });
    return out;
  };
  // Effectif par groupe (test t bilatéral) – approximation normale + correction de Guenther
  S.sampleSize = (delta, sd, alpha = 0.05, power = 0.8) => {
    if (!(delta > 0) || !(sd > 0)) return NaN;
    const za = S.normInv(1 - alpha / 2), zb = S.normInv(power);
    return Math.ceil(2 * ((za + zb) * sd / delta) ** 2 + za * za / 4);
  };

  if (typeof module !== 'undefined') module.exports = S; else root.Stats = S;
})(this);
