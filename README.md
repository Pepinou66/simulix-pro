# Simulix Pro

Conception et simulation de systèmes automatisés : pneumatique, hydraulique, électrique 24 V,
automate programmable (Ladder, GRAFCET), électronique numérique, systèmes virtuels.
Application de bureau Windows (Electron) avec mises à jour automatiques.

## Structure
- `src/` : application (HTML/JS) — `python build.py` assemble `dist/index.html` et `desktop/app/index.html`
- `desktop/` : application de bureau Electron (pilotes Arduino série, Modbus TCP, mises à jour)
- `.github/workflows/release.yml` : construit l'installateur et publie la release à chaque tag `v*`

## Publier une nouvelle version
1. Modifier `version` dans `desktop/package.json` (ex. `1.2.1`)
2. `git commit -am "Version 1.2.1" && git push`
3. GitHub Actions construit `Simulix-Pro-Setup-1.2.1.exe` et publie la release :
   les logiciels installés la détectent automatiquement.
