'use strict';
/* =====================================================================
   Fichiers, outils d'ingénierie, matériel, initialisation
   ===================================================================== */
const NATIVE = window.simulix || null; // API fournie par l'application de bureau

const Files = {
  async newProject() {
    if (App.comps.length && !(await confirmDlg('Créer un nouveau projet ? Les modifications non enregistrées seront perdues.'))) return;
    App.load({ comps: [], wires: [], project: { name: 'Nouveau projet', author: '', company: '', rev: 'A', date: new Date().toISOString().slice(0, 10) }, sheets: [{ name: 'Folio 1' }] });
  },
  fname() { return (App.project.name || 'projet').replace(/[\\/:*?"<>|]+/g, '_') + '.sxp'; },
  async save() {
    const txt = App.serialize();
    if (NATIVE) { const p = await NATIVE.saveFile(this.fname(), txt, 'sxp'); if (p) toast('Projet enregistré : ' + p); return; }
    const dlg = $('#dlg'); dlg.className = 'dlg sm';
    dlg.innerHTML = `<header><h2>Enregistrer le projet</h2></header><div class="body"><p class="hint">Le projet est aussi sauvegardé automatiquement dans ce navigateur. Pour le conserver ou le partager, téléchargez le fichier .sxp ou copiez son contenu.</p></div><footer><button class="btn" id="svC">Fermer</button><button class="btn" id="svCopy">Copier le contenu</button><button class="btn pri" id="svDl">Télécharger ${esc(this.fname())}</button></footer>`;
    $('#modal').classList.add('open');
    $('#svC').onclick = () => $('#modal').classList.remove('open');
    $('#svDl').onclick = () => { download(this.fname(), txt); };
    $('#svCopy').onclick = async () => { toast(await copyText(txt) ? 'Contenu du projet copié' : 'Copie refusée par le navigateur'); };
  },
  async open() {
    if (NATIVE) { const r = await NATIVE.openFile(); if (r) this.loadText(r.text); return; }
    const dlg = $('#dlg'); dlg.className = 'dlg sm';
    dlg.innerHTML = `<header><h2>Ouvrir un projet</h2></header><div class="body"><div class="btns"><button class="btn pri" id="opF">Choisir un fichier .sxp…</button></div><p class="hint">Ou collez le contenu d'un projet :</p><textarea id="opT" rows="8" style="width:100%;font-family:monospace;font-size:11px"></textarea></div><footer><button class="btn" id="opC">Annuler</button><button class="btn" id="opP">Ouvrir le texte collé</button></footer>`;
    $('#modal').classList.add('open');
    $('#opC').onclick = () => $('#modal').classList.remove('open');
    $('#opF').onclick = () => $('#fileIn').click();
    $('#opP').onclick = () => { $('#modal').classList.remove('open'); this.loadText($('#opT').value); };
  },
  loadText(t) { try { App.load(t); toast('Projet ouvert'); } catch (e) { toast('Impossible d\'ouvrir : ' + e.message, 4000); } },
  sheetImage(i, scale = 1.5) {
    const cvs = document.createElement('canvas'); cvs.width = FRAME.w * scale; cvs.height = FRAME.h * scale; const g = cvs.getContext('2d');
    const keep = App.sheet, sel = App.sel, sw = App.selWire, fr = App.opts.frame; App.sheet = i; App.sel = new Set(); App.selWire = null; App.opts.frame = true;
    g.scale(scale, scale); drawScene(g, Sim.S, false);
    App.sheet = keep; App.sel = sel; App.selWire = sw; App.opts.frame = fr; return cvs.toDataURL('image/png');
  },
  async exportPDF() {
    const pages = App.sheets.map((_, i) => this.sheetImage(i, 1.6));
    if (NATIVE && NATIVE.savePDF) { const p = await NATIVE.savePDF(this.fname().replace(/\.sxp$/, '.pdf'), pages); if (p) toast('PDF enregistré : ' + p); return; }
    const pa = $('#printArea'); pa.innerHTML = pages.map(src => `<img src="${src}">`).join('');
    setTimeout(() => { try { window.print(); } catch (e) { toast('Impression non disponible ici'); } }, 300);
  },
  exportPNG() { const url = this.sheetImage(App.sheet, 2); if (NATIVE) NATIVE.saveDataURL(this.fname().replace(/\.sxp$/, '_F' + (App.sheet + 1) + '.png'), url); else { const a = document.createElement('a'); a.href = url; a.download = this.fname().replace(/\.sxp$/, '_F' + (App.sheet + 1) + '.png'); a.click(); } }
};
$('#fileIn').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { $('#modal').classList.remove('open'); Files.loadText(r.result); }; r.readAsText(f); e.target.value = ''; };

/* ===================== OUTILS D'INGÉNIERIE ===================== */
const UNIQUE = ['pb_no', 'pb_nc', 'sw_no', 'estop', 'coil', 'coil_t', 'lamp', 'motor', 'buzzer', 'supply', 'cyl', 'motorf', 'valve', 'ls_no', 'ls_nc', 'prox', 'plc', 'pump', 'compressor', 'conveyor', 'traffic'];
const Eng = {
  tab: 'bom',
  open(tab) {
    if (tab) this.tab = tab; const dlg = $('#dlg'); dlg.className = 'dlg';
    dlg.innerHTML = `<header><h2>Outils d'ingénierie — ${esc(App.project.name)}</h2><button class="btn" id="enClose">Fermer</button></header>
      <div class="tabs" id="enTabs">${[['bom', 'Nomenclature'], ['erc', 'Vérification du projet'], ['tags', 'Gestionnaire de repères'], ['wl', 'Liste des fils'], ['calc', 'Calculs hydrauliques'], ['ana', 'Analyse de panne (5M / 5 Pourquoi)'], ['exp', 'Export / impression'], ['lib', 'Bibliothèque d\'exercice']].map(([k, l]) => `<button data-t="${k}" class="${k === this.tab ? 'on' : ''}">${l}</button>`).join('')}</div><div class="body" id="enBody"></div>`;
    $('#modal').classList.add('open'); $('#enClose').onclick = () => $('#modal').classList.remove('open');
    $('#enTabs').onclick = e => { if (e.target.dataset.t) this.open(e.target.dataset.t); };
    this[this.tab]($('#enBody'));
  },
  table(head, rows) { return `<table class="grid"><tr>${head.map(h => `<th>${esc(h)}</th>`).join('')}</tr>${rows.map(r => `<tr>${r.map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</table>`; },
  csv(head, rows) { return [head, ...rows].map(r => r.map(x => '"' + String(x).replace(/<[^>]+>/g, '').replace(/"/g, '""') + '"').join(';')).join('\r\n'); },
  exportBtns(name, head, rows) {
    const csv = this.csv(head, rows);
    return [`<div class="btns"><button class="btn pri" id="exCsv">Exporter CSV (Excel)</button><button class="btn" id="exCp">Copier</button></div>`, () => {
      $('#exCsv').onclick = async () => { if (NATIVE) { const p = await NATIVE.saveFile(name + '.csv', '﻿' + csv, 'csv'); if (p) toast('Enregistré : ' + p); } else download(name + '.csv', '﻿' + csv, 'text/csv'); };
      $('#exCp').onclick = async () => toast(await copyText(csv.replace(/;/g, '\t')) ? 'Tableau copié (collable dans Excel)' : 'Copie refusée');
    }];
  },
  bom(B) {
    const groups = new Map();
    App.comps.forEach(c => { const d = DEFS[c.type]; if (!d.bom || c.type === 'text' || c.type === 'node') return; const des = typeof d.bom === 'function' ? d.bom(c) : d.bom; const key = des + '|' + (c.props.ref || ''); const g = groups.get(key) || { des, ref: c.props.ref || '', tags: [], n: 0, tech: d.cat || (c.props.medium === 'hyd' ? 'Hydraulique' : 'Pneumatique') }; g.tags.push(c.props.tag || ''); g.n++; groups.set(key, g); });
    const head = ['Pos.', 'Qté', 'Désignation', 'Référence', 'Repères', 'Technologie'];
    const rows = [...groups.values()].sort((a, b) => a.tech.localeCompare(b.tech) || a.des.localeCompare(b.des)).map((g, i) => [i + 1, g.n, esc(g.des), esc(g.ref), esc(g.tags.filter(Boolean).join(', ')), esc(g.tech)]);
    const [btn, bind] = this.exportBtns('Nomenclature_' + App.project.name, head, rows);
    B.innerHTML = btn + this.table(head, rows) + `<p class="hint">Renseignez la « Référence catalogue » dans les propriétés de chaque composant (ou choisissez un modèle du catalogue) pour compléter la nomenclature.</p>`; bind();
  },
  erc(B) {
    const out = []; const add = (lvl, c, msg) => out.push([lvl, c, msg]);
    const conn = new Set(); App.wires.forEach(w => { conn.add(w.a.c + ':' + w.a.p); conn.add(w.b.c + ':' + w.b.p); });
    const tagsOf = types => new Set(App.comps.filter(c => types.includes(c.type)).map(c => c.props.tag));
    const coils = tagsOf(['coil', 'coil_t']), sols = tagsOf(['sol']), acts = new Set(App.comps.filter(c => DEFS[c.type].isActuator).map(c => c.props.tag));
    const valveSols = new Set(); App.comps.filter(c => c.type === 'valve').forEach(v => { if (v.props.aL === 'sol') valveSols.add(v.props.tL); if (v.props.aR === 'sol') valveSols.add(v.props.tR); });
    const check = ['cyl', 'motorf', 'coil', 'coil_t', 'sol', 'lamp', 'motor', 'buzzer', 'pb_no', 'pb_nc', 'sw_no', 'estop', 'k_no', 'k_nc', 'ls_no', 'ls_nc', 'prox', 'throttle', 'check', 'gauge', 'supply', 'pump', 'compressor', 'and', 'or', 'not', 'nand', 'nor', 'xor', 'led'];
    App.comps.forEach(c => {
      const d = DEFS[c.type];
      if (check.includes(c.type)) compPorts(c).forEach(p => { if (!conn.has(c.id + ':' + p.id)) add('warn', c, 'Orifice / borne « ' + p.id + ' » non raccordé(e)'); });
      if (c.type === 'valve') compPorts(c).forEach(p => { if (!conn.has(c.id + ':' + p.id) && !['3', '5', 'T'].includes(p.id) && !(p.id === 'B' && /^v3/.test(c.props.vt))) add('warn', c, 'Orifice ' + p.id + ' non raccordé'); });
      if ((c.type === 'k_no' || c.type === 'k_nc') && !coils.has(c.props.tag)) add('err', c, 'Aucune bobine « ' + c.props.tag + ' » ne commande ce contact');
      if (c.type === 'sol' && !valveSols.has(c.props.tag)) add('warn', c, 'Aucun distributeur n\'utilise le solénoïde ' + c.props.tag);
      if (c.type === 'valve') ['L', 'R'].forEach(s => { const a = c.props['a' + s]; if (a === 'sol' && !sols.has(c.props['t' + s])) add('err', c, 'Le solénoïde ' + c.props['t' + s] + ' n\'existe pas dans le schéma électrique'); if (a === 'roller' && !acts.has(c.props['cyl' + s])) add('err', c, 'Galet : actionneur « ' + c.props['cyl' + s] + ' » introuvable'); });
      if (['ls_no', 'ls_nc', 'prox'].includes(c.type) && !acts.has(c.props.cyl)) add('err', c, 'Actionneur associé « ' + c.props.cyl + ' » introuvable');
      if (c.type === 'plc') { const G = c.props.prog.graf; if (G.steps.length && !G.steps.some(x => x.init)) add('err', c, 'GRAFCET sans étape initiale'); G.trans.forEach(t => { const e = PLC.cond(t.cond).err; if (e) add('err', c, 'Réceptivité invalide (' + t.from + '→' + t.to + ') : ' + e); }); }
      if (c.type === 'cyl' && c.props.medium === 'hyd') { const g = cylGeom(c); if (+c.props.rod >= +c.props.bore) add('err', c, 'Diamètre de tige supérieur ou égal à l\'alésage'); }
    });
    const seen = {}; App.comps.forEach(c => { if (!UNIQUE.includes(c.type) || !c.props.tag) return; const k = (DEFS[c.type].isActuator ? 'act' : c.type) + ':' + c.props.tag; if (seen[k]) add('err', c, 'Repère « ' + c.props.tag + ' » utilisé plusieurs fois'); seen[k] = 1; });
    const has = t => App.comps.some(c => t.includes(c.type));
    if (has(['coil', 'lamp', 'sol', 'motor', 'plc', 'conveyor']) && !has(['supply'])) add('err', null, 'Aucune alimentation électrique dans le projet');
    if (App.comps.some(c => c.props.medium === 'pneu' && DEFS[c.type].isActuator) && !has(['compressor'])) add('err', null, 'Aucune source d\'air comprimé');
    if (App.comps.some(c => c.props.medium === 'hyd' && DEFS[c.type].isActuator) && !has(['pump'])) add('err', null, 'Aucun groupe hydraulique');
    // calculs de dimensionnement
    const calc = App.comps.filter(c => c.type === 'cyl').map(c => {
      const g = cylGeom(c), hyd = c.props.medium === 'hyd'; const src = App.comps.find(x => x.type === (hyd ? 'pump' : 'compressor'));
      const p = src ? (hyd ? +src.props.pmax : +src.props.p) : 0, q = hyd && src ? +src.props.q : 0;
      const Fp = p * g.Ab / 10, Ft = p * g.Aa / 10, ve = hyd && q ? q * 1e6 / 60 / g.Ab : null, vr = hyd && q ? q * 1e6 / 60 / g.Aa : null;
      if (+c.props.load > Fp) add('err', c, 'Charge ' + c.props.load + ' N > effort disponible ' + fmt(Fp, 0) + ' N à ' + p + ' bar');
      return [esc(c.props.tag), hyd ? 'Hyd.' : 'Pneu.', 'Ø' + c.props.bore + '/' + c.props.rod + ' × ' + c.props.stroke, fmt(g.Ab / 100, 2), fmt(g.Aa / 100, 2), fmt(Fp, 0), fmt(Ft, 0), c.props.load || 0, ve ? fmt(ve, 0) + ' / ' + fmt(vr, 0) : '—', ve ? fmt(g.L / ve, 2) + ' / ' + fmt(g.L / vr, 2) : '—'];
    });
    // règles issues des cours d'hydraulique
    const pumps = App.comps.filter(c => c.type === 'pump');
    pumps.forEach(pu => {
      const q = pumpQ(pu), pm = +pu.props.pmax || 0;
      add('info', pu, 'Puissance hydraulique maxi Q×p/600 = ' + fmt(q * pm / 600, 2) + ' kW (débit ' + fmt(q, 1) + ' L/min, tarage ' + pm + ' bar)');
      App.comps.filter(c => c.type === 'cyl' && c.props.medium === 'hyd').forEach(cy => {
        const g = cylGeom(cy), qr = q * g.Ab / g.Aa;
        if (qr > 80) add('warn', cy, 'Débit de retour à la rentrée = ' + fmt(qr, 0) + ' L/min (rapport de section ' + fmt(g.Ab / g.Aa, 2) + ') : au-delà de 80 L/min, prévoir un distributeur à action pilotée');
        if (+cy.props.ps && pm > +cy.props.ps) add('err', cy, 'Tarage du limiteur (' + pm + ' bar) supérieur à la pression de service du vérin (' + cy.props.ps + ' bar)');
      });
      if (q > 80) add('warn', pu, 'Débit > 80 L/min : distributeurs et limiteur à action pilotée recommandés');
      App.comps.filter(r => r.type === 'relief' && (+r.props.set || 0) < pm && !r.props.vtag).forEach(r => add('info', r, 'Limiteur ' + r.props.tag + ' taré à ' + r.props.set + ' bar, sous le limiteur principal (' + pm + ' bar) : il limitera l\'effort de cette partie du circuit. Une soupape anti-choc se règle normalement AU-DESSUS du limiteur principal.'));
    });
    App.comps.filter(c => c.type === 'cyl' && c.props.medium === 'hyd' && c.props.ldir === 'sortie' && +c.props.load > 0).forEach(cy => {
      const prot = App.comps.some(o => o.type === 'cbv' && App.wires.some(w => [w.a, w.b].some(r => r.c === o.id && r.p === '2') && [w.a, w.b].some(r => r.c === cy.id && r.p === 'A')));
      if (!prot) add('warn', cy, 'Charge pesante sans soupape d\'équilibrage montée en rigide sur le vérin : dérive au repos et chute de la charge en cas de rupture de flexible');
    });
    App.comps.filter(c => c.type === 'valve' && c.props.medium === 'hyd' && (c.props.aL === 'sol' || c.props.aR === 'sol') && ['v43c', 'v43t'].includes(c.props.vt)).forEach(v => {
      if (App.comps.some(o => o.type === 'cbv')) add('info', v, 'Avec une soupape d\'équilibrage, préférer un centre Y (A et B vers T) pour décomprimer le pilotage');
    });
    if (App.comps.some(c => c.props.medium === 'hyd') && !App.comps.some(c => c.type === 'filter')) add('info', null, 'Aucun filtre dans le circuit : près de 80 % des pannes hydrauliques viennent de la pollution de l\'huile');
    const ic = { info: '<span class="badge">Info</span>', err: '<span class="badge err">Erreur</span>', warn: '<span class="badge warn">Avert.</span>' };
    B.innerHTML = (out.length ? this.table(['Niveau', 'Repère', 'Folio', 'Message'], out.map(([l, c, m]) => [ic[l], c ? esc(c.props.tag || DEFS[c.type].name) : '—', c ? (c.sheet + 1) + '.' + zoneOf(c) : '—', esc(m)])) : '<p><span class="badge ok">OK</span> Aucune anomalie détectée.</p>')
      + (calc.length ? '<h4>Dimensionnement des vérins</h4>' + this.table(['Vérin', 'Tech.', 'Ø piston/tige × course (mm)', 'S piston (cm²)', 'S annulaire (cm²)', 'Effort poussée (N)', 'Effort traction (N)', 'Charge (N)', 'Vitesse sortie / rentrée (mm/s)', 'Temps sortie / rentrée (s)'], calc) + '<p class="hint">Efforts théoriques calculés à la pression de la source (tarage du limiteur en hydraulique). Vitesses hydrauliques au débit nominal de la pompe.</p>' : '');
    B.querySelectorAll('tr').forEach((tr, i) => { const o = out[i - 1]; if (o && o[1]) { tr.style.cursor = 'pointer'; tr.onclick = () => { $('#modal').classList.remove('open'); App.sheet = o[1].sheet; App.sel = new Set([o[1].id]); Sheets.render(); Props.render(); }; } });
  },
  tags(B) {
    const S = Sim.S;
    const rows = App.comps.filter(c => c.props.tag && !['node', 'text'].includes(c.type)).sort((a, b) => String(a.props.tag).localeCompare(String(b.props.tag), 'fr', { numeric: true })).map(c => {
      const d = DEFS[c.type]; let val = '—'; if (S && d.plot) val = fmt(d.plot.call(d, c, S), d.plotUnit === 'état' ? 0 : 1) + ' ' + (d.plotUnit === 'état' ? '' : d.plotUnit);
      return [esc(c.props.tag), esc(typeof d.bom === 'function' ? d.bom(c) : d.name), (c.sheet + 1) + '.' + zoneOf(c), esc(xrefs(c)), val];
    });
    const head = ['Repère', 'Composant', 'Folio.zone', 'Références croisées', 'Valeur'];
    const [btn, bind] = this.exportBtns('Reperes_' + App.project.name, head, rows);
    B.innerHTML = btn + this.table(head, rows); bind();
  },
  wl(B) {
    const nums = (() => { const o = App.opts.wireNums; App.opts.wireNums = true; const m = wireNumbers(); App.opts.wireNums = o; return m; })();
    const lab = r => { const c = App.byId(r.c); return c ? (c.props.tag || DEFS[c.type].name) + ':' + r.p : '?'; };
    const rows = App.wires.map(w => [nums.get(w.id) || '—', esc(kname(w.kind)), esc(lab(w.a)), esc(lab(w.b)), (App.byId(w.a.c)?.sheet ?? 0) + 1, w.cut ? 'COUPÉ' : '']).sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'fr', { numeric: true }));
    const head = ['N° équipotentielle', 'Type', 'Origine', 'Destination', 'Folio', 'État'];
    const [btn, bind] = this.exportBtns('Liste_fils_' + App.project.name, head, rows);
    B.innerHTML = btn + this.table(head, rows); bind();
  },
  calc(B) {
    const F = (id, l, v, u) => `<div class="row" style="flex:1;min-width:130px"><label>${l} (${u})</label><input id="${id}" type="number" step="any" value="${v}"></div>`;
    B.innerHTML = `<p class="hint">Formules des fiches F01C, F03A, F05A, F05K et du cours de mécanique des fluides.</p>
      <div class="gwrap">
      <div><h4>Vérin : effort, vitesse</h4><div style="display:flex;gap:8px;flex-wrap:wrap">${F('cD', 'Ø piston', 63, 'mm')}${F('cd', 'Ø tige', 36, 'mm')}${F('cp', 'Pression', 100, 'bar')}${F('cq', 'Débit', 20, 'L/min')}</div><div class="kv" id="rC"></div></div>
      <div><h4>Pompe : débit, puissance</h4><div style="display:flex;gap:8px;flex-wrap:wrap">${F('pc', 'Cylindrée', 16, 'cm³/tr')}${F('pn', 'Vitesse', 1450, 'tr/min')}${F('pe', 'Rendement global', 85, '%')}${F('pp', 'Pression', 150, 'bar')}</div><div class="kv" id="rP"></div></div>
      <div><h4>Conduite : vitesse, Reynolds, pertes de charge</h4><div style="display:flex;gap:8px;flex-wrap:wrap">${F('tq', 'Débit', 40, 'L/min')}${F('td', 'Ø intérieur', 12, 'mm')}${F('tl', 'Longueur', 5, 'm')}${F('tv', 'Viscosité', 46, 'cSt')}</div><div class="kv" id="rT"></div></div>
      <div><h4>Compressibilité, dilatation, colonne d'huile</h4><div style="display:flex;gap:8px;flex-wrap:wrap">${F('kv', 'Volume', 200, 'L')}${F('kp', 'Δ pression', 300, 'bar')}${F('kt', 'Δ température', 40, '°C')}${F('kh', 'Hauteur d\'huile', 10, 'm')}</div><div class="kv" id="rK"></div></div>
      </div>`;
    const g = id => +$('#' + id).value || 0, kv = o => Object.entries(o).map(([k, v]) => `<span>${k}</span><b>${v}</b>`).join('');
    const upd = () => {
      const D_ = g('cD'), d = g('cd'), p = g('cp'), q = g('cq'), Ab = Math.PI * D_ * D_ / 400, Aa = Math.PI * (D_ * D_ - d * d) / 400;
      $('#rC').innerHTML = kv({ 'Surface fond / annulaire': fmt(Ab, 2) + ' / ' + fmt(Aa, 2) + ' cm²', 'Rapport de section': fmt(Ab / Aa, 2), 'Effort poussée F = p×S': fmt(p * Ab, 0) + ' daN', 'Effort traction': fmt(p * Aa, 0) + ' daN', 'Vitesse sortie v = Q/S': fmt(q * 1000 / 60 / Ab * 10, 0) + ' mm/s', 'Vitesse rentrée': fmt(q * 1000 / 60 / Aa * 10, 0) + ' mm/s', 'Effet différentiel (sortie)': fmt(q * 1000 / 60 / (Ab - Aa) * 10, 0) + ' mm/s — effort ' + fmt(p * (Ab - Aa), 0) + ' daN', 'Débit de retour à la rentrée': fmt(q * Ab / Aa, 1) + ' L/min' });
      const Q = g('pc') * g('pn') / 1000, P = Q * g('pp') / 600;
      $('#rP').innerHTML = kv({ 'Débit Q = Cyl × N / 1000': fmt(Q, 1) + ' L/min', 'Puissance hydraulique Q×p/600': fmt(P, 2) + ' kW', 'Puissance à fournir au moteur': fmt(P / (g('pe') / 100 || 1), 2) + ' kW', 'Couple d\'entraînement': fmt(P * 1000 / (g('pn') * 2 * Math.PI / 60) / (g('pe') / 100 || 1), 1) + ' N·m' });
      const dq = g('td') / 1000, S = Math.PI * dq * dq / 4, v = g('tq') / 60000 / S, nu = g('tv') * 1e-6, Re = v * dq / nu, lam = Re <= 2300 ? 64 / Re : 0.316 / Math.pow(Re, 0.25), dp = lam * g('tl') / dq * 870 * v * v / 2 / 1e5;
      $('#rT').innerHTML = kv({ 'Vitesse d\'écoulement': fmt(v, 2) + ' m/s', 'Nombre de Reynolds Re = v×d/ν': fmt(Re, 0) + (Re <= 2300 ? ' — laminaire' : Re < 3000 ? ' — instable' : ' — turbulent'), 'Coefficient λ': fmt(lam, 4) + (Re <= 2300 ? ' (64/Re)' : ' (Blasius 0,316/Re^0,25)'), 'Perte de charge régulière': fmt(dp, 2) + ' bar', 'Repères usuels': 'aspiration 0,5–1,5 m/s · pression 3–6 m/s · retour 2–4 m/s' });
      $('#rK').innerHTML = kv({ 'Compressibilité ΔV = ΔP×V/10000': fmt(g('kp') * g('kv') / 10000, 2) + ' L', 'Dilatation ΔV = ΔT×V×0,00075': fmt(g('kt') * g('kv') * 0.00075, 2) + ' L', 'Pression d\'une colonne (densité 0,9)': fmt(g('kh') * 0.9 * 9.81 * 1000 / 1e5, 2) + ' bar' });
    };
    B.oninput = upd; upd();
  },
  ana(B) {
    const A = App.project.analysis || (App.project.analysis = { effet: '', M: {}, why: ['', '', '', '', ''], action: '' });
    const M = [['matiere', 'Matière (huile, pollution, eau, air)'], ['materiel', 'Matériel (pompe, distributeur, vérin, flexible…)'], ['milieu', 'Milieu (température, poussière, humidité)'], ['methode', 'Méthode (réglages, procédures)'], ['maindoeuvre', 'Main-d\'œuvre (formation, intervention)'], ['management', 'Management (organisation, maintenance préventive)']];
    B.innerHTML = `<p class="hint">Fiche d'analyse enregistrée avec le projet : méthode des 5M (diagramme d'Ishikawa) puis 5 Pourquoi pour remonter à la cause racine. Pensez à la sécurité avant toute intervention : arrêt, mise hors pression, charges calées.</p>
      <div class="row"><label>Effet constaté (symptôme)</label><input data-a="effet" value="${esc(A.effet)}" placeholder="ex. le vérin sort lentement et manque de force"></div>
      <h4>Causes possibles (5M)</h4><div class="gwrap">${M.map(([k, l]) => `<div class="row" style="min-width:250px"><label>${l}</label><textarea data-m="${k}" rows="2">${esc(A.M[k] || '')}</textarea></div>`).join('')}</div>
      <h4>5 Pourquoi</h4>${A.why.map((w, i) => `<div class="row"><label>Pourquoi n°${i + 1} ?</label><input data-w="${i}" value="${esc(w)}"></div>`).join('')}
      <div class="row"><label>Cause racine et action corrective / préventive</label><textarea data-a="action" rows="3">${esc(A.action)}</textarea></div>`;
    B.oninput = e => { const t = e.target; if (t.dataset.a) A[t.dataset.a] = t.value; if (t.dataset.m) A.M[t.dataset.m] = t.value; if (t.dataset.w) A.why[+t.dataset.w] = t.value; };
    B.onchange = () => App.commit();
  },
  exp(B) {
    B.innerHTML = `<div class="btns"><button class="btn pri" id="xPdf">${NATIVE ? 'Exporter tous les folios en PDF' : 'Imprimer / PDF (tous les folios)'}</button><button class="btn" id="xPng">Image PNG du folio actif</button><button class="btn" id="xSave">Enregistrer le projet (.sxp)</button></div><p class="hint">L'export reprend le cadre, le cartouche, les repères et les références croisées de chaque folio.</p>`;
    $('#xPdf').onclick = () => { $('#modal').classList.remove('open'); Files.exportPDF(); };
    $('#xPng').onclick = () => Files.exportPNG(); $('#xSave').onclick = () => Files.save();
  },
  lib(B) {
    const all = Pal.entries(); const cur = new Set(App.lib || []);
    B.innerHTML = `<p class="hint">Restreignez la bibliothèque aux seuls composants nécessaires à un exercice. La sélection est enregistrée dans le projet.</p>
      <div class="btns"><button class="btn" id="lbUsed">Composants du schéma uniquement</button><button class="btn" id="lbAll">Tout cocher</button><button class="btn" id="lbNone">Bibliothèque complète (désactiver)</button></div>
      <div style="columns:3 220px">${all.map(e => `<label style="display:block;font-size:12px;break-inside:avoid"><input type="checkbox" data-k="${esc(e.key)}" ${!App.lib || cur.has(e.key) ? 'checked' : ''}> ${esc(e.label)}</label>`).join('')}</div>
      <div class="btns"><button class="btn pri" id="lbApply">Appliquer</button></div>`;
    $('#lbUsed').onclick = () => { const used = new Set(App.comps.map(c => c.type)); B.querySelectorAll('[data-k]').forEach(i => i.checked = used.has(i.dataset.k.split('|')[0])); };
    $('#lbAll').onclick = () => B.querySelectorAll('[data-k]').forEach(i => i.checked = true);
    $('#lbNone').onclick = () => { App.lib = null; App.changed(); Pal.render(); toast('Bibliothèque complète'); };
    $('#lbApply').onclick = () => { const ks = [...B.querySelectorAll('[data-k]')].filter(i => i.checked).map(i => i.dataset.k); App.lib = ks.length === all.length ? null : ks; App.changed(); Pal.render(); toast('Bibliothèque mise à jour'); };
  }
};

