'use strict';
/* =====================================================================
   Électronique analogique (schéma + simulation, esprit Proteus/ISIS)
   Solveur MNA (analyse nodale modifiée) : régime transitoire par pas
   d'intégration (Euler implicite), Newton-Raphson pour les éléments non
   linéaires (diodes, LED, transistors, MOSFET, AOP, NE555).
   Liaisons de type « n » (électronique), masse = composant « Masse ».
   ===================================================================== */
const E_VT = 0.025852;
const EOPTS = { m: 1e-3, u: 1e-6, µ: 1e-6, n: 1e-9, p: 1e-12, k: 1e3, K: 1e3, M: 1e6, G: 1e9 };
// valeur avec préfixe : « 4,7k », « 100n », « 2M2 », « 470 » → nombre
function eval_(v) {
  if (typeof v === 'number') return v; let s = String(v || '0').trim().replace(',', '.').replace(/[ΩFHVAΩ]|ohm/gi, '');
  const m = s.match(/^(-?\d*\.?\d+)\s*([pnuµmkKMG]?)(\d*)$/); if (!m) return parseFloat(s) || 0;
  let x = parseFloat(m[1]); if (m[2]) { x *= EOPTS[m[2]]; if (m[3]) x += parseFloat('0.' + m[3]) * EOPTS[m[2]]; } return x;
}
function eng(x, unit) { // 0.0047 → « 4,7 m »
  if (!isFinite(x)) return '—'; const a = Math.abs(x); if (a < 1e-15) return '0 ' + unit;
  const P = [[1e9, 'G'], [1e6, 'M'], [1e3, 'k'], [1, ''], [1e-3, 'm'], [1e-6, 'µ'], [1e-9, 'n'], [1e-12, 'p']];
  for (const [f, p] of P) if (a >= f * 0.9995) return fmt(x / f, a / f >= 100 ? 0 : a / f >= 10 ? 1 : 2) + ' ' + p + unit;
  return fmt(x * 1e12, 2) + ' p' + unit;
}
const EN = (id, x, y, label) => P(id, x, y, 'n', label);
const ELED = { rouge: [1.9, '#ef4444'], vert: [2.1, '#22c55e'], jaune: [2.0, '#eab308'], orange: [2.0, '#f97316'], bleu: [3.0, '#3b82f6'], blanc: [3.1, '#e2e8f0'] };
const EDIODES = { '1N4148': { is: 2.5e-9, n: 1.75, imax: 0.3 }, '1N4007': { is: 7e-9, n: 1.9, imax: 1.5 }, 'Schottky 1N5819': { is: 3e-6, n: 1.4, imax: 1.5 } };
const fnum = (k, label, unit) => ({ k, label: label + (unit ? ' (' + unit + ')' : ''), type: 'text' });
const burnTxt = c => st(c).burnt ? ' (DÉTRUIT)' : '';

/* -------- jonction PN : courant et conductance sans débordement -------- */
function pn(v, is, nvt) {
  const x = v / nvt; if (x > 40) { const e = Math.exp(40); return [is * (e * (1 + x - 40) - 1), is * e / nvt]; }
  const e = Math.exp(x); return [is * (e - 1), is * e / nvt];
}

/* ============================ composants ============================ */
def('egnd', { name: 'Masse (0 V)', cat: 'Électronique', w: 30, h: 30, ports: [EN('g', 15, 0, 'masse')], noLabel: true, mna() { },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [15, 0, 15, 14]); D.line(ctx, [4, 14, 26, 14]); D.line(ctx, [8, 19, 22, 19]); D.line(ctx, [12, 24, 18, 24]); } });

def('ebat', {
  name: 'Pile / alimentation continue', cat: 'Électronique', w: 40, h: 60, ports: [EN('p', 20, 0, '+'), EN('m', 20, 60, '−')],
  defProps: { tag: 'BAT1', v: '9', r: '0.2' }, fields: [TAGF, fnum('v', 'Tension', 'V'), fnum('r', 'Résistance interne', 'Ω'), REFF], branches: () => 1,
  mna(c, k) { const r = Math.max(1e-3, eval_(c.props.r)); k.Vsrc(c._en.p, c._en.m, eval_(c.props.v), r); },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [20, 0, 20, 24]); D.line(ctx, [20, 36, 20, 60]); D.line(ctx, [8, 24, 32, 24], 2); D.line(ctx, [14, 30, 26, 30], 3); D.line(ctx, [8, 36, 32, 36], 2); D.line(ctx, [14, 42, 26, 42], 3); D.text(ctx, '+', 32, 14, 10, INK); },
  bom: c => 'Pile / alimentation ' + c.props.v + ' V', fp: 'conn2'
});
def('eac', {
  name: 'Source sinusoïdale (générateur)', cat: 'Électronique', w: 50, h: 60, ports: [EN('p', 25, 0, '+'), EN('m', 25, 60, '−')],
  defProps: { tag: 'V1', v: '5', f: '1', off: '0' }, fields: [TAGF, fnum('v', 'Amplitude crête', 'V'), fnum('f', 'Fréquence', 'Hz'), fnum('off', 'Décalage continu', 'V'), REFF], branches: () => 1, dyn: c => eval_(c.props.f),
  mna(c, k) { k.Vsrc(c._en.p, c._en.m, eval_(c.props.off) + eval_(c.props.v) * Math.sin(2 * Math.PI * eval_(c.props.f) * k.t), 0.05); },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [25, 0, 25, 14]); D.line(ctx, [25, 46, 25, 60]); D.circle(ctx, 25, 30, 16, '#fff'); ctx.beginPath(); for (let i = 0; i <= 20; i++) { const x = 15 + i, y = 30 - 7 * Math.sin(i / 20 * 2 * Math.PI); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); } ctx.stroke(); },
  bom: c => 'Générateur sinusoïdal', fp: 'conn2'
});
def('epulse', {
  name: 'Générateur de signaux carrés', cat: 'Électronique', w: 50, h: 60, ports: [EN('p', 25, 0, '+'), EN('m', 25, 60, '−')],
  defProps: { tag: 'V2', vh: '5', vl: '0', f: '1', duty: 50 }, fields: [TAGF, fnum('vh', 'Niveau haut', 'V'), fnum('vl', 'Niveau bas', 'V'), fnum('f', 'Fréquence', 'Hz'), { k: 'duty', label: 'Rapport cyclique (%)', type: 'range' }, REFF], branches: () => 1, dyn: c => eval_(c.props.f) * 20,
  mna(c, k) { const f = eval_(c.props.f) || 1, ph = (k.t * f) % 1; k.Vsrc(c._en.p, c._en.m, ph < (+c.props.duty || 50) / 100 ? eval_(c.props.vh) : eval_(c.props.vl), 0.05); },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [25, 0, 25, 14]); D.line(ctx, [25, 46, 25, 60]); D.circle(ctx, 25, 30, 16, '#fff'); D.line(ctx, [15, 35, 20, 35, 20, 25, 27, 25, 27, 35, 34, 35, 34, 25]); },
  bom: c => 'Générateur de signaux carrés', fp: 'conn2'
});

