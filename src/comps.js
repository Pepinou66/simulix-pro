'use strict';
/* =====================================================================
   Bibliothèque de composants
   Chaque définition peut fournir :
     w,h | size(c)         dimensions (px monde, non pivoté)
     ports | portsFn(c)    [{id,x,y,k}]  k: e=électrique p=pneumatique h=hydraulique f=fluide l=logique x=universel
     links(c,S)            connexions internes [[p1,p2,(facteur)]]
     dlinks(c,S)           connexions directionnelles (calculées après une 1re passe)
     sources(c,S)          [[port,type,val]] type: + 0 pneu hyd vent tank
     loads(c)              charges électriques [[a,b,watts]]
     update(c,S)           évaluation instantanée -> true si l'état change
     step(c,S,dt)          évolution temporelle
     lout(c,S) / lstep     logique numérique
     press/release(c,x,y)  interaction en simulation
     draw(ctx,c,S)         dessin
     fields, faults, catalog, plot
   ===================================================================== */
const DEFS = {};
const CATS = [];
function def(type, o) { DEFS[type] = Object.assign({ type, w: 40, h: 60 }, o); if (o.cat && !CATS.includes(o.cat)) CATS.push(o.cat); }
const INK = '#1f2937';
const ON_FILL = '#ffd54a';
const P = (id, x, y, k, label) => ({ id, x, y, k, label });
const st = c => c.state || (c.state = {});
const medK = c => (c.props.medium === 'hyd' ? 'h' : 'p');

function faultList(c) { const d = DEFS[c.type]; return d.faultsFn ? d.faultsFn(c) : (d.faults || []); }
function faultLabel(c) { const f = faultList(c).find(x => x[0] === c.fault); return f ? f[1] : c.fault; }
function contactState(c, logical) { if (c.fault === 'open') return false; if (c.fault === 'closed') return true; return logical; }
function cylAt(S, tag, pos) {
  const cy = S && S.cyl[tag]; if (!cy) return false;
  const p = cy.state.pos || 0;
  if (pos === 'sorti') return p >= 0.985;
  if (pos === 'rentré' || pos === 'rentre') return p <= 0.015;
  const v = parseFloat(pos); if (!isNaN(v)) return Math.abs(p * 100 - v) < 2.5;
  return false;
}
const TAGF = { k: 'tag', label: 'Repère', type: 'text' };
const REFF = { k: 'ref', label: 'Référence catalogue', type: 'text' };
const PWF = { k: 'power', label: 'Puissance (W)', type: 'num', step: 0.5 };
const VNF = { k: 'vnom', label: 'Tension nominale (V)', type: 'sel', opts: ['12', '24', '48', '110', '230', '400'] };

/* ---------- Dessins de contacts électriques ---------- */
function drawContact(ctx, c, closed, nc, actuator) {
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
  D.line(ctx, [20, 0, 20, 16]); D.line(ctx, [20, 44, 20, 60]);
  if (nc) D.line(ctx, [20, 16, 28, 16]);
  ctx.lineWidth = 2;
  if (closed) D.line(ctx, [20, 44, nc ? 29 : 20, nc ? 14 : 15]);
  else D.line(ctx, [20, 44, nc ? 9 : 7, nc ? 17 : 19]);
  ctx.lineWidth = 1.3;
  const mx = closed ? (nc ? 24 : 20) : (nc ? 14 : 13), my = 30;
  if (actuator === 'push') { D.dash(ctx, 1); D.line(ctx, [mx, my, 2, my]); D.dash(ctx, 0); D.line(ctx, [2, my - 6, 2, my + 6, -2, my + 6]); D.line(ctx, [2, my - 6, -2, my - 6]); }
  if (actuator === 'toggle') { D.dash(ctx, 1); D.line(ctx, [mx, my, 2, my]); D.dash(ctx, 0); D.line(ctx, [2, my - 6, 2, my + 6]); D.line(ctx, [2, my - 6, -3, my - 6]); D.line(ctx, [2, my + 6, 7, my + 6]); }
  if (actuator === 'estop') { D.dash(ctx, 1); D.line(ctx, [mx, my, 2, my]); D.dash(ctx, 0); ctx.beginPath(); ctx.arc(-3, my, 7, -Math.PI / 2, Math.PI / 2); ctx.fillStyle = '#ef4444'; ctx.fill(); ctx.stroke(); }
  if (actuator === 'limit') { D.dash(ctx, 1); D.line(ctx, [mx, my, 4, my]); D.dash(ctx, 0); D.line(ctx, [4, my - 6, -2, my, 4, my + 6]); D.circle(ctx, -4, my, 3); }
  if (actuator === 'press') { D.dash(ctx, 1); D.line(ctx, [mx, my, 4, my]); D.dash(ctx, 0); D.rect(ctx, -6, my - 6, 10, 12); D.text(ctx, 'P', -1, my, 8); }
  if (actuator === 'prox') { D.dash(ctx, 1); D.line(ctx, [mx, my, 4, my]); D.dash(ctx, 0); ctx.beginPath(); ctx.moveTo(4, my - 7); ctx.lineTo(-4, my); ctx.lineTo(4, my + 7); ctx.stroke(); D.line(ctx, [-6, my - 4, -6, my + 4]); }
}

/* ---------- Contacts (2 bornes a/b) ---------- */
function contactDef(type, name, nc, act, extra = {}) {
  def(type, Object.assign({
    name, cat: 'Électrique — commande', w: 40, h: 60,
    ports: [P('a', 20, 0, 'e'), P('b', 20, 60, 'e')],
    fields: [TAGF], faults: [['open', 'Contact reste ouvert'], ['closed', 'Contact collé (fermé)']],
    closed(c) { const a = !!st(c).act; return contactState(c, nc ? !a : a); },
    links(c) { return this.closed(c) ? [['a', 'b']] : []; },
    draw(ctx, c) { drawContact(ctx, c, this.closed(c), nc, act); },
    plot: c => DEFS[c.type].closed(c) ? 1 : 0, plotUnit: 'état',
    bom: nc ? 'Contact NF' : 'Contact NO'
  }, extra));
}
const pushHandlers = {
  press(c) { st(c).act = true; return true; },
  release(c) { st(c).act = false; return true; }, hint: () => 'Maintenir le clic : appuyer sur le bouton'
};
const toggleHandlers = { press(c) { st(c).act = !st(c).act; return true; }, hint: c => st(c).act ? 'Cliquer : relâcher' : 'Cliquer : actionner (accrochage)' };
const manHandlers = { press(c) { st(c).man = true; return true; }, release(c) { st(c).man = false; return true; }, hint: c => 'Maintenir le clic : actionner manuellement (sinon commandé par le vérin ' + (c.props.cyl || '?') + ')' };
contactDef('pb_no', 'Bouton poussoir NO', false, 'push', Object.assign({ defProps: { tag: 'S1' }, bom: 'Bouton poussoir 1NO' }, pushHandlers));
contactDef('pb_nc', 'Bouton poussoir NF', true, 'push', Object.assign({ defProps: { tag: 'S0' }, bom: 'Bouton poussoir 1NF' }, pushHandlers));
contactDef('sw_no', 'Commutateur à accrochage', false, 'toggle', Object.assign({ defProps: { tag: 'S2' }, bom: 'Commutateur 2 positions' }, toggleHandlers));
contactDef('estop', 'Arrêt d\'urgence (NF)', true, 'estop', Object.assign({ defProps: { tag: 'AU' }, bom: 'Arrêt d\'urgence coup de poing' }, toggleHandlers));
const tagUpdate = function (c, S) { const a = !!S.tags[c.props.tag]; if (st(c).act !== a) { st(c).act = a; return true; } return false; };
contactDef('k_no', 'Contact de relais NO', false, null, { defProps: { tag: 'K1' }, update: tagUpdate, info: c => 'Commandé par la bobine ' + c.props.tag, bom: 'Contact auxiliaire NO' });
contactDef('k_nc', 'Contact de relais NF', true, null, { defProps: { tag: 'K1' }, update: tagUpdate, info: c => 'Commandé par la bobine ' + c.props.tag, bom: 'Contact auxiliaire NF' });
const cylFields = [TAGF, { k: 'cyl', label: 'Vérin / actionneur associé', type: 'text' }, { k: 'pos', label: 'Position (rentré, sorti ou %)', type: 'sel', opts: ['rentré', 'sorti', '25', '50', '75'] }];
const limUpdate = function (c, S) { const a = cylAt(S, c.props.cyl, c.props.pos) || !!st(c).man; if (st(c).act !== a) { st(c).act = a; return true; } return false; };
contactDef('ls_no', 'Fin de course NO', false, 'limit', { defProps: { tag: '1S2', cyl: 'A', pos: 'sorti' }, fields: cylFields, update: limUpdate, bom: 'Interrupteur de position à galet 1NO', ...manHandlers });
contactDef('ls_nc', 'Fin de course NF', true, 'limit', { defProps: { tag: '1S1', cyl: 'A', pos: 'rentré' }, fields: cylFields, update: limUpdate, bom: 'Interrupteur de position à galet 1NF', ...manHandlers });
contactDef('prox', 'Détecteur de proximité', false, 'prox', { defProps: { tag: 'B1', cyl: 'A', pos: 'sorti' }, fields: cylFields, update: limUpdate, bom: 'Détecteur inductif PNP', ...manHandlers });

/* ---------- Charges électriques ---------- */
function loadDef(type, name, o) {
  def(type, Object.assign({
    name, cat: 'Électrique — commande', w: 40, h: 60,
    ports: [P('a', 20, 0, 'e'), P('b', 20, 60, 'e')],
    faults: [['open', 'Bobine / charge coupée']],
    loads(c) { return (c.fault === 'open' || st(c).burnt) ? [] : [['a', 'b', +c.props.power || 2]]; },
    update(c, S) {
      const on = c.fault !== 'open' && S.loadOn(c, 'a', 'b');
      let ch = false; if (st(c).on !== on) { st(c).on = on; ch = true; }
      if (this.setsTag && c.props.tag) { if (S.tags[c.props.tag] !== on) S.tags[c.props.tag] = on; }
      return ch;
    },
    plot: c => st(c).on ? 1 : 0, plotUnit: 'état'
  }, o));
}
loadDef('coil', 'Bobine de relais', {
  setsTag: true, defProps: { tag: 'K1', power: 3 }, fields: [TAGF, VNF, PWF, REFF], bom: c => 'Relais / contacteur bobine ' + (c.props.vnom || 24) + ' V',
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 18]); D.line(ctx, [20, 42, 20, 60]); D.rect(ctx, 6, 18, 28, 24, st(c).on ? ON_FILL : '#fff'); }
});
loadDef('coil_t', 'Relais temporisé', {
  defProps: { tag: 'KT1', power: 3, delay: 3, mode: 'travail' },
  fields: [TAGF, { k: 'delay', label: 'Temporisation (s)', type: 'num', step: 0.1 }, { k: 'mode', label: 'Type', type: 'sel', opts: ['travail', 'repos'] }, VNF, PWF, REFF],
  bom: 'Relais temporisé 24 V DC',
  update(c, S) {
    const s = st(c); const on = c.fault !== 'open' && S.loadOn(c, 'a', 'b');
    let ch = false; if (s.on !== on) { s.on = on; ch = true; }
    const d = +c.props.delay || 0;
    const out = c.props.mode === 'repos' ? (on || !!s.out) : (on && (s.acc || 0) >= d);
    if (S.tags[c.props.tag] !== out) { S.tags[c.props.tag] = out; ch = true; }
    return ch;
  },
  step(c, S, dt) {
    const s = st(c); const d = +c.props.delay || 0;
    if (c.props.mode === 'repos') { if (s.on) { s.out = true; s.acc = 0; } else if (s.out) { s.acc = (s.acc || 0) + dt; if (s.acc >= d) s.out = false; } }
    else { s.acc = s.on ? (s.acc || 0) + dt : 0; }
  },
  draw(ctx, c) {
    const s = st(c); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 18]); D.line(ctx, [20, 42, 20, 60]);
    D.rect(ctx, 6, 18, 28, 24, s.on ? ON_FILL : '#fff');
    ctx.fillStyle = INK; ctx.fillRect(c.props.mode === 'repos' ? 28 : 6, 18, 6, 24);
    if (s.on || s.out) { const d = +c.props.delay || 1; const r = clamp((s.acc || 0) / d, 0, 1); ctx.fillStyle = '#0f62fe'; ctx.fillRect(12, 38, 14 * r, 2); }
  },
  probe: c => ({ 'Temps écoulé': fmt(st(c).acc || 0, 2) + ' s' })
});
loadDef('sol', 'Solénoïde de distributeur', {
  setsTag: true, info: c => 'Commande les distributeurs dont l\'électro-aimant est ' + c.props.tag + ' (clic sur le distributeur : commande manuelle)', defProps: { tag: 'Y1', power: 5 }, fields: [TAGF, VNF, PWF], bom: c => 'Bobine de distributeur ' + (c.props.vnom || 24) + ' V',
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 18]); D.line(ctx, [20, 42, 20, 60]); D.rect(ctx, 6, 18, 28, 24, st(c).on ? ON_FILL : '#fff'); D.line(ctx, [6, 42, 34, 18]); }
});
const LAMPC = { rouge: '#ef4444', vert: '#22c55e', orange: '#f59e0b', bleu: '#3b82f6', blanc: '#f8fafc', jaune: '#facc15' };
loadDef('lamp', 'Voyant', {
  defProps: { tag: 'H1', power: 2, color: 'vert' }, fields: [TAGF, { k: 'color', label: 'Couleur', type: 'sel', opts: Object.keys(LAMPC) }, VNF, PWF], bom: c => 'Voyant lumineux ' + (c.props.vnom || 24) + ' V',
  draw(ctx, c) {
    const on = st(c).on; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 16]); D.line(ctx, [20, 44, 20, 60]);
    if (on) { ctx.save(); ctx.shadowColor = LAMPC[c.props.color] || '#fff'; ctx.shadowBlur = 18; D.circle(ctx, 20, 30, 14, LAMPC[c.props.color]); ctx.restore(); }
    else D.circle(ctx, 20, 30, 14, '#fff');
    D.line(ctx, [10, 20, 30, 40]); D.line(ctx, [30, 20, 10, 40]);
  }
});
loadDef('motor', 'Moteur électrique CC', {
  defProps: { tag: 'M1', power: 60 }, fields: [TAGF, VNF, PWF, REFF], bom: c => (+c.props.vnom >= 110 ? 'Moteur monophasé ' : 'Moteur ') + (c.props.vnom || 24) + ' V',
  step(c, S, dt) { const s = st(c); s.ang = ((s.ang || 0) + (s.on ? dt * 6 : 0)) % (Math.PI * 2); },
  draw(ctx, c) {
    const s = st(c); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 12]); D.line(ctx, [20, 48, 20, 60]);
    D.circle(ctx, 20, 30, 18, s.on ? '#dbeafe' : '#fff'); D.text(ctx, 'M', 20, 28, 13, INK, 'center', true); D.text(ctx, '⎓', 20, 40, 9);
    if (s.on) { const a = s.ang || 0; ctx.strokeStyle = '#2563eb'; D.line(ctx, [20 + 15 * Math.cos(a), 30 + 15 * Math.sin(a), 20 + 11 * Math.cos(a), 30 + 11 * Math.sin(a)]); }
  }
});
loadDef('buzzer', 'Avertisseur sonore', {
  defProps: { tag: 'H2', power: 2 }, fields: [TAGF, VNF, PWF], bom: c => 'Avertisseur ' + (c.props.vnom || 24) + ' V',
  draw(ctx, c) {
    const on = st(c).on; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 20]); D.line(ctx, [20, 44, 20, 60]);
    ctx.beginPath(); ctx.arc(20, 32, 13, Math.PI, 0); ctx.closePath(); ctx.fillStyle = on ? ON_FILL : '#fff'; ctx.fill(); ctx.stroke();
    D.line(ctx, [7, 32, 7, 44, 33, 44, 33, 32]);
    if (on && (Date.now() / 120 | 0) % 2) { ctx.strokeStyle = '#f59e0b'; D.line(ctx, [36, 22, 40, 18]); D.line(ctx, [37, 30, 42, 30]); }
  }
});

/* ---------- Alimentation et mesures électriques ---------- */
def('supply', {
  name: 'Alimentation 24 V DC', cat: 'Électrique — commande', w: 40, h: 80,
  ports: [P('+', 20, 0, 'e'), P('0', 20, 80, 'e')],
  defProps: { tag: 'G1', imax: 5, U: '24' }, fields: [TAGF, { k: 'U', label: 'Tension (V DC)', type: 'sel', opts: ['12', '24', '48'] }, { k: 'imax', label: 'Courant max. (A)', type: 'num', step: 0.5 }, REFF],
  faults: [['off', 'Alimentation hors service']], bom: c => 'Alimentation stabilisée ' + (c.props.U || 24) + ' V DC',
  sources(c, S) { if (c.fault === 'off' || S.trip[c.id]) return []; const U = +c.props.U || 24; return [['+', 'pot', { sys: c.id, re: 0, im: 0, dc: U, ph: '+' }], ['0', 'pot', { sys: c.id, re: 0, im: 0, dc: 0, ph: '0' }]]; },
  press(c, x, y, S) { if (S && S.trip[c.id]) { delete S.trip[c.id]; toast('Protection réarmée'); return true; } },
  draw(ctx, c, S) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 14]); D.line(ctx, [20, 66, 20, 80]);
    const trip = S && S.trip[c.id];
    D.rect(ctx, 2, 14, 36, 52, trip ? '#fee2e2' : '#f8fafc');
    D.text(ctx, '+', 30, 22, 11, '#dc2626', 'center', true); D.text(ctx, '−', 30, 58, 13, '#2563eb', 'center', true);
    D.text(ctx, (c.props.U || 24) + 'V', 18, 36, 10, INK, 'center', true); D.text(ctx, 'DC', 18, 47, 9);
    if (trip) D.text(ctx, '⚡', 10, 58, 11, '#dc2626');
  },
  probe: (c, S) => S ? { 'Courant': fmt(S.current[c.id] || 0, 2) + ' A', 'Protection': S.trip[c.id] ? 'DÉCLENCHÉE (cliquer pour réarmer)' : 'OK' } : {},
  plot: (c, S) => S ? (S.current[c.id] || 0) : 0, plotUnit: 'A'
});
def('vm', {
  name: 'Voltmètre', cat: 'Instruments de mesure', w: 60, h: 60,
  ports: [P('a', 20, 60, 'e', '+'), P('b', 40, 60, 'e', '−')], defProps: { tag: 'V1' }, fields: [TAGF], bom: 'Multimètre',
  val(c, S) { if (!S) return null; const d = S.dV(c, 'a', 'b'); return d == null ? 0 : d; },
  ac(c, S) { const p = S && (S.pot(c, 'a') || S.pot(c, 'b')); return !!(p && Math.hypot(p.re, p.im) > 0.1) || !!(p && /^(L|N|PE|S)/.test(p.ph)); },
  draw(ctx, c, S) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 60, 20, 46]); D.line(ctx, [40, 60, 40, 46]);
    D.rect(ctx, 4, 2, 52, 44, '#1e293b'); ctx.fillStyle = '#a7f3d0'; ctx.fillRect(9, 8, 42, 18);
    const v = this.val(c, S); D.text(ctx, v == null ? '--.-' : fmt(v, v >= 100 ? 0 : 1), 30, 17, 11, '#064e3b', 'center', true);
    D.text(ctx, this.ac(c, S) ? 'V AC' : 'V DC', 30, 36, 9, '#cbd5e1');
  },
  probe(c, S) { return { 'Tension': fmt(this.val(c, S), 1) + (this.ac(c, S) ? ' V AC' : ' V DC') }; },
  plot(c, S) { return this.val(c, S) || 0; }, plotUnit: 'V'
});

/* =====================================================================
   ÉLECTRIQUE — PUISSANCE (réseaux 230 V / 400 V, mono et triphasé)
   Potentiels en phaseurs : V = U/√3 par phase, L1 0°, L2 −120°, L3 +120°
   ===================================================================== */
