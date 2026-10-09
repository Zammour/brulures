/* Routage, événements, minuteurs, alarmes, photos, export. */
'use strict';

/* ---------- Rendu ---------- */
/* Lien d'installation : #/connexion?u=<adresse du script>&c=<code d'accès> */
function handleSetupLink() {
  const h = location.hash || '';
  if (!h.startsWith('#/connexion')) return false;
  const q = new URLSearchParams(h.split('?')[1] || '');
  const u = q.get('u'), c = q.get('c');
  if (u && c) {
    St.prefs.syncUrl = u; St.prefs.token = c; St.sinceServer = 0; persistMeta();
    toast('Téléphone relié à la base de l’étude');
    setTimeout(() => syncNow(true), 300);
  }
  history.replaceState(null, '', location.pathname + '#/yeux');
  return true;
}
function route() {
  const h = (location.hash || '#/yeux').slice(2).split('/');
  return { page: h[0] || 'yeux', id: h[1], step: h[2] };
}
let pendingRender = false;
function render(force) {
  const a = document.activeElement;
  if (!force && a && a.matches && a.matches('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), textarea, select') && $('#main').contains(a)) {
    pendingRender = true; return; // ne pas interrompre une saisie
  }
  pendingRender = false;
  const r = route(); const main = $('#main'); const y = window.scrollY;
  const openD = render.lastHash === location.hash ? new Set($$('details[data-k]', main).filter(d => d.open).map(d => d.dataset.k)) : new Set();
  const closedD = render.lastHash === location.hash ? new Set($$('details[data-k]', main).filter(d => !d.open).map(d => d.dataset.k)) : new Set();
  const views = { yeux: renderYeux, nouveau: renderNouveau, oeil: () => renderEye(r.id, r.step), franz: () => (r.id ? renderFranz(r.id) : renderFranzList()), analyses: renderAnalyses, reglages: renderReglages };
  main.innerHTML = (views[r.page] || renderYeux)();
  $$('details[data-k]', main).forEach(d => { if (openD.has(d.dataset.k)) d.open = true; if (closedD.has(d.dataset.k)) d.open = false; });
  $$('.nav a').forEach(n => n.setAttribute('aria-current', n.dataset.tab === (r.page === 'oeil' || r.page === 'nouveau' ? 'yeux' : r.page) ? 'page' : 'false'));
  if (render.lastHash === location.hash) window.scrollTo(0, y); else window.scrollTo(0, 0);
  render.lastHash = location.hash;
  hydratePhotos(); if (UI.analyzer) setupAnalyzer();
  tick(true);
}
function onRemoteChange() { render(); }
window.addEventListener('hashchange', () => { handleSetupLink(); UI.confirmDel = null; UI.analyzer = null; render(true); });
document.addEventListener('focusout', () => setTimeout(() => { if (pendingRender) render(); }, 50));

