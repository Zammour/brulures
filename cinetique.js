/* Cinétique des effluents pendant le rinçage : pH, fluorescence, capsaïcine, à des temps définis depuis le début du rinçage. */
'use strict';
const KIN_DEFAULT = { temps: [0, 2.5, 5, 7.5, 10, 12.5, 15], uniteCaps: 'µg/mL' };
const KIN_VARS = [['ph', 'pH de l’effluent', ''], ['fluo', 'Fluorescence', null], ['caps', 'Capsaïcine', null], ['vol', 'Volume de la fraction', 'mL']];
function kinConf() { const k = Object.assign({}, KIN_DEFAULT, cfg().cinetique || {}); k.temps = arr(k.temps).filter(isNum).sort((a, b) => a - b); return k; }
const kinKey = t => String(Math.round(t * 60)); // clé en secondes (sans point décimal)
function kinUnit(v) { const c = cfg(); return v === 'fluo' ? c.fluo.unite : v === 'caps' ? kinConf().uniteCaps : v === 'vol' ? 'mL' : ''; }
function kinTimes(e) { return arr(e.cinetique?.temps).length ? arr(e.cinetique.temps) : kinConf().temps; }

function kineticBlock(e) {
  if (!arr(e.rincage?.phases).length) return '';
  const tl = e.timeline || {}; const start = tl.r0s; const times = kinTimes(e);
  return `<h3>Prélèvements pendant le rinçage</h3>
  <p class="hint">Temps comptés depuis le début du rinçage${start ? ` (${fmtTime(start)})` : ' : ils démarrent avec le minuteur de la phase 1'}. L’heure est notée avec « Prélevé maintenant » ou à la saisie du pH ; fluorescence et capsaïcine peuvent être saisies plus tard. Les temps se modifient dans Réglages.</p>
  ${times.map(t => {
    const k = kinKey(t); const p = e.cinetique?.points?.[k] || {}; const due = start ? start + t * 60000 : null; const base = `cinetique.points.${k}`;
    return `<div class="panel">
      <div class="row"><b>t = ${fmt(t, t % 1 ? 1 : 0)} min</b>${due ? `<span class="hint">prévu ${fmtTime(due)}</span>` : ''}
      ${due && !p.heure ? `<span class="right num" data-due="${due}">${mmss((due - Date.now()) / 1000)}</span>` : p.heure ? `<span class="right badge ok">${fmtTime(p.heure)}</span>` : ''}</div>
      ${start && !p.heure ? `<div class="btn-row" style="margin-top:6px"><button class="btn small" data-act="stamp" data-rec="${e.id}" data-path="${base}.heure">Prélevé maintenant</button></div>` : ''}
      <div class="grid2" style="margin-top:8px">${fNum(e, base + '.ph', 'pH de l’effluent')}${fNum(e, base + '.fluo', 'Fluorescence', kinUnit('fluo'))}</div>
      <div class="grid2">${fNum(e, base + '.caps', 'Capsaïcine', kinUnit('caps'))}${fNum(e, base + '.vol', 'Volume de la fraction', 'mL')}</div>
    </div>`;
  }).join('')}
  ${kinChartEye(e)}`;
}
function kinSeries(list, v) { // moyenne par temps
  const times = [...new Set(list.flatMap(kinTimes))].sort((a, b) => a - b); const pts = [];
  times.forEach(t => { const vals = list.map(e => e.cinetique?.points?.[kinKey(t)]?.[v]).filter(isNum); if (vals.length) pts.push([t, Stats.mean(vals), Stats.sd(vals), vals.length]); });
  return pts;
}
function kinChartEye(e) {
  const out = KIN_VARS.slice(0, 3).map(([v, label]) => { const pts = kinSeries([e], v); return pts.length ? `<div class="panel"><b>${label}${kinUnit(v) ? ` (${esc(kinUnit(v))})` : ''}</b>${lineChart([{ name: label, color: 'var(--g1)', pts: pts.map(p => [p[0], p[1]]) }], { yLabel: label, id: 'kin' + v + 'e' })}</div>` : ''; }).join('');
  return out;
}
function kineticEvents(now, ev) {
  eyes().forEach(e => {
    if (e.statut?.exclu || !arr(e.rincage?.phases).length) return; const s = e.timeline?.r0s; if (!s) return;
    kinTimes(e).forEach(t => { const due = s + t * 60000; const p = e.cinetique?.points?.[kinKey(t)]; if (!p?.heure && t > 0 && now < due + 20 * 60000) ev.push({ rec: e, key: e.id + 'kin' + kinKey(t), label: `Prélèvement t = ${fmt(t, t % 1 ? 1 : 0)} min`, end: due, href: `#/oeil/${e.id}/rincage` }); });
  });
}
function kineticFlat(e, P) {
  kinConf().temps.forEach(t => { const p = e.cinetique?.points?.[kinKey(t)] || {}; const tag = `cin_${String(t).replace('.', ',')}min`; KIN_VARS.forEach(([v]) => P(`${tag}_${v}`, p[v])); P(`${tag}_heure`, p.heure ? new Date(p.heure).toISOString() : ''); });
}
function kineticExportRows() {
  const rows = [];
  eyes().sort((a, b) => a.createdAt - b.createdAt).forEach(e => {
    const s = e.timeline?.r0s;
    kinTimes(e).forEach(t => {
      const p = e.cinetique?.points?.[kinKey(t)]; if (!p) return;
      rows.push([['code', e.code], ['phase', e.phase], ['groupe', e.groupe], ['exclu', e.statut?.exclu ? 'oui' : 'non'], ['temps_prevu_min', t],
        ['temps_reel_min', p.heure && s ? +((p.heure - s) / 60000).toFixed(2) : ''], ['pH_effluent', p.ph ?? ''], ['fluorescence', p.fluo ?? ''], ['capsaicine', p.caps ?? ''], ['volume_fraction_mL', p.vol ?? ''], ['id', e.id]]);
    });
  });
  return rows;
}
function kineticAnalyses(inc) {
  const rinced = inc.filter(e => arr(e.rincage?.phases).length);
  const any = rinced.some(e => Object.keys(e.cinetique?.points || {}).length);
  if (!any) return `<h3>Cinétique pendant le rinçage</h3><p class="hint">Pas encore de prélèvements saisis.</p>`;
  return `<h3>Cinétique pendant le rinçage</h3><p class="hint">Moyennes par groupe à chaque temps de prélèvement (depuis le début du rinçage).</p>` +
    KIN_VARS.slice(0, 3).map(([v, label]) => {
      const series = ['G1', 'G2', 'G3'].map(g => ({ g, pts: kinSeries(rinced.filter(e => e.groupe === g), v) })).filter(s => s.pts.length);
      if (!series.length) return '';
      const times = [...new Set(series.flatMap(s => s.pts.map(p => p[0])))].sort((a, b) => a - b);
      return `<div class="panel"><b>${label}${kinUnit(v) ? ` (${esc(kinUnit(v))})` : ''}</b>
        ${lineChart(series.map(s => ({ name: `${s.g} ${cfg().groupes[s.g].nom}`, color: GCOL(s.g), pts: s.pts.map(p => [p[0], p[1]]) })), { yLabel: label, id: 'kin' + v })}
        <div class="tbl-wrap"><table><thead><tr><th>Temps</th>${series.map(s => `<th>${s.g}</th>`).join('')}</tr></thead><tbody>
        ${times.map(t => `<tr><td>${fmt(t, t % 1 ? 1 : 0)} min</td>${series.map(s => { const p = s.pts.find(q => q[0] === t); return `<td>${p ? `${fmt(p[1], 2)} ± ${fmt(p[2], 2)} <span class="hint">(${p[3]})</span>` : '–'}</td>`; }).join('')}</tr>`).join('')}
        </tbody></table></div></div>`;
    }).join('');
}
function kineticSettings() {
  const c = cfg(); const k = kinConf();
  return `<details data-k="kin" class="panel"><summary>Prélèvements pendant le rinçage</summary>
    <label class="field"><span>Temps de prélèvement depuis le début du rinçage (min)</span><input data-act-change="cnums" data-path="cinetique.temps" value="${esc(k.temps.join('; ').replace(/\./g, ','))}" placeholder="0; 2,5; 5"></label>
    <label class="field"><span>Unité de la capsaïcine</span><input data-rec="config" data-path="cinetique.uniteCaps" data-kind="text" value="${esc(k.uniteCaps)}"></label>
    <p class="hint">Séparez les temps par « ; » ou des espaces si vous utilisez des virgules décimales. S’applique aux nouvelles fiches ; une fiche déjà commencée garde ses temps.</p>
  </details>`;
}
