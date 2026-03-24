document.addEventListener('DOMContentLoaded', () => {
    initFirebase();
    initUI();
    setupEventListeners();
});

function initFirebase() {
    if (!firebase.apps.length) {
        firebase.initializeApp({
            apiKey: "AIzaSyAXDC7ptVfUKte5piWzBZse8HI0Htl_uHA",
            authDomain: "site-pyramide.firebaseapp.com",
            databaseURL: "https://site-pyramide-default-rtdb.europe-west1.firebasedatabase.app",
            projectId: "site-pyramide",
            storageBucket: "site-pyramide.appspot.com",
            messagingSenderId: "426258577571",
            appId: "1:426258577571:web:b56f204f17bf0d2fec2716"
        });
        window.db = firebase.database();
    }
}

function initUI() {
    const savedAvatar = localStorage.getItem('avatar');
    if (savedAvatar) {
        document.getElementById('avatar-preview').innerHTML = 
            `<img src="${savedAvatar}" alt="Avatar">`;
    }
}

function setupEventListeners() {
    document.getElementById('avatar-upload').addEventListener('change', handleAvatarUpload);
    document.getElementById('create-game').addEventListener('click', handleCreateGame);
    document.getElementById('join-game').addEventListener('click', () => {
        document.getElementById('join-form').classList.remove('hidden');
        document.getElementById('main-buttons').classList.add('hidden');
    });
    document.getElementById('confirm-join').addEventListener('click', handleJoinGame);
    document.getElementById('cancel-join').addEventListener('click', () => {
        document.getElementById('join-form').classList.add('hidden');
        document.getElementById('main-buttons').classList.remove('hidden');
    });
}

async function handleCreateGame() {
    const username = document.getElementById('username').value.trim();
    if (!username) return showError("Un pseudo est requis");

    try {
        const gameCode = generateGameCode();
        const gameRef = db.ref('games').push();
        
        await db.ref(`gameCodes/${gameCode}`).set({
            gameId: gameRef.key,
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        await gameRef.set({
            gameCode,
            hostId: gameRef.key,
            players: {
                [gameRef.key]: {
                    name: username,
                    avatar: localStorage.getItem('avatar'),
                    ready: false,
                    online: true
                }
            },
            status: "waiting",
            createdAt: firebase.database.ServerValue.TIMESTAMP
        });

        localStorage.setItem('gameData', JSON.stringify({
            gameId: gameRef.key,
            playerId: gameRef.key,
            isHost: true
        }));
        
        window.location.href = `join.html?gameId=${gameRef.key}&playerId=${gameRef.key}`;

    } catch (error) {
        showError("Erreur: " + error.message);
        console.error("Create game error:", error);
    }
}

async function handleJoinGame() {
    const gameCode = document.getElementById('game-id-input').value.trim().toUpperCase();
    const username = document.getElementById('username').value.trim();

    if (!gameCode || gameCode.length !== 4) return showError("Code invalide (4 lettres)");
    if (!username) return showError("Pseudo requis");

    try {
        const codeSnapshot = await db.ref(`gameCodes/${gameCode}`).once('value');
        if (!codeSnapshot.exists()) return showError("Code incorrect");

        const gameId = codeSnapshot.val().gameId;
        const gameSnapshot = await db.ref(`games/${gameId}`).once('value');
        if (!gameSnapshot.exists()) return showError("Partie introuvable");

        const playerRef = db.ref(`games/${gameId}/players`).push();
        await playerRef.set({
            name: username,
            avatar: localStorage.getItem('avatar'),
            ready: false,
            online: true
        });

        localStorage.setItem('gameData', JSON.stringify({
            gameId,
            playerId: playerRef.key,
            isHost: false
        }));
        window.location.href = `join.html?gameId=${gameId}&playerId=${playerRef.key}`;

    } catch (error) {
        showError("Erreur: " + error.message);
        console.error("Join game error:", error);
    }
}

function generateGameCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

function showError(message) {
    const el = document.getElementById('error-message');
    el.textContent = message;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
}

function showSuccess(message) {
    const el = document.getElementById('success-message');
    el.textContent = message;
    el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
}

function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 150;
                const MAX_HEIGHT = 150;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                
                // Compresser l'image en JPEG de qualité moyenne pour soulager Firebase
                const dataUrl = canvas.toDataURL('image/jpeg', 0.8);

                document.getElementById('avatar-preview').innerHTML = 
                    `<img src="${dataUrl}" alt="Avatar">`;
                localStorage.setItem('avatar', dataUrl);
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    }
}