/* ---------- Saisie ---------- */
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.pref !== undefined) return savePref(el);
  if (el.dataset.nv) { UI.nouveau[el.dataset.nv] = el.value; UI.nouveau.rand = null; return render(true); }
  if (el.matches('[data-photo-input]')) return onPhoto(el);
  if (el.matches('[data-import]')) return onImport(el);
  if (el.dataset.actChange) return onActChange(el);
  if (el.dataset.act === 'nphase') { UI.nouveau.phase = el.value; UI.nouveau.rand = null; return render(true); }
  if (el.dataset.act === 'swab') { const r = St.records.get(el.dataset.rec); setField(r, 'timeline.swab', el.checked ? Date.now() : null); return render(true); }
  if (el.dataset.act === 'hstep') { const r = St.records.get(el.dataset.rec); setField(r, `histo.etapes.${el.dataset.step}`, el.checked ? Date.now() : null); return render(true); }
  if (!el.dataset.path || !el.dataset.rec) return;
  const rec = St.records.get(el.dataset.rec); if (!rec) return;
  let v;
  if (el.dataset.kind === 'num') {
    v = parseNum(el.value);
    if (el.value.trim() !== '' && v === null) { toast('Valeur non numérique : « ' + el.value + ' »'); el.value = numVal(getPath(rec, el.dataset.path)); return; }
  } else if (el.dataset.kind === 'bool') v = el.checked;
  else v = el.value;
  const changed = setField(rec, el.dataset.path, v);
  // heure de mesure notée automatiquement à la première saisie d'un temps post
  const m = el.dataset.path.match(/^mesures\.(t5|t30)\./);
  if (changed && m && !rec.mesures?.[m[1]]?.heure && v !== null && v !== '') setField(rec, `mesures.${m[1]}.heure`, Date.now());
  const fp = el.dataset.path.match(/^points\.(\d+)\./);
  if (changed && fp && rec.type === 'franz' && !rec.points?.[fp[1]]?.heure && v !== null) setField(rec, `points.${fp[1]}.heure`, Date.now());
  if (rec.type === 'config' && el.dataset.path.startsWith('rand.')) toast('Randomisation modifiée');
  if (changed) render();
});
document.addEventListener('input', ev => {
  const el = ev.target;
  if (el.dataset.an === 'r' && UI.analyzer) { UI.analyzer.r = +el.value; drawAnalyzer(); }
});
function savePref(el) {
  let v = el.value.trim(); if (el.dataset.pref === 'initiales') v = v.toUpperCase().replace(/[^A-Z0-9]/g, '');
  St.prefs[el.dataset.pref] = v; persistMeta();
  if (el.dataset.pref === 'theme') applyTheme();
  if (el.dataset.pref === 'syncUrl' || el.dataset.pref === 'token') { St.sinceServer = 0; scheduleSync(500); }
  updateSyncUI();
}
function onActChange(el) {
  const act = el.dataset.actChange;
  if (act === 'ftemps') {
    const f = St.records.get(el.dataset.rec);
    const t = el.value.split(/[;, ]+/).map(parseNum).filter(isNum).sort((a, b) => a - b);
    if (t.length) setField(f, 'temps', [...new Set(t)]); render(true);
  }
  if (act === 'clist') { const v = el.value.split('\n').map(s => s.trim()).filter(Boolean); setField(cfg(), el.dataset.path, v); render(true); }
  if (act === 'cnums') { const v = el.value.split(/[;, ]+/).map(parseNum).filter(isNum).sort((a, b) => a - b); if (v.length) setField(cfg(), el.dataset.path, v); render(true); }
}