def('eres', {
  name: 'Résistance', cat: 'Électronique', w: 80, h: 20, ports: [EN('1', 0, 10), EN('2', 80, 10)],
  defProps: { tag: 'R1', r: '1k', pmax: '0.25' }, fields: [TAGF, fnum('r', 'Résistance', 'Ω — ex. 470, 4k7, 1M'), fnum('pmax', 'Puissance maxi', 'W'), REFF],
  mna(c, k) { if (st(c).burnt) return; k.G(c._en['1'], c._en['2'], 1 / Math.max(1e-3, eval_(c.props.r))); },
  accept(c, k) { const v = k.v(c._en['1']) - k.v(c._en['2']), r = Math.max(1e-3, eval_(c.props.r)), s = st(c); s.i = s.burnt ? 0 : v / r; s.p = s.i * v; if (!s.burnt && s.p > eval_(c.props.pmax) * 2.5) { s.burnt = true; k.warn('🔥 Résistance ' + c.props.tag + ' brûlée : ' + eng(s.p, 'W') + ' pour ' + c.props.pmax + ' W maxi'); } },
  draw(ctx, c, S) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 10, 20, 10]); D.line(ctx, [60, 10, 80, 10]); const s = st(c), hot = S && s.p > eval_(c.props.pmax) * 0.8; D.rect(ctx, 20, 3, 40, 14, s.burnt ? '#44403c' : hot ? '#fed7aa' : '#fff'); D.text(ctx, c.props.r + 'Ω', 40, -5, 8, '#475569'); },
  probe: (c, S) => ({ 'Valeur': eng(eval_(c.props.r), 'Ω') + burnTxt(c), 'Courant': eng(st(c).i || 0, 'A'), 'Tension': eng((st(c).i || 0) * eval_(c.props.r), 'V'), 'Puissance': eng(st(c).p || 0, 'W') + ' / ' + c.props.pmax + ' W' }),
  bom: c => 'Résistance ' + c.props.r + 'Ω ' + c.props.pmax + ' W', fp: 'axial400', plot: c => (st(c).i || 0) * 1000, plotUnit: 'mA'
});
def('epot', {
  name: 'Potentiomètre', cat: 'Électronique', w: 80, h: 40, ports: [EN('1', 0, 10), EN('2', 80, 10), EN('w', 40, 40, 'curseur')],
  defProps: { tag: 'RV1', r: '10k', pos: 50 }, fields: [TAGF, fnum('r', 'Résistance totale', 'Ω'), { k: 'pos', label: 'Position du curseur (%)', type: 'range' }, REFF],
  mna(c, k) { const R = Math.max(1, eval_(c.props.r)), a = clamp((+c.props.pos || 0) / 100, 0.001, 0.999); k.G(c._en['1'], c._en.w, 1 / (R * a)); k.G(c._en.w, c._en['2'], 1 / (R * (1 - a))); },
  press(c, x) { c.props.pos = clamp((+c.props.pos || 0) + (x < 40 ? -10 : 10), 0, 100); Props.render(); return true; },
  hint: c => 'Cliquer à gauche / à droite : −10 % / +10 % (' + c.props.pos + ' %)',
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 10, 20, 10]); D.line(ctx, [60, 10, 80, 10]); D.rect(ctx, 20, 3, 40, 14, '#fff'); const x = 20 + 40 * (+c.props.pos || 0) / 100; D.line(ctx, [40, 40, 40, 30, x, 30, x, 20]); D.tri(ctx, x, 20, 4, 'u', INK); D.text(ctx, c.props.pos + '%', 66, 32, 8, '#7c3aed'); },
  probe: (c, S) => ({ 'Résistance totale': eng(eval_(c.props.r), 'Ω'), 'Curseur': c.props.pos + ' %' }), bom: c => 'Potentiomètre ' + c.props.r + 'Ω', fp: 'pot3'
});
def('ecap', {
  name: 'Condensateur', cat: 'Électronique', w: 60, h: 30, ports: [EN('1', 0, 15, '+'), EN('2', 60, 15)], dyn: () => 1,
  defProps: { tag: 'C1', c: '100u', vmax: '25', polar: true }, fields: [TAGF, fnum('c', 'Capacité', 'F — ex. 100n, 47u'), fnum('vmax', 'Tension maxi', 'V'), { k: 'polar', label: 'Électrochimique polarisé (+ côté gauche)', type: 'chk' }, REFF],
  mna(c, k) { const s = st(c); if (s.burnt) return; const g = Math.max(1e-15, eval_(c.props.c)) / k.h; k.G(c._en['1'], c._en['2'], g); k.I(c._en['2'], c._en['1'], g * (s.v || 0)); },
  accept(c, k) { const s = st(c); if (s.burnt) return; const v = k.v(c._en['1']) - k.v(c._en['2']); s.i = eval_(c.props.c) * (v - (s.v || 0)) / k.h; s.v = v;
    if (Math.abs(v) > eval_(c.props.vmax) * 1.3 || (c.props.polar && v < -1.5)) { s.burnt = true; k.warn('💥 Condensateur ' + c.props.tag + ' éclaté : ' + eng(v, 'V') + (c.props.polar && v < 0 ? ' (branché à l\'envers)' : ' (tension maxi ' + c.props.vmax + ' V)')); } },
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 15, 26, 15]); D.line(ctx, [34, 15, 60, 15]); D.line(ctx, [26, 3, 26, 27], 2.4); if (c.props.polar) { D.rect(ctx, 31, 3, 4, 24, INK); D.text(ctx, '+', 19, 5, 9, INK); } else D.line(ctx, [34, 3, 34, 27], 2.4); if (st(c).burnt) D.text(ctx, '✕', 30, 15, 16, '#dc2626', 'center', true); D.text(ctx, c.props.c + 'F', 30, -5, 8, '#475569'); },
  probe: c => ({ 'Capacité': eng(eval_(c.props.c), 'F') + burnTxt(c), 'Tension': eng(st(c).v || 0, 'V'), 'Courant': eng(st(c).i || 0, 'A') }),
  bom: c => (c.props.polar ? 'Condensateur électrochimique ' : 'Condensateur ') + c.props.c + 'F ' + c.props.vmax + ' V', fp: c => c.props.polar ? 'radial200' : 'cap100', plot: c => st(c).v || 0, plotUnit: 'V'
});
def('eind', {
  name: 'Bobine (inductance)', cat: 'Électronique', w: 80, h: 20, ports: [EN('1', 0, 10), EN('2', 80, 10)], dyn: () => 1,
  defProps: { tag: 'L1', l: '10m', r: '1' }, fields: [TAGF, fnum('l', 'Inductance', 'H — ex. 10m'), fnum('r', 'Résistance du fil', 'Ω'), REFF],
  mna(c, k) { const s = st(c), L = Math.max(1e-9, eval_(c.props.l)), R = Math.max(1e-3, eval_(c.props.r)), g = 1 / (R + L / k.h); k.G(c._en['1'], c._en['2'], g); k.I(c._en['1'], c._en['2'], g * (L / k.h) * (s.i || 0)); },
  accept(c, k) { const s = st(c), L = eval_(c.props.l), R = Math.max(1e-3, eval_(c.props.r)), v = k.v(c._en['1']) - k.v(c._en['2']); s.i = (v + L / k.h * (s.i || 0)) / (R + L / k.h); },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 10, 16, 10]); D.line(ctx, [64, 10, 80, 10]); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(22 + i * 12, 10, 6, Math.PI, 0); ctx.stroke(); } },
  probe: c => ({ 'Inductance': eng(eval_(c.props.l), 'H'), 'Courant': eng(st(c).i || 0, 'A') }), bom: c => 'Bobine ' + c.props.l + 'H', fp: 'axial400'
});