/* ===================== MATÉRIEL : Arduino (série) et Modbus TCP ===================== */
const ARDUINO_SKETCH = `// Simulix Pro — passerelle E/S Arduino (Uno / Nano / Mega)
// Entrées  I0..I7  -> broches D2..D9   (INPUT_PULLUP : contact vers GND = 1)
// Sorties  Q0..Q7  -> broches D10..D13, A0..A3
// Protocole série 115200 bauds : PC -> "Qhh\\n"   Arduino -> "Ihh\\n"
const byte IN_PINS[8]  = {2,3,4,5,6,7,8,9};
const byte OUT_PINS[8] = {10,11,12,13,A0,A1,A2,A3};
byte lastIn = 0xFF; unsigned long lastSend = 0; String buf;

void setup() {
  Serial.begin(115200);
  for (byte i = 0; i < 8; i++) { pinMode(IN_PINS[i], INPUT_PULLUP); pinMode(OUT_PINS[i], OUTPUT); digitalWrite(OUT_PINS[i], LOW); }
}
void loop() {
  byte in = 0;
  for (byte i = 0; i < 8; i++) if (digitalRead(IN_PINS[i]) == LOW) in |= (1 << i);
  if (in != lastIn || millis() - lastSend > 200) {
    Serial.print('I'); if (in < 16) Serial.print('0'); Serial.println(in, HEX);
    lastIn = in; lastSend = millis();
  }
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\\n') {
      if (buf.length() >= 3 && buf[0] == 'Q') {
        byte q = (byte) strtol(buf.substring(1, 3).c_str(), NULL, 16);
        for (byte i = 0; i < 8; i++) digitalWrite(OUT_PINS[i], (q >> i) & 1 ? HIGH : LOW);
      }
      buf = "";
    } else if (c != '\\r') buf += c;
  }
}
`;
const HW = {
  plcId: null, ser: null, writer: null, inBits: 0, lastQ: -1, lastSent: 0, status: 'Déconnecté',
  mb: null, mbCfg: { host: '192.168.0.10', port: 502, unit: 1, mode: 'remote', diStart: 0, coilStart: 0, inCoilStart: 100 }, mbBusy: false, mbIn: 0, mbQ: 0, mbStatus: 'Déconnecté',
  plc() { return this.plcId ? App.byId(this.plcId) : null; },
  render(B, c) {
    const serialOk = 'serial' in navigator, cfg = this.mbCfg;
    B.innerHTML = `<div class="gwrap"><div>
      <h4 style="margin:4px 0">Carte Arduino (USB / port série)</h4>
      <div class="kv"><span>État</span><b id="hwSt">${esc(this.status)}${this.plcId && this.plcId !== c.id ? ' (lié à un autre automate)' : ''}</b><span>Entrées reçues</span><b id="hwIn">${this.bits(this.inBits)}</b></div>
      <div class="btns">${this.ser ? '<button class="btn dng" id="hwDis">Déconnecter</button>' : `<button class="btn pri" id="hwCon" ${serialOk ? '' : 'disabled'}>Connecter une carte Arduino</button>`}<button class="btn" id="hwSk">Copier le croquis Arduino</button>${NATIVE ? '<button class="btn" id="hwSave">Enregistrer le croquis (.ino)</button>' : ''}</div>
      ${serialOk ? '' : '<p class="hint" style="color:#b45309">Le port série est disponible dans l\'application de bureau Simulix Pro (ou dans Chrome / Edge).</p>'}
      <p class="hint">Les entrées D2–D9 de la carte s'ajoutent (OU logique) aux entrées I0–I7 câblées dans le schéma ; les sorties Q0–Q7 de l'automate simulé sont recopiées sur D10–D13 et A0–A3. Vous pouvez ainsi piloter une maquette réelle avec le programme simulé, ou tester le programme avec de vrais boutons et capteurs.</p>
      <details><summary class="hint" style="cursor:pointer">Voir le croquis</summary><pre style="font-size:10.5px;background:#0f172a;color:#e2e8f0;padding:8px;border-radius:6px;overflow:auto;max-height:260px">${esc(ARDUINO_SKETCH)}</pre></details>
      </div><div>
      <h4 style="margin:4px 0">Automate réel (Modbus TCP)</h4>
      ${NATIVE ? `<div class="row"><label>Mode</label><select id="mbMode"><option value="remote" ${cfg.mode === 'remote' ? 'selected' : ''}>E/S déportées : l'automate simulé lit/écrit les E/S de l'équipement réel</option><option value="proxy" ${cfg.mode === 'proxy' ? 'selected' : ''}>Mise en service virtuelle : le programme de l'automate réel pilote la machine simulée</option></select></div>
      <div class="row"><label>Adresse IP</label><input id="mbHost" value="${esc(cfg.host)}"></div>
      <div class="row"><label>Port / N° esclave</label><div style="display:flex;gap:6px"><input id="mbPort" type="number" value="${cfg.port}"><input id="mbUnit" type="number" value="${cfg.unit}"></div></div>
      <div class="row"><label>Adresse 1re entrée TOR lue (fonction 02) / 1re bobine écrite ou lue (01/15)</label><div style="display:flex;gap:6px"><input id="mbDi" type="number" value="${cfg.diStart}"><input id="mbCo" type="number" value="${cfg.coilStart}"></div></div>
      <div class="row"><label>Mise en service virtuelle : 1re bobine recevant les entrées simulées I0–I7</label><input id="mbIc" type="number" value="${cfg.inCoilStart}"></div>
      <div class="kv"><span>État</span><b id="mbSt">${esc(this.mbStatus)}</b></div>
      <div class="btns">${this.mb ? '<button class="btn dng" id="mbDis">Déconnecter</button>' : '<button class="btn pri" id="mbCon">Connecter</button>'}</div>
      <p class="hint">Compatible avec les automates et coupleurs Modbus TCP (Schneider M221/M241, Siemens S7-1200 avec bloc MB_SERVER, WAGO, Arduino Opta, etc.). En mise en service virtuelle, les sorties de l'automate réel (bobines) remplacent le programme de l'automate du schéma, et les entrées simulées sont écrites dans des bobines/mémentos que votre programme lit.</p>`
        : '<p class="hint">La liaison Modbus TCP avec un automate réel est disponible dans l\'application de bureau Simulix Pro.</p>'}
      </div></div>`;
    const sk = $('#hwSk'); sk.onclick = async () => toast(await copyText(ARDUINO_SKETCH) ? 'Croquis copié' : 'Copie refusée');
    const sv = $('#hwSave'); if (sv) sv.onclick = async () => { const p = await NATIVE.saveFile('Simulix_IO.ino', ARDUINO_SKETCH, 'ino'); if (p) toast('Enregistré : ' + p); };
    const con = $('#hwCon'); if (con) con.onclick = () => this.connect(c);
    const dis = $('#hwDis'); if (dis) dis.onclick = () => this.disconnect();
    if (NATIVE) {
      const bindCfg = () => { cfg.mode = $('#mbMode').value; cfg.host = $('#mbHost').value.trim(); cfg.port = +$('#mbPort').value; cfg.unit = +$('#mbUnit').value; cfg.diStart = +$('#mbDi').value; cfg.coilStart = +$('#mbCo').value; cfg.inCoilStart = +$('#mbIc').value; };
      B.querySelectorAll('#mbMode,#mbHost,#mbPort,#mbUnit,#mbDi,#mbCo,#mbIc').forEach(i => i.onchange = bindCfg);
      const mc = $('#mbCon'); if (mc) mc.onclick = async () => { bindCfg(); this.mbStatus = 'Connexion…'; this.render(B, c); try { await NATIVE.modbus.connect(cfg.host, cfg.port, cfg.unit); this.mb = true; this.plcId = c.id; this.mbStatus = 'Connecté à ' + cfg.host; } catch (e) { this.mb = null; this.mbStatus = 'Échec : ' + (e.message || e); } this.render(B, c); };
      const md = $('#mbDis'); if (md) md.onclick = async () => { try { await NATIVE.modbus.close(); } catch (e) { } this.mb = null; this.mbStatus = 'Déconnecté'; const p = this.plc(); if (p && p.state) delete p.state.proxy; this.render(B, c); };
    }
  },
  bits(b) { return [...Array(8)].map((_, i) => (b >> i) & 1).join(' '); },
  async connect(c) {
    try {
      const port = await navigator.serial.requestPort(); await port.open({ baudRate: 115200 });
      this.ser = port; this.plcId = c.id; this.status = 'Connecté'; this.writer = port.writable.getWriter(); this.lastQ = -1;
      PE.render(); this.readLoop(port);
    } catch (e) { this.status = 'Échec : ' + (e.message || e); PE.render(); }
  },
  async readLoop(port) {
    const dec = new TextDecoder(); let buf = '';
    try {
      const reader = port.readable.getReader(); this.reader = reader;
      for (; ;) { const { value, done } = await reader.read(); if (done) break; buf += dec.decode(value); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1); const m = /^I([0-9A-Fa-f]{2})$/.exec(l); if (m) { this.inBits = parseInt(m[1], 16); const e = $('#hwIn'); if (e) e.textContent = this.bits(this.inBits); } } }
    } catch (e) { this.status = 'Liaison interrompue'; }
  },
  async disconnect() { try { this.reader && await this.reader.cancel(); this.writer && this.writer.releaseLock(); await this.ser.close(); } catch (e) { } this.ser = null; this.writer = null; this.inBits = 0; this.status = 'Déconnecté'; PE.render(); },
  exchange(S) {
    const c = this.plc(); if (!c || !c.state || !c.state.img) return; const s = c.state;
    // Arduino
    if (this.ser) {
      for (let i = 0; i < 8; i++) s.hwI[i] = !!((this.inBits >> i) & 1) || !!((this.mbIn >> i) & 1);
      const q = s.img.Q.reduce((a, v, i) => a | (v ? 1 << i : 0), 0);
      if (this.writer && (q !== this.lastQ || S.t - this.lastSent > 0.5)) { this.lastQ = q; this.lastSent = S.t; this.writer.write(new TextEncoder().encode('Q' + q.toString(16).padStart(2, '0').toUpperCase() + '\n')).catch(() => { }); }
    }
    // Modbus
    if (this.mb && NATIVE && !this.mbBusy) {
      this.mbBusy = true; const cfg = this.mbCfg;
      const qBits = s.img.Q.slice(), iBits = s.img.I.slice();
      (async () => {
        try {
          if (cfg.mode === 'remote') {
            const di = await NATIVE.modbus.readDI(cfg.diStart, 8); this.mbIn = di.reduce((a, v, i) => a | (v ? 1 << i : 0), 0);
            if (!this.ser) for (let i = 0; i < 8; i++) s.hwI[i] = !!di[i];
            await NATIVE.modbus.writeCoils(cfg.coilStart, qBits);
          } else {
            await NATIVE.modbus.writeCoils(cfg.inCoilStart, iBits);
            const co = await NATIVE.modbus.readCoils(cfg.coilStart, 8); s.proxy = co.map(Boolean);
          }
          this.mbStatus = 'Échange OK (' + new Date().toLocaleTimeString() + ')';
        } catch (e) { this.mbStatus = 'Erreur : ' + (e.message || e); }
        const el = $('#mbSt'); if (el) el.textContent = this.mbStatus;
        setTimeout(() => this.mbBusy = false, 60);
      })();
    }
  }
};
Hardware.exchange = S => HW.exchange(S);