const PCAT = 'Électrique — puissance';
const ph = (sys, V, deg, label) => ({ sys, re: V * Math.cos(deg * Math.PI / 180), im: V * Math.sin(deg * Math.PI / 180), dc: 0, ph: label });
const mainsReset = { press(c, x, y, S) { if (S && S.trip[c.id]) { delete S.trip[c.id]; toast('Alimentation réarmée'); return true; } } };
def('mains3', Object.assign({
  name: 'Réseau triphasé (3~ + N + PE)', cat: PCAT, w: 200, h: 60, mains: true,
  ports: [P('L1', 20, 60, 'e', 'L1'), P('L2', 60, 60, 'e', 'L2'), P('L3', 100, 60, 'e', 'L3'), P('N', 140, 60, 'e', 'N'), P('PE', 180, 60, 'e', 'PE')],
  defProps: { tag: 'Q0', U: '400', f: '50', imax: 63 },
  fields: [TAGF, { k: 'U', label: 'Tension entre phases (V)', type: 'sel', opts: ['400', '380', '230', '690'], labels: ['400 V (230/400 V)', '380 V (220/380 V, ancien réseau)', '230 V (127/230 V)', '690 V (400/690 V)'] }, { k: 'f', label: 'Fréquence (Hz)', type: 'sel', opts: ['50', '60'] }, { k: 'imax', label: 'Calibre de branchement (A)', type: 'num' }],
  faults: [['phase', 'Perte de la phase L3'], ['low', 'Sous-tension réseau (−20 %)'], ['off', 'Coupure réseau']],
  bom: c => 'Arrivée réseau triphasé ' + c.props.U + ' V ' + c.props.f + ' Hz',
  sources(c, S) {
    if (c.fault === 'off' || S.trip[c.id]) return []; const U = (+c.props.U || 400) * (c.fault === 'low' ? 0.8 : 1), V = U / Math.sqrt(3);
    const o = [['L1', 'pot', ph('grid', V, 0, 'L1')], ['L2', 'pot', ph('grid', V, -120, 'L2')], ['N', 'pot', ph('grid', 0, 0, 'N')], ['PE', 'pot', ph('grid', 0, 0, 'PE')]];
    if (c.fault !== 'phase') o.push(['L3', 'pot', ph('grid', V, 120, 'L3')]); return o;
  },
  draw(ctx, c, S) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 2, 4, 196, 40, S && S.trip[c.id] ? '#fee2e2' : '#f8fafc');
    [['L1', 20, '#92400e'], ['L2', 60, '#111827'], ['L3', 100, '#6b7280'], ['N', 140, '#2563eb'], ['PE', 180, '#16a34a']].forEach(([n, x, col]) => { ctx.strokeStyle = col; D.line(ctx, [x, 44, x, 60]); D.text(ctx, n, x, 36, 9, col, 'center', true); });
    D.text(ctx, '3~ ' + (c.props.U || 400) + ' V  ' + (c.props.f || 50) + ' Hz', 100, 17, 11, INK, 'center', true);
  },
  probe: (c, S) => ({ 'Tension composée': (c.props.U || 400) + ' V', 'Tension simple': fmt((+c.props.U || 400) / Math.sqrt(3), 0) + ' V', 'Courant estimé': S ? fmt(S.current[c.id] || 0, 1) + ' A' : '—', 'Protection': S && S.trip[c.id] ? 'DÉCLENCHÉE (cliquer pour réarmer)' : 'OK' })
}, mainsReset));
def('mains1', Object.assign({
  name: 'Réseau monophasé (L + N + PE)', cat: PCAT, w: 120, h: 60, mains: true,
  ports: [P('L', 20, 60, 'e', 'L'), P('N', 60, 60, 'e', 'N'), P('PE', 100, 60, 'e', 'PE')],
  defProps: { tag: 'Q0', U: '230', f: '50', imax: 32 },
  fields: [TAGF, { k: 'U', label: 'Tension (V)', type: 'sel', opts: ['230', '220', '127', '120', '110'] }, { k: 'f', label: 'Fréquence (Hz)', type: 'sel', opts: ['50', '60'] }, { k: 'imax', label: 'Calibre de branchement (A)', type: 'num' }],
  faults: [['low', 'Sous-tension réseau (−20 %)'], ['off', 'Coupure réseau']],
  bom: c => 'Arrivée réseau monophasé ' + c.props.U + ' V ' + c.props.f + ' Hz',
  sources(c, S) { if (c.fault === 'off' || S.trip[c.id]) return []; const U = (+c.props.U || 230) * (c.fault === 'low' ? 0.8 : 1); return [['L', 'pot', ph('grid', U, 0, 'L1')], ['N', 'pot', ph('grid', 0, 0, 'N')], ['PE', 'pot', ph('grid', 0, 0, 'PE')]]; },
  draw(ctx, c, S) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 2, 4, 116, 40, S && S.trip[c.id] ? '#fee2e2' : '#f8fafc');
    [['L', 20, '#92400e'], ['N', 60, '#2563eb'], ['PE', 100, '#16a34a']].forEach(([n, x, col]) => { ctx.strokeStyle = col; D.line(ctx, [x, 44, x, 60]); D.text(ctx, n, x, 36, 9, col, 'center', true); });
    D.text(ctx, '1~ ' + (c.props.U || 230) + ' V', 60, 17, 11, INK, 'center', true);
  },
  probe: (c, S) => ({ 'Tension': (c.props.U || 230) + ' V AC', 'Courant estimé': S ? fmt(S.current[c.id] || 0, 1) + ' A' : '—' })
}, mainsReset));
// Transformateur et alimentation à découpage : sources isolées alimentées par leur primaire
function convDef(type, name, o) {
  def(type, Object.assign({
    name, cat: PCAT, w: 80, h: 100, mains: true,
    ports: [P('P1', 20, 0, 'e'), P('P2', 60, 0, 'e'), P(o.out[0], 20, 100, 'e'), P(o.out[1], 60, 100, 'e')],
    faults: [['open', 'Enroulement / électronique hors service']],
    update(c, S) {
      const s = st(c), Up = +c.props.Up || 230, d = c.fault === 'open' || s.burnt ? 0 : (dV(S.Vd(c, 'P1'), S.Vd(c, 'P2')) || 0);
      if (d > Up * 1.4 && !s.burnt) { s.burnt = true; S.stickyBanner = S.banner = '💥 ' + (c.props.tag || name) + ' : primaire ' + Up + ' V alimenté sous ' + Math.round(d) + ' V'; }
      const on = !s.burnt && d >= Up * 0.85; if (s.on !== on) { s.on = on; return true; } return false;
    },
    loads: c => st(c).burnt ? [] : [['P1', 'P2', +c.props.va || 100]],
    sources(c, S) { if (!st(c).on || S.trip[c.id]) return []; return o.src(c); }
  }, o));
}
convDef('transfo', 'Transformateur de commande', {
  out: ['S1', 'S2'], defProps: { tag: 'T1', Up: '400', Us: '24', va: 100 },
  fields: [TAGF, { k: 'Up', label: 'Primaire (V)', type: 'sel', opts: ['400', '230'] }, { k: 'Us', label: 'Secondaire (V AC)', type: 'sel', opts: ['12', '24', '48', '110', '230'] }, { k: 'va', label: 'Puissance (VA)', type: 'num' }, REFF],
  bom: c => 'Transformateur de commande ' + c.props.Up + ' V / ' + c.props.Us + ' V ' + c.props.va + ' VA',
  src: c => [['S1', 'pot', ph(c.id, +c.props.Us || 24, 0, 'S1')], ['S2', 'pot', ph(c.id, 0, 0, 'S2')]],
  draw(ctx, c, S) {
    const on = st(c).on; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 22]); D.line(ctx, [60, 0, 60, 22]); D.line(ctx, [20, 78, 20, 100]); D.line(ctx, [60, 78, 60, 100]);
    D.circle(ctx, 40, 38, 18, on ? '#fef9c3' : '#fff'); D.circle(ctx, 40, 62, 18, on ? '#fef9c3' : '#fff'); D.line(ctx, [20, 22, 28, 26]); D.line(ctx, [60, 22, 52, 26]); D.line(ctx, [20, 78, 28, 74]); D.line(ctx, [60, 78, 52, 74]);
    D.text(ctx, c.props.Up + 'V', 76, 30, 8, '#475569', 'left'); D.text(ctx, c.props.Us + 'V', 76, 70, 8, '#475569', 'left');
  }
});
convDef('psu', 'Alimentation 230 V AC → 24 V DC', {
  out: ['+', '0'], defProps: { tag: 'G1', Up: '230', Uout: '24', imax: 5, va: 120 },
  fields: [TAGF, { k: 'Up', label: 'Entrée (V AC)', type: 'sel', opts: ['230', '400'] }, { k: 'Uout', label: 'Sortie (V DC)', type: 'sel', opts: ['12', '24', '48'] }, { k: 'imax', label: 'Courant max. (A)', type: 'num' }, REFF],
  bom: c => 'Alimentation à découpage ' + c.props.Up + ' V AC / ' + c.props.Uout + ' V DC ' + c.props.imax + ' A',
  src: c => [['+', 'pot', { sys: c.id, re: 0, im: 0, dc: +c.props.Uout || 24, ph: '+' }], ['0', 'pot', { sys: c.id, re: 0, im: 0, dc: 0, ph: '0' }]],
  press(c, x, y, S) { if (S && S.trip[c.id]) { delete S.trip[c.id]; toast('Protection réarmée'); return true; } },
  draw(ctx, c, S) {
    const on = st(c).on; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 14]); D.line(ctx, [60, 0, 60, 14]); D.line(ctx, [20, 86, 20, 100]); D.line(ctx, [60, 86, 60, 100]);
    D.rect(ctx, 4, 14, 72, 72, S && S.trip[c.id] ? '#fee2e2' : on ? '#ecfdf5' : '#fff'); D.line(ctx, [4, 86, 76, 14]);
    D.text(ctx, '~', 22, 32, 14, INK); D.text(ctx, '=', 58, 68, 14, INK); D.text(ctx, c.props.Uout + 'V', 56, 50, 8, '#475569');
    D.text(ctx, '+', 30, 94, 9, '#dc2626', 'center', true); D.text(ctx, '−', 70, 94, 10, '#2563eb', 'center', true);
  },
  probe: (c, S) => ({ 'Sortie': st(c).on ? c.props.Uout + ' V DC' : 'coupée', 'Courant': S ? fmt(S.current[c.id] || 0, 2) + ' A' : '—' })
});
// Appareillage multipolaire (pas de 40 px, aligné sur les bornes du réseau)
function polesN(c) { return clamp(+c.props.poles || 3, 1, 4); }
function polesDef(type, name, o) {
  def(type, Object.assign({
    name, cat: PCAT, h: 80,
    size(c) { return { w: polesN(c) * 40 + (o.extraW || 0), h: 80 }; },
    portsFn(c) { const n = polesN(c), out = []; for (let i = 0; i < n; i++) { const x = 20 + i * 40, lb = (o.lbl || ['1', '3', '5', '7']); out.push(P('a' + i, x, 0, 'e', lb[i] || ''), P('b' + i, x, 80, 'e', String(+(lb[i] || 0) + 1))); } return out; },
    links(c) { if (!this.isClosed(c)) return []; const n = polesN(c), l = []; for (let i = 0; i < n; i++) l.push(['a' + i, 'b' + i]); if (this.extraLinks) l.push(...this.extraLinks(c)); return l; },
    draw(ctx, c, S) {
      const n = polesN(c), cl = this.isClosed(c), s = st(c); ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
      for (let i = 0; i < n; i++) {
        const x = 20 + i * 40; D.line(ctx, [x, 0, x, 24]); D.line(ctx, [x, 56, x, 80]); ctx.lineWidth = 2;
        D.line(ctx, cl ? [x, 56, x, 24] : [x, 56, x - 12, 28]); ctx.lineWidth = 1.4;
        if (o.sym === 'breaker') { D.line(ctx, [x - 4, 20, x + 4, 28]); D.line(ctx, [x + 4, 20, x - 4, 28]); }
        if (o.sym === 'contactor') { ctx.beginPath(); ctx.arc(x + 4, 24, 4, Math.PI / 2, Math.PI * 1.5); ctx.stroke(); }
        if (o.sym === 'fuse') { D.rect(ctx, x - 4, 4, 8, 16, s.blown ? '#fecaca' : '#fff'); }
        if (o.sym === 'thermal') { D.line(ctx, [x, 30, x + 6, 30, x + 6, 40, x, 40]); }
      }
      if (n > 1 || o.sym === 'breaker') { D.dash(ctx, 1); ctx.strokeStyle = '#64748b'; D.line(ctx, [cl ? 20 : 8, 42, 20 + (n - 1) * 40 + 4, 42]); D.dash(ctx, 0); }
      ctx.strokeStyle = INK; o.drawExtra && o.drawExtra.call(this, ctx, c, S, n, cl);
    }
  }, o));
}
const tripH = { protect: true, trip(c, why) { st(c).closed = false; st(c).tripped = why || 'Déclenché'; } };
polesDef('breaker', 'Disjoncteur magnéto-thermique', Object.assign({
  sym: 'breaker', defProps: { tag: 'Q1', poles: 3, In: 16, courbe: 'C' },
  fields: [TAGF, { k: 'poles', label: 'Nombre de pôles', type: 'sel', opts: ['1', '2', '3', '4'], labels: ['1P', '1P+N / 2P', '3P', '3P+N / 4P'] }, { k: 'In', label: 'Calibre In (A)', type: 'num' }, { k: 'courbe', label: 'Courbe', type: 'sel', opts: ['B', 'C', 'D'] }, REFF],
  faults: [['stuck', 'Disjoncteur bloqué ouvert'], ['weld', 'Contacts soudés : ne protège plus']],
  bom: c => 'Disjoncteur ' + polesN(c) + 'P ' + c.props.In + ' A courbe ' + c.props.courbe,
  init(c) { st(c).closed = true; },
  isClosed(c) { if (c.fault === 'stuck') return false; if (c.fault === 'weld') return true; return st(c).closed !== false; },
  trip(c, why) { if (c.fault === 'weld') return; st(c).closed = false; st(c).tripped = why; },
  press(c, x, y, S) { const s = st(c); s.closed = !(s.closed !== false); if (s.closed) { s.tripped = null; if (S) S.stickyBanner = ''; } return true; },
  hint: c => st(c).closed !== false ? 'Cliquer : ouvrir le disjoncteur' : 'Cliquer : réarmer / fermer',
  drawExtra(ctx, c, S, n, cl) { const s = st(c); ctx.fillStyle = cl ? '#16a34a' : '#dc2626'; ctx.fillRect(n * 40 - 14, 60, 10, 14); if (s.tripped) D.text(ctx, '⚡', n * 40 - 9, 52, 10, '#dc2626'); },
  probe: c => ({ 'État': st(c).closed !== false ? 'fermé' : 'ouvert' + (st(c).tripped ? ' — ' + st(c).tripped : '') })
}, { protect: true }));
polesDef('rcd', 'Interrupteur / disjoncteur différentiel 30 mA', {
  sym: 'breaker', protect: true, extraW: 20, defProps: { tag: 'Q2', poles: 2, In: 40, idn: 30 },
  fields: [TAGF, { k: 'poles', label: 'Nombre de pôles', type: 'sel', opts: ['2', '4'], labels: ['2P (mono)', '4P (tri + N)'] }, { k: 'In', label: 'Calibre (A)', type: 'num' }, { k: 'idn', label: 'Sensibilité IΔn (mA)', type: 'sel', opts: ['30', '300'] }, REFF],
  faults: [['stuck', 'Bloqué ouvert'], ['nosense', 'Différentiel défectueux (ne détecte plus les fuites)']],
  bom: c => 'Interrupteur différentiel ' + polesN(c) + 'P ' + c.props.In + ' A ' + c.props.idn + ' mA',
  init(c) { st(c).closed = true; },
  isClosed(c) { return c.fault !== 'stuck' && st(c).closed !== false; },
  trip(c, why) { st(c).closed = false; st(c).tripped = why; },
  update(c, S) { if (c.fault === 'nosense' || !this.isClosed(c) || !S.leaks || !S.leaks.size) return false; const n = polesN(c); for (let i = 0; i < n; i++) if (S.leaks.has(S.root(c, 'b' + i))) { this.trip(c, 'Défaut d\'isolement (fuite à la terre)'); S.stickyBanner = S.banner = '⚠ ' + c.props.tag + ' : fuite de courant à la terre détectée — déclenchement'; return true; } return false; },
  press(c, x, y, S) { const s = st(c); s.closed = !(s.closed !== false); if (s.closed) { s.tripped = null; if (S) S.stickyBanner = ''; } return true; },
  hint: c => st(c).closed !== false ? 'Cliquer : ouvrir' : 'Cliquer : réarmer',
  drawExtra(ctx, c, S, n, cl) { const x = n * 40; D.circle(ctx, x + 2, 40, 9, '#fff'); D.text(ctx, 'Δ', x + 2, 40, 9, INK, 'center', true); ctx.fillStyle = cl ? '#16a34a' : '#dc2626'; ctx.fillRect(x - 4, 62, 10, 12); D.text(ctx, c.props.idn + 'mA', x + 2, 76, 7, '#475569'); },
  probe: c => ({ 'État': st(c).closed !== false ? 'fermé' : 'ouvert' + (st(c).tripped ? ' — ' + st(c).tripped : '') })
});
polesDef('fuse', 'Sectionneur porte-fusibles', {
  sym: 'fuse', protect: true, defProps: { tag: 'Q1', poles: 3, In: 10, type: 'aM' },
  fields: [TAGF, { k: 'poles', label: 'Nombre de pôles', type: 'sel', opts: ['1', '2', '3', '4'] }, { k: 'In', label: 'Calibre fusibles (A)', type: 'num' }, { k: 'type', label: 'Type de fusible', type: 'sel', opts: ['aM', 'gG'], labels: ['aM (accompagnement moteur)', 'gG (usage général)'] }, REFF],
  faults: [['blown', 'Un fusible fondu']],
  bom: c => 'Sectionneur porte-fusibles ' + polesN(c) + 'P avec fusibles ' + c.props.type + ' ' + c.props.In + ' A',
  init(c) { st(c).closed = true; },
  isClosed(c) { return st(c).closed !== false && !st(c).blown; },
  links(c) { if (!this.isClosed(c)) return []; const n = polesN(c), l = []; for (let i = 0; i < n; i++) if (!(c.fault === 'blown' && i === n - 1)) l.push(['a' + i, 'b' + i]); return l; },
  trip(c, why) { st(c).blown = true; },
  press(c) { const s = st(c); if (s.blown) { s.blown = false; toast('Fusibles remplacés'); } else s.closed = !(s.closed !== false); return true; },
  hint: c => st(c).blown ? 'Cliquer : remplacer les fusibles' : 'Cliquer : ouvrir / fermer le sectionneur',
  probe: c => ({ 'État': st(c).blown ? 'FUSIBLES FONDUS' : st(c).closed !== false ? 'fermé' : 'ouvert' })
});
polesDef('kmp', 'Contacteur — pôles de puissance', {
  sym: 'contactor', defProps: { tag: 'KM1', poles: 3 }, lbl: ['1', '3', '5', '7'],
  fields: [TAGF, { k: 'poles', label: 'Nombre de pôles', type: 'sel', opts: ['2', '3', '4'] }, REFF],
  faults: [['weld', 'Pôles soudés (restent fermés)'], ['burnt', 'Pôles brûlés (ne ferment plus)']],
  bom: c => 'Contacteur ' + polesN(c) + ' pôles (bobine ' + c.props.tag + ')',
  update: tagUpdate, isClosed(c) { if (c.fault === 'weld') return true; if (c.fault === 'burnt') return false; return !!st(c).act; },
  info: c => 'Pôles commandés par la bobine ' + c.props.tag
});
polesDef('rth', 'Relais thermique', {
  sym: 'thermal', defProps: { tag: 'F2', poles: 3, Ir: 8, motor: 'M1' }, lbl: ['1', '3', '5', '7'],
  fields: [{ k: 'tag', label: 'Repère (contacts 95-96 NF / 97-98 NO : contacts de relais du même repère)', type: 'text' }, { k: 'Ir', label: 'Réglage Ir (A)', type: 'num', step: 0.1 }, { k: 'motor', label: 'Moteur protégé (repère)', type: 'text' }, REFF],
  faults: [['stuck', 'Ne déclenche plus (bilame bloqué)']],
  bom: c => 'Relais de protection thermique réglé à ' + c.props.Ir + ' A',
  isClosed: () => true,
  update(c, S) { const t = !!st(c).trip; if (S.tags[c.props.tag] !== t) { S.tags[c.props.tag] = t; return true; } return false; },
  step(c, S, dt) {
    const s = st(c), m = App.comps.find(o => o.props.tag === c.props.motor && (o.type === 'motor3' || o.type === 'motor')); const I = m ? (st(m).I || 0) : 0, Ir = +c.props.Ir || 8;
    s.heat = Math.max(0, (s.heat || 0) + (I > Ir * 1.05 ? dt * 3 * ((I / Ir) * (I / Ir) - 1) : -dt * 0.8)); // bilame : tolère le courant de démarrage (temps accéléré)
    if (s.heat > 40 && !s.trip && c.fault !== 'stuck') { s.trip = true; S.stickyBanner = S.banner = '🔥 ' + c.props.tag + ' : surcharge du moteur ' + c.props.motor + ' (' + fmt(I, 1) + ' A > Ir ' + Ir + ' A) — déclenchement thermique'; }
  },
  press(c) { const s = st(c); if (s.trip && s.heat < 15) { if (Sim.S) Sim.S.stickyBanner = ''; s.trip = false; toast('Relais thermique réarmé'); return true; } if (s.trip) toast('Attendre le refroidissement du bilame'); },
  hint: c => st(c).trip ? 'Cliquer : réarmer (après refroidissement)' : 'Relais thermique',
  drawExtra(ctx, c, S, n) { D.rect(ctx, 4, 30, n * 40 - 8, 12); ctx.fillStyle = st(c).trip ? '#dc2626' : '#22c55e'; ctx.fillRect(n * 40 - 12, 64, 8, 8); },
  probe: c => ({ 'Échauffement du bilame': fmt(Math.min(100, (st(c).heat || 0) / 40 * 100), 0) + ' %', 'État': st(c).trip ? 'DÉCLENCHÉ (95-96 ouvert, 97-98 fermé)' : 'normal' })
});
def('motor3', {
  name: 'Moteur asynchrone triphasé', cat: PCAT, w: 120, h: 120,
  ports: [P('U', 20, 0, 'e', 'U1'), P('V', 60, 0, 'e', 'V1'), P('W', 100, 0, 'e', 'W1'), P('PE', 120, 80, 'e', 'PE')],
  defProps: { tag: 'M1', pn: 4, plaque: '230/400', couplage: 'étoile', cos: 0.82, eta: 86, charge: 80 },
  fields: [TAGF, { k: 'pn', label: 'Puissance utile Pn (kW)', type: 'num', step: 0.25 }, { k: 'plaque', label: 'Tension plaque (V)', type: 'sel', opts: ['230/400', '400/690'] }, { k: 'couplage', label: 'Couplage des enroulements', type: 'sel', opts: ['étoile', 'triangle'], labels: ['Étoile (Y)', 'Triangle (Δ)'] },
    { k: 'cos', label: 'cos φ', type: 'num', step: 0.01 }, { k: 'eta', label: 'Rendement (%)', type: 'num' }, { k: 'charge', label: 'Charge entraînée (% de Pn)', type: 'num' }, REFF],
  catalog: [{ ref: 'Moteur 0,75 kW 4 pôles 230/400 V', props: { pn: 0.75, cos: 0.75, eta: 79 } }, { ref: 'Moteur 4 kW 4 pôles 230/400 V', props: { pn: 4, cos: 0.82, eta: 86 } }, { ref: 'Moteur 11 kW 4 pôles 400/690 V', props: { pn: 11, cos: 0.85, eta: 90, plaque: '400/690', couplage: 'triangle' } }],
  faults: [['surcharge', 'Surcharge mécanique (frottement, blocage partiel)'], ['coil', 'Enroulement coupé (marche en monophasé)'], ['fuite', 'Défaut d\'isolement : fuite à la terre'], ['iso', 'Défaut franc à la masse']],
  bom: c => 'Moteur asynchrone triphasé ' + c.props.pn + ' kW ' + c.props.plaque + ' V',
  Ur(c) { const y = c.props.couplage !== 'triangle'; return c.props.plaque === '400/690' ? (y ? 690 : 400) : (y ? 400 : 230); },
  In(c) { const U = this.Ur(c); return (+c.props.pn || 4) * 1000 / (Math.sqrt(3) * U * (+c.props.cos || 0.82) * ((+c.props.eta || 86) / 100)); },
  links(c) { return c.fault === 'iso' ? [['U', 'PE']] : []; },
  loads(c) { if (st(c).burnt) return []; const w = (+c.props.pn || 4) * 1000 / ((+c.props.eta || 86) / 100) / 3; return [['U', 'V', w], ['V', 'W', w], ['W', 'U', w]]; },
  update(c, S) {
    const s = st(c), Ur = this.Ur(c), pu = S.Vd(c, 'U'), pv = S.Vd(c, 'V'), pw = c.fault === 'coil' ? null : S.Vd(c, 'W');
    const d = [dV(pu, pv) || 0, dV(pv, pw) || 0, dV(pw, pu) || 0], ok = d.filter(x => x >= 0.8 * Ur).length, mx = Math.max(...d);
    let mode = 'off';
    if (s.burnt) mode = 'off';
    else if (mx > 1.3 * Ur) { s.burnt = true; S.stickyBanner = S.banner = '💥 ' + c.props.tag + ' : enroulements prévus pour ' + Ur + ' V (couplage ' + c.props.couplage + ') alimentés sous ' + Math.round(mx) + ' V — moteur détruit'; mode = 'off'; }
    else if (ok === 3) { const a = x => Math.atan2(x.im, x.re) * 180 / Math.PI; let dd = a(pv) - a(pu); dd = ((dd % 360) + 540) % 360 - 180; mode = dd < 0 ? 'fwd' : 'rev'; }
    else if (d.some(x => x >= 0.8 * Ur)) mode = 'mono';
    else if (Math.max(...d) > 0.3 * Ur) mode = 'low';
    if (c.fault === 'fuite' && mode !== 'off') (S.leaks = S.leaks || new Set()).add(S.root(c, 'U'));
    if (s.mode !== mode) { s.mode = mode; return true; } return false;
  },
  step(c, S, dt) {
    const s = st(c), In = this.In(c), ld = (+c.props.charge || 0) / 100 * (c.fault === 'surcharge' ? 1.8 : 1);
    const target = s.mode === 'fwd' ? 1 : s.mode === 'rev' ? -1 : 0;
    s.n = (s.n || 0) + (target * 1500 * (1 - 0.04 * ld) - (s.n || 0)) * Math.min(1, dt * 2.5);
    s.I = s.mode === 'fwd' || s.mode === 'rev' ? In * (0.35 + 0.65 * ld) * (Math.abs(s.n) < 1200 ? 3 : 1) : s.mode === 'mono' || s.mode === 'low' ? In * 2.2 : 0;
    s.ang = ((s.ang || 0) + s.n / 60 * dt * 0.2 * Math.PI * 2) % (Math.PI * 2);
  },
  draw(ctx, c, S) {
    const s = st(c); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; [20, 60, 100].forEach(x => D.line(ctx, [x, 0, x, 30 + Math.abs(x - 60) * 0.3]));
    D.circle(ctx, 60, 68, 40, s.burnt ? '#e5e7eb' : (s.mode === 'fwd' || s.mode === 'rev') ? '#dbeafe' : s.mode === 'mono' || s.mode === 'low' ? '#fee2e2' : '#fff');
    D.text(ctx, 'M', 60, 60, 18, INK, 'center', true); D.text(ctx, '3~', 60, 82, 12, INK, 'center', true);
    D.line(ctx, [100, 68, 120, 68, 120, 80]); D.line(ctx, [112, 84, 128, 84]); D.line(ctx, [114, 88, 126, 88]); D.line(ctx, [117, 92, 123, 92]);
    if (s.n && Math.abs(s.n) > 30) { ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; ctx.beginPath(); const a = s.ang || 0; ctx.arc(60, 68, 30, a, a + 1.6 * Math.sign(s.n)); ctx.stroke(); D.text(ctx, s.n > 0 ? '↻' : '↺', 92, 40, 14, '#2563eb'); }
    if (s.mode === 'mono' && (Date.now() / 150 | 0) % 2) D.text(ctx, '≈', 60, 112, 12, '#dc2626');
  },
  probe(c, S) { const s = st(c); return { 'Fonctionnement': { fwd: 'Marche — sens horaire', rev: 'Marche — sens inverse', mono: 'Ne démarre pas : marche en monophasé (phase manquante)', low: 'Sous-tension', off: s.burnt ? 'DÉTRUIT (surtension)' : 'Arrêt' }[s.mode || 'off'], 'Vitesse': fmt(s.n || 0, 0) + ' tr/min', 'Courant absorbé': fmt(s.I || 0, 1) + ' A', 'Courant nominal In': fmt(this.In(c), 1) + ' A', 'Réseau adapté': this.Ur(c) + ' V entre phases (couplage ' + c.props.couplage + ')' }; },
  plot: c => st(c).I || 0, plotUnit: 'A'
});
/* ---------- Connexions ---------- */
def('node', { name: 'Nœud / jonction', cat: 'Connexions', w: 20, h: 20, ports: [P('n', 10, 10, 'x')], noLabel: true,
  draw(ctx) { ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(10, 10, 3.5, 0, 7); ctx.fill(); } });
