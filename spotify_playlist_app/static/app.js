const el = (id) => document.getElementById(id);

let currentTracks = [];
let currentPlaylistMeta = { name: "", description: "" };
let userPlaylists = [];
let playlistsLoaded = false;

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
    el("tab-bar").classList.remove("hidden");
    switchTab("generate-view");
    const badge = el("user-badge");
    badge.classList.remove("hidden");
    badge.innerHTML = `${me.display_name || "Connecté"} · <a href="/logout">déconnexion</a>`;
  } else {
    el("login-view").classList.remove("hidden");
    el("tab-bar").classList.add("hidden");
  }
}

// --- tabs ----------------------------------------------------------------

function switchTab(tabId) {
  document.querySelectorAll(".view").forEach((v) => v.classList.add("hidden"));
  el(tabId).classList.remove("hidden");
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tabId));
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

// --- mood presets ----------------------------------------------------------

document.querySelectorAll(".chip").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    el("mood-input").value = chip.dataset.mood;
  });
});

// --- taste source selection ------------------------------------------------

document.querySelectorAll('input[name="source"]').forEach((radio) => {
  radio.addEventListener("change", async () => {
    const picker = el("playlist-picker");
    if (radio.value === "playlist" && radio.checked) {
      picker.classList.remove("hidden");
      await ensurePlaylistsLoaded();
    } else {
      picker.classList.add("hidden");
    }
  });
});

async function ensurePlaylistsLoaded() {
  if (playlistsLoaded) return;
  try {
    const resp = await fetch("/api/playlists");
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Impossible de charger tes playlists");
    userPlaylists = data.playlists;
    playlistsLoaded = true;
    renderPlaylistPicker();
  } catch (err) {
    el("playlist-list").innerHTML = `<p class="hint">${escapeHtml(err.message)}</p>`;
  }
}

function renderPlaylistPicker() {
  const container = el("playlist-list");
  if (!userPlaylists.length) {
    container.innerHTML = '<p class="hint">Aucune playlist trouvée sur ton compte.</p>';
    return;
  }
  container.innerHTML = "";
  userPlaylists.forEach((p) => {
    const label = document.createElement("label");
    label.className = "playlist-item";
    label.innerHTML = `
      <input type="checkbox" value="${p.id}" />
      <img src="${p.image || ""}" alt="" onerror="this.style.visibility='hidden'" />
      <span class="name">${escapeHtml(p.name)} (${p.tracks_total})</span>`;
    container.appendChild(label);
  });
}

function getSelectedSource() {
  const source = document.querySelector('input[name="source"]:checked').value;
  const playlistIds = source === "playlist"
    ? Array.from(document.querySelectorAll('#playlist-list input[type="checkbox"]:checked')).map((c) => c.value)
    : [];
  return { source, playlistIds };
}

// --- shared helpers --------------------------------------------------------

function showError(msg, targetId = "error-msg") {
  const box = el(targetId);
  box.textContent = msg;
  box.classList.remove("hidden");
}

function clearError(targetId = "error-msg") {
  el(targetId).classList.add("hidden");
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

function renderTracks(tracks) {
  const list = el("track-list");
  list.innerHTML = "";
  tracks.forEach((t, index) => {
    const li = document.createElement("li");
    li.innerHTML = `
      <img src="${t.image || ""}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="track-meta">
        <div class="title">${escapeHtml(t.name)}</div>
        <div class="artist">${escapeHtml(t.artist)}</div>
      </div>
      <button class="remove-track" type="button" title="Retirer ce titre">✕</button>`;
    li.querySelector(".remove-track").addEventListener("click", () => {
      currentTracks.splice(index, 1);
      renderTracks(currentTracks);
    });
    list.appendChild(li);
  });
}

function populateTargetSelect() {
  const select = el("target-select");
  select.innerHTML = '<option value="">➕ Nouvelle playlist</option>';
  userPlaylists.forEach((p) => {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `📂 Ajouter à : ${p.name}`;
    select.appendChild(opt);
  });
}

// --- voice input (reusable for any textarea) --------------------------------

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;

function setupVoiceInput({ micBtnId, statusId, textareaId, errorId }) {
  let recognition = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let isRecording = false;

  const micBtn = el(micBtnId);
  if (!micBtn) return;

  function setMicStatus(msg) {
    const status = el(statusId);
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
    micBtn.classList.toggle("recording", active);
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
      el(textareaId).value = transcript;
    };

    recognition.onerror = (event) => {
      setRecordingUI(false);
      setMicStatus("");
      if (event.error !== "aborted" && event.error !== "no-speech") {
        showError("Micro indisponible (" + event.error + "). Réessaie ou tape ta demande.", errorId);
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
        el(textareaId).value = data.text;
      } catch (err) {
        showError(err.message, errorId);
      } finally {
        setMicStatus("");
      }
    };

    mediaRecorder.start();
    setRecordingUI(true);
    setMicStatus("Je t'écoute… (appuie à nouveau pour arrêter)");
  }

  micBtn.addEventListener("click", async () => {
    clearError(errorId);

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
        showError("La saisie vocale n'est pas supportée par ce navigateur.", errorId);
      }
    } catch (err) {
      setRecordingUI(false);
      setMicStatus("");
      showError("Impossible d'accéder au micro : " + err.message, errorId);
    }
  });
}