function diodeMna(c, k, is, nvt, a, kk) {
  const vd = k.v(a) - k.v(kk), [I, g] = pn(vd, is, nvt), gm = g + 1e-12;
  k.nl(a, I + 1e-12 * vd, [[a, gm], [kk, -gm]]); k.nl(kk, -(I + 1e-12 * vd), [[a, -gm], [kk, gm]]);
}
def('ediode', {
  name: 'Diode', cat: 'Électronique', w: 60, h: 20, ports: [EN('a', 0, 10, 'anode'), EN('k', 60, 10, 'cathode')],
  defProps: { tag: 'D1', model: '1N4007' }, fields: [TAGF, { k: 'model', label: 'Modèle', type: 'sel', opts: Object.keys(EDIODES) }, REFF],
  mna(c, k) { if (st(c).burnt) return; const m = EDIODES[c.props.model] || EDIODES['1N4007']; diodeMna(c, k, m.is, m.n * E_VT, c._en.a, c._en.k); },
  accept(c, k) { const m = EDIODES[c.props.model] || EDIODES['1N4007'], s = st(c), vd = k.v(c._en.a) - k.v(c._en.k); s.i = s.burnt ? 0 : pn(vd, m.is, m.n * E_VT)[0]; s.vd = vd; if (!s.burnt && s.i > m.imax * 2) { s.burnt = true; k.warn('🔥 Diode ' + c.props.tag + ' détruite (' + eng(s.i, 'A') + ')'); } },
  draw(ctx, c) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 10, 60, 10]); ctx.beginPath(); ctx.moveTo(22, 2); ctx.lineTo(38, 10); ctx.lineTo(22, 18); ctx.closePath(); ctx.fillStyle = INK; ctx.fill(); D.line(ctx, [38, 2, 38, 18], 2); },
  probe: c => ({ 'Modèle': c.props.model + burnTxt(c), 'Tension directe': eng(st(c).vd || 0, 'V'), 'Courant': eng(st(c).i || 0, 'A') }), bom: c => 'Diode ' + c.props.model, fp: 'axial400'
});
def('ezener', {
  name: 'Diode Zener', cat: 'Électronique', w: 60, h: 20, ports: [EN('a', 0, 10, 'anode'), EN('k', 60, 10, 'cathode')],
  defProps: { tag: 'DZ1', vz: '5.1' }, fields: [TAGF, fnum('vz', 'Tension Zener', 'V'), REFF],
  mna(c, k) { diodeMna(c, k, 5e-9, 1.8 * E_VT, c._en.a, c._en.k); // claquage inverse : diode décalée de Vz
    const vr = k.v(c._en.k) - k.v(c._en.a) - eval_(c.props.vz), [I, g] = pn(vr, 1e-9, 1.2 * E_VT); k.nl(c._en.k, I, [[c._en.k, g], [c._en.a, -g]]); k.nl(c._en.a, -I, [[c._en.k, -g], [c._en.a, g]]); },
  accept(c, k) { st(c).vd = k.v(c._en.a) - k.v(c._en.k); },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 10, 60, 10]); ctx.beginPath(); ctx.moveTo(22, 2); ctx.lineTo(38, 10); ctx.lineTo(22, 18); ctx.closePath(); ctx.fillStyle = INK; ctx.fill(); D.line(ctx, [34, 0, 38, 2, 38, 18, 42, 20], 2); },
  probe: c => ({ 'Tension Zener': c.props.vz + ' V', 'Tension': eng(st(c).vd || 0, 'V') }), bom: c => 'Diode Zener ' + c.props.vz + ' V', fp: 'axial400'
});
def('eled', {
  name: 'LED', cat: 'Électronique', w: 60, h: 30, ports: [EN('a', 0, 15, 'anode'), EN('k', 60, 15, 'cathode')],
  defProps: { tag: 'D2', color: 'rouge', imax: '20' }, fields: [TAGF, { k: 'color', label: 'Couleur', type: 'sel', opts: Object.keys(ELED) }, fnum('imax', 'Courant nominal', 'mA'), REFF],
  par(c) { const vf = (ELED[c.props.color] || ELED.rouge)[0], nvt = 2 * E_VT; return { is: 0.01 / Math.exp(vf / nvt), nvt }; },
  mna(c, k) { if (st(c).burnt) return; const p = this.par(c); diodeMna(c, k, p.is, p.nvt, c._en.a, c._en.k); },
  accept(c, k) { const p = this.par(c), s = st(c), vd = k.v(c._en.a) - k.v(c._en.k); s.i = s.burnt ? 0 : pn(vd, p.is, p.nvt)[0]; s.vd = vd; const im = eval_(c.props.imax) / 1000 || 0.02;
    if (!s.burnt && s.i > im * 3.5) { s.burnt = true; k.warn('🔥 LED ' + c.props.tag + ' grillée : ' + eng(s.i, 'A') + ' — il manque une résistance de limitation (R = (U − ' + (ELED[c.props.color] || ELED.rouge)[0] + ' V) / ' + eval_(c.props.imax) + ' mA)'); } },
  draw(ctx, c, S) {
    const s = st(c), col = (ELED[c.props.color] || ELED.rouge)[1], im = eval_(c.props.imax) / 1000 || 0.02, lum = S && !s.burnt ? clamp((s.i || 0) / im, 0, 1.4) : 0;
    if (lum > 0.03) { ctx.save(); ctx.globalAlpha = Math.min(0.85, lum * 0.7); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(30, 15, 16 + 6 * lum, 0, 7); ctx.fill(); ctx.restore(); }
    ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 15, 60, 15]); ctx.beginPath(); ctx.moveTo(22, 7); ctx.lineTo(38, 15); ctx.lineTo(22, 23); ctx.closePath(); ctx.fillStyle = lum > 0.03 ? col : s.burnt ? '#44403c' : '#fff'; ctx.fill(); ctx.stroke(); D.line(ctx, [38, 7, 38, 23], 2);
    D.arrow(ctx, 30, 5, 38, -3, 3); D.arrow(ctx, 36, 7, 44, -1, 3);
  },
  probe: c => ({ 'Couleur': c.props.color + burnTxt(c), 'Courant': eng(st(c).i || 0, 'A') + ' (nominal ' + c.props.imax + ' mA)', 'Tension directe': eng(st(c).vd || 0, 'V') }),
  bom: c => 'LED 5 mm ' + c.props.color, fp: 'led5', plot: c => (st(c).i || 0) * 1000, plotUnit: 'mA'
});