def('offpage', {
  name: 'Renvoi de folio', cat: 'Connexions', w: 60, h: 40, ports: [P('n', 0, 20, 'x')], defProps: { tag: 'L+' }, noLabel: true,
  fields: [{ k: 'tag', label: 'Nom du renvoi (relie les renvois identiques)', type: 'text' }],
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, 20); ctx.lineTo(10, 8); ctx.lineTo(56, 8); ctx.lineTo(56, 32); ctx.lineTo(10, 32); ctx.closePath(); ctx.fillStyle = '#fff7ed'; ctx.fill(); ctx.stroke(); ctx.save(); ctx.translate(33, 20); ctx.rotate(-(c.rot || 0) * Math.PI / 2); D.text(ctx, c.props.tag, 0, 0, 10, INK, 'center', true); ctx.restore(); }
});
def('text', {
  name: 'Texte / annotation', cat: 'Connexions', w: 120, h: 40, ports: [], noLabel: true, defProps: { text: 'Annotation', size: 14 },
  fields: [{ k: 'text', label: 'Texte', type: 'textarea' }, { k: 'size', label: 'Taille', type: 'num' }],
  size(c) { const n = String(c.props.text || '').split('\n'); const s = +c.props.size || 14; return { w: Math.max(40, Math.ceil(Math.max(...n.map(l => l.length)) * s * 0.58 / 10) * 10 + 10), h: Math.ceil(n.length * s * 1.3 / 10) * 10 + 10 }; },
  draw(ctx, c) { const s = +c.props.size || 14; String(c.props.text || '').split('\n').forEach((l, i) => D.text(ctx, l, 5, 5 + s * 0.65 + i * s * 1.3, s, '#334155', 'left')); }
});

/* =====================================================================
   FLUIDIQUE
   ===================================================================== */
const PCOL = { p: '#1677ff', h: '#e03131' };
function fluidStroke(c) { return INK; }

/* ---------- Sources ---------- */
def('compressor', {
  name: 'Source d\'air comprimé', cat: 'Pneumatique', w: 60, h: 60, ports: [P('P', 30, 0, 'p')],
  defProps: { tag: '0Z1', p: 6 }, fields: [TAGF, { k: 'p', label: 'Pression de service (bar)', type: 'num', step: 0.5 }, REFF],
  faults: [['low', 'Pression insuffisante (fuite réseau)']], bom: 'Groupe de conditionnement FRL',
  sources(c) { return [['P', 'pneu', (+c.props.p || 6) * (c.fault === 'low' ? 0.3 : 1)]]; },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [30, 0, 30, 18]); D.circle(ctx, 30, 36, 17, '#fff'); D.tri(ctx, 30, 25, 6, 'u', '#fff'); }
});
def('exhaust', { name: 'Échappement / silencieux', cat: 'Pneumatique', w: 40, h: 40, ports: [P('P', 20, 0, 'p')], noLabel: true,
  sources() { return [['P', 'vent']]; },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 14]); D.tri(ctx, 20, 22, 8, 'd', '#fff'); } });
