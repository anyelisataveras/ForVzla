/** Galerías de jornada — lectura para voluntarias (solo signed URLs). */
(function (global) {
  const MEDIA_BUCKET = 'jornada-media';
  const SIGN_SEC = 3600;

  function vol() {
    return global.CC_VOL;
  }

  function cred() {
    return vol().credParams();
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  async function signPath(path) {
    if (!path) return null;
    try {
      return await vol().storageSignUrl(MEDIA_BUCKET, path, SIGN_SEC);
    } catch (_e) {
      return null;
    }
  }

  async function signPaths(paths) {
    const out = {};
    await Promise.all((paths || []).map(async (p) => {
      if (!p) return;
      out[p] = await signPath(p);
    }));
    return out;
  }

  async function fetchResumen(jornadaIds) {
    const c = cred();
    if (!c || !jornadaIds?.length) return {};
    try {
      const data = await vol().rpc('resumen_media_jornadas_voluntario', {
        ...c,
        p_jornada_ids: jornadaIds,
      });
      if (!data?.ok) return {};
      const map = {};
      (data.jornadas || []).forEach((row) => {
        map[row.jornada_id] = { total: row.total || 0, previews: row.previews || [] };
      });
      return map;
    } catch (_e) {
      return {};
    }
  }

  async function fetchMedia(jornadaId) {
    const c = cred();
    if (!c || !jornadaId) return { total: 0, items: [] };
    const data = await vol().rpc('media_jornada_voluntario', {
      ...c,
      p_jornada_id: jornadaId,
    });
    if (!data?.ok) return { total: 0, items: [], error: data?.error };
    return { total: data.total || 0, items: data.items || [] };
  }

  function jornadaShowsGallery(j) {
    return !!j;
  }

  function thumbStripHtml(previews, total, urlsByPath) {
    if (!total || !previews?.length) return '';
    const cells = previews.slice(0, 3).map((p, i) => {
      const url = urlsByPath[p.storage_path];
      if (!url) return '';
      const isLast = i === 2 && total > 3;
      const vid = p.media_type === 'video' ? ' thumb-vid' : '';
      const inner = p.media_type === 'video'
        ? `<video src="${esc(url)}" muted playsinline preload="metadata"></video>`
        : `<img src="${esc(url)}" alt="" loading="lazy">`;
      return `<div class="thumb${vid}">${inner}${isLast ? `<span class="more">+${total - 3}</span>` : ''}</div>`;
    }).filter(Boolean).join('');
    if (!cells) return '';
    return `<div class="thumb-strip" aria-hidden="true">${cells}</div>`;
  }

  function badgesMedia(total) {
    if (!total) return '';
    return `<span class="badge photos">📷 ${total}</span>`;
  }

  function ctaForJornada(j, tab, mediaTotal) {
    if (mediaTotal > 0) return 'Ver galería →';
    const past = tab !== 'proximas';
    if (past || j.estado === 'realizada') return 'Ver resumen →';
    if (j.inscEstado === 'confirmada') return 'Ver detalle →';
    return 'Ver y confirmar →';
  }

  function mediaGridHtml(items, urlsById) {
    if (!items?.length) return '';
    return `<div class="media-grid">${items.map((m, idx) => {
      const url = urlsById[m.id];
      if (!url) return '';
      if (m.media_type === 'video') {
        return `<button type="button" class="media-item" data-media-idx="${idx}" aria-label="Ver video">
          <video src="${esc(url)}" muted playsinline preload="metadata"></video>
          <span class="media-vid-badge" aria-hidden="true">▶</span>
        </button>`;
      }
      return `<button type="button" class="media-item" data-media-idx="${idx}" aria-label="Ver foto">
        <img src="${esc(url)}" alt="Recuerdo de jornada" loading="lazy">
      </button>`;
    }).join('')}</div>`;
  }

  function emptyGalleryHtml(mode) {
    if (mode === 'upcoming') {
      return `<div class="empty-gal dim">
        <div class="ico">📷</div>
        Las fotos aparecen aquí después de la jornada, cuando la coordinadora las suba.
      </div>`;
    }
    return `<div class="empty-gal">
      <div class="ico">📷</div>
      Aún no hay fotos de esta jornada.<br>Vuelve pronto — la coordinadora las sube después del día.
    </div>`;
  }

  let lightboxEl = null;
  let lightboxItems = [];
  let lightboxUrls = [];
  let lightboxIdx = 0;
  let lightboxTitle = '';

  function closeLightbox() {
    if (lightboxEl) {
      lightboxEl.remove();
      lightboxEl = null;
    }
    document.body.style.overflow = '';
    document.removeEventListener('keydown', onLightboxKey);
  }

  function renderLightboxStage() {
    if (!lightboxEl) return;
    const item = lightboxItems[lightboxIdx];
    const url = lightboxUrls[lightboxIdx];
    const stage = lightboxEl.querySelector('.jm-lb-stage');
    const counter = lightboxEl.querySelector('.jm-lb-counter');
    if (!stage || !item) return;
    if (item.media_type === 'video') {
      stage.innerHTML = `<video class="jm-lb-media" src="${esc(url)}" controls playsinline autoplay></video>`;
    } else {
      stage.innerHTML = `<img class="jm-lb-media" src="${esc(url)}" alt="Recuerdo de jornada">`;
    }
    if (counter) {
      const kind = item.media_type === 'video' ? 'Video' : 'Foto';
      counter.textContent = `${lightboxIdx + 1} de ${lightboxItems.length} · ${kind}`;
    }
    lightboxEl.querySelector('.jm-lb-prev').style.visibility = lightboxIdx > 0 ? 'visible' : 'hidden';
    lightboxEl.querySelector('.jm-lb-next').style.visibility = lightboxIdx < lightboxItems.length - 1 ? 'visible' : 'hidden';
  }

  function openLightbox(items, urlsById, startIdx, title) {
    lightboxItems = items || [];
    lightboxUrls = lightboxItems.map((m) => urlsById[m.id]);
    if (!lightboxItems.length) return;
    lightboxIdx = Math.max(0, Math.min(startIdx || 0, lightboxItems.length - 1));
    lightboxTitle = title || 'Jornada';
    closeLightbox();
    lightboxEl = document.createElement('div');
    lightboxEl.className = 'jm-lightbox';
    lightboxEl.setAttribute('role', 'dialog');
    lightboxEl.setAttribute('aria-modal', 'true');
    lightboxEl.innerHTML = `
      <div class="jm-lb-top">
        <button type="button" class="jm-lb-close" aria-label="Cerrar">✕</button>
        <div class="jm-lb-head">
          <div class="jm-lb-title">${esc(lightboxTitle)}</div>
          <div class="jm-lb-counter"></div>
        </div>
        <span style="width:36px"></span>
      </div>
      <div class="jm-lb-stage-wrap">
        <button type="button" class="jm-lb-nav jm-lb-prev" aria-label="Anterior">‹</button>
        <div class="jm-lb-stage"></div>
        <button type="button" class="jm-lb-nav jm-lb-next" aria-label="Siguiente">›</button>
      </div>`;
    document.body.appendChild(lightboxEl);
    document.body.style.overflow = 'hidden';
    lightboxEl.querySelector('.jm-lb-close').onclick = closeLightbox;
    lightboxEl.querySelector('.jm-lb-prev').onclick = () => {
      if (lightboxIdx > 0) { lightboxIdx -= 1; renderLightboxStage(); }
    };
    lightboxEl.querySelector('.jm-lb-next').onclick = () => {
      if (lightboxIdx < lightboxItems.length - 1) { lightboxIdx += 1; renderLightboxStage(); }
    };
    lightboxEl.addEventListener('click', (e) => {
      if (e.target === lightboxEl) closeLightbox();
    });
    document.addEventListener('keydown', onLightboxKey);
    renderLightboxStage();
  }

  function onLightboxKey(e) {
    if (!lightboxEl) {
      document.removeEventListener('keydown', onLightboxKey);
      return;
    }
    if (e.key === 'Escape') closeLightbox();
    else if (e.key === 'ArrowLeft' && lightboxIdx > 0) { lightboxIdx -= 1; renderLightboxStage(); }
    else if (e.key === 'ArrowRight' && lightboxIdx < lightboxItems.length - 1) { lightboxIdx += 1; renderLightboxStage(); }
  }

  function bindMediaGrid(container, items, urlsById, title) {
    if (!container) return;
    container.querySelectorAll('[data-media-idx]').forEach((btn) => {
      btn.onclick = () => {
        const idx = parseInt(btn.dataset.mediaIdx, 10);
        openLightbox(items, urlsById, idx, title);
      };
    });
  }

  async function enrichJornadasWithMedia(rows) {
    const ids = (rows || []).map((j) => j.id);
    const resumen = await fetchResumen(ids);
    const allPaths = [];
    Object.values(resumen).forEach((r) => {
      (r.previews || []).forEach((p) => { if (p.storage_path) allPaths.push(p.storage_path); });
    });
    const urlsByPath = await signPaths([...new Set(allPaths)]);
    return rows.map((j) => {
      const m = resumen[j.id];
      return {
        ...j,
        mediaTotal: m?.total || 0,
        mediaPreviews: m?.previews || [],
        mediaUrls: urlsByPath,
      };
    });
  }

  function galleryMode(j) {
    const today = vol().todayIso();
    if (j.estado !== 'realizada' && j.fecha >= today) return 'upcoming';
    return 'past';
  }

  async function renderJornadaGalleryCard(containerEl, jornadaId, jornadaTitle, mode) {
    if (!containerEl) return;
    containerEl.innerHTML = '<p class="meta">Cargando recuerdos…</p>';
    const { total, items, error } = await fetchMedia(jornadaId);
    if (error) {
      containerEl.innerHTML = `<p class="meta">${esc(error)}</p>`;
      return;
    }
    if (!total) {
      containerEl.innerHTML = emptyGalleryHtml(mode);
      return;
    }
    const urlsById = {};
    await Promise.all(items.map(async (m) => {
      urlsById[m.id] = await signPath(m.storage_path);
    }));
    const sub = `${total} archivo${total === 1 ? '' : 's'} compartido${total === 1 ? '' : 's'} por el equipo.`;
    containerEl.innerHTML = `
      <p class="card-sub" style="margin-top:0">${esc(sub)}</p>
      ${mediaGridHtml(items, urlsById)}
      ${total > 9 ? `<button type="button" class="media-more" data-media-more>Ver las ${total} →</button>` : ''}`;
    bindMediaGrid(containerEl, items, urlsById, jornadaTitle);
    containerEl.querySelector('[data-media-more]')?.addEventListener('click', () => {
      openLightbox(items, urlsById, 0, jornadaTitle);
    });
  }

  global.CC_JORNADA_MEDIA = {
    MEDIA_BUCKET,
    esc,
    signPath,
    fetchResumen,
    fetchMedia,
    jornadaShowsGallery,
    thumbStripHtml,
    badgesMedia,
    ctaForJornada,
    galleryMode,
    mediaGridHtml,
    emptyGalleryHtml,
    openLightbox,
    closeLightbox,
    bindMediaGrid,
    enrichJornadasWithMedia,
    renderJornadaGalleryCard,
  };
})(window);