function bjt(c, k, s) { // modèle d'Ebers-Moll (s = +1 NPN, −1 PNP)
  const B = c._en.b, C = c._en.c, E = c._en.e, bf = Math.max(5, eval_(c.props.beta) || 200), br = 2, is = 1e-14;
  const vbe = s * (k.v(B) - k.v(E)), vbc = s * (k.v(B) - k.v(C)), [If, gf] = pn(vbe, is, E_VT), [Ir, gr] = pn(vbc, is, E_VT);
  const Ic = If - Ir * (1 + 1 / br), Ib = If / bf + Ir / br;
  const dIc_b = gf - gr * (1 + 1 / br), dIc_e = -gf, dIc_c = gr * (1 + 1 / br), dIb_b = gf / bf + gr / br, dIb_e = -gf / bf, dIb_c = -gr / br, gmin = 1e-12;
  k.nl(C, s * Ic, [[B, dIc_b], [E, dIc_e], [C, dIc_c + gmin]]); k.nl(B, s * Ib, [[B, dIb_b + gmin], [E, dIb_e], [C, dIb_c]]);
  k.nl(E, -s * (Ic + Ib), [[B, -(dIc_b + dIb_b)], [E, -(dIc_e + dIb_e) + gmin], [C, -(dIc_c + dIb_c)]]);
}
const bjtAccept = (c, k, s) => { const st_ = st(c), vbe = s * (k.v(c._en.b) - k.v(c._en.e)), vbc = s * (k.v(c._en.b) - k.v(c._en.c)), [If] = pn(vbe, 1e-14, E_VT), [Ir] = pn(vbc, 1e-14, E_VT), bf = eval_(c.props.beta) || 200;
  st_.ic = If - Ir * 1.5; st_.ib = If / bf + Ir / 2; st_.vce = s * (k.v(c._en.c) - k.v(c._en.e)); st_.vbe = vbe;
  if (st_.ic > (eval_(c.props.icmax) || 0.6) * 2) { st_.burnt = true; k.warn('🔥 Transistor ' + c.props.tag + ' détruit (Ic = ' + eng(st_.ic, 'A') + ')'); } };
