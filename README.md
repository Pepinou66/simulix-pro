# Simulix Pro

**Simulix Pro** est un logiciel libre de conception et de simulation de systèmes automatisés. Il permet de travailler sur différentes technologies : pneumatique, hydraulique, électricité, automatisme, électronique numérique et systèmes virtuels.

L'objectif est de proposer un outil complet et accessible, aussi bien pour l'apprentissage que pour la conception et le dépannage de systèmes industriels.

Le logiciel est disponible sous forme d'application de bureau pour Windows et bénéficie d'un système de mises à jour automatiques.

## À propos du projet et de son créateur

Je suis diplômé dans les domaines de l'hydraulique et de la pneumatique, qui constituent mes principaux domaines de compétence.

J'ai développé Simulix Pro avec l'envie de réunir dans un seul logiciel les outils dont on peut avoir besoin pour concevoir, comprendre et simuler des installations automatisées.

Je tiens également à être transparent sur les limites de mes connaissances. L'électricité est un domaine dans lequel j'ai encore des choses à apprendre. C'est pourquoi cette partie du logiciel demande particulièrement des relectures, des conseils et des retours de professionnels afin de garantir la fiabilité des modèles et des simulations proposés.

Pour le développement informatique, je m'appuie sur Claude, l'assistant d'Anthropic, comme outil d'aide à la programmation. Il m'accompagne dans l'écriture du code à partir de mes demandes, de mes cours et de mes corrections. En revanche, la conception du logiciel, les choix techniques et la validation du fonctionnement restent sous ma responsabilité.

## Fonctionnalités

Simulix Pro regroupe plusieurs outils permettant de travailler sur différentes technologies au sein d'un même environnement.

### Conception de schémas
- Création de schémas multi-technologies sur plusieurs folios.
- Gestion des cadres, cartouches et renvois.
- Références croisées entre les différents éléments.

### Simulation des systèmes
- Hydraulique et pneumatique : pression, débit, effort et vitesse.
- Électricité : potentiels et phases.
- Automatisme : exécution de programmes et logique de commande.
- Électronique numérique et systèmes logiques.

### Composants hydrauliques et pneumatiques
- Limiteurs de pression.
- Réducteurs de pression.
- Soupapes de séquence.
- Valves d'équilibrage.
- Filtres.
- Systèmes de transmission hydrostatique.

### Composants électriques
- Disjoncteurs et interrupteurs différentiels.
- Fusibles.
- Contacteurs et relais thermiques.
- Moteurs asynchrones triphasés.
- Transformateurs.

Le logiciel prend également en charge les circuits en 24 V continu ainsi que les réseaux 230, 380 et 400 V, en monophasé et triphasé.

### Automatisme et instrumentation
- Programmation en Ladder.
- Création et utilisation de GRAFCET.
- Instruments de mesure : manomètres, débitmètres et voltmètres.
- Traceur de courbes pour suivre l'évolution des grandeurs.
- Mode dépannage permettant de simuler différentes défaillances.

### Outils d'ingénierie
- Génération de nomenclatures.
- Vérification des schémas.
- Calculs hydrauliques.
- Analyse de pannes avec les méthodes des 5M et des 5 Pourquoi.

### Connexion à du matériel réel
Simulix Pro ne se limite pas à la simulation virtuelle. Il propose également des connexions avec du matériel physique :
- Cartes Arduino via USB.
- Automates programmables via Modbus TCP.

## Installation et mises à jour

Pour installer Simulix Pro, il suffit de télécharger la dernière version de l'installateur Windows depuis la page GitHub du projet.

**Téléchargement :** https://github.com/Pepinou66/simulix-pro/releases

Une fois installé, le logiciel peut rechercher et installer automatiquement les nouvelles versions.

Les mises à jour sont également accessibles depuis le menu :

**Aide → Rechercher des mises à jour…**

Il est possible de choisir le moment auquel le logiciel vérifie les nouvelles versions :
- À l'ouverture du logiciel.
- À sa fermeture.
- Au démarrage de Windows.
- Manuellement, à la demande de l'utilisateur.

## Organisation du projet

Le code source est organisé en plusieurs parties :

- **`src/`** : contient le code principal de l'application (HTML et JavaScript). Le script `python build.py` permet de générer les fichiers nécessaires à l'application.
- **`desktop/`** : regroupe les éléments liés à l'application Windows basée sur Electron, notamment les communications avec les cartes Arduino, le Modbus TCP et le système de mise à jour.
- **`.github/workflows/release.yml`** : permet d'automatiser la compilation de l'installateur Windows et la publication des nouvelles versions sur GitHub.

## Publication d'une nouvelle version

La publication d'une mise à jour suit un processus automatisé :

1. Modifier le numéro de version dans `desktop/package.json` (par exemple : `1.3.1`).
2. Enregistrer les modifications et les envoyer sur GitHub avec les commandes Git.
3. GitHub Actions se charge de compiler l'application et de publier la nouvelle version.

L'installateur correspondant est alors généré sous le nom `Simulix-Pro-Setup-1.3.1.exe`.

Les utilisateurs ayant déjà installé Simulix Pro sont ensuite informés de la disponibilité de cette nouvelle version grâce au système de mise à jour intégré.

## Licence

Simulix Pro est un logiciel libre, distribué sous licence **GNU GPL version 3 ou ultérieure** (GPL-3.0-or-later).

Copyright © 2026 Pepinou66

Vous pouvez utiliser, étudier, modifier et redistribuer ce logiciel, y compris dans une version modifiée,
à condition que toute version redistribuée reste sous la même licence et soit accompagnée de son code source.
Ce logiciel est fourni sans aucune garantie. Le texte complet de la licence se trouve dans le fichier [LICENSE](LICENSE).
