'use strict';
/* =====================================================================
   Éditeur : modèle, rendu, interaction, panneaux
   ===================================================================== */
const SNAP = 10, FRAME = { w: 1640, h: 1160 }, DIRS = ['u', 'r', 'd', 'l'];
const NOAUTOTAG = ['k_no', 'k_nc', 'sol', 'node', 'offpage', 'text', 'exhaust', 'tank'];
const App = {
  comps: [], wires: [], sheets: [{ name: 'Folio 1' }], sheet: 0,
  project: { name: 'Nouveau projet', author: '', company: '', rev: 'A', date: new Date().toISOString().slice(0, 10) },
  opts: { frame: true, wireNums: false, xref: true }, hideFaults: false, lib: null,
  sel: new Set(), selWire: null, placing: null, wiring: null, tool: 'sel',
  view: { ox: 40, oy: 40, s: 1 }, hist: [], hi: -1, running: false, speed: 1, nid: 1,
  plot: { ch: [], open: false, t: [] }, found: 0, reports: 0,
  uid() { return 'c' + (this.nid++); },
  sheetComps() { return this.comps.filter(c => (c.sheet || 0) === this.sheet); },
  byId(id) { return this.comps.find(c => c.id === id); },
  changed(commit) { if (commit !== false) this.commit(); Props.render(); },
  serialize() {
    return JSON.stringify({ app: 'Simulix Pro', version: 1, project: this.project, opts: this.opts, sheets: this.sheets, hideFaults: this.hideFaults, lib: this.lib,
      comps: this.comps.map(c => ({ id: c.id, type: c.type, x: c.x, y: c.y, rot: c.rot || 0, sheet: c.sheet || 0, props: c.props, fault: c.fault || null })),
      wires: this.wires.map(w => ({ id: w.id, a: w.a, b: w.b, kind: w.kind, mo: w.mo ?? null, cut: !!w.cut })) });
  },
  load(json, keepHist) {
    const o = typeof json === 'string' ? JSON.parse(json) : json;
    if (!o || !Array.isArray(o.comps)) throw new Error('Fichier de projet invalide');
    if (Sim.S) Ctl.stop();
    this.comps = o.comps.filter(c => DEFS[c.type]).map(c => ({ ...c, props: JSON.parse(JSON.stringify(c.props || {})), state: {} }));
    this.wires = (o.wires || []).map(w => ({ ...w }));
    this.project = Object.assign({ name: 'Projet', author: '', company: '', rev: 'A', date: '' }, o.project || {});
    this.opts = Object.assign({ frame: true, wireNums: false, xref: true }, o.opts || {});
    this.sheets = o.sheets && o.sheets.length ? o.sheets : [{ name: 'Folio 1' }];
    this.hideFaults = !!o.hideFaults; this.lib = o.lib || null; this.sheet = 0;
    let mx = 0; [...this.comps, ...this.wires].forEach(x => { const n = parseInt(String(x.id).slice(1)); if (n > mx) mx = n; }); this.nid = mx + 1;
    this.comps.forEach(c => { if (c.type === 'valve') ['aL', 'aR', 'xL', 'xR'].forEach(k => { if (c.props[k] === 'pilot') c.props[k] = c.props.medium === 'hyd' ? 'pilotH' : 'pilotP'; }); const d = DEFS[c.type]; d.init && d.init(c); });
    this.sel.clear(); this.selWire = null; this.plot.ch = [];
    if (!keepHist) { this.hist = []; this.hi = -1; this.commit(); }
    Ctl.syncUI(); Sheets.render(); Pal.render(); Props.render(); View.fit();
  },
  commit() {
    const s = this.serialize(); if (this.hist[this.hi] === s) return;
    this.hist = this.hist.slice(0, this.hi + 1); this.hist.push(s); if (this.hist.length > 120) this.hist.shift(); this.hi = this.hist.length - 1;
    store('simulix.autosave', s);
  },
  undo() { if (Sim.S) return toast('Arrêtez la simulation pour modifier'); if (this.hi > 0) { this.hi--; this.restore(); } },
  redo() { if (Sim.S) return; if (this.hi < this.hist.length - 1) { this.hi++; this.restore(); } },
  restore() { const sh = this.sheet, v = { ...this.view }; this.load(this.hist[this.hi], true); this.sheet = Math.min(sh, this.sheets.length - 1); this.view = v; Sheets.render(); Props.render(); },
  addComp(entry, x, y) {
    const d = DEFS[entry.type];
    const c = { id: this.uid(), type: entry.type, x: 0, y: 0, rot: 0, sheet: this.sheet, props: JSON.parse(JSON.stringify(Object.assign({}, d.defProps || {}, entry.props || {}))), fault: null, state: {} };
    if (c.type === 'plc') c.props.prog = PLC.newProg();
    if (c.props.tag && !NOAUTOTAG.includes(c.type)) c.props.tag = this.autoTag(c.type, c.props.tag);
    const { w, h } = compSize(c); c.x = snap(x - w / 2); c.y = snap(y - h / 2);
    d.init && d.init(c); this.comps.push(c); return c;
  },
  autoTag(type, tag) {
    const used = new Set(this.comps.filter(c => c.type === type || (DEFS[c.type].isActuator && DEFS[type].isActuator)).map(c => c.props.tag));
    let t = tag, guard = 0;
    while (used.has(t) && guard++ < 200) { const m = /^(.*?)(\d+)$/.exec(t); if (m) t = m[1] + (+m[2] + 1); else if (/^[A-Y]$/.test(t)) t = String.fromCharCode(t.charCodeAt(0) + 1); else t = t + '2'; }
    return t;
  },
  delSel() {
    if (Sim.S) return toast('Arrêtez la simulation pour modifier');
    if (this.selWire) { this.wires = this.wires.filter(w => w.id !== this.selWire); this.selWire = null; }
    if (this.sel.size) { this.comps = this.comps.filter(c => !this.sel.has(c.id)); this.wires = this.wires.filter(w => !this.sel.has(w.a.c) && !this.sel.has(w.b.c)); this.sel.clear(); }
    this.changed();
  },
  rotSel() { if (Sim.S) return; this.sel.forEach(id => { const c = this.byId(id); c.rot = ((c.rot || 0) + 1) % 4; }); if (this.sel.size) this.changed(); },
  copy() { if (!this.sel.size) return; const ids = this.sel; this.clip = { comps: this.comps.filter(c => ids.has(c.id)).map(c => JSON.parse(JSON.stringify({ ...c, state: {} }))), wires: this.wires.filter(w => ids.has(w.a.c) && ids.has(w.b.c)).map(w => ({ ...w })) }; toast(ids.size + ' élément(s) copié(s)'); },
  paste() {
    if (!this.clip || Sim.S) return; const map = {}; this.sel.clear();
    this.clip.comps.forEach(c0 => { const c = JSON.parse(JSON.stringify(c0)); map[c.id] = c.id = this.uid(); c.x += 40; c.y += 40; c.sheet = this.sheet; c.state = {}; if (c.props.tag && !NOAUTOTAG.includes(c.type)) c.props.tag = this.autoTag(c.type, c.props.tag); this.comps.push(c); this.sel.add(c.id); });
    this.clip.wires.forEach(w => this.wires.push({ ...w, id: this.uid(), a: { c: map[w.a.c], p: w.a.p }, b: { c: map[w.b.c], p: w.b.p } }));
    this.clip.comps.forEach(c => { c.x += 40; c.y += 40; }); this.changed();
  },
  dup() { this.copy(); this.paste(); },
  pruneWires() { this.wires = this.wires.filter(w => { const a = this.byId(w.a.c), b = this.byId(w.b.c); return a && b && compPorts(a).some(p => p.id === w.a.p) && compPorts(b).some(p => p.id === w.b.p); }); }
};
const snap = v => Math.round(v / SNAP) * SNAP;
function compSize(c) { const d = DEFS[c.type]; return d.size ? d.size(c) : { w: d.w, h: d.h }; }
function compPorts(c) {
  const d = DEFS[c.type], ps = d.portsFn ? d.portsFn(c) : (d.ports || []); const { w, h } = compSize(c);
  return ps.map(p => p.d ? p : Object.assign({}, p, { d: p.y <= 0 ? 'u' : p.y >= h ? 'd' : p.x <= 0 ? 'l' : p.x >= w ? 'r' : 'd' }));
}
function portWorld(c, p) {
  const { w, h } = compSize(c), cx = c.x + w / 2, cy = c.y + h / 2; let dx = p.x - w / 2, dy = p.y - h / 2;
  for (let i = 0; i < (c.rot || 0); i++) { const t = dx; dx = -dy; dy = t; }
  return { x: cx + dx, y: cy + dy, d: DIRS[(DIRS.indexOf(p.d) + (c.rot || 0)) % 4] };
}
function toLocal(c, x, y) {
  const { w, h } = compSize(c); let dx = x - (c.x + w / 2), dy = y - (c.y + h / 2);
  for (let i = 0; i < (c.rot || 0); i++) { const t = dx; dx = dy; dy = -t; }
  return { x: dx + w / 2, y: dy + h / 2 };
}
function compBBox(c) { const { w, h } = compSize(c), odd = (c.rot || 0) % 2, cx = c.x + w / 2, cy = c.y + h / 2, W = odd ? h : w, H = odd ? w : h; return { x: cx - W / 2, y: cy - H / 2, w: W, h: H }; }
function portRef(r) { const c = App.byId(r.c); if (!c) return null; const p = compPorts(c).find(q => q.id === r.p); return p ? { c, p, ...portWorld(c, p) } : null; }
function kindOk(a, b) { if (a === 'x' || b === 'x' || a === b) return true; const fl = k => k === 'p' || k === 'h' || k === 'f'; return fl(a) && fl(b); }
function wireKind(a, b) { for (const k of [a, b]) if (k !== 'x' && k !== 'f') return k; return a === 'f' || b === 'f' ? 'f' : 'x'; }
function wirePts(w) {
  const A = portRef(w.a), B = portRef(w.b); if (!A || !B) return null;
  const st_ = (P, l) => ({ x: P.x + (P.d === 'r' ? l : P.d === 'l' ? -l : 0), y: P.y + (P.d === 'd' ? l : P.d === 'u' ? -l : 0) });
  const s1 = st_(A, 10), s2 = st_(B, 10), va = A.d === 'u' || A.d === 'd', vb = B.d === 'u' || B.d === 'd';
  let mid;
  if (va && vb) { const my = w.mo ?? (s1.y + s2.y) / 2; mid = [{ x: s1.x, y: my }, { x: s2.x, y: my }]; }
  else if (!va && !vb) { const mx = w.mo ?? (s1.x + s2.x) / 2; mid = [{ x: mx, y: s1.y }, { x: mx, y: s2.y }]; }
  else if (va) mid = [{ x: s1.x, y: s2.y }]; else mid = [{ x: s2.x, y: s1.y }];
  return { pts: [A, s1, ...mid, s2, B], vert: va && vb, horiz: !va && !vb };
}
function distSeg(p, a, b) { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy; let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0; t = clamp(t, 0, 1); return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy); }

