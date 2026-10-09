/* Vues : liste des yeux, création, fiche œil, cellule de Franz, réglages. */
'use strict';
const UI = {
  filterPhase: 'tout', filterDay: '',
  nouveau: { phase: 'principale', date: todayISO(), rand: null, manual: false, groupe: '', motif: '' },
  analyzer: null, confirmDel: null, anaPhase: 'principale'
};

/* ---------- Petits composants ---------- */
const numVal = v => (isNum(v) ? String(v).replace('.', ',') : '');
function fNum(rec, path, label, unit = '', extra = '') {
  return `<label class="field"><span>${esc(label)}${unit ? ` <span class="unit">(${esc(unit)})</span>` : ''}</span>
  <input inputmode="decimal" autocomplete="off" data-rec="${rec.id}" data-path="${path}" data-kind="num" value="${esc(numVal(getPath(rec, path)))}" ${extra}></label>`;
}
function fText(rec, path, label, ph = '') {
  return `<label class="field"><span>${esc(label)}</span><input data-rec="${rec.id}" data-path="${path}" data-kind="text" value="${esc(getPath(rec, path) ?? '')}" placeholder="${esc(ph)}"></label>`;
}
function fDate(rec, path, label) {
  return `<label class="field"><span>${esc(label)}</span><input type="date" data-rec="${rec.id}" data-path="${path}" data-kind="text" value="${esc(getPath(rec, path) ?? '')}"></label>`;
}
function fArea(rec, path, label, ph = '') {
  return `<label class="field"><span>${esc(label)}</span><textarea data-rec="${rec.id}" data-path="${path}" data-kind="text" placeholder="${esc(ph)}">${esc(getPath(rec, path) ?? '')}</textarea></label>`;
}
function fSelect(rec, path, label, opts) {
  const v = getPath(rec, path) ?? '';
  return `<label class="field"><span>${esc(label)}</span><select data-rec="${rec.id}" data-path="${path}" data-kind="text">${opts.map(([k, l]) => `<option value="${esc(k)}" ${String(k) === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
}
function fCheck(rec, path, label) {
  return `<label class="check"><input type="checkbox" data-rec="${rec.id}" data-path="${path}" data-kind="bool" ${getPath(rec, path) ? 'checked' : ''}> ${esc(label)}</label>`;
}
function fSeg(rec, path, opts) {
  const v = getPath(rec, path) ?? ''; const name = 'seg-' + path.replace(/\W/g, '');
  return `<div class="seg" role="radiogroup">${opts.map(([k, l]) => `<label><input type="radio" name="${name}" value="${esc(k)}" data-rec="${rec.id}" data-path="${path}" data-kind="text" ${k === v ? 'checked' : ''}>${esc(l)}</label>`).join('')}</div>`;
}
const gChip = g => `<span class="g" data-g="${g}">${g} ${esc(cfg().groupes[g]?.nom || '')}</span>`;

function timerHTML({ label, recId, sPath, ePath, start, end, dur, disabled, note }) {
  const state = end ? 'done' : start ? 'run' : 'idle';
  let digits = mmss(dur), sub = note || `Durée prévue : ${mmss(dur)}`;
  if (end) { digits = mmss((end - start) / 1000); sub = `Fait : ${fmtTime(start)} → ${fmtTime(end)}`; }
  return `<div class="timer" data-state="${state}" ${start && !end ? `data-start="${start}" data-dur="${dur}"` : ''}>
    <div class="lbl"><span>${esc(label)}</span>${end ? '<span class="badge ok">terminé</span>' : ''}</div>
    <div class="digits" aria-live="off">${digits}</div>
    <div class="sub">${esc(sub)}</div>
    <div class="btn-row">
      ${!start ? `<button class="btn primary big" data-act="tstart" data-rec="${recId}" data-path="${sPath}" ${disabled ? 'disabled' : ''}>Démarrer</button>` : ''}
      ${start && !end ? `<button class="btn primary big" data-act="tstop" data-rec="${recId}" data-path="${ePath}">Terminer</button>` : ''}
      ${start ? `<button class="btn small" data-act="treset" data-rec="${recId}" data-s="${sPath}" data-e="${ePath}">Corriger</button>` : ''}
    </div></div>`;
}

/* ---------- Identité requise ---------- */
function identityPanel() {
  return `<div class="panel"><h3 style="margin-top:0">Avant de commencer</h3>
  <p class="hint">Vos initiales servent à nommer les fiches et à tracer les modifications.</p>
  <label class="field"><span>Nom</span><input data-pref="nom" value="${esc(St.prefs.nom)}" placeholder="ex. Adrien Zammour"></label>
  <label class="field"><span>Initiales</span><input data-pref="initiales" maxlength="4" value="${esc(St.prefs.initiales)}" placeholder="ex. AZ" autocapitalize="characters"></label>
  <button class="btn primary" data-act="rerender">Enregistrer</button></div>`;
}

/* ---------- Liste des yeux ---------- */
function progressPanel(list, title) {
  const c = cfg();
  const rows = GROUPS.map(g => {
    const inc = list.filter(e => e.groupe === g && !e.statut?.exclu);
    const done = inc.filter(e => isNum(derive(e).CEP)).length; const target = c.groupes[g]?.cible || 0;
    const pct = target ? Math.min(100, 100 * done / target) : 0;
    return `${gChip(g)}<div class="bar" style="--gc:var(--${g.toLowerCase()})"><i style="width:${pct}%"></i></div><span class="num">${done}/${target}${inc.length > done ? ` <span class="hint">(+${inc.length - done})</span>` : ''}</span>`;
  }).join('');
  return `<div class="panel"><div class="row" style="margin-bottom:10px"><b>${title}</b><span class="hint right">fiches complètes / cible</span></div><div class="prog">${rows}</div></div>`;
}
function renderYeux() {
  if (!St.prefs.initiales) return identityPanel();
  let list = eyes().sort((a, b) => b.createdAt - a.createdAt);
  const days = [...new Set(list.map(e => e.info?.dateExp).filter(Boolean))].sort().reverse();
  const dup = randDuplicates();
  const shown = list.filter(e => (UI.filterPhase === 'tout' || e.phase === UI.filterPhase) && (!UI.filterDay || e.info?.dateExp === UI.filterDay));
  return `
  <a class="btn primary big" href="#/nouveau">Nouvel œil</a>
  <div style="height:14px"></div>
  ${progressPanel(list.filter(e => e.phase === 'principale'), 'Étude principale')}
  ${dup.length ? `<p class="badge warn">Deux yeux ont reçu le même rang de randomisation (saisie hors ligne simultanée) : ${dup.map(esc).join(', ')}</p>` : ''}
  <div class="filters" role="group" aria-label="Filtrer par phase">
    ${[['tout', 'Toutes phases'], ['principale', 'Principale'], ['pilote', 'Pilote']].map(([k, l]) => `<button class="chip" data-act="fphase" data-v="${k}" aria-pressed="${UI.filterPhase === k}">${l}</button>`).join('')}
  </div>
  ${days.length > 1 ? `<div class="filters" role="group" aria-label="Filtrer par jour">
    <button class="chip" data-act="fday" data-v="" aria-pressed="${!UI.filterDay}">Tous les jours</button>
    ${days.map(d => `<button class="chip" data-act="fday" data-v="${d}" aria-pressed="${UI.filterDay === d}">${fmtDate(d)}</button>`).join('')}</div>` : ''}
  ${shown.length ? `<ul class="list">${shown.map(e => {
    const d = derive(e);
    return `<li><a href="#/oeil/${e.id}">
      <div class="l1"><span class="code">${esc(e.code)}</span>${gChip(e.groupe)}<span class="right">${isNum(d.CEP) ? `<b class="num">${fmt(d.CEP)} %</b>` : ''}</span></div>
      <div class="l2"><span class="steps-mini">${STEPS.map(([k]) => `<i class="${stepDone(e, k, d) ? 'on' : ''}"></i>`).join('')}</span>
      <span>${fmtDate(e.info?.dateExp)}</span>${e.phase === 'pilote' ? '<span class="badge">pilote</span>' : ''}${e.statut?.exclu ? '<span class="badge warn">exclu</span>' : ''}${St.prefs.syncUrl && St.dirty.has(e.id) ? '<span class="badge">non synchronisé</span>' : ''}</div>
    </a></li>`;
  }).join('')}</ul>` : `<div class="empty">Aucun œil enregistré${UI.filterDay || UI.filterPhase !== 'tout' ? ' pour ce filtre' : ''}. Créez la première fiche avec « Nouvel œil ».</div>`}`;
}

/* ---------- Nouvel œil ---------- */
function renderNouveau() {
  if (!St.prefs.initiales) return identityPanel();
  const N = UI.nouveau; const c = cfg();
  const block = randBlock(N.phase);
  const preview = !N.manual && !N.rand ? nextRand(N.date, N.phase) : null;
  return `<a class="back" href="#/yeux">‹ Yeux</a><h2>Nouvel œil</h2>
  <div class="panel">
    <span class="hint">Phase</span>
    <div class="seg" role="radiogroup">${[['principale', 'Étude principale'], ['pilote', 'Pilote']].map(([k, l]) => `<label><input type="radio" name="nph" data-act="nphase" value="${k}" ${N.phase === k ? 'checked' : ''}>${l}</label>`).join('')}</div>
    <label class="field"><span>Date de l’expérience (strate de randomisation)</span><input type="date" data-nv="date" value="${N.date}"></label>
  </div>
  ${N.rand ? `<div class="panel" style="text-align:center">
      <p class="hint">Rang ${N.rand.index + 1} du ${fmtDate(N.rand.day)} – ${N.phase}</p>
      <div style="font-size:34px;margin:6px 0 4px">${gChip(N.rand.groupe)}</div>
      <p>${esc(c.groupes[N.rand.groupe]?.desc || '')}</p>
      <button class="btn primary big" data-act="create">Créer la fiche</button>
      <div class="btn-row"><button class="btn small" data-act="ncancel">Annuler le tirage</button></div></div>`
    : N.manual ? `<div class="panel"><h3 style="margin-top:0">Attribution manuelle</h3>
      <label class="field"><span>Groupe</span><select data-nv="groupe"><option value="">Choisir…</option>${GROUPS.map(g => `<option value="${g}" ${N.groupe === g ? 'selected' : ''}>${g} – ${esc(c.groupes[g].nom)}</option>`).join('')}</select></label>
      <label class="field"><span>Motif (obligatoire)</span><input data-nv="motif" value="${esc(N.motif)}" placeholder="ex. œil de remplacement"></label>
      <button class="btn primary big" data-act="create" ${N.groupe && N.motif ? '' : 'disabled'}>Créer la fiche</button>
      <div class="btn-row"><button class="btn small" data-act="nmanual" data-v="0">Revenir au tirage au sort</button></div></div>`
    : `<div class="panel">
      ${block.length ? `<p class="hint">Blocs de ${block.length} (${GROUPS.filter(g => (c.rand.blocs[N.phase] || {})[g]).map(g => `${g}×${c.rand.blocs[N.phase][g]}`).join(', ')}), stratifiés sur le jour. Prochain rang : ${preview.index + 1}.</p>
      <button class="btn primary big" data-act="draw">Tirer au sort</button>` : `<p>Aucun bloc défini pour cette phase. Réglez la composition des blocs dans Réglages.</p>`}
      <div class="btn-row"><button class="btn small" data-act="nmanual" data-v="1">Attribuer manuellement</button></div></div>`}`;
}

/* ---------- Fiche œil ---------- */
function renderEye(id, step) {
  const e = St.records.get(id); if (!e || e.deleted) return `<a class="back" href="#/yeux">‹ Yeux</a><div class="empty">Fiche introuvable.</div>`;
  step = STEPS.some(s => s[0] === step) ? step : firstOpenStep(e);
  const d = derive(e); const i = STEPS.findIndex(s => s[0] === step);
  const body = ({ prep: stepPrep, base: stepMeasure, t5: stepMeasure, t30: stepMeasure, brulure: stepBrulure, rincage: stepRincage, fluo: stepFluo, histo: stepHisto, statut: stepStatut })[step](e, d, step);
  return `<a class="back" href="#/yeux">‹ Yeux</a>
  <div class="eye-head"><span class="code">${esc(e.code)}</span>${gChip(e.groupe)}${e.phase === 'pilote' ? '<span class="badge">pilote</span>' : ''}${e.statut?.exclu ? '<span class="badge warn">exclu</span>' : ''}</div>
  <nav class="stepper" aria-label="Étapes">${STEPS.map(([k, l], j) => `<a href="#/oeil/${e.id}/${k}" class="${stepDone(e, k, d) ? 'done' : ''}" ${k === step ? 'aria-current="step"' : ''}><b>${stepDone(e, k, d) ? '✓' : j + 1}</b>${l}</a>`).join('')}</nav>
  <h2>${i + 1}. ${STEPS[i][1]}</h2>
  ${body}
  <div class="btn-row" style="margin-top:18px">
    ${i > 0 ? `<a class="btn" href="#/oeil/${e.id}/${STEPS[i - 1][0]}">‹ ${STEPS[i - 1][1]}</a>` : ''}
    ${i < STEPS.length - 1 ? `<a class="btn primary" href="#/oeil/${e.id}/${STEPS[i + 1][0]}">${STEPS[i + 1][1]} ›</a>` : ''}
  </div>`;
}
function firstOpenStep(e) { const d = derive(e); return (STEPS.find(([k]) => !stepDone(e, k, d)) || STEPS[0])[0]; }

function stepPrep(e) {
  const g = cfg().groupes[e.groupe];
  return `<div class="panel"><dl class="kv"><dt>Groupe</dt><dd>${gChip(e.groupe)} – ${esc(g?.desc || '')}</dd>
    <dt>Randomisation</dt><dd>${e.rand?.mode === 'auto' ? `rang ${e.rand.index + 1} du ${fmtDate(e.rand.day)}` : `manuelle – ${esc(e.rand?.motif || '')}`}</dd></dl></div>
  <div class="panel">
    <div class="grid2">${fDate(e, 'info.dateExp', 'Date de l’expérience')}${fDate(e, 'info.dateAbattage', 'Date d’abattage')}</div>
    <div class="grid2">${fNum(e, 'info.conservH', 'Durée de conservation', 'h')}${fNum(e, 'info.conservTemp', 'Température de conservation', '°C')}</div>
    <div class="grid2">${fNum(e, 'info.tempAmb', 'Température ambiante', '°C')}${fNum(e, 'info.volAgent', 'Volume d’agent appliqué', 'µL')}</div>
    ${fText(e, 'info.concTraceur', 'Concentration du traceur', 'ex. Nile Red 10 µg/mL')}
    <span class="hint">Œil</span>${fSeg(e, 'info.oeil', [['OD', 'Droit'], ['OG', 'Gauche'], ['', 'Non précisé']])}
    ${fText(e, 'info.operateur', 'Opérateur')}
  </div>`;
}

function photoBlock(e, tp) {
  const m = e.mesures?.[tp] || {}; const key = e.id + '|' + tp;
  const an = UI.analyzer && UI.analyzer.key === key;
  return `<div class="photo">
    ${m.photo ? `<img alt="Photo ${esc(tp)}" data-photo="${key}" src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">` : ''}
    <div class="grow">
      <label class="btn ${m.photo ? 'small' : 'primary'}" style="width:100%">${m.photo ? 'Reprendre la photo' : 'Prendre une photo'}
        <input type="file" accept="image/*" capture="environment" hidden data-photo-input data-rec="${e.id}" data-tp="${tp}"></label>
      ${m.photo ? `<div class="btn-row"><button class="btn small" data-act="analyze" data-key="${key}">${an ? 'Fermer l’analyse' : 'Mesurer le gris sur la photo'}</button></div>` : '<p class="hint" style="margin-top:6px">Facultatif si la photo est prise avec un autre appareil.</p>'}
      ${m.photo?.url ? `<p class="hint" style="margin-top:6px"><a href="${esc(m.photo.url)}" target="_blank" rel="noopener">Photo sur Google Drive</a></p>` : m.photo ? '<p class="hint" style="margin-top:6px">Photo enregistrée sur cet appareil.</p>' : ''}
    </div></div>
    ${an ? `<div class="analyzer panel">
      <p class="hint">Touchez la photo pour placer le centre de la zone, puis réglez le rayon.</p>
      <canvas id="an-canvas"></canvas>
      <label class="field" style="margin-top:10px"><span>Rayon de la zone (% de la largeur)</span><input type="range" min="2" max="45" step="0.5" value="${UI.analyzer.r}" data-an="r"></label>
      <div class="row"><span>Gris moyen (0–255)</span><span class="res right" id="an-res">–</span></div>
      <div class="btn-row"><button class="btn primary" data-act="anuse" data-target="gris">Utiliser comme gris</button><button class="btn" data-act="anuse" data-target="grisRef">Utiliser comme référence</button></div>
    </div>` : ''}`;
}
function stepMeasure(e, d, tp) {
  const m = e.mesures?.[tp] || {}; const c = cfg();
  let due = '';
  if (tp !== 'base') {
    const mins = tp === 't5' ? c.tempsPost[0] : c.tempsPost[1]; const ref = d.t0post;
    due = ref ? `<div class="timer" ${m.heure ? 'data-state="done"' : `data-start="${ref}" data-dur="${mins * 60}" data-state="run"`}>
        <div class="lbl"><span>Mesure à ${mins} min après la fin du rinçage</span>${m.heure ? '<span class="badge ok">faite</span>' : ''}</div>
        <div class="digits">${m.heure ? fmtTime(m.heure) : mmss(mins * 60 - (Date.now() - ref) / 1000)}</div>
        <div class="sub">${m.heure ? `Mesure notée ${fmt((m.heure - ref) / 60000, 1)} min après la fin du rinçage` : `Prévue à ${fmtTime(ref + mins * 60000)}`}</div>
        ${m.heure ? '' : `<div class="btn-row"><button class="btn primary" data-act="stamp" data-rec="${e.id}" data-path="mesures.${tp}.heure">Mesure faite maintenant</button></div>`}
      </div>` : `<p class="banner">Le rinçage n’est pas encore terminé : l’heure de mesure sera calculée à la fin du rinçage.</p>`;
  }
  const pv = Array.from({ length: c.nPachy }, (_, i) => `<input inputmode="decimal" aria-label="Pachymétrie ${i + 1}" data-rec="${e.id}" data-path="mesures.${tp}.pachy.${i}" data-kind="num" value="${esc(numVal(m.pachy?.[i]))}">`).join('');
  return `${due}
  <h3>Opacité</h3>
  <div class="panel">${photoBlock(e, tp)}
    <div class="grid2">${fNum(e, `mesures.${tp}.gris`, 'Gris moyen (zone cornéenne)', '0–255')}${fNum(e, `mesures.${tp}.grisRef`, 'Gris de référence', 'facultatif')}</div>
    <p class="hint">Si une référence est saisie, l’opacité est exprimée en rapport gris / référence.</p>
  </div>
  <h3>Pachymétrie centrale</h3>
  <div class="panel"><div class="pachy">${pv}</div>
    <div class="row" style="margin-top:10px"><span class="hint">Moyenne (${d[tp + '_pachyN']}/${c.nPachy})</span><b class="num right" style="font-size:22px">${fmt(d[tp + '_pachy'], 0)} µm</b></div>
    ${tp !== 'base' && isNum(d[tp === 't5' ? 'dPachy5' : 'dPachy30']) ? `<p class="hint" style="margin-top:6px">Δ vs baseline : ${fmt(d[tp === 't5' ? 'dPachy5' : 'dPachy30'], 0)} µm</p>` : ''}
  </div>
  ${fArea(e, `mesures.${tp}.note`, 'Remarque', '')}`;
}
function stepBrulure(e) {
  const tl = e.timeline || {}; const c = cfg();
  return `<p class="hint">Appliquer ${isNum(e.info?.volAgent) ? fmt(e.info.volAgent, 0) + ' µL' : '20–30 µL'} d’agent + traceur au centre (rond de 8–10 mm). Démarrer au moment de l’application.</p>
  ${timerHTML({ label: 'Exposition', recId: e.id, sPath: 'timeline.exposStart', ePath: 'timeline.exposEnd', start: tl.exposStart, end: tl.exposEnd, dur: c.expositionSec })}
  <div class="panel">
    <label class="check"><input type="checkbox" data-act="swab" data-rec="${e.id}" ${tl.swab ? 'checked' : ''}> Excès retiré à l’écouvillon sec (3 touches)${tl.swab ? ` <span class="hint">à ${fmtTime(tl.swab)}</span>` : ''}</label>
    <p class="hint">Conserver l’écouvillon pour la lecture de fluorescence.</p>
  </div>`;
}
function stepRincage(e, d) {
  const tl = e.timeline || {}; const ph = arr(e.rincage?.phases); const c = cfg();
  if (!ph.length) return `<div class="panel"><p><b>Groupe sans rinçage.</b></p><p class="hint">Les mesures post sont comptées à partir du retrait de l’excès à l’écouvillon (ou, à défaut, de la fin de l’exposition).</p>
    <dl class="kv"><dt>Référence</dt><dd>${d.t0post ? fmtTime(d.t0post) : 'pas encore'}</dd>${d.t0post ? c.tempsPost.map(m => `<dt>Mesure ${m} min</dt><dd>${fmtTime(d.t0post + m * 60000)}</dd>`).join('') : ''}</dl></div>`;
  return ph.map((p, i) => `
    <h3>Phase ${i + 1}${ph.length > 1 ? ` sur ${ph.length}` : ''} – ${esc(p.solution)}</h3>
    <div class="grid3">${fText(e, `rincage.phases.${i}.solution`, 'Solution')}${fNum(e, `rincage.phases.${i}.volume`, 'Volume', 'mL')}${fNum(e, `rincage.phases.${i}.duree`, 'Durée', 'min')}</div>
    ${timerHTML({ label: `Rinçage ${p.solution}`, recId: e.id, sPath: `timeline.r${i}s`, ePath: `timeline.r${i}e`, start: tl['r' + i + 's'], end: tl['r' + i + 'e'], dur: (p.duree || 0) * 60, disabled: i > 0 && !tl['r' + (i - 1) + 'e'], note: isNum(p.volume) && isNum(p.duree) && p.duree > 0 ? `${fmt(p.volume, 0)} mL en ${fmt(p.duree, 1)} min, soit ${fmt(p.volume / p.duree, 0)} mL/min` : '' })}
  `).join('') + (d.t0post ? `<div class="panel"><dl class="kv"><dt>Fin du rinçage</dt><dd>${fmtTime(d.t0post)}</dd>${c.tempsPost.map(m => `<dt>Mesure ${m} min</dt><dd>${fmtTime(d.t0post + m * 60000)}</dd>`).join('')}</dl></div>` : '');
}
function stepFluo(e, d) {
  const c = cfg(); const valLabel = c.fluo.mode === 'concentration' ? `Concentration (${c.fluo.uniteConc})` : `Lecture (${c.fluo.unite})`;
  const samples = sampleList(e);
  return `<div class="panel" style="text-align:center">
    <p class="hint" style="margin:0">Pourcentage d’élimination du traceur</p>
    <div class="big-res">${isNum(d.CEP) ? fmt(d.CEP) + ' %' : '–'}</div>
    <p class="hint">éliminé ÷ (éliminé + résiduel tissulaire)${c.fluo.ecouvillon === 'elimine' ? ', écouvillon compté comme éliminé' : ', écouvillon exclu du calcul'}</p>
    ${d.fluoWarn ? `<p class="badge warn">${esc(d.fluoWarn)}</p>` : ''}
  </div>
  <p class="hint">Quantité = ${c.fluo.mode === 'concentration' ? 'concentration' : 'lecture corrigée (blanc, gamme d’étalonnage si renseignée)'} × dilution × volume total. Le mode de calcul se règle dans Réglages.</p>
  ${samples.map(s => {
    const r = sampleQty(s); const base = `fluo.samples.${s.id}`;
    return `<div class="sample">
      <div class="row"><b>${esc(SAMPLE_KINDS[s.kind]?.label || 'Échantillon')}</b><button class="btn small right" data-act="sdel" data-rec="${e.id}" data-sid="${s.id}" aria-label="Supprimer l’échantillon">Supprimer</button></div>
      <div class="grid2">${fSelect(e, base + '.kind', 'Type', Object.entries(SAMPLE_KINDS).map(([k, v]) => [k, v.label]))}${fSelect(e, base + '.matrice', 'Milieu de lecture', [['', 'Par défaut (' + MATRICES[SAMPLE_KINDS[s.kind]?.matrice] + ')'], ...Object.entries(MATRICES)])}</div>
      <div class="grid3">${fNum(e, base + '.valeur', valLabel)}${fNum(e, base + '.dilution', 'Dilution', '×')}${fNum(e, base + '.volume', 'Volume total', 'mL')}</div>
      <p class="hint">Quantité : <b class="num">${fmtQ(r.q)}</b>${r.q !== null && !r.calibrated ? ' (unités relatives)' : ''}</p>
    </div>`;
  }).join('')}
  <button class="btn" data-act="sadd" data-rec="${e.id}">Ajouter un échantillon</button>
  <div class="panel" style="margin-top:12px"><dl class="kv"><dt>Éliminé</dt><dd class="num">${fmtQ(d.qElim)}</dd><dt>Résiduel (tissu)</dt><dd class="num">${fmtQ(d.qResid)}</dd><dt>Écouvillon</dt><dd class="num">${fmtQ(d.qSwab)}</dd></dl></div>`;
}
function stepHisto(e) {
  const c = cfg();
  return `<div class="panel">${fCheck(e, 'histo.prevu', 'Cet œil est destiné à l’histologie')}</div>
  ${e.histo?.prevu ? `<h3>Étapes</h3><div class="panel">
    ${c.histoEtapes.map(s => `<label class="check"><input type="checkbox" data-act="hstep" data-rec="${e.id}" data-step="${esc(s)}" ${e.histo?.etapes?.[s] ? 'checked' : ''}> ${esc(s)}${e.histo?.etapes?.[s] ? ` <span class="hint">${fmtDateTime(e.histo.etapes[s])}</span>` : ''}</label>`).join('')}
    <p class="hint">La liste des étapes se modifie dans Réglages.</p></div>
  <h3>Mesures</h3><div class="panel">${c.histoMesures.map(s => fNum(e, `histo.mesures.${hKey(s)}`, s)).join('')}</div>
  ${fArea(e, 'histo.note', 'Remarques histologie')}` : ''}`;
}
function stepStatut(e) {
  const hist = (e.history || []).slice().reverse().slice(0, 60);
  return `<div class="panel">${fCheck(e, 'statut.exclu', 'Exclure cet œil des analyses')}
    ${e.statut?.exclu ? fText(e, 'statut.motif', 'Motif d’exclusion (obligatoire)', 'ex. épithélium lésé à la baseline') : ''}
    ${e.statut?.exclu && !e.statut?.motif ? '<p class="badge warn">Indiquez le motif d’exclusion.</p>' : ''}</div>
  ${fArea(e, 'statut.deviation', 'Déviation au protocole', 'facultatif')}
  ${fArea(e, 'statut.commentaire', 'Commentaire', 'facultatif')}
  <h3>Journal des modifications</h3>
  <div class="tbl-wrap"><table><thead><tr><th>Quand</th><th>Qui</th><th>Champ</th><th>Avant → après</th></tr></thead><tbody>
  ${hist.map(h => `<tr><td>${fmtDateTime(h.t)}</td><td>${esc(h.u)}</td><td>${esc(h.p)}</td><td style="white-space:normal;text-align:left">${esc(shortVal(h.o))} → ${esc(shortVal(h.n))}</td></tr>`).join('')}
  </tbody></table></div>
  <div style="margin-top:20px">${UI.confirmDel === e.id
    ? `<p>La fiche sera retirée des listes et des analyses (elle reste dans le journal).</p><div class="btn-row"><button class="btn danger" data-act="edel" data-rec="${e.id}">Confirmer la suppression</button><button class="btn" data-act="edelno">Annuler</button></div>`
    : `<button class="btn small danger" data-act="edelask" data-rec="${e.id}">Supprimer la fiche</button>`}</div>`;
}
function shortVal(v) {
  if (v === null || v === undefined || v === '') return '∅';
  if (typeof v === 'number' && v > 1e12) return fmtTime(v);
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60);
  return String(v).slice(0, 80);
}

/* ---------- Cellule de Franz ---------- */
function renderFranzList() {
  if (!St.prefs.initiales) return identityPanel();
  const list = franzs().sort((a, b) => b.createdAt - a.createdAt);
  return `<h2>Cellule de Franz</h2>
  <p class="hint">Expérience préliminaire (10 yeux) : passage de l’agent et évolution du pH à travers la cornée.</p>
  <button class="btn primary big" data-act="fnew">Nouvelle cellule</button><div style="height:14px"></div>
  ${list.length ? `<ul class="list">${list.map(f => {
    const n = arr(f.temps).filter(t => isNum(f.points?.[t]?.phR) || isNum(f.points?.[t]?.fluo)).length;
    return `<li><a href="#/franz/${f.id}"><div class="l1"><span class="code">${esc(f.code)}</span><span class="right hint">${n}/${arr(f.temps).length} temps</span></div>
      <div class="l2"><span>${fmtDate(f.info?.dateExp)}</span>${f.t0 ? `<span>t0 ${fmtTime(f.t0)}</span>` : '<span>non démarrée</span>'}${f.statut?.exclu ? '<span class="badge warn">exclue</span>' : ''}</div></a></li>`;
  }).join('')}</ul>
  <p class="hint" style="margin-top:10px">${list.length} cellule(s) sur 10 prévues.</p>` : '<div class="empty">Aucune cellule enregistrée.</div>'}`;
}
function renderFranz(id) {
  const f = St.records.get(id); if (!f || f.deleted) return `<a class="back" href="#/franz">‹ Franz</a><div class="empty">Fiche introuvable.</div>`;
  const temps = arr(f.temps);
  return `<a class="back" href="#/franz">‹ Franz</a>
  <div class="eye-head"><span class="code">${esc(f.code)}</span>${f.statut?.exclu ? '<span class="badge warn">exclue</span>' : ''}</div>
  <details data-k="d1" class="panel" ${f.t0 ? '' : 'open'}><summary>Préparation et montage</summary>
    <div class="grid2">${fDate(f, 'info.dateExp', 'Date de l’expérience')}${fDate(f, 'info.dateAbattage', 'Date d’abattage')}</div>
    <div class="grid2">${fNum(f, 'info.conservH', 'Conservation', 'h')}${fNum(f, 'info.conservTemp', 'Température de conservation', '°C')}</div>
    <div class="grid2">${fText(f, 'info.milieu', 'Milieu récepteur')}${fNum(f, 'info.volRecepteur', 'Volume récepteur', 'mL')}</div>
    <div class="grid2">${fNum(f, 'info.temperature', 'Température', '°C')}${fNum(f, 'info.volAgent', 'Volume d’agent', 'µL')}</div>
    ${fNum(f, 'info.pachy', 'Pachymétrie avant montage', 'µm')}
    <label class="field"><span>Temps de prélèvement (min, séparés par des virgules)</span><input data-act-change="ftemps" data-rec="${f.id}" value="${esc(temps.join(', '))}"></label>
  </details>
  ${f.t0 ? `<div class="timer" data-state="run" data-start="${f.t0}" data-dur="0" data-up="1"><div class="lbl"><span>Depuis l’application (t0 = ${fmtTime(f.t0)})</span></div><div class="digits">${mmss((Date.now() - f.t0) / 1000)}</div>
     <div class="btn-row"><button class="btn small" data-act="treset" data-rec="${f.id}" data-s="t0" data-e="">Corriger t0</button></div></div>`
    : `<button class="btn primary big" data-act="tstart" data-rec="${f.id}" data-path="t0">Démarrer (application de l’agent)</button><div style="height:12px"></div>`}
  ${temps.map(t => {
    const p = f.points?.[t] || {}; const due = f.t0 ? f.t0 + t * 60000 : null; const base = `points.${t}`;
    return `<div class="panel">
      <div class="row"><b>t = ${t} min</b>${due ? `<span class="hint">prévu ${fmtTime(due)}</span>` : ''}
      ${due && !p.heure ? `<span class="right num" data-due="${due}">${mmss((due - Date.now()) / 1000)}</span>` : p.heure ? `<span class="right badge ok">${fmtTime(p.heure)}</span>` : ''}</div>
      <div class="grid2" style="margin-top:8px">${fNum(f, base + '.phR', 'pH récepteur')}${fNum(f, base + '.phD', 'pH donneur')}</div>
      <div class="grid2">${fNum(f, base + '.fluo', 'Fluorescence récepteur', cfg().fluo.unite)}${fNum(f, base + '.vol', 'Volume prélevé', 'mL')}</div>
    </div>`;
  }).join('')}
  ${franzChart([f])}
  <div class="panel">${fCheck(f, 'statut.exclu', 'Exclure cette cellule')}${fArea(f, 'statut.commentaire', 'Commentaire')}</div>
  <div>${UI.confirmDel === f.id
    ? `<div class="btn-row"><button class="btn danger" data-act="edel" data-rec="${f.id}">Confirmer la suppression</button><button class="btn" data-act="edelno">Annuler</button></div>`
    : `<button class="btn small danger" data-act="edelask" data-rec="${f.id}">Supprimer la fiche</button>`}</div>`;
}

/* ---------- Réglages ---------- */
function cNum(path, label, unit = '') { return fNum(cfg(), path, label, unit); }
function renderReglages() {
  const c = cfg(); const P = St.prefs;
  return `<h2>Réglages</h2>
  <h3>Vous</h3>
  <div class="panel"><div class="grid2">
    <label class="field"><span>Nom</span><input data-pref="nom" value="${esc(P.nom)}"></label>
    <label class="field"><span>Initiales</span><input data-pref="initiales" maxlength="4" value="${esc(P.initiales)}" autocapitalize="characters"></label></div>
    <label class="field"><span>Thème</span><select data-pref="theme"><option value="">Automatique</option><option value="light" ${P.theme === 'light' ? 'selected' : ''}>Clair</option><option value="dark" ${P.theme === 'dark' ? 'selected' : ''}>Sombre</option></select></label>
  </div>

  <h3>Synchronisation</h3>
  <div class="panel">
    <p class="hint">Adresse du script Google et code d’accès, identiques sur tous les téléphones de l’équipe. Sans synchronisation, les données restent sur ce téléphone.</p>
    <label class="field"><span>Adresse du script (se termine par /exec)</span><input data-pref="syncUrl" value="${esc(P.syncUrl)}" placeholder="https://script.google.com/macros/s/…/exec" inputmode="url" autocapitalize="off"></label>
    <label class="field"><span>Code d’accès</span><input data-pref="token" value="${esc(P.token)}" autocapitalize="off"></label>
    <dl class="kv"><dt>Dernière synchro</dt><dd>${St.lastSync ? fmtDateTime(St.lastSync) : 'jamais'}</dd><dt>En attente</dt><dd>${St.dirty.size} fiche(s), ${St.photoQueue.length} photo(s)</dd>${St.syncError ? `<dt>Erreur</dt><dd>${esc(St.syncError)}</dd>` : ''}</dl>
    <div class="btn-row"><button class="btn primary" data-act="sync">Synchroniser maintenant</button></div>
  </div>

  <h3>Exporter les données</h3>
  <div class="panel">
    <p class="hint">Fichiers CSV lisibles dans Excel (séparateur « ; », virgule décimale) et importables dans Prism.</p>
    <div class="btn-row" style="flex-direction:column">
      <button class="btn" data-act="exp" data-v="yeux">Tableau complet des yeux (1 ligne par œil)</button>
      <button class="btn" data-act="exp" data-v="prism">Critère principal, format Prism (1 colonne par groupe)</button>
      <button class="btn" data-act="exp" data-v="franz">Cellule de Franz (1 ligne par temps)</button>
      <button class="btn" data-act="exp" data-v="journal">Journal des modifications</button>
      <button class="btn" data-act="exp" data-v="json">Sauvegarde complète (JSON)</button>
      <label class="btn">Restaurer une sauvegarde (JSON)<input type="file" accept="application/json,.json" hidden data-import></label>
    </div>
  </div>

  <h3>Paramètres de l’étude</h3>
  <p class="hint">Communs à toute l’équipe (synchronisés). Les modifications sont tracées.</p>
  ${GROUPS.map(g => {
    const gr = c.groupes[g]; const ph = arr(gr.phases);
    return `<details data-k="g-${g}" class="panel"><summary>${gChip(g)}&nbsp;– ${esc(gr.desc)}</summary>
      <div class="grid2">${cNum(`groupes.${g}.cible`, 'Effectif cible')}${fText(c, `groupes.${g}.nom`, 'Nom court')}</div>
      ${fText(c, `groupes.${g}.desc`, 'Description')}
      ${ph.map((p, i) => `<h4>Phase de rinçage ${i + 1}</h4><div class="grid3">${fText(c, `groupes.${g}.phases.${i}.solution`, 'Solution')}${cNum(`groupes.${g}.phases.${i}.volume`, 'Volume', 'mL')}${cNum(`groupes.${g}.phases.${i}.duree`, 'Durée', 'min')}</div>`).join('')}
      <div class="btn-row"><button class="btn small" data-act="phadd" data-g="${g}">Ajouter une phase</button>${ph.length ? `<button class="btn small" data-act="phdel" data-g="${g}">Retirer la dernière phase</button>` : ''}</div>
      <p class="hint">S’applique aux nouvelles fiches ; les fiches existantes gardent leurs paramètres.</p>
    </details>`;
  }).join('')}
  <details data-k="d3" class="panel"><summary>Protocole et mesures</summary>
    <div class="grid2">${cNum('expositionSec', 'Durée d’exposition', 's')}${cNum('nPachy', 'Mesures de pachymétrie')}</div>
    <div class="grid2">${cNum('tempsPost.0', '1re mesure post', 'min')}${cNum('tempsPost.1', '2e mesure post', 'min')}</div>
  </details>
  <details data-k="d4" class="panel"><summary>Fluorescence</summary>
    ${fSelect(c, 'fluo.mode', 'Valeur saisie', [['lecture', 'Lecture brute du lecteur (avec blanc / gamme facultatifs)'], ['concentration', 'Concentration déjà calculée']])}
    <div class="grid2">${fText(c, 'fluo.unite', 'Unité de lecture')}${fText(c, 'fluo.uniteConc', 'Unité de concentration')}</div>
    ${fSelect(c, 'fluo.ecouvillon', 'Écouvillon', [['exclu', 'Exclu du calcul (contrôle)'], ['elimine', 'Compté comme éliminé']])}
    <div class="grid2">${cNum('fluo.volTissu', 'Volume d’extraction tissu', 'mL')}${cNum('fluo.volEcouvillon', 'Volume d’extraction écouvillon', 'mL')}</div>
    <h4>Gammes d’étalonnage (lecture = pente × concentration + ordonnée)</h4>
    ${Object.entries(MATRICES).map(([k, l]) => `<p style="margin:8px 0 4px"><b>${l}</b></p><div class="grid3">${cNum(`fluo.calib.${k}.blanc`, 'Blanc')}${cNum(`fluo.calib.${k}.pente`, 'Pente')}${cNum(`fluo.calib.${k}.ordonnee`, 'Ordonnée')}</div>`).join('')}
    <p class="hint">Sans pente, la lecture (moins le blanc) est utilisée en unités relatives : valable seulement si tous les échantillons d’un œil sont lus dans le même milieu.</p>
  </details>
  <details data-k="d5" class="panel"><summary>Histologie</summary>
    <label class="field"><span>Étapes (une par ligne)</span><textarea data-act-change="clist" data-path="histoEtapes">${esc(c.histoEtapes.join('\n'))}</textarea></label>
    <label class="field"><span>Mesures (une par ligne)</span><textarea data-act-change="clist" data-path="histoMesures">${esc(c.histoMesures.join('\n'))}</textarea></label>
  </details>
  <details data-k="d6" class="panel"><summary>Cellule de Franz</summary>
    <label class="field"><span>Temps de prélèvement par défaut (min)</span><input data-act-change="cnums" data-path="franz.temps" value="${esc(arr(c.franz.temps).join(', '))}"></label>
    <div class="grid3">${fText(c, 'franz.milieu', 'Milieu')}${cNum('franz.volRecepteur', 'Volume', 'mL')}${cNum('franz.temperature', 'Température', '°C')}</div>
  </details>
  <details data-k="d7" class="panel"><summary>Randomisation</summary>
    <p class="hint">Blocs permutés, un tirage indépendant par jour d’expérience. Composition d’un bloc :</p>
    ${['principale', 'pilote'].map(ph => `<h4>${ph === 'principale' ? 'Étude principale' : 'Pilote'}</h4><div class="grid2">${GROUPS.map(g => cNum(`rand.blocs.${ph}.${g}`, g + ' par bloc')).join('')}</div>`).join('')}
    ${fText(c, 'rand.seed', 'Graine du tirage')}
    <p class="hint">Changer la composition ou la graine modifie la séquence des jours non encore commencés. Évitez de le faire en cours de journée.</p>
  </details>
  <details data-k="d8" class="panel"><summary>Calcul d’effectif</summary>
    <div class="grid2">${cNum('puissance.delta', 'Différence visée', '%')}${cNum('puissance.sd', 'Écart-type supposé', '%')}</div>
    <div class="grid2">${cNum('puissance.alpha', 'Risque α')}${cNum('puissance.power', 'Puissance')}</div>
  </details>

  <h3>Cet appareil</h3>
  <div class="panel">
    <p class="hint">Version ${APP_VERSION}. ${St.dbOk ? 'Stockage local actif.' : 'Stockage local indisponible : utilisez la synchronisation et exportez régulièrement.'}</p>
    ${UI.confirmDel === 'ALL'
      ? `<p>Toutes les données de ce téléphone seront effacées. Celles déjà synchronisées restent dans Google Sheets.</p><div class="btn-row"><button class="btn danger" data-act="wipe">Effacer ce téléphone</button><button class="btn" data-act="edelno">Annuler</button></div>`
      : `<button class="btn small danger" data-act="wipeask">Effacer les données de ce téléphone</button>`}
  </div>`;
}

function hKey(s) { return String(s).replace(/\./g, '·'); }