const bjtProbe = c => { const s = st(c); return { 'Ic': eng(s.ic || 0, 'A') + burnTxt(c), 'Ib': eng(s.ib || 0, 'A'), 'Vbe': eng(s.vbe || 0, 'V'), 'Vce': eng(s.vce || 0, 'V'), 'État': (s.ic || 0) < 1e-6 ? 'bloqué' : (s.vce || 0) < 0.3 ? 'saturé' : 'linéaire (amplification)' }; };
const bjtDraw = (ctx, c, pnp) => { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.circle(ctx, 32, 30, 20, '#fff'); D.line(ctx, [0, 30, 22, 30]); D.line(ctx, [22, 18, 22, 42], 2.4); D.line(ctx, [22, 24, 40, 10, 40, 0]); D.line(ctx, [22, 36, 40, 50, 40, 60]); if (pnp) D.arrow(ctx, 38, 13, 25, 23, 5); else D.arrow(ctx, 26, 39, 38, 48, 5); };
def('enpn', { name: 'Transistor NPN', cat: 'Électronique', w: 60, h: 60, ports: [EN('b', 0, 30, 'B'), EN('c', 40, 0, 'C'), EN('e', 40, 60, 'E')],
  defProps: { tag: 'Q1', beta: '200', icmax: '0.6' }, fields: [TAGF, fnum('beta', 'Gain β (hFE)'), fnum('icmax', 'Ic maxi', 'A'), REFF],
  mna(c, k) { if (!st(c).burnt) bjt(c, k, 1); }, accept(c, k) { if (!st(c).burnt) bjtAccept(c, k, 1); }, draw: (ctx, c) => bjtDraw(ctx, c, false), probe: bjtProbe, bom: c => 'Transistor NPN (2N2222 / BC547)', fp: 'to92', plot: c => (st(c).ic || 0) * 1000, plotUnit: 'mA' });
def('epnp', { name: 'Transistor PNP', cat: 'Électronique', w: 60, h: 60, ports: [EN('b', 0, 30, 'B'), EN('e', 40, 0, 'E'), EN('c', 40, 60, 'C')],
  defProps: { tag: 'Q2', beta: '200', icmax: '0.6' }, fields: [TAGF, fnum('beta', 'Gain β (hFE)'), fnum('icmax', 'Ic maxi', 'A'), REFF],
  mna(c, k) { if (!st(c).burnt) bjt(c, k, -1); }, accept(c, k) { if (!st(c).burnt) bjtAccept(c, k, -1); }, draw: (ctx, c) => bjtDraw(ctx, c, true), probe: bjtProbe, bom: c => 'Transistor PNP (2N2907 / BC557)', fp: 'to92' });