// Débit pompe : Q (L/min) = Cyl (cm³/tr) × N (tr/min) / 1000 × ηv  —  Puissance : P (kW) = Q × p / 600   (fiches F03A, F05A)
function pumpQ(c) { const p = c.props; if (p.disp) return (+p.disp) * (+p.n || 1450) / 1000 * ((+p.etav || 100) / 100); return +p.q || 20; }
// Pilotage à distance d'un limiteur (orifice X) : X à la bâche → mise à vide ; X vers un petit limiteur → second tarage
function remoteCap(c, S) {
  if (!c.props.rpilot) return null;
  const i = S.info(c, 'X'); if (i.vent) return 5;
  const r = S.root(c, 'X'); let cap = null;
  for (const o of App.comps) if (o !== c && o.type === 'relief' && S.root(o, 'P') === r && S.vent(o, 'T')) cap = Math.min(cap ?? 1e9, +o.props.set || 100);
  return cap;
}
const xcapUpdate = (c, S) => { const v = remoteCap(c, S); if (st(c).xcap !== v) { st(c).xcap = v; return true; } return false; };
const PTYPES = { fixe: 'Cylindrée fixe', variable: 'Cylindrée variable (réglage manuel)', regp: 'Cylindrée variable pilotée — régulée en pression', ls: 'Cylindrée variable pilotée — load-sensing' };
def('pump', {
  name: 'Groupe hydraulique', cat: 'Hydraulique', w: 120, h: 100,
  portsFn(c) { const o = [P('P', 40, 0, 'h', 'P'), P('T', 100, 0, 'h', 'T')]; if (c.props.rpilot) o.push(P('X', 120, 60, 'h', 'X (pilotage du limiteur)')); return o; },
  defProps: { tag: '0P1', ptype: 'fixe', disp: 16, n: 1450, etav: 95, cmd: 100, pc: 100, dls: 20, pmax: 120, plage: 5, rpilot: false },
  fieldsFn: c => [TAGF, { k: 'ptype', label: 'Type de pompe', type: 'sel', opts: Object.keys(PTYPES), labels: Object.values(PTYPES) },
    { k: 'disp', label: c.props.ptype === 'fixe' ? 'Cylindrée (cm³/tr)' : 'Cylindrée maxi (cm³/tr)', type: 'num', step: 0.5 }, { k: 'n', label: 'Régime d\'entraînement (tr/min)', type: 'num' }, { k: 'etav', label: 'Rendement volumétrique (%)', type: 'num' },
    ...(c.props.ptype === 'variable' ? [{ k: 'cmd', label: 'Cylindrée réglée (% du maxi)', type: 'range' }] : []),
    ...(c.props.ptype === 'regp' ? [{ k: 'pc', label: 'Consigne du régulateur de pression (bar)', type: 'num' }] : []),
    ...(c.props.ptype === 'ls' ? [{ k: 'dls', label: 'Δp de stand-by load-sensing (bar)', type: 'num' }] : []),
    { k: 'pmax', label: 'Tarage du limiteur de pression (bar)', type: 'num' }, { k: 'plage', label: 'Plage d\'ouverture du limiteur (% à plein débit)', type: 'num' },
    { k: 'rpilot', label: 'Limiteur piloté (orifice X de pilotage à distance / mise à vide)', type: 'chk' }, REFF],
  catalog: [{ ref: 'Pompe à engrenages 8 cm³/tr — 1450 tr/min', props: { ptype: 'fixe', disp: 8, n: 1450, pmax: 160 } }, { ref: 'Pompe à engrenages 16 cm³/tr — 1450 tr/min', props: { ptype: 'fixe', disp: 16, n: 1450, pmax: 180 } }, { ref: 'Pompe à engrenages 25 cm³/tr — 1450 tr/min', props: { ptype: 'fixe', disp: 25, n: 1450, pmax: 200 } },
    { ref: 'Pompe à engrenages internes 32 cm³/tr — 1450 tr/min', props: { ptype: 'fixe', disp: 32, n: 1450, pmax: 250 } }, { ref: 'Pompe à palettes à cylindrée variable 40 cm³/tr', props: { ptype: 'regp', disp: 40, n: 1450, pc: 100, pmax: 140 } },
    { ref: 'Pompe à pistons axiaux 45 cm³/tr régulée en pression', props: { ptype: 'regp', disp: 45, n: 1800, pc: 210, pmax: 250 } }, { ref: 'Pompe à pistons axiaux 45 cm³/tr load-sensing', props: { ptype: 'ls', disp: 45, n: 1800, dls: 20, pmax: 280 } }],
  faults: [['low', 'Pompe usée (fuites internes : débit réduit)'], ['cav', 'Cavitation : aspiration obstruée / prise d\'air'], ['relief', 'Limiteur de pression déréglé (taré trop bas)'], ['reliefOpen', 'Limiteur de pression bloqué ouvert (clapet pollué)'], ['reg', 'Régulateur de la pompe bloqué en grande cylindrée']],
  bom: c => 'Centrale hydraulique — pompe ' + PTYPES[c.props.ptype || 'fixe'].toLowerCase() + ' ' + c.props.disp + ' cm³/tr, limiteur ' + (c.props.rpilot ? 'piloté' : 'à action directe'),
  srcVal(c) {
    let q = pumpQ(c) * (c.props.ptype === 'variable' ? clamp(+c.props.cmd || 0, 0, 100) / 100 : 1), p = +c.props.pmax || 120;
    if (c.fault === 'low') q *= 0.55; if (c.fault === 'cav') q *= 0.5; if (c.fault === 'relief') p *= 0.3; if (c.fault === 'reliefOpen') p = 4;
    const x = st(c).xcap; if (x != null) p = Math.min(p, x);
    const reg = c.fault === 'reg' ? null : c.props.ptype === 'regp' ? Math.min(+c.props.pc || 100, p) : null, ls = c.fault === 'reg' ? null : c.props.ptype === 'ls' ? (+c.props.dls || 20) : null;
    return { q, p, plage: (+c.props.plage || 0) / 100, reg, ls };
  },
  update: xcapUpdate,
  sources(c) { const v = this.srcVal(c); return [['P', 'hyd', v.p, v.q, v.plage, { reg: v.reg, ls: v.ls }], ['T', 'tank']]; },
  press(c, x, y) {
    if (x > 56 && x < 98 && y > 22 && y < 64) { ask('Tarage du limiteur de pression (bar)', String(c.props.pmax)).then(v => { if (v != null && +v > 0) { c.props.pmax = +v; App.changed(); toast('Limiteur taré à ' + (+v) + ' bar'); } }); return true; }
    if (c.props.ptype === 'variable' && x < 56) { c.props.cmd = ((+c.props.cmd || 0) >= 100 ? 25 : (+c.props.cmd || 0) + 25); Props.render(); return true; }
  },
  hint: (c, x, y) => (x > 56 && x < 98 && y > 22 && y < 64) ? 'Cliquer : modifier le tarage du limiteur (' + c.props.pmax + ' bar)' : c.props.ptype === 'variable' && x < 56 ? 'Cliquer : régler la cylindrée (' + c.props.cmd + ' %)' : PTYPES[c.props.ptype || 'fixe'],
  draw(ctx, c, S) {
    const t = c.props.ptype || 'fixe'; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    D.line(ctx, [40, 0, 40, 38]); D.circle(ctx, 40, 52, 14, '#fff'); D.tri(ctx, 40, 42, 5, 'u', INK);
    D.line(ctx, [40, 66, 40, 84]); D.line(ctx, [26, 52, 12, 52]);
    D.line(ctx, [8, 44, 8, 60]); D.text(ctx, 'M', 4, 70, 9, INK, 'center', true);
    if (t !== 'fixe') D.arrow(ctx, 26, 68, 56, 36, 5); // cylindrée variable
    if (t === 'regp' || t === 'ls') { // pilotage du plateau
      D.dash(ctx, 1); D.line(ctx, [40, 26, 16, 26, 16, 32]); D.dash(ctx, 0); D.rect(ctx, 10, 32, 12, 9, '#fff'); D.arrow(ctx, 22, 37, 28, 42, 3);
      D.text(ctx, t === 'ls' ? 'LS' : 'p', 14, 20, 8, '#475569', 'center', true);
    }
    if (t === 'variable') D.text(ctx, (c.props.cmd | 0) + '%', 36, 78, 8, '#1d4ed8', 'right', true);
    const lam = S && S.lam.get(S.root(c, 'P')) > 0.05;
    // limiteur de pression : normalement fermé, pilotage amont contre le ressort, flèche vers le réservoir
    D.line(ctx, [40, 20, 72, 20, 72, 30]); D.rect(ctx, 64, 30, 16, 26, lam ? '#fecaca' : '#fff'); D.arrow(ctx, 70, 34, 70, 52, 4); D.spring(ctx, 80, 43, 92, 4); D.line(ctx, [88, 36, 94, 50]);
    D.dash(ctx, 1); D.line(ctx, [60, 20, 60, 36, 64, 36]); D.dash(ctx, 0);
    if (c.props.rpilot) { ctx.strokeStyle = '#7c3aed'; D.dash(ctx, 1); D.line(ctx, [92, 43, 108, 43, 108, 60, 120, 60]); D.dash(ctx, 0); D.text(ctx, 'X', 114, 54, 8, '#7c3aed', 'center', true); ctx.strokeStyle = INK; }
    D.line(ctx, [72, 56, 72, 84]); D.line(ctx, [100, 0, 100, 84]);
    ctx.beginPath(); ctx.moveTo(30, 80); ctx.lineTo(30, 96); ctx.lineTo(112, 96); ctx.lineTo(112, 80); ctx.stroke();
    D.text(ctx, 'P', 46, 8, 8, '#64748b'); D.text(ctx, 'T', 106, 8, 8, '#64748b'); D.text(ctx, (st(c).xcap != null ? st(c).xcap : c.props.pmax) + ' bar', 87, 64, 6, '#64748b');
    if (lam && (Date.now() / 200 | 0) % 2) D.text(ctx, '≈', 88, 72, 12, '#dc2626', 'center', true);
  },
  probe(c, S) {
    const v = this.srcVal(c), o = { 'Type': PTYPES[c.props.ptype || 'fixe'], 'Débit maxi (Cyl × N / 1000 × ηv)': fmt(v.q, 1) + ' L/min', 'Tarage limiteur': fmt(v.p, 0) + ' bar' + (st(c).xcap != null ? ' (piloté par X)' : ''), 'Pression à plein débit': fmt(v.p * (1 + v.plage), 0) + ' bar' };
    if (v.reg != null) o['Consigne régulateur'] = v.reg + ' bar (la pompe réduit son débit, pas de laminage)'; if (v.ls != null) o['Stand-by LS'] = v.ls + ' bar au-dessus de la charge';
    if (S) { const r = S.root(c, 'P'), p = S.P(c, 'P'); o['Pression refoulement (M1)'] = fmt(p, 1) + ' bar'; o['Débit refoulé'] = fmt(S.flow.get(r) || 0, 1) + ' L/min'; o['Puissance hydraulique Q×p/600'] = fmt((S.flow.get(r) || 0) * p / 600 + (S.lam.get(r) || 0), 2) + ' kW'; const lam = S.lam.get(r) || 0; o['Laminage au limiteur'] = lam > 0.05 ? fmt(lam, 2) + ' kW → échauffement de l\'huile' : 'non'; o['Température huile'] = fmt(S.oilT, 1) + ' °C'; o['Viscosité estimée (ISO VG 46)'] = fmt(S.visc, 1) + ' cSt' + (S.visc < 15 ? ' (trop faible)' : ''); }
    return o;
  },
  plot: (c, S) => S ? S.P(c, 'P') : 0, plotUnit: 'bar'
});
/* Pompe seule (sans limiteur ni réservoir intégrés) : on câble soi-même aspiration, limiteur, drain */
const PTECH = { engr: 'à engrenages externes', engri: 'à engrenages internes', pal: 'à palettes', pax: 'à pistons axiaux', prad: 'à pistons radiaux', vis: 'à vis' };
def('hpump', {
  name: 'Pompe hydraulique seule', cat: 'Hydraulique', w: 80, h: 100,
  portsFn(c) { const o = [P('P', 40, 0, 'h', 'P (refoulement)'), P('S', 40, 100, 'h', 'S (aspiration)')]; if ((c.props.ptype || 'fixe') !== 'fixe' || c.props.drain) o.push(P('L', 80, 74, 'h', 'L (drain carter)')); return o; },
  defProps: { tag: '0P1', ptype: 'fixe', tech: 'engr', disp: 16, n: 1450, etav: 95, cmd: 100, pc: 160, dls: 20, padm: 250, mot: '', drain: false },
  fieldsFn: c => [TAGF, { k: 'ptype', label: 'Type de pompe', type: 'sel', opts: Object.keys(PTYPES), labels: Object.values(PTYPES) },
    { k: 'tech', label: 'Technologie', type: 'sel', opts: Object.keys(PTECH), labels: Object.values(PTECH).map(t => 'Pompe ' + t) },
    { k: 'disp', label: (c.props.ptype || 'fixe') === 'fixe' ? 'Cylindrée (cm³/tr)' : 'Cylindrée maxi (cm³/tr)', type: 'num', step: 0.5 }, { k: 'n', label: 'Régime d\'entraînement (tr/min)', type: 'num' }, { k: 'etav', label: 'Rendement volumétrique (%)', type: 'num' },
    ...(c.props.ptype === 'variable' ? [{ k: 'cmd', label: 'Cylindrée réglée (% du maxi)', type: 'range' }] : []),
    ...(c.props.ptype === 'regp' ? [{ k: 'pc', label: 'Consigne du régulateur de pression (bar)', type: 'num' }] : []),
    ...(c.props.ptype === 'ls' ? [{ k: 'dls', label: 'Δp de stand-by load-sensing (bar)', type: 'num' }, { k: 'pc', label: 'Coupure de pression (cut-off, bar)', type: 'num' }] : []),
    { k: 'padm', label: 'Pression maxi admissible par la pompe (bar)', type: 'num' },
    { k: 'mot', label: 'Entraînée par le moteur électrique (repère, vide = entraînement permanent)', type: 'text' },
    ...((c.props.ptype || 'fixe') === 'fixe' ? [{ k: 'drain', label: 'Drain de carter externe (orifice L)', type: 'chk' }] : []), REFF],
  catalog: [{ ref: 'Pompe à engrenages externes 8 cm³/tr', props: { ptype: 'fixe', tech: 'engr', disp: 8, padm: 200 } }, { ref: 'Pompe à engrenages externes 16 cm³/tr', props: { ptype: 'fixe', tech: 'engr', disp: 16, padm: 210 } },
    { ref: 'Pompe à engrenages internes 32 cm³/tr', props: { ptype: 'fixe', tech: 'engri', disp: 32, padm: 280 } }, { ref: 'Pompe à palettes fixe 20 cm³/tr', props: { ptype: 'fixe', tech: 'pal', disp: 20, padm: 160 } },
    { ref: 'Pompe à palettes variable régulée 40 cm³/tr', props: { ptype: 'regp', tech: 'pal', disp: 40, pc: 100, padm: 160 } }, { ref: 'Pompe à pistons axiaux variable 45 cm³/tr (manuelle)', props: { ptype: 'variable', tech: 'pax', disp: 45, n: 1800, padm: 350 } },
    { ref: 'Pompe à pistons axiaux 71 cm³/tr régulée en pression', props: { ptype: 'regp', tech: 'pax', disp: 71, n: 1800, pc: 210, padm: 350 } }, { ref: 'Pompe à pistons axiaux 45 cm³/tr load-sensing', props: { ptype: 'ls', tech: 'pax', disp: 45, n: 1800, dls: 20, pc: 250, padm: 350 } },
    { ref: 'Pompe à pistons radiaux 10 cm³/tr', props: { ptype: 'fixe', tech: 'prad', disp: 10, padm: 500 } }, { ref: 'Pompe à vis 60 cm³/tr (silencieuse)', props: { ptype: 'fixe', tech: 'vis', disp: 60, padm: 100 } }],
  faults: [['low', 'Pompe usée (fuites internes : débit réduit)'], ['cav', 'Cavitation : aspiration obstruée / crépine colmatée'], ['reg', 'Régulateur bloqué en grande cylindrée'], ['shaft', 'Accouplement cassé (la pompe ne tourne plus)']],
  bom: c => 'Pompe hydraulique ' + PTECH[c.props.tech || 'engr'] + ' — ' + PTYPES[c.props.ptype || 'fixe'].toLowerCase() + ' ' + c.props.disp + ' cm³/tr',
  speed(c) { // régime réel : moteur électrique associé ou entraînement permanent
    if (c.fault === 'shaft') return 0; const n = +c.props.n || 1450; if (!c.props.mot) return n;
    const m = App.comps.find(o => o.props.tag === c.props.mot && (o.type === 'motor3' || o.type === 'motor' || o.type === 'motorf')); if (!m) return n;
    const s = st(m); if (m.type === 'motor3') return n * Math.min(1, Math.abs(s.n || 0) / 1440); return n * (s.on || s.run || s.act || Math.abs(s.spd || 0) > 0.1 ? 1 : 0);
  },
  srcVal(c) {
    const t = c.props.ptype || 'fixe', s = st(c), nr = this.speed(c);
    let q = (+c.props.disp || 16) * nr / 1000 * ((+c.props.etav || 95) / 100) * (t === 'variable' ? clamp(+c.props.cmd || 0, 0, 100) / 100 : 1);
    if (c.fault === 'low') q *= 0.55; if (c.fault === 'cav') q *= 0.5; if (s.dry) q = 0;
    const reg = c.fault === 'reg' ? null : t === 'regp' ? (+c.props.pc || 160) : null, ls = c.fault === 'reg' ? null : t === 'ls' ? (+c.props.dls || 20) : null;
    let p = +c.props.padm || 250; if (t === 'ls' && c.fault !== 'reg') p = Math.min(p, +c.props.pc || p);
    return { q, p, reg, ls, nr };
  },
  update(c, S) { const dry = !S.vent(c, 'S'); if (st(c).dry !== dry) { st(c).dry = dry; return true; } return false; },
  sources(c) { const v = this.srcVal(c); const o = v.q > 0.01 ? [['P', 'hyd', v.p, v.q, 0, { reg: v.reg, ls: v.ls, norel: true }]] : []; if (compPorts(c).some(p => p.id === 'L')) o.push(['L', 'tank']); return o; },
  step(c, S) {
    const s = st(c), v = this.srcVal(c); if (s.dry && v.nr > 0 && !s.warnDry) { s.warnDry = 1; S.stickyBanner = S.banner = '⚠ Pompe ' + c.props.tag + ' : aspiration S non reliée au réservoir — la pompe tourne à sec (cavitation, destruction)'; }
    if (!s.dry) s.warnDry = 0;
    const p = S.P(c, 'P'), lim = +c.props.padm || 250;
    if (v.q > 0.01 && v.reg == null && p >= lim * 0.97 && !s.warnP) { s.warnP = 1; S.stickyBanner = S.banner = '💥 Pompe ' + c.props.tag + ' : ' + Math.round(p) + ' bar ≥ pression maxi admissible ' + lim + ' bar — aucun limiteur de pression ne protège le refoulement (casse pompe / flexibles)' + ((r => r ? ' : le limiteur ' + r.props.tag + ' est monté en série, son orifice T doit aller au réservoir' : '')(App.comps.find(o => o.type === 'relief' && st(o).ser))); }
    if (p < lim * 0.9) s.warnP = 0;
  },
  press(c) { if (c.props.ptype === 'variable') { c.props.cmd = ((+c.props.cmd || 0) >= 100 ? 0 : (+c.props.cmd || 0) + 25); Props.render(); return true; } },
  hint: c => c.props.ptype === 'variable' ? 'Cliquer : régler la cylindrée (' + c.props.cmd + ' %)' : 'Pompe ' + PTECH[c.props.tech || 'engr'] + ' — ' + PTYPES[c.props.ptype || 'fixe'],
  draw(ctx, c, S) {
    const t = c.props.ptype || 'fixe', s = st(c), run = S && this.speed(c) > 0 && !s.dry; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    D.line(ctx, [40, 0, 40, 30]); D.line(ctx, [40, 70, 40, 100]);
    D.circle(ctx, 40, 50, 20, run ? '#dbeafe' : '#fff'); D.tri(ctx, 40, 35, 5, 'u', INK);
    D.line(ctx, [20, 50, 4, 50]); D.line(ctx, [8, 44, 8, 56]); D.line(ctx, [4, 44, 4, 56]); // arbre d'entraînement
    if (run) { const a = (S.t * 8) % (Math.PI * 2); D.line(ctx, [40 + Math.cos(a) * 9, 50 + Math.sin(a) * 9, 40 - Math.cos(a) * 9, 50 - Math.sin(a) * 9]); ctx.beginPath(); ctx.arc(40, 50, 26, -0.6, 0.6); ctx.stroke(); }
    if (t !== 'fixe') D.arrow(ctx, 22, 70, 60, 28, 5);
    if (t === 'regp' || t === 'ls') { D.dash(ctx, 1); D.line(ctx, [40, 12, 66, 12, 66, 22]); D.dash(ctx, 0); D.rect(ctx, 60, 22, 12, 9, '#fff'); D.arrow(ctx, 60, 27, 54, 32, 3); D.text(ctx, t === 'ls' ? 'LS' : 'p', 76, 8, 8, '#475569', 'center', true); }
    if (compPorts(c).some(p => p.id === 'L')) { D.dash(ctx, 1); D.line(ctx, [52, 66, 52, 74, 80, 74]); D.dash(ctx, 0); D.text(ctx, 'L', 74, 82, 8, '#64748b'); }
    if (t === 'variable') D.text(ctx, (c.props.cmd | 0) + '%', 76, 50, 8, '#1d4ed8', 'right', true);
    D.text(ctx, 'P', 48, 6, 8, '#64748b'); D.text(ctx, 'S', 48, 94, 8, '#64748b');
    if (S && s.dry && (Date.now() / 250 | 0) % 2) D.text(ctx, '!', 26, 86, 12, '#dc2626', 'center', true);
  },
  probe(c, S) {
    const v = this.srcVal(c), o = { 'Type': 'Pompe ' + PTECH[c.props.tech || 'engr'] + ' — ' + PTYPES[c.props.ptype || 'fixe'], 'Régime': fmt(v.nr, 0) + ' tr/min', 'Débit (Cyl × N / 1000 × ηv)': fmt(v.q, 1) + ' L/min', 'Pression maxi admissible': c.props.padm + ' bar' };
    if (v.reg != null) o['Consigne régulateur'] = v.reg + ' bar'; if (v.ls != null) o['Stand-by LS'] = v.ls + ' bar (cut-off ' + v.p + ' bar)';
    if (S) { const r = S.root(c, 'P'), p = S.P(c, 'P'); o['Pression refoulement'] = fmt(p, 1) + ' bar'; o['Débit refoulé'] = fmt(S.flow.get(r) || 0, 1) + ' L/min'; o['Puissance hydraulique Q×p/600'] = fmt((S.flow.get(r) || 0) * p / 600, 2) + ' kW'; o['Aspiration'] = st(c).dry ? 'NON RELIÉE AU RÉSERVOIR' : 'alimentée'; }
    return o;
  },
  plot: (c, S) => S ? S.P(c, 'P') : 0, plotUnit: 'bar'
});
def('tank', { name: 'Retour réservoir', cat: 'Hydraulique', w: 60, h: 40, ports: [P('T', 30, 0, 'h')], noLabel: true,
  sources() { return [['T', 'tank']]; },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [30, 0, 30, 30]); D.line(ctx, [8, 18, 8, 34, 52, 34, 52, 18]); } });

/* ---------- Distributeurs ---------- */
const VT = {
  v22: { name: '2/2', top: [['2', 40]], bot: [['1', 40]], boxes: [[['1', '2']], []] },
  v32: { name: '3/2 NF', top: [['2', 20]], bot: [['1', 20], ['3', 60]], boxes: [[['1', '2']], [['2', '3']]], vent: ['3'] },
  v32o: { name: '3/2 NO', top: [['2', 20]], bot: [['1', 20], ['3', 60]], boxes: [[['2', '3']], [['1', '2']]], vent: ['3'] },
  v52: { name: '5/2', top: [['4', 20], ['2', 60]], bot: [['5', 20], ['1', 40], ['3', 60]], boxes: [[['1', '4'], ['2', '3']], [['1', '2'], ['4', '5']]], vent: ['3', '5'] },
  v53: { name: '5/3 centre fermé', top: [['4', 20], ['2', 60]], bot: [['5', 20], ['1', 40], ['3', 60]], boxes: [[['1', '4'], ['2', '3']], [], [['1', '2'], ['4', '5']]], vent: ['3', '5'] },
  v42: { name: '4/2', top: [['A', 20], ['B', 60]], bot: [['P', 20], ['T', 60]], boxes: [[['P', 'A'], ['B', 'T']], [['P', 'B'], ['A', 'T']]] },
  v43c: { name: '4/3 centre fermé', top: [['A', 20], ['B', 60]], bot: [['P', 20], ['T', 60]], boxes: [[['P', 'A'], ['B', 'T']], [], [['P', 'B'], ['A', 'T']]] },
  v43t: { name: '4/3 centre tandem (P→T)', top: [['A', 20], ['B', 60]], bot: [['P', 20], ['T', 60]], boxes: [[['P', 'A'], ['B', 'T']], [['P', 'T']], [['P', 'B'], ['A', 'T']]] },
  v43o: { name: '4/3 centre ouvert (H)', top: [['A', 20], ['B', 60]], bot: [['P', 20], ['T', 60]], boxes: [[['P', 'A'], ['B', 'T']], [['P', 'T'], ['A', 'T'], ['B', 'T']], [['P', 'B'], ['A', 'T']]] },
  v43p: { name: '4/3 centre P vers A et B (différentiel)', top: [['A', 20], ['B', 60]], bot: [['P', 20], ['T', 60]], boxes: [[['P', 'A'], ['B', 'T']], [['P', 'A'], ['P', 'B']], [['P', 'B'], ['A', 'T']]] },
  v43f: { name: '4/3 centre A et B vers T (Y)', top: [['A', 20], ['B', 60]], bot: [['P', 20], ['T', 60]], boxes: [[['P', 'A'], ['B', 'T']], [['A', 'T'], ['B', 'T']], [['P', 'B'], ['A', 'T']]] },
};
const AW = 40, BW = 80;
function vt(c) { return VT[c.props.vt] || VT.v32; }
function vRest(c) { return 1; }
const isPil = a => a === 'pilot' || a === 'pilotP' || a === 'pilotH';
function acts(c, side) { const a = c.props['a' + side], x = c.props['x' + side]; return x && x !== a ? [a, x] : [a]; }
function pilotKind(c, side) { const p = acts(c, side).find(isPil); if (!p) return null; return p === 'pilotH' ? 'h' : p === 'pilotP' ? 'p' : medK(c); }
function aw(c, side) { const a = c.props['a' + side]; return (c.props['x' + side] && a !== 'spring' && a !== 'none') ? 66 : AW; }
function vActive(c, side, S) {
  const s = st(c); if (s.ovr && s.ovr[side]) return true;
  return acts(c, side).some(a => {
    if (a === 'button' || a === 'lever') return !!(s.man && s.man[side]);
    if (a === 'sol') { if (c.fault === 'solHS' || c.fault === 'sol' + side) return false; const t = c.props['t' + side]; return !!(S && t && S.tags[t]); }
    if (isPil(a)) return !!(S && S.P(c, 'p' + side) > 0.2);
    if (a === 'roller') return cylAt(S, c.props['cyl' + side], c.props['cpos' + side]);
    return false;
  });
}
const ACT_O = ['button', 'lever', 'sol', 'pilotP', 'pilotH', 'roller'], ACT_L = ['Bouton poussoir', 'Levier à crans', 'Électro-aimant', 'Pilotage pneumatique', 'Pilotage hydraulique', 'Galet (came de vérin)'];
const XT_O = ['', 'sol', 'pilotP', 'pilotH', 'button'], XT_L = ['Aucune', 'Électrique (électro-aimant)', 'Pneumatique (pilotage)', 'Hydraulique (pilotage)', 'Manuelle (bouton)'];
const hasA = (c, side, t) => acts(c, side).includes(t);
function valveFields() {
  const F = [TAGF, { k: 'vt', label: 'Type', type: 'sel', opts: Object.keys(VT), labels: Object.values(VT).map(v => v.name) }];
  [['L', 'gauche'], ['R', 'droite']].forEach(([S_, n]) => {
    F.push(S_ === 'L' ? { k: 'aL', label: 'Commande ' + n, type: 'sel', opts: ACT_O, labels: ACT_L }
      : { k: 'aR', label: 'Commande ' + n, type: 'sel', opts: ['spring', ...ACT_O, 'none'], labels: ['Rappel par ressort', ...ACT_L, 'Aucune (mémoire)'] });
    F.push({ k: 'x' + S_, label: 'Pilotage supplémentaire ' + n, type: 'sel', opts: XT_O, labels: XT_L, when: c => c.props['a' + S_] !== 'spring' && c.props['a' + S_] !== 'none' });
    F.push({ k: 't' + S_, label: 'Repère électro-aimant ' + n, type: 'text', when: c => hasA(c, S_, 'sol') });
    F.push({ k: 'cyl' + S_, label: 'Galet ' + n + ' : vérin', type: 'text', when: c => hasA(c, S_, 'roller') });
    F.push({ k: 'cpos' + S_, label: 'Galet ' + n + ' : position', type: 'sel', opts: ['rentré', 'sorti'], when: c => hasA(c, S_, 'roller') });
  });
  F.push(REFF); return F;
}
def('valve', {
  name: 'Distributeur', cat: null, h: 80,
  size(c) { return { w: aw(c, 'L') + vt(c).boxes.length * BW + aw(c, 'R'), h: 80 }; },
  portsFn(c) {
    const V = vt(c), k = medK(c), x0 = aw(c, 'L') + vRest(c) * BW, w = this.size(c).w, out = [];
    V.top.forEach(([id, x]) => out.push(P(id, x0 + x, 0, k))); V.bot.forEach(([id, x]) => out.push(P(id, x0 + x, 80, k)));
    const kl = pilotKind(c, 'L'), kr = pilotKind(c, 'R');
    if (kl) out.push(P('pL', 0, 40, kl, 'pilotage')); if (kr) out.push(P('pR', w, 40, kr, 'pilotage'));
    return out;
  },
  defProps: { tag: '1V1', vt: 'v52', medium: 'pneu', aL: 'button', aR: 'spring', tL: 'Y1', tR: 'Y2' },
  fieldsFn: valveFields,
  faultsFn(c) {
    const f = [['stuckRest', 'Tiroir bloqué en position repos'], ['stuckAct', 'Tiroir bloqué en position actionnée']];
    if (hasA(c, 'L', 'sol')) f.push(['solL', 'Électro-aimant ' + (c.props.tL || 'gauche') + ' défectueux (bobine coupée)']);
    if (hasA(c, 'R', 'sol')) f.push(['solR', 'Électro-aimant ' + (c.props.tR || 'droit') + ' défectueux (bobine coupée)']);
    if (c.fault === 'solHS') f.push(['solHS', 'Électro-aimants défectueux']);
    f.push(['leak', 'Fuite interne du tiroir']); return f;
  },
  bom: c => 'Distributeur ' + vt(c).name + (c.props.medium === 'hyd' ? ' hydraulique' : ' pneumatique'),
  init(c) { const s = st(c); s.pos = vRest(c); s.man = { L: false, R: false }; },
  update(c, S) {
    const s = st(c), V = vt(c), nb = V.boxes.length; if (s.pos == null) this.init(c);
    let pos = s.pos;
    if (c.fault === 'stuckRest') pos = vRest(c);
    else if (c.fault === 'stuckAct') pos = 0;
    else {
      const L = vActive(c, 'L', S), R = vActive(c, 'R', S);
      if (nb === 3) pos = (L && !R) ? 0 : (R && !L) ? 2 : (c.props.aR === 'none' ? pos : 1);
      else if (L && !R) pos = 0; else if (R && !L) pos = 1; else if (!L && !R && c.props.aR === 'spring') pos = 1;
    }
    if (pos !== s.pos) { s.pos = pos; return true; } return false;
  },
  links(c) { const s = st(c), V = vt(c); const l = (V.boxes[s.pos ?? 1] || []).map(x => [x[0], x[1]]); if (c.fault === 'leak') { const all = V.top.concat(V.bot).map(p => p[0]); l.push([all[0], all[all.length - 1], 0.15]); } return l; },
  sources(c) { return c.props.medium === 'hyd' ? [] : (vt(c).vent || []).map(p => [p, 'vent']); },
  // clic côté gauche / droit : bouton maintenu, levier à crans, ou commande manuelle de secours
  // (électro-aimant, pilotage, galet) tant que le clic est maintenu
  // zone cliquable : boutons fixes sous les commandes + commandes à leur position animée (le tiroir glisse)
  vShift(c) { return (vRest(c) - (st(c).pos ?? 1)) * BW; },
  extraRects(c) { return [{ x: this.vShift(c), y: 0, w: this.size(c).w, h: 80 }]; },
  pressSide(c, x, y) {
    const { w } = this.size(c); let side;
    if (y >= 62 && (x < aw(c, 'L') || x > w - aw(c, 'R'))) side = x < w / 2 ? 'L' : 'R';
    else side = x < w / 2 + this.vShift(c) ? 'L' : 'R';
    const a = c.props['a' + side]; return (a === 'spring' || a === 'none') ? null : side;
  },
  press(c, x, y) {
    const s = st(c); if (!s.man) s.man = { L: false, R: false }; if (!s.ovr) s.ovr = { L: false, R: false };
    const side = this.pressSide(c, x, y); if (!side) return; const a = c.props['a' + side];
    if (a === 'lever') { const o = side === 'L' ? 'R' : 'L'; s.man[side] = !s.man[side]; s.man[o] = false; return true; }
    if (a === 'button') { s.man[side] = true; s._held = ['man', side]; return true; }
    s.ovr[side] = true; s._held = ['ovr', side]; return true;
  },
  release(c) { const s = st(c); if (s._held) { s[s._held[0]][s._held[1]] = false; s._held = null; return true; } },
  hint(c, x, y) { const side = this.pressSide(c, x, y); if (!side) return 'Rappel par ressort'; const a = c.props['a' + side], n = side === 'L' ? 'gauche' : 'droite'; if (a === 'lever') return 'Cliquer : basculer le levier ' + n; if (a === 'button') return 'Maintenir : bouton ' + n; if (a === 'sol' || hasA(c, side, 'sol')) return 'Maintenir : commande manuelle de l\'électro-aimant ' + (c.props['t' + side] || n); if (isPil(a)) return 'Maintenir : commande manuelle du pilotage ' + n; return 'Maintenir : actionner le galet ' + n; },
  draw(ctx, c, S) {
    const V = vt(c), nb = V.boxes.length, s = st(c), pos = s.pos ?? 1, AWL = aw(c, 'L'), w = this.size(c).w, hyd = c.props.medium === 'hyd';
    const shift = (vRest(c) - pos) * BW; // les cases glissent pour aligner la position active sur les orifices
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    const x0r = AWL + vRest(c) * BW;
    // orifices (fixes)
    V.top.forEach(([id, x]) => D.line(ctx, [x0r + x, 0, x0r + x, 20]));
    V.bot.forEach(([id, x]) => { D.line(ctx, [x0r + x, 60, x0r + x, 80]); if (!hyd && (V.vent || []).includes(id) && !(S ? S.connected(c, id) : wireAt(c, id))) D.tri(ctx, x0r + x, 70, 5, 'd', '#fff'); });
    ctx.save(); ctx.translate(shift, 0);
    for (let b = 0; b < nb; b++) {
      const bx = AWL + b * BW; ctx.lineWidth = 1.6; ctx.strokeStyle = INK;
      D.rect(ctx, bx, 20, BW, 40, b === pos && S ? '#eef6ff' : '#fff');
      const links = V.boxes[b], used = new Set();
      ctx.strokeStyle = b === pos && S ? (hyd ? '#c2410c' : '#1d4ed8') : INK; ctx.lineWidth = 1.4;
      const px = id => { const t = V.top.find(p => p[0] === id); if (t) return [bx + t[1], 'top']; const q = V.bot.find(p => p[0] === id); return [bx + q[1], 'bot']; };
      links.forEach(([a, bb]) => {
        used.add(a); used.add(bb); const [xa, sa] = px(a), [xb, sb] = px(bb);
        const ya = sa === 'top' ? 23 : 57, yb = sb === 'top' ? 23 : 57;
        if (sa === sb) { const yi = sa === 'top' ? 33 : 47; D.line(ctx, [xa, ya, xa, yi, xb, yi]); D.arrow(ctx, xb, yi, xb, yb, 5); }
        else D.arrow(ctx, xa, ya, xb, yb, 6);
      });
      ctx.strokeStyle = INK;
      V.top.concat(V.bot).forEach(([id]) => { if (used.has(id)) return; const [x, sd] = px(id); const y = sd === 'top' ? 20 : 60, d = sd === 'top' ? 1 : -1; D.line(ctx, [x, y, x, y + 8 * d]); D.line(ctx, [x - 5, y + 8 * d, x + 5, y + 8 * d]); });
    }
    drawActuators(ctx, c, 'L', AWL, S); drawActuators(ctx, c, 'R', AWL + nb * BW, S);
    ctx.restore();
    ['L', 'R'].forEach(sd => { const i = acts(c, sd).findIndex(isPil); if (i < 0) return; const e = sd === 'L' ? AWL + shift - 15 - i * 24 : AWL + nb * BW + shift + 15 + i * 24; const pk = pilotKind(c, sd); ctx.strokeStyle = pk === 'h' ? '#b91c1c' : '#2563eb'; D.dash(ctx, 1); D.line(ctx, [sd === 'L' ? 0 : w, 40, e, 40]); D.dash(ctx, 0); });
    V.top.forEach(([id, x]) => D.text(ctx, id, x0r + x + 7, 9, 8, '#64748b'));
    V.bot.forEach(([id, x]) => D.text(ctx, id, x0r + x + 7, 72, 8, '#64748b'));
    if (S) ['L', 'R'].forEach(sd => { // boutons de commande fixes, toujours au même endroit pendant l'animation
      const a = c.props['a' + sd]; if (a === 'spring' || a === 'none') return;
      const bw = aw(c, sd) - 6, bx = sd === 'L' ? 3 : w - 3 - bw, on = vActive(c, sd, S);
      const lb = hasA(c, sd, 'sol') ? (c.props['t' + sd] || 'Y') : { button: 'BP', lever: 'Levier', roller: 'Galet', pilotP: 'Pilote', pilotH: 'Pilote', pilot: 'Pilote' }[a] || '';
      ctx.save(); ctx.fillStyle = on ? '#f59e0b' : '#e0ecff'; ctx.strokeStyle = on ? '#b45309' : '#3b82f6'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.roundRect(bx, 64, bw, 14, 4); ctx.fill(); ctx.stroke(); ctx.restore();
      D.text(ctx, (sd === 'L' ? '◀ ' : '') + lb + (sd === 'R' ? ' ▶' : ''), bx + bw / 2, 71, 8, on ? '#fff' : '#1d4ed8', 'center', true);
    });
  },
  probe: c => ({ 'Position': ['gauche (a)', 'repos (b)', 'droite (c)'][st(c).pos ?? 1] || '—' })
});
function drawActuators(ctx, c, side, x, S) {
  const d = side === 'L' ? -1 : 1; acts(c, side).forEach((a, i) => drawActuator(ctx, c, side, x + d * i * 24, S, a, i));
  const s = st(c); if (S && s.ovr && s.ovr[side]) { ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(x + d * 8, 66, 4, 0, 7); ctx.fill(); }
}
function drawActuator(ctx, c, side, x, S, a, idx) {
  const d = side === 'L' ? -1 : 1, active = S && vActive(c, side, S);
  ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
  const X = v => x + d * v;
  if (a === 'spring') { D.spring(ctx, X(0), 40, X(22), 7); return; }
  if (a === 'none') return;
  if (a === 'button') { D.line(ctx, [X(0), 40, X(14), 40]); D.line(ctx, [X(14), 32, X(14), 48]); ctx.beginPath(); ctx.arc(X(14), 40, 8, side === 'L' ? Math.PI / 2 : -Math.PI / 2, side === 'L' ? Math.PI * 1.5 : Math.PI / 2); ctx.fillStyle = active ? '#93c5fd' : '#fff'; ctx.fill(); ctx.stroke(); return; }
  if (a === 'lever') { D.line(ctx, [X(0), 40, X(12), 40]); D.line(ctx, [X(12), 48, X(24), 24]); D.circle(ctx, X(24), 24, 2.5, active ? '#1d4ed8' : INK); D.line(ctx, [X(0), 46, X(10), 46]); return; }
  if (a === 'sol') { const on = S && ((c.props['t' + side] && S.tags[c.props['t' + side]]) || (st(c).ovr && st(c).ovr[side])) && c.fault !== 'sol' + side && c.fault !== 'solHS'; D.rect(ctx, Math.min(X(0), X(16)), 30, 16, 20, on ? ON_FILL : '#fff'); D.line(ctx, [X(0), 50, X(16), 30]); D.text(ctx, c.props[side === 'L' ? 'tL' : 'tR'] || '', X(8), 22, 9, '#334155', 'center', true); return; }
  if (isPil(a)) { const h = (a === 'pilotH') || (a === 'pilot' && c.props.medium === 'hyd'); ctx.strokeStyle = h ? '#b91c1c' : '#2563eb'; D.tri(ctx, X(9), 40, 6, side === 'L' ? 'r' : 'l', active && S.P(c, 'p' + side) > 0.2 ? (h ? '#e03131' : '#1677ff') : '#fff'); D.text(ctx, h ? 'H' : 'P', X(9), 54, 7, h ? '#b91c1c' : '#2563eb', 'center', true); return; }
  if (a === 'roller') { D.line(ctx, [X(0), 40, X(14), 40]); D.circle(ctx, X(20), 40, 6, active ? '#93c5fd' : '#fff'); D.text(ctx, (c.props['cyl' + side] || '') + (c.props['cpos' + side] === 'sorti' ? '1' : '0'), X(20), 26, 8, '#334155'); return; }
}
function wireAt(c, pid) { return App.wires.some(w => (w.a.c === c.id && w.a.p === pid) || (w.b.c === c.id && w.b.p === pid)); }

/* ---------- Vérins ---------- */
const CYLF = med => [TAGF,
  { k: 'bore', label: 'Alésage Ø piston (mm)', type: 'num' }, { k: 'rod', label: 'Ø tige (mm)', type: 'num' },
  { k: 'stroke', label: 'Course (mm)', type: 'num' }, { k: 'load', label: 'Charge (N) — 10 N ≈ 1 daN ≈ 1 kg', type: 'num' },
  { k: 'ldir', label: 'Nature de la charge', type: 'sel', opts: ['deux', 'sortie', 'rentree'], labels: ['Résistante dans les deux sens', 'Pesante : s\'oppose à la sortie (vérin vertical)', 'S\'oppose à la rentrée (traction)'] },
  ...(med === 'pneu' ? [{ k: 'vmax', label: 'Vitesse à vide (mm/s)', type: 'num' }] : [{ k: 'ps', label: 'Pression maxi de service du vérin (bar)', type: 'num' }]), REFF];
const CYL_CAT_P = [
  { ref: 'Vérin ISO 6432 Ø16 × 50', props: { bore: 16, rod: 6, stroke: 50 } }, { ref: 'Vérin ISO 15552 Ø32 × 100', props: { bore: 32, rod: 12, stroke: 100 } },
  { ref: 'Vérin ISO 15552 Ø50 × 200', props: { bore: 50, rod: 20, stroke: 200 } }, { ref: 'Vérin ISO 15552 Ø63 × 250', props: { bore: 63, rod: 20, stroke: 250 } },
  { ref: 'Vérin ISO 15552 Ø100 × 300', props: { bore: 100, rod: 25, stroke: 300 } }];
const CYL_CAT_H = [
  { ref: 'Vérin ISO 6020-2 Ø40/22 × 200', props: { bore: 40, rod: 22, stroke: 200 } }, { ref: 'Vérin ISO 6020-2 Ø63/36 × 300', props: { bore: 63, rod: 36, stroke: 300 } },
  { ref: 'Vérin ISO 6020-2 Ø80/45 × 400', props: { bore: 80, rod: 45, stroke: 400 } }, { ref: 'Vérin ISO 6020-2 Ø100/56 × 500', props: { bore: 100, rod: 56, stroke: 500 } }];
function cylGeom(c) { const D_ = +c.props.bore || 32, d = +c.props.rod || 12; return { Ab: Math.PI * D_ * D_ / 4, Aa: Math.PI * (D_ * D_ - d * d) / 4, L: +c.props.stroke || 100 }; }
def('cyl', {
  name: 'Vérin', cat: null, w: 300, h: 60,
  portsFn(c) { const k = medK(c); return c.props.single ? [P('A', 20, 60, k)] : [P('A', 20, 60, k), P('B', 150, 60, k)]; },
  defProps: { tag: 'A', medium: 'pneu', bore: 32, rod: 12, stroke: 100, load: 0, vmax: 250 },
  fieldsFn: c => CYLF(c.props.medium), catalogFn: c => c.props.medium === 'hyd' ? CYL_CAT_H : CYL_CAT_P,
  faults: [['seized', 'Vérin grippé (bloqué)'], ['leak', 'Fuite interne (joint de piston usé, fût rayé)'], ['extleak', 'Fuite externe (joint de tige)'], ['air', 'Air dans le vérin (purge à faire)'], ['bent', 'Tige faussée (frottements importants)']],
  bom: c => (c.props.single ? 'Vérin simple effet' : 'Vérin double effet') + (c.props.medium === 'hyd' ? ' hydraulique' : ' pneumatique') + ' Ø' + c.props.bore + (c.props.single ? '' : '/' + c.props.rod) + ' × ' + c.props.stroke,
  isActuator: true,
  init(c) { const s = st(c); s.pos = c.props.startPos === 'sorti' ? 1 : 0; s.v = 0; },
  // Modèle (fiches F05A, F08B-E, F11A-C) : F = p × S ; la pression s'établit à la valeur imposée par la charge ;
  // la vitesse dépend du débit (v = Q / S). Rapport de section : en rentrée, même effort → pression × Ab/Aa.
  demand(c, S) {
    const s = st(c), g = cylGeom(c), F = +c.props.load || 0, hyd = c.props.medium === 'hyd', ld = c.props.ldir || 'deux', single = !!c.props.single;
    const iA = S.info(c, 'A'), iB = single ? null : S.info(c, 'B');
    const srcA = iA.src && !iA.vent, srcB = !!iB && iB.src && !iB.vent, vA = iA.vent, vB = single ? true : iB.vent;
    let dir = 0, feed = null, area = 0, diff = false;
    if (single) { if (srcA) { dir = 1; feed = 'A'; area = g.Ab; } }
    else if (srcA && srcB && S.root(c, 'A') === S.root(c, 'B')) { dir = 1; feed = 'A'; area = g.Ab - g.Aa; diff = true; } // effet différentiel
    else if (srcA && vB) { dir = 1; feed = 'A'; area = g.Ab; }
    else if (srcB && vA) { dir = -1; feed = 'B'; area = g.Aa; }
    if (c.fault === 'seized') return { dir: 0 };
    // mouvement sans alimentation : ressort de rappel (simple effet) ou charge entraînante (vérin flottant / rupture)
    if (!dir) {
      const grav = F > 0 && ld === 'sortie' && vA && (vB || srcB) && s.pos > 0, push = F > 0 && ld === 'rentree' && vB && (vA || srcA) && s.pos < 1;
      // dérive : un tiroir n'est pas étanche → un vérin chargé verticalement descend lentement (fiche F08C)
      if (hyd && F > 0 && ld === 'sortie' && !single && s.pos > 0 && !iA.src && !iA.vent && !App.comps.some(o => (o.type === 'cbv' || o.type === 'check') && ['1', '2'].some(p => S.root(o, p) === S.root(c, 'A')))) return { dir: -1, direct: true, v: -1.5, menante: true };
      if (single && vA && s.pos > 0) return { dir: -1, direct: true, v: -(hyd ? 80 : (+c.props.vmax || 250)) * S.R(c, 'A') };
      if (grav) return { dir: -1, direct: true, v: -(hyd ? 120 : 250) * S.R(c, 'A') * (single ? 1 : S.R(c, 'B')), menante: true };
      if (push) return { dir: 1, direct: true, v: (hyd ? 120 : 250) * S.R(c, 'A') * S.R(c, 'B'), menante: true };
      return { dir: 0 };
    }
    if ((dir > 0 && s.pos >= 1) || (dir < 0 && s.pos <= 0)) return { dir: 0, end: true };
    let Fo = dir > 0 ? (ld === 'rentree' ? -F : F) : (ld === 'sortie' ? -F : F);
    if (single && dir > 0) Fo += 0.06 * g.Ab; // ressort de rappel
    const fr = (hyd ? 3 : 0.3) + (c.fault === 'bent' ? (hyd ? 45 : 2.5) : 0); // frottements (bar)
    const preq = Math.max(0, Fo) / area * 10 + fr;
    const leak = c.fault === 'leak' ? 0.4 : c.fault === 'extleak' ? 0.25 : 0;
    return { dir, feed, area, preq, diff, leak, menante: Fo < 0, out: dir > 0 ? (single || diff ? null : 'B') : 'A' };
  },
  move(c, S, dt, r) {
    const s = st(c), g = cylGeom(c);
    let v = r.v || 0; if (c.fault === 'air' && v) v *= 0.55 + 0.45 * Math.abs(Math.sin(S.t * 9));
    s.v = v; s.pos = clamp(s.pos + v / g.L * dt, 0, 1); s.force = r.force;
  },
  draw(ctx, c, S) {
    const s = st(c), pos = s.pos || 0, hyd = c.props.medium === 'hyd';
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    D.line(ctx, [20, 50, 20, 60]); if (!c.props.single) D.line(ctx, [150, 50, 150, 60]);
    D.rect(ctx, 0, 10, 170, 40, '#fff');
    const px = 22 + pos * 120;
    if (S) {
      const pa = S.P(c, 'A'); ctx.fillStyle = pa > 0 ? (hyd ? 'rgba(224,49,49,.25)' : 'rgba(22,119,255,.18)') : 'rgba(0,0,0,0)'; ctx.fillRect(1, 11, px - 1, 38);
      if (!c.props.single) { const pb = S.P(c, 'B'); ctx.fillStyle = pb > 0 ? (hyd ? 'rgba(224,49,49,.25)' : 'rgba(22,119,255,.18)') : 'rgba(0,0,0,0)'; ctx.fillRect(px + 8, 11, 169 - px - 8, 38); }
    }
    ctx.fillStyle = '#94a3b8'; ctx.fillRect(px, 11, 8, 38); ctx.strokeRect(px, 11, 8, 38);
    ctx.fillStyle = '#cbd5e1'; ctx.fillRect(px + 8, 25, 172 + pos * 120 - px - 8 + 10, 10); ctx.strokeRect(px + 8, 25, 172 + pos * 120 - px - 8 + 10, 10);
    ctx.fillStyle = '#64748b'; ctx.fillRect(180 + pos * 120, 18, 6, 24);
    if (c.props.single) D.spring(ctx, px + 12, 18, 166, 5);
    // repères de position
    ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 1; D.line(ctx, [183, 4, 183, 8]); D.line(ctx, [303, 4, 303, 8]);
    D.text(ctx, c.props.tag + '0', 183, 0, 8, '#64748b'); D.text(ctx, c.props.tag + '1', 300, 0, 8, '#64748b');
    if (S && c.fault === 'seized' && !App.hideFaults) D.text(ctx, '✖', 85, 30, 14, '#dc2626');
  },
  probe(c, S) {
    const s = st(c), g = cylGeom(c), o = { 'Position': fmt((s.pos || 0) * g.L, 0) + ' / ' + g.L + ' mm', 'Vitesse': fmt(s.v || 0, 0) + ' mm/s', 'Surface piston (fond)': fmt(g.Ab / 100, 2) + ' cm²' };
    if (!c.props.single) { o['Surface annulaire (tige)'] = fmt(g.Aa / 100, 2) + ' cm²'; o['Rapport de section'] = fmt(g.Ab / g.Aa, 2); }
    o['Cylindrée (fond)'] = fmt(g.Ab * g.L / 1e6, 3) + ' L';
    if (S) { const pa = S.P(c, 'A'); o['Pression A'] = fmt(pa, 1) + ' bar'; o['Effort côté fond (p×S)'] = fmt(pa * g.Ab / 100, 0) + ' daN'; if (!c.props.single) { const pb = S.P(c, 'B'); o['Pression B'] = fmt(pb, 1) + ' bar'; o['Effort côté tige (p×S)'] = fmt(pb * g.Aa / 100, 0) + ' daN'; } }
    return o;
  },
  plot: c => (st(c).pos || 0) * (+c.props.stroke || 100), plotUnit: 'mm'
});
def('motorf', {
  name: 'Moteur fluidique', cat: null, w: 80, h: 80,
  portsFn(c) { const k = medK(c); return [P('A', 40, 80, k), P('B', 40, 0, k)]; },
  defProps: { tag: 'M1', medium: 'hyd', disp: 50, torque: 20, nmax: 300 },
  fieldsFn: c => [TAGF, ...(c.props.medium === 'hyd' ? [{ k: 'disp', label: 'Cylindrée (cm³/tr)', type: 'num' }, { k: 'torque', label: 'Couple résistant (N·m)', type: 'num' }] : [{ k: 'nmax', label: 'Vitesse à vide (tr/min)', type: 'num' }]), REFF],
  catalogFn: c => c.props.medium === 'hyd' ? [{ ref: 'Moteur orbital 50 cm³/tr', props: { disp: 50 } }, { ref: 'Moteur orbital 100 cm³/tr', props: { disp: 100 } }, { ref: 'Moteur orbital 200 cm³/tr', props: { disp: 200 } }] : [{ ref: 'Moteur pneumatique à palettes 0,4 kW', props: { nmax: 600 } }],
  faults: [['seized', 'Moteur bloqué (frein serré / charge bloquée)'], ['wear', 'Moteur usé (fuites au drain importantes)']], isActuator: true,
  bom: c => 'Moteur ' + (c.props.medium === 'hyd' ? 'hydraulique ' + c.props.disp + ' cm³/tr' : 'pneumatique'),
  init(c) { const s = st(c); s.ang = 0; s.n = 0; },
  demand(c, S) {
    let dir = 0, feed = null; const vA = S.vent(c, 'A'), vB = S.vent(c, 'B');
    if (S.netSrc(c, 'A') && !vA && vB) { dir = 1; feed = 'A'; } else if (S.netSrc(c, 'B') && !vB && vA) { dir = -1; feed = 'B'; }
    if (!dir) return { dir: 0 };
    const hyd = c.props.medium === 'hyd';
    if (c.fault === 'seized') return { dir, feed, motor: true, preq: 1e9, out: feed === 'A' ? 'B' : 'A' };
    return { dir, feed, motor: true, leak: c.fault === 'wear' ? 0.3 : 0, preq: hyd ? 20 * Math.PI * (+c.props.torque || 0) / (+c.props.disp || 50) + 3 : 0.5, out: feed === 'A' ? 'B' : 'A' };
  },
  move(c, S, dt, r) { const s = st(c); s.n = r.n || 0; s.ang = ((s.ang || 0) + s.n / 60 * dt * Math.PI * 2) % (Math.PI * 2); },
  draw(ctx, c, S) {
    const s = st(c), hyd = c.props.medium === 'hyd'; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    D.line(ctx, [40, 0, 40, 14]); D.line(ctx, [40, 66, 40, 80]); D.circle(ctx, 40, 40, 26, '#fff');
    D.tri(ctx, 40, 20, 5, 'd', hyd ? INK : '#fff'); D.tri(ctx, 40, 60, 5, 'u', hyd ? INK : '#fff');
    D.line(ctx, [66, 40, 78, 40]); D.line(ctx, [78, 34, 78, 46]);
    const a = s.ang || 0; ctx.strokeStyle = '#2563eb'; ctx.lineWidth = 2; D.line(ctx, [40, 40, 40 + 16 * Math.cos(a), 40 + 16 * Math.sin(a)]);
  },
  probe: (c, S) => { const o = { 'Vitesse (N = Q×1000/Cyl)': fmt(st(c).n || 0, 0) + ' tr/min' }; if (S && c.props.medium === 'hyd') { o['Pression A'] = fmt(S.P(c, 'A'), 1) + ' bar'; o['Pression B'] = fmt(S.P(c, 'B'), 1) + ' bar'; o['Couple théorique Δp×Cyl/20π'] = fmt(Math.abs(S.P(c, 'A') - S.P(c, 'B')) * (+c.props.disp || 50) / (20 * Math.PI), 1) + ' N·m'; } return o; },
  plot: c => st(c).n || 0, plotUnit: 'tr/min'
});