/* ---------- Actions ---------- */
const ACTIONS = {
  rerender: () => { if (!St.prefs.initiales) return toast('Indiquez vos initiales'); render(true); },
  sync: () => { if (!St.prefs.syncUrl) { location.hash = '#/reglages'; return toast('Renseignez l’adresse du script dans Réglages'); } syncNow(true); },
  fphase: el => { UI.filterPhase = el.dataset.v; render(true); },
  fday: el => { UI.filterDay = el.dataset.v; render(true); },
  aphase: el => { UI.anaPhase = el.dataset.v; render(true); },
  draw: () => { const N = UI.nouveau; N.rand = nextRand(N.date, N.phase); if (!N.rand.groupe) { N.rand = null; return toast('Aucun bloc défini'); } render(true); },
  ncancel: () => { UI.nouveau.rand = null; render(true); },
  nmanual: el => { UI.nouveau.manual = el.dataset.v === '1'; UI.nouveau.rand = null; render(true); },
  create: () => {
    const N = UI.nouveau; let e;
    if (N.rand) {
      const fresh = nextRand(N.date, N.phase); // re-vérifie après une éventuelle synchro
      const rand = fresh.index === N.rand.index ? N.rand : fresh;
      if (rand !== N.rand) toast(`Le rang ${N.rand.index + 1} a été pris entre-temps : nouveau tirage ${rand.groupe}`);
      e = newEye({ phase: N.phase, dateExp: N.date, groupe: rand.groupe, rand });
    } else if (N.manual && N.groupe && N.motif) {
      e = newEye({ phase: N.phase, dateExp: N.date, groupe: N.groupe, rand: { mode: 'manuel', motif: N.motif, day: N.date, phase: N.phase } });
    } else return;
    UI.nouveau = { phase: N.phase, date: N.date, rand: null, manual: false, groupe: '', motif: '' };
    location.hash = `#/oeil/${e.id}/prep`;
  },
  tstart: el => { const r = St.records.get(el.dataset.rec); unlockAudio(); setField(r, el.dataset.path, Date.now()); render(true); },
  tstop: el => { const r = St.records.get(el.dataset.rec); setField(r, el.dataset.path, Date.now()); render(true); },
  treset: el => {
    const r = St.records.get(el.dataset.rec);
    if (UI.confirmDel !== 'T' + el.dataset.s) { UI.confirmDel = 'T' + el.dataset.s; el.textContent = 'Effacer ce chronométrage ?'; return; }
    UI.confirmDel = null; setField(r, el.dataset.s, null); if (el.dataset.e) setField(r, el.dataset.e, null); render(true);
  },
  stamp: el => { const r = St.records.get(el.dataset.rec); setField(r, el.dataset.path, Date.now()); render(true); },
  sadd: el => {
    const r = St.records.get(el.dataset.rec); const id = uid().slice(0, 8);
    const ord = Math.max(-1, ...sampleList(r).map(s => s.ordre ?? 0)) + 1;
    setField(r, `fluo.samples.${id}`, { kind: 'autre', volume: null, dilution: 1, valeur: null, ordre: ord }); render(true);
  },
  sdel: el => {
    const r = St.records.get(el.dataset.rec);
    if (UI.confirmDel !== 'S' + el.dataset.sid) { UI.confirmDel = 'S' + el.dataset.sid; el.textContent = 'Confirmer'; return; }
    UI.confirmDel = null; setField(r, `fluo.samples.${el.dataset.sid}.deleted`, true); render(true);
  },
  edelask: el => { UI.confirmDel = el.dataset.rec; render(true); },
  edelno: () => { UI.confirmDel = null; render(true); },
  edel: el => { const r = St.records.get(el.dataset.rec); setField(r, 'deleted', true); UI.confirmDel = null; location.hash = r.type === 'franz' ? '#/franz' : '#/yeux'; toast('Fiche supprimée'); },
  fnew: () => { const f = newFranz(todayISO()); location.hash = '#/franz/' + f.id; },
  analyze: el => {
    if (UI.analyzer && UI.analyzer.key === el.dataset.key) UI.analyzer = null;
    else UI.analyzer = { key: el.dataset.key, cx: 0.5, cy: 0.5, r: 18 };
    render(true);
  },
  anuse: el => {
    const A = UI.analyzer; if (!A || !isNum(A.value)) return;
    const [id, tp] = A.key.split('|'); const r = St.records.get(id);
    setField(r, `mesures.${tp}.${el.dataset.target}`, +A.value.toFixed(2));
    setField(r, `mesures.${tp}.${el.dataset.target}Zone`, { cx: +A.cx.toFixed(4), cy: +A.cy.toFixed(4), r: A.r }, { silent: true });
    toast(`${el.dataset.target === 'gris' ? 'Gris' : 'Référence'} = ${fmt(A.value, 1)}`); render(true);
  },
  phadd: el => { const c = cfg(); const ph = arr(c.groupes[el.dataset.g].phases); setField(c, `groupes.${el.dataset.g}.phases`, [...ph, { solution: 'NaCl 0,9 %', volume: 250, duree: 7.5 }]); render(true); },
  phdel: el => { const c = cfg(); const ph = arr(c.groupes[el.dataset.g].phases); setField(c, `groupes.${el.dataset.g}.phases`, ph.slice(0, -1)); render(true); },
  exp: el => doExport(el.dataset.v),
  wipeask: () => { UI.confirmDel = 'ALL'; render(true); },
  wipe: async () => { try { await DB.clear('records'); await DB.clear('photos'); await DB.clear('meta'); } catch (e) { } location.reload(); }
};
document.addEventListener('click', ev => {
  unlockAudio();
  const dot = ev.target.closest('circle[data-cap]');
  if (dot) { const cap = $('#cap-' + dot.dataset.chart); if (cap) cap.textContent = dot.dataset.cap; return; }
  const el = ev.target.closest('[data-act]'); if (!el || el.tagName === 'INPUT') return;
  const fn = ACTIONS[el.dataset.act]; if (fn) { ev.preventDefault(); fn(el); }
});