/* ===================== MISES À JOUR ===================== */
const UPD_MODES = [['ask', 'Vérifier à l\'ouverture et me demander', 'Une notification propose d\'installer la nouvelle version ; vous choisissez.'], ['open', 'Mettre à jour automatiquement à l\'ouverture', 'La mise à jour est téléchargée puis installée, et le logiciel redémarre tout seul.'], ['close', 'Mettre à jour automatiquement à la fermeture', 'Téléchargement en arrière-plan pendant le travail, installation quand vous quittez Simulix.'], ['manual', 'Uniquement quand je le demande', 'Aucune vérification automatique : menu Aide → Rechercher des mises à jour.']];
const Updates = {
  st: null, shown: null,
  init() { if (!NATIVE || !NATIVE.updates) return; NATIVE.updates.onState(st => { this.st = st; this.card(); if ($('#updBody')) this.renderBody(); }); NATIVE.updates.get().then(st => this.st = st); },
  card() {
    const st = this.st; if (!st) return; let el = $('#updCard'); const mode = st.settings && st.settings.mode;
    const show = (st.status === 'available' && mode === 'ask') || st.status === 'downloading' || (st.status === 'downloaded' && !st.later) || (st.status === 'downloaded' && mode === 'close' && this.shown !== 'dl');
    if (!show) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'updCard'; el.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:60;background:#fff;border:1px solid #d6dbe3;border-radius:10px;box-shadow:0 10px 30px rgba(0,0,0,.2);padding:12px 14px;width:320px;font-size:13px'; document.body.appendChild(el); }
    let h = '';
    if (st.status === 'available') h = `<b>🔔 Simulix Pro ${esc(st.latest)} est disponible</b><div class="hint">Version installée : ${esc(st.version)}</div><div class="btns"><button class="btn pri" data-u="download">Mettre à jour</button><button class="btn" data-u="dialog">Détails</button><button class="btn" data-u="hide">Plus tard</button></div>`;
    else if (st.status === 'downloading') h = `<b>⬇ Téléchargement de la mise à jour…</b><div style="height:6px;background:#e5e7eb;border-radius:3px;margin-top:8px"><div style="height:6px;width:${st.percent || 0}%;background:#0f62fe;border-radius:3px"></div></div><div class="hint">${st.percent || 0} %</div>`;
    else if (st.status === 'downloaded' && mode === 'open') h = `<b>✔ Mise à jour ${esc(st.latest)} prête</b><div class="hint">Redémarrage de Simulix Pro pour l'installer… pensez à enregistrer.</div>`;
    else if (st.status === 'downloaded' && mode === 'close') { h = `<b>✔ Mise à jour ${esc(st.latest)} téléchargée</b><div class="hint">Elle sera installée à la fermeture de Simulix Pro.</div><div class="btns"><button class="btn" data-u="hide">OK</button></div>`; }
    else if (st.status === 'downloaded') h = `<b>✔ Mise à jour ${esc(st.latest)} prête à installer</b><div class="hint">Enregistrez votre projet avant de redémarrer.</div><div class="btns"><button class="btn pri" data-u="install">Redémarrer et installer</button><button class="btn" data-u="later">À la fermeture</button></div>`;
    el.innerHTML = h;
    el.onclick = e => { const u = e.target.dataset.u; if (!u) return; if (u === 'hide') { el.remove(); this.shown = 'dl'; if (st.status === 'available') this.st.status = 'idle'; } else if (u === 'dialog') this.open(); else NATIVE.updates[u](); };
  },
  open() {
    const dlg = $('#dlg'); dlg.className = 'dlg sm';
    dlg.innerHTML = `<header><h2>Mises à jour</h2><button class="btn" id="updClose">Fermer</button></header><div class="body" id="updBody"></div>`;
    $('#modal').classList.add('open'); $('#updClose').onclick = () => $('#modal').classList.remove('open');
    if (!NATIVE || !NATIVE.updates) { $('#updBody').innerHTML = '<p class="hint">Les mises à jour automatiques sont disponibles dans l\'application de bureau Simulix Pro installée sur Windows.</p>'; return; }
    NATIVE.updates.get().then(st => { this.st = st; this.renderBody(); });
  },
  renderBody() {
    const B = $('#updBody'), st = this.st; if (!B || !st) return; const S = st.settings || {};
    const stat = { idle: 'En attente', checking: '⏳ Recherche en cours…', available: '🔔 Version ' + esc(st.latest) + ' disponible', uptodate: '✔ Vous utilisez la dernière version', downloading: '⬇ Téléchargement ' + (st.percent || 0) + ' %', downloaded: '✔ Version ' + esc(st.latest) + ' prête à installer', error: '⚠ ' + esc(st.error || 'Erreur') }[st.status] || '';
    B.innerHTML = `<div class="kv"><span>Version installée</span><b>${esc(st.version)}</b><span>État</span><b>${stat}</b><span>Dernière vérification</span><b>${S.lastCheck ? new Date(S.lastCheck).toLocaleString('fr-FR') : 'jamais'}</b></div>
      <div class="btns">${st.status === 'available' ? '<button class="btn pri" id="uDl">Télécharger et installer</button>' : st.status === 'downloaded' ? '<button class="btn pri" id="uIn">Redémarrer et installer</button>' : `<button class="btn pri" id="uCk" ${st.status === 'checking' || st.status === 'downloading' ? 'disabled' : ''}>Rechercher des mises à jour</button>`}</div>
      ${st.notes ? `<details><summary class="hint" style="cursor:pointer">Nouveautés de la version ${esc(st.latest)}</summary><pre style="white-space:pre-wrap;font-size:12px">${esc(st.notes)}</pre></details>` : ''}
      <h4 style="margin:14px 0 6px">Mode de mise à jour</h4>
      ${UPD_MODES.map(([k, l, d]) => `<label style="display:flex;gap:8px;align-items:flex-start;margin-bottom:8px;cursor:pointer"><input type="radio" name="umode" value="${k}" ${S.mode === k ? 'checked' : ''} style="margin-top:3px"><span><b>${l}</b><br><span class="hint">${d}</span></span></label>`).join('')}
      <label style="display:flex;gap:8px;align-items:flex-start;margin-top:10px;cursor:pointer"><input type="checkbox" id="uStart" ${S.startup ? 'checked' : ''} style="margin-top:3px"><span><b>Mettre à jour au démarrage de Windows</b><br><span class="hint">À l'ouverture de votre session, Simulix vérifie en arrière-plan (sans fenêtre), installe la mise à jour éventuelle en silence puis se ferme.</span></span></label>`;
    B.querySelectorAll('[name=umode]').forEach(r => r.onchange = () => NATIVE.updates.settings({ mode: r.value }).then(s => { this.st.settings = s; toast('Mode de mise à jour enregistré'); }));
    $('#uStart').onchange = e => NATIVE.updates.settings({ startup: e.target.checked }).then(s => { this.st.settings = s; toast(e.target.checked ? 'Mise à jour au démarrage de Windows activée' : 'Mise à jour au démarrage de Windows désactivée'); });
    const ck = $('#uCk'); if (ck) ck.onclick = () => NATIVE.updates.check();
    const dl = $('#uDl'); if (dl) dl.onclick = () => NATIVE.updates.download();
    const ins = $('#uIn'); if (ins) ins.onclick = () => NATIVE.updates.install();
  }
};

