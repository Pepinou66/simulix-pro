'use strict';
/* =====================================================================
   Exemples prêts à l'emploi
   ===================================================================== */
function Proj(name, sheets) {
  const o = { project: { name, author: 'Simulix Pro', company: '', rev: 'A', date: new Date().toISOString().slice(0, 10) }, opts: { frame: true, wireNums: false, xref: true }, sheets: sheets.map(n => ({ name: n })), comps: [], wires: [] };
  let n = 1;
  o.add = (type, x, y, props = {}, sheet = 0, rot = 0) => {
    const id = 'c' + (n++), d = DEFS[type];
    const pr = Object.assign(JSON.parse(JSON.stringify(d.defProps || {})), props);
    if (type === 'plc' && !pr.prog) pr.prog = PLC.newProg();
    o.comps.push({ id, type, x, y, rot, sheet, props: pr, fault: null }); return id;
  };
  o.w = (a, pa, b, pb, mo = null) => {
    const ca = o.comps.find(c => c.id === a), cb = o.comps.find(c => c.id === b);
    const ka = compPorts(ca).find(p => p.id === pa), kb = compPorts(cb).find(p => p.id === pb);
    if (!ka || !kb) throw new Error('Port inconnu ' + pa + '/' + pb);
    o.wires.push({ id: 'c' + (n++), a: { c: a, p: pa }, b: { c: b, p: pb }, kind: wireKind(ka.k, kb.k), mo });
  };
  o.txt = (x, y, text, sheet = 0, size = 13) => o.add('text', x, y, { text, size }, sheet);
  return o;
}
const L = (cells, vl, rows = 10) => ({ rows, cells, vl: vl || {}, sym: {}, cmt: {}, graf: { steps: [], trans: [] } });