/* ===================== RENDU ===================== */
const cv = $('#cv'), ctx = cv.getContext('2d');
let DPR = 1, hoverPort = null, mouseW = { x: 0, y: 0 }, rubber = null;
const View = {
  resize() { const r = cv.getBoundingClientRect(); DPR = window.devicePixelRatio || 1; cv.width = Math.max(1, r.width * DPR); cv.height = Math.max(1, r.height * DPR); },
  toWorld(sx, sy) { const v = App.view; return { x: (sx - v.ox) / v.s, y: (sy - v.oy) / v.s }; },
  zoomAt(sx, sy, f) { const v = App.view, w = this.toWorld(sx, sy); v.s = clamp(v.s * f, 0.15, 4); v.ox = sx - w.x * v.s; v.oy = sy - w.y * v.s; },
  fit() {
    const cs = App.sheetComps(), r = cv.getBoundingClientRect(); if (!r.width) return;
    let b = App.opts.frame ? { x0: 0, y0: 0, x1: FRAME.w, y1: FRAME.h } : null;
    if (cs.length && !App.opts.frame) { b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; cs.forEach(c => { const q = compBBox(c); b.x0 = Math.min(b.x0, q.x); b.y0 = Math.min(b.y0, q.y); b.x1 = Math.max(b.x1, q.x + q.w); b.y1 = Math.max(b.y1, q.y + q.h); }); }
    if (!b) b = { x0: 0, y0: 0, x1: 800, y1: 600 };
    const s = clamp(Math.min((r.width - 40) / (b.x1 - b.x0), (r.height - 40) / (b.y1 - b.y0)), 0.15, 2);
    App.view = { s, ox: (r.width - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy: (r.height - (b.y1 - b.y0) * s) / 2 - b.y0 * s };
  }
};
const WCOL = { e: '#334155', p: '#2563eb', h: '#b91c1c', l: '#15803d', f: '#475569', x: '#334155' };
const PHCOL = { '+': '#dc2626', '0': '#2563eb', L1: '#92400e', L2: '#111827', L3: '#6b7280', N: '#2563eb', PE: '#16a34a', S1: '#ea580c', S2: '#0891b2' };
function wireStyle(w, S) {
  const k = w.kind;
  if (w.cut && !App.hideFaults) return ['#dc2626', 2, [6, 4]];
  if (!S) return [WCOL[k] || '#334155', k === 'h' ? 2.2 : 1.6, k === 'f' ? [] : []];
  const c = App.byId(w.a.c), p = w.a.p, i = S.info(c, p);
  if (k === 'e' || (k === 'x' && (i.pots || S.vp.has(S.root(c, p))))) {
    const r = S.root(c, p); if ((S.shorts || []).includes(r)) return ['#f43f5e', 3.5, [3, 2]];
    const pt = S.pot(c, p); if (!pt) return ['#64748b', 1.6, []];
    const col = PHCOL[pt.ph] || (pt.dc > 0 || Math.hypot(pt.re, pt.im) > 0 ? '#dc2626' : '#2563eb'), direct = S.vd.has(r);
    return [col, direct ? 2.6 : 1.6, direct ? [] : [5, 3]];
  }
  if (k === 'l') return [S.L(c, p) ? '#16a34a' : '#475569', S.L(c, p) ? 2.6 : 1.6, []];
  const med = i.med || (k === 'h' ? 'h' : 'p'), P = S.P(c, p);
  if (med === 'h') return P > 0.5 ? ['#dc2626', 3, []] : i.vent ? ['#2563eb', 2.4, []] : ['#64748b', 2.2, []];
  return P > 0.05 ? ['#1677ff', 3, []] : i.vent ? ['#93c5fd', 2, []] : ['#64748b', 1.8, []];
}
function drawFrame(g) {
  const W = FRAME.w, H = FRAME.h, P = App.project, sh = App.sheets[App.sheet] || {};
  g.save(); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H); g.strokeStyle = '#94a3b8'; g.lineWidth = 1; g.strokeRect(0, 0, W, H); g.lineWidth = 2; g.strokeStyle = '#334155'; g.strokeRect(20, 20, W - 40, H - 40);
  g.lineWidth = 1; g.font = '11px system-ui'; g.fillStyle = '#64748b'; g.textAlign = 'center'; g.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) { const x = 20 + (W - 40) / 8 * (i + .5); g.fillText(String(i + 1), x, 10); g.fillText(String(i + 1), x, H - 10); if (i) { const xx = 20 + (W - 40) / 8 * i; g.beginPath(); g.moveTo(xx, 0); g.lineTo(xx, 20); g.moveTo(xx, H - 20); g.lineTo(xx, H); g.stroke(); } }
  for (let i = 0; i < 6; i++) { const y = 20 + (H - 40) / 6 * (i + .5); g.fillText('ABCDEF'[i], 10, y); g.fillText('ABCDEF'[i], W - 10, y); if (i) { const yy = 20 + (H - 40) / 6 * i; g.beginPath(); g.moveTo(0, yy); g.lineTo(20, yy); g.moveTo(W - 20, yy); g.lineTo(W, yy); g.stroke(); } }
  // cartouche
  const cx = W - 620, cy = H - 130, cw = 600, ch = 110; g.fillStyle = '#fff'; g.fillRect(cx, cy, cw, ch); g.strokeStyle = '#334155'; g.lineWidth = 1.5; g.strokeRect(cx, cy, cw, ch);
  g.beginPath(); g.moveTo(cx, cy + 40); g.lineTo(cx + cw, cy + 40); g.moveTo(cx + 380, cy + 40); g.lineTo(cx + 380, cy + ch); g.moveTo(cx, cy + 75); g.lineTo(cx + 380, cy + 75); g.moveTo(cx + 190, cy + 75); g.lineTo(cx + 190, cy + ch); g.moveTo(cx + 380, cy + 75); g.lineTo(cx + cw, cy + 75); g.stroke();
  g.textAlign = 'left'; g.fillStyle = '#0f172a';
  g.font = '600 18px system-ui'; g.fillText(P.name || '', cx + 10, cy + 20);
  g.font = '600 14px system-ui'; g.fillText(sh.name || '', cx + 10, cy + 57);
  g.font = '11px system-ui'; g.fillStyle = '#475569';
  g.fillText('Auteur : ' + (P.author || ''), cx + 10, cy + 92); g.fillText('Société : ' + (P.company || ''), cx + 200, cy + 92);
  g.fillText('Date : ' + (P.date || ''), cx + 390, cy + 57); g.fillText('Révision : ' + (P.rev || ''), cx + 500, cy + 57);
  g.font = '600 16px system-ui'; g.fillStyle = '#0f172a'; g.fillText('Folio ' + (App.sheet + 1) + ' / ' + App.sheets.length, cx + 390, cy + 92);
  g.font = '600 10px system-ui'; g.fillStyle = '#2563eb'; g.textAlign = 'right'; g.fillText('Simulix Pro', cx + cw - 8, cy + 14);
  g.restore();
}
function zoneOf(c) { const W = FRAME.w - 40, H = FRAME.h - 40, b = compBBox(c); const x = b.x + b.w / 2 - 20, y = b.y + b.h / 2 - 20; return (clamp(Math.floor(x / (W / 8)), 0, 7) + 1) + 'ABCDEF'[clamp(Math.floor(y / (H / 6)), 0, 5)]; }
function xrefs(c) {
  const tag = c.props.tag; if (!tag) return '';
  const fam = { coil: ['k_no', 'k_nc'], coil_t: ['k_no', 'k_nc'], sol: ['valve'], cyl: ['ls_no', 'ls_nc', 'prox', 'valve'] }[c.type]; if (!fam) return '';
  const L = App.comps.filter(o => fam.includes(o.type) && (o.type === 'valve' ? (o.props.tL === tag || o.props.tR === tag || o.props.cylL === tag || o.props.cylR === tag) : (o.type === 'ls_no' || o.type === 'ls_nc' || o.type === 'prox') ? o.props.cyl === tag : o.props.tag === tag));
  return L.map(o => ({ k_no: 'NO', k_nc: 'NF', ls_no: o.props.tag, ls_nc: o.props.tag, prox: o.props.tag, valve: o.props.tag }[o.type] + ' ' + (o.sheet + 1) + '.' + zoneOf(o))).join('  ');
}
function render() {
  const r = cv.getBoundingClientRect(); if (cv.width !== Math.round(r.width * DPR)) View.resize();
  const S = Sim.S, v = App.view, g = ctx;
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#e9edf2'; g.fillRect(0, 0, cv.width, cv.height);
  g.setTransform(DPR * v.s, 0, 0, DPR * v.s, DPR * v.ox, DPR * v.oy);
  drawScene(g, S, true);
  if (rubber) { g.strokeStyle = '#0f62fe'; g.lineWidth = 1 / v.s; g.setLineDash([4 / v.s, 3 / v.s]); g.fillStyle = 'rgba(15,98,254,.06)'; const x = Math.min(rubber.x0, rubber.x1), y = Math.min(rubber.y0, rubber.y1); g.fillRect(x, y, Math.abs(rubber.x1 - rubber.x0), Math.abs(rubber.y1 - rubber.y0)); g.strokeRect(x, y, Math.abs(rubber.x1 - rubber.x0), Math.abs(rubber.y1 - rubber.y0)); g.setLineDash([]); }
  if (App.wiring) { const A = portRef(App.wiring); if (A) { g.strokeStyle = '#0f62fe'; g.lineWidth = 1.5 / v.s; g.setLineDash([5 / v.s, 4 / v.s]); g.beginPath(); g.moveTo(A.x, A.y); g.lineTo(mouseW.x, A.y); g.lineTo(mouseW.x, mouseW.y); g.stroke(); g.setLineDash([]); } }
  if (App.placing && !S) { const d = DEFS[App.placing.type]; const tmp = { type: App.placing.type, props: Object.assign({}, d.defProps, App.placing.props), rot: 0, state: {} }; const { w, h } = compSize(tmp); g.save(); g.globalAlpha = .45; g.translate(snap(mouseW.x - w / 2), snap(mouseW.y - h / 2)); d.draw(g, tmp, null); g.restore(); }
}
let badges = [], labelRects = [];
const LABPOS = [['rt', 'À droite — en haut'], ['rm', 'À droite — au milieu'], ['rb', 'À droite — en bas'], ['lt', 'À gauche — en haut'], ['lm', 'À gauche — au milieu'], ['lb', 'À gauche — en bas'], ['free', 'Libre (glisser le repère)']];
const LABOLD = { tl: 'lt', tr: 'rt', bl: 'lb', br: 'rb' };
const labPos = c => LABOLD[c.props.labPos] || c.props.labPos || 'rt';
// Repère + références croisées : texte détouré (lisible sur les fils), position au choix
function labelBox(g, c, b) {
  const d = DEFS[c.type], lines = [];
  if (!d.noLabel && c.props.tag) lines.push([c.props.tag, 12, '#0f172a', true]);
  const xr = App.opts.xref ? xrefs(c) : ''; if (xr) lines.push([xr, 10, '#6d28d9', false]);
  if (!lines.length) return null;
  let W = 0; lines.forEach(([t, sz, , bo]) => { g.font = (bo ? '600 ' : '') + sz + 'px system-ui,sans-serif'; W = Math.max(W, g.measureText(t).width); });
  const H = lines.reduce((a, l) => a + l[1] * 1.25, 0), pos = labPos(c), m = 8;
  let x, y;
  if (pos === 'free') { x = b.x + b.w / 2 + (+c.props.labDx || 0) - W / 2; y = b.y + b.h / 2 + (+c.props.labDy || 0) - H / 2; }
  else { x = pos[0] === 'l' ? b.x - m - W : b.x + b.w + m; y = pos[1] === 't' ? b.y + 2 : pos[1] === 'b' ? b.y + b.h - H - 2 : b.y + (b.h - H) / 2; }
  return { lines, x, y, W, H };
}
function drawLabel(g, c, b, ui) {
  const L = labelBox(g, c, b); if (!L) return;
  let y = L.y; g.save(); g.textBaseline = 'top'; g.lineJoin = 'round';
  for (const [t, sz, col, bo] of L.lines) {
    g.font = (bo ? '600 ' : '') + sz + 'px system-ui,sans-serif'; const x = L.x + (L.W - g.measureText(t).width) / 2 * 0;
    g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 4; g.strokeText(t, x, y); g.fillStyle = col; g.fillText(t, x, y); y += sz * 1.25;
  }
  g.restore();
  if (ui) { labelRects.push({ c, x: L.x - 2, y: L.y - 2, w: L.W + 4, h: L.H + 4 }); if (App.sel.has(c.id) && labPos(c) === 'free') { g.save(); g.strokeStyle = '#a78bfa'; g.setLineDash([3, 2]); g.lineWidth = 1 / App.view.s; g.strokeRect(L.x - 2, L.y - 2, L.W + 4, L.H + 4); g.restore(); } }
}
function drawScene(g, S, ui) {
  const v = App.view; if (ui) { badges = []; labelRects = []; }
  if (App.opts.frame) drawFrame(g);
  if (ui && v.s > 0.45) { g.fillStyle = App.opts.frame ? '#e6eaf0' : '#d5dbe3'; const w0 = View.toWorld(0, 0), w1 = View.toWorld(cv.width / DPR, cv.height / DPR), step = v.s > 0.9 ? 20 : 40; for (let x = Math.floor(w0.x / step) * step; x < w1.x; x += step) for (let y = Math.floor(w0.y / step) * step; y < w1.y; y += step) g.fillRect(x - .8, y - .8, 1.6, 1.6); }
  const comps = App.sheetComps(), ids = new Set(comps.map(c => c.id));
  // fils
  const nets = App.opts.wireNums ? wireNumbers() : null;
  for (const w of App.wires) {
    if (!ids.has(w.a.c)) continue; const wp = wirePts(w); if (!wp) continue;
    const [col, lw, dash] = wireStyle(w, S);
    g.strokeStyle = App.selWire === w.id && ui ? '#0f62fe' : col; g.lineWidth = App.selWire === w.id && ui ? lw + 1.5 : lw; g.setLineDash(dash); g.lineJoin = 'round';
    if (w.kind === 'p' && !S && false) g.setLineDash([]);
    g.beginPath(); wp.pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)); g.stroke(); g.setLineDash([]);
    if (nets && w.kind === 'e') { const n = nets.get(w.id); if (n) { const m = wp.pts[2]; D.text(g, n, m.x + 6, m.y - 7, 9, '#7c3aed', 'left', true); } }
  }
  // nœuds de jonction automatiques (≥3 fils sur un même port)
  const cnt = new Map(); App.wires.forEach(w => [w.a, w.b].forEach(r => { const k = r.c + ':' + r.p; cnt.set(k, (cnt.get(k) || 0) + 1); }));
  // composants
  for (const c of comps) {
    const d = DEFS[c.type], { w, h } = compSize(c);
    g.save(); g.translate(c.x + w / 2, c.y + h / 2); g.rotate((c.rot || 0) * Math.PI / 2); g.translate(-w / 2, -h / 2);
    g.strokeStyle = INK; g.lineWidth = 1.6; g.lineCap = 'butt';
    try { d.draw(g, c, S); } catch (e) { console.error(e); }
    g.restore();
    const b = compBBox(c);
    drawLabel(g, c, b, ui && !S);
    if (ui && S && App.hover === c.id && d.press) { const pr = drag && drag.mode === 'press' && drag.c === c; g.save(); g.fillStyle = pr ? 'rgba(245,158,11,.16)' : 'rgba(15,98,254,.07)'; g.strokeStyle = pr ? 'rgba(245,158,11,.9)' : 'rgba(15,98,254,.45)'; g.lineWidth = 1.5 / v.s; g.beginPath(); g.roundRect(b.x - 6, b.y - 6, b.w + 12, b.h + 12, 8); g.fill(); g.stroke(); g.restore(); }
    if (ui && !S && App.sel.has(c.id)) { g.strokeStyle = '#0f62fe'; g.lineWidth = 1.5 / v.s; g.setLineDash([4 / v.s, 3 / v.s]); g.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10); g.setLineDash([]); }
    if (ui && c.fault && !App.hideFaults) { const r = clamp(9 / v.s, 7, 22), x = b.x + b.w + r * .6, y = b.y - r * .6; g.save(); g.fillStyle = '#dc2626'; g.strokeStyle = '#fff'; g.lineWidth = 2 / v.s; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); g.stroke(); D.text(g, '!', x, y + r * .05, r * 1.45, '#fff', 'center', true); g.restore(); badges.push({ c, x, y, r }); }
    if (S && c.state && c.state.burnt) { D.text(g, '💥', b.x + b.w / 2, b.y + b.h / 2, 22, '#111'); }
    if (ui && c._found) D.text(g, '✔', b.x + b.w + 4, b.y + 2, 14, '#16a34a');
    // ports
    if (ui && !S) for (const p of compPorts(c)) {
      const q = portWorld(c, p), k = c.id + ':' + p.id, n = cnt.get(k) || 0, hov = hoverPort && hoverPort.c === c && hoverPort.p.id === p.id;
      if (n === 0 || hov) { g.lineWidth = 1.2 / v.s; g.strokeStyle = WCOL[p.k] || '#334155'; g.fillStyle = hov ? '#0f62fe' : '#fff'; g.beginPath(); g.arc(q.x, q.y, (hov ? 5 : 3.2) / Math.max(v.s, .6), 0, 7); g.fill(); g.stroke(); }
      if (p.label && v.s > 0.7 && (c.type === 'conveyor')) { }
    }
    if (ui !== undefined) for (const p of compPorts(c)) { const k = c.id + ':' + p.id; if ((cnt.get(k) || 0) >= 3 || (c.type === 'node' && (cnt.get(k) || 0) >= 1)) { } }
  }
  // points de raccordement multiples
  g.fillStyle = INK; for (const [k, n] of cnt) if (n >= 3) { const [cid, pid] = [k.slice(0, k.indexOf(':')), k.slice(k.indexOf(':') + 1)]; if (!ids.has(cid)) continue; const r = portRef({ c: cid, p: pid }); if (r) { g.beginPath(); g.arc(r.x, r.y, 3.5, 0, 7); g.fill(); } }
}
function wireNumbers() {
  const uf = new UF(); App.wires.forEach(w => { if (w.kind === 'e' || w.kind === 'x') uf.union(w.a.c + ':' + w.a.p, w.b.c + ':' + w.b.p); });
  App.comps.filter(c => c.type === 'offpage').forEach((c, i, arr) => { const f = arr.find(o => o.props.tag === c.props.tag); uf.union(f.id + ':n', c.id + ':n'); });
  const m = new Map(), num = new Map(); let n = 1;
  App.wires.forEach(w => { if (w.kind !== 'e' && w.kind !== 'x') return; const r = uf.find(w.a.c + ':' + w.a.p); if (!num.has(r)) num.set(r, n++); m.set(w.id, String(num.get(r))); });
  return m;
}

