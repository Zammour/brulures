/* Analyses préliminaires et graphiques. */
'use strict';
const GCOL = g => `var(--${g.toLowerCase()})`;

function dotPlot(byGroup, { unit = '', dec = 1, id = 'dp', zero = false } = {}) {
  const groups = GROUPS.filter(g => byGroup[g] && byGroup[g].length);
  if (!groups.length) return '<p class="hint">Pas encore de données.</p>';
  const all = groups.flatMap(g => byGroup[g].map(p => p.v));
  let lo = Math.min(...all), hi = Math.max(...all);
  if (zero) lo = Math.min(0, lo);
  if (lo === hi) { lo -= 1; hi += 1; }
  const pad = (hi - lo) * 0.08; lo -= pad; hi += pad;
  const W = 340, H = 220, L = 44, R = 10, T = 12, B = 34;
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const bw = (W - L - R) / groups.length;
  const ticks = niceTicks(lo, hi, 5);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Valeurs individuelles par groupe, moyenne et écart-type">`;
  ticks.forEach(t => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${fmt(t, Math.abs(hi - lo) < 5 ? 1 : 0)}</text>`; });
  s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/>`;
  groups.forEach((g, gi) => {
    const cx = L + bw * gi + bw / 2; const pts = byGroup[g]; const vals = pts.map(p => p.v);
    const m = Stats.mean(vals), sd = Stats.sd(vals);
    // dispersion horizontale déterministe
    pts.forEach((p, k) => {
      const jx = ((k * 37) % 11 - 5) / 5 * Math.min(bw * 0.28, 22);
      s += `<circle class="dot" cx="${(cx + jx).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="5.5" fill="${GCOL(g)}" data-cap="${esc(p.code)} – ${g} : ${fmt(p.v, dec)}${unit ? ' ' + unit : ''}" data-chart="${id}"><title>${esc(p.code)} : ${fmt(p.v, dec)}</title></circle>`;
    });
    if (isNum(m)) {
      s += `<line class="mean" x1="${cx - bw * 0.32}" x2="${cx + bw * 0.32}" y1="${y(m)}" y2="${y(m)}"/>`;
      if (isNum(sd)) s += `<line class="sdl" x1="${cx + bw * 0.36}" x2="${cx + bw * 0.36}" y1="${y(m - sd)}" y2="${y(m + sd)}"/><line class="sdl" x1="${cx + bw * 0.33}" x2="${cx + bw * 0.39}" y1="${y(m - sd)}" y2="${y(m - sd)}"/><line class="sdl" x1="${cx + bw * 0.33}" x2="${cx + bw * 0.39}" y1="${y(m + sd)}" y2="${y(m + sd)}"/>`;
    }
    s += `<text x="${cx}" y="${H - B + 18}" text-anchor="middle" style="font-weight:700">${g}</text><text x="${cx}" y="${H - B + 31}" text-anchor="middle">n = ${pts.length}</text>`;
  });
  s += '</svg>';
  return s + `<div class="chart-cap" id="cap-${id}">Touchez un point pour voir l’œil. Trait épais : moyenne ; trait fin : ± 1 écart-type.</div>`;
}
function niceTicks(lo, hi, n) {
  const span = hi - lo, step0 = span / n, mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const step = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= step0) || mag * 10;
  const out = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) out.push(+v.toFixed(10)); return out;
}

