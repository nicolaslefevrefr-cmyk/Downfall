# Chute Libre — Trap Platformer (prototype)

Rage/trap platformer 2D à **écran fixe** (aucun scroll de caméra) : le joueur explore, meurt à cause d'un piège, comprend pourquoi, et retente immédiatement. Le moteur est **générique et piloté par les données** : chaque niveau est un objet JSON décrivant géométrie + pièges (`trigger` → délai → `action` → cascade `then`), interprété par `js/engine.js`. Voir le détail de l'architecture dans la réponse de conception qui accompagne ce projet.

3 niveaux inclus : plateforme qui s'effondre (L1, difficulté 1), cascade de deux plateformes + pic caché (L2, difficulté 3), fausse sortie + bouton/porte verrouillée (L3, difficulté 4).

## Déployer sur GitHub Pages

Pousser le contenu de ce dossier (`index.html` à la racine) sur un dépôt GitHub, puis activer **Settings → Pages → Deploy from branch** sur la branche concernée. L'installation PWA nécessite HTTPS (fourni automatiquement par GitHub Pages) ; en local sans serveur HTTPS, le service worker/l'installation ne fonctionneront pas mais le jeu reste jouable normalement.