/* ===================== INTERACTION ===================== */
const ptrs = new Map(); let drag = null, lastTap = { t: 0, id: null }, pinch = null;
function hitComp(p) { const cs = App.sheetComps(); for (let i = cs.length - 1; i >= 0; i--) { const c = cs[i], b = compBBox(c); if (p.x >= b.x - 2 && p.x <= b.x + b.w + 2 && p.y >= b.y - 2 && p.y <= b.y + b.h + 2) return c; } return null; }
function hitPort(p) { const r = 9 / Math.max(App.view.s, .5); let best = null, bd = r; for (const c of App.sheetComps()) for (const q of compPorts(c)) { const w = portWorld(c, q), d = Math.hypot(w.x - p.x, w.y - p.y); if (d < bd) { bd = d; best = { c, p: q }; } } return best; }
function hitWire(p) { const tol = 6 / App.view.s, ids = new Set(App.sheetComps().map(c => c.id)); for (const w of App.wires) { if (!ids.has(w.a.c)) continue; const wp = wirePts(w); if (!wp) continue; for (let i = 0; i < wp.pts.length - 1; i++) if (distSeg(p, wp.pts[i], wp.pts[i + 1]) < tol) return w; } return null; }
cv.addEventListener('pointerdown', e => {
  cv.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; drag = null; rubber = null; return; }
  const p = View.toWorld(e.offsetX, e.offsetY); mouseW = p;
  const S = Sim.S;
  if (e.button === 1 || e.button === 2) { drag = { mode: 'pan', sx: e.offsetX, sy: e.offsetY, ox: App.view.ox, oy: App.view.oy }; return; }
  const now = Date.now();
  if (S) {
    const c = hitComp(p);
    if (c) {
      const dbl = lastTap.id === c.id && now - lastTap.t < 350; lastTap = { t: now, id: c.id };
      if (dbl && c.type === 'plc') { PE.open(c); return; }
      App.sel = new Set([c.id]); App.selWire = null; Props.render();
      const d = DEFS[c.type]; if (d.press) { const l = toLocal(c, p.x, p.y); if (d.press(c, l.x, l.y, S)) { drag = { mode: 'press', c }; Sim.settleNow(); } }
      if (!drag) drag = { mode: 'pan', sx: e.offsetX, sy: e.offsetY, ox: App.view.ox, oy: App.view.oy, moved: false };
      return;
    }
    const w = hitWire(p); if (w) { App.selWire = w.id; App.sel.clear(); Props.render(); return; }
    drag = { mode: 'pan', sx: e.offsetX, sy: e.offsetY, ox: App.view.ox, oy: App.view.oy }; return;
  }
  if (App.placing) {
    const c = App.addComp(App.placing, p.x, p.y); App.sel = new Set([c.id]); App.selWire = null;
    if (!e.shiftKey) { App.placing = null; Pal.mark(); } App.changed(); return;
  }
  const lr = App.tool !== 'pan' && !hitPort(p) && labelRects.slice().reverse().find(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
  if (lr && !App.wiring) {
    const c = lr.c, b = compBBox(c); App.sel = new Set([c.id]); App.selWire = null; Props.render();
    const cx = lr.x + lr.w / 2 - (b.x + b.w / 2), cy = lr.y + lr.h / 2 - (b.y + b.h / 2);
    drag = { mode: 'label', c, p0: p, dx0: cx, dy0: cy, moved: false }; return;
  }
  const hp = hitPort(p);
  if (hp && App.tool !== 'pan') {
    if (!App.wiring) { App.wiring = { c: hp.c.id, p: hp.p.id }; return; }
    finishWire(hp); return;
  }
  if (App.wiring) { App.wiring = null; return; }
  const c = hitComp(p);
  if (c && App.tool !== 'pan') {
    const dbl = lastTap.id === c.id && now - lastTap.t < 350; lastTap = { t: now, id: c.id };
    if (dbl && c.type === 'plc') { PE.open(c); return; }
    if (e.shiftKey || e.ctrlKey) { App.sel.has(c.id) ? App.sel.delete(c.id) : App.sel.add(c.id); }
    else if (!App.sel.has(c.id)) App.sel = new Set([c.id]);
    App.selWire = null; Props.render();
    drag = { mode: 'move', p0: p, orig: [...App.sel].map(id => { const o = App.byId(id); return [o, o.x, o.y]; }), moved: false };
    return;
  }
  const w = App.tool !== 'pan' && hitWire(p);
  if (w) { App.selWire = w.id; App.sel.clear(); Props.render(); const wp = wirePts(w); drag = { mode: 'wire', w, vert: wp.vert, horiz: wp.horiz, moved: false }; return; }
  App.sel.clear(); App.selWire = null; Props.render();
  if (App.tool === 'pan' || e.pointerType === 'touch') drag = { mode: 'pan', sx: e.offsetX, sy: e.offsetY, ox: App.view.ox, oy: App.view.oy };
  else { rubber = { x0: p.x, y0: p.y, x1: p.x, y1: p.y }; drag = { mode: 'rubber' }; }
});
function finishWire(hp) {
  const a = portRef(App.wiring); App.wiring = null; if (!a) return;
  if (a.c === hp.c && a.p.id === hp.p.id) return;
  if (!kindOk(a.p.k, hp.p.k)) { toast('Connexion impossible : technologies incompatibles (' + kname(a.p.k) + ' / ' + kname(hp.p.k) + ')'); return; }
  if (App.wires.some(w => (w.a.c === a.c.id && w.a.p === a.p.id && w.b.c === hp.c.id && w.b.p === hp.p.id) || (w.b.c === a.c.id && w.b.p === a.p.id && w.a.c === hp.c.id && w.a.p === hp.p.id))) return;
  let k = wireKind(a.p.k, hp.p.k);
  if (k === 'x' || k === 'f') { const other = App.wires.find(w => [w.a, w.b].some(r => (r.c === a.c.id && r.p === a.p.id) || (r.c === hp.c.id && r.p === hp.p.id))); if (other && other.kind !== 'x') k = other.kind; }
  App.wires.push({ id: App.uid(), a: { c: a.c.id, p: a.p.id }, b: { c: hp.c.id, p: hp.p.id }, kind: k, mo: null });
  App.changed();
}
const kname = k => ({ e: 'électrique', p: 'pneumatique', h: 'hydraulique', l: 'logique', f: 'fluide', x: 'universel' }[k]);
cv.addEventListener('pointermove', e => {
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  if (pinch && ptrs.size === 2) { const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y), cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2; View.zoomAt(cx, cy, d / pinch.d); App.view.ox += cx - pinch.cx; App.view.oy += cy - pinch.cy; pinch = { d, cx, cy }; return; }
  const p = View.toWorld(e.offsetX, e.offsetY); mouseW = p;
  if (!drag) hover(p, e);
  if (!drag) return;
  if (drag.mode === 'pan') { App.view.ox = drag.ox + e.offsetX - drag.sx; App.view.oy = drag.oy + e.offsetY - drag.sy; }
  if (drag.mode === 'move') { const dx = p.x - drag.p0.x, dy = p.y - drag.p0.y; if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true; if (drag.moved) drag.orig.forEach(([o, x, y]) => { o.x = snap(x + dx); o.y = snap(y + dy); }); }
  if (drag.mode === 'label') { const dx = p.x - drag.p0.x, dy = p.y - drag.p0.y; if (Math.abs(dx) + Math.abs(dy) > 2) { drag.moved = true; drag.c.props.labPos = 'free'; drag.c.props.labDx = Math.round(drag.dx0 + dx); drag.c.props.labDy = Math.round(drag.dy0 + dy); } }
  if (drag.mode === 'wire') { if (drag.vert) drag.w.mo = snap(p.y); else if (drag.horiz) drag.w.mo = snap(p.x); drag.moved = true; }
  if (drag.mode === 'rubber') { rubber.x1 = p.x; rubber.y1 = p.y; }
});
const tipEl = () => $('#tip');
function showTip(html, e) { const t = tipEl(); if (!html) { t.style.display = 'none'; return; } t.innerHTML = html; t.style.display = 'block'; const r = cv.getBoundingClientRect(); let x = e.offsetX + 14, y = e.offsetY + 16; if (x + t.offsetWidth > r.width - 6) x = e.offsetX - t.offsetWidth - 10; if (y + t.offsetHeight > r.height - 6) y = e.offsetY - t.offsetHeight - 10; t.style.left = x + 'px'; t.style.top = y + 'px'; }
function hover(p, e) {
  const S = Sim.S; let tip = '', cur = 'default'; App.hover = null;
  const bd = badges.find(q => Math.hypot(q.x - p.x, q.y - p.y) <= q.r * 1.2);
  if (bd) { tip = `<b>⚠ Défaillance simulée</b><br>${esc(bd.c.props.tag || DEFS[bd.c.type].name)} : ${esc(faultLabel(bd.c))}<br><span style="opacity:.7">Modifiable dans le panneau Propriétés</span>`; cur = 'help'; }
  else if (S) {
    hoverPort = null; const c = hitComp(p);
    if (c) {
      const d = DEFS[c.type]; App.hover = c.id; const l = toLocal(c, p.x, p.y);
      if (d.press) { cur = 'pointer'; tip = '<b>' + esc(c.props.tag || d.name) + '</b><br>' + esc(d.hint ? d.hint(c, l.x, l.y) : (c.type === 'plc' ? 'Double-clic : programme et visualisation' : 'Cliquer pour actionner')); }
      else if (d.info) tip = '<b>' + esc(c.props.tag || d.name) + '</b><br>' + esc(d.info(c));
      if (c.type === 'plc') { cur = 'pointer'; tip = '<b>' + esc(c.props.tag) + '</b><br>Double-clic : programme et visualisation en ligne'; }
      if (c.fault && !App.hideFaults) tip += '<br><span style="color:#fca5a5">⚠ ' + esc(faultLabel(c)) + '</span>';
    }
  } else {
    hoverPort = hitPort(p); const c = hitComp(p);
    const onLab = !hoverPort && labelRects.some(r => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h);
    cur = hoverPort ? 'crosshair' : App.placing ? 'copy' : onLab ? 'grab' : (c ? 'move' : 'default');
    if (onLab) tip = 'Glisser pour déplacer le repère librement';
    if (hoverPort) tip = esc(hoverPort.p.label || hoverPort.p.id) + ' · ' + kname(hoverPort.p.k);
  }
  cv.style.cursor = cur; showTip(tip, e);
}
cv.addEventListener('pointerleave', () => { App.hover = null; showTip(''); });
function endPtr(e) {
  ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null;
  if (!drag) return;
  if (drag.mode === 'press') { const d = DEFS[drag.c.type]; if (d.release && d.release(drag.c)) Sim.settleNow(); }
  if (drag.mode === 'move' && drag.moved) App.changed();
  if (drag.mode === 'wire' && drag.moved) App.changed();
  if (drag.mode === 'label' && drag.moved) App.changed();
  if (drag.mode === 'rubber' && rubber) {
    const x0 = Math.min(rubber.x0, rubber.x1), x1 = Math.max(rubber.x0, rubber.x1), y0 = Math.min(rubber.y0, rubber.y1), y1 = Math.max(rubber.y0, rubber.y1);
    if (x1 - x0 > 4) { App.sel = new Set(App.sheetComps().filter(c => { const b = compBBox(c); return b.x >= x0 && b.y >= y0 && b.x + b.w <= x1 && b.y + b.h <= y1; }).map(c => c.id)); Props.render(); }
    rubber = null;
  }
  drag = null;
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr);
cv.addEventListener('dblclick', e => { const c = hitComp(View.toWorld(e.offsetX, e.offsetY)); if (c && c.type === 'plc') PE.open(c); });
cv.addEventListener('contextmenu', e => e.preventDefault());
cv.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || !e.shiftKey && Math.abs(e.deltaY) > 0 && !e.deltaX) View.zoomAt(e.offsetX, e.offsetY, Math.pow(1.0015, -e.deltaY)); else { App.view.ox -= e.deltaX; App.view.oy -= e.deltaY; } }, { passive: false });
document.addEventListener('keydown', e => {
  if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName) || $('#modal').classList.contains('open')) return;
  const k = e.key.toLowerCase();
  if (k === 'delete' || k === 'backspace') { App.delSel(); e.preventDefault(); }
  else if (k === 'r' && !e.ctrlKey) App.rotSel();
  else if (k === 'escape') { App.wiring = null; App.placing = null; Pal.mark(); }
  else if (e.ctrlKey && k === 'z') { App.undo(); e.preventDefault(); }
  else if (e.ctrlKey && k === 'y') { App.redo(); e.preventDefault(); }
  else if (e.ctrlKey && k === 'c') App.copy();
  else if (e.ctrlKey && k === 'v') App.paste();
  else if (e.ctrlKey && k === 'd') { App.dup(); e.preventDefault(); }
  else if (e.ctrlKey && k === 's') { Files.save(); e.preventDefault(); }
  else if (e.ctrlKey && k === 'a') { App.sel = new Set(App.sheetComps().map(c => c.id)); Props.render(); e.preventDefault(); }
  else if (k === 'f5') { e.preventDefault(); Sim.S && App.running ? Ctl.stop() : Ctl.run(); }
});
Sim.settleNow = function () { if (!this.S) return; this.solve(); this.settle(); };

