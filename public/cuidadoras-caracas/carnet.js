/** Carnet de voluntaria — foto, generación y descarga (ARTIFACT-FOR-001). */
(function (global) {
  const MAX_BYTES = 5 * 1024 * 1024;
  const MIN_SHORT = 480;
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const POLL_MS = 2500;
  const CROP_RATIO = 3 / 4;
  const CROP_ZOOM_MIN = 1;
  const CROP_ZOOM_MAX = 3;

  function vol() {
    return global.CC_VOL;
  }

  function cred() {
    return global.CC_VOL.credParams();
  }

  function track(event, props) {
    if (global.posthog && typeof global.posthog.capture === 'function') {
      global.posthog.capture(event, Object.assign({ grupo: global.CC_VOL.GRUPO, app: 'cuidadoras_caracas' }, props || {}));
    }
  }

  function normalizeMime(file) {
    const t = (file.type || '').toLowerCase();
    if (ALLOWED.includes(t)) return t;
    const n = (file.name || '').toLowerCase();
    if (n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'image/jpeg';
    if (n.endsWith('.png')) return 'image/png';
    if (n.endsWith('.webp')) return 'image/webp';
    if (n.endsWith('.heic')) return 'image/heic';
    if (n.endsWith('.heif')) return 'image/heif';
    return t;
  }

  function validateFile(file) {
    if (!file) return 'Elige una foto.';
    if (file.size > MAX_BYTES) return 'La foto pesa más de 5 MB. Elige otra.';
    const mime = normalizeMime(file);
    if (!ALLOWED.includes(mime)) return 'Formato no soportado. Usa JPG, PNG o WebP.';
    return null;
  }

  function loadImageFromFile(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('No se pudo leer la imagen.'));
      };
      img.src = url;
    });
  }

  async function readExifOrientation(file) {
    try {
      const buf = await file.slice(0, 65536).arrayBuffer();
      const v = new DataView(buf);
      if (v.byteLength < 4 || v.getUint16(0, false) !== 0xffd8) return 1;
      let off = 2;
      while (off < v.byteLength - 4) {
        const marker = v.getUint16(off, false);
        off += 2;
        if (marker === 0xffe1) {
          const exif = off + 2;
          if (exif + 8 > v.byteLength || v.getUint32(exif, false) !== 0x45786966) return 1;
          const tiff = exif + 6;
          const le = v.getUint16(tiff, false) === 0x4949;
          const get16 = (o) => v.getUint16(o, le);
          const get32 = (o) => v.getUint32(o, le);
          const ifd = tiff + get32(tiff + 4);
          const n = get16(ifd);
          for (let i = 0; i < n; i++) {
            const e = ifd + 2 + i * 12;
            if (get16(e) === 0x0112) return get16(e + 8) || 1;
          }
          return 1;
        }
        if ((marker & 0xff00) !== 0xff00) break;
        off += v.getUint16(off, false);
      }
    } catch (_e) {}
    return 1;
  }

  function orientedCanvasFromImage(img, orientation) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const o = orientation || 1;
    if (o > 4 && o < 9) {
      canvas.width = h;
      canvas.height = w;
    } else {
      canvas.width = w;
      canvas.height = h;
    }
    switch (o) {
      case 2:
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        break;
      case 3:
        ctx.translate(w, h);
        ctx.rotate(Math.PI);
        break;
      case 4:
        ctx.translate(0, h);
        ctx.scale(1, -1);
        break;
      case 5:
        ctx.rotate(0.5 * Math.PI);
        ctx.scale(1, -1);
        break;
      case 6:
        ctx.rotate(0.5 * Math.PI);
        ctx.translate(0, -h);
        break;
      case 7:
        ctx.rotate(0.5 * Math.PI);
        ctx.translate(w, -h);
        ctx.scale(-1, 1);
        break;
      case 8:
        ctx.rotate(-0.5 * Math.PI);
        ctx.translate(-w, 0);
        break;
      default:
        break;
    }
    ctx.drawImage(img, 0, 0, w, h);
    return canvas;
  }

  async function loadOrientedSource(file) {
    const err = validateFile(file);
    if (err) throw new Error(err);
    const img = await loadImageFromFile(file);
    const orientation = await readExifOrientation(file);
    const canvas = orientedCanvasFromImage(img, orientation);
    return {
      canvas,
      width: canvas.width,
      height: canvas.height,
      fileName: file.name || 'foto',
    };
  }

  function autoCropRect(width, height) {
    const srcRatio = width / height;
    let sx;
    let sy;
    let sWidth;
    let sHeight;
    if (srcRatio > CROP_RATIO) {
      sHeight = height;
      sWidth = height * CROP_RATIO;
      sx = (width - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = width;
      sHeight = width / CROP_RATIO;
      sx = 0;
      sy = (height - sHeight) / 2;
    }
    return { sx, sy, sWidth, sHeight };
  }

  async function exportCropRegion(source, sx, sy, sWidth, sHeight) {
    const shortSide = Math.min(sWidth, sHeight);
    let outW = Math.round(sWidth);
    let outH = Math.round(sHeight);
    if (shortSide < MIN_SHORT) {
      const scale = MIN_SHORT / shortSide;
      outW = Math.round(sWidth * scale);
      outH = Math.round(sHeight * scale);
    }
    const canvas = document.createElement('canvas');
    canvas.width = outW;
    canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(source.canvas, sx, sy, sWidth, sHeight, 0, 0, outW, outH);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto.'))), 'image/jpeg', 0.92);
    });
    if (blob.size > MAX_BYTES) throw new Error('La foto procesada supera 5 MB. Elige otra más pequeña.');
    return { blob, mime: 'image/jpeg' };
  }

  /** Recorte centrado 3:4; exporta JPEG. */
  async function cropPortrait3x4(file) {
    const source = await loadOrientedSource(file);
    const rect = autoCropRect(source.width, source.height);
    const out = await exportCropRegion(source, rect.sx, rect.sy, rect.sWidth, rect.sHeight);
    return Object.assign(out, { source, manual: false });
  }

  async function processPhotoFile(file) {
    const source = await loadOrientedSource(file);
    const rect = autoCropRect(source.width, source.height);
    const out = await exportCropRegion(source, rect.sx, rect.sy, rect.sWidth, rect.sHeight);
    const previewUrl = URL.createObjectURL(out.blob);
    return {
      blob: out.blob,
      mime: out.mime,
      source,
      previewUrl,
      manual: false,
      cropRect: rect,
    };
  }

  function ensureCropOverlayStyles() {
    if (document.getElementById('cc-photo-crop-styles')) return;
    const style = document.createElement('style');
    style.id = 'cc-photo-crop-styles';
    style.textContent =
      '.photo-frame-wrap{position:relative;flex-shrink:0;width:90px}' +
      '.photo-frame-wrap .photo-frame{width:100%}' +
      '.crop-fab{position:absolute;bottom:6px;right:6px;width:34px;height:34px;border-radius:50%;border:2px solid #fff;background:rgba(26,26,26,.72);color:#fff;font-size:15px;display:flex;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.35);font-family:inherit;padding:0;line-height:1}' +
      '.crop-fab:active{transform:scale(.94);background:rgba(26,26,26,.9)}' +
      '.crop-fab:focus-visible{outline:2px solid #5A4AA0;outline-offset:2px}' +
      '.preview-callout{background:#EEEBF6;border:1px solid rgba(90,74,160,.25);border-radius:12px;padding:10px 12px;font-size:12px;color:#463A82;line-height:1.45;margin-top:10px}' +
      '.preview-callout b{display:block;font-size:13px;margin-bottom:2px;color:#1C1A19}' +
      '.cc-crop-overlay{position:fixed;inset:0;z-index:200;background:#1a1a1a;display:flex;flex-direction:column;min-height:0;touch-action:none}' +
      '.cc-crop-top{padding:14px 16px 10px;color:#fff;flex-shrink:0}' +
      '.cc-crop-top h2{font-size:17px;font-weight:800;margin-top:10px}' +
      '.cc-crop-top p{font-size:13px;opacity:.75;margin-top:4px;line-height:1.45}' +
      '.cc-crop-back{color:#fff;font-size:14px;font-weight:600;opacity:.85;background:none;border:none;padding:0;cursor:pointer;font-family:inherit}' +
      '.cc-crop-stage-wrap{flex:1;display:flex;align-items:center;justify-content:center;padding:8px 16px 12px;min-height:0}' +
      '.cc-crop-stage{position:relative;width:100%;max-width:320px;aspect-ratio:3/4;border-radius:4px;overflow:hidden;background:#111;box-shadow:0 0 0 2px rgba(255,255,255,.9),0 0 0 9999px rgba(0,0,0,.55);cursor:grab}' +
      '.cc-crop-stage:active{cursor:grabbing}' +
      '.cc-crop-stage canvas{width:100%;height:100%;display:block;touch-action:none}' +
      '.cc-crop-hint{text-align:center;font-size:12px;color:rgba(255,255,255,.65);padding:0 16px 8px;line-height:1.45}' +
      '.cc-crop-controls{padding:12px 16px 20px;flex-shrink:0;background:rgba(0,0,0,.35)}' +
      '.cc-crop-zoom{display:flex;align-items:center;gap:12px;margin-bottom:12px}' +
      '.cc-crop-zoom-btn{width:44px;height:44px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.08);color:#fff;font-size:22px;font-weight:700;cursor:pointer;font-family:inherit;flex-shrink:0}' +
      '.cc-crop-zoom-btn:active{background:rgba(255,255,255,.18)}' +
      '.cc-crop-zoom-track{flex:1;height:6px;background:rgba(255,255,255,.2);border-radius:999px;position:relative}' +
      '.cc-crop-zoom-fill{position:absolute;left:0;top:0;height:100%;background:#fff;border-radius:999px}' +
      '.cc-crop-actions{display:flex;gap:10px}' +
      '.cc-crop-actions .btn{margin-top:0;flex:1}' +
      '.cc-crop-actions .btn-ghost{background:transparent;border:1px solid rgba(255,255,255,.35);color:#fff}';
    document.head.appendChild(style);
  }

  function cropViewFromRect(source, rect, frameW, frameH) {
    const minCover = Math.max(frameW / source.width, frameH / source.height);
    const displayScale = frameW / rect.sWidth;
    const zoom = Math.max(CROP_ZOOM_MIN, Math.min(CROP_ZOOM_MAX, displayScale / minCover));
    const scale = minCover * zoom;
    const panX = frameW / 2 - (rect.sx + rect.sWidth / 2) * scale;
    const panY = frameH / 2 - (rect.sy + rect.sHeight / 2) * scale;
    return { panX, panY, zoom, scale };
  }

  function cropRectFromView(source, frameW, frameH, panX, panY, zoom) {
    const minCover = Math.max(frameW / source.width, frameH / source.height);
    const scale = minCover * zoom;
    const imgLeft = frameW / 2 + panX - (source.width * scale) / 2;
    const imgTop = frameH / 2 + panY - (source.height * scale) / 2;
    let sx = (0 - imgLeft) / scale;
    let sy = (0 - imgTop) / scale;
    let sWidth = frameW / scale;
    let sHeight = frameH / scale;
    if (sx < 0) {
      sWidth += sx;
      sx = 0;
    }
    if (sy < 0) {
      sHeight += sy;
      sy = 0;
    }
    if (sx + sWidth > source.width) sWidth = source.width - sx;
    if (sy + sHeight > source.height) sHeight = source.height - sy;
    return { sx, sy, sWidth, sHeight };
  }

  function clampCropPan(source, frameW, frameH, panX, panY, zoom) {
    const minCover = Math.max(frameW / source.width, frameH / source.height);
    const scale = minCover * zoom;
    const dw = source.width * scale;
    const dh = source.height * scale;
    const maxPanX = Math.max(0, (dw - frameW) / 2);
    const maxPanY = Math.max(0, (dh - frameH) / 2);
    return {
      panX: Math.max(-maxPanX, Math.min(maxPanX, panX)),
      panY: Math.max(-maxPanY, Math.min(maxPanY, panY)),
    };
  }

  function drawCropPreview(ctx, source, frameW, frameH, panX, panY, zoom) {
    ctx.clearRect(0, 0, frameW, frameH);
    const minCover = Math.max(frameW / source.width, frameH / source.height);
    const scale = minCover * zoom;
    const dw = source.width * scale;
    const dh = source.height * scale;
    const dx = frameW / 2 + panX - dw / 2;
    const dy = frameH / 2 + panY - dh / 2;
    ctx.drawImage(source.canvas, dx, dy, dw, dh);
  }

  /** Editor pantalla completa: pan + zoom sobre marco 3:4 fijo. */
  function openPhotoCropper(source, initialRect) {
    ensureCropOverlayStyles();
    const rect = initialRect || autoCropRect(source.width, source.height);
    return new Promise((resolve, reject) => {
      const overlay = document.createElement('div');
      overlay.className = 'cc-crop-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Ajustar recorte');
      overlay.innerHTML =
        '<div class="cc-crop-top">' +
        '<button type="button" class="cc-crop-back" id="ccCropBack">← Volver</button>' +
        '<h2>Ajustar recorte</h2>' +
        '<p>Encuadra tu rostro dentro del marco. Arrastra o usa + y − para acercar.</p>' +
        '</div>' +
        '<div class="cc-crop-stage-wrap"><div class="cc-crop-stage" id="ccCropStage"><canvas id="ccCropCanvas"></canvas></div></div>' +
        '<p class="cc-crop-hint">Marco fijo 3:4 — igual que en el carnet impreso</p>' +
        '<div class="cc-crop-controls">' +
        '<div class="cc-crop-zoom">' +
        '<button type="button" class="cc-crop-zoom-btn" id="ccCropZoomOut" aria-label="Alejar">−</button>' +
        '<div class="cc-crop-zoom-track" aria-hidden="true"><div class="cc-crop-zoom-fill" id="ccCropZoomFill"></div></div>' +
        '<button type="button" class="cc-crop-zoom-btn" id="ccCropZoomIn" aria-label="Acercar">+</button>' +
        '</div>' +
        '<div class="cc-crop-actions">' +
        '<button type="button" class="btn btn-ghost" id="ccCropCancel">Cancelar</button>' +
        '<button type="button" class="btn btn-grn" id="ccCropDone">Listo</button>' +
        '</div></div>';

      const stage = overlay.querySelector('#ccCropStage');
      const canvas = overlay.querySelector('#ccCropCanvas');
      const ctx = canvas.getContext('2d');
      const zoomFill = overlay.querySelector('#ccCropZoomFill');
      let frameW = 0;
      let frameH = 0;
      let panX = 0;
      let panY = 0;
      let zoom = 1;
      let dragging = false;
      let dragX = 0;
      let dragY = 0;
      let pinchDist = 0;
      let pinchZoom = 1;
      let closed = false;
      let viewInitialized = false;

      function updateZoomUi() {
        const pct = ((zoom - CROP_ZOOM_MIN) / (CROP_ZOOM_MAX - CROP_ZOOM_MIN)) * 100;
        zoomFill.style.width = Math.max(0, Math.min(100, pct)) + '%';
      }

      function layout() {
        const r = stage.getBoundingClientRect();
        const dpr = Math.min(global.devicePixelRatio || 1, 2);
        frameW = Math.max(1, Math.round(r.width));
        frameH = Math.max(1, Math.round(r.height));
        canvas.width = Math.round(frameW * dpr);
        canvas.height = Math.round(frameH * dpr);
        canvas.style.width = frameW + 'px';
        canvas.style.height = frameH + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (!viewInitialized) {
          const view = cropViewFromRect(source, rect, frameW, frameH);
          panX = view.panX;
          panY = view.panY;
          zoom = view.zoom;
          viewInitialized = true;
          updateZoomUi();
        }
        paint();
      }

      function paint() {
        drawCropPreview(ctx, source, frameW, frameH, panX, panY, zoom);
      }

      function setZoom(next) {
        zoom = Math.max(CROP_ZOOM_MIN, Math.min(CROP_ZOOM_MAX, next));
        const clamped = clampCropPan(source, frameW, frameH, panX, panY, zoom);
        panX = clamped.panX;
        panY = clamped.panY;
        updateZoomUi();
        paint();
      }

      function finish(result) {
        if (closed) return;
        closed = true;
        global.removeEventListener('resize', onResize);
        overlay.remove();
        if (result === null) reject(new Error('cancelled'));
        else resolve(result);
      }

      function onResize() {
        layout();
      }

      overlay.querySelector('#ccCropBack').onclick = () => finish(null);
      overlay.querySelector('#ccCropCancel').onclick = () => finish(null);
      overlay.querySelector('#ccCropZoomOut').onclick = () => setZoom(zoom - 0.15);
      overlay.querySelector('#ccCropZoomIn').onclick = () => setZoom(zoom + 0.15);
      overlay.querySelector('#ccCropDone').onclick = async () => {
        try {
          const crop = cropRectFromView(source, frameW, frameH, panX, panY, zoom);
          const out = await exportCropRegion(source, crop.sx, crop.sy, crop.sWidth, crop.sHeight);
          finish({
            blob: out.blob,
            mime: out.mime,
            manual: true,
            cropRect: crop,
            previewUrl: URL.createObjectURL(out.blob),
          });
        } catch (e) {
          finish(null);
          reject(e);
        }
      };

      stage.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'touch' && stage._touchCount > 1) return;
        dragging = true;
        dragX = e.clientX - panX;
        dragY = e.clientY - panY;
        stage.setPointerCapture(e.pointerId);
      });
      stage.addEventListener('pointermove', (e) => {
        if (!dragging) return;
        const clamped = clampCropPan(source, frameW, frameH, e.clientX - dragX, e.clientY - dragY, zoom);
        panX = clamped.panX;
        panY = clamped.panY;
        paint();
      });
      stage.addEventListener('pointerup', () => {
        dragging = false;
      });
      stage.addEventListener('pointercancel', () => {
        dragging = false;
      });

      stage._touchCount = 0;
      stage.addEventListener(
        'touchstart',
        (e) => {
          stage._touchCount = e.touches.length;
          if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            pinchDist = Math.hypot(dx, dy);
            pinchZoom = zoom;
            dragging = false;
          }
        },
        { passive: true }
      );
      stage.addEventListener(
        'touchmove',
        (e) => {
          if (e.touches.length !== 2 || !pinchDist) return;
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const dist = Math.hypot(dx, dy);
          setZoom(pinchZoom * (dist / pinchDist));
        },
        { passive: true }
      );
      stage.addEventListener(
        'touchend',
        () => {
          stage._touchCount = 0;
          pinchDist = 0;
        },
        { passive: true }
      );

      document.body.appendChild(overlay);
      requestAnimationFrame(() => {
        layout();
        global.addEventListener('resize', onResize);
      });
    });
  }

  function revokePreviewUrl(url) {
    if (url) URL.revokeObjectURL(url);
  }

  async function uploadFoto(blob, mime) {
    const c = cred();
    if (!c) throw new Error('Sesión requerida');
    const m = mime || 'image/jpeg';
    const prep = await vol().rpc('preparar_subida_foto_voluntario', {
      ...c,
      p_mime: m,
    });
    if (!prep?.ok) throw new Error(prep?.error || 'No se pudo preparar la subida');

    await vol().storageUpload('voluntario-fotos', prep.storage_path, blob, m);

    const conf = await vol().rpc('confirmar_foto_voluntario', {
      ...c,
      p_storage_path: prep.storage_path,
    });
    if (!conf?.ok) throw new Error(conf?.error || 'No se pudo confirmar la foto');

    if (conf.old_storage_path) {
      try {
        await vol().storageRemove('voluntario-fotos', [conf.old_storage_path]);
      } catch (_e) {}
    }
    return conf;
  }

  async function disponible() {
    const c = cred();
    return vol().rpc('carnet_disponible', c || { p_grupo: vol().GRUPO });
  }

  async function solicitar(regenerar) {
    const c = cred();
    const data = await vol().rpc('solicitar_carnet', { ...c, p_regenerar: !!regenerar });
    if (!data?.ok) throw Object.assign(new Error(data?.error || 'No se pudo solicitar el carnet'), { data });
    track('carnet_generate_started', { regenerar: !!regenerar, job_id: data.job_id });
    return data;
  }

  async function invokeRender(jobId) {
    try {
      return await vol().functionsInvoke('render-carnet', jobId ? { job_id: jobId } : {});
    } catch (e) {
      console.warn('render-carnet invoke:', e.message);
      return null;
    }
  }

  async function estado(jobId) {
    const c = cred();
    return vol().rpc('estado_carnet', { ...c, p_job_id: jobId || null });
  }

  async function signedUrl(bucket, path, seconds) {
    return vol().storageSignUrl(bucket, path, seconds || 300);
  }

  async function fotoPreviewUrl() {
    const c = cred();
    const data = await vol().rpc('url_foto_voluntario', c);
    if (!data?.ok || !data?.storage_path) return null;
    return vol().storageFetchBlob('voluntario-fotos', data.storage_path, 300);
  }

  async function urlDescarga() {
    const c = cred();
    const data = await vol().rpc('url_descarga_carnet', c);
    if (!data?.ok) throw new Error(data?.error || 'Sin carnet listo');
    const url = await signedUrl('carnet-generados', data.storage_path, 300);
    return { url, filename: data.filename || 'carnet.pdf', storage_path: data.storage_path };
  }

  async function carnetPreviewUrl() {
    const c = cred();
    const data = await vol().rpc('url_descarga_carnet', c);
    if (!data?.ok || !data?.storage_path) throw new Error(data?.error || 'Sin carnet listo');
    return vol().storageFetchBlob('carnet-generados', data.storage_path, 300);
  }

  const PDF_JS_VERSION = '3.11.174';
  const PDF_WORKER_SRC =
    'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDF_JS_VERSION + '/build/pdf.worker.min.js';
  let pdfWorkerReady = false;

  function ensurePdfJs() {
    const pdfjs = global.pdfjsLib;
    if (!pdfjs) throw new Error('No se pudo cargar el visor PDF.');
    if (!pdfWorkerReady) {
      pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_SRC;
      pdfWorkerReady = true;
    }
    return pdfjs;
  }

  /** Renderiza la 1ª página del PDF en un canvas dentro del contenedor (sin iframe). */
  async function mountPdfPreview(containerEl, blobUrl) {
    if (!containerEl || !blobUrl) return;
    const pdfjs = ensurePdfJs();
    const loadingTask = pdfjs.getDocument(blobUrl);
    const pdf = await loadingTask.promise;
    try {
      const page = await pdf.getPage(1);
      const baseViewport = page.getViewport({ scale: 1 });
      const maxWidth = containerEl.clientWidth || Math.min(global.innerWidth - 68, 520);
      const displayScale = maxWidth / baseViewport.width;
      const viewport = page.getViewport({ scale: displayScale });
      const outputScale = Math.min(global.devicePixelRatio || 1, 2);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { alpha: false });
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = '100%';
      canvas.style.height = 'auto';
      canvas.style.display = 'block';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', 'Vista previa del carnet');

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
      await page.render({ canvasContext: ctx, viewport, transform }).promise;

      containerEl.innerHTML = '';
      containerEl.appendChild(canvas);
    } finally {
      await pdf.destroy();
    }
  }

  async function downloadPdf(numeroVoluntaria) {
    const c = cred();
    const data = await vol().rpc('url_descarga_carnet', c);
    if (!data?.ok) throw new Error(data?.error || 'Sin carnet listo');
    const fn = numeroVoluntaria
      ? 'carnet-cuidadoras-' + numeroVoluntaria + '.pdf'
      : (data.filename || 'carnet.pdf');
    track('carnet_download', {});
    let blobUrl = null;
    try {
      blobUrl = await vol().storageFetchBlob('carnet-generados', data.storage_path, 300);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fn;
      a.rel = 'noopener';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
  }

  function procMessage(elapsedMs) {
    if (elapsedMs >= 90000) {
      return 'Está tardando más de lo usual. Puedes volver a Mi cuenta — tu carnet seguirá preparándose.';
    }
    if (elapsedMs >= 15000) return 'Sigue preparándose… casi listo.';
    return 'Preparando tu carnet…';
  }

  async function pollUntilReady(jobId, onTick) {
    const t0 = Date.now();
    for (;;) {
      const st = await estado(jobId);
      if (onTick) onTick(st, Date.now() - t0);
      if (st?.status === 'ready') {
        track('carnet_generate_complete', { job_id: jobId });
        return st;
      }
      if (st?.status === 'failed') {
        throw new Error(st.error || 'No se pudo generar el carnet');
      }
      await new Promise((r) => setTimeout(r, POLL_MS));
    }
  }

  async function generateAndWait(regenerar, onTick) {
    const req = await solicitar(regenerar);
    await invokeRender(req.job_id);
    return pollUntilReady(req.job_id, onTick);
  }

  ensureCropOverlayStyles();

  global.CC_CARNET = {
    MAX_BYTES,
    MIN_SHORT,
    ALLOWED,
    validateFile,
    cropPortrait3x4,
    processPhotoFile,
    openPhotoCropper,
    revokePreviewUrl,
    uploadFoto,
    disponible,
    solicitar,
    invokeRender,
    estado,
    fotoPreviewUrl,
    carnetPreviewUrl,
    mountPdfPreview,
    urlDescarga,
    downloadPdf,
    procMessage,
    pollUntilReady,
    generateAndWait,
    track,
  };
})(window);
