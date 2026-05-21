# MON COMMERCE PRO — by DIGIYLYFE
caisse.html
assets/css/caisse.css
assets/js/pos-caisse.js
assets/js/digiy-module-bridge.js
assets/js/digiy-pos-memory.js
README-decoupe.txt
Espace professionnel pour gérer un petit commerce simplement : caisse, articles, fiche commerce, QR et accès sécurisé.

Doctrine :

**Le commerçant travaille.  
DIGIY range le technique derrière.  
Le terrain garde la main.**

---

## Rôle du repo

Ce repo contient l’espace **PRO commerçant**.

Il sert à :

- ouvrir le comptoir
- encaisser
- gérer les articles
- préparer la fiche commerce
- générer le QR boutique
- entrer avec un code PIN sécurisé
- garder une session locale courte

Il ne doit pas contenir les outils de commandement DIGIY.

---

## Architecture actuelle

### Pages principales

| Fichier | Rôle |
|---|---|
| `index.html` | Comptoir principal MON COMMERCE |
| `caisse.html` | Caisse légère et mobile |
| `admin.html` | Arrière-boutique : articles, prix, stock |
| `profile.html` | Ma fiche commerce côté client |
| `qr.html` | QR officiel boutique |
| `pin.html` | Entrée sécurisée par code |
| `guard.js` | Garde POS / session 8h |
| `claw-tools-pos.js` | Pont technique silencieux |
| `start.html` | Porte de départ propre |
| `dashboard-pro.html` | Ancien lien transformé en pont vers le comptoir |

---

## Fichiers retirés ou neutralisés

Ces fichiers ne doivent plus être dans le flux commerçant :

| Fichier | Décision |
|---|---|
| `digiy-pos-license-generator.html` | Retiré du PRO. Logique déplacée vers `admin-digiy / activations.html` |
| `digiy-dash-batch.html` | Neutralisé côté PRO. Lecture centrale à déplacer dans `admin-digiy` |
| `digiy-qr-pro` | Retiré / corbeille. Remplacé par `qr.html` |
| Anciennes pages licence | À archiver si elles ne servent plus |

---

## Doctrine d’activation

L’activation ne se décide pas dans le repo PRO.

La vérité est :

```text
ABOS apporte la preuve.
ADMIN DIGIY active.
PRO travaille.
