document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    const gameId = urlParams.get('gameId');
    const playerId = urlParams.get('playerId');

    if (!gameId || !playerId || !window.db) {
        window.location.href = 'index.html';
        return;
    }

    const db = window.db;
    const gameRef = db.ref(`games/${gameId}`);
    const playerRef = db.ref(`games/${gameId}/players/${playerId}`);

    // Gérer la présence du joueur
    playerRef.onDisconnect().update({ online: false });
    playerRef.update({ online: true });

    // Écouteur principal de la partie
    gameRef.on('value', (snapshot) => {
        const game = snapshot.val();
        if (!game) {
            alert("La partie a été supprimée par l'hôte.");
            window.location.href = 'index.html';
            return;
        }

        // Si la partie a commencé, rediriger vers la page de jeu
        if (game.status === "started" && game.players[playerId]) {
            window.location.href = `game.html?gameId=${gameId}&playerId=${playerId}`;
        }
        
        updateLobbyUI(game);
    });

    document.getElementById('ready-button').addEventListener('click', toggleReady);
    document.getElementById('leave-game').addEventListener('click', leaveGame);

    function updateLobbyUI(game) {
        const players = game.players || {};
        document.getElementById('display-game-id').textContent = game.gameCode;
        
        const playersList = document.getElementById('players-list');
        playersList.innerHTML = '';
        Object.entries(players).forEach(([id, player]) => {
            const playerEl = document.createElement('div');
            playerEl.className = 'player-item';
            playerEl.innerHTML = `
                <div class="player-avatar">
                    ${player.avatar ? `<img src="${player.avatar}" alt="avatar">` : ''}
                </div>
                <span class="player-name">${player.name} ${id === playerId ? '(Vous)' : ''}</span>
                <span class="player-status ${player.ready ? 'ready' : 'waiting'}">${player.ready ? 'Prêt' : 'Attente'}</span>
            `;
            playersList.appendChild(playerEl);
        });

        // Logique pour l'hôte
        if (game.hostId === playerId) {
            const hostIndicator = document.getElementById('host-indicator');
            const readyButton = document.getElementById('ready-button');

            hostIndicator.classList.remove('hidden');
            readyButton.textContent = "Lancer la partie";
            readyButton.onclick = () => startGame(game); // Change l'action du bouton pour l'hôte
        }
    }

    async function toggleReady() {
        const playerSnap = await playerRef.once('value');
        const isReady = !playerSnap.val().ready;
        await playerRef.update({ ready: isReady });
    }

    async function leaveGame() {
        await playerRef.remove();
        window.location.href = 'index.html';
    }

    function createDeck() {
        const suits = ['hearts', 'diamonds', 'clubs', 'spades'];
        const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        let deck = [];
        for (const suit of suits) {
            for (const value of values) {
                deck.push({ suit, value });
            }
        }
        // Mélanger le deck
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }
    
    // === FONCTION CORRIGÉE ===
    async function startGame(game) {
        const players = game.players;
        const playerIds = Object.keys(players);

        if (playerIds.length < 2) {
            alert("Il faut au moins 2 joueurs pour commencer !");
            return;
        }

        const allReady = playerIds.every(id => players[id].ready);
        if (!allReady && game.hostId !== playerId) {
             alert("Tous les joueurs ne sont pas encore prêts !");
             return;
        }

        const deck = createDeck();

        const pyramidRows = Math.min(5, 2 + playerIds.length);
        const pyramid = [];
        for (let i = 0; i < pyramidRows; i++) {
            const row = Array(i + 1).fill({ revealed: false });
            pyramid.push(row);
        }

        const updates = {
            status: "started",
            phase: "distribution",
            pyramid: pyramid,
            currentTurn: playerIds[0]
        };

        playerIds.forEach(id => {
            updates[`players/${id}/cards`] = deck.splice(0, 4).map(card => ({ ...card, revealed: false }));
        });
        
        updates['deck'] = deck;

        await gameRef.update(updates);
    }
});