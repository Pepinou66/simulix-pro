'use strict';
/* ===== Utilitaires communs ===== */
const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = (v, d = 1) => (v == null || isNaN(v)) ? '—' : Number(v).toFixed(d);

class UF {
  constructor() { this.p = new Map(); }
  find(k) {
    let p = this.p.get(k);
    if (p === undefined) { this.p.set(k, k); return k; }
    if (p === k) return k;
    const r = this.find(p); this.p.set(k, r); return r;
  }
  union(a, b) { const ra = this.find(a), rb = this.find(b); if (ra !== rb) this.p.set(ra, rb); }
}

function toast(msg, ms = 2200) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('show'), ms);
}

/* ---- primitives de dessin (contexte local du composant) ---- */
const D = {
  line(ctx, pts, w) { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); if (w) ctx.lineWidth = w; ctx.stroke(); },
  rect(ctx, x, y, w, h, fill) { if (fill) { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); } ctx.strokeRect(x, y, w, h); },
  // clapet anti-retour ISO 1219 : bille tangente aux deux bords du siège (le siège s'ouvre côté bille ; passage libre du côté de la pointe vers la bille)
  check(ctx, x, y, r, dir = 'u') {
    const k = { u: [0, 1], d: [0, -1], l: [1, 0], r: [-1, 0] }[dir], a = r * Math.SQRT2, L = a + r * 1.3, ax = x + k[0] * a, ay = y + k[1] * a;
    const px = -k[1], py = k[0], e = L / Math.SQRT2;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax - k[0] * e + px * e, ay - k[1] * e + py * e); ctx.lineTo(ax, ay); ctx.lineTo(ax - k[0] * e - px * e, ay - k[1] * e - py * e); ctx.stroke();
  },
  circle(ctx, x, y, r, fill) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); if (fill) { ctx.fillStyle = fill; ctx.fill(); } ctx.stroke(); },
  text(ctx, s, x, y, size = 10, color = '#222', align = 'center', bold) {
    ctx.save(); ctx.fillStyle = color; ctx.font = (bold ? '600 ' : '') + size + 'px system-ui,sans-serif'; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(typeof I18N !== 'undefined' && I18N.dict && typeof s === 'string' && s.length > 2 ? I18N.tr(s) : s, x, y); ctx.restore();
  },
  arrow(ctx, x1, y1, x2, y2, hs = 6) {
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    const a = Math.atan2(y2 - y1, x2 - x1);
    ctx.beginPath(); ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - hs * Math.cos(a - 0.4), y2 - hs * Math.sin(a - 0.4));
    ctx.lineTo(x2 - hs * Math.cos(a + 0.4), y2 - hs * Math.sin(a + 0.4));
    ctx.closePath(); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
  },
  tri(ctx, x, y, s, dir, fill) { // triangle plein pointant dir: 'u','d','l','r'
    ctx.beginPath();
    if (dir === 'u') { ctx.moveTo(x, y - s); ctx.lineTo(x - s, y + s * .7); ctx.lineTo(x + s, y + s * .7); }
    if (dir === 'd') { ctx.moveTo(x, y + s); ctx.lineTo(x - s, y - s * .7); ctx.lineTo(x + s, y - s * .7); }
    if (dir === 'r') { ctx.moveTo(x + s, y); ctx.lineTo(x - s * .7, y - s); ctx.lineTo(x - s * .7, y + s); }
    if (dir === 'l') { ctx.moveTo(x - s, y); ctx.lineTo(x + s * .7, y - s); ctx.lineTo(x + s * .7, y + s); }
    ctx.closePath(); if (fill) { ctx.fillStyle = fill; ctx.fill(); } ctx.stroke();
  },
  spring(ctx, x1, y, x2, h = 7) {
    const n = 6, dx = (x2 - x1) / n; ctx.beginPath(); ctx.moveTo(x1, y);
    for (let i = 0; i < n; i++) ctx.lineTo(x1 + dx * (i + .5), y + (i % 2 ? h : -h));
    ctx.lineTo(x2, y); ctx.stroke();
  },
  dash(ctx, on) { ctx.setLineDash(on ? [4, 3] : []); }
};

function download(name, text, mime = 'application/json') {
  // Les téléchargements peuvent être bloqués (cadre sandbox) : on propose aussi la copie
  let ok = false;
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove(); ok = true;
  } catch (e) { ok = false; }
  return ok;
}
function copyText(text) {
  try { return navigator.clipboard.writeText(text).then(() => true, () => false); } catch (e) { return Promise.resolve(false); }
}
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }
