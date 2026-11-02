'use strict';
/* =====================================================================
   Multilingue : le français est la langue source. Une langue = un fichier
   JSON { "simulix-lang": 1, "code": "en", "name": "English", "strings": { "texte français": "traduction" } }
   Les nombres du texte source sont remplacés par « # » dans les clés
   (ex. "Débit # L/min" → "Flow # L/min"), ils sont réinjectés dans l'ordre.
   Les textes sans traduction restent en français et sont collectés pour
   l'export du modèle de traduction.
   ===================================================================== */
const I18N = {
  lang: 'fr', packs: {}, dict: null, missing: new Set(), orig: new WeakMap(), obs: null,
  NUM: /-?\d+(?:[.,]\d+)?/g,
  norm(s) { return s.replace(this.NUM, '#').replace(/\s+/g, ' ').trim(); },
  register(file, custom) {
    if (!file || typeof file.strings !== 'object' || !file.code) throw new Error('Fichier de langue invalide (attendu : code, name, strings)');
    const m = new Map(); for (const k in file.strings) { const v = file.strings[k]; if (typeof v === 'string' && v.trim()) m.set(this.norm(k), v); }
    this.packs[file.code] = { code: file.code, name: file.name || file.code, map: m, custom: !!custom, file };
  },
  tr(s) {
    if (!this.dict || typeof s !== 'string') return s; const t = s.trim();
    if (!t || !/[A-Za-zÀ-ÿ]/.test(t) || t.length > 600) return s;
    const k = this.norm(t); let v = this.dict.get(k);
    if (v == null) { if (t.length < 300) this.missing.add(k); return s; }
    const nums = t.match(this.NUM) || []; let i = 0; v = v.replace(/#/g, () => nums[i++] ?? '#');
    return s.replace(t, v);
  },
  skip(el) { return !el || /^(SCRIPT|STYLE|TEXTAREA|CANVAS)$/.test(el.nodeName) || !!el.closest('[data-noi18n],[contenteditable]'); },
  text(n) {
    if (this.skip(n.parentElement)) return; const r = this.orig.get(n); let src = n.nodeValue; if (r && src === r.t) src = r.o;
    const t = this.lang === 'fr' ? src : this.tr(src); this.orig.set(n, { o: src, t }); if (t !== n.nodeValue) n.nodeValue = t;
  },
  attr(e, a) {
    if (!e.hasAttribute || !e.hasAttribute(a) || this.skip(e)) return; const key = '_i18n_' + a, r = e[key]; let src = e.getAttribute(a); if (r && src === r.t) src = r.o;
    const t = this.lang === 'fr' ? src : this.tr(src); e[key] = { o: src, t }; if (t !== e.getAttribute(a)) e.setAttribute(a, t);
  },
  walk(root) {
    if (!root) return; if (root.nodeType === 3) return this.text(root); if (root.nodeType !== 1 || this.skip(root)) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) this.text(n);
    [root, ...root.querySelectorAll('[title],[placeholder]')].forEach(e => { this.attr(e, 'title'); this.attr(e, 'placeholder'); });
  },
  start() {
    let saved = 'fr'; try { const c = JSON.parse(localStorage.getItem('simulix.langs') || '[]'); c.forEach(f => { try { this.register(f, true); } catch (e) { } }); saved = localStorage.getItem('simulix.lang') || 'fr'; } catch (e) { }
    this.obs = new MutationObserver(ms => { if (this.lang === 'fr') return; for (const m of ms) { if (m.type === 'characterData') this.text(m.target); else if (m.type === 'attributes') this.attr(m.target, m.attributeName); else m.addedNodes.forEach(n => this.walk(n)); } });
    this.obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'placeholder'] });
    this.ui(); if (this.packs[saved] || saved === 'fr') this.set(saved, true);
    if (window.simulix && window.simulix.onLangs) window.simulix.onLangs(files => { (files || []).forEach(f => { try { this.register(f, true); } catch (e) { console.warn(e); } }); this.ui(); if (this.packs[saved] && this.lang !== saved) this.set(saved, true); });
  },
  set(code, quiet) {
    if (code !== 'fr' && !this.packs[code]) return; this.lang = code; this.dict = code === 'fr' ? null : this.packs[code].map;
    document.documentElement.lang = code; this.ui(); try { localStorage.setItem('simulix.lang', code); } catch (e) { }
    this.walk(document.body); const s = document.getElementById('selLang'); if (s) s.value = code;
    if (window.simulix && window.simulix.setMenuLang) window.simulix.setMenuLang(code === 'fr' ? null : this.packs[code].file.strings);
    if (typeof View !== 'undefined' && View.draw) View.draw();
    if (!quiet) toast(this.tr('Langue : ') + (code === 'fr' ? 'Français' : this.packs[code].name));
  },
  ui() {
    const s = document.getElementById('selLang'); if (!s) return;
    s.innerHTML = `<option value="fr">🌐 Français</option>` + Object.values(this.packs).map(p => `<option value="${esc(p.code)}">🌐 ${esc(p.name)}${p.custom ? ' *' : ''}</option>`).join('') +
      `<option value="__load">${esc(this.tr('＋ Charger un fichier de langue…'))}</option><option value="__tpl">${esc(this.tr('⇩ Exporter le modèle de traduction…'))}</option>` + (window.simulix && window.simulix.openLangFolder ? `<option value="__dir">${esc(this.tr('📁 Ouvrir le dossier des langues'))}</option>` : '');
    s.value = this.lang;
    s.onchange = () => { const v = s.value; s.value = this.lang; if (v === '__load') $('#langIn').click(); else if (v === '__tpl') this.exportTemplate(); else if (v === '__dir') window.simulix.openLangFolder(); else this.set(v); };
    const fi = document.getElementById('langIn'); if (fi) fi.onchange = e => { const f = e.target.files[0]; if (!f) return; const rd = new FileReader(); rd.onload = () => { try { this.importFile(JSON.parse(rd.result)); } catch (er) { toast('⚠ ' + er.message); } }; rd.readAsText(f, 'utf-8'); e.target.value = ''; };
  },
  importFile(f) {
    this.register(f, true);
    try { const c = JSON.parse(localStorage.getItem('simulix.langs') || '[]').filter(x => x.code !== f.code); c.push(f); localStorage.setItem('simulix.langs', JSON.stringify(c)); } catch (e) { }
    this.ui(); this.set(f.code);
  },
  sourceKeys() { // tous les textes connus du logiciel (bibliothèque, propriétés, défaillances, interface) + ceux rencontrés à l'écran
    const S = new Set(), add = t => { if (typeof t === 'string' && t.trim().length > 1 && /[A-Za-zÀ-ÿ]/.test(t) && t.length < 300) S.add(this.norm(t)); };
    for (const k in DEFS) {
      const d = DEFS[k]; add(d.name); add(d.cat); const c = { id: '_', type: k, props: JSON.parse(JSON.stringify(d.defProps || {})), state: {} };
      let f = []; try { f = d.fieldsFn ? d.fieldsFn(c) : (d.fields || []); } catch (e) { } f.forEach(x => { add(x.label); (x.labels || []).forEach(add); });
      let fl = []; try { fl = d.faultsFn ? d.faultsFn(c) : (d.faults || []); } catch (e) { } fl.forEach(x => add(x[1])); (d.catalog || []).forEach(x => add(x.ref));
    }
    try { Pal.entries().forEach(e => { add(e.label); add(e.cat); }); } catch (e) { }
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) if (!this.skip(n.parentElement)) add((this.orig.get(n) || { o: n.nodeValue }).o);
    this.missing.forEach(k => S.add(k)); for (const p of Object.values(this.packs)) p.map.forEach((v, k) => S.add(k));
    return [...S].sort((a, b) => a.localeCompare(b, 'fr'));
  },
  exportTemplate() {
    const cur = this.lang === 'fr' ? null : this.packs[this.lang], strings = {};
    this.sourceKeys().forEach(k => { strings[k] = cur ? (cur.map.get(k) || '') : ''; });
    const f = { 'simulix-lang': 1, code: cur ? cur.code : 'xx', name: cur ? cur.name : 'Nom de la langue', note: 'Traduisez les valeurs (à droite). « # » remplace un nombre. Laissez vide pour garder le français. Chargez ensuite ce fichier par le menu des langues (ou placez-le dans le dossier des langues de l\'application).', strings };
    const txt = JSON.stringify(f, null, 2), name = 'simulix-langue-' + f.code + '.json';
    if (window.simulix && window.simulix.saveFile) window.simulix.saveFile(name, txt, 'json');
    else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'application/json' })); a.download = name; a.click(); }
    toast(this.tr('Modèle de traduction exporté') + ' (' + Object.keys(strings).length + ')');
  }
};