/* ---------- Appareils de ligne ---------- */
const flowDir = (S, c, a, b) => { const na = S.pre(c, a), nb = S.pre(c, b); const pa = na.pr > 0 && !na.vent, pb = nb.pr > 0 && !nb.vent; if (pa || nb.vent) return 1; if (pb || na.vent) return -1; return 0; };
def('throttle', {
  name: 'Limiteur de débit', cat: 'Appareils fluidiques', w: 60, h: 80, ports: [P('1', 30, 80, 'f'), P('2', 30, 0, 'f')],
  defProps: { tag: '1V2', open: 40, check: true }, fields: [TAGF, { k: 'open', label: 'Ouverture (%)', type: 'range' }, { k: 'check', label: 'Clapet anti-retour (passage libre 1→2)', type: 'chk' }, REFF],
  faults: [['closed', 'Limiteur obstrué']], bom: c => c.props.check ? 'Limiteur de débit unidirectionnel' : 'Limiteur de débit bidirectionnel',
  dlinks(c, S) {
    if (c.fault === 'closed') return [];
    const f = clamp((+c.props.open || 0) / 100, 0.02, 1), d = flowDir(S, c, '1', '2');
    return [['1', '2', (c.props.check && d === 1) ? 1 : f]];
  },
  draw(ctx, c) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [30, 0, 30, 80]);
    ctx.beginPath(); ctx.arc(14, 40, 14, -0.7, 0.7); ctx.stroke(); ctx.beginPath(); ctx.arc(46, 40, 14, Math.PI - 0.7, Math.PI + 0.7); ctx.stroke();
    D.arrow(ctx, 16, 56, 44, 24, 5);
    if (c.props.check) { D.line(ctx, [30, 12, 54, 12, 54, 68, 30, 68]); D.circle(ctx, 54, 44, 5, '#fff'); D.line(ctx, [47, 36, 54, 50, 61, 36]); }
    D.text(ctx, (c.props.open | 0) + '%', 8, 72, 8, '#64748b');
  }
});
def('check', {
  name: 'Clapet anti-retour', cat: 'Appareils fluidiques', w: 40, h: 60, ports: [P('1', 20, 60, 'f'), P('2', 20, 0, 'f')],
  defProps: { tag: '1V3' }, fields: [TAGF, REFF], faults: [['leak', 'Clapet non étanche']], bom: 'Clapet anti-retour',
  dlinks(c, S) { if (c.fault === 'leak') return [['1', '2']]; return flowDir(S, c, '1', '2') === 1 ? [['1', '2']] : []; },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 22]); D.line(ctx, [20, 42, 20, 60]); D.circle(ctx, 20, 30, 7, '#fff'); D.line(ctx, [10, 18, 20, 36, 30, 18]); }
});
/* ---------- Appareils de pression (fiches F05A à F05H) ---------- */
function drawPV(ctx, nc, set, open, extra) { // carré + flèche décalée + ressort réglable + pilotage
  ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 14, 20, 32, 40, open ? '#fee2e2' : '#fff');
  const x = nc ? 24 : 30; D.arrow(ctx, x, 56, x, 24, 5);
  D.spring(ctx, 46, 40, 58, 4); D.line(ctx, [52, 32, 60, 48]); D.line(ctx, [58, 46, 60, 48, 57, 49]);
  D.text(ctx, set + ' bar', 52, 66, 8, '#64748b');
}
def('filter', {
  name: 'Filtre (retour / haute pression)', cat: 'Appareils fluidiques', w: 60, h: 80, ports: [P('1', 30, 80, 'f', 'entrée'), P('2', 30, 0, 'f', 'sortie')],
  defProps: { tag: '0Z2', kind: 'retour' }, fields: [TAGF, { k: 'kind', label: 'Type', type: 'sel', opts: ['retour', 'HP', 'aspiration'], labels: ['Filtre retour 10–25 µm (by-pass 3 bar)', 'Filtre haute pression < 10 µm', 'Crépine d\'aspiration'] }, REFF],
  faults: [['clog', 'Élément filtrant colmaté'], ['torn', 'Élément filtrant déchiré (pollution)']],
  bom: c => 'Filtre ' + (c.props.kind === 'HP' ? 'haute pression' : c.props.kind === 'aspiration' ? 'd\'aspiration (crépine)' : 'retour avec by-pass et indicateur de colmatage'),
  links(c) { return [['1', '2', c.fault === 'clog' ? (c.props.kind === 'retour' ? 0.85 : 0.35) : 1]]; },
  draw(ctx, c) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [30, 80, 30, 60]); D.line(ctx, [30, 20, 30, 0]);
    ctx.beginPath(); ctx.moveTo(30, 20); ctx.lineTo(50, 40); ctx.lineTo(30, 60); ctx.lineTo(10, 40); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    D.dash(ctx, 1); D.line(ctx, [12, 40, 48, 40]); D.dash(ctx, 0);
    if (c.props.kind === 'retour') { D.line(ctx, [30, 70, 56, 70, 56, 10, 30, 10]); D.circle(ctx, 56, 44, 4, '#fff'); }
    D.circle(ctx, 8, 14, 5, c.fault === 'clog' ? '#ef4444' : '#22c55e');
  },
  probe: c => ({ 'Indicateur de colmatage': c.fault === 'clog' ? 'ROUGE : élément à remplacer' + (c.props.kind === 'retour' ? ' (by-pass ouvert : huile non filtrée)' : '') : 'vert' })
});
/* Radiateur / refroidisseur (échangeur) : huile hydraulique ou air comprimé */
const motRunning = tag => { const m = App.comps.find(o => o.props.tag === tag && (o.type === 'motor3' || o.type === 'motor')); if (!m) return null; const s = st(m); return m.type === 'motor3' ? Math.abs(s.n || 0) > 700 : !!s.on; };
def('cooler', {
  name: 'Radiateur / refroidisseur', cat: 'Appareils fluidiques', w: 80, h: 80, ports: [P('1', 40, 80, 'f', 'entrée'), P('2', 40, 0, 'f', 'sortie')],
  defProps: { tag: '0E1', medium: 'hyd', cool: 'fan', kw: 3, mot: '', bypass: true },
  fieldsFn: c => [TAGF, { k: 'medium', label: 'Fluide', type: 'sel', opts: ['hyd', 'pneu'], labels: ['Huile hydraulique (refroidisseur d\'huile)', 'Air comprimé (refroidisseur final / aftercooler)'] },
    { k: 'cool', label: 'Refroidissement', type: 'sel', opts: ['air', 'fan', 'eau'], labels: ['Air — convection naturelle', 'Air — ventilateur électrique', 'Eau (échangeur à plaques / tubulaire)'] },
    { k: 'kw', label: 'Puissance dissipée nominale (kW à ΔT 30 °C)', type: 'num', step: 0.5 },
    ...(c.props.cool === 'fan' ? [{ k: 'mot', label: 'Moteur du ventilateur (repère, vide = toujours en marche)', type: 'text' }] : []),
    ...(c.props.medium !== 'pneu' ? [{ k: 'bypass', label: 'Clapet by-pass de protection (taré ≈ 2 bar)', type: 'chk' }] : []), REFF],
  catalog: [{ ref: 'Refroidisseur huile/air 1,5 kW 24 V DC', props: { medium: 'hyd', cool: 'fan', kw: 1.5 } }, { ref: 'Refroidisseur huile/air 5 kW 400 V', props: { medium: 'hyd', cool: 'fan', kw: 5 } }, { ref: 'Échangeur huile/eau à plaques 15 kW', props: { medium: 'hyd', cool: 'eau', kw: 15 } }, { ref: 'Refroidisseur final d\'air comprimé air/air', props: { medium: 'pneu', cool: 'fan', kw: 4 } }],
  faults: [['clog', 'Faisceau encrassé (ailettes bouchées) : refroidissement réduit'], ['fan', 'Ventilateur / circulation d\'eau en panne'], ['block', 'Circuit interne bouché (perte de charge)']],
  bom: c => (c.props.medium === 'pneu' ? 'Refroidisseur final d\'air comprimé ' : 'Refroidisseur d\'huile ') + (c.props.cool === 'eau' ? 'huile/eau ' : 'à air ') + c.props.kw + ' kW' + (c.props.cool === 'fan' ? ' avec ventilateur' : ''),
  links(c) { return c.fault === 'block' ? (c.props.medium !== 'pneu' && c.props.bypass ? [['1', '2', 0.9]] : [['1', '2', 0.25]]) : [['1', '2']]; },
  eff(c, S) { // puissance effective dissipée (kW à ΔT 30 °C)
    let k = +c.props.kw || 0; if (c.props.cool === 'air') k *= 0.5;
    if (c.props.cool !== 'air') { const run = c.props.cool === 'fan' && c.props.mot ? motRunning(c.props.mot) : true; if (c.fault === 'fan' || run === false) k *= c.props.cool === 'fan' ? 0.25 : 0.05; }
    if (c.fault === 'clog') k *= 0.35; if (c.fault === 'block' && c.props.bypass && c.props.medium !== 'pneu') k *= 0.1;
    const wired = q => App.wires.some(w => (w.a.c === c.id && w.a.p === q) || (w.b.c === c.id && w.b.p === q)); if (!wired('1') || !wired('2')) k = 0; if (S && k && !(S.Q(c, '1') > 0.2 || S.vent(c, '1') || S.vent(c, '2'))) k = 0; return k;
  },
  draw(ctx, c, S) {
    const k = S ? this.eff(c, S) : 0, run = S && k > 0; ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    D.line(ctx, [40, 80, 40, 62]); D.line(ctx, [40, 18, 40, 0]);
    ctx.beginPath(); ctx.moveTo(40, 18); ctx.lineTo(62, 40); ctx.lineTo(40, 62); ctx.lineTo(18, 40); ctx.closePath(); ctx.fillStyle = run ? '#e0f2fe' : '#fff'; ctx.fill(); ctx.stroke();
    D.line(ctx, [18, 40, 62, 40]); D.arrow(ctx, 30, 40, 24, 32, 3); D.arrow(ctx, 50, 40, 56, 32, 3); // flèches sortantes : chaleur évacuée
    if (c.props.cool === 'eau') { D.arrow(ctx, 62, 40, 78, 40, 4); D.text(ctx, 'eau', 70, 50, 7, '#0369a1'); }
    if (c.props.cool === 'fan') { D.line(ctx, [62, 40, 70, 40]); D.circle(ctx, 74, 40, 6, '#fff'); D.text(ctx, 'M', 74, 40, 7, INK, 'center', true);
      if (run) { const a = (S.t * 10) % (Math.PI * 2); ctx.strokeStyle = '#0369a1'; D.line(ctx, [70 + Math.cos(a) * 5, 22 + Math.sin(a) * 5, 70 - Math.cos(a) * 5, 22 - Math.sin(a) * 5]); D.line(ctx, [70 + Math.sin(a) * 5, 22 - Math.cos(a) * 5, 70 - Math.sin(a) * 5, 22 + Math.cos(a) * 5]); ctx.strokeStyle = INK; } }
    if (c.props.medium !== 'pneu' && c.props.bypass) { D.line(ctx, [40, 72, 6, 72, 6, 30]); D.line(ctx, [6, 22, 6, 8, 40, 8]); D.circle(ctx, 6, 30, 3.5, '#fff'); D.line(ctx, [2, 24, 6, 32, 10, 24]); }
    D.text(ctx, c.props.medium === 'pneu' ? 'air' : 'huile', 74, 76, 7, '#64748b', 'right');
  },
  probe(c, S) {
    const k = this.eff(c, S), o = { 'Fluide': c.props.medium === 'pneu' ? 'air comprimé' : 'huile', 'Refroidissement': { air: 'convection naturelle', fan: 'ventilateur' + (c.props.mot ? ' (' + c.props.mot + (motRunning(c.props.mot) ? ' en marche' : ' ARRÊTÉ') + ')' : ''), eau: 'eau' }[c.props.cool], 'Puissance dissipée effective': fmt(k, 1) + ' kW à ΔT 30 °C' };
    if (S) {
      if (c.props.medium === 'pneu') { const tin = 80, tout = k > 0 ? Math.max(25 + 10, tin - 45 * Math.min(1, k / 4)) : tin; o['Température air entrée / sortie'] = tin + ' °C / ' + fmt(tout, 0) + ' °C'; o['Condensats'] = k > 0 ? 'condensation dans le refroidisseur → purger le séparateur' : 'air chaud et humide envoyé au réseau'; }
      else o['Température huile'] = fmt(S.oilT, 1) + ' °C'; }
    if (c.fault === 'block') o['Remarque'] = c.props.bypass && c.props.medium !== 'pneu' ? 'by-pass ouvert : l\'huile contourne le refroidisseur' : 'perte de charge importante';
    return o;
  }
});
def('relief', {
  name: 'Limiteur de pression (LP / anti-choc)', cat: 'Appareils de pression', w: 60, h: 80, ports: [P('P', 30, 80, 'h', 'P'), P('T', 30, 0, 'h', 'T')],
  portsFn(c) { const o = [P('P', 30, 80, 'h', 'P'), P('T', 30, 0, 'h', 'T')]; if (c.props.rpilot) o.push(P('X', 60, 40, 'h', 'X (pilotage à distance)')); return o; },
  defProps: { tag: '1V4', set: 100, vtag: '', rpilot: false }, fields: [TAGF, { k: 'set', label: 'Tarage — pression d\'ouverture (bar)', type: 'num' }, { k: 'rpilot', label: 'Action pilotée avec orifice X (pilotage à distance / mise à vide)', type: 'chk' }, { k: 'vtag', label: 'Mise à vide électrique : repère électro-aimant (vide = sans)', type: 'text' }, REFF],
  update(c, S) { // T non relié au réservoir : le limiteur est monté en série, il s'ouvre au tarage et alimente l'aval (ne protège plus la pompe)
    let ch = xcapUpdate(c, S); const s = st(c), ser = !S.vent(c, 'T'); if (s.ser !== ser) { s.ser = ser; ch = true; }
    let o = false; if (ser && c.fault !== 'stuck') { const set = c.fault === 'open' ? 3 : (+c.props.set || 100) * (c.fault === 'low' ? 0.4 : 1), i = S.info(c, 'P'); o = S.P(c, 'P') >= set * 0.98 || (!!s.sopen && i.src && !i.vent); }
    if (!!s.sopen !== o) { s.sopen = o; ch = true; }
    if (ser && !s.warned && S.info(c, 'P').src) { s.warned = 1; S.stickyBanner = S.banner = '⚠ Limiteur ' + (c.props.tag || '') + ' : orifice T non relié au réservoir — monté en série, il ne protège pas la pompe (le relier en dérivation sur P, avec T au réservoir)'; }
    return ch;
  },
  links(c) { return st(c).ser && st(c).sopen ? [['P', 'T']] : []; },
  press(c) { ask('Tarage du limiteur ' + (c.props.tag || '') + ' (bar)', String(c.props.set)).then(v => { if (v != null && +v > 0) { c.props.set = +v; App.changed(); toast('Tarage : ' + (+v) + ' bar'); } }); return true; },
  hint: c => 'Cliquer : modifier le tarage (' + c.props.set + ' bar)',
  faults: [['open', 'Clapet bloqué ouvert (pollution sur le siège)'], ['stuck', 'Clapet grippé fermé : plus de protection'], ['low', 'Ressort affaibli : tarage trop bas']],
  bom: 'Limiteur de pression à action directe',
  cap(c, uf, m) { if (c.fault === 'stuck') return null; const t = m.get(uf.find(K(c, 'T'))); if (!t || !t.vent) return null; let v = +c.props.set || 100; if (c.props.vtag && !(Sim.S && Sim.S.tags[c.props.vtag])) v = 2; if (c.fault === 'open') v = 3; if (c.fault === 'low') v *= 0.4; if (st(c).xcap != null) v = Math.min(v, st(c).xcap); return ['P', v]; },
  draw(ctx, c, S) {
    const open = S && (st(c).ser ? !!st(c).sopen : S.P(c, 'P') >= (+c.props.set || 100) * 0.98 && S.vent(c, 'T'));
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [30, 80, 30, 60]); D.line(ctx, [30, 20, 30, 0]);
    ctx.save(); ctx.translate(0, 0); drawPV(ctx, true, c.props.set, open); ctx.restore();
    D.dash(ctx, 1); D.line(ctx, [30, 70, 6, 70, 6, 56, 14, 56]); D.dash(ctx, 0); D.tri(ctx, 11, 56, 3, 'r', INK);
    if (c.props.rpilot) { ctx.strokeStyle = '#7c3aed'; D.dash(ctx, 1); D.line(ctx, [52, 32, 60, 32, 60, 40]); D.dash(ctx, 0); D.text(ctx, 'X', 54, 46, 8, '#7c3aed', 'center', true); }
  },
  probe: (c, S) => ({ 'Pression amont': S ? fmt(S.P(c, 'P'), 1) + ' bar' : '—', 'Montage': st(c).ser ? 'EN SÉRIE (T non relié au réservoir) : ne protège pas la pompe' : 'en dérivation, T au réservoir', 'État': st(c).ser ? (st(c).sopen ? 'ouvert : alimente l\'aval' : 'fermé') : S && S.P(c, 'P') >= (+c.props.set || 100) * 0.98 ? 'OUVERT (laminage)' : 'fermé' })
});
def('reducer', {
  name: 'Réducteur / régulateur de pression', cat: 'Appareils de pression', w: 60, h: 80, ports: [P('P', 30, 80, 'f', 'entrée'), P('A', 30, 0, 'f', 'sortie réduite')],
  defProps: { tag: '1V5', set: 40 }, fields: [TAGF, { k: 'set', label: 'Pression réduite (bar)', type: 'num' }, REFF],
  faults: [['stuckOpen', 'Tiroir bloqué ouvert (plus de réduction)'], ['stuckClosed', 'Tiroir bloqué fermé']],
  bom: 'Réducteur de pression à action directe (normalement ouvert, drainé)',
  update(c, S) { const i = S.info(c, 'P'); const up = (i.src && !i.vent && c.fault !== 'stuckClosed') ? { m: i.med, p: i.pr, q: i.q } : null; const k = JSON.stringify(up); if (st(c).k !== k) { st(c).k = k; st(c).up = up; return true; } return false; },
  sources(c) { const u = st(c).up; if (!u) return []; const p = c.fault === 'stuckOpen' ? u.p : Math.min(+c.props.set || 40, u.p); return [['A', u.m === 'p' ? 'pneu' : 'hyd', p, u.q, 0]]; },
  draw(ctx, c, S) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [30, 80, 30, 60]); D.line(ctx, [30, 20, 30, 0]);
    drawPV(ctx, false, c.props.set, false); D.dash(ctx, 1); D.line(ctx, [30, 10, 6, 10, 6, 24, 14, 24]); D.dash(ctx, 0); D.tri(ctx, 11, 24, 3, 'r', INK);
    D.dash(ctx, 1); D.line(ctx, [46, 56, 58, 56, 58, 78]); D.dash(ctx, 0);
  },
  probe: (c, S) => ({ 'Pression entrée': S ? fmt(S.P(c, 'P'), 1) + ' bar' : '—', 'Pression sortie': S ? fmt(S.P(c, 'A'), 1) + ' bar' : '—' })
});
def('seqv', {
  name: 'Soupape de séquence', cat: 'Appareils de pression', w: 60, h: 80, ports: [P('A', 30, 80, 'h', 'A (entrée)'), P('B', 30, 0, 'h', 'B (vers 2e récepteur)')],
  defProps: { tag: '1V6', set: 80, check: true }, fields: [TAGF, { k: 'set', label: 'Pression de séquence (bar)', type: 'num' }, { k: 'check', label: 'Clapet anti-retour (retour libre B→A)', type: 'chk' }, REFF],
  faults: [['open', 'Soupape bloquée ouverte (plus de séquence)'], ['closed', 'Soupape bloquée fermée']],
  bom: 'Soupape de séquence à action directe (drain externe)',
  update(c, S) {
    const i = S.info(c, 'A'), s = st(c), hi = S.P(c, 'A') >= (+c.props.set || 80);
    if (hi) { if (s.since == null) s.since = S.t; } else s.since = null; // la pression doit se maintenir (pas un simple pic au changement de position)
    const o = c.fault === 'open' || (c.fault !== 'closed' && ((hi && S.t - s.since >= 0.06) || (!!s.open && i.src && !i.vent))); if (st(c).open !== o) { st(c).open = o; return true; } return false; },
  links(c) { return st(c).open ? [['A', 'B']] : []; },
  dlinks(c, S) { return (!st(c).open && c.props.check && flowDir(S, c, 'B', 'A') === 1) ? [['B', 'A']] : []; },
  draw(ctx, c) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [30, 80, 30, 60]); D.line(ctx, [30, 20, 30, 0]);
    drawPV(ctx, true, c.props.set, !!st(c).open); D.dash(ctx, 1); D.line(ctx, [30, 70, 6, 70, 6, 56, 14, 56]); D.line(ctx, [46, 24, 58, 24, 58, 6]); D.dash(ctx, 0);
    if (c.props.check) { D.line(ctx, [30, 74, 54, 74, 54, 70]); D.line(ctx, [30, 6, 54, 6, 54, 12]); D.circle(ctx, 54, 64, 4, '#fff'); D.line(ctx, [49, 58, 54, 66, 59, 58]); }
  },
  probe: (c, S) => ({ 'Pression A': S ? fmt(S.P(c, 'A'), 1) + ' bar' : '—', 'État': st(c).open ? 'ouverte : 2e récepteur alimenté' : 'fermée' })
});
def('cbv', {
  name: 'Soupape d\'équilibrage (retenue de charge)', cat: 'Appareils de pression', w: 80, h: 80, ports: [P('1', 40, 80, 'h', 'V (distributeur)'), P('2', 40, 0, 'h', 'C (vérin)'), P('X', 0, 40, 'h', 'pilotage')],
  defProps: { tag: '1V7', set: 180, ratio: 4 }, fields: [TAGF, { k: 'set', label: 'Tarage (bar) — supérieur à la pression due à la charge', type: 'num' }, { k: 'ratio', label: 'Rapport de pilotage', type: 'num' }, REFF],
  faults: [['leak', 'Clapet non étanche : la charge dérive'], ['stuck', 'Clapet grippé fermé : descente impossible']],
  bom: 'Valve d\'équilibrage pilotée avec clapet anti-retour (montage en rigide sur le vérin)',
  update(c, S) { const ix = S.info(c, 'X'); const o = c.fault !== 'stuck' && (S.P(c, 'X') * (+c.props.ratio || 4) >= (+c.props.set || 180) || (!!st(c).open && ix.src && !ix.vent)); if (st(c).open !== o) { st(c).open = o; return true; } return false; },
  dlinks(c, S) { if (c.fault === 'leak' || st(c).open) return [['1', '2']]; return flowDir(S, c, '1', '2') === 1 ? [['1', '2']] : []; },
  draw(ctx, c) {
    const o = !!st(c).open; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [40, 80, 40, 60]); D.line(ctx, [40, 20, 40, 0]);
    ctx.save(); ctx.translate(10, 0); drawPV(ctx, true, c.props.set, o); ctx.restore();
    D.dash(ctx, 1); D.line(ctx, [0, 40, 24, 40]); D.dash(ctx, 0);
    D.line(ctx, [40, 70, 72, 70, 72, 10, 40, 10]); D.circle(ctx, 72, 44, 5, '#fff'); D.line(ctx, [66, 36, 72, 48, 78, 36]);
  },
  probe: (c, S) => ({ 'Pression de pilotage X': S ? fmt(S.P(c, 'X'), 1) + ' bar' : '—', 'État': st(c).open ? 'ouverte (descente pilotée)' : 'fermée : charge retenue' })
});
def('pumpvar', {
  name: 'Pompe hydrostatique (circuit fermé)', cat: 'Hydraulique', w: 120, h: 110, ports: [P('A', 30, 0, 'h', 'A'), P('B', 90, 0, 'h', 'B'), P('T', 110, 110, 'h', 'T (réservoir : aspiration gavage + drain carter)')],
  defProps: { tag: '1P1', disp: 45, n: 2000, cmd: 0, gav: 25, hp: 400 },
  fields: [TAGF, { k: 'disp', label: 'Cylindrée maxi (cm³/tr)', type: 'num' }, { k: 'n', label: 'Régime moteur thermique (tr/min)', type: 'num' }, { k: 'cmd', label: 'Commande plateau (−100 à +100 %)', type: 'num', step: 25 }, { k: 'gav', label: 'Pression de gavage (bar)', type: 'num' }, { k: 'hp', label: 'Soupapes HP (bar)', type: 'num' }, REFF],
  faults: [['zero', 'Zéro de pompe déréglé (le moteur dérive au neutre)'], ['gav', 'Pression de gavage trop faible (pompe de gavage usée)'], ['hp', 'Soupape HP déréglée']],
  bom: 'Pompe à pistons axiaux à cylindrée variable double sens de flux + pompe de gavage',
  val(c) { let cmd = clamp(+c.props.cmd || 0, -100, 100); if (c.fault === 'zero') cmd += 8; let q = (+c.props.disp || 45) * (+c.props.n || 2000) / 1000 * Math.abs(cmd) / 100, gav = +c.props.gav || 25, hp = +c.props.hp || 400; if (c.fault === 'gav') { gav = 5; q *= 0.6; } if (c.fault === 'hp') hp = 150; if (st(c).dry) { gav = 0; q = 0; } return { cmd, q, gav, hp }; },
  // prise réservoir T : si elle est raccordée, elle doit aboutir au réservoir (sinon la pompe de gavage aspire à vide) ; non raccordée = réservoir intégré
  update(c, S) { const wired = App.wires.some(w => (w.a.c === c.id && w.a.p === 'T') || (w.b.c === c.id && w.b.p === 'T')); const dry = wired && !S.vent(c, 'T'); if (st(c).dry !== dry) { st(c).dry = dry; if (dry) S.stickyBanner = S.banner = '⚠ ' + (c.props.tag || 'Pompe hydrostatique') + ' : prise réservoir T non reliée au réservoir — plus de gavage, la transmission ne débite plus'; return true; } return false; },
  sources(c) { const v = this.val(c); if (st(c).dry) return []; if (v.cmd > 0.5) return [['A', 'hyd', v.hp, v.q, 0], ['B', 'lowp', v.gav]]; if (v.cmd < -0.5) return [['B', 'hyd', v.hp, v.q, 0], ['A', 'lowp', v.gav]]; return [['A', 'lowp', v.gav], ['B', 'lowp', v.gav]]; },
  press(c, x) { c.props.cmd = clamp((+c.props.cmd || 0) + (x < 60 ? -25 : 25), -100, 100); Props.render(); return true; },
  hint: (c, x) => x < 60 ? 'Cliquer : plateau vers marche arrière (−25 %)' : 'Cliquer : plateau vers marche avant (+25 %)',
  draw(ctx, c, S) {
    const v = this.val(c); ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    D.line(ctx, [30, 0, 30, 22, 44, 22]); D.line(ctx, [90, 0, 90, 22, 76, 22]); D.circle(ctx, 60, 44, 20, '#fff');
    D.tri(ctx, 60, 29, 4, 'u', INK); D.tri(ctx, 60, 59, 4, 'd', INK); D.arrow(ctx, 40, 66, 82, 22, 5);
    D.line(ctx, [40, 44, 20, 44]); D.text(ctx, 'M', 12, 44, 9, INK, 'center', true);
    D.rect(ctx, 30, 72, 60, 22, '#f8fafc'); D.text(ctx, (v.cmd > 0 ? '+' : '') + Math.round(v.cmd) + ' %', 60, 83, 10, v.cmd ? '#1d4ed8' : INK, 'center', true);
    D.text(ctx, '◀', 18, 83, 10, '#64748b'); D.text(ctx, '▶', 102, 83, 10, '#64748b');
    ctx.strokeStyle = INK; D.dash(ctx, 1); D.line(ctx, [70, 58, 110, 58, 110, 110]); D.dash(ctx, 0); D.text(ctx, 'T', 116, 102, 8, '#64748b');
    if (S && st(c).dry && (Date.now() / 250 | 0) % 2) D.text(ctx, '!', 100, 102, 12, '#dc2626', 'center', true);
  },
  probe(c, S) { const v = this.val(c); return { 'Débit': fmt(v.q, 1) + ' L/min', 'Sens': v.cmd > 0.5 ? 'A refoulement' : v.cmd < -0.5 ? 'B refoulement' : 'neutre (stand-by)', 'Pression A (MA)': S ? fmt(S.P(c, 'A'), 1) + ' bar' : '—', 'Pression B (MB)': S ? fmt(S.P(c, 'B'), 1) + ' bar' : '—', 'Gavage': v.gav + ' bar', 'Prise réservoir T': st(c).dry ? 'NON RELIÉE AU RÉSERVOIR' : 'alimentée' }; },
  plot: (c, S) => S ? Math.max(S.P(c, 'A'), S.P(c, 'B')) : 0, plotUnit: 'bar'
});
def('shuttle', {
  name: 'Sélecteur de circuit (OU)', cat: 'Appareils fluidiques', w: 80, h: 40, ports: [P('a', 0, 20, 'f'), P('b', 80, 20, 'f'), P('2', 40, 0, 'f')],
  defProps: { tag: '1V4' }, fields: [TAGF], bom: 'Sélecteur de circuit (fonction OU)',
  dlinks(c, S) { const a = S.pre(c, 'a'), b = S.pre(c, 'b'); const pa = a.pr > 0 && !a.vent, pb = b.pr > 0 && !b.vent; if (pa) return [['a', '2']]; if (pb) return [['b', '2']]; return [['a', '2'], ['b', '2']]; },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 10, 10, 60, 20, '#fff'); D.line(ctx, [0, 20, 10, 20]); D.line(ctx, [70, 20, 80, 20]); D.line(ctx, [40, 0, 40, 10]); D.circle(ctx, 40, 20, 6, '#fff'); D.text(ctx, '≥1', 22, 20, 8, '#64748b'); }
});
def('twopress', {
  name: 'Clapet double pression (ET)', cat: 'Appareils fluidiques', w: 80, h: 40, ports: [P('a', 0, 20, 'f'), P('b', 80, 20, 'f'), P('2', 40, 0, 'f')],
  defProps: { tag: '1V5' }, fields: [TAGF], bom: 'Clapet double pression (fonction ET)',
  dlinks(c, S) { const a = S.pre(c, 'a'), b = S.pre(c, 'b'); const pa = a.pr > 0 && !a.vent, pb = b.pr > 0 && !b.vent; if (pa && pb) return [['a', '2']]; if (!pa) return [['a', '2']]; return [['b', '2']]; },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 10, 10, 60, 20, '#fff'); D.line(ctx, [0, 20, 10, 20]); D.line(ctx, [70, 20, 80, 20]); D.line(ctx, [40, 0, 40, 10]); D.rect(ctx, 34, 14, 12, 12, '#fff'); D.text(ctx, '&', 22, 20, 9, '#64748b'); }
});
def('pswitch', {
  name: 'Pressostat (contact NO)', cat: 'Appareils fluidiques', w: 80, h: 80, ports: [P('f', 20, 80, 'f'), P('a', 60, 0, 'e'), P('b', 60, 80, 'e')],
  defProps: { tag: 'B2', sp: 4 }, fields: [TAGF, { k: 'sp', label: 'Seuil de commutation (bar)', type: 'num', step: 0.5 }, REFF],
  faults: [['open', 'Contact reste ouvert'], ['closed', 'Contact collé']], bom: 'Pressostat 1NO',
  update(c, S) { const on = S.P(c, 'f') >= (+c.props.sp || 0) && (+c.props.sp || 0) > 0 || (S.P(c, 'f') > 0 && !(+c.props.sp)); if (st(c).act !== on) { st(c).act = on; return true; } return false; },
  links(c) { return contactState(c, !!st(c).act) ? [['a', 'b']] : []; },
  draw(ctx, c) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 80, 20, 52]); D.rect(ctx, 8, 30, 24, 22, '#fff'); D.spring(ctx, 32, 41, 44, 4); D.tri(ctx, 20, 46, 4, 'u', '#fff');
    D.dash(ctx, 1); D.line(ctx, [44, 41, 55, 41]); D.dash(ctx, 0);
    ctx.save(); ctx.translate(40, 10); drawContact(ctx, c, contactState(c, !!st(c).act), false, null); ctx.restore();
  },
  plot: c => st(c).act ? 1 : 0, plotUnit: 'état'
});
def('gauge', {
  name: 'Manomètre', cat: 'Instruments de mesure', w: 60, h: 60, ports: [P('f', 30, 60, 'f')],
  defProps: { tag: 'P1', range: 0 }, fields: [TAGF, { k: 'range', label: 'Échelle max. (bar, 0 = auto)', type: 'num' }], bom: 'Manomètre Ø63',
  draw(ctx, c, S) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [30, 60, 30, 48]); D.circle(ctx, 30, 26, 22, '#fff');
    const p = S ? S.P(c, 'f') : 0, hyd = S ? S.netMed(c, 'f') === 'h' : false;
    const rng = +c.props.range || (hyd ? 250 : 10); const a = Math.PI * 0.75 + clamp(p / rng, 0, 1) * Math.PI * 1.5;
    ctx.strokeStyle = '#cbd5e1'; ctx.beginPath(); ctx.arc(30, 26, 17, Math.PI * .75, Math.PI * 2.25); ctx.stroke();
    ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2; D.line(ctx, [30, 26, 30 + 16 * Math.cos(a), 26 + 16 * Math.sin(a)]);
    D.text(ctx, fmt(p, p >= 100 ? 0 : 1), 30, 38, 9, INK, 'center', true); D.text(ctx, 'bar', 30, 14, 7, '#64748b');
  },
  probe: (c, S) => ({ 'Pression': S ? fmt(S.P(c, 'f'), 2) + ' bar' : '—' }),
  plot: (c, S) => S ? S.P(c, 'f') : 0, plotUnit: 'bar'
});
def('flowm', {
  name: 'Débitmètre', cat: 'Instruments de mesure', w: 60, h: 80, ports: [P('1', 30, 80, 'f'), P('2', 30, 0, 'f')],
  defProps: { tag: 'Q1' }, fields: [TAGF], bom: 'Débitmètre à turbine',
  links() { return [['1', '2']]; },
  draw(ctx, c, S) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [30, 0, 30, 18]); D.line(ctx, [30, 62, 30, 80]); D.circle(ctx, 30, 40, 22, '#fff'); D.arrow(ctx, 30, 56, 30, 24, 5); D.text(ctx, S ? fmt(S.Q(c, '1'), 1) : '0', 46, 40, 9, INK, 'center', true); D.text(ctx, 'L/min', 46, 52, 6, '#64748b'); },
  probe: (c, S) => ({ 'Débit': S ? fmt(S.Q(c, '1'), 2) + ' L/min' : '—' }),
  plot: (c, S) => S ? S.Q(c, '1') : 0, plotUnit: 'L/min'
});