setupVoiceInput({ micBtnId: "mic-btn", statusId: "mic-status", textareaId: "mood-input", errorId: "error-msg" });
setupVoiceInput({ micBtnId: "find-mic-btn", statusId: "find-mic-status", textareaId: "find-input", errorId: "find-error-msg" });

// --- generate playlist -----------------------------------------------------

async function runGenerate() {
  clearError();
  const mood = el("mood-input").value.trim();
  if (!mood) {
    showError("Décris l'ambiance que tu veux pour ta playlist.");
    return;
  }
  const trackCount = parseInt(el("count-input").value, 10) || 20;
  const { source, playlistIds } = getSelectedSource();
  if (source === "playlist" && !playlistIds.length) {
    showError("Sélectionne au moins une playlist, ou choisis une autre source.");
    return;
  }

  el("generate-btn").disabled = true;
  el("regenerate-btn").disabled = true;
  el("loading").classList.remove("hidden");
  el("result").classList.add("hidden");

  try {
    const [resp] = await Promise.all([
      fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mood, track_count: trackCount, source, playlist_ids: playlistIds }),
      }),
      ensurePlaylistsLoaded(),
    ]);
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erreur inconnue");

    currentTracks = data.tracks;
    currentPlaylistMeta = { name: data.playlist_name, description: data.description };

    el("result-name").textContent = data.playlist_name;
    el("result-desc").textContent = data.description;
    renderTracks(currentTracks);
    populateTargetSelect();
    el("spotify-link").classList.add("hidden");
    el("create-btn").classList.remove("hidden");
    el("create-btn").textContent = "✅ Valider sur Spotify";
    el("result").classList.remove("hidden");

    if (!data.tracks.length) {
      showError("Aucun titre trouvé, essaie de reformuler ta demande.");
    }
  } catch (err) {
    showError(err.message);
  } finally {
    el("generate-btn").disabled = false;
    el("regenerate-btn").disabled = false;
    el("loading").classList.add("hidden");
  }
}

el("generate-btn").addEventListener("click", runGenerate);
el("regenerate-btn").addEventListener("click", runGenerate);

el("create-btn").addEventListener("click", async () => {
  clearError();
  if (!currentTracks.length) {
    showError("La liste est vide, régénère ou remets au moins un titre.");
    return;
  }
  el("create-btn").disabled = true;
  try {
    const targetPlaylistId = el("target-select").value || null;
    const resp = await fetch("/api/create_playlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: currentPlaylistMeta.name,
        description: currentPlaylistMeta.description,
        uris: currentTracks.map((t) => t.uri),
        target_playlist_id: targetPlaylistId,
      }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erreur inconnue");

    const link = el("spotify-link");
    link.href = data.url;
    link.textContent = targetPlaylistId
      ? `🎶 Ouvrir "${data.name}" dans Spotify`
      : "🎶 Ouvrir la nouvelle playlist dans Spotify";
    link.classList.remove("hidden");
    el("create-btn").classList.add("hidden");
  } catch (err) {
    showError(err.message);
  } finally {
    el("create-btn").disabled = false;
  }
});

// --- find a track ------------------------------------------------------

function renderFindResults(tracks) {
  const list = el("find-results");
  list.innerHTML = "";
  tracks.forEach((t) => {
    const li = document.createElement("li");
    li.className = "find-result";

    const playlistOptions = userPlaylists
      .map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`)
      .join("");

    li.innerHTML = `
      <img src="${t.image || ""}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="find-meta">
        <div class="title">${escapeHtml(t.name)}</div>
        <div class="artist">${escapeHtml(t.artist)}</div>
        ${t.reason ? `<div class="reason">${escapeHtml(t.reason)}</div>` : ""}
      </div>
      <div class="find-actions">
        <a href="${t.url}" target="_blank" rel="noopener">Ouvrir</a>
        <select class="add-to-playlist-select">
          <option value="">+ Ajouter à…</option>
          ${playlistOptions}
        </select>
      </div>`;

    const select = li.querySelector(".add-to-playlist-select");
    select.addEventListener("change", async () => {
      const playlistId = select.value;
      if (!playlistId) return;
      select.disabled = true;
      try {
        const resp = await fetch("/api/add_to_playlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ playlist_id: playlistId, uri: t.uri }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Ajout impossible");
        select.innerHTML = '<option value="">✅ Ajouté</option>';
      } catch (err) {
        showError(err.message, "find-error-msg");
        select.disabled = false;
        select.value = "";
      }
    });

    list.appendChild(li);
  });
}

el("find-btn").addEventListener("click", async () => {
  clearError("find-error-msg");
  const description = el("find-input").value.trim();
  if (!description) {
    showError("Décris le morceau que tu cherches.", "find-error-msg");
    return;
  }

  el("find-btn").disabled = true;
  el("find-loading").classList.remove("hidden");
  el("find-results").innerHTML = "";

  try {
    await ensurePlaylistsLoaded();
    const resp = await fetch("/api/find_track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "Erreur inconnue");

    renderFindResults(data.tracks);
    if (!data.tracks.length) {
      showError("Aucun morceau trouvé, essaie de donner plus de détails.", "find-error-msg");
    }
  } catch (err) {
    showError(err.message, "find-error-msg");
  } finally {
    el("find-btn").disabled = false;
    el("find-loading").classList.add("hidden");
  }
});

init();
