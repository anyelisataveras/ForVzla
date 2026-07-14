/** Carnet de voluntaria — foto, generación y descarga (ARTIFACT-FOR-001). */
(function (global) {
  const MAX_BYTES = 5 * 1024 * 1024;
  const MIN_SHORT = 480;
  const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
  const POLL_MS = 2500;

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

  /** Recorte centrado 3:4; exporta JPEG. */
  async function cropPortrait3x4(file) {
    const err = validateFile(file);
    if (err) throw new Error(err);
    const img = await loadImageFromFile(file);
    const sw = img.naturalWidth || img.width;
    const sh = img.naturalHeight || img.height;
    if (!sw || !sh) throw new Error('Imagen inválida.');

    const targetRatio = 3 / 4;
    const srcRatio = sw / sh;
    let sx;
    let sy;
    let sWidth;
    let sHeight;
    if (srcRatio > targetRatio) {
      sHeight = sh;
      sWidth = sh * targetRatio;
      sx = (sw - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = sw;
      sHeight = sw / targetRatio;
      sx = 0;
      sy = (sh - sHeight) / 2;
    }

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
    ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, outW, outH);

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo procesar la foto.'))), 'image/jpeg', 0.92);
    });
    if (blob.size > MAX_BYTES) throw new Error('La foto procesada supera 5 MB. Elige otra más pequeña.');
    return { blob, mime: 'image/jpeg' };
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

  global.CC_CARNET = {
    MAX_BYTES,
    MIN_SHORT,
    ALLOWED,
    validateFile,
    cropPortrait3x4,
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