/* ===================== AIDE ===================== */
function help() {
  const dlg = $('#dlg'); dlg.className = 'dlg';
  dlg.innerHTML = `<header><h2>Aide — Simulix Pro</h2><button class="btn" id="hClose">Fermer</button></header><div class="body" style="font-size:13px;line-height:1.55">
  <h4>Concevoir un schéma</h4><ul>
  <li>Cliquez sur un composant de la bibliothèque puis sur le schéma pour le placer (Maj+clic : placements successifs).</li>
  <li>Cliquez sur un orifice ou une borne, puis sur un autre, pour tracer une liaison. Les technologies incompatibles sont refusées. Faites glisser un fil pour déplacer son segment central.</li>
  <li>Liez les technologies par les <b>repères</b> : une bobine K1 commande les contacts K1, un solénoïde Y1 commande le distributeur dont l'électro-aimant est Y1, un fin de course renseigne le vérin associé (A0 = rentré, A1 = sorti).</li>
  <li>Les <b>folios</b> (onglets en bas) structurent le projet. Les renvois de folio de même nom relient les potentiels entre folios. Les références croisées (folio.zone) s'affichent sous les bobines et les vérins.</li>
  <li>Le panneau de droite permet de régler les paramètres techniques, de choisir un modèle du catalogue et de simuler une défaillance.</li></ul>
  <h4>Simuler</h4><ul>
  <li>▶ lance la simulation : pressions (bar), débits (L/min), vitesses et efforts sont calculés à partir des dimensions, des charges et des sources.</li>
  <li>Cliquez sur les boutons poussoirs (maintien), commutateurs, leviers et distributeurs manuels pour les actionner.</li>
  <li>Code couleur : fil électrique rouge = +24 V, bleu = 0 V ; conduite bleue épaisse = air sous pression, rouge = huile sous pression, bleu = retour réservoir.</li>
  <li>📈 Traceur : ajoutez des vérins, manomètres, débitmètres, bobines… pour suivre leurs courbes dans le temps.</li></ul>
  <h4>Automate</h4><ul><li>Double-cliquez sur l'automate : éditeur Ladder, GRAFCET, mnémoniques, table des variables avec forçage, liaison matérielle Arduino / Modbus TCP.</li></ul>
  <h4>Dépannage</h4><ul><li>Le formateur introduit des défaillances (fil coupé, contact collé, bobine coupée, tiroir bloqué, vérin grippé…), puis active 🛠 Dépannage et enregistre le projet. L'apprenant mesure (voltmètre, manomètre, traceur) et signale les composants défectueux.</li></ul>
  <h4>Mises à jour</h4><p>Menu Aide → Rechercher des mises à jour : choix du mode (me demander, automatique à l'ouverture, à la fermeture, au démarrage de Windows). <button class="btn" onclick="Updates.open()">Ouvrir les réglages de mise à jour</button></p>
  <h4>Raccourcis</h4><p>Suppr : supprimer · R : pivoter · Ctrl+Z / Ctrl+Y : annuler / rétablir · Ctrl+C / Ctrl+V / Ctrl+D : copier / coller / dupliquer · Ctrl+A : tout sélectionner · Ctrl+S : enregistrer · F5 : simuler / arrêter · Molette : zoom · Clic droit ou clic molette glissé : déplacer la vue.</p>
  </div>`;
  $('#modal').classList.add('open'); $('#hClose').onclick = () => $('#modal').classList.remove('open');
}