function lineChart(series, { xLabel = 'min', yLabel = '', id = 'lc' } = {}) {
  // series : [{name, color, pts:[[x,y]...]}]
  const all = series.flatMap(s => s.pts); if (!all.length) return '<p class="hint">Pas encore de données.</p>';
  const xs = all.map(p => p[0]), ys = all.map(p => p[1]);
  let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  if (x0 === x1) x1 = x0 + 1; if (y0 === y1) { y0 -= 0.5; y1 += 0.5; }
  const pad = (y1 - y0) * 0.1; y0 -= pad; y1 += pad;
  const W = 340, H = 200, L = 44, R = 12, T = 12, B = 30;
  const X = v => L + (W - L - R) * (v - x0) / (x1 - x0), Y = v => T + (H - T - B) * (1 - (v - y0) / (y1 - y0));
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)} en fonction du temps">`;
  niceTicks(y0, y1, 4).forEach(t => { s += `<line class="grid" x1="${L}" x2="${W - R}" y1="${Y(t)}" y2="${Y(t)}"/><text x="${L - 6}" y="${Y(t) + 4}" text-anchor="end">${fmt(t, Math.abs(y1 - y0) < 5 ? 1 : 0)}</text>`; });
  [...new Set(xs)].sort((a, b) => a - b).forEach(t => { s += `<text x="${X(t)}" y="${H - B + 16}" text-anchor="middle">${t}</text>`; });
  s += `<line class="axis" x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}"/><text x="${W - R}" y="${H - 2}" text-anchor="end">${esc(xLabel)}</text>`;
  series.forEach(se => {
    const p = se.pts.slice().sort((a, b) => a[0] - b[0]);
    s += `<polyline fill="none" stroke="${se.color}" stroke-width="2" points="${p.map(q => X(q[0]).toFixed(1) + ',' + Y(q[1]).toFixed(1)).join(' ')}"/>`;
    p.forEach(q => { s += `<circle class="dot" cx="${X(q[0])}" cy="${Y(q[1])}" r="4.5" fill="${se.color}" data-chart="${id}" data-cap="${esc(se.name)} – t = ${q[0]} min : ${fmt(q[1], 2)}"><title>${esc(se.name)} : ${fmt(q[1], 2)}</title></circle>`; });
  });
  s += '</svg>';
  const legend = series.length > 1 ? `<div class="legend">${series.map(se => `<span><svg width="14" height="10"><rect width="14" height="10" rx="2" fill="${se.color}"/></svg> ${esc(se.name)}</span>`).join('')}</div>` : '';
  return legend + s + `<div class="chart-cap" id="cap-${id}"></div>`;
}

function franzChart(list, single = true) {
  const pts = { R: [], D: [], F: [] };
  const times = [...new Set(list.flatMap(f => arr(f.temps)))].sort((a, b) => a - b);
  times.forEach(t => {
    const vR = list.map(f => f.points?.[t]?.phR).filter(isNum), vD = list.map(f => f.points?.[t]?.phD).filter(isNum), vF = list.map(f => f.points?.[t]?.fluo).filter(isNum);
    if (vR.length) pts.R.push([t, Stats.mean(vR)]); if (vD.length) pts.D.push([t, Stats.mean(vD)]); if (vF.length) pts.F.push([t, Stats.mean(vF)]);
  });
  if (!pts.R.length && !pts.D.length && !pts.F.length) return single ? '' : '<p class="hint">Pas encore de données.</p>';
  const title = list.length > 1 ? ' (moyennes)' : '';
  return `<div class="panel"><b>pH${title}</b>${lineChart([{ name: 'Récepteur', color: 'var(--g1)', pts: pts.R }, { name: 'Donneur', color: 'var(--g2)', pts: pts.D }].filter(s => s.pts.length), { yLabel: 'pH', id: 'fzph' + (single ? 's' : 'm') })}</div>
    ${pts.F.length ? `<div class="panel"><b>Fluorescence du récepteur${title}</b>${lineChart([{ name: 'Récepteur', color: 'var(--g3)', pts: pts.F }], { yLabel: 'Fluorescence', id: 'fzf' + (single ? 's' : 'm') })}</div>` : ''}`;
}

function descTable(byGroup, dec = 1) {
  return `<div class="tbl-wrap"><table><thead><tr><th>Groupe</th><th>n</th><th>Moyenne ± ET</th><th>Médiane [IQR]</th><th>Min–max</th></tr></thead><tbody>
  ${GROUPS.filter(g => byGroup[g]?.length).map(g => { const s = Stats.describe(byGroup[g].map(p => p.v)); return `<tr><td>${gChip(g)}</td><td>${s.n}</td><td>${fmt(s.mean, dec)} ± ${fmt(s.sd, dec)}</td><td>${fmt(s.median, dec)} [${fmt(s.q1, dec)} ; ${fmt(s.q3, dec)}]</td><td>${fmt(s.min, dec)}–${fmt(s.max, dec)}</td></tr>`; }).join('')}
  </tbody></table></div>`;
}