/* ---------- Photos ---------- */
async function onPhoto(el) {
  const file = el.files && el.files[0]; if (!file) return;
  const rec = St.records.get(el.dataset.rec); const tp = el.dataset.tp; const key = rec.id + '|' + tp;
  try {
    const dataUrl = await compressImage(file, 1600, 0.85);
    if (St.dbOk) await DB.put('photos', dataUrl, key);
    setField(rec, `mesures.${tp}.photo`, { t: Date.now(), par: me(), url: null });
    if (!St.photoQueue.includes(key)) St.photoQueue.push(key); persistMeta(); scheduleSync(1000);
    UI.analyzer = { key, cx: 0.5, cy: 0.5, r: 18 };
    render(true);
  } catch (e) { toast('Photo illisible : ' + e.message); }
}
function compressImage(file, max, q) {
  return new Promise((res, rej) => {
    const img = new Image(); const url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const cv = document.createElement('canvas'); cv.width = Math.round(img.width * k); cv.height = Math.round(img.height * k);
      cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url);
      res(cv.toDataURL('image/jpeg', q));
    };
    img.onerror = () => rej(new Error('format non pris en charge')); img.src = url;
  });
}
async function hydratePhotos() {
  for (const img of $$('img[data-photo]')) {
    try { const d = St.dbOk && await DB.get('photos', img.dataset.photo); if (d) img.src = d; else { const rec = St.records.get(img.dataset.photo.split('|')[0]); img.alt = 'Photo prise sur un autre appareil'; img.style.display = 'none'; } } catch (e) { }
  }
}

/* ---------- Analyse de gris ---------- */
let anImg = null, anData = null;
async function setupAnalyzer() {
  const A = UI.analyzer; const cv = $('#an-canvas'); if (!A || !cv) return;
  const src = St.dbOk ? await DB.get('photos', A.key) : null;
  if (!src) { cv.replaceWith(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'La photo n’est pas sur cet appareil.' })); return; }
  anImg = new Image();
  anImg.onload = () => {
    cv.width = anImg.width; cv.height = anImg.height;
    const off = document.createElement('canvas'); off.width = anImg.width; off.height = anImg.height;
    const ctx = off.getContext('2d'); ctx.drawImage(anImg, 0, 0); anData = ctx.getImageData(0, 0, off.width, off.height);
    const z = (() => { const [id, tp] = A.key.split('|'); return St.records.get(id)?.mesures?.[tp]?.grisZone; })();
    if (z && !A.touched) { A.cx = z.cx; A.cy = z.cy; A.r = z.r; const rg = $('[data-an="r"]'); if (rg) rg.value = z.r; }
    drawAnalyzer();
  };
  anImg.src = src;
  cv.onpointerdown = ev => {
    const b = cv.getBoundingClientRect(); A.cx = (ev.clientX - b.left) / b.width; A.cy = (ev.clientY - b.top) / b.height; A.touched = true; drawAnalyzer();
  };
}
function drawAnalyzer() {
  const A = UI.analyzer; const cv = $('#an-canvas'); if (!A || !cv || !anImg || !anData) return;
  const ctx = cv.getContext('2d'); ctx.drawImage(anImg, 0, 0);
  const W = cv.width, H = cv.height, cx = A.cx * W, cy = A.cy * H, r = A.r / 100 * W;
  let sum = 0, n = 0; const d = anData.data;
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r)), y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
    const i = (y * W + x) * 4; sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; n++;
  }
  A.value = n ? sum / n : NaN;
  ctx.lineWidth = Math.max(3, W / 250); ctx.strokeStyle = '#FF2D7A'; ctx.setLineDash([ctx.lineWidth * 3, ctx.lineWidth * 2]);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 10, cy); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx, cy + 10); ctx.stroke();
  const res = $('#an-res'); if (res) res.textContent = fmt(A.value, 1);
}

/* ---------- Minuteurs et alarmes ---------- */
let audioCtx = null;
function unlockAudio() { try { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); if (audioCtx.state === 'suspended') audioCtx.resume(); } catch (e) { } }
function beep(times = 3) {
  try {
    unlockAudio(); if (!audioCtx) return; const t0 = audioCtx.currentTime;
    for (let i = 0; i < times; i++) {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain(); o.type = 'square'; o.frequency.value = 1046;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.35); g.gain.exponentialRampToValueAtTime(0.25, t0 + i * 0.35 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.35 + 0.25);
      o.connect(g).connect(audioCtx.destination); o.start(t0 + i * 0.35); o.stop(t0 + i * 0.35 + 0.27);
    }
  } catch (e) { }
  try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 300]); } catch (e) { }
}
const fired = new Set(JSON.parse(sessionStorageGet('fired') || '[]'));
function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }
function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch (e) { } }