/* =====================================================================
   AUTOMATE (le programme est géré par plc.js)
   ===================================================================== */
def('plc', {
  name: 'Automate programmable (8E/8S)', cat: 'Automate programmable', w: 220, h: 240,
  ports: [...[0, 1, 2, 3, 4, 5, 6, 7].map(i => P('I' + i, 0, 40 + 20 * i, 'e', 'I' + i)), P('COM', 0, 210, 'e', 'COM'),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map(i => P('Q' + i, 220, 40 + 20 * i, 'e', 'Q' + i)), P('L+', 220, 210, 'e', 'L+')],
  defProps: { tag: 'API1' }, fields: [TAGF, REFF], faults: [['stop', 'Automate en STOP (défaut CPU)'], ['out0', 'Sortie Q0 grillée']],
  bom: 'Automate programmable compact 8E/8S 24 V DC',
  init(c) { PLC.init(c); },
  links(c) { const s = st(c), q = (s.img && s.img.Q) || []; const l = []; for (let i = 0; i < 8; i++) if (q[i] && !(i === 0 && c.fault === 'out0')) l.push(['Q' + i, 'L+']); return l; },
  scan(c, S, dt) { PLC.scan(c, S, dt); },
  draw(ctx, c, S) {
    const s = st(c), img = s.img || { I: [], Q: [] };
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 10, 0, 200, 240, '#f1f5f9');
    ctx.fillStyle = '#1e293b'; ctx.fillRect(10, 0, 200, 24); D.text(ctx, 'AUTOMATE ' + (c.props.tag || ''), 110, 12, 11, '#fff', 'center', true);
    for (let i = 0; i < 8; i++) {
      const y = 40 + 20 * i; D.line(ctx, [0, y, 10, y]); D.line(ctx, [210, y, 220, y]);
      ctx.fillStyle = img.I[i] ? '#22c55e' : '#cbd5e1'; ctx.fillRect(16, y - 5, 10, 10);
      ctx.fillStyle = img.Q[i] ? '#f59e0b' : '#cbd5e1'; ctx.fillRect(194, y - 5, 10, 10);
      const sym = (c.props.prog && c.props.prog.sym) || {};
      D.text(ctx, 'I' + i + (sym['I' + i] ? ' ' + sym['I' + i] : ''), 30, y, 9, INK, 'left'); D.text(ctx, (sym['Q' + i] ? sym['Q' + i] + ' ' : '') + 'Q' + i, 190, y, 9, INK, 'right');
    }
    D.line(ctx, [0, 210, 10, 210]); D.line(ctx, [210, 210, 220, 210]); D.text(ctx, 'COM (0V)', 16, 210, 8, '#475569', 'left'); D.text(ctx, '(+24V) L+', 204, 210, 8, '#475569', 'right');
    const run = S && c.fault !== 'stop';
    ctx.fillStyle = run ? '#22c55e' : (S ? '#ef4444' : '#94a3b8'); ctx.beginPath(); ctx.arc(110, 224, 5, 0, 7); ctx.fill();
    D.text(ctx, run ? 'RUN' : 'STOP', 124, 224, 9, INK, 'left', true);
    D.text(ctx, 'Double-clic : programmer', 110, 196, 8, '#94a3b8');
  }
});

/* =====================================================================
   LOGIQUE NUMÉRIQUE
   ===================================================================== */
const LCAT = 'Électronique numérique';
function gate(type, name, sym, fn, neg) {
  def(type, {
    name, cat: LCAT, w: 60, h: 40, ports: fn.length === 1 ? [P('a', 0, 20, 'l'), P('y', 60, 20, 'l')] : [P('a', 0, 10, 'l'), P('b', 0, 30, 'l'), P('y', 60, 20, 'l')],
    noLabel: true, faults: [['s0', 'Sortie bloquée à 0'], ['s1', 'Sortie bloquée à 1']], bom: 'Porte logique ' + name,
    lout(c, S) { let v = fn.length === 1 ? fn(S.L(c, 'a')) : fn(S.L(c, 'a'), S.L(c, 'b')); if (c.fault === 's0') v = false; if (c.fault === 's1') v = true; return { y: v }; },
    draw(ctx, c, S) {
      ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 10, 2, 34, 36, '#fff'); D.text(ctx, sym, 27, 14, 11, INK, 'center', true);
      if (fn.length === 1) D.line(ctx, [0, 20, 10, 20]); else { D.line(ctx, [0, 10, 10, 10]); D.line(ctx, [0, 30, 10, 30]); }
      if (neg) { D.circle(ctx, 48, 20, 4, '#fff'); D.line(ctx, [52, 20, 60, 20]); } else D.line(ctx, [44, 20, 60, 20]);
    }
  });
}
gate('and', 'ET (AND)', '&', (a, b) => a && b); gate('or', 'OU (OR)', '≥1', (a, b) => a || b);
gate('nand', 'NON-ET (NAND)', '&', (a, b) => !(a && b), true); gate('nor', 'NON-OU (NOR)', '≥1', (a, b) => !(a || b), true);
gate('xor', 'OU exclusif (XOR)', '=1', (a, b) => a !== b); gate('not', 'NON (NOT)', '1', a => !a, true);
def('lsw', { name: 'Entrée logique (interrupteur)', cat: LCAT, w: 40, h: 40, ports: [P('y', 40, 20, 'l')], defProps: { tag: 'E1' }, fields: [TAGF],
  press(c) { st(c).on = !st(c).on; return true; }, lout(c) { return { y: !!st(c).on }; },
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 2, 6, 30, 28, st(c).on ? '#bbf7d0' : '#fff'); D.text(ctx, st(c).on ? '1' : '0', 17, 20, 13, INK, 'center', true); D.line(ctx, [32, 20, 40, 20]); },
  plot: c => st(c).on ? 1 : 0, plotUnit: 'état' });