/* ===================== PALETTE ===================== */
const Pal = {
  filter: '',
  entries() { const out = []; PALETTE.forEach(([cat, items]) => items.forEach(([type, label, props]) => out.push({ cat, type, label: label || DEFS[type].name, props: props || {}, key: type + '|' + (label || '') }))); return out; },
  render() {
    const el = $('#palette'); const f = this.filter.toLowerCase();
    let h = `<div class="pal-search"><input id="palQ" placeholder="Rechercher un composant…" value="${esc(this.filter)}"></div>`;
    if (App.lib) h += `<div class="hint" style="padding:6px 10px;background:#fef3c7">Bibliothèque restreinte à l'exercice (${App.lib.length} composants)</div>`;
    PALETTE.forEach(([cat, items]) => {
      const list = items.map(([type, label, props]) => ({ type, label: label || DEFS[type].name, props: props || {}, key: type + '|' + (label || '') }))
        .filter(x => (!App.lib || App.lib.includes(x.key)) && (!f || x.label.toLowerCase().includes(f) || cat.toLowerCase().includes(f)));
      if (!list.length) return;
      h += `<div class="cat"><h4>${esc(cat)} <span>${list.length}</span></h4><div class="items">${list.map(x => `<div class="pi" data-k="${esc(x.key)}" title="${esc(x.label)}"><canvas width="192" height="104"></canvas>${esc(x.label)}</div>`).join('')}</div></div>`;
    });
    el.innerHTML = h;
    const all = this.entries();
    el.querySelectorAll('.pi').forEach(div => { const x = all.find(e => e.key === div.dataset.k); this.thumb(div.querySelector('canvas'), x); div.onclick = () => { if (Sim.S) return toast('Arrêtez la simulation pour modifier le schéma'); App.placing = App.placing && App.placing.key === x.key ? null : x; this.mark(); if (App.placing) toast('Cliquez sur le schéma pour placer « ' + x.label + ' » (Maj : placements multiples)'); if (innerWidth < 900) $('#palette').classList.remove('show'); }; });
    el.querySelectorAll('.cat h4').forEach(h4 => h4.onclick = () => h4.parentNode.classList.toggle('closed'));
    const q = $('#palQ'); q.oninput = () => { this.filter = q.value; const pos = q.selectionStart; this.render(); const n = $('#palQ'); n.focus(); n.setSelectionRange(pos, pos); };
    this.mark();
  },
  mark() { document.querySelectorAll('.pi').forEach(d => d.classList.toggle('on', !!App.placing && d.dataset.k === App.placing.key)); },
  thumb(canvas, x) {
    const g = canvas.getContext('2d'), d = DEFS[x.type], c = { type: x.type, props: Object.assign({}, d.defProps, x.props), rot: 0, state: {} };
    if (c.type === 'plc') c.props.prog = PLC.newProg();
    const { w, h } = compSize(c), s = Math.min(176 / w, 88 / h, 1.6);
    g.clearRect(0, 0, 192, 104); g.save(); g.translate(96 - w * s / 2, 52 - h * s / 2); g.scale(s, s); g.strokeStyle = INK; g.lineWidth = 1.6;
    try { d.draw(g, c, null); } catch (e) { }
    g.restore();
  }
};