def('emos', { name: 'MOSFET canal N', cat: 'Électronique', w: 60, h: 60, ports: [EN('g', 0, 40, 'G'), EN('d', 40, 0, 'D'), EN('s', 40, 60, 'S')],
  defProps: { tag: 'Q3', vth: '2', kp: '0.5' }, fields: [TAGF, fnum('vth', 'Tension de seuil Vgs(th)', 'V'), fnum('kp', 'Transconductance K', 'A/V²'), REFF],
  mna(c, k) {
    let D_ = c._en.d, S_ = c._en.s; const G = c._en.g; if (k.v(D_) < k.v(S_)) [D_, S_] = [S_, D_];
    const vgs = k.v(G) - k.v(S_), vds = k.v(D_) - k.v(S_), vt = eval_(c.props.vth), K = eval_(c.props.kp), ov = vgs - vt, lam = 0.01;
    let I = 0, gm = 0, gds = 1e-9; if (ov > 0) { if (vds < ov) { I = K * (ov * vds - vds * vds / 2); gm = K * vds; gds = K * (ov - vds) + 1e-9; } else { I = K / 2 * ov * ov * (1 + lam * vds); gm = K * ov * (1 + lam * vds); gds = K / 2 * ov * ov * lam + 1e-9; } }
    k.nl(D_, I, [[G, gm], [D_, gds], [S_, -gm - gds]]); k.nl(S_, -I, [[G, -gm], [D_, -gds], [S_, gm + gds]]);
  },
  accept(c, k) { const s = st(c); s.vgs = k.v(c._en.g) - k.v(c._en.s); s.vds = k.v(c._en.d) - k.v(c._en.s); },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 40, 18, 40, 18, 16]); D.line(ctx, [24, 12, 24, 20], 2.4); D.line(ctx, [24, 26, 24, 34], 2.4); D.line(ctx, [24, 40, 24, 48], 2.4); D.line(ctx, [24, 16, 40, 16, 40, 0]); D.line(ctx, [24, 44, 40, 44, 40, 60]); D.line(ctx, [40, 44, 40, 30, 24, 30]); D.arrow(ctx, 36, 30, 27, 30, 4); },
  probe: c => ({ 'Vgs': eng(st(c).vgs || 0, 'V'), 'Vds': eng(st(c).vds || 0, 'V') }), bom: c => 'MOSFET canal N (IRLZ44N)', fp: 'to220'
});
def('eaop', { name: 'Amplificateur opérationnel (AOP)', cat: 'Électronique', w: 80, h: 60, ports: [EN('m', 0, 20, 'E− (inverseuse)'), EN('p', 0, 40, 'E+ (non inverseuse)'), EN('o', 80, 30, 'sortie')],
  defProps: { tag: 'U1', vp: '12', vn: '-12' }, fields: [TAGF, fnum('vp', 'Alimentation +Vcc', 'V'), fnum('vn', 'Alimentation −Vcc', 'V'), REFF], branches: () => 1,
  mna(c, k) { // source commandée (gain 10⁵) bornée par les alimentations
    const A = 1e5, vp = eval_(c.props.vp) - 1, vn = eval_(c.props.vn) + 1, vd = k.v(c._en.p) - k.v(c._en.m), vo = A * vd;
    if (vo > vp) k.Vsrc(c._en.o, -1, vp, 50); else if (vo < vn) k.Vsrc(c._en.o, -1, vn, 50); else k.VCVS(c._en.o, c._en.p, c._en.m, A, 50);
    k.G(c._en.p, -1, 1e-12); k.G(c._en.m, -1, 1e-12);
  },
  accept(c, k) { st(c).vo = k.v(c._en.o); },
  draw(ctx) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(14, 4); ctx.lineTo(66, 30); ctx.lineTo(14, 56); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); D.line(ctx, [0, 20, 14, 20]); D.line(ctx, [0, 40, 14, 40]); D.line(ctx, [66, 30, 80, 30]); D.text(ctx, '−', 21, 20, 12, INK); D.text(ctx, '+', 21, 40, 11, INK); D.text(ctx, '∞', 36, 30, 10, INK); },
  probe: c => ({ 'Tension de sortie': eng(st(c).vo || 0, 'V'), 'Alimentation': c.props.vn + ' / +' + c.props.vp + ' V' }), bom: c => 'Amplificateur opérationnel (LM358 / TL071)', fp: 'dip8', plot: c => st(c).vo || 0, plotUnit: 'V'
});
def('e555', { name: 'Temporisateur NE555', cat: 'Électronique', w: 100, h: 100,
  ports: [EN('vcc', 50, 0, '8 VCC'), EN('gnd', 50, 100, '1 GND'), EN('tr', 0, 30, '2 TRIG'), EN('th', 0, 50, '6 THR'), EN('dis', 0, 70, '7 DIS'), EN('out', 100, 50, '3 OUT')],
  defProps: { tag: 'U2' }, fields: [TAGF, REFF], branches: () => 1, dyn: () => 1,
  mna(c, k) { const s = st(c), vcc = k.v(c._en.vcc) - k.v(c._en.gnd);
    k.Vsrc(c._en.out, c._en.gnd, s.q ? Math.max(0, vcc - 1.5) : 0.1, 10); if (!s.q) k.G(c._en.dis, c._en.gnd, 1 / 15); else k.G(c._en.dis, c._en.gnd, 1e-9);
    k.G(c._en.vcc, c._en.gnd, 1 / 1500); k.G(c._en.tr, c._en.gnd, 1e-9); k.G(c._en.th, c._en.gnd, 1e-9); },
  accept(c, k) { const s = st(c), g = k.v(c._en.gnd), vcc = k.v(c._en.vcc) - g, tr = k.v(c._en.tr) - g, th = k.v(c._en.th) - g; if (vcc < 3) { s.q = false; return; } if (tr < vcc / 3) s.q = true; else if (th > 2 * vcc / 3) s.q = false; s.vo = k.v(c._en.out) - g; },
  draw(ctx, c, S) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.rect(ctx, 10, 10, 80, 80, '#fff'); D.line(ctx, [50, 0, 50, 10]); D.line(ctx, [50, 90, 50, 100]); D.line(ctx, [0, 30, 10, 30]); D.line(ctx, [0, 50, 10, 50]); D.line(ctx, [0, 70, 10, 70]); D.line(ctx, [90, 50, 100, 50]);
    D.text(ctx, 'NE555', 50, 50, 11, INK, 'center', true); D.text(ctx, 'TR', 20, 30, 7, '#64748b'); D.text(ctx, 'THR', 22, 50, 7, '#64748b'); D.text(ctx, 'DIS', 22, 70, 7, '#64748b'); D.text(ctx, 'OUT', 78, 50, 7, '#64748b'); D.text(ctx, 'VCC', 50, 18, 7, '#64748b'); D.text(ctx, 'GND', 50, 82, 7, '#64748b'); if (S) D.circle(ctx, 80, 22, 4, st(c).q ? '#22c55e' : '#e2e8f0'); },
  probe: c => ({ 'Sortie': st(c).q ? 'HAUT' : 'BAS', 'Tension de sortie': eng(st(c).vo || 0, 'V') }), bom: () => 'Temporisateur NE555 (DIP-8)', fp: 'dip8', plot: c => st(c).vo || 0, plotUnit: 'V'
});
const swDef = (type, name, momentary) => def(type, { name, cat: 'Électronique', w: 60, h: 30, ports: [EN('1', 0, 20), EN('2', 60, 20)],
  defProps: { tag: momentary ? 'BP1' : 'SW1', on: false }, fields: [TAGF, ...(momentary ? [] : [{ k: 'on', label: 'Fermé', type: 'chk' }]), REFF],
  mna(c, k) { k.G(c._en['1'], c._en['2'], (momentary ? st(c).dn : c.props.on) ? 1e2 : 1e-10); },
  press(c) { if (momentary) st(c).dn = true; else { c.props.on = !c.props.on; Props.render(); } return true; }, release(c) { if (momentary) st(c).dn = false; },
  hint: () => momentary ? 'Maintenir appuyé' : 'Cliquer : ouvrir / fermer',
  draw(ctx, c) { const on = momentary ? st(c).dn : c.props.on; ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 20, 16, 20]); D.line(ctx, [44, 20, 60, 20]); D.circle(ctx, 18, 20, 2.5, '#fff'); D.circle(ctx, 42, 20, 2.5, '#fff');
    if (momentary) { const y = on ? 18 : 10; D.line(ctx, [16, y, 44, y]); D.line(ctx, [30, y, 30, 0]); D.line(ctx, [24, 0, 36, 0]); } else D.line(ctx, [20, 20, 42, on ? 18 : 6]); },
  bom: () => momentary ? 'Bouton poussoir 6×6 mm' : 'Interrupteur à glissière', fp: 'sw2' });