def('lbtn', { name: 'Bouton logique (impulsion)', cat: LCAT, w: 40, h: 40, ports: [P('y', 40, 20, 'l')], defProps: { tag: 'E2' }, fields: [TAGF],
  press(c) { st(c).on = true; return true; }, release(c) { st(c).on = false; return true; }, lout(c) { return { y: !!st(c).on }; },
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.circle(ctx, 17, 20, 12, st(c).on ? '#bbf7d0' : '#e2e8f0'); D.line(ctx, [29, 20, 40, 20]); } });
def('clk', { name: 'Horloge', cat: LCAT, w: 60, h: 40, ports: [P('y', 60, 20, 'l')], defProps: { tag: 'H', f: 1 }, fields: [TAGF, { k: 'f', label: 'Fréquence (Hz)', type: 'num', step: 0.1 }],
  lout(c, S) { const f = +c.props.f || 1; return { y: S ? ((S.t * f) % 1) < 0.5 : false }; },
  draw(ctx, c, S) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 2, 4, 44, 32, '#fff'); D.line(ctx, [8, 26, 14, 26, 14, 14, 24, 14, 24, 26, 34, 26, 34, 14, 40, 14]); D.line(ctx, [46, 20, 60, 20]); } });
def('led', { name: 'DEL (sortie)', cat: LCAT, w: 40, h: 40, ports: [P('a', 0, 20, 'l')], defProps: { tag: 'D1', color: 'rouge' }, fields: [TAGF, { k: 'color', label: 'Couleur', type: 'sel', opts: Object.keys(LAMPC) }],
  lstep(c, S) { st(c).on = S.L(c, 'a'); },
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 20, 10, 20]); if (st(c).on) { ctx.save(); ctx.shadowColor = LAMPC[c.props.color]; ctx.shadowBlur = 14; D.circle(ctx, 22, 20, 11, LAMPC[c.props.color]); ctx.restore(); } else D.circle(ctx, 22, 20, 11, '#e5e7eb'); },
  plot: c => st(c).on ? 1 : 0, plotUnit: 'état' });
def('dff', { name: 'Bascule D', cat: LCAT, w: 80, h: 80, ports: [P('D', 0, 20, 'l', 'D'), P('C', 0, 60, 'l', 'C'), P('Q', 80, 20, 'l', 'Q'), P('N', 80, 60, 'l', 'Q̄')], noLabel: true, bom: 'Bascule D',
  lout(c) { const q = !!st(c).q; return { Q: q, N: !q }; },
  lstep(c, S) { const s = st(c), ck = S.L(c, 'C'); if (ck && !s.pc) s.q = S.L(c, 'D'); s.pc = ck; },
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 10, 4, 60, 72, '#fff'); [20, 60].forEach(y => { D.line(ctx, [0, y, 10, y]); D.line(ctx, [70, y, 80, y]); }); D.text(ctx, 'D', 18, 20, 10, INK, 'left'); D.line(ctx, [10, 54, 17, 60, 10, 66]); D.text(ctx, 'Q', 62, 20, 10, INK, 'right'); D.text(ctx, 'Q̄', 62, 60, 10, INK, 'right'); D.text(ctx, st(c).q ? '1' : '0', 40, 40, 12, '#16a34a', 'center', true); } });
def('rs', { name: 'Bascule RS', cat: LCAT, w: 80, h: 80, ports: [P('S', 0, 20, 'l'), P('R', 0, 60, 'l'), P('Q', 80, 20, 'l'), P('N', 80, 60, 'l')], noLabel: true, bom: 'Bascule RS',
  lout(c) { const q = !!st(c).q; return { Q: q, N: !q }; },
  lstep(c, S) { const s = st(c); if (S.L(c, 'R')) s.q = false; else if (S.L(c, 'S')) s.q = true; },
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 10, 4, 60, 72, '#fff'); [20, 60].forEach(y => { D.line(ctx, [0, y, 10, y]); D.line(ctx, [70, y, 80, y]); }); D.text(ctx, 'S', 18, 20, 10, INK, 'left'); D.text(ctx, 'R', 18, 60, 10, INK, 'left'); D.text(ctx, 'Q', 62, 20, 10, INK, 'right'); D.text(ctx, 'Q̄', 62, 60, 10, INK, 'right'); D.text(ctx, st(c).q ? '1' : '0', 40, 40, 12, '#16a34a', 'center', true); } });
def('cnt', { name: 'Compteur binaire 4 bits', cat: LCAT, w: 80, h: 120, ports: [P('C', 0, 20, 'l', 'CLK'), P('R', 0, 100, 'l', 'RAZ'), P('Q0', 80, 20, 'l'), P('Q1', 80, 50, 'l'), P('Q2', 80, 80, 'l'), P('Q3', 80, 110, 'l')], noLabel: true, bom: 'Compteur 4 bits',
  lout(c) { const n = st(c).n || 0; return { Q0: !!(n & 1), Q1: !!(n & 2), Q2: !!(n & 4), Q3: !!(n & 8) }; },
  lstep(c, S) { const s = st(c), ck = S.L(c, 'C'); if (S.L(c, 'R')) s.n = 0; else if (ck && !s.pc) s.n = ((s.n || 0) + 1) % 16; s.pc = ck; },
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 10, 4, 60, 112, '#fff'); D.line(ctx, [0, 20, 10, 20]); D.line(ctx, [0, 100, 10, 100]); [20, 50, 80, 110].forEach((y, i) => { D.line(ctx, [70, y, 80, y]); D.text(ctx, 'Q' + i, 66, y, 9, INK, 'right'); }); D.text(ctx, 'CLK', 14, 20, 8, INK, 'left'); D.text(ctx, 'RAZ', 14, 100, 8, INK, 'left'); D.text(ctx, 'CTR', 38, 60, 10, INK, 'center', true); D.text(ctx, String(st(c).n || 0), 38, 75, 12, '#16a34a', 'center', true); },
  plot: c => st(c).n || 0, plotUnit: 'valeur' });
const SEG = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f, 0x77, 0x7c, 0x39, 0x5e, 0x79, 0x71];
def('seg7', { name: 'Afficheur 7 segments (BCD)', cat: LCAT, w: 80, h: 120, ports: [P('A', 0, 20, 'l', '2⁰'), P('B', 0, 50, 'l', '2¹'), P('C', 0, 80, 'l', '2²'), P('D', 0, 110, 'l', '2³')], noLabel: true, bom: 'Afficheur 7 segments + décodeur',
  lstep(c, S) { st(c).n = (S.L(c, 'A') ? 1 : 0) + (S.L(c, 'B') ? 2 : 0) + (S.L(c, 'C') ? 4 : 0) + (S.L(c, 'D') ? 8 : 0); },
  draw(ctx, c) {
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 10, 4, 66, 112, '#111827'); [20, 50, 80, 110].forEach(y => D.line(ctx, [0, y, 10, y]));
    const m = SEG[st(c).n || 0], segs = [[30, 22, 58, 22], [60, 24, 60, 56], [60, 62, 60, 94], [30, 96, 58, 96], [28, 62, 28, 94], [28, 24, 28, 56], [30, 59, 58, 59]];
    segs.forEach((s, i) => { ctx.strokeStyle = (m >> i) & 1 ? '#ef4444' : '#3b1d1d'; ctx.lineWidth = 5; ctx.lineCap = 'round'; D.line(ctx, s); });
    ctx.lineCap = 'butt';
  } });

/* =====================================================================
   SYSTÈMES VIRTUELS
   ===================================================================== */
def('conveyor', {
  name: 'Convoyeur avec détecteurs', cat: 'Systèmes virtuels', w: 380, h: 120,
  ports: [P('m1', 20, 120, 'e', 'M+'), P('m2', 60, 120, 'e', 'M−'), P('s1a', 140, 120, 'e', 'S1'), P('s1b', 180, 120, 'e', 'S1'), P('s2a', 300, 120, 'e', 'S2'), P('s2b', 340, 120, 'e', 'S2')],
  defProps: { tag: 'CV1', power: 40, speed: 0.15 }, fields: [TAGF, { k: 'speed', label: 'Vitesse (longueurs/s)', type: 'num', step: 0.05 }, PWF],
  faults: [['s1', 'Détecteur S1 défectueux'], ['s2', 'Détecteur S2 défectueux'], ['motor', 'Moteur du convoyeur HS']], bom: 'Convoyeur à bande (motoréducteur 24 V)',
  init(c) { const s = st(c); s.boxes = []; s.belt = 0; },
  loads(c) { return c.fault === 'motor' ? [] : [['m1', 'm2', +c.props.power || 40]]; },
  update(c, S) {
    const s = st(c); if (!s.boxes) this.init(c); const on = c.fault !== 'motor' && S.loadOn(c, 'm1', 'm2');
    const d1 = c.fault !== 's1' && s.boxes.some(b => b > 0.02 && b < 0.16), d2 = c.fault !== 's2' && s.boxes.some(b => b > 0.84);
    let ch = false; if (s.on !== on) { s.on = on; ch = true; } if (s.d1 !== d1) { s.d1 = d1; ch = true; } if (s.d2 !== d2) { s.d2 = d2; ch = true; } return ch;
  },
  links(c) { const s = st(c), l = []; if (s.d1) l.push(['s1a', 's1b']); if (s.d2) l.push(['s2a', 's2b']); return l; },
  step(c, S, dt) { const s = st(c); if (!s.on) return; const v = (+c.props.speed || 0.15) * dt; s.belt = (s.belt + v) % 0.05; s.boxes = s.boxes.map((b, i) => { const nb = Math.min(b + v, 1); const ahead = s.boxes.filter(x => x > b).sort((a, b) => a - b)[0]; return ahead != null ? Math.min(nb, ahead - 0.1) : nb; }); },
  press(c, x) { const s = st(c); if (!s.boxes) this.init(c); if (x > 300) s.boxes = s.boxes.filter(b => b < 0.84); else if (!s.boxes.some(b => b < 0.12)) s.boxes.push(0.05); return true; },
  draw(ctx, c, S) {
    const s = st(c); ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    ctx.fillStyle = '#e2e8f0'; ctx.fillRect(10, 50, 360, 24); ctx.strokeRect(10, 50, 360, 24);
    D.circle(ctx, 22, 62, 11, '#94a3b8'); D.circle(ctx, 358, 62, 11, '#94a3b8');
    ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1; for (let i = 0; i < 18; i++) { const x = 30 + ((i * 0.05 + (s.belt || 0)) % 0.9) / 0.9 * 320; D.line(ctx, [x, 51, x, 56]); }
    (s.boxes || []).forEach(b => { const x = 20 + b * 320; ctx.fillStyle = '#d97706'; ctx.strokeStyle = '#78350f'; ctx.fillRect(x, 22, 34, 28); ctx.strokeRect(x, 22, 34, 28); D.line(ctx, [x, 36, x + 34, 36]); });
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6;
    // détecteurs
    [[160, s.d1, 'S1'], [320, s.d2, 'S2']].forEach(([x, d, n]) => { D.rect(ctx, x - 8, 4, 16, 12, d ? '#22c55e' : '#fff'); D.text(ctx, n, x, 10, 8); ctx.strokeStyle = d ? '#16a34a' : '#cbd5e1'; D.dash(ctx, 1); D.line(ctx, [x, 16, x, 50]); D.dash(ctx, 0); ctx.strokeStyle = INK; });
    // bornes
    D.rect(ctx, 10, 86, 360, 24, '#f8fafc'); [20, 60, 140, 180, 300, 340].forEach(x => D.line(ctx, [x, 110, x, 120]));
    D.text(ctx, 'Moteur', 40, 98, 9, s.on ? '#2563eb' : INK, 'center', true); D.text(ctx, 'Détecteur début', 160, 98, 9); D.text(ctx, 'Détecteur fin', 320, 98, 9);
    if (S) D.text(ctx, 'clic gauche : ajouter une caisse — clic à droite : retirer', 190, 116, 7, '#94a3b8');
  },
  probe: c => ({ 'Moteur': st(c).on ? 'Marche' : 'Arrêt', 'Caisses': (st(c).boxes || []).length })
});
def('traffic', {
  name: 'Feu tricolore', cat: 'Systèmes virtuels', w: 60, h: 140, ports: [P('R', 0, 30, 'e', 'R'), P('O', 0, 70, 'e', 'O'), P('V', 0, 110, 'e', 'V'), P('COM', 30, 140, 'e', 'COM')],
  defProps: { tag: 'F1', power: 6 }, fields: [TAGF], bom: 'Feu tricolore 24 V', faults: [['R', 'Ampoule rouge grillée'], ['O', 'Ampoule orange grillée'], ['V', 'Ampoule verte grillée']],
  loads(c) { return ['R', 'O', 'V'].filter(k => c.fault !== k).map(k => [k, 'COM', +c.props.power || 6]); },
  update(c, S) { const s = st(c); let ch = false; ['R', 'O', 'V'].forEach(k => { const on = c.fault !== k && S.loadOn(c, k, 'COM'); if (s[k] !== on) { s[k] = on; ch = true; } }); return ch; },
  draw(ctx, c) { const s = st(c); ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 12, 6, 40, 124, '#1f2937'); D.line(ctx, [30, 130, 30, 140]);
    [['R', 30, '#ef4444'], ['O', 70, '#f59e0b'], ['V', 110, '#22c55e']].forEach(([k, y, col]) => { D.line(ctx, [0, y, 12, y]); if (s[k]) { ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 16; D.circle(ctx, 32, y, 14, col); ctx.restore(); } else D.circle(ctx, 32, y, 14, '#374151'); }); }
});

/* ---------- Entrées de palette (variantes préconfigurées) ---------- */
const PALETTE = [
  ['Pneumatique', [
    ['compressor'], ['exhaust'],
    ['cyl', 'Vérin double effet', { medium: 'pneu' }], ['cyl', 'Vérin simple effet', { medium: 'pneu', single: true, tag: 'A' }],
    ['valve', 'Distributeur 3/2 NF bouton', { vt: 'v32', aL: 'button', aR: 'spring', tag: '1S0' }],
    ['valve', 'Distributeur 3/2 NF galet', { vt: 'v32', aL: 'roller', aR: 'spring', cylL: 'A', cposL: 'sorti', tag: '1S2' }],
    ['valve', 'Distributeur 3/2 pilotage pneu.', { vt: 'v32', aL: 'pilotP', aR: 'spring' }],
    ['valve', 'Distributeur 5/2 levier', { vt: 'v52', aL: 'lever', aR: 'spring' }],
    ['valve', 'Distributeur 5/2 bistable pneu.', { vt: 'v52', aL: 'pilotP', aR: 'pilotP' }],
    ['valve', 'Distributeur 5/2 électropneumatique', { vt: 'v52', aL: 'sol', xL: 'pilotP', aR: 'spring', tL: 'Y1' }],
    ['valve', 'Distributeur 5/2 monostable élec.', { vt: 'v52', aL: 'sol', aR: 'spring', tL: 'Y1' }],
    ['valve', 'Distributeur 5/2 bistable élec.', { vt: 'v52', aL: 'sol', aR: 'sol', tL: 'Y1', tR: 'Y2' }],
    ['valve', 'Distributeur 5/3 centre fermé', { vt: 'v53', aL: 'sol', aR: 'sol', tL: 'Y1', tR: 'Y2' }],
    ['motorf', 'Moteur pneumatique', { medium: 'pneu', tag: 'M1' }]]],
  ['Hydraulique', [
    ['pump'], ['pump', 'Groupe — pompe à cylindrée variable', { ptype: 'variable' }], ['pump', 'Groupe — pompe régulée en pression', { ptype: 'regp', disp: 40, pc: 100, pmax: 140 }], ['pump', 'Groupe — pompe load-sensing', { ptype: 'ls', disp: 45, n: 1800, pmax: 250 }], ['pump', 'Groupe — limiteur piloté (X)', { rpilot: true }], ['tank'],
    ['hpump', 'Pompe seule — engrenages (fixe)', { ptype: 'fixe', tech: 'engr' }], ['hpump', 'Pompe seule — palettes (fixe)', { ptype: 'fixe', tech: 'pal', disp: 20, padm: 160 }],
    ['hpump', 'Pompe seule — pistons axiaux variable (manuelle)', { ptype: 'variable', tech: 'pax', disp: 45, padm: 350 }], ['hpump', 'Pompe seule — régulée en pression', { ptype: 'regp', tech: 'pax', disp: 45, pc: 160, padm: 350 }],
    ['hpump', 'Pompe seule — load-sensing', { ptype: 'ls', tech: 'pax', disp: 45, pc: 250, padm: 350 }], ['hpump', 'Pompe seule — pistons radiaux', { ptype: 'fixe', tech: 'prad', disp: 10, padm: 500 }], ['hpump', 'Pompe seule — à vis', { ptype: 'fixe', tech: 'vis', disp: 60, padm: 100 }],
    ['cyl', 'Vérin double effet', { medium: 'hyd', bore: 63, rod: 36, stroke: 300, load: 10000 }],
    ['cyl', 'Vérin simple effet', { medium: 'hyd', single: true, bore: 50, rod: 36, stroke: 200 }],
    ['valve', 'Distributeur 4/3 levier tandem', { vt: 'v43t', medium: 'hyd', aL: 'lever', aR: 'lever', tag: '1V1' }],
    ['valve', 'Distributeur 4/3 élec. centre fermé', { vt: 'v43c', medium: 'hyd', aL: 'sol', aR: 'sol', tL: 'Y1', tR: 'Y2' }],
    ['valve', 'Distributeur 4/3 élec. tandem', { vt: 'v43t', medium: 'hyd', aL: 'sol', aR: 'sol', tL: 'Y1', tR: 'Y2' }],
    ['valve', 'Distributeur 4/2 élec.', { vt: 'v42', medium: 'hyd', aL: 'sol', aR: 'spring', tL: 'Y1' }],
    ['valve', 'Distributeur 2/2 élec.', { vt: 'v22', medium: 'hyd', aL: 'sol', aR: 'spring', tL: 'Y3' }],
    ['valve', 'Distributeur 4/3 piloté hydr.', { vt: 'v43c', medium: 'hyd', aL: 'pilotH', aR: 'pilotH' }],
    ['valve', 'Distributeur 4/3 électro-hydraulique', { vt: 'v43t', medium: 'hyd', aL: 'sol', xL: 'pilotH', aR: 'sol', xR: 'pilotH', tL: 'Y1', tR: 'Y2' }],
    ['valve', 'Distributeur 4/3 centre ouvert H', { vt: 'v43o', medium: 'hyd', aL: 'sol', aR: 'sol', tL: 'Y1', tR: 'Y2' }],
    ['valve', 'Distributeur 4/3 centre Y (A et B→T)', { vt: 'v43f', medium: 'hyd', aL: 'sol', aR: 'sol', tL: 'Y1', tR: 'Y2' }],
    ['motorf', 'Moteur hydraulique', { medium: 'hyd' }], ['pumpvar']]],
  ['Appareils de pression', [['relief'], ['relief', 'Limiteur à action pilotée (orifice X)', { rpilot: true, set: 160, tag: '0V1' }], ['relief', 'Limiteur avec mise à vide électrique', { vtag: 'Y0', tag: '0V1' }], ['reducer'], ['seqv'], ['cbv']]],
  ['Appareils fluidiques', [['filter'], ['cooler', 'Refroidisseur d\'huile (ventilé)', { medium: 'hyd', cool: 'fan' }], ['cooler', 'Échangeur huile / eau', { medium: 'hyd', cool: 'eau', kw: 15 }], ['cooler', 'Refroidisseur d\'air comprimé', { medium: 'pneu', cool: 'fan', kw: 4, tag: '0E2' }], ['throttle'], ['throttle', 'Limiteur bidirectionnel', { check: false }], ['check'], ['shuttle'], ['twopress'], ['pswitch']]],
  ['Électrique — commande', [['supply'], ['pb_no'], ['pb_nc'], ['sw_no'], ['estop'], ['coil'], ['k_no'], ['k_nc'], ['coil_t'], ['ls_no'], ['ls_nc'], ['prox'], ['sol'], ['lamp'], ['motor'], ['buzzer']]],
  ['Électrique — puissance', [['mains3'], ['mains3', 'Réseau triphasé 380 V', { U: '380' }], ['mains1'], ['transfo'], ['psu'], ['breaker'], ['breaker', 'Disjoncteur 1P+N', { poles: 2, In: 10 }], ['rcd'], ['rcd', 'Différentiel 4P 30 mA', { poles: 4 }], ['fuse'], ['kmp'], ['rth'], ['motor3'], ['motor', 'Moteur monophasé 230 V', { vnom: '230', power: 750, tag: 'M2' }], ['lamp', 'Voyant 230 V', { vnom: '230', power: 5 }], ['coil', 'Bobine de contacteur 230 V', { vnom: '230', tag: 'KM1', power: 8 }], ['coil', 'Bobine de contacteur 24 V', { tag: 'KM1', power: 5 }]]],
  ['Automate programmable', [['plc']]],
  ['Électronique numérique', [['lsw'], ['lbtn'], ['clk'], ['and'], ['or'], ['not'], ['nand'], ['nor'], ['xor'], ['rs'], ['dff'], ['cnt'], ['led'], ['seg7']]],
  ['Systèmes virtuels', [['conveyor'], ['traffic']]],
  ['Instruments de mesure', [['gauge'], ['flowm'], ['vm']]],
  ['Connexions', [['node'], ['offpage'], ['text']]]
];