/* ===================== INITIALISATION ===================== */
function initUI() {
  const on = (id, f) => $(id).onclick = f;
  on('#bNew', () => Files.newProject()); on('#bOpen', () => Files.open()); on('#bSave', () => Files.save());
  on('#bUndo', () => App.undo()); on('#bRedo', () => App.redo()); on('#bRot', () => App.rotSel()); on('#bDup', () => App.dup()); on('#bDel', () => App.delSel());
  on('#bPan', () => { App.tool = App.tool === 'pan' ? 'sel' : 'pan'; $('#bPan').classList.toggle('on', App.tool === 'pan'); });
  on('#bRun', () => Ctl.run()); on('#bPause', () => Ctl.pause()); on('#bStep', () => Ctl.step()); on('#bStop', () => Ctl.stop());
  $('#selSpeed').onchange = e => App.speed = +e.target.value;
  on('#bPlot', () => Plot.open()); on('#plotClose', () => Plot.open(false)); on('#plotClr', () => { App.plot.ch = []; });
  on('#bTrouble', () => Trouble.toggle()); on('#bTools', () => Eng.open()); on('#bHelp', help);
  on('#bPal', () => { $('#palette').classList.toggle('show'); $('#props').classList.remove('show'); });
  on('#bProps', () => { $('#props').classList.toggle('show'); $('#palette').classList.remove('show'); });
  on('#zIn', () => { const r = cv.getBoundingClientRect(); View.zoomAt(r.width / 2, r.height / 2, 1.25); });
  on('#zOut', () => { const r = cv.getBoundingClientRect(); View.zoomAt(r.width / 2, r.height / 2, 0.8); });
  on('#zFit', () => View.fit());
  const sel = $('#selEx'); EXAMPLES.forEach((x, i) => { const o = document.createElement('option'); o.value = i; o.textContent = x.name; sel.appendChild(o); });
  sel.onchange = async () => { const i = sel.value; sel.value = ''; if (i === '') return; if (App.comps.length > 0 && App.hi > 0 && !(await confirmDlg('Ouvrir l\'exemple « ' + EXAMPLES[i].name + ' » ? Le projet en cours sera remplacé (pensez à l\'enregistrer).'))) return; App.load(EXAMPLES[i].build()); };
  $('#modal').addEventListener('pointerdown', e => { if (e.target.id === 'modal' && !PE.c) $('#modal').classList.remove('open'); });
  new ResizeObserver(() => View.resize()).observe($('#center'));
  if (NATIVE && NATIVE.onMenu) NATIVE.onMenu(cmd => ({ new: () => Files.newProject(), open: () => Files.open(), save: () => Files.save(), pdf: () => Files.exportPDF(), png: () => Files.exportPNG(), run: () => Ctl.run(), stop: () => Ctl.stop(), help, eng: () => Eng.open(), updates: () => Updates.open() })[cmd]?.());
  Updates.init();
  if (NATIVE && NATIVE.onOpenFile) NATIVE.onOpenFile(t => Files.loadText(t));
  View2.init();
  Pal.render(); Sheets.render(); View.resize();
  let loaded = false; const auto = store('simulix.autosave');
  if (auto) { try { App.load(auto); loaded = App.comps.length > 0; } catch (e) { } }
  if (!loaded) App.load(EXAMPLES[0].build());
  Ctl.syncUI(); requestAnimationFrame(loop);
}