function renderAnalyses() {
  const c = cfg(); const ph = UI.anaPhase;
  const sel = eyes().filter(e => (ph === 'tout' || e.phase === ph));
  const excl = sel.filter(e => e.statut?.exclu).length;
  const inc = sel.filter(e => !e.statut?.exclu);
  const D = new Map(inc.map(e => [e.id, derive(e)]));
  const by = key => { const o = {}; GROUPS.forEach(g => o[g] = inc.filter(e => e.groupe === g && isNum(D.get(e.id)[key])).map(e => ({ v: D.get(e.id)[key], code: e.code }))); return o; };
  const cep = by('CEP'); const vals = g => cep[g].map(p => p.v);

  // Critère principal : G3 vs G1
  const tt = Stats.tTest(vals('G1'), vals('G3')); const mw = Stats.mannWhitney(vals('G1'), vals('G3'));
  const rinced = ['G1', 'G2', 'G3'].map(vals);
  const an = Stats.anova(rinced), kw = Stats.kruskal(rinced);
  const pairs = [['G1', 'G2'], ['G1', 'G3'], ['G2', 'G3']].map(([a, b]) => ({ a, b, t: Stats.tTest(vals(a), vals(b)), m: Stats.mannWhitney(vals(a), vals(b)) })).filter(p => p.t);
  const holmT = Stats.holm(pairs.map(p => p.t.p)), holmM = Stats.holm(pairs.map(p => p.m?.p ?? 1));

  // Effectif
  const sdPool = (() => { const a = vals('G1'), b = vals('G3'); if (a.length < 2 || b.length < 2) return NaN; return Math.sqrt(((a.length - 1) * Stats.sd(a) ** 2 + (b.length - 1) * Stats.sd(b) ** 2) / (a.length + b.length - 2)); })();
  const pw = c.puissance; const dObs = tt ? Math.abs(tt.diff) : NaN;

  const sec = [['dGris5', `Δ opacité à ${c.tempsPost[0]} min`, ''], ['dGris30', `Δ opacité à ${c.tempsPost[1]} min`, ''], ['dPachy5', `Δ pachymétrie à ${c.tempsPost[0]} min`, 'µm'], ['dPachy30', `Δ pachymétrie à ${c.tempsPost[1]} min`, 'µm']];
  const fz = franzs().filter(f => !f.statut?.exclu);

  return `<h2>Analyses préliminaires</h2>
  <div class="filters" role="group" aria-label="Phase analysée">${[['principale', 'Étude principale'], ['pilote', 'Pilote'], ['tout', 'Tout']].map(([k, l]) => `<button class="chip" data-act="aphase" data-v="${k}" aria-pressed="${ph === k}">${l}</button>`).join('')}</div>
  <p class="hint">${inc.length} œil(s) analysé(s)${excl ? `, ${excl} exclu(s)` : ''}. Analyses exploratoires, non confirmatoires : les analyses finales se font sous Prism.</p>

  <h3>Critère principal : % d’élimination du traceur</h3>
  <div class="panel">${dotPlot(cep, { unit: '%', id: 'cep', zero: true })}</div>
  ${descTable(cep)}
  <div class="panel">
    <b>G3 séquentiel vs G1 aqueux</b>
    ${tt ? `<div class="result ${tt.p < 0.05 ? 'sig' : ''}">
      <p>Différence G3 − G1 : <b class="num">${fmt(tt.diff)} points</b> [IC 95 % ${fmt(tt.ci[0])} ; ${fmt(tt.ci[1])}], d de Cohen ${fmt(tt.d, 2)}</p>
      <p>Test t de Welch : t = ${fmt(tt.t, 2)}, ddl = ${fmt(tt.df, 1)}, <b>${pTxt(tt.p)}</b></p>
      <p>Mann-Whitney : U = ${fmt(mw.U, 1)}, <b>${pTxt(mw.p)}</b> <span class="hint">(${mw.method})</span></p>
      <p class="hint">Seuil de succès du protocole : différence ≥ ${fmt(pw.delta, 0)} points ${Math.abs(tt.diff) >= pw.delta ? '– atteint' : '– non atteint à ce stade'}.</p></div>`
      : '<p class="hint">Il faut au moins 2 yeux avec un résultat dans G1 et dans G3.</p>'}
  </div>
  <div class="panel"><b>Comparaison des trois groupes rincés (G1, G2, G3)</b>
    ${an ? `<p>ANOVA : F(${an.df1}, ${an.df2}) = ${fmt(an.F, 2)}, <b>${pTxt(an.p)}</b> · Kruskal-Wallis : H = ${fmt(kw.H, 2)}, <b>${pTxt(kw.p)}</b></p>` : '<p class="hint">Données insuffisantes.</p>'}
    ${pairs.length ? `<div class="tbl-wrap"><table><thead><tr><th>Paire</th><th>Différence</th><th>p (t, Holm)</th><th>p (MW, Holm)</th></tr></thead><tbody>
      ${pairs.map((p, i) => `<tr><td>${p.b} − ${p.a}</td><td>${fmt(p.t.diff)}</td><td>${fmtP(holmT[i])}</td><td>${fmtP(holmM[i])}</td></tr>`).join('')}</tbody></table></div>
      <p class="hint">Comparaisons deux à deux corrigées par la méthode de Holm (le protocole prévoit Tukey, à faire sous Prism).</p>` : ''}
  </div>

  <h3>Effectif nécessaire</h3>
  <div class="panel">
    <dl class="kv"><dt>Écart-type observé (G1, G3)</dt><dd>${fmt(sdPool)} points</dd><dt>Différence observée</dt><dd>${fmt(dObs)} points</dd></dl>
    <div class="tbl-wrap"><table><thead><tr><th>Hypothèse</th><th>Différence</th><th>ET</th><th>n par groupe</th></tr></thead><tbody>
      <tr><td>Protocole</td><td>${fmt(pw.delta, 0)}</td><td>${fmt(pw.sd, 0)}</td><td class="num">${Stats.sampleSize(pw.delta, pw.sd, pw.alpha, pw.power) || '–'}</td></tr>
      <tr><td>Différence visée, ET observé</td><td>${fmt(pw.delta, 0)}</td><td>${fmt(sdPool)}</td><td class="num">${Stats.sampleSize(pw.delta, sdPool, pw.alpha, pw.power) || '–'}</td></tr>
      <tr><td>Différence et ET observés</td><td>${fmt(dObs)}</td><td>${fmt(sdPool)}</td><td class="num">${Stats.sampleSize(dObs, sdPool, pw.alpha, pw.power) || '–'}</td></tr>
    </tbody></table></div>
    <p class="hint">Test t bilatéral, α = ${String(pw.alpha).replace('.', ',')}, puissance ${Math.round(pw.power * 100)} %. Cible actuelle : ${c.groupes.G1.cible} yeux par groupe rincé.</p>
  </div>

  <h3>Critères secondaires</h3>
  ${sec.map(([k, label, unit]) => { const b = by(k); const k3 = Stats.kruskal(['G1', 'G2', 'G3'].map(g => b[g].map(p => p.v))); return `<div class="panel"><b>${label}${unit ? ` (${unit})` : ''}</b>${dotPlot(b, { unit, id: k, dec: unit ? 0 : 2 })}${descTable(b, unit ? 0 : 2)}${k3 ? `<p class="hint">Kruskal-Wallis (G1–G3) : ${pTxt(k3.p)}</p>` : ''}</div>`; }).join('')}

  <h3>Cellule de Franz</h3>
  ${fz.length ? `<p class="hint">${fz.length} cellule(s).</p>${franzChart(fz, false)}
    <div class="tbl-wrap"><table><thead><tr><th>Temps</th><th>n</th><th>pH récepteur</th><th>pH donneur</th><th>Fluorescence</th></tr></thead><tbody>
    ${[...new Set(fz.flatMap(f => arr(f.temps)))].sort((a, b) => a - b).map(t => { const g = k => fz.map(f => f.points?.[t]?.[k]).filter(isNum); const ms = v => v.length ? `${fmt(Stats.mean(v), 2)} ± ${fmt(Stats.sd(v), 2)}` : '–'; return `<tr><td>${t} min</td><td>${Math.max(g('phR').length, g('fluo').length)}</td><td>${ms(g('phR'))}</td><td>${ms(g('phD'))}</td><td>${ms(g('fluo'))}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="hint">Aucune cellule enregistrée.</p>'}`;
}