/* ===================== FOLIOS ===================== */
const Sheets = {
  render() {
    const el = $('#sheets');
    el.innerHTML = App.sheets.map((s, i) => `<button data-i="${i}" class="${i === App.sheet ? 'on' : ''}" title="Double-clic pour renommer">${i + 1}. ${esc(s.name)}</button>`).join('') + '<button data-add="1" title="Nouveau folio">＋</button>';
    el.onclick = e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.add) { App.sheets.push({ name: 'Folio ' + (App.sheets.length + 1) }); App.sheet = App.sheets.length - 1; App.sel.clear(); App.changed(); this.render(); View.fit(); return; } App.sheet = +b.dataset.i; App.sel.clear(); App.selWire = null; this.render(); Props.render(); };
    el.ondblclick = e => { const b = e.target.closest('button[data-i]'); if (b) this.rename(+b.dataset.i); };
  },
  async rename(i) { const n = await ask('Nom du folio', App.sheets[i].name); if (n) { App.sheets[i].name = n; App.changed(); this.render(); } },
  async remove(i) {
    if (App.sheets.length < 2) return toast('Le projet doit contenir au moins un folio');
    if (!(await confirmDlg('Supprimer le folio « ' + App.sheets[i].name + ' » et tout son contenu ?'))) return;
    const gone = new Set(App.comps.filter(c => (c.sheet || 0) === i).map(c => c.id));
    App.comps = App.comps.filter(c => !gone.has(c.id)); App.wires = App.wires.filter(w => !gone.has(w.a.c));
    App.comps.forEach(c => { if (c.sheet > i) c.sheet--; }); App.sheets.splice(i, 1); App.sheet = Math.max(0, i - 1); App.changed(); this.render();
  }
};
function ask(title, value = '', multi) {
  return new Promise(res => {
    const dlg = $('#dlg'); dlg.className = 'dlg sm';
    dlg.innerHTML = `<header><h2>${esc(title)}</h2></header><div class="body">${multi ? `<textarea id="askV" rows="12" style="width:100%;font-family:monospace;font-size:11px">${esc(value)}</textarea>` : `<input id="askV" value="${esc(value)}" style="width:100%;padding:7px;border:1px solid #d6dbe3;border-radius:6px">`}</div><footer><button class="btn" id="askC">Annuler</button><button class="btn pri" id="askO">OK</button></footer>`;
    $('#modal').classList.add('open'); const i = $('#askV'); i.focus(); if (!multi) i.select();
    const done = v => { $('#modal').classList.remove('open'); res(v); };
    $('#askC').onclick = () => done(null); $('#askO').onclick = () => done(i.value); if (!multi) i.onkeydown = e => { if (e.key === 'Enter') done(i.value); if (e.key === 'Escape') done(null); };
  });
}
function confirmDlg(msg) {
  return new Promise(res => {
    const dlg = $('#dlg'); dlg.className = 'dlg sm';
    dlg.innerHTML = `<header><h2>Confirmation</h2></header><div class="body">${esc(msg)}</div><footer><button class="btn" id="cfN">Annuler</button><button class="btn pri" id="cfY">Confirmer</button></footer>`;
    $('#modal').classList.add('open'); const done = v => { $('#modal').classList.remove('open'); res(v); };
    $('#cfN').onclick = () => done(false); $('#cfY').onclick = () => done(true);
  });
}