function exElectroPneu(withFault) {
  const o = Proj(withFault ? 'Dépannage — va-et-vient électropneumatique' : 'Électropneumatique — va-et-vient automatique', ['Pneumatique', 'Commande électrique']);
  // ---- Folio 1 : partie pneumatique
  const A = o.add('cyl', 300, 200, { tag: 'A', medium: 'pneu', bore: 32, rod: 12, stroke: 100, load: 150, vmax: 200, ref: 'Vérin ISO 15552 Ø32 × 100' });
  const V = o.add('valve', 260, 400, { tag: '1V1', vt: 'v52', medium: 'pneu', aL: 'sol', aR: 'sol', tL: 'Y1', tR: 'Y2' });
  const T1 = o.add('throttle', 290, 290, { tag: '1V2', open: 45, check: true }), T2 = o.add('throttle', 420, 290, { tag: '1V3', open: 45, check: true });
  const Z = o.add('compressor', 310, 560, { tag: '0Z1', p: 6 }), G = o.add('gauge', 160, 300, { tag: 'P1' });
  o.w(A, 'A', T1, '2'); o.w(A, 'B', T2, '2'); o.w(T1, '1', V, '4'); o.w(T2, '1', V, '2'); o.w(V, '1', Z, 'P'); o.w(G, 'f', A, 'A');
  o.txt(560, 230, 'A0 : vérin rentré (1S1)\nA1 : vérin sorti (1S2)\nLimiteurs unidirectionnels en échappement', 0, 12);
  // ---- Folio 2 : commande électrique
  const G1 = o.add('supply', 100, 300, { tag: 'G1', imax: 3 }, 1);
  const S1 = o.add('pb_no', 280, 200, { tag: 'S1' }, 1), S2 = o.add('sw_no', 360, 200, { tag: 'S2' }, 1);
  const B1 = o.add('ls_no', 280, 300, { tag: '1S1', cyl: 'A', pos: 'rentré' }, 1), Y1 = o.add('sol', 280, 420, { tag: 'Y1' }, 1);
  const B2 = o.add('ls_no', 500, 200, { tag: '1S2', cyl: 'A', pos: 'sorti' }, 1), Y2 = o.add('sol', 500, 420, { tag: 'Y2' }, 1);
  const H = o.add('lamp', 640, 200, { tag: 'H1', color: 'vert' }, 1);
  o.w(G1, '+', S1, 'a', 150); o.w(S1, 'a', S2, 'a', 180); o.w(S1, 'b', S2, 'b', 280); o.w(S1, 'b', B1, 'a'); o.w(B1, 'b', Y1, 'a');
  o.w(S1, 'a', B2, 'a', 150); o.w(B2, 'b', Y2, 'a'); o.w(B2, 'a', H, 'a', 150);
  o.w(Y1, 'b', G1, '0', 540); o.w(Y2, 'b', Y1, 'b', 540); o.w(H, 'b', Y2, 'b', 540);
  o.txt(280, 620, 'S1 : départ cycle (maintenir)   S2 : cycle continu\nCliquez sur S1 ou basculez S2 pendant la simulation.', 1, 12);
  if (withFault) { o.comps.find(c => c.id === B2).fault = 'open'; o.hideFaults = true; o.txt(700, 380, 'EXERCICE : le vérin sort mais ne rentre plus.\nMesurez au voltmètre, observez puis signalez le composant défectueux.', 1, 14); const VM = o.add('vm', 760, 470, { tag: 'V1' }, 1); }
  return o;
}
function exPneuSimple() {
  const o = Proj('Pneumatique — commande directe d\'un vérin simple effet', ['Pneumatique']);
  const Z = o.add('compressor', 300, 560, { p: 6 });
  const V = o.add('valve', 190, 380, { tag: '1S0', vt: 'v32', aL: 'button', aR: 'spring' });
  const A = o.add('cyl', 310, 200, { tag: 'A', medium: 'pneu', single: true, bore: 25, rod: 10, stroke: 80, vmax: 300 });
  const G = o.add('gauge', 420, 270, { tag: 'P1' });
  o.w(V, '1', Z, 'P'); o.w(V, '2', A, 'A'); o.w(G, 'f', V, '2');
  o.txt(560, 380, 'Simulez puis maintenez le bouton du distributeur 3/2 :\nle vérin sort ; relâchez : le ressort le fait rentrer.', 0, 13);
  return o;
}
function exPneuDE() {
  const o = Proj('Pneumatique — vérin double effet, distributeur 5/2 à levier', ['Pneumatique']);
  const A = o.add('cyl', 300, 160, { tag: 'A', medium: 'pneu', bore: 50, rod: 20, stroke: 200, load: 400, vmax: 250, ref: 'Vérin ISO 15552 Ø50 × 200' });
  const T1 = o.add('throttle', 290, 280, { tag: '1V2', open: 30, check: true }), T2 = o.add('throttle', 420, 280, { tag: '1V3', open: 30, check: true });
  const V = o.add('valve', 200, 440, { tag: '1V1', vt: 'v52', aL: 'lever', aR: 'spring' });
  const Z = o.add('compressor', 330, 600, { p: 6 });
  const G1 = o.add('gauge', 180, 260, { tag: 'P1' }), G2 = o.add('gauge', 540, 250, { tag: 'P2' });
  o.w(A, 'A', T1, '2'); o.w(A, 'B', T2, '2'); o.w(T1, '1', V, '4'); o.w(T2, '1', V, '2'); o.w(V, '1', Z, 'P'); o.w(G1, 'f', T1, '2'); o.w(G2, 'f', T2, '2');
  o.txt(640, 420, 'Cliquez sur le levier du distributeur pour sortir / rentrer le vérin.\nRéglez l\'ouverture des limiteurs (panneau de droite)\net observez la vitesse dans le traceur.', 0, 13);
  return o;
}
function exElec() {
  const o = Proj('Électrique — marche / arrêt avec auto-maintien et temporisation', ['Circuit de commande']);
  const G1 = o.add('supply', 100, 300, { tag: 'G1', imax: 6 });
  const S0 = o.add('pb_nc', 280, 200, { tag: 'S0' }), S1 = o.add('pb_no', 280, 300, { tag: 'S1' }), K = o.add('coil', 280, 420, { tag: 'K1' });
  const KA = o.add('k_no', 360, 300, { tag: 'K1' });
  const K2 = o.add('k_no', 500, 200, { tag: 'K1' }), KT = o.add('coil_t', 500, 420, { tag: 'KT1', delay: 3, mode: 'travail' });
  const K3 = o.add('k_no', 640, 200, { tag: 'K1' }), H1 = o.add('lamp', 640, 420, { tag: 'H1', color: 'vert' });
  const KT2 = o.add('k_no', 780, 200, { tag: 'KT1' }), M = o.add('motor', 780, 420, { tag: 'M1', power: 60 });
  const K4 = o.add('k_nc', 920, 200, { tag: 'K1' }), H2 = o.add('lamp', 920, 420, { tag: 'H2', color: 'rouge' });
  const VM = o.add('vm', 160, 400, { tag: 'V1' });
  o.w(G1, '+', S0, 'a', 150); o.w(S0, 'b', S1, 'a'); o.w(S1, 'b', K, 'a'); o.w(KA, 'a', S1, 'a', 280); o.w(KA, 'b', S1, 'b', 380);
  [K2, K3, KT2, K4].reduce((p, x) => { o.w(p, 'a', x, 'a', 150); return x; }, S0);
  o.w(K2, 'b', KT, 'a'); o.w(K3, 'b', H1, 'a'); o.w(KT2, 'b', M, 'a'); o.w(K4, 'b', H2, 'a');
  o.w(K, 'b', G1, '0', 540); [KT, H1, M, H2].reduce((p, x) => { o.w(p, 'b', x, 'b', 540); return x; }, K);
  o.w(VM, 'a', K, 'a'); o.w(VM, 'b', K, 'b');
  o.txt(280, 620, 'S1 : marche   S0 : arrêt   K1 : relais d\'auto-maintien   KT1 : temporisé travail 3 s (démarrage différé du moteur M1)', 0, 12);
  return o;
}
function exHyd() {
  const o = Proj('Hydraulique — vérin double effet, distributeur 4/3 centre tandem', ['Hydraulique']);
  const P = o.add('pump', 300, 580, { tag: '0P1', q: 20, pmax: 120, ref: 'Pompe engrenages 16 cm³ — 1450 tr/min' });
  const V = o.add('valve', 200, 400, { tag: '1V1', vt: 'v43t', medium: 'hyd', aL: 'lever', aR: 'lever' });
  const A = o.add('cyl', 300, 140, { tag: 'A', medium: 'hyd', bore: 63, rod: 36, stroke: 300, load: 10000, ref: 'Vérin ISO 6020-2 Ø63/36 × 300' });
  const Q = o.add('flowm', 290, 250, { tag: 'Q1' });
  const G1 = o.add('gauge', 160, 480, { tag: 'P1' }), G2 = o.add('gauge', 170, 220, { tag: 'P2' });
  o.w(V, 'P', P, 'P'); o.w(V, 'T', P, 'T'); o.w(Q, '2', A, 'A'); o.w(Q, '1', V, 'A'); o.w(V, 'B', A, 'B'); o.w(G1, 'f', V, 'P'); o.w(G2, 'f', Q, '2');
  o.txt(660, 400, 'Cliquez à gauche ou à droite du distributeur pour basculer les leviers.\nCentre tandem : pompe à la bâche, pression ≈ 0.\nEn fin de course la pression monte au tarage du limiteur (120 bar).\nCharge 10 kN → ≈ 35 bar pendant la sortie.', 0, 13);
  return o;
}
function exLadder() {
  const o = Proj('Automate — Ladder : marche/arrêt et clignotant', ['Câblage automate']);
  const PLCc = o.add('plc', 760, 300, { tag: 'API1' });
  const G1 = o.add('supply', 380, 600, { tag: 'G1' });
  const S1 = o.add('pb_no', 600, 250, { tag: 'S1' }, 0, 3), S0 = o.add('pb_nc', 600, 310, { tag: 'S0' }, 0, 3), S2 = o.add('sw_no', 600, 370, { tag: 'S2' }, 0, 3);
  const OP1 = o.add('offpage', 480, 260, { tag: '+24V' }, 0, 2), OP2 = o.add('offpage', 420, 560, { tag: '+24V' }), OP3 = o.add('offpage', 420, 700, { tag: '0V' }), OP4 = o.add('offpage', 680, 490, { tag: '0V' }, 0, 2), OP5 = o.add('offpage', 1020, 490, { tag: '+24V' });
  const H1 = o.add('lamp', 1080, 330, { tag: 'H1', color: 'vert' }), H2 = o.add('lamp', 1000, 350, { tag: 'H2', color: 'orange' });
  const OP6 = o.add('offpage', 1120, 560, { tag: '0V' });
  o.w(OP1, 'n', S1, 'a'); o.w(S1, 'a', S0, 'a', 570); o.w(S0, 'a', S2, 'a', 570);
  o.w(S1, 'b', PLCc, 'I0', 740); o.w(S0, 'b', PLCc, 'I1', 720); o.w(S2, 'b', PLCc, 'I2', 700);
  o.w(OP2, 'n', G1, '+'); o.w(OP3, 'n', G1, '0'); o.w(OP4, 'n', PLCc, 'COM'); o.w(OP5, 'n', PLCc, 'L+');
  o.w(PLCc, 'Q0', H1, 'a'); o.w(PLCc, 'Q1', H2, 'a'); o.w(H1, 'b', OP6, 'n'); o.w(H2, 'b', OP6, 'n');
  const c = o.comps.find(x => x.id === PLCc);
  c.props.prog = L({
    '0,0': { t: 'NO', a: 'I0' }, '0,1': { t: 'NO', a: 'I1' }, '0,2': { t: 'H' }, '0,3': { t: 'H' }, '0,4': { t: 'H' }, '0,5': { t: 'H' }, '0,6': { t: 'H' }, '0,7': { t: 'C', a: 'Q0' },
    '1,0': { t: 'NO', a: 'Q0' },
    '3,0': { t: 'NO', a: 'Q0' }, '3,1': { t: 'NO', a: 'I2' }, '3,2': { t: 'NC', a: 'T1' }, '3,3': { t: 'TON', a: 'T0', p: 0.5 },
    '4,0': { t: 'NO', a: 'T0' }, '4,1': { t: 'TON', a: 'T1', p: 0.5 },
    '5,0': { t: 'NO', a: 'Q0' }, '5,1': { t: 'NC', a: 'T0' }, '5,2': { t: 'NO', a: 'I2' }, '5,3': { t: 'H' }, '5,4': { t: 'H' }, '5,5': { t: 'H' }, '5,6': { t: 'H' }, '5,7': { t: 'C', a: 'Q1' }
  }, { '0,0': true });
  c.props.prog.sym = { I0: 'Marche', I1: 'Arrêt', I2: 'Clignot', Q0: 'Marche', Q1: 'Voyant' };
  c.props.prog.cmt = { 0: 'Auto-maintien', 3: 'Base de temps clignotant', 5: 'Voyant clignotant si S2' };
  o.txt(80, 120, 'Double-cliquez sur l\'automate pour voir le programme Ladder\n(visualisation dynamique pendant la simulation).\nS1 : marche, S0 : arrêt, S2 : voyant clignotant.', 0, 13);
  return o;
}
function exGrafcet() {
  const o = Proj('Automate — GRAFCET : convoyeur', ['Câblage automate']);
  const PLCc = o.add('plc', 760, 300, { tag: 'API1' });
  const CV = o.add('conveyor', 80, 80, { tag: 'CV1', speed: 0.2 });
  const G1 = o.add('supply', 380, 600, { tag: 'G1' });
  const S1 = o.add('pb_no', 600, 250, { tag: 'S1' }, 0, 3), S0 = o.add('pb_nc', 600, 310, { tag: 'S0' }, 0, 3);
  const P = t => o.add('offpage', 0, 0, { tag: t });
  const pos = (id, x, y, rot = 0) => { const c = o.comps.find(q => q.id === id); c.x = x; c.y = y; c.rot = rot; return id; };
  const a = pos(P('+24V'), 480, 260, 2), b = pos(P('+24V'), 420, 560), cc = pos(P('0V'), 420, 700), d = pos(P('0V'), 680, 490, 2), e = pos(P('+24V'), 1020, 490);
  const m1 = pos(P('MOT'), 110, 290), m2 = pos(P('0V'), 150, 240), sp = pos(P('+24V'), 460, 250), mo = pos(P('MOT'), 1020, 320);
  const H1 = o.add('lamp', 1080, 370, { tag: 'H1', color: 'orange' }), z = pos(P('0V'), 1120, 450);
  o.w(a, 'n', S1, 'a'); o.w(S1, 'a', S0, 'a', 570); o.w(S1, 'b', PLCc, 'I0', 740); o.w(S0, 'b', PLCc, 'I1', 720);
  o.w(b, 'n', G1, '+'); o.w(cc, 'n', G1, '0'); o.w(d, 'n', PLCc, 'COM'); o.w(e, 'n', PLCc, 'L+');
  o.w(m1, 'n', CV, 'm1'); o.w(m2, 'n', CV, 'm2'); o.w(CV, 's1a', CV, 's2a', 225); o.w(sp, 'n', CV, 's2a');
  o.w(CV, 's1b', PLCc, 'I2'); o.w(CV, 's2b', PLCc, 'I3'); o.w(mo, 'n', PLCc, 'Q0'); o.w(PLCc, 'Q1', H1, 'a'); o.w(H1, 'b', z, 'n');
  const c = o.comps.find(x => x.id === PLCc);
  c.props.prog = L({}, {}, 6);
  c.props.prog.graf = { steps: [{ n: 0, init: true, act: '' }, { n: 1, act: 'Q0' }, { n: 2, act: 'Q1' }], trans: [{ from: '0', to: '1', cond: 'I0 . I1 . I2' }, { from: '1', to: '2', cond: 'I3' }, { from: '1', to: '0', cond: '/I1' }, { from: '2', to: '0', cond: '/I3' }] };
  c.props.prog.sym = { I0: 'Marche', I1: 'Arrêt', I2: 'Début', I3: 'Fin', Q0: 'Convoy', Q1: 'Signal' };
  o.txt(560, 600, 'Simulation : cliquez sur la partie gauche du convoyeur pour poser une caisse,\nappuyez sur S1 : la caisse avance jusqu\'au détecteur de fin (étape 2, voyant H1).\nRetirez la caisse (clic sur la partie droite) pour revenir à l\'étape initiale.\nDouble-cliquez sur l\'automate → onglet GRAFCET pour voir les étapes actives.', 0, 13);
  return o;
}
function exLogic() {
  const o = Proj('Électronique numérique — compteur, afficheur et demi-additionneur', ['Logique']);
  const CK = o.add('clk', 100, 200, { tag: 'H', f: 2 }), RZ = o.add('lsw', 160, 280, { tag: 'RAZ' });
  const CN = o.add('cnt', 260, 200), SG = o.add('seg7', 440, 200);
  o.w(CK, 'y', CN, 'C'); o.w(RZ, 'y', CN, 'R'); ['0', '1', '2', '3'].forEach((i, k) => o.w(CN, 'Q' + i, SG, 'ABCD'[k]));
  const E1 = o.add('lsw', 100, 450, { tag: 'E1' }), E2 = o.add('lsw', 100, 530, { tag: 'E2' });
  const AN = o.add('and', 240, 440), XO = o.add('xor', 240, 520);
  const L1 = o.add('led', 360, 440, { tag: 'R', color: 'rouge' }), L2 = o.add('led', 360, 520, { tag: 'S', color: 'vert' });
  o.w(E1, 'y', AN, 'a'); o.w(E2, 'y', AN, 'b', 200); o.w(E1, 'y', XO, 'a', 180); o.w(E2, 'y', XO, 'b');
  o.w(AN, 'y', L1, 'a'); o.w(XO, 'y', L2, 'a');
  o.txt(600, 220, 'Compteur 4 bits piloté par une horloge à 2 Hz,\nafficheur 7 segments avec décodeur BCD.', 0, 13);
  o.txt(600, 470, 'Demi-additionneur : S = E1 ⊕ E2   R = E1 · E2\nCliquez sur E1 / E2 pendant la simulation.', 0, 13);
  return o;
}
function exCbv() {
  const o = Proj('Hydraulique — retenue de charge : soupape d\'équilibrage', ['Hydraulique']);
  const P = o.add('pump', 300, 640, { tag: '0P1', disp: 16, n: 1450, etav: 95, pmax: 160 });
  const F = o.add('filter', 410, 520, { tag: '0Z1', kind: 'retour' });
  const V = o.add('valve', 200, 400, { tag: '1V1', vt: 'v43f', medium: 'hyd', aL: 'sol', aR: 'sol', tL: 'Y1', tR: 'Y2' });
  const A = o.add('cyl', 450, 220, { tag: 'A', medium: 'hyd', bore: 63, rod: 36, stroke: 300, load: 20000, ldir: 'sortie', labPos: 'tr' }, 0, 3);
  const C = o.add('cbv', 590, 400, { tag: '1V2', set: 90, ratio: 4 });
  const G1 = o.add('gauge', 160, 520, { tag: 'P1' }), G2 = o.add('gauge', 680, 300, { tag: 'P2' });
  o.w(V, 'P', P, 'P'); o.w(V, 'T', F, '2'); o.w(F, '1', P, 'T'); o.w(C, '2', A, 'A'); o.w(C, '1', V, 'A', 460); o.w(C, 'X', V, 'B', 360); o.w(V, 'B', A, 'B', 360); o.w(G1, 'f', V, 'P'); o.w(G2, 'f', A, 'A');
  o.txt(820, 380, 'Vérin vertical chargé à 2 tonnes (charge pesante).\nMaintenez le côté gauche du distributeur (Y1) pour lever, le côté droit (Y2) pour descendre :\nla soupape d\'équilibrage s\'ouvre par le pilotage X.\nEssayez : clic sur le flexible soupape → distributeur, puis « Simuler une rupture » :\nla charge reste retenue. Avec la défaillance « clapet non étanche », elle chute.', 0, 13);
  return o;
}
function exSeq() {
  const o = Proj('Hydraulique — séquence de deux vérins', ['Hydraulique']);
  const P = o.add('pump', 300, 700, { tag: '0P1', disp: 16, n: 1450, etav: 95, pmax: 160 });
  const V = o.add('valve', 200, 520, { tag: '1V1', vt: 'v43t', medium: 'hyd', aL: 'lever', aR: 'lever' });
  const B = o.add('cyl', 160, 140, { tag: 'B', medium: 'hyd', bore: 63, rod: 36, stroke: 200, load: 8000 });
  const A = o.add('cyl', 560, 140, { tag: 'A', medium: 'hyd', bore: 50, rod: 28, stroke: 200, load: 2000 });
  const S = o.add('seqv', 550, 300, { tag: '1V2', set: 60, check: true });
  const G = o.add('gauge', 640, 320, { tag: 'P1' }), G0 = o.add('gauge', 160, 600, { tag: 'P0' });
  o.w(V, 'P', P, 'P'); o.w(V, 'T', P, 'T'); o.w(V, 'A', B, 'A', 460); o.w(V, 'A', S, 'A', 440); o.w(S, 'B', A, 'A'); o.w(V, 'B', B, 'B', 480); o.w(V, 'B', A, 'B', 480); o.w(G, 'f', S, 'A'); o.w(G0, 'f', V, 'P');
  o.txt(860, 380, 'Sans séquence, le vérin le moins chargé (A, 2 kN) sortirait le premier.\nLa soupape de séquence 1V2 (60 bar) le retient : B (8 kN) sort d\'abord,\nla pression monte en fin de course de B et ouvre la séquence → A sort ensuite.\nLevier gauche du distributeur : sortie — levier droit : rentrée (retour libre par le clapet).', 0, 13);
  return o;
}
function exHydrostat() {
  const o = Proj('Hydraulique — transmission hydrostatique en circuit fermé', ['Circuit fermé']);
  const P = o.add('pumpvar', 300, 420, { tag: '1P1', disp: 45, n: 2000, gav: 25, hp: 400 });
  const M = o.add('motorf', 320, 120, { tag: 'M1', medium: 'hyd', disp: 100, torque: 120, labPos: 'tr' });
  const GA = o.add('gauge', 180, 260, { tag: 'MA' }), GB = o.add('gauge', 480, 260, { tag: 'MB' });
  o.w(P, 'A', M, 'A', 300); o.w(P, 'B', M, 'B', 100); o.w(GA, 'f', P, 'A'); o.w(GB, 'f', P, 'B');
  o.txt(640, 300, 'Cliquez à droite / à gauche de la pompe pour incliner le plateau (marche avant / arrière).\nStand-by : MA = MB = pression de gavage (25 bar).\nEn marche : la branche HP prend la pression de la charge, l\'autre reste au gavage.\nDéfaillances à tester : moteur bloqué (soupape HP 400 bar),\nzéro de pompe déréglé (dérive au neutre), gavage trop faible.', 0, 13);
  return o;
}
const EXAMPLES = [
  { name: 'Électropneumatique — va-et-vient automatique (2 folios)', build: () => exElectroPneu(false) },
  { name: 'Pneumatique — vérin simple effet', build: exPneuSimple },
  { name: 'Pneumatique — vérin double effet et limiteurs', build: exPneuDE },
  { name: 'Hydraulique — vérin, 4/3 tandem, débitmètre', build: exHyd },
  { name: 'Hydraulique — retenue de charge (soupape d\'équilibrage)', build: exCbv },
  { name: 'Hydraulique — séquence de deux vérins', build: exSeq },
  { name: 'Hydraulique — transmission hydrostatique (circuit fermé)', build: exHydrostat },
  { name: 'Électrique — auto-maintien et temporisation', build: exElec },
  { name: 'Automate — Ladder marche/arrêt et clignotant', build: exLadder },
  { name: 'Automate — GRAFCET convoyeur', build: exGrafcet },
  { name: 'Électronique numérique — compteur et additionneur', build: exLogic },
  { name: 'Dépannage — trouver la panne (exercice)', build: () => exElectroPneu(true) }
];
