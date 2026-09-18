const el = (id) => document.getElementById(id);

let currentTracks = [];
let currentPlaylistMeta = { name: "", description: "" };

async function init() {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }

  const params = new URLSearchParams(location.search);
  const error = params.get("error");
  if (error) {
    showError(`Connexion Spotify échouée (${error})`);
    history.replaceState({}, "", "/");
  }

  const me = await fetch("/api/me").then((r) => r.json());
  if (me.logged_in) {
    el("login-view").classList.add("hidden");
    el("generate-view").classList.remove("hidden");
    const badge = el("user-badge");
    badge.classList.remove("hidden");
    badge.innerHTML = `${me.display_name || "Connecté"} · <a href="/logout">déconnexion</a>`;
  } else {
    el("login-view").classList.remove("hidden");
    el("generate-view").classList.add("hidden");
  }
}

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    el("mood-input").value = chip.dataset.mood;
  });
});

function showError(msg) {
  const box = el("error-msg");
  box.textContent = msg;
  box.classList.remove("hidden");
}

function clearError() {
  el("error-msg").classList.add("hidden");
}

function renderTracks(tracks) {
  const list = el("track-list");
  list.innerHTML = "";
  tracks.forEach((t) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <img src="${t.image || ""}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="track-meta">
        <div class="title">${escapeHtml(t.name)}</div>
        <div class="artist">${escapeHtml(t.artist)}</div>
      </div>`;
    list.appendChild(li);
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

// --- voice input -------------------------------------------------------

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let mediaRecorder = null;
let recordedChunks = [];
let isRecording = false;

function setMicStatus(msg) {
  const status = el("mic-status");
  if (!msg) {
    status.classList.add("hidden");
    status.textContent = "";
  } else {
    status.textContent = msg;
    status.classList.remove("hidden");
  }
}

function setRecordingUI(active) {
  isRecording = active;
  el("mic-btn").classList.toggle("recording", active);
}

async function startBrowserSpeechRecognition() {
  recognition = new SpeechRecognitionCtor();
  recognition.lang = "fr-FR";
  recognition.interimResults = true;
  recognition.continuous = false;

  recognition.onstart = () => {
    setRecordingUI(true);
    setMicStatus("Je t'écoute…");
  };

  recognition.onresult = (event) => {
    let transcript = "";
    for (let i = 0; i < event.results.length; i++) {
      transcript += event.results[i][0].transcript;
    }
    el("mood-input").value = transcript;
  };

  recognition.onerror = (event) => {
    setRecordingUI(false);
    setMicStatus("");
    if (event.error !== "aborted" && event.error !== "no-speech") {
      showError("Micro indisponible (" + event.error + "). Réessaie ou tape ta demande.");
    }
  };

  recognition.onend = () => {
    setRecordingUI(false);
    setMicStatus("");
  };

  recognition.start();
}

function pickAudioMimeType() {
  const candidates = ["audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((type) => window.MediaRecorder && MediaRecorder.isTypeSupported(type)) || "";
}

async function startFallbackRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = pickAudioMimeType();
  mediaRecorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
  recordedChunks = [];

  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) recordedChunks.push(e.data);
  };

  mediaRecorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    setRecordingUI(false);
    setMicStatus("Transcription en cours…");

    const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
    const formData = new FormData();
    formData.append("audio", blob, "recording.webm");

    try {
      const resp = await fetch("/api/transcribe", { method: "POST", body: formData });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Transcription échouée");
      el("mood-input").value = data.text;
    } catch (err) {
      showError(err.message);
    } finally {
      setMicStatus("");
    }
  };

  mediaRecorder.start();
  setRecordingUI(true);
  setMicStatus("Je t'écoute… (appuie à nouveau pour arrêter)");
}

el("mic-btn").addEventListener("click", async () => {
  clearError();

  if (isRecording) {
    if (recognition) recognition.stop();
    if (mediaRecorder && mediaRecorder.state !== "inactive") mediaRecorder.stop();
    return;
  }

  try {
    if (SpeechRecognitionCtor) {
      await startBrowserSpeechRecognition();
    } else if (navigator.mediaDevices && window.MediaRecorder) {
      await startFallbackRecording();
    } else {
      showError("La saisie vocale n'est pas supportée par ce navigateur.");
    }
  } catch (err) {
    setRecordingUI(false);
    setMicStatus("");
    showError("Impossible d'accéder au micro : " + err.message);
  }
});

el("generate-btn").addEventListener("click", async () => {
  clearError();
  const mood = el("mood-input").value.trim();
  if (!mood) {
    showError("Décris l'ambiance que tu veux pour ta playlist.");
    return;
  }
  const trackCount = parseInt(el("count-input").value, 10) || 20;

  el("generate-btn").disabled = true;
  el("loading").classList.remove("hidden");
  el("result").classList.add("hidden");

  try {
    const resp = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mood, track_count: trackCount }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erreur inconnue");

    currentTracks = data.tracks;
    currentPlaylistMeta = { name: data.playlist_name, description: data.description };

    el("result-name").textContent = data.playlist_name;
    el("result-desc").textContent = data.description;
    renderTracks(data.tracks);
    el("spotify-link").classList.add("hidden");
    el("create-btn").classList.remove("hidden");
    el("result").classList.remove("hidden");

    if (!data.tracks.length) {
      showError("Aucun titre trouvé, essaie de reformuler ta demande.");
    }
  } catch (err) {
    showError(err.message);
  } finally {
    el("generate-btn").disabled = false;
    el("loading").classList.add("hidden");
  }
});

el("create-btn").addEventListener("click", async () => {
  clearError();
  el("create-btn").disabled = true;
  try {
    const resp = await fetch("/api/create_playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: currentPlaylistMeta.name,
        description: currentPlaylistMeta.description,
        uris: currentTracks.map((t) => t.uri),
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erreur inconnue");

    const link = el("spotify-link");
    link.href = data.url;
    link.textContent = "🎶 Ouvrir la playlist dans Spotify";
    link.classList.remove("hidden");
    el("create-btn").classList.add("hidden");
  } catch (err) {
    showError(err.message);
  } finally {
    el("create-btn").disabled = false;
  }
});

init();
