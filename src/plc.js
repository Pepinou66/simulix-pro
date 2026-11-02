'use strict';
/* =====================================================================
   Automate programmable : exécution Ladder + GRAFCET, éditeurs
   Adresses : I0-7 entrées, Q0-7 sorties, M0-63 mémentos,
              T0-15 temporisations, C0-15 compteurs, X0-63 étapes GRAFCET
   ===================================================================== */
const LCOLS = 8; // 7 colonnes logiques + 1 colonne bobines
const PLC = {
  newProg() { return { rows: 10, cells: {}, vl: {}, sym: {}, cmt: {}, graf: { steps: [], trans: [] } }; },
  init(c) {
    if (!c.props.prog) c.props.prog = this.newProg();
    const s = st(c);
    s.img = { I: Array(8).fill(false), Q: Array(8).fill(false), M: Array(64).fill(false), T: [...Array(16)].map(() => ({ acc: 0, pre: 0, done: false })), C: [...Array(16)].map(() => ({ cv: 0, pre: 0, done: false, pin: false })), X: new Set(), tX: {} };
    s.prev = {}; s.cellPrev = {}; s.pf = {}; s.hwI = Array(8).fill(false); s.force = {};
    (c.props.prog.graf.steps || []).forEach(x => { if (x.init) { s.img.X.add(+x.n); s.img.tX[+x.n] = 0; } });
  },
  parse(a) { const m = /^\s*([IQMTCX])\s*(\d+)\s*$/i.exec(a || ''); return m ? [m[1].toUpperCase(), +m[2]] : null; },
  get(img, a) {
    const p = this.parse(a); if (!p) return false; const [k, n] = p;
    if (k === 'I' || k === 'Q' || k === 'M') return !!img[k][n];
    if (k === 'T') return !!(img.T[n] && img.T[n].done);
    if (k === 'C') return !!(img.C[n] && img.C[n].done);
    if (k === 'X') return img.X.has(n);
    return false;
  },
  set(img, a, v) { const p = this.parse(a); if (!p) return; const [k, n] = p; if ((k === 'Q' || k === 'M') && n < img[k].length) img[k][n] = !!v; },
  scan(c, S, dt) {
    const s = st(c); if (!s.img) this.init(c); const img = s.img, P = c.props.prog;
    if (c.fault === 'stop') { img.Q.fill(false); return; }
    for (let i = 0; i < 8; i++) {
      const v = S.Vd(c, 'I' + i), com = S.Vd(c, 'COM');
      let on = v != null && com != null && v - com >= 12;
      if (s.hwI[i]) on = true;
      if (s.force['I' + i] != null) on = s.force['I' + i];
      img.I[i] = on;
    }
    if (s.proxy) { for (let i = 0; i < 8; i++) img.Q[i] = !!s.proxy[i]; s.pf = {}; return; }
    const prev = s.prev;
    const edge = a => this.get(img, a) && !prev[a];
    const fall = a => !this.get(img, a) && !!prev[a];
    // --- GRAFCET ---
    const G = P.graf, gAct = new Set(), gAddr = new Set();
    if (G && G.steps.length) {
      const fire = [];
      for (const t of G.trans) {
        const from = this.list(t.from); if (!from.length || !from.every(n => img.X.has(n))) continue;
        const f = this.cond(t.cond); if (f.err) continue;
        let ok = false; try { ok = !!f.fn(a => this.get(img, a), edge, fall, n => img.X.has(n) ? (img.tX[n] || 0) : -1); } catch (e) { ok = false; }
        if (ok) fire.push(t);
      }
      if (fire.length) {
        const de = new Set(), ac = new Set(); fire.forEach(t => { this.list(t.from).forEach(n => de.add(n)); this.list(t.to).forEach(n => ac.add(n)); });
        de.forEach(n => { if (!ac.has(n)) img.X.delete(n); }); ac.forEach(n => { if (!img.X.has(n) || de.has(n)) img.tX[n] = 0; img.X.add(n); });
      }
      for (const n of img.X) img.tX[n] = (img.tX[n] || 0) + dt;
      for (const x of G.steps) {
        for (const item of String(x.act || '').split(/[,;]+/)) {
          const m = /^\s*(S|R)?\s*([QM]\d+)\s*$/i.exec(item); if (!m) continue;
          const a = m[2].toUpperCase(); if (!m[1]) gAddr.add(a);
          if (img.X.has(+x.n)) { if (!m[1]) gAct.add(a); else if (m[1].toUpperCase() === 'S') this.set(img, a, true); else this.set(img, a, false); }
        }
      }
    }
    // --- LADDER ---
    const wrote = new Set(); s.pf = {};
    let pow = Array(P.rows).fill(true);
    for (let col = 0; col < LCOLS - 1; col++) {
      const out = Array(P.rows);
      for (let r = 0; r < P.rows; r++) {
        const cell = P.cells[r + ',' + col];
        out[r] = cell ? this.conduct(c, cell, pow[r], r, col, dt) : false;
        if (cell) s.pf[r + ',' + col] = [pow[r], out[r]];
      }
      // jonctions verticales
      const np = out.slice(); let r = 0;
      while (r < P.rows) { let e = r; while (P.vl[e + ',' + col] && e < P.rows - 1) e++; if (e > r) { let v = false; for (let k = r; k <= e; k++) v = v || out[k]; for (let k = r; k <= e; k++) np[k] = v; } r = e + 1; }
      pow = np;
    }
    for (let r = 0; r < P.rows; r++) {
      const cell = P.cells[r + ',' + (LCOLS - 1)]; if (!cell) continue; const p = pow[r]; s.pf[r + ',' + (LCOLS - 1)] = [p, p];
      const a = (cell.a || '').toUpperCase();
      if (cell.t === 'C') { this.set(img, a, p); wrote.add(a); }
      else if (cell.t === 'CN') { this.set(img, a, !p); wrote.add(a); }
      else if (cell.t === 'S' && p) this.set(img, a, true);
      else if (cell.t === 'R' && p) this.set(img, a, false);
      else if (cell.t === 'RES' && p) { const q = this.parse(a); if (q && q[0] === 'C' && img.C[q[1]]) { img.C[q[1]].cv = 0; img.C[q[1]].done = false; } if (q && q[0] === 'T' && img.T[q[1]]) { img.T[q[1]].acc = 0; img.T[q[1]].done = false; } }
    }
    // actions continues du GRAFCET (OU avec les bobines ladder de même adresse)
    gAddr.forEach(a => { const v = gAct.has(a); if (wrote.has(a)) { if (v) this.set(img, a, true); } else this.set(img, a, v); });
    for (let i = 0; i < 8; i++) if (s.force['Q' + i] != null) img.Q[i] = s.force['Q' + i];
    // mémoire des fronts
    const np = {}; ['I', 'Q', 'M'].forEach(k => img[k].forEach((v, i) => np[k + i] = v)); img.T.forEach((t, i) => np['T' + i] = t.done); img.C.forEach((t, i) => np['C' + i] = t.done); img.X.forEach(n => np['X' + n] = true);
    s.prev = np;
  },
  conduct(c, cell, pin, r, col, dt) {
    const s = st(c), img = s.img, a = (cell.a || '').toUpperCase(), key = r + ',' + col;
    switch (cell.t) {
      case 'H': return pin;
      case 'NO': return pin && this.get(img, a);
      case 'NC': return pin && !this.get(img, a);
      case 'P': { const v = this.get(img, a), pv = s.cellPrev[key]; s.cellPrev[key] = v; return pin && v && !pv; }
      case 'N': { const v = this.get(img, a), pv = s.cellPrev[key]; s.cellPrev[key] = v; return pin && !v && !!pv; }
      case 'TON': case 'TOF': case 'TP': {
        const q = this.parse(a); if (!q || q[0] !== 'T') return false; const T = img.T[q[1]]; if (!T) return false; T.pre = +cell.p || 0;
        if (cell.t === 'TON') { T.acc = pin ? T.acc + dt : 0; T.done = pin && T.acc >= T.pre; }
        else if (cell.t === 'TOF') { if (pin) { T.done = true; T.acc = 0; } else if (T.done) { T.acc += dt; if (T.acc >= T.pre) T.done = false; } }
        else { if (pin && !T.pin && !T.done) { T.done = true; T.acc = 0; } if (T.done) { T.acc += dt; if (T.acc >= T.pre) T.done = false; } T.pin = pin; }
        return T.done;
      }
      case 'CTU': case 'CTD': {
        const q = this.parse(a); if (!q || q[0] !== 'C') return false; const C = img.C[q[1]]; if (!C) return false; C.pre = +cell.p || 0;
        if (pin && !C.pin) C.cv += cell.t === 'CTU' ? 1 : -1; C.pin = pin;
        C.done = cell.t === 'CTU' ? C.cv >= C.pre : C.cv <= 0; return C.done;
      }
    }
    return false;
  },
  list(s) { return String(s ?? '').split(/[,;\s]+/).filter(x => x !== '').map(x => +String(x).replace(/^X/i, '')).filter(n => !isNaN(n)); },
  _cc: new Map(),
  cond(expr) {
    expr = String(expr ?? '').trim(); if (this._cc.has(expr)) return this._cc.get(expr);
    let res;
    try {
      const re = /\s*(\d+(?:[.,]\d+)?\s*s\s*\/\s*X\d+|[↑^]\s*[IQMTCX]\d+|↓\s*[IQMTCX]\d+|[IQMTCX]\d+|ET\b|OU\b|NON\b|AND\b|OR\b|NOT\b|=1|[01](?![0-9])|[()!.*&|+/])\s*/giy;
      let js = '', m, pos = 0; if (!expr) throw new Error('Réceptivité vide');
      while (pos < expr.length) {
        re.lastIndex = pos; m = re.exec(expr); if (!m) throw new Error('Symbole inconnu près de « ' + expr.slice(pos, pos + 8) + ' »');
        pos = re.lastIndex; const t = m[1].toUpperCase().replace(/\s+/g, '');
        let tm;
        if ((tm = /^(\d+(?:[.,]\d+)?)S\/X(\d+)$/.exec(t))) js += '(t(' + tm[2] + ')>=' + tm[1].replace(',', '.') + ')';
        else if (/^[↑^]/.test(t)) js += 'e("' + t.slice(1) + '")';
        else if (/^↓/.test(t)) js += 'f("' + t.slice(1) + '")';
        else if (/^[IQMTCX]\d+$/.test(t)) js += 'g("' + t + '")';
        else if (t === 'ET' || t === 'AND' || t === '.' || t === '*' || t === '&') js += '&&';
        else if (t === 'OU' || t === 'OR' || t === '+' || t === '|') js += '||';
        else if (t === 'NON' || t === 'NOT' || t === '!' || t === '/') js += '!';
        else if (t === '1' || t === '=1') js += 'true'; else if (t === '0') js += 'false';
        else js += t;
      }
      const fn = new Function('g', 'e', 'f', 't', 'return (' + js + ');');
      fn(() => false, () => false, () => false, () => -1);
      res = { fn };
    } catch (e) { res = { err: e.message || 'Expression invalide' }; }
    this._cc.set(expr, res); return res;
  }
};