swDef('esw', 'Interrupteur (électronique)', false); swDef('ebtn', 'Bouton poussoir (électronique)', true);
def('elamp', { name: 'Lampe à incandescence', cat: 'Électronique', w: 40, h: 40, ports: [EN('1', 0, 20), EN('2', 40, 20)],
  defProps: { tag: 'LA1', v: '12', p: '2' }, fields: [TAGF, fnum('v', 'Tension nominale', 'V'), fnum('p', 'Puissance', 'W'), REFF],
  mna(c, k) { if (!st(c).burnt) k.G(c._en['1'], c._en['2'], eval_(c.props.p) / Math.pow(eval_(c.props.v), 2)); },
  accept(c, k) { const s = st(c), v = k.v(c._en['1']) - k.v(c._en['2']); s.r = s.burnt ? 0 : Math.abs(v) / eval_(c.props.v); if (s.r > 1.5) { s.burnt = true; k.warn('🔥 Lampe ' + c.props.tag + ' grillée (' + eng(v, 'V') + ' pour ' + c.props.v + ' V)'); } },
  draw(ctx, c, S) { const r = S ? clamp(st(c).r || 0, 0, 1.2) : 0; if (r > 0.1) { ctx.save(); ctx.globalAlpha = Math.min(0.8, r * 0.7); ctx.fillStyle = '#fde047'; ctx.beginPath(); ctx.arc(20, 20, 18, 0, 7); ctx.fill(); ctx.restore(); } ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.circle(ctx, 20, 20, 13); D.line(ctx, [11, 11, 29, 29]); D.line(ctx, [29, 11, 11, 29]); D.line(ctx, [0, 20, 7, 20]); D.line(ctx, [33, 20, 40, 20]); },
  probe: c => ({ 'Éclairement': Math.round((st(c).r || 0) * 100) + ' %' + burnTxt(c) }), bom: c => 'Lampe ' + c.props.v + ' V ' + c.props.p + ' W', fp: 'conn2' });
def('ebuzz', { name: 'Buzzer', cat: 'Électronique', w: 40, h: 40, ports: [EN('p', 0, 30, '+'), EN('m', 40, 30, '−')],
  defProps: { tag: 'BZ1', r: '200' }, fields: [TAGF, fnum('r', 'Résistance', 'Ω'), REFF],
  mna(c, k) { k.G(c._en.p, c._en.m, 1 / eval_(c.props.r)); }, accept(c, k) { st(c).on = (k.v(c._en.p) - k.v(c._en.m)) / eval_(c.props.r) > 0.005; },
  draw(ctx, c, S) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 30, 10, 30, 10, 22]); D.line(ctx, [40, 30, 30, 30, 30, 22]); ctx.beginPath(); ctx.arc(20, 22, 12, Math.PI, 0); ctx.closePath(); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke(); if (S && st(c).on && (Date.now() / 120 | 0) % 2) D.text(ctx, '♪', 36, 6, 12, '#7c3aed', 'center', true); },
  probe: c => ({ 'État': st(c).on ? 'sonne' : 'silencieux' }), bom: () => 'Buzzer 5 V', fp: 'radial200' });
def('evm', { name: 'Voltmètre', cat: 'Électronique', w: 60, h: 60, ports: [EN('p', 0, 30, '+'), EN('m', 60, 30, 'COM')],
  defProps: { tag: 'VM1' }, fields: [TAGF], mna(c, k) { k.G(c._en.p, c._en.m, 1e-7); }, accept(c, k) { st(c).v = k.v(c._en.p) - k.v(c._en.m); },
  draw(ctx, c, S) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.circle(ctx, 30, 30, 22, '#fff'); D.text(ctx, 'V', 30, 18, 11, INK, 'center', true); D.text(ctx, S ? eng(st(c).v || 0, 'V') : '— V', 30, 36, 9, '#0f766e', 'center', true); D.line(ctx, [0, 30, 8, 30]); D.line(ctx, [52, 30, 60, 30]); },
  probe: c => ({ 'Tension': eng(st(c).v || 0, 'V') }), plot: c => st(c).v || 0, plotUnit: 'V' });
def('eam', { name: 'Ampèremètre', cat: 'Électronique', w: 60, h: 60, ports: [EN('p', 0, 30, '+'), EN('m', 60, 30, 'COM')], branches: () => 1,
  defProps: { tag: 'AM1' }, fields: [TAGF], mna(c, k) { st(c)._br = k.Vsrc(c._en.p, c._en.m, 0, 0.001); }, accept(c, k) { st(c).i = k.x(st(c)._br); },
  draw(ctx, c, S) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.circle(ctx, 30, 30, 22, '#fff'); D.text(ctx, 'A', 30, 18, 11, INK, 'center', true); D.text(ctx, S ? eng(st(c).i || 0, 'A') : '— A', 30, 36, 9, '#0f766e', 'center', true); D.line(ctx, [0, 30, 8, 30]); D.line(ctx, [52, 30, 60, 30]); },
  probe: c => ({ 'Courant': eng(st(c).i || 0, 'A') }), plot: c => (st(c).i || 0) * 1000, plotUnit: 'mA' });
def('eprobe', { name: 'Sonde d\'oscilloscope (traceur)', cat: 'Électronique', w: 40, h: 20, ports: [EN('p', 0, 10, 'sonde')], defProps: { tag: 'CH1' }, fields: [TAGF], mna() { },
  accept(c, k) { st(c).v = k.v(c._en.p); }, draw(ctx, c, S) { ctx.strokeStyle = INK; ctx.lineWidth = 1.6; D.line(ctx, [0, 10, 12, 10]); ctx.beginPath(); ctx.moveTo(12, 4); ctx.lineTo(40, 4); ctx.lineTo(40, 16); ctx.lineTo(12, 16); ctx.closePath(); ctx.fillStyle = '#ccfbf1'; ctx.fill(); ctx.stroke(); D.text(ctx, S ? eng(st(c).v || 0, 'V') : c.props.tag, 26, 10, 7, '#0f766e', 'center', true); },
  probe: c => ({ 'Tension (par rapport à la masse)': eng(st(c).v || 0, 'V') }), plot: c => st(c).v || 0, plotUnit: 'V' });

PALETTE.push(['Électronique', [['egnd'], ['ebat'], ['ebat', 'Alimentation 5 V', { v: '5', tag: 'VCC' }], ['eac'], ['epulse'], ['eres'], ['epot'], ['ecap'], ['ecap', 'Condensateur céramique 100 nF', { c: '100n', polar: false, vmax: '50' }], ['eind'],
  ['ediode'], ['ezener'], ['eled'], ['eled', 'LED verte', { color: 'vert', tag: 'D3' }], ['enpn'], ['epnp'], ['emos'], ['eaop'], ['e555'], ['esw'], ['ebtn'], ['elamp'], ['ebuzz'], ['evm'], ['eam'], ['eprobe']]]);