function activeEvents(now = Date.now()) {
  // événements en cours / à venir pour tous les yeux et cellules
  const ev = []; const c = cfg();
  eyes().forEach(e => {
    if (e.statut?.exclu) return; const tl = e.timeline || {};
    if (tl.exposStart && !tl.exposEnd) ev.push({ rec: e, key: e.id + 'expo', label: 'Exposition', end: tl.exposStart + c.expositionSec * 1000, href: `#/oeil/${e.id}/brulure` });
    arr(e.rincage?.phases).forEach((p, i) => { const s = tl['r' + i + 's'], f = tl['r' + i + 'e']; if (s && !f) ev.push({ rec: e, key: e.id + 'r' + i, label: `Rinçage ${p.solution}`, end: s + (p.duree || 0) * 60000, href: `#/oeil/${e.id}/rincage` }); });
    const ref = postRef(e);
    if (ref) [['t5', c.tempsPost[0]], ['t30', c.tempsPost[1]]].forEach(([tp, m]) => {
      if (!e.mesures?.[tp]?.heure && now < ref + (m + 30) * 60000) ev.push({ rec: e, key: e.id + tp, label: `Mesure ${m} min`, end: ref + m * 60000, href: `#/oeil/${e.id}/${tp}` });
    });
  });
  franzs().forEach(f => {
    if (!f.t0 || f.statut?.exclu) return;
    arr(f.temps).forEach(t => { const due = f.t0 + t * 60000; if (!f.points?.[t]?.heure && now < due + 30 * 60000 && t > 0) ev.push({ rec: f, key: f.id + 't' + t, label: `Franz t = ${t} min`, end: due, href: `#/franz/${f.id}` }); });
  });
  return ev.sort((a, b) => a.end - b.end);
}
let lastDock = '';
function tick(force) {
  const now = Date.now();
  // minuteurs affichés
  $$('.timer[data-start]').forEach(t => {
    const start = +t.dataset.start, dur = +t.dataset.dur; const el = (now - start) / 1000;
    const dg = t.querySelector('.digits');
    if (t.dataset.up) { dg.textContent = mmss(el); return; }
    const rem = dur - el; dg.textContent = mmss(rem);
    t.dataset.state = rem <= 0 ? 'over' : 'run';
  });
  $$('[data-due]').forEach(s => { const rem = (+s.dataset.due - now) / 1000; s.textContent = mmss(rem); s.classList.toggle('badge', rem <= 0); s.classList.toggle('warn', rem <= 0); });
  // alarmes et bandeau
  const ev = activeEvents(now);
  ev.forEach(x => {
    if (x.end <= now && !fired.has(x.key)) {
      fired.add(x.key); sessionStorageSet('fired', JSON.stringify([...fired]));
      if (now - x.end < 120000) { beep(); toast(`${x.rec.code} : ${x.label} – c’est l’heure`, true); }
    }
  });
  const dockEv = ev.filter(x => x.end - now < 31 * 60000);
  const html = dockEv.map(x => `<a href="${x.href}" class="${x.end <= now ? 'due' : ''}"><b>${esc(x.rec.code)}</b><span>${esc(x.label)}</span><span class="cd">${mmss((x.end - now) / 1000)}</span></a>`).join('');
  if (force || html !== lastDock) { $('#dock').innerHTML = html; lastDock = html; }
  wakeLock(dockEv.length > 0);
}
setInterval(tick, 500);

let wl = null, wlWanted = false;
async function wakeLock(on) {
  wlWanted = on;
  try {
    if (on && !wl && 'wakeLock' in navigator && document.visibilityState === 'visible') { wl = await navigator.wakeLock.request('screen'); wl.addEventListener('release', () => { wl = null; }); }
    if (!on && wl) { await wl.release(); wl = null; }
  } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { wl = null; wakeLock(wlWanted); tick(true); syncNow(); } });

/* ---------- Toast ---------- */
let toastTimer = null;
function toast(msg, alarm) {
  const root = $('#toast-root'); root.innerHTML = `<div class="toast ${alarm ? 'alarm' : ''}" role="status">${esc(msg)}</div>`;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { root.innerHTML = ''; }, alarm ? 8000 : 3500);
}