/* ===================== ÉDITEUR AUTOMATE ===================== */
const LTOOLS = [['sel', '⬚ Sélection'], ['NO', '─┤ ├─'], ['NC', '─┤/├─'], ['P', '─┤P├─'], ['N', '─┤N├─'], ['H', '───'], ['TON', 'TON'], ['TOF', 'TOF'], ['TP', 'TP'], ['CTU', 'CTU'], ['CTD', 'CTD'], ['C', '─( )'], ['CN', '─(/)'], ['S', '─(S)'], ['R', '─(R)'], ['RES', '─(RES)'], ['V', '│ Liaison verticale'], ['DEL', '✕ Effacer']];
const COILS = ['C', 'CN', 'S', 'R', 'RES'];
const PE = {
  c: null, tab: 'ladder', tool: 'sel', sel: null, timer: null,
  open(c) {
    this.c = c; if (!c.props.prog) c.props.prog = PLC.newProg(); this.sel = null;
    const dlg = $('#dlg'); dlg.className = 'dlg';
    dlg.innerHTML = `<header><h2>Automate ${esc(c.props.tag)} — Programmation</h2><span id="peRun" class="badge"></span><button class="btn" id="peClose">Fermer</button></header>
      <div class="tabs" id="peTabs">${[['ladder', 'Ladder (LD)'], ['graf', 'GRAFCET (SFC)'], ['sym', 'Mnémoniques'], ['vars', 'Table des variables'], ['hw', 'Matériel E/S']].map(([k, l]) => `<button data-t="${k}">${l}</button>`).join('')}</div>
      <div class="body" id="peBody"></div>`;
    $('#modal').classList.add('open');
    $('#peClose').onclick = () => this.close();
    $('#peTabs').onclick = e => { const t = e.target.dataset.t; if (t) { this.tab = t; this.render(); } };
    this.render();
    clearInterval(this.timer); this.timer = setInterval(() => this.live(), 150);
  },
  close() { clearInterval(this.timer); $('#modal').classList.remove('open'); this.c = null; App.changed(); },
  prog() { return this.c.props.prog; },
  render() {
    document.querySelectorAll('#peTabs button').forEach(b => b.classList.toggle('on', b.dataset.t === this.tab));
    const B = $('#peBody');
    if (this.tab === 'ladder') this.renderLadder(B);
    if (this.tab === 'graf') this.renderGraf(B);
    if (this.tab === 'sym') this.renderSym(B);
    if (this.tab === 'vars') this.renderVars(B);
    if (this.tab === 'hw') HW.render(B, this.c);
    this.live();
  },
  live() {
    if (!this.c) return; const run = !!Sim.S;
    const b = $('#peRun'); if (b) { b.textContent = run ? 'RUN — visualisation dynamique' : 'Hors simulation'; b.className = 'badge ' + (run ? 'ok' : ''); }
    if (!run) return;
    if (this.tab === 'ladder') this.drawGrid();
    if (this.tab === 'graf') this.drawGraf();
    if (this.tab === 'vars') this.renderVars($('#peBody'), true);
  },
  /* ---------- Ladder ---------- */
  renderLadder(B) {
    B.innerHTML = `<div class="ltools" id="lt">${LTOOLS.map(([k, l]) => `<button data-k="${k}" class="${this.tool === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="lwrap"><div class="lgrid" id="lg"></div><div class="lside" id="lside"></div></div>
      <div class="btns"><button class="btn" id="lAdd">+ Ligne à la fin</button><button class="btn" id="lIns">Insérer une ligne au-dessus</button><button class="btn dng" id="lDelRow">Supprimer la ligne</button></div>
      <p class="hint">Choisissez un outil puis cliquez dans la grille. Les bobines se placent automatiquement dans la dernière colonne. La liaison verticale relie la case cliquée à la ligne du dessous (branche parallèle OU). Adresses : I0–I7, Q0–Q7, M0–M63, T0–T15, C0–C15, X0–X63.</p>`;
    $('#lt').onclick = e => { const k = e.target.dataset.k; if (k) { this.tool = k; this.renderLadder(B); } };
    $('#lAdd').onclick = () => { this.prog().rows++; this.drawGrid(); };
    $('#lIns').onclick = () => this.shiftRows(this.sel ? this.sel[0] : 0, 1);
    $('#lDelRow').onclick = () => { if (this.sel) this.shiftRows(this.sel[0], -1); };
    this.drawGrid(); this.drawSide();
  },
  shiftRows(at, d) {
    const P = this.prog(), nc = {}, nv = {};
    const mv = (src, dst) => { for (const k in src) { const [r, c] = k.split(',').map(Number); if (d < 0 && r === at) continue; const nr = r >= at ? r + d : r; if (nr >= 0) dst[nr + ',' + c] = src[k]; } };
    mv(P.cells, nc); mv(P.vl, nv); P.cells = nc; P.vl = nv; P.rows = Math.max(1, P.rows + d); this.sel = null; this.drawGrid(); this.drawSide(); App.changed();
  },
  drawGrid() {
    const g = $('#lg'); if (!g) return; const P = this.prog(), s = this.c.state || {}, pf = Sim.S ? (s.pf || {}) : {};
    let h = '<table>';
    for (let r = 0; r < P.rows; r++) {
      h += `<tr><td class="rn">${r + 1}</td>`;
      for (let c = 0; c < LCOLS; c++) {
        const k = r + ',' + c, sel = this.sel && this.sel[0] === r && this.sel[1] === c;
        h += `<td data-r="${r}" data-c="${c}" class="${sel ? 'sel' : ''}">${cellSVG(P.cells[k], pf[k], !!P.vl[k], r > 0 && !!P.vl[(r - 1) + ',' + c], c === LCOLS - 1, this.c, Sim.S ? lvlPow(P, pf, r, c) : null)}</td>`;
      }
      h += '</tr>';
    }
    g.innerHTML = h + '</table>';
    g.onclick = e => { const td = e.target.closest('td[data-r]'); if (td) this.clickCell(+td.dataset.r, +td.dataset.c); };
  },
  clickCell(r, c) {
    const P = this.prog(), t = this.tool;
    if (t === 'sel') { this.sel = [r, c]; }
    else if (t === 'DEL') { delete P.cells[r + ',' + c]; delete P.vl[r + ',' + c]; this.sel = null; }
    else if (t === 'V') { if (r >= P.rows - 1) P.rows++; const k = r + ',' + c; if (P.vl[k]) delete P.vl[k]; else P.vl[k] = true; }
    else {
      const coil = COILS.includes(t); if (coil) c = LCOLS - 1; else if (c === LCOLS - 1) { toast('La dernière colonne est réservée aux bobines'); return; }
      const old = P.cells[r + ',' + c];
      const def = { NO: 'I0', NC: 'I1', P: 'I0', N: 'I0', TON: 'T0', TOF: 'T0', TP: 'T0', CTU: 'C0', CTD: 'C0', C: 'Q0', CN: 'Q0', S: 'Q0', R: 'Q0', RES: 'C0' }[t];
      P.cells[r + ',' + c] = { t, a: old && old.a && t !== 'H' && /^[TC]/.test(old.a) === /^(TON|TOF|TP|CTU|CTD|RES)$/.test(t) ? old.a : def, p: old && old.p ? old.p : (/^(TON|TOF|TP)$/.test(t) ? 2 : /^CT/.test(t) ? 5 : undefined) };
      if (t === 'H') delete P.cells[r + ',' + c].a;
      this.sel = [r, c];
    }
    App.changed(true); this.drawGrid(); this.drawSide();
  },
  drawSide() {
    const sd = $('#lside'); if (!sd) return; const P = this.prog();
    if (!this.sel) { sd.innerHTML = '<p class="hint">Sélectionnez un élément pour modifier son adresse ou sa présélection.</p>'; return; }
    const k = this.sel.join(','), cell = P.cells[k];
    if (!cell) { sd.innerHTML = `<p class="hint">Case vide (ligne ${this.sel[0] + 1}, colonne ${this.sel[1] + 1}).</p>`; return; }
    const timer = /^(TON|TOF|TP)$/.test(cell.t), ctr = /^CT/.test(cell.t);
    sd.innerHTML = `<div class="row"><label>Élément</label><b>${esc((LTOOLS.find(x => x[0] === cell.t) || [, cell.t])[1])}</b></div>
      ${cell.t !== 'H' ? `<div class="row"><label>Adresse</label><input id="cA" value="${esc(cell.a || '')}"></div>` : ''}
      ${timer ? `<div class="row"><label>Présélection (s)</label><input id="cP" type="number" step="0.1" value="${esc(cell.p)}"></div>` : ''}
      ${ctr ? `<div class="row"><label>Présélection (impulsions)</label><input id="cP" type="number" step="1" value="${esc(cell.p)}"></div>` : ''}
      <div class="row"><label>Commentaire de ligne</label><input id="cC" value="${esc(P.cmt[this.sel[0]] || '')}"></div>`;
    const a = $('#cA'), p = $('#cP'), cc = $('#cC');
    if (a) a.onchange = () => { const v = a.value.toUpperCase().trim(); if (!PLC.parse(v)) { toast('Adresse invalide'); a.value = cell.a; return; } cell.a = v; App.changed(true); this.drawGrid(); };
    if (p) p.onchange = () => { cell.p = +p.value; App.changed(true); this.drawGrid(); };
    cc.onchange = () => { P.cmt[this.sel[0]] = cc.value; App.changed(true); };
  },
  /* ---------- GRAFCET ---------- */
  renderGraf(B) {
    const G = this.prog().graf;
    B.innerHTML = `<div class="gwrap"><div>
      <h4 style="margin:4px 0">Étapes</h4>
      <table class="grid" id="gS"><tr><th style="width:56px">Étape</th><th style="width:54px">Initiale</th><th>Actions (ex. Q0, M1, S Q2, R Q2)</th><th style="width:30px"></th></tr>
      ${G.steps.map((x, i) => `<tr><td><input data-i="${i}" data-f="n" value="${esc(x.n)}"></td><td style="text-align:center"><input type="checkbox" data-i="${i}" data-f="init" ${x.init ? 'checked' : ''} style="width:auto"></td><td><input data-i="${i}" data-f="act" value="${esc(x.act || '')}"></td><td><button class="btn dng" data-del="${i}">✕</button></td></tr>`).join('')}</table>
      <div class="btns"><button class="btn" id="gAddS">+ Étape</button></div>
      <h4 style="margin:10px 0 4px">Transitions</h4>
      <table class="grid" id="gT"><tr><th style="width:80px">De l'étape</th><th style="width:80px">Vers l'étape</th><th>Réceptivité</th><th style="width:30px"></th></tr>
      ${G.trans.map((t, i) => { const e = PLC.cond(t.cond).err; return `<tr><td><input data-i="${i}" data-f="from" value="${esc(t.from)}"></td><td><input data-i="${i}" data-f="to" value="${esc(t.to)}"></td><td><input data-i="${i}" data-f="cond" value="${esc(t.cond)}" style="${e ? 'color:#dc2626' : ''}" title="${esc(e || '')}"></td><td><button class="btn dng" data-del="${i}">✕</button></td></tr>`; }).join('')}</table>
      <div class="btns"><button class="btn" id="gAddT">+ Transition</button></div>
      <p class="hint">Réceptivités : <b>I0 . I1</b> (ET), <b>I0 + I1</b> (OU), <b>/I2</b> ou <b>!I2</b> (NON), <b>↑I0</b> ou <b>^I0</b> (front montant), <b>3s/X2</b> (étape 2 active depuis 3 s), <b>=1</b> (toujours vraie). Plusieurs étapes séparées par des virgules forment une convergence ou divergence en ET. Les étapes Xn sont aussi utilisables comme contacts en Ladder.</p>
      </div><div><div class="gsvg" id="gSvg"></div></div></div>`;
    const bind = (id, arr) => {
      const t = $(id);
      t.onchange = e => { const i = e.target.dataset.i, f = e.target.dataset.f; if (i == null) return; arr[i][f] = e.target.type === 'checkbox' ? e.target.checked : e.target.value; App.changed(true); if (f === 'cond') e.target.style.color = PLC.cond(e.target.value).err ? '#dc2626' : ''; this.drawGraf(); };
      t.onclick = e => { const d = e.target.dataset.del; if (d != null) { arr.splice(+d, 1); App.changed(true); this.renderGraf(B); } };
    };
    bind('#gS', G.steps); bind('#gT', G.trans);
    $('#gAddS').onclick = () => { const n = G.steps.length ? Math.max(...G.steps.map(x => +x.n || 0)) + 1 : 0; G.steps.push({ n, init: !G.steps.length, act: '' }); App.changed(true); this.renderGraf(B); };
    $('#gAddT').onclick = () => { const L = G.steps; const a = L.length ? L[Math.min(G.trans.length, L.length - 1)].n : 0; const b = L.length ? L[(Math.min(G.trans.length, L.length - 1) + 1) % L.length].n : 0; G.trans.push({ from: String(a), to: String(b), cond: 'I0' }); App.changed(true); this.renderGraf(B); };
    this.drawGraf();
  },
  drawGraf() {
    const box = $('#gSvg'); if (!box) return; const G = this.prog().graf, X = (this.c.state && this.c.state.img && Sim.S) ? this.c.state.img.X : new Set();
    const idx = {}; G.steps.forEach((x, i) => idx[+x.n] = i);
    const Y = i => 30 + i * 110, X0 = 120;
    const H = Math.max(200, Y(G.steps.length) + 20);
    let s = `<svg width="560" height="${H}" font-family="system-ui" font-size="12">`;
    const byFrom = {};
    G.trans.forEach((t, ti) => { const f = PLC.list(t.from)[0]; (byFrom[f] = byFrom[f] || []).push([t, ti]); });
    G.steps.forEach((x, i) => {
      const y = Y(i), act = X.has(+x.n);
      s += `<rect x="${X0 - 22}" y="${y}" width="44" height="36" fill="${act ? '#dcfce7' : '#fff'}" stroke="#1f2937" stroke-width="1.6"/>`;
      if (x.init) s += `<rect x="${X0 - 18}" y="${y + 4}" width="36" height="28" fill="none" stroke="#1f2937" stroke-width="1.2"/>`;
      s += `<text x="${X0}" y="${y + 22}" text-anchor="middle" font-weight="600">${esc(x.n)}</text>`;
      if (act) s += `<circle cx="${X0}" cy="${y + 31}" r="3.5" fill="#16a34a"/>`;
      if (x.act) s += `<line x1="${X0 + 22}" y1="${y + 18}" x2="${X0 + 40}" y2="${y + 18}" stroke="#1f2937"/><rect x="${X0 + 40}" y="${y + 4}" width="${Math.max(60, x.act.length * 7.2 + 14)}" height="28" fill="${act ? '#fef9c3' : '#fff'}" stroke="#1f2937"/><text x="${X0 + 47}" y="${y + 22}">${esc(x.act)}</text>`;
      if (i > 0 || G.trans.some(t => PLC.list(t.to).includes(+x.n))) s += `<line x1="${X0}" y1="${y - 12}" x2="${X0}" y2="${y}" stroke="#1f2937" stroke-width="1.4"/>`;
      (byFrom[+x.n] || []).forEach(([t, ti], k) => {
        const tx = X0 + k * 150, ty = y + 62, to = PLC.list(t.to), ti0 = idx[to[0]], err = PLC.cond(t.cond).err;
        s += `<path d="M${X0} ${y + 36} L${X0} ${y + 46} L${tx} ${y + 46} L${tx} ${ty}" fill="none" stroke="#1f2937" stroke-width="1.4"/>`;
        s += `<line x1="${tx - 12}" y1="${ty}" x2="${tx + 12}" y2="${ty}" stroke="#1f2937" stroke-width="3"/>`;
        s += `<text x="${tx + 18}" y="${ty + 4}" fill="${err ? '#dc2626' : '#0f172a'}">${esc(t.cond)}${err ? ' ⚠' : ''}</text>`;
        if (ti0 === i + 1 && k === 0 && to.length === 1) s += `<line x1="${X0}" y1="${ty}" x2="${X0}" y2="${Y(i + 1) - 12}" stroke="#1f2937" stroke-width="1.4"/>`;
        else if (ti0 != null) {
          const lx = 30 - k * 8, ty2 = Y(ti0) - 12;
          s += `<path d="M${tx} ${ty} L${tx} ${ty + 14} L${lx} ${ty + 14} L${lx} ${ty2} L${X0} ${ty2}" fill="none" stroke="#1f2937" stroke-width="1.4"/>`;
          s += `<path d="M${lx - 4} ${(ty + ty2) / 2 + (ty2 < ty ? 5 : -5)} L${lx} ${(ty + ty2) / 2 + (ty2 < ty ? -3 : 3)} L${lx + 4} ${(ty + ty2) / 2 + (ty2 < ty ? 5 : -5)}" fill="none" stroke="#1f2937" stroke-width="1.4"/>`;
          if (to.length > 1) s += `<text x="${lx + 4}" y="${ty + 28}" fill="#64748b" font-size="10">→ ${to.join(', ')}</text>`;
        }
      });
    });
    box.innerHTML = s + '</svg>';
  },
  /* ---------- Mnémoniques / variables ---------- */
  renderSym(B) {
    const P = this.prog(), addrs = [...[...Array(8)].map((_, i) => 'I' + i), ...[...Array(8)].map((_, i) => 'Q' + i), ...[...Array(16)].map((_, i) => 'M' + i)];
    B.innerHTML = `<table class="grid" id="symT"><tr><th style="width:70px">Adresse</th><th>Mnémonique (affiché sur l'automate)</th></tr>${addrs.map(a => `<tr><td><b>${a}</b></td><td><input data-a="${a}" value="${esc(P.sym[a] || '')}" maxlength="12"></td></tr>`).join('')}</table>`;
    $('#symT').onchange = e => { const a = e.target.dataset.a; if (a) { P.sym[a] = e.target.value; App.changed(true); } };
  },
  renderVars(B, liveOnly) {
    const s = this.c.state || {}, img = s.img; const run = !!Sim.S && img;
    const v = b => run ? (b ? '<span class="badge ok">1</span>' : '<span class="badge">0</span>') : '—';
    const P = this.prog();
    const h = `<table class="grid"><tr><th>Adresse</th><th>Mnémonique</th><th>Valeur</th><th>Forçage</th></tr>
      ${[...Array(8)].map((_, i) => `<tr><td>I${i}</td><td>${esc(P.sym['I' + i] || '')}</td><td>${v(run && img.I[i])}</td><td>${this.forceBtns('I' + i)}</td></tr>`).join('')}
      ${[...Array(8)].map((_, i) => `<tr><td>Q${i}</td><td>${esc(P.sym['Q' + i] || '')}</td><td>${v(run && img.Q[i])}</td><td>${this.forceBtns('Q' + i)}</td></tr>`).join('')}
      ${[...Array(16)].map((_, i) => `<tr><td>M${i}</td><td>${esc(P.sym['M' + i] || '')}</td><td>${v(run && img.M[i])}</td><td></td></tr>`).join('')}
      ${run ? img.T.map((t, i) => t.pre ? `<tr><td>T${i}</td><td>Tempo</td><td>${fmt(t.acc, 2)} / ${t.pre} s ${v(t.done)}</td><td></td></tr>` : '').join('') : ''}
      ${run ? img.C.map((t, i) => t.pre ? `<tr><td>C${i}</td><td>Compteur</td><td>${t.cv} / ${t.pre} ${v(t.done)}</td><td></td></tr>` : '').join('') : ''}
      ${run ? `<tr><td>X</td><td>Étapes actives</td><td>${[...img.X].sort((a, b) => a - b).map(n => 'X' + n).join(', ') || '—'}</td><td></td></tr>` : ''}</table>`;
    if (liveOnly && B.querySelector('table') && document.activeElement && B.contains(document.activeElement)) return;
    B.innerHTML = (run ? '' : '<p class="hint">Lancez la simulation pour visualiser les valeurs en temps réel et forcer les entrées/sorties.</p>') + h;
    B.onclick = e => { const a = e.target.dataset.fa; if (!a || !this.c.state) return; const f = this.c.state.force || (this.c.state.force = {}); const m = e.target.dataset.fv; if (m === 'x') delete f[a]; else f[a] = m === '1'; this.renderVars(B); };
  },
  forceBtns(a) { const f = (this.c.state && this.c.state.force) || {}; const cur = f[a]; return `<button class="btn" style="padding:1px 6px;${cur === true ? 'background:#dcfce7' : ''}" data-fa="${a}" data-fv="1">1</button> <button class="btn" style="padding:1px 6px;${cur === false ? 'background:#fee2e2' : ''}" data-fa="${a}" data-fv="0">0</button> <button class="btn" style="padding:1px 6px" data-fa="${a}" data-fv="x">✕</button>`; }
};
function lvlPow(P, pf, r, c) { return null; }
function cellSVG(cell, pf, vlR, vlA, coilCol, plc, _) {
  const G = '#16a34a', K = '#334155';
  const pin = pf ? pf[0] : false, pout = pf ? pf[1] : false;
  const ci = pin ? G : K, co = pout ? G : K;
  let s = '<svg viewBox="0 0 84 54">';
  if (vlR) s += `<line x1="83" y1="30" x2="83" y2="54" stroke="${co}" stroke-width="2"/>`;
  if (vlA) s += `<line x1="83" y1="0" x2="83" y2="30" stroke="${K}" stroke-width="2"/>`;
  if (!cell) return s + '</svg>';
  const sym = (plc.props.prog.sym || {})[cell.a] || '';
  const txt = (t, y, sz = 10, col = '#0f172a', w = 600) => `<text x="42" y="${y}" text-anchor="middle" font-size="${sz}" font-weight="${w}" fill="${col}" font-family="system-ui">${esc(t)}</text>`;
  if (cell.t === 'H') return s + `<line x1="0" y1="30" x2="84" y2="30" stroke="${ci}" stroke-width="2"/></svg>`;
  if (['NO', 'NC', 'P', 'N'].includes(cell.t)) {
    s += `<line x1="0" y1="30" x2="32" y2="30" stroke="${ci}" stroke-width="2"/><line x1="52" y1="30" x2="84" y2="30" stroke="${co}" stroke-width="2"/>`;
    s += `<line x1="32" y1="19" x2="32" y2="41" stroke="${ci}" stroke-width="2"/><line x1="52" y1="19" x2="52" y2="41" stroke="${co}" stroke-width="2"/>`;
    if (cell.t === 'NC') s += `<line x1="30" y1="42" x2="54" y2="18" stroke="#0f172a" stroke-width="1.5"/>`;
    if (cell.t === 'P' || cell.t === 'N') s += txt(cell.t, 34, 11);
    s += txt(cell.a, 11) + (sym ? txt(sym, 51, 8, '#64748b', 400) : '');
    return s + '</svg>';
  }
  if (/^(TON|TOF|TP|CTU|CTD)$/.test(cell.t)) {
    s += `<line x1="0" y1="30" x2="14" y2="30" stroke="${ci}" stroke-width="2"/><line x1="70" y1="30" x2="84" y2="30" stroke="${co}" stroke-width="2"/><rect x="14" y="5" width="56" height="45" fill="${pout ? '#dcfce7' : '#f8fafc'}" stroke="#0f172a"/>`;
    s += txt(cell.t + ' ' + (cell.a || ''), 16, 9.5);
    let live = '';
    const img = plc.state && plc.state.img, q = PLC.parse(cell.a);
    if (Sim.S && img && q) { if (q[0] === 'T' && img.T[q[1]]) live = fmt(img.T[q[1]].acc, 1) + 's'; if (q[0] === 'C' && img.C[q[1]]) live = String(img.C[q[1]].cv); }
    s += txt('PT ' + (cell.p ?? '') + (/^T/.test(cell.t) ? ' s' : ''), 30, 9, '#334155', 400) + (live ? txt(live, 43, 9, '#0f62fe') : '');
    return s + '</svg>';
  }
  // bobines
  s += `<line x1="0" y1="30" x2="30" y2="30" stroke="${ci}" stroke-width="2"/>`;
  s += `<path d="M36 18 Q28 30 36 42" fill="none" stroke="${ci}" stroke-width="2"/><path d="M48 18 Q56 30 48 42" fill="none" stroke="${ci}" stroke-width="2"/>`;
  if (pin && cell.t !== 'RES') s += `<circle cx="42" cy="30" r="6" fill="#bbf7d0"/>`;
  const L = { C: '', CN: '/', S: 'S', R: 'R', RES: 'RES' }[cell.t];
  s += txt(L, 34, L.length > 1 ? 7 : 11) + txt(cell.a, 11) + (sym ? txt(sym, 51, 8, '#64748b', 400) : '');
  return s + '</svg>';
}
