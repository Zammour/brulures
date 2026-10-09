/* Noyau : configuration, stockage local, enregistrement, fusion, calculs, randomisation, synchronisation. */
'use strict';
const APP_VERSION = '1.0.2';

const GROUPS = ['G1', 'G2', 'G3', 'G4'];
const TPS = [['base', 'Baseline'], ['t5', 'Post 5 min'], ['t30', 'Post 30 min']];

function defaultConfig() {
  return {
    id: 'config', type: 'config', updatedAt: 0, _ft: {}, history: [],
    groupes: {
      G1: { nom: 'Aqueux', desc: 'NaCl 0,9 %', cible: 30, phases: [{ solution: 'NaCl 0,9 %', volume: 500, duree: 15 }] },
      G2: { nom: 'Lipophile', desc: 'Intralipid 30 %', cible: 30, phases: [{ solution: 'Intralipid 30 %', volume: 500, duree: 15 }] },
      G3: { nom: 'Séquentiel', desc: 'Intralipid 30 % puis NaCl 0,9 %', cible: 30, phases: [{ solution: 'Intralipid 30 %', volume: 250, duree: 7.5 }, { solution: 'NaCl 0,9 %', volume: 250, duree: 7.5 }] },
      G4: { nom: 'Sans rinçage', desc: 'Témoin négatif', cible: 10, phases: [] }
    },
    expositionSec: 60,
    tempsPost: [5, 30],
    nPachy: 5,
    fluo: {
      mode: 'lecture', unite: 'RFU', uniteConc: 'µg/mL', ecouvillon: 'exclu', volTissu: 2, volEcouvillon: 2,
      calib: { aqueux: { pente: null, ordonnee: null, blanc: null }, lipidique: { pente: null, ordonnee: null, blanc: null }, ethanol: { pente: null, ordonnee: null, blanc: null } }
    },
    histoEtapes: ['Coupe', 'Fixation au froid', 'Inclusion', 'Coloration', 'Lecture'],
    histoMesures: ['Fluorescence', 'Épaisseur épithéliale (µm)', 'Épaisseur stromale (µm)'],
    franz: { temps: [0, 15, 30, 60, 120], milieu: 'BSS', volRecepteur: 5, temperature: 32 },
    rand: { seed: 'BRULURES-2026', blocs: { principale: { G1: 3, G2: 3, G3: 3, G4: 1 }, pilote: { G1: 1, G2: 0, G3: 1, G4: 0 } } },
    puissance: { delta: 20, sd: 15, alpha: 0.05, power: 0.8 }
  };
}