/* ---------- État de synchro ---------- */
function updateSyncUI() {
  const b = $('#sync'), t = $('#sync-txt'); if (!b) return;
  let s = 'off', txt = 'Synchro non configurée';
  if (St.prefs.syncUrl) {
    if (St.syncing) { s = 'busy'; txt = 'Synchronisation…'; }
    else if (!navigator.onLine) { s = 'pending'; txt = `Hors ligne${St.dirty.size ? ` – ${St.dirty.size} en attente` : ''}`; }
    else if (St.syncError) { s = 'error'; txt = 'Échec de synchro'; }
    else if (St.dirty.size) { s = 'pending'; txt = `${St.dirty.size} en attente`; }
    else { s = 'ok'; txt = St.lastSync ? 'Synchronisé ' + new Date(St.lastSync).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : 'Prêt'; }
  } else if (St.dirty.size) { txt = 'Données sur ce téléphone'; }
  b.dataset.s = s; t.textContent = txt;
}
window.addEventListener('online', () => { updateSyncUI(); syncNow(); });
window.addEventListener('offline', updateSyncUI);
setInterval(() => syncNow(), 30000);

/* ---------- Export / import ---------- */
function doExport(kind) {
  const d = todayISO();
  if (kind === 'yeux') download(`brulures_yeux_${d}.csv`, toCSV(eyes().sort((a, b) => a.createdAt - b.createdAt).map(flatEye)));
  if (kind === 'prism') {
    const inc = eyes().filter(e => !e.statut?.exclu && e.phase === 'principale');
    const cols = GROUPS.map(g => inc.filter(e => e.groupe === g).map(e => derive(e).CEP).filter(isNum).map(v => +v.toFixed(2)));
    const n = Math.max(0, ...cols.map(c => c.length));
    const rows = []; for (let i = 0; i < n; i++) rows.push(GROUPS.map((g, j) => [`${g} ${cfg().groupes[g].nom}`, cols[j][i] ?? '']));
    if (!rows.length) return toast('Aucun résultat de critère principal dans l’étude principale');
    download(`brulures_CEP_prism_${d}.csv`, toCSV(rows));
  }
  if (kind === 'franz') download(`brulures_franz_${d}.csv`, toCSV(franzs().flatMap(flatFranzRows)));
  if (kind === 'journal') {
    const rows = [...St.records.values()].flatMap(r => (r.history || []).map(h => [['date', new Date(h.t).toISOString()], ['utilisateur', h.u], ['fiche', r.code || r.id], ['type', r.type], ['champ', h.p], ['avant', shortVal(h.o)], ['apres', shortVal(h.n)]])).sort((a, b) => a[0][1] < b[0][1] ? -1 : 1);
    download(`brulures_journal_${d}.csv`, toCSV(rows));
  }
  if (kind === 'json') download(`brulures_sauvegarde_${d}.json`, JSON.stringify({ app: 'brulures', version: APP_VERSION, exportedAt: new Date().toISOString(), records: [...St.records.values()] }, null, 1), 'application/json');
}
async function onImport(el) {
  const f = el.files && el.files[0]; if (!f) return;
  try {
    const j = JSON.parse(await f.text()); if (!Array.isArray(j.records)) throw new Error('fichier non reconnu');
    let n = 0;
    j.records.forEach(r => { const loc = St.records.get(r.id); const m = loc ? mergeRec(loc, r) : r; if (!loc || !same(m, loc)) { St.records.set(m.id, m); St.dirty.add(m.id); persistRecord(m); n++; } });
    await persistMeta(); scheduleSync(500); toast(`${n} fiche(s) restaurée(s) ou mises à jour`); render(true);
  } catch (e) { toast('Import impossible : ' + e.message); }
}

/* ---------- Thème ---------- */
function applyTheme() { const t = St.prefs.theme; if (t) document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme; }

/* ---------- Démarrage ---------- */
(async function start() {
  await loadAll();
  applyTheme();
  if (!St.dbOk) $('#banner').innerHTML = '<div class="banner">Le stockage local est indisponible (navigation privée ?). Les données seront perdues à la fermeture : activez la synchronisation.</div>';
  handleSetupLink();
  if (!location.hash) location.hash = '#/yeux';
  render(true); updateSyncUI(); syncNow();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing; nw && nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) $('#banner').innerHTML = '<div class="banner">Nouvelle version disponible. <a href="#" onclick="location.reload();return false">Recharger</a></div>';
        });
      });
    }).catch(() => { });
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
})();
