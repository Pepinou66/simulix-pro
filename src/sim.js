'use strict';
/* =====================================================================
   Moteur de simulation multi-technologies
   - réseaux (nets) construits par union des fils et des liaisons internes
   - itération jusqu'à stabilité (relais, distributeurs, contacts…)
   - calcul physique simplifié des actionneurs (pression, débit, effort)
   ===================================================================== */
const DT = 0.02;
const K = (c, p) => c.id + ':' + p;

const Sim = {
  S: null,
  start() {
    const S = this.S = {
      t: 0, tags: {}, cyl: {}, trip: {}, current: {}, dispP: new Map(), flow: new Map(), lv: new Map(), restr: new Map(),
      banner: '', conn: new Set(), lam: new Map(), oilT: 30, visc: 46
    };
    const self = this;
    S.root = (c, p) => S.uf.find(K(c, p));
    S.info = (c, p) => S.net.get(S.root(c, p)) || EMPTY;
    S.pre = (c, p) => S.preNet.get(S.uf1.find(K(c, p))) || EMPTY;
    // Potentiels électriques : {sys, re, im, dc, ph} — sys = réseau/source isolée, re/im = phaseur AC (V eff.), dc = tension continue
    S.Vd = (c, p) => S.vd.get(S.root(c, p)) ?? null;
    S.pot = (c, p) => { const r = S.root(c, p); return S.vd.get(r) ?? S.vp.get(r) ?? null; };
    S.dV = (c, a, b, direct) => dV(direct ? S.Vd(c, a) : S.pot(c, a), direct ? S.Vd(c, b) : S.pot(c, b));
    S.V = (c, p) => { const v = S.pot(c, p); return v ? Math.round(Math.hypot(v.re, v.im) + v.dc) : null; };
    // charge alimentée si la tension à ses bornes atteint 60 % de sa tension nominale ; grillée au-delà de 140 %
    S.loadOn = (c, a, b, vn) => {
      vn = vn || +c.props.vnom || 24; const s = st(c); if (s.burnt) return false;
      const d = dV(S.Vd(c, a), S.Vd(c, b)); if (d == null) return false;
      if (d > vn * 1.4) { s.burnt = true; S.stickyBanner = S.banner = '💥 Surtension : ' + (c.props.tag || DEFS[c.type].name) + ' (' + vn + ' V) alimenté sous ' + Math.round(d) + ' V — composant détruit'; return false; }
      return d >= vn * 0.6;
    };
    S.vent = (c, p) => S.info(c, p).vent;
    S.netSrc = (c, p) => { const i = S.info(c, p); return i.src && !i.vent; };
    S.netMed = (c, p) => S.info(c, p).med;
    // pression affichée : retour bâche = 0 (ou pression de gavage), circulation P→T au repos ≈ 2 bar de pertes de charge
    S.P = (c, p) => { const r = S.root(c, p), i = S.net.get(r); if (!i) return S.hold.get(r) || 0; if (i.vent) return i.lowp || (i.src && i.med === 'h' && !i.rupt ? 2 : 0); if (S.dispP.has(r)) return S.dispP.get(r); return i.src ? i.pr * (1 + (i.plage || 0)) : (S.hold.get(r) || 0); };
    S.Q = (c, p) => S.flow.get(S.root(c, p)) || 0;
    S.R = (c, p) => S.restr.get(S.root(c, p)) ?? 1;
    S.L = (c, p) => S.lv.get(S.root(c, p)) || false;
    S.connected = (c, p) => S.conn.has(K(c, p));
    S.hold = new Map();
    App.wires.forEach(w => { S.conn.add(w.a.c + ':' + w.a.p); S.conn.add(w.b.c + ':' + w.b.p); });
    App.comps.forEach(c => { c.state = {}; const d = DEFS[c.type]; d.init && d.init(c); });
    this.indexCyl();
    this.solve();
    this.settle();
    this.solve();
  },
  stop() { this.S = null; App.comps.forEach(c => { c.state = {}; const d = DEFS[c.type]; d.init && d.init(c); }); },
  indexCyl() { const S = this.S; S.cyl = {}; App.comps.forEach(c => { if (DEFS[c.type].isActuator && c.props.tag) S.cyl[c.props.tag] = c; }); },

  solve() {
    const S = this.S, uf = new UF(), comps = App.comps;
    for (const c of comps) for (const p of compPorts(c)) uf.find(K(c, p.id));
    for (const w of App.wires) if (!w.cut) uf.union(w.a.c + ':' + w.a.p, w.b.c + ':' + w.b.p);
    const off = {};
    for (const c of comps) if (c.type === 'offpage') { const t = c.props.tag || ''; if (off[t]) uf.union(off[t], K(c, 'n')); else off[t] = K(c, 'n'); }
    const restr = [];
    const addLinks = (c, l) => { for (const [a, b, f] of l) { uf.union(K(c, a), K(c, b)); if (f != null && f < 1) restr.push([K(c, a), f]); } };
    for (const c of comps) { const d = DEFS[c.type]; if (d.links) addLinks(c, d.links(c, S)); }
    // première passe : informations pour les éléments directionnels
    S.uf = uf; S.net = this.netInfo(uf);
    const uf1 = new UF(); for (const k of uf.p.keys()) uf1.p.set(k, uf.find(k));
    S.uf1 = uf1; S.preNet = S.net;
    for (const c of comps) { const d = DEFS[c.type]; if (d.dlinks) addLinks(c, d.dlinks(c, S)); }
    S.net = this.netInfo(uf);
    S.restr = new Map();
    for (const [k, f] of restr) { const r = uf.find(k); S.restr.set(r, Math.min(S.restr.get(r) ?? 1, f)); }
    // tensions
    S.vd = new Map(); S.short = null; S.shorts = [];
    for (const [r, i] of S.net) {
      if (!i.pots || !i.pots.length) continue;
      const p0 = i.pots[0];
      if (i.pots.some(q => q.sys === p0.sys && dV(q, p0) > 1)) { S.short = S.short || r; (S.shorts = S.shorts || []).push(r); continue; }
      S.vd.set(r, p0);
    }
    // propagation à travers les charges (pour les mesures au voltmètre)
    S.vp = new Map(); S.loadList = [];
    for (const c of comps) { const d = DEFS[c.type]; if (d.loads) for (const [a, b, w] of d.loads(c)) S.loadList.push([c, a, b, w, uf.find(K(c, a)), uf.find(K(c, b))]); }
    for (let it = 0; it < 4; it++) {
      const cand = new Map();
      const vof = r => S.vd.has(r) ? S.vd.get(r) : S.vp.get(r);
      for (const [, , , , ra, rb] of S.loadList) {
        for (const [x, y] of [[ra, rb], [rb, ra]]) { if (S.vd.has(y)) continue; const v = vof(x); if (v == null) continue; let s = cand.get(y); if (!s) cand.set(y, s = new Map()); s.set(potKey(v), v); }
      }
      for (const [r, s] of cand) if (s.size === 1) S.vp.set(r, [...s.values()][0]);
    }
  },
  netInfo(uf) {
    const m = new Map(), S = this.S;
    const g = r => { let o = m.get(r); if (!o) m.set(r, o = { plus: false, zero: false, pr: 0, q: 0, vent: false, med: null, src: false, sup: [], plage: 0, lowp: 0 }); return o; };
    for (const c of App.comps) {
      const d = DEFS[c.type]; if (!d.sources) continue;
      for (const [p, t, v, q, pl, ex] of d.sources(c, S)) {
        const o = g(uf.find(K(c, p)));
        if (t === 'pot') { (o.pots = o.pots || []).push(v); o.sup.push(c); if (v.dc > 0 || Math.hypot(v.re, v.im) > 0) o.plus = true; else o.zero = true; }
        else if (t === '+') { (o.pots = o.pots || []).push({ sys: c.id, re: 0, im: 0, dc: 24, ph: '+' }); o.plus = true; o.sup.push(c); }
        else if (t === '0') { (o.pots = o.pots || []).push({ sys: c.id, re: 0, im: 0, dc: 0, ph: '0' }); o.zero = true; o.sup.push(c); }
        else if (t === 'pneu') { o.pr = Math.max(o.pr, v); o.src = true; o.med = 'p'; }
        else if (t === 'hyd') { o.pr = Math.max(o.pr, v); o.q += q; o.src = true; o.med = 'h'; o.plage = Math.max(o.plage, pl || 0); if (ex && ex.reg != null) o.reg = Math.min(o.reg ?? 1e9, ex.reg); if (ex && ex.ls != null) o.ls = ex.ls; if (ex && ex.norel) o.norel = true; else o.hasRel = true; }
        else if (t === 'lowp') { o.vent = true; o.med = 'h'; o.lowp = Math.max(o.lowp, v); }
        else if (t === 'vent') { o.vent = true; o.med = o.med || 'p'; }
        else if (t === 'tank') { o.vent = true; o.med = 'h'; }
      }
    }
    // rupture de flexible : fuite à l'atmosphère aux deux extrémités
    for (const w of App.wires) if (w.cut && w.kind !== 'e' && w.kind !== 'l' && w.kind !== 'x') for (const r of [w.a, w.b]) { const o = g(uf.find(r.c + ':' + r.p)); o.vent = true; o.rupt = true; }
    // limiteurs de pression autonomes (LP, soupape anti-choc) : plafonnent la pression du réseau amont
    for (const c of App.comps) { const d = DEFS[c.type]; if (!d.cap) continue; const cp = d.cap(c, uf, m); if (cp) { const o = g(uf.find(K(c, cp[0]))); o.cap = Math.min(o.cap ?? 1e9, cp[1]); } }
    for (const o of m.values()) if (o.cap != null && o.src) { if (o.cap < o.pr) { o.pr = o.cap; o.plage = 0.03; } }
    return m;
  },
  settle() {
    const S = this.S;
    for (let it = 0; it < 16; it++) {
      let ch = false;
      for (const c of App.comps) { const d = DEFS[c.type]; if (d.update && d.update(c, S)) ch = true; }
      if (S.short) { ch = this.tripShort() || ch; }
      if (!ch) break;
      this.solve();
    }
  },
  tripShort() {
    const S = this.S; let ch = false;
    for (const r of S.shorts || []) {
      const i = S.net.get(r); if (!i) continue;
      // appareils de protection traversés par le défaut (disjoncteurs, fusibles) : déclenchent en priorité
      const prot = App.comps.filter(c => DEFS[c.type].protect && compPorts(c).some(p => S.root(c, p.id) === r) && DEFS[c.type].isClosed(c));
      if (prot.length) { prot.forEach(c => { DEFS[c.type].trip(c, 'Court-circuit'); ch = true; }); S.stickyBanner = S.banner = '⚡ Court-circuit : ' + prot.map(c => c.props.tag).join(', ') + ' a déclenché'; continue; }
      for (const c of i.sup) if ((c.type === 'supply' || DEFS[c.type].mains) && !S.trip[c.id]) { S.trip[c.id] = 'Court-circuit'; ch = true; S.banner = '⚡ Court-circuit : protection de ' + (c.props.tag || 'l\'alimentation') + ' déclenchée'; }
    }
    if (ch) this.solve();
    return ch;
  },
  logic() {
    const S = this.S, lc = App.comps.filter(c => DEFS[c.type].lout);
    if (!lc.length) return;
    let lv = S.lv;
    for (let it = 0; it < 32; it++) {
      S.lv = lv; const nv = new Map();
      for (const c of lc) { const o = DEFS[c.type].lout(c, S); for (const p in o) if (o[p]) nv.set(S.root(c, p), true); }
      let same = nv.size === lv.size; if (same) for (const k of nv.keys()) if (!lv.has(k)) { same = false; break; }
      lv = nv; if (same) break;
    }
    S.lv = lv;
    for (const c of App.comps) { const d = DEFS[c.type]; if (d.lstep) d.lstep(c, S); }
  },
  actuate(dt) {
    const S = this.S, acts = App.comps.filter(c => DEFS[c.type].isActuator);
    const groups = new Map(), res = new Map();
    for (const c of acts) {
      const r = DEFS[c.type].demand(c, S); res.set(c, { v: 0, n: 0 });
      if (r.direct) { res.set(c, { v: r.v, n: r.n || 0 }); continue; }
      if (!r.dir) continue;
      const root = S.root(c, r.feed); let g = groups.get(root); if (!g) groups.set(root, g = []); g.push([c, r]);
    }
    const dispP = new Map(), flow = new Map(), lam = new Map();
    const addFlow = (r, q) => flow.set(r, (flow.get(r) || 0) + q);
    for (const [root, list] of groups) {
      const info = S.net.get(root); if (!info) continue;
      const hyd = info.med === 'h', pS = info.reg != null ? Math.min(info.pr, info.reg) : info.pr, pFull = pS * (1 + (info.plage || 0));
      const moving = list.filter(([, r]) => r.preq <= pS + 1e-6);
      if (hyd) {
        // le débit va au récepteur le moins chargé d'abord (fiche F05F : le vérin le moins chargé sort en premier)
        const pmin = moving.length ? Math.min(...moving.map(([, r]) => r.preq)) : 0;
        const active = moving.filter(([, r]) => r.preq <= pmin + 5);
        let used = 0, throttled = false; const n = active.length;
        for (const [c, r] of active) {
          const f = Math.min(S.R(c, r.feed), r.out ? S.R(c, r.out) : 1); if (f < 0.999) throttled = true;
          const qIn = info.q / n * f, q = qIn * (1 - (r.leak || 0)); used += qIn;
          if (r.motor) res.set(c, { n: r.dir * q * 1000 / (+c.props.disp || 50) });
          else { const v = q * 1e6 / 60 / r.area; res.set(c, { v: r.dir * v, force: r.preq * r.area / 10 }); }
          addFlow(root, qIn); if (r.out) addFlow(S.root(c, r.out), r.motor ? q : q * (r.dir > 0 ? cylGeom(c).Aa / cylGeom(c).Ab : cylGeom(c).Ab / cylGeom(c).Aa));
        }
        const byp = Math.max(0, info.q - used);
        if (info.ls != null) { dispP.set(root, n ? Math.min(pS, pmin + info.ls) : pS); continue; } // à l'arrêt en butée : coupure de pression, débit nul // load-sensing : p = charge + Δp, débit ajusté
        if (info.reg != null && (byp > 0.01 || throttled)) { dispP.set(root, n ? Math.min(info.reg, pS) : info.reg); continue; } // régulateur : la pompe se dé-cylindre
        // limiteur : ouvert dès que la pression atteint le tarage ; pression à plein débit = tarage + plage
        let p = n ? Math.min(pS, pmin + 2) : pFull;
        if (n && (throttled || byp > 0.01)) p = pS + (pFull - pS) * (byp / info.q);
        dispP.set(root, p);
        if (byp > 0.01 && p >= pS - 0.5 && !(info.norel && !info.hasRel && info.cap == null)) lam.set(root, byp * p / 600);
      } else {
        for (const [c, r] of moving) {
          const f = Math.min(S.R(c, r.feed), r.out ? S.R(c, r.out) : 1), k = Math.sqrt(clamp(1 - r.preq / pS, 0, 1)) * (1 - (r.leak || 0));
          if (r.motor) res.set(c, { n: r.dir * (+c.props.nmax || 300) * f * k });
          else { const v = (+c.props.vmax || 250) * f * k * (r.diff ? 0.6 : 1); res.set(c, { v: r.dir * v }); addFlow(root, v * r.area * 60 / 1e6 * (pS + 1)); if (r.out) addFlow(S.root(c, r.out), v * r.area * 60 / 1e6 * (pS + 1)); }
        }
      }
    }
    // laminage au limiteur quand aucun récepteur n'est alimenté (centre fermé, vérin en butée)
    for (const [r, i] of S.net) if (i.src && !i.vent && i.med === 'h' && !groups.has(r)) {
      if (i.ls != null) dispP.set(r, i.ls); else if (i.reg != null) dispP.set(r, Math.min(i.reg, i.pr));
      else if (i.norel && !i.hasRel && i.cap == null) dispP.set(r, i.pr); // pompe seule sans limiteur : la pression monte jusqu'à la casse, pas de laminage
      else { dispP.set(r, i.pr * (1 + (i.plage || 0))); lam.set(r, i.q * i.pr * (1 + (i.plage || 0)) / 600); }
    }
    // pression créée par la charge dans une chambre isolée (fiche F05K : p = F / S)
    S.hold = new Map();
    for (const c of acts) {
      if (c.type !== 'cyl' || !(+c.props.load)) continue; const g = cylGeom(c), F = +c.props.load, ld = c.props.ldir || 'deux';
      const side = ld === 'sortie' ? 'A' : ld === 'rentree' && !c.props.single ? 'B' : null; if (!side) continue;
      const r = S.root(c, side), i = S.net.get(r); if (!i || (!i.src && !i.vent)) S.hold.set(r, F / (side === 'A' ? g.Ab : g.Aa) * 10);
    }
    S.dispP = dispP; S.flow = flow; S.lam = lam;
    for (const c of acts) DEFS[c.type].move(c, S, dt, res.get(c));
  },
  tick(dt = DT) {
    const S = this.S; if (!S) return;
    S.t += dt; S.banner = Object.keys(S.trip).length ? S.banner : (S.stickyBanner || ''); S.leaks = new Set();
    for (const c of App.comps) { const d = DEFS[c.type]; if (d.scan) d.scan(c, S, dt); }
    Hardware.exchange && Hardware.exchange(S);
    this.solve(); this.settle();
    this.logic();
    this.actuate(dt);
    for (const c of App.comps) { const d = DEFS[c.type]; if (d.step) d.step(c, S, dt); }
    this.solve(); this.settle();
    // courants et surcharge
    const cur = new Map();
    for (const [c, a, b, w, ra, rb] of S.loadList) {
      const d = dV(S.vd.get(ra), S.vd.get(rb));
      if (d != null && d >= 10) { const I = (w || 2) / d; for (const r of [ra, rb]) { const i = S.net.get(r); if (i && i.sup) for (const sc of i.sup) cur.set(sc.id, (cur.get(sc.id) || 0) + I / 2); } }
    }
    S.current = {};
    for (const c of App.comps) if (c.type === 'supply' || DEFS[c.type].mains) {
      const i = cur.get(c.id) || 0; S.current[c.id] = i;
      const lim = c.type === 'transfo' ? (+c.props.va || 100) / (+c.props.Us || 24) * 1.5 : (+c.props.imax || 5);
      if (i > lim && !S.trip[c.id]) { S.trip[c.id] = 'Surcharge'; S.banner = '⚠ Surcharge de ' + (c.props.tag || 'l\'alimentation') + ' : ' + fmt(i, 1) + ' A > ' + fmt(lim, 1) + ' A — protection déclenchée'; this.solve(); this.settle(); }
    }
    // température de l'huile : échauffement par laminage, refroidissement naturel (réservoir, échangeur)
    let lamT = 0; for (const v of S.lam.values()) lamT += v;
    if (App.comps.some(c => c.type === 'pump' || c.type === 'hpump' || c.type === 'pumpvar')) { let cool = 0; for (const c of App.comps) if (c.type === 'cooler' && c.props.medium !== 'pneu') cool += DEFS.cooler.eff(c, S); S.oilT += dt * (lamT * 0.12 - (S.oilT - 25) * 0.01 - cool * 0.12 * clamp((S.oilT - 25) / 30, 0, 1.5)); S.visc = 46 * Math.pow(2, -(S.oilT - 40) / 10); }
    const rupt = [...S.net.values()].find(i => i.rupt && i.src && i.med === 'h');
    if (rupt) S.banner = '⚠ Rupture de flexible sous pression : risque d\'injection d\'huile sous la peau dès 20 bar — arrêter la pompe';
    else if (S.oilT > 80 && !Object.keys(S.trip).length) S.banner = '🌡 Huile à ' + fmt(S.oilT, 0) + ' °C : échauffement par laminage au limiteur (viscosité ' + fmt(S.visc, 1) + ' cSt)' + (App.comps.some(c => c.type === 'cooler' && c.props.medium !== 'pneu') ? ' — vérifier le refroidisseur' : ' — prévoir un refroidisseur');
    // mémorise les pressions côté actionneurs
    S._lastP = new Map();
    for (const c of App.comps) if (DEFS[c.type].isActuator) for (const p of compPorts(c)) S._lastP.set(K(c, p.id), S.P(c, p.id));

  }
};
function dV(a, b) { if (!a || !b || a.sys !== b.sys) return null; return Math.hypot(a.re - b.re, a.im - b.im) + Math.abs(a.dc - b.dc); }
function potKey(v) { return v.sys + '|' + v.ph + '|' + v.dc + '|' + Math.round(v.re) + '|' + Math.round(v.im); }
const EMPTY = { plus: false, zero: false, pr: 0, q: 0, vent: false, med: null, src: false, sup: [] };
const Hardware = {};