/* ---------- Utilitaires ---------- */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const clone = o => JSON.parse(JSON.stringify(o));
const isNum = v => typeof v === 'number' && isFinite(v);
function parseNum(s) {
  if (s === null || s === undefined) return null;
  const t = String(s).trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null; const v = Number(t); return isFinite(v) ? v : null;
}
function fmt(v, dec = 1) {
  if (!isNum(v)) return '–';
  return v.toLocaleString('fr-FR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function fmtP(p) {
  if (!isNum(p)) return '–';
  if (p < 0.001) return '< 0,001';
  return p.toLocaleString('fr-FR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
const pTxt = p => (isNum(p) && p < 0.001 ? 'p < 0,001' : 'p = ' + fmtP(p));
function fmtQ(v) { if (!isNum(v)) return '–'; const a = Math.abs(v); return fmt(v, a >= 100 ? 0 : a >= 1 ? 2 : 4); }
const todayISO = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const fmtDate = iso => iso ? new Date(iso + (iso.length === 10 ? 'T12:00' : '')).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';
const fmtTime = t => t ? new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '–';
const fmtDateTime = t => t ? new Date(t).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–';
function mmss(sec) {
  const s = Math.abs(Math.round(sec)); const m = Math.floor(s / 60), r = s % 60;
  return (sec < 0 ? '+' : '') + String(m).padStart(2, '0') + ':' + String(r).padStart(2, '0');
}
function getPath(o, p) { return p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); }
function setPath(o, p, v) {
  const ks = p.split('.'); let cur = o;
  ks.slice(0, -1).forEach((k, i) => {
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  });
  cur[ks[ks.length - 1]] = v;
}
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
/* Les tableaux de la config (phases, temps) peuvent avoir été transformés en objets par setPath : on normalise. */
const arr = v => Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);

/* ---------- Stockage local (IndexedDB) ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('brulures', 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore('records', { keyPath: 'id' });
        d.createObjectStore('photos'); d.createObjectStore('meta');
      };
      r.onsuccess = () => { DB.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = DB.db.transaction(store, mode); const q = fn(t.objectStore(store));
      t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  },
  all: s => DB.req(s, 'readonly', st => st.getAll()),
  get: (s, k) => DB.req(s, 'readonly', st => st.get(k)),
  put: (s, v, k) => DB.req(s, 'readwrite', st => (k === undefined ? st.put(v) : st.put(v, k))),
  del: (s, k) => DB.req(s, 'readwrite', st => st.delete(k)),
  clear: s => DB.req(s, 'readwrite', st => st.clear())
};

/* ---------- État ---------- */
const St = {
  records: new Map(), dirty: new Set(), photoQueue: [],
  prefs: { nom: '', initiales: '', syncUrl: '', token: '', theme: '' },
  sinceServer: 0, lastSync: 0, syncing: false, syncError: null, dbOk: true
};
const cfg = () => St.records.get('config') || defaultConfig();
const eyes = () => [...St.records.values()].filter(r => r.type === 'eye' && !r.deleted);
const franzs = () => [...St.records.values()].filter(r => r.type === 'franz' && !r.deleted);
const me = () => St.prefs.initiales || 'anon';

async function loadAll() {
  try {
    await DB.open();
    (await DB.all('records')).forEach(r => St.records.set(r.id, r));
    St.dirty = new Set((await DB.get('meta', 'dirty')) || []);
    St.photoQueue = (await DB.get('meta', 'photoQueue')) || [];
    St.prefs = Object.assign(St.prefs, (await DB.get('meta', 'prefs')) || {});
    St.sinceServer = (await DB.get('meta', 'sinceServer')) || 0;
    St.lastSync = (await DB.get('meta', 'lastSync')) || 0;
  } catch (e) {
    St.dbOk = false; console.error(e);
  }
  if (!St.records.has('config')) {
    const c = defaultConfig(); St.records.set('config', c);
    // la config par défaut n'est pas marquée « modifiée » : elle ne remplace pas celle du serveur
    persistRecord(c);
  }
}
async function persistRecord(r) { if (!St.dbOk) return; try { await DB.put('records', r); } catch (e) { console.error(e); } }
async function persistMeta() {
  if (!St.dbOk) return;
  try {
    await DB.put('meta', [...St.dirty], 'dirty'); await DB.put('meta', St.photoQueue, 'photoQueue');
    await DB.put('meta', St.prefs, 'prefs'); await DB.put('meta', St.sinceServer, 'sinceServer'); await DB.put('meta', St.lastSync, 'lastSync');
  } catch (e) { console.error(e); }
}

/* ---------- Modifications tracées ---------- */
function setField(rec, path, value, opts = {}) {
  const old = getPath(rec, path);
  if (same(old, value)) return false;
  setPath(rec, path, value);
  const t = Date.now();
  rec._ft = rec._ft || {}; rec._ft[path] = t;
  if (!opts.silent) { rec.history = rec.history || []; rec.history.push({ t, u: me(), p: path, o: old ?? null, n: value ?? null }); }
  rec.updatedAt = t; rec.updatedBy = me();
  commit(rec);
  return true;
}
function commit(rec) {
  St.records.set(rec.id, rec); St.dirty.add(rec.id);
  persistRecord(rec); persistMeta(); scheduleSync();
}

/* Fusion champ par champ (dernier écrit gagne pour chaque champ), historique réuni. */
function mergeRec(a, b) {
  if (!a) return b; if (!b) return a;
  const [n, o] = (a.updatedAt || 0) >= (b.updatedAt || 0) ? [a, b] : [b, a];
  const out = clone(n); out._ft = Object.assign({}, n._ft || {});
  const oft = o._ft || {};
  for (const p in oft) if ((oft[p] || 0) > (out._ft[p] || 0)) { setPath(out, p, clone(getPath(o, p) ?? null)); out._ft[p] = oft[p]; }
  const seen = new Set();
  out.history = [...(n.history || []), ...(o.history || [])].filter(h => {
    const k = h.t + '|' + h.u + '|' + h.p; if (seen.has(k)) return false; seen.add(k); return true;
  }).sort((x, y) => x.t - y.t);
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  return out;
}

/* ---------- Création ---------- */
function yymmdd(iso) { return (iso || todayISO()).slice(2).replace(/-/g, ''); }
function newEye({ phase, dateExp, groupe, rand }) {
  const c = cfg();
  const sameDay = eyes().filter(e => e.info?.dateExp === dateExp && e.createdBy === me()).length;
  const code = `${yymmdd(dateExp)}-${me().toUpperCase()}-${String(sameDay + 1).padStart(2, '0')}`;
  const last = eyes().filter(e => e.info?.dateExp === dateExp).sort((a, b) => b.createdAt - a.createdAt)[0];
  const gc = c.groupes[groupe];
  const phases = arr(gc.phases);
  const t = Date.now();
  const e = {
    id: uid(), type: 'eye', code, createdAt: t, createdBy: me(), updatedAt: t, updatedBy: me(), _ft: {}, history: [],
    phase, groupe, rand,
    info: {
      dateExp, dateAbattage: last?.info?.dateAbattage || '', conservH: last?.info?.conservH ?? null, conservTemp: last?.info?.conservTemp ?? null,
      tempAmb: last?.info?.tempAmb ?? null, oeil: '', volAgent: last?.info?.volAgent ?? null, concTraceur: last?.info?.concTraceur ?? null, operateur: St.prefs.nom || me()
    },
    rincage: { phases: phases.map(p => ({ solution: p.solution, volume: p.volume, duree: p.duree })) },
    timeline: {}, mesures: { base: {}, t5: {}, t30: {} },
    cinetique: { temps: (typeof kinConf === 'function' ? kinConf().temps.slice() : []), points: {} },
    fluo: { samples: {} }, histo: { prevu: false, etapes: {}, mesures: {} }, statut: { exclu: false }
  };
  // échantillons de fluorescence par défaut selon le groupe
  let order = 0; const add = (kind, volume) => { const id = uid().slice(0, 8); e.fluo.samples[id] = { kind, volume, dilution: 1, valeur: null, ordre: order++ }; };
  phases.forEach(p => add(/intralipid|lipo|huile/i.test(p.solution) ? 'eff_lipo' : 'eff_aq', p.volume));
  add('ecouvillon', c.fluo.volEcouvillon); add('tissu', c.fluo.volTissu);
  e.history.push({ t, u: me(), p: 'création', o: null, n: `${code} – ${groupe} (${rand?.mode === 'auto' ? 'randomisé' : 'attribution manuelle'})` });
  commit(e);
  return e;
}
function newFranz(dateExp) {
  const c = cfg(); const t = Date.now();
  const n = franzs().filter(f => f.createdBy === me()).length + 1;
  const f = {
    id: uid(), type: 'franz', code: `FZ-${me().toUpperCase()}-${String(n).padStart(2, '0')}`, createdAt: t, createdBy: me(), updatedAt: t, updatedBy: me(), _ft: {}, history: [],
    info: { dateExp: dateExp || todayISO(), dateAbattage: '', conservH: null, conservTemp: null, milieu: c.franz.milieu, volRecepteur: c.franz.volRecepteur, temperature: c.franz.temperature, volAgent: null, pachy: null },
    temps: arr(c.franz.temps).slice(), t0: null, points: {}, statut: { exclu: false }
  };
  f.history.push({ t, u: me(), p: 'création', o: null, n: f.code });
  commit(f); return f;
}

/* ---------- Randomisation par blocs stratifiée sur le jour ---------- */
function hashSeed(s) { let h = 1779033703 ^ s.length; for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; }
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function randBlock(phase) { const comp = cfg().rand.blocs[phase] || {}; const b = []; GROUPS.forEach(g => { for (let i = 0; i < (comp[g] || 0); i++) b.push(g); }); return b; }
function randSequence(day, phase, len) {
  const block = randBlock(phase); if (!block.length) return [];
  const rng = mulberry32(hashSeed(cfg().rand.seed + '|' + day + '|' + phase));
  const seq = [];
  while (seq.length < len) {
    const b = block.slice();
    for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
    seq.push(...b);
  }
  return seq;
}
function nextRand(day, phase) {
  const used = eyes().filter(e => e.rand?.mode === 'auto' && e.rand.day === day && e.rand.phase === phase).map(e => e.rand.index);
  const index = used.length ? Math.max(...used) + 1 : 0;
  const seq = randSequence(day, phase, index + 1);
  return { day, phase, index, groupe: seq[index], mode: 'auto', blockSize: randBlock(phase).length };
}
function randDuplicates() {
  const m = new Map(); eyes().filter(e => e.rand?.mode === 'auto').forEach(e => { const k = e.rand.day + '|' + e.rand.phase + '|' + e.rand.index; m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}

/* ---------- Calculs dérivés ---------- */
const SAMPLE_KINDS = {
  eff_lipo: { label: 'Effluent – phase lipophile', matrice: 'lipidique', role: 'elim' },
  eff_aq: { label: 'Effluent – phase aqueuse', matrice: 'aqueux', role: 'elim' },
  eff_pool: { label: 'Effluent (mélange)', matrice: 'lipidique', role: 'elim' },
  ecouvillon: { label: 'Écouvillon (excès retiré)', matrice: 'ethanol', role: 'swab' },
  tissu: { label: 'Tissu – punch (extrait)', matrice: 'ethanol', role: 'resid' },
  autre: { label: 'Autre', matrice: 'aqueux', role: 'autre' }
};
const MATRICES = { aqueux: 'Aqueux (NaCl)', lipidique: 'Lipidique (Intralipid)', ethanol: 'Éthanol (extraction)' };
function sampleList(e) { return Object.entries(e.fluo?.samples || {}).filter(([, s]) => s && !s.deleted).map(([id, s]) => ({ id, ...s })).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)); }
function sampleQty(s) {
  const c = cfg().fluo; const v = isNum(s.valeur) ? s.valeur : null; const vol = isNum(s.volume) ? s.volume : null;
  if (v === null || vol === null) return { q: null };
  const mat = s.matrice || SAMPLE_KINDS[s.kind]?.matrice || 'aqueux';
  let conc, calibrated = c.mode === 'concentration';
  if (c.mode === 'concentration') conc = v;
  else {
    const cal = c.calib?.[mat] || {}; const base = v - (isNum(cal.blanc) ? cal.blanc : 0);
    if (isNum(cal.pente) && cal.pente !== 0) { conc = (base - (isNum(cal.ordonnee) ? cal.ordonnee : 0)) / cal.pente; calibrated = true; }
    else conc = base;
  }
  return { q: conc * (isNum(s.dilution) && s.dilution > 0 ? s.dilution : 1) * vol, conc, mat, calibrated };
}
function derive(e) {
  const c = cfg(); const d = {};
  TPS.forEach(([tp]) => {
    const m = e.mesures?.[tp] || {};
    const pv = Object.values(m.pachy || {}).filter(isNum);
    d[tp + '_pachy'] = pv.length ? Stats.mean(pv) : null; d[tp + '_pachyN'] = pv.length;
    d[tp + '_gris'] = isNum(m.gris) ? m.gris : null;
    d[tp + '_grisNorm'] = isNum(m.gris) ? (isNum(m.grisRef) && m.grisRef !== 0 ? m.gris / m.grisRef : m.gris) : null;
  });
  const dif = (a, b) => (isNum(a) && isNum(b) ? a - b : null);
  d.dPachy5 = dif(d.t5_pachy, d.base_pachy); d.dPachy30 = dif(d.t30_pachy, d.base_pachy);
  d.dGris5 = dif(d.t5_grisNorm, d.base_grisNorm); d.dGris30 = dif(d.t30_grisNorm, d.base_grisNorm);
  let elim = 0, resid = null, swab = null, nElim = 0, anyUncal = false; const mats = new Set();
  sampleList(e).forEach(s => {
    const r = sampleQty(s); const role = SAMPLE_KINDS[s.kind]?.role;
    if (r.q === null) return;
    if (!r.calibrated) anyUncal = true; mats.add(r.mat);
    if (role === 'elim') { elim += r.q; nElim++; }
    else if (role === 'resid') resid = (resid || 0) + r.q;
    else if (role === 'swab') swab = (swab || 0) + r.q;
  });
  const swabElim = c.fluo.ecouvillon === 'elimine' && isNum(swab);
  const elimTot = elim + (swabElim ? swab : 0);
  const rinced = arr(e.rincage?.phases).length > 0;
  d.qElim = nElim || swabElim || !rinced ? elimTot : null; d.qResid = resid; d.qSwab = swab;
  d.CEP = (isNum(d.qElim) && isNum(resid) && d.qElim + resid > 0) ? 100 * d.qElim / (d.qElim + resid) : null;
  d.fluoWarn = anyUncal && mats.size > 1 ? 'Milieux différents sans gamme d’étalonnage : le pourcentage n’est pas interprétable.' : '';
  // durées réelles de rinçage
  const tl = e.timeline || {};
  arr(e.rincage?.phases).forEach((p, i) => { const s = tl['r' + i + 's'], f = tl['r' + i + 'e']; d['rDur' + i] = s && f ? (f - s) / 60000 : null; });
  d.expoDur = tl.exposStart && tl.exposEnd ? (tl.exposEnd - tl.exposStart) / 1000 : null;
  d.t0post = postRef(e);
  return d;
}
function postRef(e) { // instant de référence des mesures post-rinçage
  const tl = e.timeline || {}; const n = arr(e.rincage?.phases).length;
  if (n === 0) return tl.swab || tl.exposEnd || null;
  return tl['r' + (n - 1) + 'e'] || null;
}

/* ---------- Avancement par étape ---------- */
const STEPS = [
  ['prep', 'Préparation'], ['base', 'Baseline'], ['brulure', 'Brûlure'], ['rincage', 'Rinçage'],
  ['t5', 'Post 5 min'], ['t30', 'Post 30 min'], ['fluo', 'Fluorescence'], ['histo', 'Histologie'], ['statut', 'Statut']
];
function stepDone(e, k, d = derive(e)) {
  const m = tp => (isNum(e.mesures?.[tp]?.gris) || e.mesures?.[tp]?.photo) && d[tp + '_pachyN'] > 0;
  switch (k) {
    case 'prep': return !!(e.info?.dateExp && e.info?.dateAbattage);
    case 'base': return !!m('base');
    case 'brulure': return !!e.timeline?.exposEnd;
    case 'rincage': return arr(e.rincage?.phases).length === 0 ? (e.timeline?.exposEnd ? true : false) : !!postRef(e);
    case 't5': return !!m('t5'); case 't30': return !!m('t30');
    case 'fluo': return isNum(d.CEP);
    case 'histo': return !e.histo?.prevu || cfg().histoEtapes.every(s => e.histo?.etapes?.[s]);
    case 'statut': return true;
  }
}

/* ---------- Ligne « à plat » (export et feuille Google) ---------- */
function flatEye(e) {
  const c = cfg(); const d = derive(e); const g = c.groupes[e.groupe] || {}; const rows = [];
  const P = (k, v) => rows.push([k, v ?? '']);
  P('code', e.code); P('phase', e.phase); P('groupe', e.groupe); P('groupe_nom', g.nom);
  P('rando_jour', e.rand?.day); P('rando_rang', isNum(e.rand?.index) ? e.rand.index + 1 : ''); P('rando_mode', e.rand?.mode); P('rando_motif', e.rand?.motif);
  P('date_experience', e.info?.dateExp); P('date_abattage', e.info?.dateAbattage); P('conservation_h', e.info?.conservH); P('conservation_temp_C', e.info?.conservTemp);
  P('temp_ambiante_C', e.info?.tempAmb); P('oeil', e.info?.oeil); P('volume_agent_uL', e.info?.volAgent); P('conc_traceur', e.info?.concTraceur); P('operateur', e.info?.operateur);
  P('exposition_s', d.expoDur !== null ? Math.round(d.expoDur) : '');
  arr(e.rincage?.phases).forEach((p, i) => { P(`rincage${i + 1}_solution`, p.solution); P(`rincage${i + 1}_volume_mL`, p.volume); P(`rincage${i + 1}_duree_prevue_min`, p.duree); P(`rincage${i + 1}_duree_reelle_min`, d['rDur' + i] !== null ? +d['rDur' + i].toFixed(2) : ''); });
  TPS.forEach(([tp]) => {
    const m = e.mesures?.[tp] || {};
    for (let i = 0; i < c.nPachy; i++) P(`${tp}_pachy${i + 1}_um`, m.pachy?.[i]);
    P(`${tp}_pachy_moy_um`, d[tp + '_pachy'] !== null ? +d[tp + '_pachy'].toFixed(1) : '');
    P(`${tp}_gris`, m.gris); P(`${tp}_gris_ref`, m.grisRef); P(`${tp}_gris_norm`, d[tp + '_grisNorm']); P(`${tp}_heure`, m.heure ? new Date(m.heure).toISOString() : '');
    P(`${tp}_photo`, m.photo?.url || (m.photo ? 'sur l’appareil' : ''));
  });
  if (typeof kineticFlat === 'function') kineticFlat(e, P);
  P('delta_pachy_5_um', d.dPachy5); P('delta_pachy_30_um', d.dPachy30); P('delta_gris_5', d.dGris5); P('delta_gris_30', d.dGris30);
  Object.keys(SAMPLE_KINDS).forEach(kind => {
    const ss = sampleList(e).filter(s => s.kind === kind); const pre = 'fluo_' + kind;
    const j = k => ss.length === 1 ? ss[0][k] : ss.map(s => s[k] ?? '').join(' / ');
    const qs = ss.map(s => sampleQty(s).q).filter(isNum);
    P(pre + '_valeur', ss.length ? j('valeur') : ''); P(pre + '_dilution', ss.length ? j('dilution') : ''); P(pre + '_volume_mL', ss.length ? j('volume') : '');
    P(pre + '_quantite', qs.length ? qs.reduce((a, b) => a + b, 0) : '');
  });
  P('quantite_eliminee', d.qElim); P('quantite_residuelle_tissu', d.qResid); P('quantite_ecouvillon', d.qSwab);
  P('CEP_pourcentage_elimination', d.CEP !== null ? +d.CEP.toFixed(2) : '');
  P('histo_prevue', e.histo?.prevu ? 'oui' : 'non');
  c.histoEtapes.forEach(s => { const t = e.histo?.etapes?.[s]; P('histo_' + s, t ? new Date(t).toISOString() : ''); });
  c.histoMesures.forEach(s => P('histo_mesure_' + s, e.histo?.mesures?.[String(s).replace(/\./g, '·')]));
  P('exclu', e.statut?.exclu ? 'oui' : 'non'); P('motif_exclusion', e.statut?.motif); P('deviation', e.statut?.deviation); P('commentaire', e.statut?.commentaire);
  P('cree_par', e.createdBy); P('modifie_par', e.updatedBy); P('modifie_le', e.updatedAt ? new Date(e.updatedAt).toISOString() : ''); P('id', e.id);
  return rows;
}
function flatFranzRows(f) {
  return arr(f.temps).map(t => {
    const p = f.points?.[t] || {};
    return [['code', f.code], ['date_experience', f.info?.dateExp], ['date_abattage', f.info?.dateAbattage], ['conservation_h', f.info?.conservH], ['conservation_temp_C', f.info?.conservTemp],
      ['milieu_recepteur', f.info?.milieu], ['volume_recepteur_mL', f.info?.volRecepteur], ['temperature_C', f.info?.temperature], ['volume_agent_uL', f.info?.volAgent], ['pachymetrie_um', f.info?.pachy],
      ['temps_min', t], ['pH_recepteur', p.phR], ['pH_donneur', p.phD], ['fluo_recepteur', p.fluo], ['volume_preleve_mL', p.vol], ['heure_prelevement', p.heure ? new Date(p.heure).toISOString() : ''],
      ['exclu', f.statut?.exclu ? 'oui' : 'non'], ['commentaire', f.statut?.commentaire], ['id', f.id]].map(([k, v]) => [k, v ?? '']);
  });
}

/* ---------- CSV (Excel français : « ; » et virgule décimale) ---------- */
function csvCell(v) {
  if (typeof v === 'number') return isFinite(v) ? String(+v.toPrecision(10)).replace('.', ',') : '';
  const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function toCSV(rowsOfPairs) {
  const headers = []; rowsOfPairs.forEach(r => r.forEach(([k]) => { if (!headers.includes(k)) headers.push(k); }));
  const lines = [headers.map(csvCell).join(';')];
  rowsOfPairs.forEach(r => { const m = new Map(r); lines.push(headers.map(h => csvCell(m.has(h) ? m.get(h) : '')).join(';')); });
  return '﻿' + lines.join('\r\n');
}
function download(name, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type }); const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

/* ---------- Synchronisation (Google Sheets via Apps Script) ---------- */
let syncTimer = null;
function scheduleSync(delay = 2500) { clearTimeout(syncTimer); syncTimer = setTimeout(() => syncNow(), delay); updateSyncUI(); }
async function post(body) {
  const res = await fetch(St.prefs.syncUrl, { method: 'POST', body: JSON.stringify(Object.assign({ token: St.prefs.token, client: me(), version: APP_VERSION }, body)), headers: { 'Content-Type': 'text/plain;charset=utf-8' }, redirect: 'follow' });
  if (!res.ok) throw new Error('Le serveur a répondu ' + res.status);
  const j = await res.json(); if (!j.ok) throw new Error(j.error || 'Erreur du serveur'); return j;
}
async function syncNow(manual) {
  if (!St.prefs.syncUrl) { updateSyncUI(); return; }
  if (St.syncing) return;
  if (!navigator.onLine) { St.syncError = null; updateSyncUI(); return; }
  St.syncing = true; updateSyncUI();
  try {
    const sent = [...St.dirty].map(id => St.records.get(id)).filter(Boolean).map(r => {
      const o = clone(r);
      if (r.type === 'eye') o._flat = flatEye(r);
      if (r.type === 'franz') o._flatRows = flatFranzRows(r);
      return o;
    });
    const j = await post({ action: 'sync', since: St.sinceServer, records: sent });
    sent.forEach(s => { const cur = St.records.get(s.id); if (cur && cur.updatedAt === s.updatedAt) St.dirty.delete(s.id); });
    let changed = false;
    for (const inc of j.records || []) {
      const loc = St.records.get(inc.id);
      const merged = loc ? mergeRec(loc, inc) : inc;
      if (!loc || !same(merged, loc)) { St.records.set(merged.id, merged); persistRecord(merged); changed = true; }
      if (loc && !same(merged, inc) && !St.dirty.has(merged.id)) St.dirty.add(merged.id);
    }
    St.sinceServer = j.serverTime || St.sinceServer; St.lastSync = Date.now(); St.syncError = null;
    await persistMeta();
    if (changed) onRemoteChange();
    await uploadPhotos();
    if (St.dirty.size) scheduleSync(4000);
    if (manual) toast('Synchronisation terminée');
  } catch (e) {
    St.syncError = e.message || String(e); console.warn(e);
    if (manual) toast('Synchronisation impossible : ' + St.syncError);
  } finally { St.syncing = false; updateSyncUI(); }
}
async function uploadPhotos() {
  if (!St.photoQueue.length || !St.prefs.syncUrl) return;
  const queue = St.photoQueue.slice();
  for (const key of queue) {
    try {
      const data = await DB.get('photos', key); const [id, tp] = key.split('|'); const rec = St.records.get(id);
      if (!data || !rec) { St.photoQueue = St.photoQueue.filter(k => k !== key); continue; }
      const j = await post({ action: 'photo', name: `${rec.code}_${tp}.jpg`, dataUrl: data });
      setField(rec, `mesures.${tp}.photo.url`, j.url, { silent: true });
      St.photoQueue = St.photoQueue.filter(k => k !== key); await persistMeta();
    } catch (e) { console.warn('photo', e); break; }
  }
}
