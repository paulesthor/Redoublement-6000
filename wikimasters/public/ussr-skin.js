/* Habillage « ambiance URSS » de toute l'appli (aperçu réservé à l'administrateur).
 * Les textes sont remplacés à l'affichage (menus, titres, boutons, rarités en grades militaires…) sans toucher au code du jeu,
 * et l'interface reçoit son décor : bandeau d'actualités « Pravda », affiches constructivistes, tampons.
 * window.UssrSkin.on() / off(). Les textes d'origine reviennent dès que l'habillage est coupé et la page redessinée. */
(() => {
  'use strict';
  const EXACT = new Map(Object.entries({
    // barre du bas et menus
    'Boosters': 'Distribution', 'Collection': 'Archives', 'Chercher': 'Recherches', 'Combats': 'Le Front', 'Top': 'Honneur', 'Marché': 'Marché noir', 'Messages': 'Courrier', 'Amis': 'Camarades', 'Plus': 'Plan', 'Fil': 'Pravda',
    'CLODO': 'КЛОДО', 'WIKI': 'ВИКИ', 'Clodo': 'КЛОДО', 'Wiki': 'ВИКИ',
    // titres de pages
    'Ouvrir un paquet': 'Distribution des colis', 'Classement': 'Tableau d\'honneur', 'Succès': 'Décorations', 'Réglages': 'Règlement intérieur', 'Bourse': 'Bourse des vivres', 'Plus ou moins': 'Plan : ça monte ou ça baisse ?',
    'Banque': 'Caisse d\'épargne d\'État', 'Expéditions': 'Brigades de travail', 'Quêtes du jour': 'Normes du jour', 'Quiz du jour': 'Leçon du Parti', 'Albums': 'Albums de propagande', 'Événements': 'Décrets', 'Tournois': 'Olympiades du peuple',
    'Personnaliser': 'Dossier personnel', 'Mon profil': 'Mon dossier', 'Tendances': 'Cours du jour', 'Paquets du jour': 'Colis spéciaux', 'Recherche': 'Recherches', 'Enchères': 'Ventes aux enchères du Parti', 'Échanges': 'Troc entre camarades',
    'Administration': 'Politburo', 'Messages privés': 'Courrier privé', 'Combat': 'Duel', 'Combat terminé': 'Duel terminé', 'Classement général': 'Tableau d\'honneur général',
    // sous-titres
    'Défie un joueur connecté': 'Défie un camarade connecté', 'Défie un joueur, ou parie sur un combat en cours': 'Défie un camarade, ou parie sur un affrontement en cours', 'Apparence, jeu et notifications': 'Apparence, jeu et avis du Comité',
    'Les légendaires tirées par les joueurs': 'Les héros du Plan, dévoilés par les camarades', 'Paris sur les vues Wikipédia': 'Paris sur les vues Wikipédia, au prix du pain', 'Quel article a le plus de vues ?': 'Quel article a la plus grande production de vues ?',
    'Épargne et dividendes de ta collection': 'Épargne d\'État et dividendes de tes archives', 'Envoie tes doublons explorer le monde': 'Envoie tes doublons travailler au kolkhoze', 'Trois défis par jour, de nouveaux à minuit.': 'Trois normes par jour, de nouvelles à minuit. Le Plan ne dort pas.',
    'Des surprises à tout moment : reste attentif !': 'Des décrets à tout moment : reste attentif, camarade !', 'Photo et titre affichés partout dans le jeu': 'Photo et grade affichés partout, sur ordre du Parti', 'Échange ou vends des cartes à un joueur': 'Troque ou vends des fiches à un camarade',
    'Mise des pièces, 4 joueurs, combats de cartes': 'Mise, 4 camarades, affrontements de fiches', 'Les cartes qui montent et qui baissent aux enchères': 'Les fiches dont le cours monte et baisse sur les ventes du Parti', 'Retrouve n\'importe quelle carte': 'Retrouve n\'importe quelle fiche dans les archives',
    // tuiles du menu Plus
    'Objectifs et primes': 'Normes et primes', 'Tableau de bord, journal': 'Rapports du Politburo', 'Séries de cartes à compléter': 'Séries de fiches à compléter', 'Épargne et dividendes': 'Épargne et dividendes d\'État', 'Paris sur les vues': 'Paris sur la production de vues',
    'Photo et titres': 'Photo et grades', 'Défis, saison, surprises': 'Normes, saison, décrets', 'Envoie tes doublons': 'Au kolkhoze, les doublons', 'QR code, demandes': 'Code QR, demandes de camaraderie', 'Quitte ou double': 'Tout ou le goulag', 'Écrire à un joueur': 'Écrire à un camarade',
    'Vitrine et stats': 'Dossier et statistiques', 'Défis du jour': 'Normes du jour', 'Les meilleurs joueurs': 'Les meilleurs camarades', 'Trouver une carte': 'Retrouver une fiche', 'Thèmes, sons, notifications': 'Thèmes, sons, avis', 'Une catégorie de légendaires': 'Une catégorie de maréchaux',
    'Mise et combats à 4': 'Mise et affrontements à 4', 'Troquer des cartes': 'Troquer des fiches', 'Cours et alertes': 'Cours et alertes du jour',
    // boutons et libellés fréquents
    'Ouvrir': 'Ouvrir le colis', 'Ouvrir ×10': 'Ouvrir ×10 colis', 'Ouverture…': 'Ouverture du colis…', 'Fermer': 'Classer', 'Annuler': 'Retirer le dossier', 'Accepter': 'Approuver', 'Refuser': 'Rejeter', 'Continuer': 'Au suivant, camarade',
    'Passer': 'Sauter', 'Réessayer': 'Redéposer le dossier', 'Enregistrer': 'Tamponner', 'Valider': 'Tamponner', 'Envoyer': 'Expédier', 'Se connecter': 'Présenter ses papiers', 'Connexion': 'Présentation des papiers', 'Créer un compte': 'Demander un dossier',
    'Déconnexion': 'Quitter le poste', 'Pseudo': 'Nom de camarade', 'Mot de passe': 'Mot d\'ordre', 'Proposer l\'échange': 'Soumettre le troc au Comité', 'Proposer la vente': 'Soumettre la vente au Comité', 'Chargement des cartes…': 'Chargement des fiches…', 'Chargement…': 'La file avance…',
    'Dernier tirage': 'Dernière distribution', 'Nouveau': 'Nouvelle fiche', 'Tout': 'Tout le Plan', 'Voir plus': 'Voir plus de dossiers', 'Actualiser': 'Rafraîchir le Plan', 'Cours': 'Cours du jour', 'Qui l\'a ?': 'Qui la détient ?', 'Mettre en vente': 'Mettre en vente au Comité',
    // raretés → grades militaires
    'Commune': 'Soldat', 'Peu commune': 'Caporal', 'Rare': 'Sergent', 'Super rare': 'Capitaine', 'Ultra rare': 'Général', 'Légendaire': 'Maréchal', 'Légendaires': 'Maréchaux', 'Communes': 'Soldats', 'Rares': 'Sergents',
    'Hits légendaires': 'Faits d\'armes', 'Hits': 'Faits d\'armes', 'légendaires': 'd\'armes',
    'Les prochains tirages légendaires apparaîtront ici.': 'Les prochains faits d\'armes seront affichés ici, camarade.',
    'Aucune légendaire pour le moment.': 'Aucun maréchal pour le moment.',
    'Ajouter un commentaire…': 'Ajouter une note au dossier…', 'Rechercher une carte': 'Rechercher une fiche', 'cartes uniques': 'fiches uniques', 'exemplaires': 'exemplaires du Plan', 'doublons': 'doublons (au kolkhoze)', 'valeur estimée (pièces)': 'valeur estimée (roubles d\'État)', 'Publier': 'Afficher', 'J\'aime': 'Approuvé',
  }));
  const plural = n => (+n > 1 ? 's' : '');
  const RE = [
    [/^Acheter et ouvrir · (.+)$/, 'Faire la queue et ouvrir · $1'], [/^Acheter ×10 · (.+)$/, 'Faire la queue ×10 · $1'], [/^Ouvrir un autre paquet(.*)$/, 'Ouvrir un autre colis$1'], [/^Acheter un autre(.*)$/, 'Faire la queue pour un autre$1'],
    [/^Carte$/, 'Fiche'], [/^Encore (\d+) cartes?$/, (m, n) => `Encore ${n} fiche${plural(n)}`], [/^(\d+) paquets? disponibles?$/, (m, n) => `${n} colis disponible${plural(n)}`], [/^paquets? disponibles?$/, 'colis disponible(s)'],
    [/prochain dans/, 'prochain colis dans'], [/^(\d+) victoires?$/, (m, n) => `${n} plan${plural(n)} dépassé${plural(n)}`], [/^Possédée ×(\d+)$/, 'Détenue ×$1'], [/^Déjà possédée$/, 'Déjà archivée'],
    [/^Voir les (\d+) commentaires$/, 'Voir les $1 notes au dossier'], [/^Quête(s?)$/, 'Norme$1'],
  ];
  const orig = new WeakMap(), changed = new Set();                    // texte d'origine de chaque nœud modifié : on peut tout restaurer
  const skinText = (n) => {
    const raw = n.nodeValue; if (!raw) return; const t = raw.trim(); if (!t) return;
    let out = EXACT.get(t);
    if (out === undefined) for (const [re, rep] of RE) if (re.test(t)) { out = t.replace(re, rep); break; }
    if (out !== undefined && out !== t) { if (!orig.has(n)) { orig.set(n, raw); changed.add(new WeakRef(n)); } n.nodeValue = raw.replace(t, out); }
  };
  const skinAttrs = el => { for (const a of ['placeholder', 'aria-label', 'title']) { const v = el.getAttribute?.(a); if (v && EXACT.has(v.trim())) el.setAttribute(a, EXACT.get(v.trim())); } };
  const walk = root => {
    if (!root) return;
    if (root.nodeType === 3) return skinText(root);
    if (root.nodeType !== 1) return;
    const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => /^(SCRIPT|STYLE|TEXTAREA)$/.test(n.parentElement?.tagName || '') || n.parentElement?.closest('[data-noussr]') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT });
    const list = []; while (tw.nextNode()) list.push(tw.currentNode); list.forEach(skinText);
    skinAttrs(root); root.querySelectorAll?.('[placeholder],[aria-label],[title]').forEach(skinAttrs);
  };

  const NEWS = ['PRAVDA : la production de bonheur dépasse les objectifs de 140 %.', 'Le froid est une ressource renouvelable, rappelle le ministère.', 'Aucune évasion signalée : la Sibérie est jugée trop spacieuse.', 'Le Parti rappelle que le pain n\'est pas obligatoire, mais le plan si.',
    'Découverte : le plan quinquennal peut être rempli en quatre ans et onze mois, dans l\'esprit.', 'Météo : −31 °C, ressentis −31 °C. Le ministère de la Météo n\'a pas de commentaire.', 'Le Politburo félicite chaleureusement ses propres félicitations.', 'Pénurie de papier : on écrit désormais les rapports sur les rapports.',
    'Les camarades sont invités à garder le sourire : il est inclus dans le rendement.', 'Le directeur du camp voisin a été promu. On ne sait pas où.', 'Tout va bien, camarade. La neige est de la poudre de bonheur.', 'Rappel : une file d\'attente est un lieu de rencontre, pas une perte de temps.'];
  let obs = null, ticker = null, tickT = 0, newsI = 0, active = false;
  const mountTicker = () => {
    if (ticker?.isConnected) return;
    ticker = document.createElement('div'); ticker.className = 'us-news'; ticker.dataset.noussr = '1'; ticker.innerHTML = '<b>ПРАВДА</b><span></span>';
    const view = document.querySelector('#view'); view?.parentNode?.insertBefore(ticker, view);
    const set = () => { const sp = ticker.querySelector('span'); sp.classList.remove('in'); sp.textContent = NEWS[newsI++ % NEWS.length]; void sp.offsetWidth; sp.classList.add('in'); }; set(); tickT = setInterval(set, 9000);
  };
  const on = () => {
    if (active) return; active = true; document.body.classList.add('ussr-ui'); mountTicker(); walk(document.body);
    obs = new MutationObserver(muts => { if (!active) return; obs.disconnect(); for (const m of muts) { if (m.type === 'characterData') skinText(m.target); else m.addedNodes.forEach(walk); } mountTicker(); obs.takeRecords(); obs.observe(document.body, { childList: true, subtree: true, characterData: true }); });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  };
  const off = () => { if (!active) return; active = false; obs?.disconnect(); obs = null; clearInterval(tickT); ticker?.remove(); ticker = null; document.body.classList.remove('ussr-ui'); for (const r of changed) { const n = r.deref(); if (n && orig.has(n)) n.nodeValue = orig.get(n); } changed.clear(); };
  window.UssrSkin = { on, off, isOn: () => active, EXACT };
})();
