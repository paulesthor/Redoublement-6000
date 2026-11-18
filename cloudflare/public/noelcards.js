/* Cartes de Noël : hotte (tirage avec les flocons), ma carte (photo), animation du 25 décembre, et l'écran de l'administrateur.
   Chargé à la demande depuis app.js ; reçoit les outils de l'appli (api, toast, safe, ask, render…) dans « ctx ». */
(() => {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const REDUCED = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

  /** Redimensionne une image choisie sur le téléphone et la renvoie en JPEG (base64 sans préfixe) de moins de 250 Ko. */
  async function jpegFrom(file, max = 800) {
    const img = await new Promise((ok, no) => { const im = new Image(), u = URL.createObjectURL(file); im.onload = () => { URL.revokeObjectURL(u); ok(im); }; im.onerror = () => no(new Error('Image illisible')); im.src = u; });
    let side = max;
    for (let tries = 0; tries < 6; tries++) {
      const k = Math.min(1, side / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      for (const q of [0.85, 0.75, 0.65, 0.55]) { const d = c.toDataURL('image/jpeg', q).split(',')[1]; if (d.length <= 320000) return d; }
      side = Math.round(side * 0.8);
    }
    throw new Error('Image trop lourde');
  }
  const tile = (c, extra = '') => `<div class="nc-card ${c.isNew ? 'new' : ''} ${extra}"><div class="nc-img ${c.image ? '' : 'noimg'}" ${c.image ? `style="background-image:url('${esc(c.image)}')"` : ''}>${c.image ? '' : `<span>${esc((c.title || '?').slice(0, 2))}</span>`}</div><b>${esc(c.title)}</b>${c.isNew ? '<i>Nouvelle</i>' : ''}</div>`;

  /** Blocs affichés sous le calendrier : hotte, album, ma carte. */
  async function mount(el, ctx) {
    if (!el) return;
    const { api, toast, safe } = ctx;
    let h, p;
    try { [h, p] = await Promise.all([api('/noel/hotte'), api('/noel/photo')]); } catch { el.innerHTML = ''; return; }
    el.innerHTML = `
      <div class="nl-game nc-block"><div><b>La hotte</b><span>${h.cost} flocons le tirage : une carte de Noël au hasard parmi ${h.pool}. Tu en as ${h.owned} différente${h.owned > 1 ? 's' : ''}.</span></div><span class="nc-btns"><button class="ic-go" data-n="1" ${h.flocons >= h.cost ? '' : 'disabled'}>Tirer</button><button class="ic-go" data-n="5" ${h.flocons >= h.cost * 5 ? '' : 'disabled'}>× 5</button></span></div>
      <p class="mut nc-fl">${ctx.fmt ? ctx.fmt(h.flocons) : h.flocons} flocon${h.flocons > 1 ? 's' : ''} disponible${h.flocons > 1 ? 's' : ''}${h.flocons >= h.cost * 5 ? '' : ''}</p>
      <div class="nl-game nc-block"><div><b>Album de Noël</b><span>Le renne, le sapin, la sainte famille et Noah. Complète-le pour la récompense.</span></div><button class="ic-go" id="nc-alb">Voir</button></div>
      <div class="panel nc-mine"><h3>Ma carte de Noël</h3>
        ${p.card ? `<p class="mut">Ta carte existe : elle peut sortir de la hotte pour tout le monde.</p><div class="nc-one">${tile(p.card)}</div>` : p.sent ? '<p class="mut">Ta photo est bien arrivée. L\'administrateur en fait un article complet, comme sur Wikipédia. Il te prévient quand la carte est prête.</p>' : '<p class="mut">Envoie une photo si tu veux ta propre carte : un article complet avec ton portrait dessiné. Rien n\'est publié sans ta photo, et personne d\'autre que l\'administrateur ne la voit.</p>'}
        ${p.card ? '' : `<label class="nc-consent"><input type="checkbox" id="nc-ok"> <span>J'accepte que ma photo serve à créer ma carte, et qu'elle soit transformée en dessin visible des autres joueurs. Je peux la retirer à tout moment.</span></label>
        <div class="row"><label class="plain nc-file">${p.sent ? 'Remplacer ma photo' : 'Choisir une photo'}<input type="file" accept="image/*" id="nc-file" hidden></label>${p.sent ? '<button class="plain" id="nc-del" style="flex:1">Retirer ma photo</button>' : ''}</div>`}
      </div>`;
    el.querySelector('#nc-alb').onclick = () => ctx.go('albums');
    el.querySelectorAll('[data-n]').forEach(draw => draw.onclick = safe(async () => {
      const n = +draw.dataset.n;
      el.querySelectorAll('[data-n]').forEach(x => { x.disabled = true; }); const r = await api('/noel/hotte', { n }); ctx.refreshMe?.();
      const m = document.querySelector('#modal'); m.hidden = false;
      m.innerHTML = `<div class="recapsheet nl-reveal" role="dialog" aria-label="Hotte"><small class="nl-kick">LA HOTTE · LIVRAISON</small><div class="nc-grid">${r.cards.map(c => tile(c)).join('')}</div><p class="mut" style="text-align:center">Il te reste ${r.flocons} flocon${r.flocons > 1 ? 's' : ''}.</p><button class="ic-go" id="nc-x" style="width:100%">Merci, patron</button></div>`;
      m.querySelector('#nc-x').onclick = () => { m.hidden = true; m.innerHTML = ''; ctx.render(); };
    }));
    const file = el.querySelector('#nc-file');
    if (file) file.onchange = safe(async e => {
      const f = e.target.files[0]; if (!f) return;
      if (!el.querySelector('#nc-ok').checked) { e.target.value = ''; return toast('Coche d\'abord la case d\'accord'); }
      const data = await jpegFrom(f, 800); await api('/noel/photo', { data, consent: true }); toast('Photo envoyée', 'ok'); ctx.render();
    });
    const del = el.querySelector('#nc-del');
    if (del) del.onclick = safe(async () => { if (!(await ctx.ask('Retirer ta photo ?', [], { text: 'Elle est effacée du serveur.', ok: 'Retirer' }))) return; await api('/noel/photo/delete', {}); toast('Photo retirée', 'ok'); ctx.render(); });
  }

  /** Animation du 25 décembre : le Petit Jésus descend du ciel, tout le monde reçoit sa carte. preview = true : pas de cadeau, seulement l'animation (administrateur). */
  function gift(ctx, opts = {}) {
    const { api, toast, safe } = ctx;
    return new Promise(done => {
      const o = document.createElement('div'); o.className = 'nc-gift' + (REDUCED() ? ' calm' : ''); o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Le 25 décembre');
      o.innerHTML = `<div class="nc-sky"></div><div class="nc-stars"></div><div class="nc-beam"></div>
        <div class="nc-descent"><div class="nc-halo"></div><div class="nc-gcard" id="nc-gcard"><div class="nc-img noimg"><span>25</span></div><b>Le Petit Jésus de l'entreprise</b></div></div>
        <div class="nc-copy"><small>25 DÉCEMBRE · 18 H 00</small><h2>Il descend du ciel.</h2><p>Il remet une carte à chaque employé, puis repart sans avoir émargé. Le service des ressources humaines a ouvert un dossier. Il n'a jamais été refermé.</p></div>
        <button class="ic-go nc-take" id="nc-take" hidden>Récupérer ma carte</button>`;
      document.body.append(o); document.body.classList.add('noscroll');
      const close = () => { o.remove(); document.body.classList.remove('noscroll'); done(); };
      const btn = o.querySelector('#nc-take');
      setTimeout(() => { btn.hidden = false; }, REDUCED() ? 300 : 4200);
      btn.onclick = safe(async () => {
        btn.disabled = true;
        if (opts.preview) { toast('Aperçu : aucune carte donnée', 'ok'); return close(); }
        try { const r = await api('/noel/gift', opts.day ? { day: opts.day } : {}); ctx.refreshMe?.();
          const c = r.card; o.querySelector('.nc-descent').innerHTML = `<div class="nc-gcard got">${c.image ? `<div class="nc-img" style="background-image:url('${esc(c.image)}')"></div>` : '<div class="nc-img noimg"><span>25</span></div>'}<b>${esc(c.title)}</b><i>Nouvelle · légendaire</i></div>`;
          o.querySelector('.nc-copy').innerHTML = '<small>CARTE AJOUTÉE À TA COLLECTION</small><h2>Merci, patron.</h2><p>Elle est à toi, comme celle de tous les autres. Ne la vends pas : elle ne vaut rien, par construction.</p>';
          btn.textContent = 'Fermer'; btn.disabled = false; btn.onclick = close;
        } catch (e) { toast(e.message); close(); }
      });
    });
  }

  /** Écran de l'administrateur : images de l'album, photos des joueurs et création de leurs cartes. */
  async function admin(box, ctx) {
    const { api, toast, safe } = ctx;
    const d = await api('/noel/photos-admin');
    const rows = d.photos.map(p => `<div class="nc-prow" data-uid="${p.uid}">
      <div class="nc-phead"><b>${esc(p.name)}</b><small>${new Date(p.ts).toLocaleString('fr-FR')}${p.card ? ' · carte créée' : ' · en attente'}</small></div>
      <div class="nc-pbody"><div class="nc-thumb" data-photo="${p.uid}">Photo…</div>
        <div class="nc-pform"><input type="text" class="nc-t" placeholder="Titre de l'article" maxlength="80" value="${esc(p.card?.title || '')}"><textarea class="nc-x" rows="5" placeholder="Article complet (collé depuis l'IA)">${esc(p.card?.extract || '')}</textarea>
        <div class="row"><label class="plain nc-file" style="flex:1">${p.card?.image ? 'Remplacer le dessin' : 'Dessin final (JPEG)'}<input type="file" accept="image/*" class="nc-art" hidden></label><button class="nc-save" style="flex:1">${p.card ? 'Mettre à jour' : 'Créer la carte'}</button></div>
        ${p.card ? '<button class="plain nc-rm" style="width:100%;margin-top:8px">Supprimer la carte</button>' : ''}</div></div></div>`).join('');
    box.innerHTML = `<div class="panel nc-admin"><h3 style="margin:0 0 6px">Noël : cartes</h3>
      <p class="mut" style="margin:0 0 10px;font-size:12.5px">Tout reste invisible pour les joueurs tant que l'événement est réservé à ton compte.</p>
      <div class="row"><button class="plain" id="nc-prev" style="flex:1">Voir l'animation du 25</button><button class="plain" id="nc-give" style="flex:1">Recevoir la carte du 25</button></div>
      <button class="plain" id="nc-reset" style="width:100%;margin-top:8px">Reprendre le cadeau du 25 (pour le revoir)</button>
      <h4 class="nc-h">Album de Noël : dessins des cartes</h4>
      <div class="nc-base">${d.base.map(b => `<label class="nc-b ${b.art ? 'ok' : ''}"><span>${esc(b.title)}</span><small>${b.art ? 'dessin en place' : 'sans dessin'}</small><input type="file" accept="image/*" data-art="${b.id}" hidden></label>`).join('')}</div>
      <h4 class="nc-h">Photos des joueurs (${d.photos.length})</h4>
      ${rows || '<p class="mut">Aucune photo pour l\'instant.</p>'}
      ${d.orphans.length ? `<p class="mut" style="font-size:12.5px">Cartes sans photo : ${d.orphans.map(o => esc(o.title)).join(', ')}.</p>` : ''}</div>`;
    box.querySelector('#nc-prev').onclick = () => gift(ctx, { preview: true });
    box.querySelector('#nc-give').onclick = safe(async () => { try { await gift(ctx, { day: 25 }); } finally { ctx.render?.(); } });
    box.querySelector('#nc-reset').onclick = safe(async () => { await api('/noel/gift/reset', {}); toast('Cadeau du 25 remis à zéro', 'ok'); });
    box.querySelectorAll('[data-art]').forEach(i => i.onchange = safe(async e => { const f = e.target.files[0]; if (!f) return; await api('/noel/card-art', { id: +i.dataset.art, data: await jpegFrom(f, 640) }); toast('Dessin enregistré', 'ok'); admin(box, ctx); }));
    box.querySelectorAll('[data-photo]').forEach(async th => {
      try { const r = await fetch('/api/noel/photo-img/' + th.dataset.photo, { headers: { Authorization: 'Bearer ' + ctx.token() } }); if (!r.ok) throw 0; const u = URL.createObjectURL(await r.blob()); th.innerHTML = `<a href="${u}" download="photo-${th.dataset.photo}.jpg"><img src="${u}" alt="Photo envoyée"></a>`; } catch { th.textContent = 'Photo introuvable'; }
    });
    box.querySelectorAll('.nc-prow').forEach(row => {
      const uid = +row.dataset.uid; let art;
      row.querySelector('.nc-art').onchange = safe(async e => { const f = e.target.files[0]; if (!f) return; art = await jpegFrom(f, 640); toast('Dessin prêt : clique sur Créer / Mettre à jour', 'ok'); });
      row.querySelector('.nc-save').onclick = safe(async () => { await api('/noel/pcard', { uid, title: row.querySelector('.nc-t').value, extract: row.querySelector('.nc-x').value, ...(art ? { data: art } : {}) }); toast('Carte enregistrée', 'ok'); admin(box, ctx); });
      const rm = row.querySelector('.nc-rm'); if (rm) rm.onclick = safe(async () => { if (!(await ctx.ask('Supprimer cette carte ?', [], { text: 'Elle disparaît des collections.', ok: 'Supprimer' }))) return; await api('/noel/pcard', { uid, remove: true }); toast('Carte supprimée', 'ok'); admin(box, ctx); });
    });
  }
  window.NoelCards = { mount, gift, admin, jpegFrom };
})();