/* ============================ solveur MNA ============================ */
const Elec = {
  run(S, dt) {
    const comps = App.comps.filter(c => DEFS[c.type].mna);
    if (!comps.length) { S.ev = null; return; }
    const gnd = new Set(comps.filter(c => c.type === 'egnd').map(c => S.root(c, 'g')));
    const idx = new Map(); let n = 0;
    const node = (c, p) => { const r = S.root(c, p); if (gnd.has(r)) return -1; if (!idx.has(r)) idx.set(r, n++); return idx.get(r); };
    comps.forEach(c => { c._en = {}; compPorts(c).forEach(p => { c._en[p.id] = node(c, p.id); }); });
    if (!n) { S.ev = new Map(); return; }
    let nb = 0; comps.forEach(c => { const d = DEFS[c.type]; nb += d.branches ? d.branches(c) : 0; });
    const N = n + nb; let fmax = 0; comps.forEach(c => { const d = DEFS[c.type]; if (d.dyn) fmax = Math.max(fmax, d.dyn(c) || 0); });
    // pas d'intégration : ~200 pas par période du signal le plus rapide, 400 sous-pas maxi par image
    const subs = fmax > 0 ? clamp(Math.ceil(dt * fmax * 200), 4, 400) : 1, h = dt / subs;
    let x = S.ex && S.ex.length === N ? S.ex : new Float64Array(N); const warns = [];
    const A = new Float64Array(N * N), b = new Float64Array(N);
    for (let sub = 0; sub < subs; sub++) {
      const t = S.t - dt + (sub + 1) * h; let ok = false;
      for (let it = 0; it < 60; it++) {
        A.fill(0); b.fill(0); let br = n;
        const v = i => i < 0 ? 0 : x[i];
        const k = { h, t, v, x: i => x[i],
          G(a, c, g) { if (a >= 0) A[a * N + a] += g; if (c >= 0) A[c * N + c] += g; if (a >= 0 && c >= 0) { A[a * N + c] -= g; A[c * N + a] -= g; } },
          I(a, c, i) { if (a >= 0) b[a] -= i; if (c >= 0) b[c] += i; },
          nl(nd, I0, ds) { if (nd < 0) return; let lin = I0; for (const [j, g] of ds) { if (j >= 0) { A[nd * N + j] += g; lin -= g * x[j]; } } b[nd] -= lin; },
          Vsrc(a, c, val, rs = 0) { const j = br++; if (a >= 0) { A[a * N + j] += 1; A[j * N + a] += 1; } if (c >= 0) { A[c * N + j] -= 1; A[j * N + c] -= 1; } A[j * N + j] -= rs; b[j] = val; return j; },
          VCVS(o, p, m, gain, rs = 0) { const j = br++; if (o >= 0) { A[o * N + j] += 1; A[j * N + o] += 1; } if (p >= 0) A[j * N + p] -= gain; if (m >= 0) A[j * N + m] += gain; A[j * N + j] -= rs; return j; },
          warn: s => warns.push(s) };
        for (const c of comps) DEFS[c.type].mna(c, k, st(c));
        for (let i = 0; i < n; i++) A[i * N + i] += 1e-9; // gmin : nœuds flottants
        const nx = gauss(A, b, N); if (!nx) break;
        let dmax = 0; for (let i = 0; i < N; i++) { let d = nx[i] - x[i]; if (i < n) d = clamp(d, -2, 2); dmax = Math.max(dmax, Math.abs(d) / (1 + Math.abs(nx[i]) * 1e-3)); x[i] += d; }
        if (dmax < 1e-6) { ok = true; break; }
      }
      const k = { h, t, v: i => i < 0 ? 0 : x[i], x: i => x[i], warn: s => warns.push(s) };
      for (const c of comps) { const d = DEFS[c.type]; if (d.accept) d.accept(c, k); }
      if (!ok) S.econv = true;
    }
    S.ex = x; S.ev = new Map(); idx.forEach((i, r) => S.ev.set(r, x[i])); gnd.forEach(r => S.ev.set(r, 0));
    if (!gnd.size && !S.ewarn) { S.ewarn = 1; S.banner = '⚠ Électronique : aucune masse (0 V) dans le schéma — ajoutez le symbole « Masse »'; }
    if (warns.length) S.stickyBanner = S.banner = warns[warns.length - 1];
  },
  V(S, c, p) { return S.ev ? (S.ev.get(S.root(c, p)) ?? 0) : 0; }
};
// élimination de Gauss avec pivot partiel (matrice dense)
function gauss(A0, b0, N) {
  const A = A0.slice(), b = b0.slice();
  for (let col = 0; col < N; col++) {
    let p = col, m = Math.abs(A[col * N + col]); for (let r = col + 1; r < N; r++) { const a = Math.abs(A[r * N + col]); if (a > m) { m = a; p = r; } }
    if (m < 1e-18) { A[col * N + col] = 1e-12; continue; }
    if (p !== col) { for (let k = col; k < N; k++) { const t = A[col * N + k]; A[col * N + k] = A[p * N + k]; A[p * N + k] = t; } const t = b[col]; b[col] = b[p]; b[p] = t; }
    const d = A[col * N + col];
    for (let r = col + 1; r < N; r++) { const f = A[r * N + col] / d; if (!f) continue; for (let k = col; k < N; k++) A[r * N + k] -= f * A[col * N + k]; b[r] -= f * b[col]; }
  }
  const x = new Float64Array(N);
  for (let r = N - 1; r >= 0; r--) { let s = b[r]; for (let k = r + 1; k < N; k++) s -= A[r * N + k] * x[k]; x[r] = s / A[r * N + r]; if (!isFinite(x[r])) return null; }
  return x;
}