/* ===================== PROPRIÉTÉS ===================== */
const Props = {
  render() {
    const el = $('#props'); const S = Sim.S;
    if (App.selWire) return this.renderWire(el);
    if (App.sel.size > 1) { el.innerHTML = `<h3>${App.sel.size} éléments sélectionnés</h3><div class="pp"><div class="btns"><button class="btn" onclick="App.rotSel()">⟳ Pivoter</button><button class="btn" onclick="App.dup()">⧉ Dupliquer</button><button class="btn dng" onclick="App.delSel()">🗑 Supprimer</button></div><p class="hint">Glissez pour déplacer le groupe. Ctrl+C / Ctrl+V pour copier vers un autre folio.</p></div>`; return; }
    const c = App.sel.size ? App.byId([...App.sel][0]) : null;
    if (!c) return this.renderProject(el);
    const d = DEFS[c.type], fields = (d.fieldsFn ? d.fieldsFn(c) : d.fields) || [], cat = d.catalogFn ? d.catalogFn(c) : d.catalog;
    const name = typeof d.bom === 'function' ? d.bom(c) : (d.name);
    let h = `<h3>${esc(name)}</h3><div class="pp">`;
    h += `<div id="probe"></div>`;
    if (cat && !App.hideFaults || cat && !S) h += `<div class="row"><label>Catalogue</label><select id="pCat"><option value="">— Choisir un modèle —</option>${cat.map((x, i) => `<option value="${i}" ${c.props.ref === x.ref ? 'selected' : ''}>${esc(x.ref)}</option>`).join('')}</select></div>`;
    fields.forEach(f => {
      if (f.when && !f.when(c)) return; const v = c.props[f.k] ?? '';
      if (f.type === 'sel') h += `<div class="row"><label>${esc(f.label)}</label><select data-k="${f.k}">${f.opts.map((o, i) => `<option value="${esc(o)}" ${String(v) === String(o) ? 'selected' : ''}>${esc(f.labels ? f.labels[i] : o)}</option>`).join('')}</select></div>`;
      else if (f.type === 'chk') h += `<div class="row chk"><input type="checkbox" data-k="${f.k}" ${v ? 'checked' : ''}><label>${esc(f.label)}</label></div>`;
      else if (f.type === 'textarea') h += `<div class="row"><label>${esc(f.label)}</label><textarea data-k="${f.k}" rows="3">${esc(v)}</textarea></div>`;
      else if (f.type === 'range') h += `<div class="row"><label>${esc(f.label)} : <b id="rv_${f.k}">${esc(v)}</b></label><input type="range" min="0" max="100" data-k="${f.k}" value="${esc(v)}"></div>`;
      else h += `<div class="row"><label>${esc(f.label)}</label><input data-k="${f.k}" ${f.type === 'num' ? `type="number" step="${f.step || 1}"` : ''} value="${esc(v)}"></div>`;
    });
    if ((!d.noLabel && c.props.tag) || xrefs(c)) h += `<div class="row"><label>Position du repère et des références</label><select id="pLab">${LABPOS.map(([k, l]) => `<option value="${k}" ${labPos(c) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    const FL = faultList(c);
    if (FL.length && !App.hideFaults) h += `<div class="row"><label>Défaillance simulée</label><select id="pFault"><option value="">Aucune</option>${FL.map(([k, l]) => `<option value="${k}" ${c.fault === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>`;
    h += '<div class="btns">';
    if (c.type === 'plc') h += `<button class="btn pri" id="pProg">✎ Programmer l'automate</button>`;
    if (d.plot) h += `<button class="btn" id="pPlot">📈 Ajouter au traceur</button>`;
    if (!S) h += `<button class="btn" onclick="App.rotSel()">⟳</button><button class="btn" onclick="App.dup()">⧉</button><button class="btn dng" onclick="App.delSel()">🗑</button>`;
    h += '</div>';
    if (App.hideFaults) h += `<div class="btns"><button class="btn" id="pReport">🔎 Signaler ce composant comme défectueux</button></div><p class="hint">Mode dépannage : mesurez, observez puis signalez le ou les composants en défaut.</p>`;
    const xr = xrefs(c); if (xr) h += `<div class="row"><label>Références croisées (folio.zone)</label><div class="hint">${esc(xr)}</div></div>`;
    h += `<p class="hint">Folio ${c.sheet + 1}, zone ${zoneOf(c)} · ${esc(d.name)}</p></div>`;
    el.innerHTML = h; this.probe();
    el.querySelectorAll('[data-k]').forEach(inp => {
      const f = fields.find(x => x.k === inp.dataset.k);
      const apply = () => {
        let v = inp.type === 'checkbox' ? inp.checked : inp.value; if (f && (f.type === 'num' || f.type === 'range')) v = +v;
        c.props[inp.dataset.k] = v; if (f.type === 'range') { const b = $('#rv_' + f.k); if (b) b.textContent = v; }
        if (['vt', 'aL', 'aR', 'xL', 'xR', 'single', 'medium'].includes(inp.dataset.k)) { App.pruneWires(); App.changed(); return Props.render(); }
        App.changed(); if (Sim.S) Sim.indexCyl();
      };
      inp.onchange = apply; if (f && f.type === 'range') inp.oninput = () => { c.props[f.k] = +inp.value; const b = $('#rv_' + f.k); if (b) b.textContent = inp.value; };
    });
    const pc = $('#pCat'); if (pc) pc.onchange = () => { const x = cat[+pc.value]; if (!x) return; Object.assign(c.props, x.props); c.props.ref = x.ref; App.changed(); };
    const pl0 = $('#pLab'); if (pl0) pl0.onchange = () => { c.props.labPos = pl0.value; if (pl0.value === 'free' && c.props.labDx == null) { const b = compBBox(c); c.props.labDx = 0; c.props.labDy = -b.h / 2 - 16; } App.changed(); };
    const pf = $('#pFault'); if (pf) pf.onchange = () => { c.fault = pf.value || null; App.changed(); };
    const pp = $('#pProg'); if (pp) pp.onclick = () => PE.open(c);
    const pl = $('#pPlot'); if (pl) pl.onclick = () => Plot.add(c);
    const pr = $('#pReport'); if (pr) pr.onclick = () => Trouble.report(c);
  },
  probe() {
    const el = $('#probe'); if (!el) return; const c = App.sel.size === 1 ? App.byId([...App.sel][0]) : null; if (!c) return;
    const d = DEFS[c.type]; if (!d.probe) { el.innerHTML = ''; return; }
    const o = d.probe.call(d, c, Sim.S); const ks = Object.keys(o); if (!ks.length) { el.innerHTML = ''; return; }
    el.innerHTML = `<div class="kv">${ks.map(k => `<span>${esc(k)}</span><b>${esc(o[k])}</b>`).join('')}</div>`;
  },
  renderWire(el) {
    const w = App.wires.find(x => x.id === App.selWire); if (!w) { App.selWire = null; return this.render(); }
    const A = portRef(w.a), B = portRef(w.b);
    let h = `<h3>Liaison ${kname(w.kind)}</h3><div class="pp"><div class="kv"><span>De</span><b>${esc(A ? (A.c.props.tag || DEFS[A.c.type].name) + ' : ' + A.p.id : '?')}</b><span>Vers</span><b>${esc(B ? (B.c.props.tag || DEFS[B.c.type].name) + ' : ' + B.p.id : '?')}</b>`;
    if (Sim.S && A) { const S = Sim.S; if (w.kind === 'e' || w.kind === 'x') { const pt = S.pot(A.c, A.p.id); h += `<span>Potentiel</span><b>${!pt ? 'non alimenté' : (pt.ph || '') + ' — ' + (pt.dc ? pt.dc + ' V DC' : fmt(Math.hypot(pt.re, pt.im), 0) + ' V AC / terre')}</b>`; } else if (w.kind !== 'l') h += `<span>Pression</span><b>${fmt(S.P(A.c, A.p.id), 2)} bar</b><span>Débit</span><b>${fmt(S.Q(A.c, A.p.id), 2)} L/min</b>`; }
    h += `</div><div class="btns">`;
    const fl = w.kind !== 'e' && w.kind !== 'l' && w.kind !== 'x';
    if (!App.hideFaults) h += `<button class="btn" id="wCut">${w.cut ? (fl ? '✔ Remplacer le flexible' : '✔ Réparer le fil') : (fl ? '💥 Simuler une rupture de flexible' : '✂ Simuler un fil coupé')}</button>`;
    else h += `<button class="btn" id="wRep">🔎 Signaler ${fl ? 'ce flexible comme rompu' : 'ce fil comme coupé'}</button>`;
    if (!Sim.S) h += `<button class="btn" id="wReset">Tracé automatique</button><button class="btn dng" onclick="App.delSel()">🗑 Supprimer</button>`;
    h += `</div><p class="hint">Faites glisser un fil pour déplacer son segment central.</p></div>`;
    el.innerHTML = h;
    const cut = $('#wCut'); if (cut) cut.onclick = () => { w.cut = !w.cut; App.changed(); };
    const rs = $('#wReset'); if (rs) rs.onclick = () => { w.mo = null; App.changed(); };
    const rp = $('#wRep'); if (rp) rp.onclick = () => Trouble.report(null, w);
  },
  renderProject(el) {
    const P = App.project, n = App.comps.length;
    el.innerHTML = `<h3>Projet</h3><div class="pp">
      ${['name:Nom du projet', 'author:Auteur', 'company:Société', 'rev:Révision', 'date:Date'].map(s => { const [k, l] = s.split(':'); return `<div class="row"><label>${l}</label><input data-pk="${k}" value="${esc(P[k] || '')}"></div>`; }).join('')}
      <div class="row"><label>Folio actif</label><input id="shName" value="${esc(App.sheets[App.sheet].name)}"></div>
      <div class="btns"><button class="btn dng" id="shDel">Supprimer ce folio</button></div>
      <div class="row chk"><input type="checkbox" id="oFrame" ${App.opts.frame ? 'checked' : ''}><label>Cadre et cartouche</label></div>
      <div class="row chk"><input type="checkbox" id="oNums" ${App.opts.wireNums ? 'checked' : ''}><label>Numérotation des fils électriques</label></div>
      <div class="row chk"><input type="checkbox" id="oXref" ${App.opts.xref ? 'checked' : ''}><label>Références croisées</label></div>
      <div class="kv"><span>Composants</span><b>${n}</b><span>Liaisons</span><b>${App.wires.length}</b><span>Folios</span><b>${App.sheets.length}</b></div>
      <p class="hint"><b>Prise en main</b> : choisissez un composant dans la bibliothèque puis cliquez sur le schéma. Cliquez sur un orifice ou une borne puis sur un autre pour créer une liaison. Lancez la simulation avec ▶ puis cliquez sur les boutons, leviers et capteurs pour les actionner. Double-cliquez sur un automate pour le programmer.</p></div>`;
    el.querySelectorAll('[data-pk]').forEach(i => i.onchange = () => { P[i.dataset.pk] = i.value; App.changed(); });
    $('#shName').onchange = e => { App.sheets[App.sheet].name = e.target.value; Sheets.render(); App.changed(); };
    $('#shDel').onclick = () => Sheets.remove(App.sheet);
    $('#oFrame').onchange = e => { App.opts.frame = e.target.checked; App.changed(); View.fit(); };
    $('#oNums').onchange = e => { App.opts.wireNums = e.target.checked; App.changed(); };
    $('#oXref').onchange = e => { App.opts.xref = e.target.checked; App.changed(); };
  }
};

/* ===================== DÉPANNAGE ===================== */
const Trouble = {
  toggle() { App.hideFaults = !App.hideFaults; $('#bTrouble').classList.toggle('on', App.hideFaults); toast(App.hideFaults ? 'Mode dépannage : les défaillances sont masquées' : 'Mode conception : défaillances visibles'); App.comps.forEach(c => delete c._found); App.changed(); },
  report(c, w) {
    App.reports++;
    const bad = c ? !!c.fault : !!(w && w.cut);
    if (bad) { if (c) c._found = true; App.found++; const fl = c ? faultLabel(c) : 'Fil coupé'; toast('✔ Bien vu ! Défaut identifié : ' + fl, 3500); }
    else toast('✖ Ce ' + (c ? 'composant' : 'fil') + ' fonctionne correctement. Continuez le diagnostic.', 3000);
    const total = App.comps.filter(x => x.fault).length + App.wires.filter(x => x.cut).length;
    if (bad && App.found >= total) setTimeout(() => toast('🎉 Toutes les défaillances ont été trouvées en ' + App.reports + ' tentative(s).', 4500), 1200);
  }
};

/* ===================== TRACEUR ===================== */
const PCOLS = ['#22d3ee', '#f472b6', '#a3e635', '#fbbf24', '#818cf8', '#fb7185', '#34d399', '#f97316'];
const Plot = {
  add(c) { if (App.plot.ch.some(x => x.id === c.id)) return toast('Déjà dans le traceur'); if (App.plot.ch.length >= 8) return toast('8 canaux maximum'); App.plot.ch.push({ id: c.id, data: [], color: PCOLS[App.plot.ch.length % 8] }); this.open(true); },
  open(v) { App.plot.open = v ?? !App.plot.open; $('#plot').classList.toggle('open', App.plot.open); $('#bPlot').classList.toggle('on', App.plot.open); setTimeout(() => View.resize(), 200); },
  sample() { const S = Sim.S; App.plot.ch.forEach(ch => { const c = App.byId(ch.id); if (!c) return; const d = DEFS[c.type]; ch.data.push([S.t, +d.plot.call(d, c, S) || 0]); if (ch.data.length > 2000) ch.data.shift(); }); },
  draw() {
    if (!App.plot.open) return; const el = $('#plotc'), r = el.getBoundingClientRect(); const W = r.width, H = r.height; if (el.width !== Math.round(W * DPR)) { el.width = W * DPR; el.height = H * DPR; }
    const g = el.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.fillStyle = '#0f1520'; g.fillRect(0, 0, W, H);
    const chs = App.plot.ch; if (!chs.length) { D.text(g, 'Sélectionnez un composant puis « Ajouter au traceur » (vérins, manomètres, bobines, alimentation…)', W / 2, H / 2, 12, '#7b8ba3'); return; }
    const t1 = Sim.S ? Sim.S.t : (chs[0].data.at(-1) || [10])[0], span = 15, t0 = Math.max(0, t1 - span), L = 150, lane = (H - 22) / chs.length;
    g.strokeStyle = '#1e293b'; g.lineWidth = 1; for (let t = Math.ceil(t0); t <= t0 + span; t++) { const x = L + (t - t0) / span * (W - L - 10); g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H - 18); g.stroke(); if (t % 2 === 0) D.text(g, t + ' s', x, H - 9, 9, '#64748b'); }
    chs.forEach((ch, i) => {
      const c = App.byId(ch.id); if (!c) return; const d = DEFS[c.type], y0 = i * lane + 4, hh = lane - 8;
      const vals = ch.data.filter(p => p[0] >= t0); let mn = Math.min(0, ...vals.map(p => p[1])), mx = Math.max(1, ...vals.map(p => p[1])); if (mx - mn < 1e-6) mx = mn + 1;
      g.strokeStyle = '#1e293b'; g.beginPath(); g.moveTo(L, y0 + hh); g.lineTo(W - 10, y0 + hh); g.stroke();
      D.text(g, (c.props.tag || d.name) + ' (' + d.plotUnit + ')', 8, y0 + 8, 10.5, ch.color, 'left', true);
      const last = vals.length ? vals[vals.length - 1][1] : 0; D.text(g, fmt(last, d.plotUnit === 'état' ? 0 : 1) + '  [' + fmt(mn, 0) + '…' + fmt(mx, 0) + ']', 8, y0 + 22, 9.5, '#94a3b8', 'left');
      g.strokeStyle = ch.color; g.lineWidth = 1.6; g.beginPath();
      vals.forEach((p, k) => { const x = L + (p[0] - t0) / span * (W - L - 10), y = y0 + hh - (p[1] - mn) / (mx - mn) * hh; k ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
    });
  }
};

/* ===================== CONTRÔLE SIMULATION ===================== */
const Ctl = {
  run() {
    if (!Sim.S) { App.pruneWires(); App.wiring = null; App.placing = null; Pal.mark(); App.plot.ch.forEach(c => c.data = []); Sim.start(); }
    App.running = true; this.syncUI(); Props.render();
  },
  pause() { App.running = false; this.syncUI(); },
  step() { if (!Sim.S) { this.run(); App.running = false; } for (let i = 0; i < 5; i++) { Sim.tick(); Plot.sample(); } this.syncUI(); },
  stop() { App.running = false; Sim.stop(); this.syncUI(); Props.render(); },
  syncUI() {
    const sim = !!Sim.S;
    $('#bRun').disabled = App.running; $('#bPause').disabled = !App.running; $('#bStep').disabled = App.running; $('#bStop').disabled = !sim;
    ['#bUndo', '#bRedo', '#bRot', '#bDup', '#bDel', '#bNew', '#bOpen'].forEach(s => $(s).disabled = sim);
    $('#modeTag').textContent = sim ? (App.running ? '● Simulation en cours' : '❚❚ Simulation en pause') : 'Édition';
    $('#modeTag').style.color = sim ? '#15803d' : '';
    $('#bTrouble').classList.toggle('on', App.hideFaults);
  }
};
/* ===================== SECONDE VUE (scindée / mini-fenêtre) =====================
   Affiche un autre folio en même temps : on actionne les boutons du schéma électrique
   et on voit réagir le pneumatique ou l'hydraulique. Les éléments y sont aussi cliquables. */
const View2 = {
  mode: '', sheet: 1, view: { ox: 20, oy: 20, s: 0.5 }, cv: null, drag: null, fitted: false,
  init() {
    this.cv = $('#cv2'); const cv2 = this.cv;
    $('#selView').onchange = e => this.set(e.target.value);
    $('#p2sel').onchange = e => { this.sheet = +e.target.value; this.fit(); };
    $('#p2fit').onclick = () => this.fit();
    $('#p2close').onclick = () => { this.set(''); $('#selView').value = ''; };
    new ResizeObserver(() => { if (this.mode) this.resize(); }).observe($('#pane2'));
    const w = (e) => { const r = cv2.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top }; };
    const world = (sx, sy) => ({ x: (sx - this.view.ox) / this.view.s, y: (sy - this.view.oy) / this.view.s });
    const onSheet = f => { const k = App.sheet; App.sheet = this.sheet; try { return f(); } finally { App.sheet = k; } };
    cv2.addEventListener('pointerdown', e => {
      cv2.setPointerCapture(e.pointerId); const { sx, sy } = w(e), p = world(sx, sy);
      const c = onSheet(() => hitComp(p));
      if (c && Sim.S) {
        const d = DEFS[c.type];
        if (c.type === 'plc' && this.lastTap && this.lastTap.id === c.id && Date.now() - this.lastTap.t < 350) { PE.open(c); return; }
        this.lastTap = { id: c.id, t: Date.now() };
        if (d.press) { const l = toLocal(c, p.x, p.y); if (d.press(c, l.x, l.y, Sim.S)) { this.drag = { mode: 'press', c }; Sim.settleNow(); return; } }
      }
      if (c && !Sim.S) { App.sheet = this.sheet; App.sel = new Set([c.id]); Sheets.render(); Props.render(); return; }
      this.drag = { mode: 'pan', sx, sy, ox: this.view.ox, oy: this.view.oy };
    });
    cv2.addEventListener('pointermove', e => {
      const { sx, sy } = w(e);
      if (this.drag && this.drag.mode === 'pan') { this.view.ox = this.drag.ox + sx - this.drag.sx; this.view.oy = this.drag.oy + sy - this.drag.sy; return; }
      if (!this.drag && Sim.S) { const c = onSheet(() => hitComp(world(sx, sy))); cv2.style.cursor = c && DEFS[c.type].press ? 'pointer' : 'grab'; this.hover = c ? c.id : null; }
    });
    const up = () => { if (this.drag && this.drag.mode === 'press') { const d = DEFS[this.drag.c.type]; if (d.release && d.release(this.drag.c)) Sim.settleNow(); } this.drag = null; };
    cv2.addEventListener('pointerup', up); cv2.addEventListener('pointercancel', up);
    cv2.addEventListener('wheel', e => { e.preventDefault(); const { sx, sy } = w(e), p = world(sx, sy), f = Math.pow(1.0015, -e.deltaY); this.view.s = clamp(this.view.s * f, 0.1, 4); this.view.ox = sx - p.x * this.view.s; this.view.oy = sy - p.y * this.view.s; }, { passive: false });
    cv2.addEventListener('dblclick', () => this.fit());
    // déplacement de la mini-fenêtre par sa barre de titre
    const head = $('#pane2 .p2h'); let mv = null;
    head.addEventListener('pointerdown', e => { if (this.mode !== 'pip' || e.target.closest('select,button')) return; const pn = $('#pane2'), r = pn.getBoundingClientRect(), pr = $('#views').getBoundingClientRect(); mv = { dx: e.clientX - r.left, dy: e.clientY - r.top, pr }; head.setPointerCapture(e.pointerId); });
    head.addEventListener('pointermove', e => { if (!mv) return; const pn = $('#pane2'); pn.style.left = clamp(e.clientX - mv.pr.left - mv.dx, 0, mv.pr.width - 120) + 'px'; pn.style.top = clamp(e.clientY - mv.pr.top - mv.dy, 0, mv.pr.height - 60) + 'px'; pn.style.right = 'auto'; pn.style.bottom = 'auto'; });
    head.addEventListener('pointerup', () => mv = null);
  },
  set(mode) {
    this.mode = mode; const vw = $('#views'); vw.classList.toggle('split', mode === 'split'); vw.classList.toggle('pip', mode === 'pip');
    if (mode !== 'pip') { const pn = $('#pane2'); pn.style.left = pn.style.top = pn.style.right = pn.style.bottom = ''; }
    if (mode) { if (this.sheet >= App.sheets.length || this.sheet === App.sheet) this.sheet = App.sheets.length > 1 ? (App.sheet === 0 ? 1 : 0) : 0; this.options(); setTimeout(() => { this.resize(); this.fit(); View.resize(); if (mode === 'split') View.fit(); }, 30); }
    else setTimeout(() => View.resize(), 30);
  },
  options() { const sel = $('#p2sel'); sel.innerHTML = App.sheets.map((s, i) => `<option value="${i}" ${i === this.sheet ? 'selected' : ''}>${i + 1}. ${esc(s.name)}</option>`).join(''); },
  resize() { const r = this.cv.getBoundingClientRect(); this.cv.width = Math.max(1, r.width * DPR); this.cv.height = Math.max(1, r.height * DPR); },
  fit() {
    const r = this.cv.getBoundingClientRect(); if (!r.width) return; const cs = App.comps.filter(c => (c.sheet || 0) === this.sheet);
    let b = { x0: 1e9, y0: 1e9, x1: -1e9, y1: -1e9 }; cs.forEach(c => { const q = compBBox(c); b.x0 = Math.min(b.x0, q.x - 30); b.y0 = Math.min(b.y0, q.y - 30); b.x1 = Math.max(b.x1, q.x + q.w + 30); b.y1 = Math.max(b.y1, q.y + q.h + 30); });
    if (!cs.length) b = { x0: 0, y0: 0, x1: FRAME.w, y1: FRAME.h };
    const s = clamp(Math.min((r.width - 16) / (b.x1 - b.x0), (r.height - 16) / (b.y1 - b.y0)), 0.08, 2);
    this.view = { s, ox: (r.width - (b.x1 - b.x0) * s) / 2 - b.x0 * s, oy: (r.height - (b.y1 - b.y0) * s) / 2 - b.y0 * s };
  },
  render() {
    if (!this.mode) return; const cv2 = this.cv, r = cv2.getBoundingClientRect(); if (cv2.width !== Math.round(r.width * DPR)) this.resize();
    if ($('#p2sel').options.length !== App.sheets.length) this.options();
    const g = cv2.getContext('2d'), v = this.view; g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#eef1f5'; g.fillRect(0, 0, cv2.width, cv2.height);
    g.setTransform(DPR * v.s, 0, 0, DPR * v.s, DPR * v.ox, DPR * v.oy);
    const k = App.sheet, fr = App.opts.frame; App.sheet = this.sheet; App.opts.frame = false;
    try {
      drawScene(g, Sim.S, false);
      if (Sim.S && this.hover) { const c = App.byId(this.hover); if (c && (c.sheet || 0) === this.sheet && DEFS[c.type].press) { const b = compBBox(c); g.strokeStyle = 'rgba(15,98,254,.5)'; g.lineWidth = 1.5 / v.s; g.strokeRect(b.x - 5, b.y - 5, b.w + 10, b.h + 10); } }
    } finally { App.sheet = k; App.opts.frame = fr; }
  }
};
let last = performance.now(), acc = 0, probeT = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (Sim.S && App.running) { acc += dt * App.speed; let n = 0; while (acc >= DT && n < 40) { Sim.tick(); Plot.sample(); acc -= DT; n++; } if (n >= 40) acc = 0; }
  if (Sim.S) { $('#simtime').textContent = fmt(Sim.S.t, 2) + ' s'; const b = $('#banner'); b.style.display = Sim.S.banner ? 'block' : 'none'; b.textContent = Sim.S.banner; } else { $('#simtime').textContent = '0.00 s'; $('#banner').style.display = 'none'; }
  render(); View2.render(); Plot.draw();
  if (now - probeT > 250) { probeT = now; Props.probe(); }
  requestAnimationFrame(loop);
}
