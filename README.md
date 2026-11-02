# Simulix Pro

Logiciel **libre** de conception et de simulation de systèmes automatisés :
pneumatique, hydraulique, électrique (24 V continu, réseaux 230 / 380 / 400 V mono et triphasés),
automate programmable (Ladder, GRAFCET), électronique numérique et systèmes virtuels.
Application de bureau Windows avec mises à jour automatiques.

## À propos de l'auteur

Je suis diplômé en hydraulique et en pneumatique, et c'est dans ces domaines que se trouvent mes connaissances.
En électricité, j'ai encore des lacunes : les parties électriques du logiciel sont donc celles qui méritent
le plus de relecture et de retours de la part de personnes du métier.

J'utilise Claude (l'assistant d'Anthropic) uniquement comme outil pour mettre en place les systèmes,
c'est-à-dire écrire le code à partir de mes demandes, de mes cours et de mes corrections.
La conception, les choix techniques et la validation restent de mon côté.

## Fonctionnalités principales

- Schémas multi-technologies sur plusieurs folios, avec cadre, cartouche, renvois et références croisées
- Simulation : pressions, débits, efforts et vitesses (hydraulique et pneumatique),
  potentiels et phases (électrique), programmes d'automate, logique numérique
- Appareils hydrauliques : limiteur, réducteur, séquence, équilibrage, filtres, transmission hydrostatique
- Appareillage électrique : disjoncteurs, différentiels, fusibles, contacteurs, relais thermiques,
  moteurs asynchrones triphasés, transformateurs
- Instruments (manomètre, débitmètre, voltmètre, traceur de courbes) et mode dépannage avec défaillances
- Outils d'ingénierie : nomenclature, vérification du schéma, calculs hydrauliques, analyse de panne 5M / 5 Pourquoi
- Pilotes matériels : carte Arduino (USB) et automates réels en Modbus TCP

## Installation

Télécharger `Simulix-Pro-Setup-x.y.z.exe` dans la page [Releases](https://github.com/Pepinou66/simulix-pro/releases).
Le logiciel se met ensuite à jour tout seul : menu Aide → « Rechercher des mises à jour… »
(me demander, automatique à l'ouverture, à la fermeture ou au démarrage de Windows).

## Structure du dépôt

- `src/` : application (HTML/JS) — `python build.py` assemble `dist/index.html` et `desktop/app/index.html`
- `desktop/` : application de bureau Electron (pilotes Arduino série, Modbus TCP, mises à jour)
- `.github/workflows/release.yml` : construit l'installateur et publie la release

## Publier une nouvelle version

1. Modifier `version` dans `desktop/package.json` (ex. `1.3.1`)
2. `git commit -am "Version 1.3.1" && git push`
3. GitHub Actions construit `Simulix-Pro-Setup-1.3.1.exe` et publie la release :
   les logiciels installés la détectent automatiquement.
