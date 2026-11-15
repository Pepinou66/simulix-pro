'use strict';
/* =====================================================================
   Circuit imprimé (PCB, esprit Proteus/ARES) à partir du schéma électronique :
   empreintes, chevelu (ratsnest), pistes 2 couches, vias, contour de carte,
   vérification des règles (DRC) et export de fabrication Gerber + perçage.
   Unités : millimètres. Origine : coin haut-gauche de la carte.
   ===================================================================== */
const MIL = 0.0254;
// empreintes : pastilles { p: port du composant, x, y (mm), d: diamètre, h: perçage, sq: carrée }, silk : tracés de sérigraphie
const FOOT = {
  axial400: { name: 'Axial 10,16 mm (0,4")', pads: [{ p: 0, x: 0, y: 0 }, { p: 1, x: 10.16, y: 0 }], silk: [['r', 2, -1.2, 6.16, 2.4]] },
  cap100: { name: 'Céramique 5,08 mm', pads: [{ p: 0, x: 0, y: 0 }, { p: 1, x: 5.08, y: 0 }], silk: [['r', -0.6, -1.4, 6.28, 2.8]] },
  radial200: { name: 'Radial Ø6,3 pas 2,54', pads: [{ p: 0, x: 0, y: 0, sq: 1 }, { p: 1, x: 2.54, y: 0 }], silk: [['c', 1.27, 0, 3.2], ['t', -2.4, -2.6, '+']] },
  led5: { name: 'LED 5 mm', pads: [{ p: 0, x: 0, y: 0, sq: 1 }, { p: 1, x: 2.54, y: 0 }], silk: [['c', 1.27, 0, 2.9]] },
  to92: { name: 'TO-92', pads: [{ p: 'c', x: 0, y: 0 }, { p: 'b', x: 2.54, y: 0 }, { p: 'e', x: 5.08, y: 0 }], silk: [['r', -0.8, -1.8, 6.7, 3.4]] },
  to220: { name: 'TO-220 (G D S)', pads: [{ p: 'g', x: 0, y: 0 }, { p: 'd', x: 2.54, y: 0 }, { p: 's', x: 5.08, y: 0 }], silk: [['r', -2.4, -2, 9.9, 4.6]] },
  pot3: { name: 'Potentiomètre 3 broches', pads: [{ p: '1', x: 0, y: 0 }, { p: 'w', x: 2.54, y: 0 }, { p: '2', x: 5.08, y: 0 }], silk: [['r', -2.5, -3, 10.1, 6]] },
  conn2: { name: 'Bornier à vis 2 pts 5,08', pads: [{ p: 0, x: 0, y: 0, sq: 1, d: 2.4, h: 1.3 }, { p: 1, x: 5.08, y: 0, d: 2.4, h: 1.3 }], silk: [['r', -2.5, -3.5, 10.1, 7]] },
  sw2: { name: 'Bouton / interrupteur 2 broches', pads: [{ p: 0, x: 0, y: 0 }, { p: 1, x: 6.5, y: 0 }], silk: [['r', -0.5, -3.2, 7.5, 6.4], ['c', 3.25, 0, 1.8]] },
  dip8: { name: 'DIP-8', pads: [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({ p: n, x: n <= 4 ? 0 : 7.62, y: n <= 4 ? (n - 1) * 2.54 : (8 - n) * 2.54, sq: n === 1 })), silk: [['r', 1.3, -1.3, 5, 10.2], ['c', 3.81, -1.3, 0.8]] }
};
// broches DIP-8 → orifices du schéma
const DIPMAP = { e555: { 1: 'gnd', 2: 'tr', 3: 'out', 6: 'th', 7: 'dis', 8: 'vcc' }, eaop: { 2: 'm', 3: 'p', 6: 'o' } };

const Pcb = {
  view: { s: 6, ox: 60, oy: 60 }, tool: 'sel', layer: 'T', width: 0.6, sel: null, drag: null, route: null, real: false, drc: [], hover: null,
  get B() { if (!App.pcb) App.pcb = { w: 80, h: 60, parts: {}, tracks: [], vias: [] }; return App.pcb; },
  footOf(c) { const d = DEFS[c.type]; if (!d.fp) return null; const f = typeof d.fp === 'function' ? d.fp(c) : d.fp; return FOOT[f] ? f : null; },
  portOf(c, pad) { // port du schéma pour une pastille
    if (DIPMAP[c.type]) return DIPMAP[c.type][pad.p] || null;
    return typeof pad.p === 'number' ? (compPorts(c)[pad.p] || {}).id || null : pad.p;
  },
  /* ---------- équipotentielles issues du schéma ---------- */
  nets() {
    const par = new Map(), f = k => { while (par.has(k) && par.get(k) !== k) k = par.get(k); return k; }, u = (a, b) => { a = f(a); b = f(b); if (a !== b) par.set(a, b); };
    App.wires.filter(w => w.kind === 'n' || w.kind === 'x').forEach(w => u(w.a.c + ':' + w.a.p, w.b.c + ':' + w.b.p));
    App.comps.forEach(c => { if (c.type === 'eam') u(c.id + ':p', c.id + ':m'); });
    const offs = {}; App.comps.filter(c => c.type === 'offpage').forEach(c => { const k = c.props.tag; if (offs[k]) u(offs[k], c.id + ':n'); else offs[k] = c.id + ':n'; });
    const name = new Map(); let i = 1;
    App.comps.forEach(c => { if (c.type === 'egnd') name.set(f(c.id + ':g'), 'GND'); });
    App.comps.forEach(c => { if (c.type === 'ebat') { const r = f(c.id + ':p'); if (!name.has(r)) name.set(r, (c.props.tag || 'VCC') + '+'); } });
    return { of: (c, p) => { const r = f(c.id + ':' + p); if (!name.has(r)) name.set(r, 'N' + (i++)); return name.get(r); } };
  },
  pads() { // toutes les pastilles placées (coordonnées carte)
    const B = this.B, nets = this.nets(), out = [];
    App.comps.forEach(c => { const fp = this.footOf(c), pl = B.parts[c.id]; if (!fp || !pl) return;
      FOOT[fp].pads.forEach((pd, i) => { const q = this.rot(pd.x, pd.y, pl.rot || 0), port = this.portOf(c, pd);
        out.push({ c, i, x: pl.x + q.x, y: pl.y + q.y, d: pd.d || 1.8, h: pd.h || 0.9, sq: !!pd.sq, port, net: port ? nets.of(c, port) : '' }); }); });
    return out;
  },
  rot(x, y, r) { for (let i = 0; i < (r || 0); i++) { const t = x; x = -y; y = t; } return { x, y }; },
  /* ---------- mise à jour depuis le schéma ---------- */
  sync() {
    const B = this.B, ids = new Set(); let x = 6, y = 8, rowH = 0, added = 0;
    App.comps.forEach(c => { if (!this.footOf(c)) return; ids.add(c.id); if (B.parts[c.id]) return;
      const fp = FOOT[this.footOf(c)], w = Math.max(...fp.pads.map(p => p.x)) + 6, h = Math.max(...fp.pads.map(p => p.y)) + 6;
      if (x + w > B.w - 4) { x = 6; y += rowH + 4; rowH = 0; } B.parts[c.id] = { x: Math.round(x / 1.27) * 1.27, y: Math.round(y / 1.27) * 1.27, rot: 0 }; x += w + 4; rowH = Math.max(rowH, h); added++; });
    Object.keys(B.parts).forEach(id => { if (!ids.has(id)) delete B.parts[id]; });
    if (added) toast(added + ' empreinte(s) ajoutée(s) — placez-les sur la carte puis tracez les pistes en suivant le chevelu');
  },
  /* ---------- connexité (pistes, vias, pastilles) ---------- */
  connect() {
    const B = this.B, P = this.pads(), items = [...P.map(p => ({ t: 'p', o: p })), ...B.tracks.map(t => ({ t: 't', o: t })), ...B.vias.map(v => ({ t: 'v', o: v }))];
    const par = items.map((_, i) => i), f = i => { while (par[i] !== i) i = par[i] = par[par[i]]; return i; }, u = (a, b) => { a = f(a); b = f(b); if (a !== b) par[a] = b; };
    const near = (q, x, y, r) => Math.hypot(q.x - x, q.y - y) <= r;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const A = items[i], C = items[j]; let hit = false;
      const pt = (it, l) => it.t === 'p' || it.t === 'v' || it.o.l === l;
      if (A.t === 't' && C.t === 't') { if (A.o.l !== C.o.l) continue; const r = (A.o.w + C.o.w) / 2 * 0.9; hit = segDist(A.o.a, A.o.b, C.o.a) <= r || segDist(A.o.a, A.o.b, C.o.b) <= r || segDist(C.o.a, C.o.b, A.o.a) <= r || segDist(C.o.a, C.o.b, A.o.b) <= r; }
      else if (A.t === 't' || C.t === 't') { const T = A.t === 't' ? A.o : C.o, O = A.t === 't' ? C.o : A.o, r = (O.d || 0.8) / 2 + T.w / 2 * 0.5; hit = segDist(T.a, T.b, O) <= r; }
      else { hit = near(A.o, C.o.x, C.o.y, ((A.o.d || 0.8) + (C.o.d || 0.8)) / 2 * 0.95); }
      if (hit) u(i, j);
    }
    return { P, items, f };
  },
  ratsnest() { // liaisons restant à router : arbre de poids minimal entre îlots d'une même équipotentielle
    const { P, items, f } = this.connect(), byNet = {}, lines = [];
    P.forEach((p, i) => { if (!p.net) return; (byNet[p.net] = byNet[p.net] || []).push({ p, g: f(i) }); });
    for (const net in byNet) { const L = byNet[net]; const groups = [...new Set(L.map(q => q.g))]; if (groups.length < 2) continue;
      const done = new Set([groups[0]]);
      while (done.size < groups.length) { let best = null; L.forEach(a => { if (!done.has(a.g)) return; L.forEach(b => { if (done.has(b.g)) return; const d = Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y); if (!best || d < best.d) best = { a: a.p, b: b.p, d, g: b.g }; }); }); if (!best) break; done.add(best.g); lines.push(best); } }
    // courts-circuits : pastilles de nets différents reliées
    const shorts = []; const gNet = {}; P.forEach((p, i) => { if (!p.net) return; const g = f(i); if (gNet[g] && gNet[g] !== p.net) shorts.push([gNet[g], p.net, p]); else gNet[g] = p.net; });
    return { lines, shorts };
  },
  drcRun() {
    const B = this.B, P = this.pads(), clr = 0.25, out = [], { shorts, lines } = this.ratsnest();
    shorts.forEach(([a, b, p]) => out.push({ x: p.x, y: p.y, m: 'Court-circuit entre ' + a + ' et ' + b }));
    // net d'une piste : celui de la pastille qu'elle touche
    const netOfTrack = t => { const p = P.find(p => segDist(t.a, t.b, p) <= p.d / 2 + t.w / 2); return p ? p.net : null; };
    B.tracks.forEach(t => { const tn = netOfTrack(t);
      P.forEach(p => { if (tn && p.net === tn) return; if (segDist(t.a, t.b, p) <= p.d / 2 + t.w / 2) return; const g = segDist(t.a, t.b, p) - p.d / 2 - t.w / 2; if (g < clr) out.push({ x: p.x, y: p.y, m: 'Isolement ' + fmt(g, 2) + ' mm < ' + clr + ' mm (piste / pastille ' + (p.c.props.tag || '') + ')' }); });
      if (t.w < 0.25) out.push({ x: t.a.x, y: t.a.y, m: 'Piste trop fine (' + t.w + ' mm < 0,25 mm)' }); });
    P.forEach(p => { if (p.x < 1 || p.y < 1 || p.x > B.w - 1 || p.y > B.h - 1) out.push({ x: p.x, y: p.y, m: 'Pastille hors de la carte (' + (p.c.props.tag || '') + ')' }); });
    for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) { const a = P[i], b = P[j]; if (a.c === b.c) continue; const g = Math.hypot(a.x - b.x, a.y - b.y) - (a.d + b.d) / 2; if (g < clr) out.push({ x: a.x, y: a.y, m: 'Pastilles trop proches : ' + a.c.props.tag + ' / ' + b.c.props.tag }); }
    this.drc = out; this.render();
    const msg = out.length ? out.length + ' erreur(s) de règles' : 'Aucune erreur de règles'; return msg + (lines.length ? ' — ' + lines.length + ' liaison(s) non routée(s)' : ' — routage complet ✔');
  },
  /* ---------- export de fabrication (Gerber RS-274X + perçage Excellon) ---------- */
  gerber() {
    const B = this.B, P = this.pads(), Y = y => B.h - y, n = v => Math.round(v * 1e6), co = (x, y) => 'X' + n(x) + 'Y' + n(Y(y));
    const head = (fn) => ['G04 Simulix Pro - ' + (App.project.name || 'carte').replace(/[^\x20-\x7e]/g, '_') + '*', '%TF.FileFunction,' + fn + '*%', '%FSLAX46Y46*%', '%MOMM*%', '%LPD*%'];
    const layer = (fn, side, mask) => {
      const L = head(fn), ap = new Map(); let dn = 10; const A = (shape, s) => { const k = shape + s; if (!ap.has(k)) { ap.set(k, dn); L.push('%ADD' + dn + (shape === 'C' ? 'C,' : 'R,') + s.toFixed(3) + (shape === 'R' ? 'X' + s.toFixed(3) : '') + '*%'); dn++; } return ap.get(k); };
      const ex = mask ? 0.1 : 0, cmds = [];
      P.forEach(p => cmds.push(['D' + A(p.sq ? 'R' : 'C', p.d + ex), co(p.x, p.y) + 'D03*']));
      B.vias.forEach(v => cmds.push(['D' + A('C', (v.d || 0.8) + ex), co(v.x, v.y) + 'D03*']));
      if (!mask) B.tracks.filter(t => t.l === side).forEach(t => { cmds.push(['D' + A('C', t.w), co(t.a.x, t.a.y) + 'D02*']); cmds.push([null, co(t.b.x, t.b.y) + 'D01*']); });
      let cur = null; cmds.forEach(([d, s]) => { if (d && d !== cur) { L.push(d + '*'); cur = d; } L.push(s); }); L.push('M02*'); return L.join('\n');
    };
    const silk = () => { const L = head('Legend,Top'); L.push('%ADD10C,0.150*%', 'D10*');
      App.comps.forEach(c => { const fp = this.footOf(c), pl = B.parts[c.id]; if (!fp || !pl) return; const T = (x, y) => { const q = this.rot(x, y, pl.rot); return { x: pl.x + q.x, y: pl.y + q.y }; };
        FOOT[fp].silk.forEach(s => { if (s[0] === 'r') { const pts = [T(s[1], s[2]), T(s[1] + s[3], s[2]), T(s[1] + s[3], s[2] + s[4]), T(s[1], s[2] + s[4]), T(s[1], s[2])]; pts.forEach((q, i) => L.push(co(q.x, q.y) + (i ? 'D01*' : 'D02*'))); }
          if (s[0] === 'c') { for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2, q = T(s[1] + s[3] * Math.cos(a), s[2] + s[3] * Math.sin(a)); L.push(co(q.x, q.y) + (i ? 'D01*' : 'D02*')); } } }); });
      L.push('M02*'); return L.join('\n'); };
    const outline = () => { const L = head('Profile,NP'); L.push('%ADD10C,0.100*%', 'D10*', co(0, 0) + 'D02*', co(B.w, 0) + 'D01*', co(B.w, B.h) + 'D01*', co(0, B.h) + 'D01*', co(0, 0) + 'D01*', 'M02*'); return L.join('\n'); };
    const drill = () => { const tools = new Map(); [...P.map(p => ({ x: p.x, y: p.y, h: p.h })), ...B.vias.map(v => ({ x: v.x, y: v.y, h: v.h || 0.4 }))].forEach(q => { const k = q.h.toFixed(2); if (!tools.has(k)) tools.set(k, []); tools.get(k).push(q); });
      const L = ['M48', '; Simulix Pro - drill', 'METRIC,TZ']; let t = 1; const ids = []; tools.forEach((_, k) => { L.push('T' + t + 'C' + k); ids.push([t++, k]); }); L.push('%', 'G90', 'G05');
      ids.forEach(([i, k]) => { L.push('T' + i); tools.get(k).forEach(q => L.push('X' + q.x.toFixed(3) + 'Y' + Y(q.y).toFixed(3))); }); L.push('M30'); return L.join('\n'); };
    const base = (App.project.name || 'carte').replace(/[^\w-]+/g, '_');
    return [[base + '-F_Cu.gtl', layer('Copper,L1,Top', 'T')], [base + '-B_Cu.gbl', layer('Copper,L2,Bot', 'B')], [base + '-F_Mask.gts', layer('Soldermask,Top', 'T', true)], [base + '-B_Mask.gbs', layer('Soldermask,Bot', 'B', true)],
      [base + '-F_Silk.gto', silk()], [base + '-Edge_Cuts.gko', outline()], [base + '.drl', drill()]];
  },
  exportZip() {
    const files = this.gerber(), zip = makeZip(files.map(([n, t]) => [n, new TextEncoder().encode(t)])), name = (App.project.name || 'carte').replace(/[^\w-]+/g, '_') + '_gerber.zip';
    let bin = ''; for (let i = 0; i < zip.length; i++) bin += String.fromCharCode(zip[i]); const url = 'data:application/zip;base64,' + btoa(bin);
    if (NATIVE && NATIVE.saveDataURL) NATIVE.saveDataURL(name, url); else { const a = document.createElement('a'); a.href = url; a.download = name; a.click(); }
    toast('Fichiers de fabrication exportés (' + files.length + ' fichiers Gerber / perçage)');
  },
  /* ---------- interface ---------- */
  open() {
    if (!App.comps.some(c => this.footOf(c))) { toast('Ajoutez d\'abord des composants électroniques au schéma (bibliothèque « Électronique »)'); }
    this.build(); this.sync(); $('#pcbWin').style.display = 'flex'; this.fit(); this.render(); this.status();
  },
  close() { $('#pcbWin').style.display = 'none'; this.route = null; App.changed(); },
  build() {
    if ($('#pcbWin')) return;
    const w = document.createElement('div'); w.id = 'pcbWin';
    w.innerHTML = `<div class="pcbbar">
      <b style="color:#e2e8f0;margin-right:6px">▦ Circuit imprimé</b>
      <button class="tb on" data-t="sel" title="Sélectionner / déplacer les composants (R : pivoter)">⬚ Placer</button>
      <button class="tb" data-t="track" title="Tracer une piste : clic sur une pastille, clics pour les coudes, double-clic ou pastille pour finir">╱ Piste</button>
      <button class="tb" data-t="via" title="Poser un via (passage entre les deux faces)">◎ Via</button>
      <button class="tb" data-t="del" title="Supprimer une piste ou un via">✖ Effacer</button>
      <select id="pcbLayer" title="Couche"><option value="T">Face composants (rouge)</option><option value="B">Face soudure (bleu)</option></select>
      <label>Largeur <select id="pcbW"><option>0.3</option><option>0.4</option><option selected>0.6</option><option>0.8</option><option>1.0</option><option>1.5</option></select> mm</label>
      <label>Carte <input id="pcbBW" type="number" step="1" style="width:52px"> × <input id="pcbBH" type="number" step="1" style="width:52px"> mm</label>
      <button class="tb" id="pcbSync" title="Ajouter / retirer les empreintes selon le schéma">⟳ Depuis le schéma</button>
      <button class="tb" id="pcbDrc" title="Vérification des règles de conception">✔ DRC</button>
      <button class="tb" id="pcbReal" title="Aperçu de la carte fabriquée">👁 Aperçu</button>
      <button class="tb" id="pcbGerber" title="Fichiers Gerber + perçage pour le fabricant (JLCPCB, PCBWay…)">⇩ Gerber</button>
      <span id="pcbStat" style="color:#94a3b8;font-size:12px;margin-left:auto"></span>
      <button class="tb" id="pcbClose">✕ Fermer</button></div>
      <div style="position:relative;flex:1;min-height:0"><canvas id="pcbCv"></canvas><div id="pcbDrcList"></div></div>`;
    document.body.appendChild(w);
    const cv = $('#pcbCv'); this.cv = cv;
    w.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { this.tool = b.dataset.t; this.route = null; w.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); this.render(); });
    $('#pcbLayer').onchange = e => { this.layer = e.target.value; this.render(); };
    $('#pcbW').onchange = e => { this.width = +e.target.value; };
    $('#pcbBW').onchange = e => { this.B.w = Math.max(10, +e.target.value || 80); this.render(); }; $('#pcbBH').onchange = e => { this.B.h = Math.max(10, +e.target.value || 60); this.render(); };
    $('#pcbSync').onclick = () => { this.sync(); this.render(); this.status(); };
    $('#pcbDrc').onclick = () => { const m = this.drcRun(); toast(m); this.drcList(); };
    $('#pcbReal').onclick = () => { this.real = !this.real; $('#pcbReal').classList.toggle('on', this.real); this.render(); };
    $('#pcbGerber').onclick = () => this.exportZip();
    $('#pcbClose').onclick = () => this.close();
    new ResizeObserver(() => this.render()).observe(cv.parentElement);
    const wp = e => { const r = cv.getBoundingClientRect(), v = this.view; return { x: (e.clientX - r.left - v.ox) / v.s, y: (e.clientY - r.top - v.oy) / v.s }; };
    const G = 0.635, sn = v => Math.round(v / G) * G;
    cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top, v = this.view, f = e.deltaY < 0 ? 1.15 : 1 / 1.15, ns = clamp(v.s * f, 1, 60); v.ox = mx - (mx - v.ox) * ns / v.s; v.oy = my - (my - v.oy) * ns / v.s; v.s = ns; this.render(); }, { passive: false });
    cv.addEventListener('contextmenu', e => { e.preventDefault(); if (this.route) { this.route = null; this.render(); } });
    cv.addEventListener('pointerdown', e => {
      cv.setPointerCapture(e.pointerId); const p = wp(e), B = this.B;
      if (e.button === 1 || e.button === 2 || (e.button === 0 && e.altKey)) { this.drag = { pan: 1, sx: e.clientX, sy: e.clientY, ox: this.view.ox, oy: this.view.oy }; return; }
      if (this.tool === 'sel') { const c = this.partAt(p); this.sel = c ? c.id : null; if (c) { const pl = B.parts[c.id]; this.drag = { part: pl, dx: p.x - pl.x, dy: p.y - pl.y }; } else this.drag = { pan: 1, sx: e.clientX, sy: e.clientY, ox: this.view.ox, oy: this.view.oy }; this.render(); return; }
      if (this.tool === 'via') { B.vias.push({ x: sn(p.x), y: sn(p.y), d: 0.9, h: 0.4 }); this.render(); this.status(); return; }
      if (this.tool === 'del') { const t = B.tracks.findIndex(t => segDist(t.a, t.b, p) <= t.w / 2 + 0.3); if (t >= 0) B.tracks.splice(t, 1); else { const v = B.vias.findIndex(v => Math.hypot(v.x - p.x, v.y - p.y) < 0.8); if (v >= 0) B.vias.splice(v, 1); } this.render(); this.status(); return; }
      if (this.tool === 'track') {
        const pad = this.padAt(p), q = pad ? { x: pad.x, y: pad.y } : this.route ? this.constrain(this.route.last, { x: sn(p.x), y: sn(p.y) }) : { x: sn(p.x), y: sn(p.y) };
        if (!this.route) { this.route = { last: q, net: pad ? pad.net : null }; return; }
        const a = this.route.last; if (a.x !== q.x || a.y !== q.y) B.tracks.push({ l: this.layer, w: this.width, a: { ...a }, b: { ...q } });
        this.route.last = q; if (pad) this.route = null; this.render(); this.status();
      }
    });
    cv.addEventListener('dblclick', () => { if (this.route) { this.route = null; this.render(); } });
    cv.addEventListener('pointermove', e => {
      const p = wp(e); this.mouse = p; const d = this.drag;
      if (d && d.pan) { this.view.ox = d.ox + e.clientX - d.sx; this.view.oy = d.oy + e.clientY - d.sy; this.render(); return; }
      if (d && d.part) { d.part.x = Math.round((p.x - d.dx) / 1.27) * 1.27; d.part.y = Math.round((p.y - d.dy) / 1.27) * 1.27; this.render(); return; }
      this.hover = this.padAt(p); if (this.route || this.tool !== 'sel') this.render();
    });
    cv.addEventListener('pointerup', () => { if (this.drag && this.drag.part) this.status(); this.drag = null; });
    document.addEventListener('keydown', e => {
      if ($('#pcbWin').style.display !== 'flex' || /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') { if (this.route) this.route = null; else this.close(); }
      if (k === 'r' && this.sel) { const pl = this.B.parts[this.sel]; pl.rot = ((pl.rot || 0) + 1) % 4; this.status(); }
      if (k === 'l' || k === 'v') { this.layer = this.layer === 'T' ? 'B' : 'T'; $('#pcbLayer').value = this.layer; if (k === 'v' && this.route) this.B.vias.push({ x: this.route.last.x, y: this.route.last.y, d: 0.9, h: 0.4 }); }
      if ((k === 'delete' || k === 'backspace') && this.sel) { toast('Supprimez le composant dans le schéma pour retirer son empreinte'); }
      this.render(); e.stopPropagation();
    }, true);
  },
  constrain(a, b) { // 0°, 45° ou 90°
    const dx = b.x - a.x, dy = b.y - a.y, ad = Math.abs(dx), bd = Math.abs(dy);
    if (ad > bd * 2.414) return { x: b.x, y: a.y }; if (bd > ad * 2.414) return { x: a.x, y: b.y }; const m = Math.max(ad, bd); return { x: a.x + Math.sign(dx) * m, y: a.y + Math.sign(dy) * m };
  },
  partAt(p) { const B = this.B; return App.comps.slice().reverse().find(c => { const pl = B.parts[c.id], fp = this.footOf(c); if (!pl || !fp) return false; const bb = this.partBox(c, pl, fp); return p.x >= bb.x0 && p.x <= bb.x1 && p.y >= bb.y0 && p.y <= bb.y1; }); },
  partBox(c, pl, fp) { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const F = FOOT[fp]; const add = (x, y) => { const q = this.rot(x, y, pl.rot); x0 = Math.min(x0, pl.x + q.x); x1 = Math.max(x1, pl.x + q.x); y0 = Math.min(y0, pl.y + q.y); y1 = Math.max(y1, pl.y + q.y); };
    F.pads.forEach(p => { add(p.x - 1.2, p.y - 1.2); add(p.x + 1.2, p.y + 1.2); }); F.silk.forEach(s => { if (s[0] === 'r') { add(s[1], s[2]); add(s[1] + s[3], s[2] + s[4]); } if (s[0] === 'c') { add(s[1] - s[3], s[2] - s[3]); add(s[1] + s[3], s[2] + s[3]); } }); return { x0, y0, x1, y1 }; },
  padAt(p) { return this.pads().find(q => Math.hypot(q.x - p.x, q.y - p.y) <= q.d / 2 + 0.2) || null; },
  fit() { const cv = this.cv, r = cv.parentElement.getBoundingClientRect(), B = this.B, s = Math.min((r.width - 40) / B.w, (r.height - 40) / B.h); this.view = { s, ox: (r.width - B.w * s) / 2, oy: (r.height - B.h * s) / 2 }; $('#pcbBW').value = B.w; $('#pcbBH').value = B.h; },
  status() { const { lines, shorts } = this.ratsnest(), B = this.B; $('#pcbStat').textContent = Object.keys(B.parts).length + ' empreintes · ' + B.tracks.length + ' segments · ' + B.vias.length + ' vias · ' + (lines.length ? lines.length + ' liaison(s) à router' : 'routage complet ✔') + (shorts.length ? ' · ⚠ ' + shorts.length + ' court-circuit(s)' : ''); },
  drcList() { const el = $('#pcbDrcList'); el.innerHTML = this.drc.length ? '<b>DRC</b>' + this.drc.slice(0, 30).map(d => '<div>• ' + esc(d.m) + '</div>').join('') : ''; el.style.display = this.drc.length ? 'block' : 'none'; },
  render() {
    const cv = this.cv; if (!cv || $('#pcbWin').style.display !== 'flex') return; const r = cv.parentElement.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    cv.width = r.width * dpr; cv.height = r.height * dpr; cv.style.width = r.width + 'px'; cv.style.height = r.height + 'px';
    const g = cv.getContext('2d'), v = this.view, B = this.B, real = this.real; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = real ? '#1f2937' : '#0b1020'; g.fillRect(0, 0, r.width, r.height);
    g.translate(v.ox, v.oy); g.scale(v.s, v.s);
    // carte
    g.fillStyle = real ? '#14532d' : '#0f172a'; g.fillRect(0, 0, B.w, B.h); g.strokeStyle = '#facc15'; g.lineWidth = 0.15; g.strokeRect(0, 0, B.w, B.h);
    if (!real) { g.fillStyle = 'rgba(148,163,184,.18)'; for (let x = 0; x <= B.w; x += 2.54) for (let y = 0; y <= B.h; y += 2.54) g.fillRect(x - 0.05, y - 0.05, 0.1, 0.1); }
    const cu = l => real ? (l === 'T' ? '#16a34a' : 'rgba(22,163,74,.35)') : l === 'T' ? 'rgba(220,38,38,.85)' : 'rgba(37,99,235,.8)';
    const order = this.layer === 'T' ? ['B', 'T'] : ['T', 'B'];
    order.forEach(l => B.tracks.filter(t => t.l === l).forEach(t => { g.strokeStyle = cu(l); g.lineWidth = t.w; g.lineCap = 'round'; g.beginPath(); g.moveTo(t.a.x, t.a.y); g.lineTo(t.b.x, t.b.y); g.stroke(); }));
    // empreintes : sérigraphie + pastilles
    App.comps.forEach(c => { const fp = this.footOf(c), pl = B.parts[c.id]; if (!fp || !pl) return; const F = FOOT[fp];
      g.save(); g.translate(pl.x, pl.y); for (let i = 0; i < (pl.rot || 0); i++) g.rotate(Math.PI / 2);
      g.strokeStyle = real ? '#f8fafc' : this.sel === c.id ? '#38bdf8' : '#e2e8f0'; g.lineWidth = 0.15; g.fillStyle = g.strokeStyle;
      F.silk.forEach(s => { if (s[0] === 'r') g.strokeRect(s[1], s[2], s[3], s[4]); if (s[0] === 'c') { g.beginPath(); g.arc(s[1], s[2], s[3], 0, 7); g.stroke(); } if (s[0] === 't') { g.font = '1.4px sans-serif'; g.fillText(s[3], s[1], s[2]); } });
      g.restore(); const bb = this.partBox(c, pl, fp); g.fillStyle = real ? '#f8fafc' : '#e2e8f0'; g.font = '600 1.3px system-ui'; g.textAlign = 'left'; g.fillText(c.props.tag || '', bb.x0, bb.y0 - 0.4);
    });
    const P = this.pads();
    P.forEach(p => { g.fillStyle = real ? '#d4a017' : (this.hover === p || (this.route && this.route.net && p.net === this.route.net)) ? '#fde68a' : '#c9a227'; if (p.sq) g.fillRect(p.x - p.d / 2, p.y - p.d / 2, p.d, p.d); else { g.beginPath(); g.arc(p.x, p.y, p.d / 2, 0, 7); g.fill(); } g.fillStyle = real ? '#1f2937' : '#0b1020'; g.beginPath(); g.arc(p.x, p.y, p.h / 2, 0, 7); g.fill(); });
    B.vias.forEach(q => { g.fillStyle = real ? '#d4a017' : '#a3a3a3'; g.beginPath(); g.arc(q.x, q.y, (q.d || 0.9) / 2, 0, 7); g.fill(); g.fillStyle = '#0b1020'; g.beginPath(); g.arc(q.x, q.y, (q.h || 0.4) / 2, 0, 7); g.fill(); });
    if (!real) { const { lines } = this.ratsnest(); g.strokeStyle = 'rgba(250,250,210,.75)'; g.lineWidth = 0.08; lines.forEach(l => { g.beginPath(); g.moveTo(l.a.x, l.a.y); g.lineTo(l.b.x, l.b.y); g.stroke(); }); }
    if (this.route && this.mouse) { const q = this.constrain(this.route.last, { x: Math.round(this.mouse.x / 0.635) * 0.635, y: Math.round(this.mouse.y / 0.635) * 0.635 }); g.strokeStyle = cu(this.layer); g.globalAlpha = 0.6; g.lineWidth = this.width; g.beginPath(); g.moveTo(this.route.last.x, this.route.last.y); g.lineTo(q.x, q.y); g.stroke(); g.globalAlpha = 1; }
    this.drc.forEach(d => { g.strokeStyle = '#f43f5e'; g.lineWidth = 0.2; g.beginPath(); g.arc(d.x, d.y, 1.6, 0, 7); g.stroke(); });
    if (this.hover && !real) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = 'rgba(15,23,42,.9)'; g.fillRect(8, r.height - 30, 340, 22); g.fillStyle = '#e2e8f0'; g.font = '12px system-ui'; g.textAlign = 'left'; g.fillText((this.hover.c.props.tag || '') + ' · broche ' + (this.hover.port || '—') + ' · équipotentielle ' + (this.hover.net || 'non connectée'), 14, r.height - 15); }
  }
};
function segDist(a, b, p) { const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy; let t = l ? ((p.x - a.x) * dx + (p.y - a.y) * dy) / l : 0; t = clamp(t, 0, 1); return Math.hypot(a.x + t * dx - p.x, a.y + t * dy - p.y); }
// archive ZIP sans compression (STORE)
function makeZip(files) {
  const crcT = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc = d => { let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = crcT[(c ^ d[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const parts = [], cen = []; let off = 0; const enc = new TextEncoder();
  const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  for (const [name, data] of files) { const nm = enc.encode(name), c = crc(data);
    const loc = [...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0)];
    parts.push(new Uint8Array(loc), nm, data);
    cen.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(data.length), ...u32(data.length), ...u16(nm.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), nm);
    off += loc.length + nm.length + data.length; }
  const cs = cen.reduce((s, a) => s + a.length, 0), end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cs), ...u32(off), ...u16(0)]);
  const all = [...parts, ...cen, end], out = new Uint8Array(all.reduce((s, a) => s + a.length, 0)); let p = 0; all.forEach(a => { out.set(a, p); p += a.length; }); return out;
}
