/* Panel coordinadoras — jornadas (Sprint 1). Requiere GRUPO, db, esc, toast, brigCat, session del scope coord. */
(function () {
  let jornadas = [], sitios = [], jTab = 'proximas', jBrigFilter = '', jDetailId = null, jEditId = null, jEditTareas = [], jEditMateriales = [], inventarioCat = [], jCloseId = null, jCloseRows = [], jStats = {}, jMediaCounts = {};
  let asignarJornadaId = null, asignarVoluntarias = [], asignarInscripciones = [];
  let jornadasUiInited = false, jornadaSaving = false;

  const COBERTURAS = ['ninguna', 'baja', 'ok', 'sobra'];
  const MEDIA_BUCKET = 'jornada-media';
  const MAX_FOTO_BYTES = 15 * 1024 * 1024;
  const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

  function mediaTypeFromMime(mime) {
    return String(mime || '').startsWith('video/') ? 'video' : 'foto';
  }

  function extFromMime(mime) {
    const map = {
      'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
      'image/heic': 'heic', 'image/heif': 'heif',
      'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm',
    };
    return map[mime] || 'bin';
  }

  async function signedMediaUrl(path) {
    const { data, error } = await db.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
    if (error) return null;
    return data.signedUrl;
  }

  async function uploadJornadaFiles(jornadaId, fileList) {
    const files = [...fileList];
    if (!files.length) return 0;
    let ok = 0;
    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const max = isVideo ? MAX_VIDEO_BYTES : MAX_FOTO_BYTES;
      if (file.size > max) {
        toast(`${file.name}: muy grande (máx ${isVideo ? 50 : 15} MB)`);
        continue;
      }
      if (!/^(image|video)\//.test(file.type)) {
        toast(`${file.name}: tipo no permitido`);
        continue;
      }
      const path = `${GRUPO}/${jornadaId}/${crypto.randomUUID()}.${extFromMime(file.type)}`;
      const { error: upErr } = await db.storage.from(MEDIA_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) { toast(upErr.message); continue; }
      const { error: dbErr } = await db.from('jornada_media').insert({
        jornada_id: jornadaId,
        storage_path: path,
        mime_type: file.type,
        media_type: mediaTypeFromMime(file.type),
        subido_por: session?.user?.email || null,
      });
      if (dbErr) {
        await db.storage.from(MEDIA_BUCKET).remove([path]);
        toast(dbErr.message);
        continue;
      }
      ok++;
    }
    if (ok) toast(ok === 1 ? '1 archivo subido' : `${ok} archivos subidos`);
    return ok;
  }

  async function loadJMediaCounts(ids) {
    const next = {};
    (ids || []).forEach((id) => { next[id] = 0; });
    if (!ids?.length) { jMediaCounts = next; return; }
    const { data } = await db.from('jornada_media').select('jornada_id').in('jornada_id', ids);
    (data || []).forEach((m) => { next[m.jornada_id] = (next[m.jornada_id] || 0) + 1; });
    jMediaCounts = next;
  }

  async function refreshMediaViews(jornadaId) {
    await loadJMediaCounts(jornadas.map((j) => j.id));
    renderJornadaList();
    const sheet = document.getElementById('jornada-media-sheet');
    if (sheet && !sheet.hidden && document.getElementById('jm-jornada')?.value === jornadaId) {
      await renderMediaSheetBody();
    }
    if (jDetailId === jornadaId && jDetailTab === 'resumen') await renderJornadaDetail();
  }

  async function deleteJornadaMedia(item) {
    if (!confirm('¿Quitar este archivo del registro?')) return;
    const { error: stErr } = await db.storage.from(MEDIA_BUCKET).remove([item.storage_path]);
    if (stErr) { toast(stErr.message); return; }
    const { error } = await db.from('jornada_media').delete().eq('id', item.id);
    if (error) { toast(error.message); return; }
    toast('Archivo eliminado');
    await refreshMediaViews(item.jornada_id);
  }

  function renderMediaGrid(items, urlsById, jornadaId) {
    if (!items.length) return '<div class="empty">Aún no hay fotos ni videos.</div>';
    return `<div class="media-grid">${items.map((m) => {
      const url = urlsById[m.id];
      if (!url) return '';
      const del = `CC_JORN.deleteMediaItem('${m.id}')`;
      if (m.media_type === 'video') {
        return `<div class="media-item" data-media-id="${m.id}">
          <video src="${esc(url)}" controls playsinline preload="metadata"></video>
          <span class="media-vid-badge" aria-hidden="true">▶</span>
          <button type="button" class="media-del" onclick="${del}" title="Quitar">×</button>
        </div>`;
      }
      return `<div class="media-item" data-media-id="${m.id}">
        <img src="${esc(url)}" alt="Registro jornada" loading="lazy">
        <button type="button" class="media-del" onclick="${del}" title="Quitar">×</button>
      </div>`;
    }).join('')}</div>`;
  }

  let mediaCache = {};

  async function renderMediaContent(jornadaId, containerEl, inputId) {
    if (!containerEl) return;
    containerEl.innerHTML = '<div class="empty">Cargando registro…</div>';
    const { data: items, error } = await db.from('jornada_media')
      .select('id,jornada_id,storage_path,mime_type,media_type,subido_por,created_at')
      .eq('jornada_id', jornadaId)
      .order('created_at', { ascending: false });
    if (error) {
      containerEl.innerHTML = `<div class="empty">${esc(error.message)}</div>`;
      return;
    }
    const rows = items || [];
    mediaCache = {};
    rows.forEach((m) => { mediaCache[m.id] = m; });
    const urlsById = {};
    await Promise.all(rows.map(async (m) => {
      urlsById[m.id] = await signedMediaUrl(m.storage_path);
    }));
    containerEl.innerHTML = `
      <label class="media-upload-btn">
        <input type="file" id="${inputId}" accept="image/*,video/*" multiple capture="environment" hidden>
        📷 Subir fotos o videos
      </label>
      <p class="meta" style="margin-top:6px;margin-bottom:4px">Máx. 15 MB fotos · 50 MB videos</p>
      <p class="count" style="margin-bottom:8px">${rows.length} archivo${rows.length === 1 ? '' : 's'}</p>
      <div>${renderMediaGrid(rows, urlsById, jornadaId)}</div>`;
    document.getElementById(inputId)?.addEventListener('change', async (e) => {
      const input = e.target;
      if (!input.files?.length) return;
      input.disabled = true;
      const n = await uploadJornadaFiles(jornadaId, input.files);
      input.value = '';
      input.disabled = false;
      if (n) await refreshMediaViews(jornadaId);
    });
  }

  function jornadaMediaLabel(j) {
    const lugar = j.sitio_nombre || j.sitio_zona || j.titulo || 'Sin sitio';
    return `${fmtDateCard(j.fecha)} · ${lugar}`;
  }

  function populateJornadaMediaSelect() {
    const sel = document.getElementById('jm-jornada');
    if (!sel) return;
    const sorted = [...jornadas].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.hora_salida || '').localeCompare(a.hora_salida || ''));
    sel.innerHTML = sorted.map((j) =>
      `<option value="${j.id}">${esc(jornadaMediaLabel(j))} · ${esc(j.titulo || 'Jornada')} (${esc(j.estado)})</option>`
    ).join('');
  }

  async function renderMediaSheetBody() {
    const jornadaId = document.getElementById('jm-jornada')?.value;
    const body = document.getElementById('jm-body');
    if (!jornadaId || !body) return;
    await renderMediaContent(jornadaId, body, 'jm-media-input');
  }

  async function openJornadaMedia(jornadaId) {
    if (!jornadas.length) { toast('No hay jornadas'); return; }
    populateJornadaMediaSelect();
    const sel = document.getElementById('jm-jornada');
    if (jornadaId && jornadas.some((j) => j.id === jornadaId)) sel.value = jornadaId;
    else if (!sel.value) sel.value = jornadas[0].id;
    document.getElementById('jornada-media-sheet').hidden = false;
    await renderMediaSheetBody();
  }

  async function renderJornadaResumen(j, body) {
    body.innerHTML = '<div class="empty">Cargando detalle…</div>';
    const st = jStats[j.id] || { confirmadas: 0, pidenRide: 0, cupos: 0, sinDueno: 0 };
    const link = jornadaLink(j);
    const wa = waJornadaText(j);
    const [{ data: mats }, { data: tareas }] = await Promise.all([
      db.from('necesidades_jornada').select('*').eq('jornada_id', j.id).order('orden').order('created_at'),
      db.from('tareas_jornada').select('id,titulo,voluntario_id,voluntarios(nombre)').eq('jornada_id', j.id),
    ]);
    const items = mats || [];
    const taskRows = tareas || [];
    const estadoLabel = { borrador: 'Borrador', abierta: 'Abierta', llena: 'Llena', realizada: 'Realizada', cancelada: 'Cancelada' }[j.estado] || j.estado;
    const brigHtml = (j.brigadas || []).map((s) => {
      const b = brigCat.find((x) => x.slug === s);
      return `<span class="btag">${esc(b?.icono || '•')} ${esc((b?.nombre || s).replace(/^Brigada de\s*/i, ''))}</span>`;
    }).join('') || '<span class="meta">—</span>';
    const horarioLines = [
      j.hora_encuentro ? `Encuentro ${fmtTime(j.hora_encuentro)}${j.punto_encuentro ? ' · ' + esc(j.punto_encuentro) : ''}` : (j.punto_encuentro ? `Encuentro: ${esc(j.punto_encuentro)}` : ''),
      j.hora_salida ? `Salida ${fmtTime(j.hora_salida)}` : '',
      j.hora_regreso_aprox ? `Regreso ~${fmtTime(j.hora_regreso_aprox)}` : '',
    ].filter(Boolean).join('<br>') || '—';

    body.innerHTML = `
      <div class="jd-hdr">
        <span class="badge-state">${esc(estadoLabel)}</span>
        <div class="meta" style="margin-top:8px"><b>${fmtDateCard(j.fecha)}</b> · ${esc(j.sitio_nombre || j.sitio_zona || 'Sin sitio')}</div>
      </div>
      <div class="kpi-grid">
        <div class="kpi"><b>${st.confirmadas}</b><span>confirmadas</span></div>
        <div class="kpi"><b>${st.pidenRide}</b><span>piden ride</span></div>
        <div class="kpi"><b>${st.sinDueno}</b><span>tareas s/dueño</span></div>
      </div>
      <div class="sect">
        <div class="sect-t">Horario y lugar</div>
        <div class="vcard-meta">📍 <b>${esc(j.sitio_nombre || '—')}</b>${j.sitio_zona ? ` · ${esc(j.sitio_zona)}` : ''}</div>
        <div class="vcard-meta" style="margin-top:6px">${horarioLines}</div>
      </div>
      <div class="sect">
        <div class="sect-t">Brigadas</div>
        <div class="btags">${brigHtml}</div>
      </div>
      ${j.descripcion ? `<div class="sect"><div class="sect-t">Misión</div><div class="jd-text">${esc(j.descripcion)}</div></div>` : ''}
      <div class="sect">
        <div class="sect-t">Vestimenta y llevar</div>
        <div class="vcard-meta">👕 ${esc(j.vestimenta || '—')}</div>
        <div class="vcard-meta" style="margin-top:4px">🎒 ${esc(j.llevar || '—')}</div>
      </div>
      <div class="sect">
        <div class="sect-t">Metas</div>
        <div class="vcard-meta">👩 ${st.confirmadas} / ${j.meta_voluntarias || '—'} voluntarias · 🚗 meta ${j.meta_vehiculos || '—'} vehículos</div>
      </div>
      ${j.notas_internas ? `<div class="sect"><div class="sect-t">Notas internas</div><div class="jd-text">${esc(j.notas_internas)}</div></div>` : ''}
      <div class="sect j-share">
        <div class="sect-t">Compartir</div>
        <div class="j-share-lbl">Link de inscripción</div>
        <div class="j-link-wrap">
          <div class="j-link">${esc(link)}</div>
          <button type="button" class="j-copy-btn" data-jd-copy-link aria-label="Copiar link" title="Copiar link">📋</button>
        </div>
        <div class="j-share-lbl">Mensaje para WhatsApp</div>
        <div class="j-wa-wrap">
          <div class="j-wa-preview">${esc(wa)}</div>
          <button type="button" class="j-copy-btn" data-jd-copy-wa aria-label="Copiar mensaje" title="Copiar mensaje">📋</button>
        </div>
      </div>
      <div class="sect">
        <div class="sect-t">Materiales (${items.length})</div>
        ${items.length ? items.map((m) => {
          const est = matEstado(m.cantidad_necesaria, m.cantidad_conseguida);
          return `<div class="vcard${est !== 'cubierta' ? ' warn' : ''}" style="margin-top:8px">
            <b>${esc(m.item_nombre)}</b>
            <div class="vcard-meta">${m.cantidad_conseguida} / ${m.cantidad_necesaria} · <span class="mat-est ${matEstadoClass(est)}">${matEstadoLabel(est)}</span></div>
          </div>`;
        }).join('') : '<p class="meta">Sin ítems en el checklist.</p>'}
      </div>
      <div class="sect">
        <div class="sect-t">Tareas (${taskRows.length})</div>
        ${taskRows.length ? taskRows.map((t) => {
          const sin = !t.voluntario_id;
          return `<div class="vcard${sin ? ' warn' : ''}" style="margin-top:8px">
            <b>${esc(t.titulo)}</b>
            <div class="vcard-meta">${sin ? '⚠️ Sin dueña' : '✅ ' + esc(t.voluntarios?.nombre)}</div>
          </div>`;
        }).join('') : '<p class="meta">Sin tareas asignadas.</p>'}
      </div>
      <div class="sect">
        <div class="sect-t">Fotos y videos</div>
        <div id="jd-media-wrap"></div>
      </div>
      <div class="vcard-actions" style="margin-top:12px">
        <button type="button" class="btn btn-s" data-jd-edit>Editar</button>
        ${['abierta', 'llena', 'realizada'].includes(j.estado) ? `<button type="button" class="btn btn-p" data-jd-asign>+ Agregar voluntarias</button>` : ''}
        ${['abierta', 'llena'].includes(j.estado) ? `<button type="button" class="btn btn-g" data-jd-close-j>Cerrar jornada</button>` : ''}
      </div>`;

    body.querySelector('[data-jd-copy-link]')?.addEventListener('click', () => copyLink(j.id));
    body.querySelector('[data-jd-copy-wa]')?.addEventListener('click', () => copyWa(j.id));
    body.querySelector('[data-jd-edit]')?.addEventListener('click', () => openJornadaForm(j.id));
    body.querySelector('[data-jd-asign]')?.addEventListener('click', () => openAsignarVoluntarias(j.id));
    body.querySelector('[data-jd-close-j]')?.addEventListener('click', () => openJornadaClose(j.id));
    await renderMediaContent(j.id, document.getElementById('jd-media-wrap'), 'jd-media-input');
  }

  async function deleteMediaItem(id) {
    const item = mediaCache[id];
    if (!item) return;
    await deleteJornadaMedia(item);
  }

  const BASE = location.origin + location.pathname.replace(/\/coord\/?$/, '');

  function fmtDate(d) {
    if (!d) return '';
    const p = d.split('-');
    const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return parseInt(p[2], 10) + ' ' + mes[parseInt(p[1], 10) - 1];
  }
  function fmtTime(t) { return t ? String(t).slice(0, 5) : ''; }
  function fmtDateCard(d){
    if(!d) return '';
    const dt=new Date(d+'T00:00:00');
    const ds=['Dom','Lun','Mar','Mie','Jue','Vie','Sab'];
    const ms=['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${ds[dt.getDay()]} ${dt.getDate()} ${ms[dt.getMonth()]}`;
  }

  function jornadaLink(j) {
    return `${BASE}/jornada?id=${j.id}`;
  }

  function waJornadaText(j) {
    const lugar = j.sitios?.nombre || j.sitio_nombre || j.titulo;
    const lines = [
      `🗓 *${j.titulo}*`,
      `📅 ${fmtDate(j.fecha)}${j.hora_salida ? ' · salida ' + fmtTime(j.hora_salida) : ''}`,
      j.punto_encuentro ? `📍 Encuentro: ${j.punto_encuentro}${j.hora_encuentro ? ' ' + fmtTime(j.hora_encuentro) : ''}` : '',
      `📍 ${lugar}`,
      j.descripcion ? `\n${j.descripcion}` : '',
      `\nConfirma aquí 👉 ${BASE}/jornada?id=${j.id}`,
    ];
    return lines.filter(Boolean).join('\n');
  }

  function isDraftId(id) {
    return String(id || '').startsWith('draft-');
  }

  function draftId() {
    return 'draft-' + crypto.randomUUID();
  }

  function showJornadaEditPanel() {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('on'));
    document.getElementById('panel-jornada-edit')?.classList.add('on');
    const title = jEditId ? 'Editar jornada' : 'Nueva jornada';
    const titleEl = document.getElementById('jf-title');
    if (titleEl) titleEl.textContent = title;
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = title;
    const actions = document.getElementById('page-actions');
    if (actions) actions.innerHTML = '';
    document.querySelectorAll('[data-tab]').forEach((b) => {
      if (b.closest('#side-nav') || b.closest('#bottom-nav')) b.classList.toggle('on', b.dataset.tab === 'jornadas');
    });
    window.scrollTo(0, 0);
  }

  function closeJornadaEditPanel() {
    jEditId = null;
    jEditTareas = [];
    jEditMateriales = [];
    if (typeof showTab === 'function') showTab('jornadas');
    else {
      document.getElementById('panel-jornada-edit')?.classList.remove('on');
      document.getElementById('panel-jornadas')?.classList.add('on');
    }
  }

  async function persistJfDrafts(jornadaId) {
    for (const t of jEditTareas) {
      const { error } = await db.from('tareas_jornada').insert({
        jornada_id: jornadaId,
        titulo: t.titulo,
        brigada_slug: t.brigada_slug || getJfBrigadas()[0] || null,
        cupos: t.cupos || 1,
        creada_por: session?.user?.email,
      });
      if (error) { toast(error.message); return false; }
    }
    for (const m of jEditMateriales) {
      const nec = m.cantidad_necesaria || 1;
      const cons = m.cantidad_conseguida || 0;
      const { error } = await db.from('necesidades_jornada').insert({
        jornada_id: jornadaId,
        item_nombre: m.item_nombre,
        cantidad_necesaria: nec,
        cantidad_conseguida: cons,
        estado: m.estado || matEstado(nec, cons),
        orden: m.orden ?? 0,
      });
      if (error) { toast(error.message); return false; }
    }
    return true;
  }

  async function loadInventarioCat() {
    const { data } = await db.from('items_inventario').select('nombre').eq('grupo', GRUPO).eq('activa', true).order('orden');
    inventarioCat = (data || []).map((x) => x.nombre);
    const dl = document.getElementById('jf-mat-datalist');
    if (dl) dl.innerHTML = inventarioCat.map((n) => `<option value="${esc(n)}"></option>`).join('');
  }

  function matEstado(nec, cons) {
    const n = Math.max(1, nec || 1);
    const c = Math.max(0, cons || 0);
    if (c >= n) return 'cubierta';
    if (c > 0) return 'parcial';
    return 'pendiente';
  }

  function matEstadoLabel(e) {
    return { pendiente: 'Pendiente', parcial: 'Parcial', cubierta: 'Cubierta' }[e] || e;
  }

  function matEstadoClass(e) {
    return { pendiente: 'pend', parcial: 'parcial', cub: 'cub', cubierta: 'cub' }[e] || 'pend';
  }

  async function loadJornadaMateriales(jornadaId) {
    const { data, error } = await db.from('necesidades_jornada').select('*').eq('jornada_id', jornadaId).order('orden').order('created_at');
    if (error && typeof toast === 'function') toast('Materiales: ' + error.message);
    jEditMateriales = data || [];
    renderJfMateriales(jornadaId);
  }

  function renderJfMateriales(jornadaId) {
    const box = document.getElementById('jf-materiales');
    if (!box) return;
    const rows = jEditMateriales.map((m) => {
      const est = matEstado(m.cantidad_necesaria, m.cantidad_conseguida);
      return `<div class="mat-row" data-mat-id="${m.id}">
        <input type="text" value="${esc(m.item_nombre)}" data-mat-nombre placeholder="Ítem" list="jf-mat-datalist">
        <input type="number" min="1" max="9999" value="${m.cantidad_necesaria}" data-mat-nec title="Necesaria">
        <input type="number" min="0" max="9999" value="${m.cantidad_conseguida}" data-mat-cons title="Conseguida">
        <span class="mat-est ${matEstadoClass(est)}">${matEstadoLabel(est)}</span>
        <button type="button" class="btn btn-s" data-mat-del style="padding:4px 6px;width:32px;min-width:32px;font-size:14px;margin:0" title="Quitar">×</button>
      </div>`;
    }).join('');
    const addRow = `<div class="mat-row mat-row-add">
      <input type="text" id="jm-new-nombre" list="jf-mat-datalist" placeholder="Nuevo ítem…" autocomplete="off">
      <input type="number" id="jm-new-nec" min="1" max="9999" value="1" title="Cantidad necesaria" inputmode="numeric">
      <span aria-hidden="true"></span>
      <span aria-hidden="true"></span>
      <button type="button" class="btn btn-p" id="jm-add-save" style="margin:0;padding:6px 8px;width:32px;min-width:32px;font-size:16px" title="Agregar ítem">+</button>
    </div>`;
    box.innerHTML = `<div class="task-box">
      <div style="margin-bottom:6px"><span style="font-size:11px;color:var(--txt3)">Ítem · Nec. · Cons.</span></div>
      ${rows || ''}
      ${addRow}
    </div>`;
    bindJfMaterialAdd(jornadaId);
    box.querySelectorAll('.mat-row:not(.mat-row-add)').forEach((row) => bindMatRow(row, jornadaId));
  }

  function bindMatRow(row, jornadaId) {
    const id = row.dataset.matId;
    const updateEstEl = (estado) => {
      const estEl = row.querySelector('.mat-est');
      if (estEl) {
        estEl.className = `mat-est ${matEstadoClass(estado)}`;
        estEl.textContent = matEstadoLabel(estado);
      }
    };
    const save = async () => {
      const nombre = row.querySelector('[data-mat-nombre]')?.value?.trim();
      const nec = parseInt(row.querySelector('[data-mat-nec]')?.value, 10) || 1;
      const cons = parseInt(row.querySelector('[data-mat-cons]')?.value, 10) || 0;
      if (!nombre) return;
      const estado = matEstado(nec, cons);
      if (isDraftId(id)) {
        const item = jEditMateriales.find((m) => m.id === id);
        if (item) {
          item.item_nombre = nombre;
          item.cantidad_necesaria = nec;
          item.cantidad_conseguida = cons;
          item.estado = estado;
        }
        updateEstEl(estado);
        return;
      }
      const { error } = await db.from('necesidades_jornada').update({
        item_nombre: nombre,
        cantidad_necesaria: nec,
        cantidad_conseguida: cons,
        estado,
      }).eq('id', id);
      if (error) { toast(error.message); return; }
      updateEstEl(estado);
    };
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', save);
      inp.addEventListener('blur', save);
    });
    row.querySelector('[data-mat-del]')?.addEventListener('click', async () => {
      const btn = row.querySelector('[data-mat-del]');
      if (btn?.dataset.confirm !== '1') {
        btn.dataset.confirm = '1';
        btn.textContent = '✓';
        btn.title = 'Toca otra vez para quitar';
        setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.textContent = '×'; btn.title = 'Quitar'; } }, 4000);
        return;
      }
      if (isDraftId(id)) {
        jEditMateriales = jEditMateriales.filter((m) => m.id !== id);
        toast('Ítem quitado');
        renderJfMateriales(jornadaId);
        return;
      }
      const { error } = await db.from('necesidades_jornada').delete().eq('id', id);
      if (error) { toast(error.message); return; }
      toast('Ítem quitado');
      loadJornadaMateriales(jornadaId);
    });
  }

  function bindJfMaterialAdd(jornadaId) {
    const nombreInp = document.getElementById('jm-new-nombre');
    const necInp = document.getElementById('jm-new-nec');
    const btn = document.getElementById('jm-add-save');
    if (!nombreInp || !necInp || !btn) return;
    const save = async () => {
      const nombre = nombreInp.value.trim();
      const nec = parseInt(necInp.value, 10) || 1;
      if (!nombre) { toast('Escribe el ítem'); nombreInp.focus(); return; }
      btn.disabled = true;
      if (jornadaId) {
        const { error } = await db.from('necesidades_jornada').insert({
          jornada_id: jornadaId,
          item_nombre: nombre,
          cantidad_necesaria: Math.max(1, nec),
          cantidad_conseguida: 0,
          estado: 'pendiente',
          orden: jEditMateriales.length,
        });
        btn.disabled = false;
        if (error) { toast(error.message); return; }
        toast('Ítem agregado');
        loadJornadaMateriales(jornadaId);
        return;
      }
      jEditMateriales.push({
        id: draftId(),
        item_nombre: nombre,
        cantidad_necesaria: Math.max(1, nec),
        cantidad_conseguida: 0,
        estado: 'pendiente',
        orden: jEditMateriales.length,
      });
      btn.disabled = false;
      nombreInp.value = '';
      necInp.value = '1';
      toast('Ítem agregado');
      renderJfMateriales(null);
    };
    btn.onclick = save;
    nombreInp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
    necInp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
  }

  function materialesWaText(j, items) {
    const lines = (items || []).map((m) => {
      const est = matEstado(m.cantidad_necesaria, m.cantidad_conseguida);
      const mark = est === 'cubierta' ? '✅' : est === 'parcial' ? '🟡' : '⬜';
      return `${mark} ${m.item_nombre}: ${m.cantidad_conseguida}/${m.cantidad_necesaria}`;
    });
    return ['📦 Materiales — ' + j.titulo, '', ...lines].join('\n');
  }

  async function loadSitios() {
    const { data, error } = await db.from('sitios').select('id,nombre,zona').eq('grupo', GRUPO).eq('activo', true).order('nombre');
    sitios = data || [];
    if (error && typeof toast === 'function') toast('Sitios: ' + error.message);
  }

  async function loadJStats(ids){
    jStats = {};
    if(!ids.length) return;
    const { data: insc } = await db.from('inscripciones').select('jornada_id,estado,necesita_transporte,ofrece_transporte,cupos_ofrecidos').in('jornada_id', ids);
    const { data: tasks } = await db.from('tareas_jornada').select('jornada_id,voluntario_id').in('jornada_id', ids);
    ids.forEach(id=>jStats[id]={confirmadas:0,pidenRide:0,cupos:0,sinDueno:0});
    (insc||[]).forEach(i=>{
      const m=jStats[i.jornada_id]|| (jStats[i.jornada_id]={confirmadas:0,pidenRide:0,cupos:0,sinDueno:0});
      if(i.estado==='confirmada'||i.estado==='asistio') m.confirmadas++;
      if((i.estado==='confirmada'||i.estado==='asistio')&&i.necesita_transporte) m.pidenRide++;
      if((i.estado==='confirmada'||i.estado==='asistio')&&i.ofrece_transporte) m.cupos += (i.cupos_ofrecidos||0);
    });
    (tasks||[]).forEach(t=>{ if(!t.voluntario_id) (jStats[t.jornada_id]||(jStats[t.jornada_id]={confirmadas:0,pidenRide:0,cupos:0,sinDueno:0})).sinDueno++; });
  }

  async function loadJornadas() {
    const el = document.getElementById('j-list');
    if (el) el.innerHTML = '<div class="empty">Cargando…</div>';
    let data, error;
    ({ data, error } = await db.rpc('listar_jornadas_coord', { p_grupo: GRUPO }));
    if (error) {
      ({ data, error } = await db.from('jornadas').select('*').eq('grupo', GRUPO).order('fecha', { ascending: false }));
    }
    if (error) { if (el) el.innerHTML = `<div class="empty">Error: ${esc(error.message)}</div>`; return; }
    const rows = data || [];
    if (!rows.length) {
      if (el) el.innerHTML = '<div class="empty">No hay jornadas todavía. Usa <b>+ Nueva</b> o pide al equipo que corra el seed en Supabase.</div>';
      jornadas = [];
      renderProximaJornada();
      return;
    }
    jornadas = rows.map(j => ({
      ...j,
      sitio_nombre: j.sitio_nombre || j.sitios?.nombre,
      sitio_zona: j.sitio_zona || j.sitios?.zona,
    }));
    await loadJStats(jornadas.map(j=>j.id));
    await loadJMediaCounts(jornadas.map(j => j.id));
    renderJornadaList();
    renderProximaJornada();
  }

  function filterJornadas() {
    const today = new Date().toISOString().slice(0, 10);
    let rows;
    if (jTab === 'borradores') rows = jornadas.filter(j => j.estado === 'borrador');
    else if (jTab === 'pasadas') rows = jornadas.filter(j => j.fecha < today || j.estado === 'realizada' || j.estado === 'cancelada');
    else rows = jornadas.filter(j => j.fecha >= today && !['realizada', 'cancelada', 'borrador'].includes(j.estado));
    if (jBrigFilter) rows = rows.filter(j => (j.brigadas || []).includes(jBrigFilter));
    return rows;
  }

  function renderJornadaList() {
    const el = document.getElementById('j-list');
    if (!el) return;
    const rows = filterJornadas();
    if (!rows.length) { el.innerHTML = '<div class="empty">No hay jornadas en esta pestaña.</div>'; return; }
    el.innerHTML = rows.map(j => {
      const st=jStats[j.id]||{confirmadas:0,pidenRide:0,cupos:0,sinDueno:0};
      const metaVol = j.meta_voluntarias ? `${st.confirmadas} / ${j.meta_voluntarias} voluntarias` : `${st.confirmadas} voluntarias`;
      const trans = st.cupos>=st.pidenRide ? '✓ transporte' : '⚠ falta transporte';
      const chips=(j.brigadas||[]).slice(0,3).map(s=>`<span class="btag">${esc((brigCat.find(b=>b.slug===s)?.icono)||'•')} ${esc((brigCat.find(b=>b.slug===s)?.nombre||s).replace(/^Brigada de\s*/i,''))}</span>`).join('');
      const link=jornadaLink(j);
      const wa=waJornadaText(j);
      const showShare=['abierta','llena','borrador'].includes(j.estado);
      const mediaN = jMediaCounts[j.id] || 0;
      const mediaLbl = mediaN ? `📷 Fotos (${mediaN})` : '📷 Fotos';
      return `<article class="j-card">
        <div class="j-head"><div>
          <div class="j-title">${fmtDateCard(j.fecha)} · ${fmtTime(j.hora_salida)||'--:--'} · ${esc(j.sitio_nombre || j.sitio_zona || 'Sin sitio')}</div>
          <div class="j-sub">${metaVol} · ${trans}${st.sinDueno?` · ⚠ ${st.sinDueno} tareas sin dueño`:''}</div>
          <div class="btags">${chips}</div>
        </div>
        <span class="badge-state">${j.estado==='abierta'?'Abierta':esc(j.estado)}</span></div>
        ${showShare?`<div class="j-share">
          <div class="j-share-lbl">Link de inscripción</div>
          <div class="j-link-wrap">
            <div class="j-link">${esc(link)}</div>
            <button type="button" class="j-copy-btn" data-jlink="${j.id}" aria-label="Copiar link" title="Copiar link">📋</button>
          </div>
          <div class="j-share-lbl">Mensaje para WhatsApp</div>
          <div class="j-wa-wrap">
            <div class="j-wa-preview">${esc(wa)}</div>
            <button type="button" class="j-copy-btn" data-jwa="${j.id}" aria-label="Copiar mensaje" title="Copiar mensaje">📋</button>
          </div>
        </div>`:''}
        <div class="j-actions">
          <button type="button" class="btn btn-j-view" data-jview="${j.id}">Ver detalle</button>
          <button type="button" class="btn btn-s" data-jmedia="${j.id}">${mediaLbl}</button>
          ${['abierta','llena','realizada'].includes(j.estado)?`<button type="button" class="btn btn-p" data-jasign="${j.id}">+ Agregar voluntarias</button>`:''}
          <button type="button" class="btn btn-s" data-jedit="${j.id}">Editar</button>
          ${['abierta','llena'].includes(j.estado)?`<button type="button" class="btn btn-j-close" data-jclose="${j.id}">Cerrar jornada</button>`:''}
        </div>
      </article>`;
    }).join('');
    el.querySelectorAll('[data-jview]').forEach(b => b.onclick = () => openJornadaDetail(b.dataset.jview));
    el.querySelectorAll('[data-jmedia]').forEach(b => b.onclick = () => openJornadaMedia(b.dataset.jmedia));
    el.querySelectorAll('[data-jasign]').forEach(b => b.onclick = () => openAsignarVoluntarias(b.dataset.jasign));
    el.querySelectorAll('[data-jedit]').forEach(b => b.onclick = () => openJornadaForm(b.dataset.jedit));
    el.querySelectorAll('[data-jclose]').forEach(b => b.onclick = () => openJornadaClose(b.dataset.jclose));
    el.querySelectorAll('[data-jwa]').forEach(b => b.onclick = () => copyWa(b.dataset.jwa));
    el.querySelectorAll('[data-jlink]').forEach(b => b.onclick = () => copyLink(b.dataset.jlink));
  }

  async function renderProximaJornada() {
    const el = document.getElementById('prox-jornada');
    if (!el) return;
    const today = new Date().toISOString().slice(0, 10);
    const prox = jornadas.filter(j => j.fecha >= today && ['abierta', 'llena'].includes(j.estado)).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    if (!prox) { el.innerHTML = '<p style="font-size:13px;color:var(--txt2)">No hay jornada próxima publicada.</p>'; return; }
    const { data: res } = await db.rpc('resumen_transporte_jornada', { p_jornada_id: prox.id });
    const r = res || { confirmadas: 0, necesitan: 0, cupos: 0 };
    const alerta = r.cupos < r.necesitan;
    el.innerHTML = `
      <div style="font-size:12px;font-weight:800;color:var(--indt);margin-bottom:8px">PRÓXIMA JORNADA</div>
      <b style="font-size:16px">${esc(prox.titulo)}</b>
      <div class="vcard-meta" style="margin:6px 0 12px">${fmtDate(prox.fecha)} · ${esc(prox.sitio_nombre || '')} · ${fmtTime(prox.hora_salida)}</div>
      <div class="stat-grid" style="margin-bottom:12px">
        <div class="stat"><b>${r.confirmadas}</b><span>confirmadas</span></div>
        <div class="stat"><b>${r.necesitan}</b><span>sin ride</span></div>
        <div class="stat"><b>${r.cupos}</b><span>cupos</span></div>
        <div class="stat" style="${alerta ? 'border-color:var(--red)' : ''}"><b>${alerta ? '⚠️' : '✓'}</b><span>${alerta ? 'falta ride' : 'ride OK'}</span></div>
      </div>
      <div class="vcard-actions">
        <button type="button" class="btn btn-p" data-jview="${prox.id}">Ver detalle</button>
        <button type="button" class="btn btn-p" data-jasign="${prox.id}">+ Agregar voluntarias</button>
        <button type="button" class="btn btn-s" data-jwa="${prox.id}">Copiar WA</button>
      </div>`;
    el.querySelectorAll('[data-jview]').forEach(b => b.onclick = () => openJornadaDetail(b.dataset.jview));
    el.querySelectorAll('[data-jasign]').forEach(b => b.onclick = () => openAsignarVoluntarias(b.dataset.jasign));
    el.querySelectorAll('[data-jwa]').forEach(b => b.onclick = () => copyWa(b.dataset.jwa));
  }

  async function copyLink(id) {
    const j = jornadas.find(x => x.id === id);
    if (!j) return;
    const url = jornadaLink(j);
    try { await navigator.clipboard.writeText(url); toast('Link copiado'); }
    catch { prompt('Copia el link:', url); }
  }

  async function copyWa(id) {
    const j = jornadas.find(x => x.id === id);
    if (!j) return;
    const text = waJornadaText(j);
    try { await navigator.clipboard.writeText(text); toast('Copiado para WhatsApp'); }
    catch { prompt('Copia:', text); }
  }

  function openJornadaForm(id, prefillSitioId) {
    jEditId = id || null;
    jEditTareas = [];
    jEditMateriales = [];
    const j = id ? jornadas.find(x => x.id === id) : null;
    const sitioSel = j?.sitio_id || prefillSitioId || '';
    document.getElementById('jf-titulo').value = j?.titulo || '';
    document.getElementById('jf-fecha').value = j?.fecha || '';
    document.getElementById('jf-enc').value = j?.hora_encuentro?.slice(0, 5) || '';
    document.getElementById('jf-sal').value = j?.hora_salida?.slice(0, 5) || '';
    document.getElementById('jf-reg').value = j?.hora_regreso_aprox?.slice(0, 5) || '';
    document.getElementById('jf-punto').value = j?.punto_encuentro || '';
    document.getElementById('jf-desc').value = j?.descripcion || '';
    document.getElementById('jf-vest').value = j?.vestimenta || '';
    document.getElementById('jf-llevar').value = j?.llevar || '';
    document.getElementById('jf-meta-v').value = j?.meta_voluntarias || '';
    document.getElementById('jf-meta-c').value = j?.meta_vehiculos || '';
    document.getElementById('jf-estado').value = j?.estado || (prefillSitioId ? 'abierta' : 'borrador');
    document.getElementById('jf-sitio').innerHTML = '<option value="">— Sin sitio —</option>' + sitios.map(s =>
      `<option value="${s.id}"${sitioSel === s.id ? ' selected' : ''}>${esc(s.nombre)}</option>`).join('');
    if (prefillSitioId && !j) {
      const st = sitios.find(s => s.id === prefillSitioId);
      if (st) document.getElementById('jf-titulo').value = `Jornada — ${st.nombre}`;
    }
    renderJfBrig(j?.brigadas || []);
    if (j) {
      loadJornadaTareas(j.id);
      loadJornadaMateriales(j.id);
    } else {
      renderJfTareas(null);
      renderJfMateriales(null);
    }
    showJornadaEditPanel();
  }

  function renderJfBrig(selected) {
    const sel = new Set(selected);
    document.getElementById('jf-brig').innerHTML = `<div class="jf-brig-row">${brigCat.map(b => `<button type="button" class="jf-brig-pill${sel.has(b.slug)?' on':''}" data-slug="${b.slug}" title="${esc(b.nombre)}">${esc(b.icono||'•')}</button>`).join('')}</div>`;
    document.getElementById('jf-brig').querySelectorAll('.jf-brig-pill').forEach(el => {
      el.onclick = () => { el.classList.toggle('on'); };
    });
  }

  function getJfBrigadas() {
    return [...document.querySelectorAll('#jf-brig .jf-brig-pill.on')].map(el => el.dataset.slug);
  }

  async function loadJornadaTareas(jornadaId) {
    const { data } = await db.from('tareas_jornada').select('*,voluntarios(nombre)').eq('jornada_id', jornadaId).order('created_at');
    jEditTareas = data || [];
    renderJfTareas(jornadaId);
  }

  function renderJfTareas(jornadaId) {
    const box = document.getElementById('jf-tareas');
    if (!box) return;
    const rows = jEditTareas.map((t) => {
      const sin = !t.voluntario_id;
      const brigLabel = t.brigada_slug
        ? (brigCat.find((b) => b.slug === t.brigada_slug)?.icono || '•')
        : '';
      return `<div class="task-edit-row ${sin ? 'warn' : 'ok'}" data-task-id="${t.id}">
        <input type="text" value="${esc(t.titulo)}" data-task-titulo placeholder="Tarea" title="${brigLabel ? 'Brigada: ' + esc(brigLabel) : 'Tarea'}">
        <input type="number" min="1" max="20" value="${t.cupos || 1}" data-task-cupos title="Cupos" inputmode="numeric">
        <span class="st">${sin ? 'sin dueño' : 'asignada'}</span>
        <button type="button" class="btn btn-s" data-task-del style="padding:4px 6px;width:32px;min-width:32px;font-size:14px;margin:0" title="Quitar">×</button>
      </div>`;
    }).join('');
    box.innerHTML = `<div class="task-box">
      <div style="margin-bottom:6px"><span style="font-size:11px;color:var(--txt3)">Tarea · Cupos</span></div>
      ${rows || ''}
      <div class="task-add-row">
        <input id="jt-new-titulo" placeholder="Nueva tarea (ej: Preparar lonches)" autocomplete="off">
        <button type="button" class="btn btn-p" id="jt-add-save">Agregar</button>
      </div>
    </div>`;
    bindJfTareaAdd(jornadaId);
    box.querySelectorAll('.task-edit-row').forEach((row) => bindTaskRow(row, jornadaId));
  }

  function bindTaskRow(row, jornadaId) {
    const id = row.dataset.taskId;
    const save = async () => {
      const titulo = row.querySelector('[data-task-titulo]')?.value?.trim();
      const cupos = Math.min(20, Math.max(1, parseInt(row.querySelector('[data-task-cupos]')?.value, 10) || 1));
      if (!titulo) return;
      if (isDraftId(id)) {
        const item = jEditTareas.find((t) => t.id === id);
        if (item) {
          item.titulo = titulo;
          item.cupos = cupos;
        }
        return;
      }
      const { error } = await db.from('tareas_jornada').update({ titulo, cupos }).eq('id', id);
      if (error) { toast(error.message); return; }
      const item = jEditTareas.find((t) => t.id === id);
      if (item) {
        item.titulo = titulo;
        item.cupos = cupos;
      }
    };
    row.querySelectorAll('input').forEach((inp) => {
      inp.addEventListener('change', save);
      inp.addEventListener('blur', save);
    });
    row.querySelector('[data-task-del]')?.addEventListener('click', async () => {
      const btn = row.querySelector('[data-task-del]');
      if (btn?.dataset.confirm !== '1') {
        btn.dataset.confirm = '1';
        btn.textContent = '✓';
        btn.title = 'Toca otra vez para quitar';
        setTimeout(() => { if (btn.isConnected) { btn.dataset.confirm = ''; btn.textContent = '×'; btn.title = 'Quitar'; } }, 4000);
        return;
      }
      if (isDraftId(id)) {
        jEditTareas = jEditTareas.filter((t) => t.id !== id);
        toast('Tarea quitada');
        renderJfTareas(jornadaId);
        return;
      }
      const { error } = await db.from('tareas_jornada').delete().eq('id', id);
      if (error) { toast(error.message); return; }
      toast('Tarea quitada');
      loadJornadaTareas(jornadaId);
    });
  }

  function bindJfTareaAdd(jornadaId) {
    const inp = document.getElementById('jt-new-titulo');
    const btn = document.getElementById('jt-add-save');
    if (!inp || !btn) return;
    const save = async () => {
      const titulo = inp.value.trim();
      if (!titulo) { toast('Escribe un título'); inp.focus(); return; }
      btn.disabled = true;
      if (jornadaId) {
        const { error } = await db.from('tareas_jornada').insert({
          jornada_id: jornadaId,
          titulo,
          brigada_slug: getJfBrigadas()[0] || null,
          cupos: 1,
          creada_por: session?.user?.email,
        });
        btn.disabled = false;
        if (error) { toast(error.message); return; }
        toast('Tarea agregada');
        loadJornadaTareas(jornadaId);
        return;
      }
      jEditTareas.push({
        id: draftId(),
        titulo,
        brigada_slug: getJfBrigadas()[0] || null,
        cupos: 1,
        voluntario_id: null,
      });
      btn.disabled = false;
      inp.value = '';
      toast('Tarea agregada');
      renderJfTareas(null);
    };
    btn.onclick = save;
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } };
  }

  async function saveJornada(doCopyWa) {
    if (jornadaSaving) return;
    const titulo = document.getElementById('jf-titulo').value.trim();
    const fecha = document.getElementById('jf-fecha').value;
    if (!titulo || !fecha) { toast('Título y fecha obligatorios'); return; }
    jornadaSaving = true;
    const saveBtn = document.getElementById('jf-save');
    const saveWaBtn = document.getElementById('jf-save-wa');
    if (saveBtn) saveBtn.disabled = true;
    if (saveWaBtn) saveWaBtn.disabled = true;
    const wasNew = !jEditId;
    const payload = {
      grupo: GRUPO, titulo, fecha,
      hora_encuentro: document.getElementById('jf-enc').value || null,
      hora_salida: document.getElementById('jf-sal').value || null,
      hora_regreso_aprox: document.getElementById('jf-reg').value || null,
      punto_encuentro: document.getElementById('jf-punto').value.trim() || null,
      descripcion: document.getElementById('jf-desc').value.trim() || null,
      vestimenta: document.getElementById('jf-vest').value.trim() || null,
      llevar: document.getElementById('jf-llevar').value.trim() || null,
      meta_voluntarias: parseInt(document.getElementById('jf-meta-v').value, 10) || null,
      meta_vehiculos: parseInt(document.getElementById('jf-meta-c').value, 10) || null,
      estado: document.getElementById('jf-estado').value,
      sitio_id: document.getElementById('jf-sitio').value || null,
      brigadas: getJfBrigadas(),
      creada_por: session?.user?.email,
    };
    try {
      let saved;
      if (jEditId) {
        const { data, error } = await db.from('jornadas').update(payload).eq('id', jEditId).select('*,sitios(nombre,zona)').single();
        if (error) { toast(error.message); return; }
        saved = { ...data, sitio_nombre: data.sitios?.nombre };
      } else {
        const { data, error } = await db.from('jornadas').insert(payload).select('*,sitios(nombre,zona)').single();
        if (error) { toast(error.message); return; }
        saved = { ...data, sitio_nombre: data.sitios?.nombre };
        jEditId = saved.id;
      }
      if (wasNew && (jEditTareas.length || jEditMateriales.length)) {
        const ok = await persistJfDrafts(saved.id);
        if (!ok) return;
      }
      toast('Jornada guardada');
      closeJornadaEditPanel();
      await loadJornadas();
      if (doCopyWa && saved.estado === 'abierta') copyWa(saved.id);
    } finally {
      jornadaSaving = false;
      if (saveBtn) saveBtn.disabled = false;
      if (saveWaBtn) saveWaBtn.disabled = false;
    }
  }

  let jDetailTab = 'resumen';

  async function openJornadaDetail(id) {
    jDetailId = id;
    jDetailTab = 'resumen';
    document.getElementById('jornada-detail-sheet').hidden = false;
    await renderJornadaDetail();
  }

  async function renderJornadaDetail() {
    const j = jornadas.find(x => x.id === jDetailId);
    if (!j) return;
    document.getElementById('jd-title').textContent = j.titulo;
    const tabs = ['resumen', 'confirmadas', 'transporte', 'tareas', 'materiales'];
    const tabLabels = { resumen: 'Detalle', confirmadas: 'Confirmadas', transporte: 'Transporte', tareas: 'Tareas', materiales: 'Materiales' };
    document.getElementById('jd-tabs').innerHTML = tabs.map(t =>
      `<button type="button" class="chip${jDetailTab === t ? ' on' : ''}" data-jdt="${t}">${tabLabels[t]}</button>`).join('');
    document.getElementById('jd-tabs').querySelectorAll('[data-jdt]').forEach(b => {
      b.onclick = () => { jDetailTab = b.dataset.jdt; renderJornadaDetail(); };
    });

    const body = document.getElementById('jd-body');
    if (jDetailTab === 'resumen') {
      await renderJornadaResumen(j, body);
      return;
    }

    const { data: insc } = await db.from('inscripciones').select('*,voluntarios(numero_voluntaria,nombre,apellido,telefono,medio_transporte)').eq('jornada_id', jDetailId);
    const rows = insc || [];

    if (jDetailTab === 'confirmadas') {
      const conf = rows.filter(i => i.estado === 'confirmada' || i.estado === 'asistio');
      body.innerHTML = (['abierta','llena','realizada'].includes(j.estado)
        ? `<div class="vcard-actions" style="margin-bottom:12px"><button type="button" class="btn btn-p" id="jd-btn-asign">+ Agregar voluntarias</button></div>`
        : '') + (conf.length ? conf.map(i => `
        <div class="vcard"><b>#${i.voluntarios?.numero_voluntaria} ${esc(i.voluntarios?.nombre)} ${esc(i.voluntarios?.apellido)}</b>
        <div class="vcard-meta">${esc(i.voluntarios?.telefono)} · ${inscEstadoLabel(i.estado)} ${i.necesita_transporte ? '· 🙋 necesita ride' : ''} ${i.ofrece_transporte ? '· 🚗 ' + i.cupos_ofrecidos + ' cupos' : ''}</div></div>`).join('') : '<div class="empty">Nadie confirmada aún.</div>');
      document.getElementById('jd-btn-asign')?.addEventListener('click', () => openAsignarVoluntarias(j.id));
      return;
    }

    if (jDetailTab === 'transporte') {
      const need = rows.filter(i => i.estado === 'confirmada' && i.necesita_transporte);
      const offer = rows.filter(i => i.estado === 'confirmada' && i.ofrece_transporte);
      const cupos = offer.reduce((s, i) => s + (i.cupos_ofrecidos || 0), 0);
      let html = `<p class="count">Necesitan: ${need.length} · Cupos: ${cupos}${cupos < need.length ? ' <b style="color:var(--red)">⚠️ Falta ride</b>' : ''}</p>`;
      html += '<div class="sect-t">Sin transporte</div>' + (need.map(i =>
        `<div class="vcard-meta" style="margin-bottom:8px"><a href="tel:${i.voluntarios?.telefono}">${esc(i.voluntarios?.nombre)}</a> · ${esc(i.voluntarios?.telefono)}</div>`).join('') || '<p class="meta">—</p>');
      html += '<div class="sect-t">Con vehículo</div>' + (offer.map(i =>
        `<div class="vcard-meta" style="margin-bottom:8px">${esc(i.voluntarios?.nombre)} · ${i.cupos_ofrecidos} cupos · <a href="tel:${i.voluntarios?.telefono}">${esc(i.voluntarios?.telefono)}</a></div>`).join('') || '<p class="meta">—</p>');
      html += `<button type="button" class="btn btn-s" style="margin-top:12px" id="btn-copy-trans">📋 Copiar lista transporte</button>`;
      body.innerHTML = html;
      document.getElementById('btn-copy-trans')?.addEventListener('click', () => {
        const txt = ['🚗 TRANSPORTE — ' + j.titulo, '',
          '*Necesitan ride:*', ...need.map(i => `• ${i.voluntarios?.nombre} ${i.voluntarios?.telefono}`),
          '', '*Ofrecen cupos:*', ...offer.map(i => `• ${i.voluntarios?.nombre} (${i.cupos_ofrecidos} cupos) ${i.voluntarios?.telefono}`),
        ].join('\n');
        navigator.clipboard.writeText(txt).then(() => toast('Lista copiada')).catch(() => prompt('Copia:', txt));
      });
      return;
    }

    if (jDetailTab === 'materiales') {
      const { data: mats } = await db.from('necesidades_jornada').select('*').eq('jornada_id', jDetailId).order('orden').order('created_at');
      const items = mats || [];
      let html = `<div class="sect"><div class="sect-t">Vestimenta y llevar</div>
        <div class="vcard-meta">👕 ${esc(j.vestimenta || '—')}</div>
        <div class="vcard-meta" style="margin-top:4px">🎒 ${esc(j.llevar || '—')}</div></div>`;
      html += '<div class="sect" style="margin-top:10px"><div class="sect-t">Checklist de materiales</div>';
      if (!items.length) {
        html += '<p class="meta">Sin ítems. Agrégalos al editar la jornada.</p>';
      } else {
        html += items.map((m) => {
          const est = matEstado(m.cantidad_necesaria, m.cantidad_conseguida);
          return `<div class="vcard${est !== 'cubierta' ? ' warn' : ''}" style="margin-top:8px">
            <b>${esc(m.item_nombre)}</b>
            <div class="vcard-meta">${m.cantidad_conseguida} / ${m.cantidad_necesaria} · <span class="mat-est ${matEstadoClass(est)}">${matEstadoLabel(est)}</span></div>
            ${m.donante_notas ? `<div class="vcard-meta">📝 ${esc(m.donante_notas)}</div>` : ''}
          </div>`;
        }).join('');
      }
      html += `<button type="button" class="btn btn-s" style="margin-top:12px" id="btn-copy-mats">📋 Copiar checklist</button></div>`;
      body.innerHTML = html;
      document.getElementById('btn-copy-mats')?.addEventListener('click', () => {
        const txt = materialesWaText(j, items);
        navigator.clipboard.writeText(txt).then(() => toast('Checklist copiado')).catch(() => prompt('Copia:', txt));
      });
      return;
    }

    if (jDetailTab === 'tareas') {
      const { data: tareas } = await db.from('tareas_jornada').select('*,voluntarios(nombre)').eq('jornada_id', jDetailId);
      body.innerHTML = (tareas || []).map(t => {
        const sin = !t.voluntario_id;
        return `<div class="vcard${sin ? ' warn' : ''}"><b>${esc(t.titulo)}</b>
          <div class="vcard-meta">${sin ? '⚠️ Sin dueña' : '✅ ' + esc(t.voluntarios?.nombre)}</div>
          ${sin ? `<button type="button" class="btn btn-s" style="margin-top:8px" data-wa-task="${t.id}">📋 Aviso WA</button>` : ''}</div>`;
      }).join('') || '<div class="empty">Sin tareas. Agrégalas al editar la jornada.</div>';
      body.querySelectorAll('[data-wa-task]').forEach(btn => {
        const t = (tareas || []).find(x => x.id === btn.dataset.waTask);
        btn.onclick = () => {
          const msg = `⚠️ ¿Quién se apunta?\n*${t.titulo}* — jornada del ${fmtDate(j.fecha)}\n👉 ${BASE}/jornada?id=${j.id}`;
          navigator.clipboard.writeText(msg).then(() => toast('Aviso copiado')).catch(() => prompt('Copia:', msg));
        };
      });
    }
  }


  async function openJornadaClose(id) {
    jCloseId = id;
    const j = jornadas.find(x => x.id === id);
    if (!j) return;
    document.getElementById('jc-title').textContent = 'Cerrar · ' + j.titulo;
    const { data: insc } = await db.from('inscripciones').select('id,estado,voluntarios(numero_voluntaria,nombre,apellido)').eq('jornada_id', id).order('created_at');
    jCloseRows = (insc || []).filter(i => ['confirmada', 'asistio', 'no_asistio'].includes(i.estado));
    document.getElementById('jc-attendees').innerHTML = jCloseRows.length ? jCloseRows.map(i => `
      <label class="toggle" style="margin-bottom:8px;justify-content:flex-start">
        <input type="checkbox" data-jc-insc="${i.id}" ${i.estado !== 'no_asistio' ? 'checked' : ''}>
        #${i.voluntarios?.numero_voluntaria || '—'} ${esc(i.voluntarios?.nombre)} ${esc(i.voluntarios?.apellido || '')}
      </label>`).join('') : '<p class="meta">No hay confirmadas para marcar asistencia.</p>';
    document.getElementById('jc-update-site').checked = !!j.sitio_id;
    document.getElementById('jc-duplicada').checked = false;
    for (const k of ['comida','medicinas','cotillon','recreacion']) document.getElementById('jc-' + k).value = 'ninguna';
    document.getElementById('jornada-close-sheet').hidden = false;
  }

  async function saveJornadaClose() {
    const j = jornadas.find(x => x.id === jCloseId);
    if (!j) return;
    const checks = [...document.querySelectorAll('[data-jc-insc]')];
    for (const el of checks) {
      const estado = el.checked ? 'asistio' : 'no_asistio';
      const { error } = await db.from('inscripciones').update({ estado }).eq('id', el.dataset.jcInsc);
      if (error) { toast(error.message); return; }
    }
    const { error: e1 } = await db.from('jornadas').update({ estado: 'realizada' }).eq('id', j.id);
    if (e1) { toast(e1.message); return; }

    if (j.sitio_id && document.getElementById('jc-update-site').checked) {
      const payload = {
        cobertura_comida: document.getElementById('jc-comida').value,
        cobertura_medicinas: document.getElementById('jc-medicinas').value,
        cobertura_cotillon: document.getElementById('jc-cotillon').value,
        cobertura_recreacion: document.getElementById('jc-recreacion').value,
        ayuda_duplicada: document.getElementById('jc-duplicada').checked,
        ultima_visita_at: new Date().toISOString(),
      };
      const { error: e2 } = await db.from('sitios').update(payload).eq('id', j.sitio_id);
      if (e2) { toast(e2.message); return; }
    }

    document.getElementById('jornada-close-sheet').hidden = true;
    toast('Jornada cerrada');
    await loadJornadas();
    if (jDetailId === j.id) await renderJornadaDetail();
  }

  function inscEstadoLabel(e) {
    return { confirmada: 'Confirmada', asistio: 'Asistió', no_asistio: 'No asistió', no_puede: 'No puede', pendiente: 'Pendiente' }[e] || e;
  }

  function jornadasAsignables() {
    return jornadas.filter(j => ['abierta', 'llena', 'realizada'].includes(j.estado))
      .sort((a, b) => {
        const aOpen = ['abierta', 'llena'].includes(a.estado);
        const bOpen = ['abierta', 'llena'].includes(b.estado);
        if (aOpen !== bOpen) return aOpen ? -1 : 1;
        return b.fecha.localeCompare(a.fecha) || String(b.hora_salida || '').localeCompare(a.hora_salida || '');
      });
  }

  function matchVolQ(v, q) {
    if (!q) return true;
    const blob = [v.nombre, v.apellido, v.id_dni, v.telefono, String(v.numero_voluntaria)].join(' ').toLowerCase();
    return blob.includes(q);
  }

  function inscritosVolIds() {
    return new Set(asignarInscripciones.map(i => i.voluntario_id));
  }

  async function loadAsignarVoluntarias() {
    const { data, error } = await db.from('voluntarios')
      .select('id,numero_voluntaria,nombre,apellido,id_dni,telefono,activa')
      .eq('grupo', GRUPO)
      .eq('activa', true)
      .order('numero_voluntaria');
    if (error) { toast(error.message); return; }
    asignarVoluntarias = data || [];
  }

  async function loadAsignarInscripciones(jId) {
    if (!jId) { asignarInscripciones = []; return; }
    const { data, error } = await db.from('inscripciones')
      .select('id,voluntario_id,estado,necesita_transporte,ofrece_transporte,cupos_ofrecidos,voluntarios(numero_voluntaria,nombre,apellido,telefono)')
      .eq('jornada_id', jId)
      .order('created_at');
    if (error) { toast(error.message); return; }
    asignarInscripciones = data || [];
  }

  function renderAsignarJornadaSelect() {
    const sel = document.getElementById('ja-jornada');
    if (!sel) return;
    const abiertas = jornadasAsignables();
    if (!abiertas.length) {
      sel.innerHTML = '<option value="">No hay jornadas disponibles</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = abiertas.map(j =>
      `<option value="${j.id}"${j.id === asignarJornadaId ? ' selected' : ''}>${esc(fmtDateCard(j.fecha))} · ${esc(j.titulo)}${j.estado === 'realizada' ? ' (realizada)' : ''}</option>`).join('');
  }

  function renderAsignarInscList() {
    const list = document.getElementById('ja-insc-list');
    const count = document.getElementById('ja-insc-count');
    if (!list) return;
    if (count) count.textContent = String(asignarInscripciones.length);
    if (!asignarInscripciones.length) {
      list.innerHTML = '<p class="meta">Nadie inscrita aún.</p>';
      return;
    }
    list.innerHTML = asignarInscripciones.map(i => `
      <div class="vcard" style="margin-bottom:8px">
        <b>#${i.voluntarios?.numero_voluntaria || '—'} ${esc(i.voluntarios?.nombre)} ${esc(i.voluntarios?.apellido || '')}</b>
        <div class="vcard-meta">${inscEstadoLabel(i.estado)}${i.voluntarios?.telefono ? ' · ' + esc(i.voluntarios.telefono) : ''}</div>
        <div class="vcard-actions" style="margin-top:8px">
          ${i.estado !== 'no_asistio' ? `<button type="button" class="btn btn-s btn-sm" data-ja-no="${i.id}" style="margin:0">No asistió</button>` : ''}
          <button type="button" class="btn btn-s btn-sm" data-ja-del="${i.id}" style="margin:0">Desinscribir</button>
        </div>
      </div>`).join('');
    list.querySelectorAll('[data-ja-no]').forEach((btn) => {
      btn.onclick = () => marcarNoAsistioInscripcion(btn.dataset.jaNo);
    });
    list.querySelectorAll('[data-ja-del]').forEach((btn) => {
      btn.onclick = () => desinscribirVoluntaria(btn.dataset.jaDel);
    });
  }

  async function marcarNoAsistioInscripcion(inscripcionId) {
    if (!inscripcionId || !asignarJornadaId) return;
    const { error } = await db.from('inscripciones')
      .update({ estado: 'no_asistio', respondido_at: new Date().toISOString() })
      .eq('id', inscripcionId);
    if (error) { toast(error.message); return; }
    toast('Marcada como no asistió');
    await loadAsignarInscripciones(asignarJornadaId);
    await loadJStats(jornadas.map((x) => x.id));
    renderAsignarInscList();
    renderAsignarResults();
    if (jDetailId === asignarJornadaId) await renderJornadaDetail();
  }

  async function desinscribirVoluntaria(inscripcionId) {
    if (!inscripcionId || !asignarJornadaId) return;
    if (!confirm('¿Desinscribir esta voluntaria de la jornada?')) return;
    const { error } = await db.from('inscripciones').delete().eq('id', inscripcionId);
    if (error) { toast(error.message); return; }
    toast('Voluntaria desinscrita');
    await loadAsignarInscripciones(asignarJornadaId);
    await loadJStats(jornadas.map((x) => x.id));
    renderAsignarInscList();
    renderAsignarResults();
    if (jDetailId === asignarJornadaId) await renderJornadaDetail();
  }

  function renderAsignarResults() {
    const q = (document.getElementById('ja-q')?.value || '').trim().toLowerCase();
    const el = document.getElementById('ja-results');
    const count = document.getElementById('ja-count');
    if (!el) return;
    if (!asignarJornadaId) {
      el.innerHTML = '';
      if (count) count.textContent = 'Elige una jornada.';
      return;
    }
    const inscritos = inscritosVolIds();
    const disponibles = asignarVoluntarias.filter(v => !inscritos.has(v.id));
    const rows = disponibles.filter(v => matchVolQ(v, q));
    if (count) {
      count.textContent = q
        ? (rows.length ? `${rows.length} coincidencia(s)` : 'Sin coincidencias')
        : `${rows.length} voluntarias disponibles`;
    }
    if (!rows.length) {
      el.innerHTML = `<div class="empty">${q ? 'Nadie coincide con ese filtro.' : 'Todas las voluntarias ya están en esta jornada.'}</div>`;
      return;
    }
    el.innerHTML = rows.map(v => `
      <div class="vcard" style="margin-bottom:8px;display:flex;justify-content:space-between;align-items:center;gap:10px">
        <div style="min-width:0">
          <b>#${v.numero_voluntaria} ${esc(v.nombre)} ${esc(v.apellido)}</b>
          <div class="vcard-meta">${esc(v.id_dni)}${v.telefono ? ' · ' + esc(v.telefono) : ''}</div>
        </div>
        <button type="button" class="btn btn-p btn-sm" data-ja-add="${v.id}" style="flex-shrink:0;margin:0">+ Agregar</button>
      </div>`).join('');
    el.querySelectorAll('[data-ja-add]').forEach(btn => {
      btn.onclick = () => agregarVoluntariaJornada(btn.dataset.jaAdd, btn);
    });
  }

  async function agregarVoluntariaJornada(volId, btn) {
    if (!asignarJornadaId || !volId) return;
    const j = jornadas.find(x => x.id === asignarJornadaId);
    if (!j || !['abierta', 'llena', 'realizada'].includes(j.estado)) {
      toast('Esta jornada no acepta inscripciones');
      return;
    }
    const estadoInsc = j.estado === 'realizada' ? 'asistio' : 'confirmada';
    if (btn) { btn.disabled = true; btn.textContent = '…'; }
    const { error } = await db.from('inscripciones').upsert({
      jornada_id: asignarJornadaId,
      voluntario_id: volId,
      estado: estadoInsc,
      respondido_at: new Date().toISOString(),
    }, { onConflict: 'jornada_id,voluntario_id' });
    if (btn) { btn.disabled = false; btn.textContent = '+ Agregar'; }
    if (error) { toast(error.message); return; }
    const v = asignarVoluntarias.find(x => x.id === volId);
    toast(estadoInsc === 'asistio'
      ? `#${v?.numero_voluntaria || ''} ${v?.nombre || ''} marcada asistió`.trim()
      : `#${v?.numero_voluntaria || ''} ${v?.nombre || ''} confirmada`.trim());
    await loadAsignarInscripciones(asignarJornadaId);
    await loadJStats(jornadas.map(x => x.id));
    renderAsignarInscList();
    renderAsignarResults();
    if (jDetailId === asignarJornadaId) await renderJornadaDetail();
  }

  async function openAsignarVoluntarias(jornadaId) {
    const asignables = jornadasAsignables();
    if (!asignables.length) {
      toast('No hay jornadas para inscribir');
      return;
    }
    asignarJornadaId = jornadaId && asignables.some(j => j.id === jornadaId) ? jornadaId : asignables[0].id;
    document.getElementById('jornada-asignar-sheet').hidden = false;
    const q = document.getElementById('ja-q');
    if (q) q.value = '';
    await loadAsignarVoluntarias();
    renderAsignarJornadaSelect();
    await loadAsignarInscripciones(asignarJornadaId);
    renderAsignarInscList();
    renderAsignarResults();
  }

  function initAsignarUi() {
    document.getElementById('ja-close')?.addEventListener('click', () => {
      document.getElementById('jornada-asignar-sheet').hidden = true;
    });
    document.getElementById('ja-jornada')?.addEventListener('change', async (e) => {
      asignarJornadaId = e.target.value || null;
      await loadAsignarInscripciones(asignarJornadaId);
      renderAsignarInscList();
      renderAsignarResults();
    });
    document.getElementById('ja-q')?.addEventListener('input', () => renderAsignarResults());
  }

  function initMediaUi() {
    document.getElementById('jm-close')?.addEventListener('click', () => {
      document.getElementById('jornada-media-sheet').hidden = true;
    });
    document.getElementById('jm-jornada')?.addEventListener('change', () => renderMediaSheetBody());
  }

  function initJornadasUi() {
    if (jornadasUiInited) return;
    jornadasUiInited = true;
    initAsignarUi();
    initMediaUi();
    document.getElementById('j-filters')?.addEventListener('click', e => {
      const b = e.target.closest('.chip');
      if (!b) return;
      jTab = b.dataset.jf;
      document.querySelectorAll('#j-filters .chip').forEach(c => c.classList.toggle('on', c === b));
      renderJornadaList();
    });
    document.getElementById('btn-new-jornada')?.addEventListener('click', () => openJornadaForm(null));
    document.getElementById('fab-jornada')?.addEventListener('click', () => openJornadaForm(null));
    document.getElementById('btn-jornada-media')?.addEventListener('click', () => openJornadaMedia());
    document.getElementById('jf-back')?.addEventListener('click', closeJornadaEditPanel);
    document.getElementById('jf-cancel')?.addEventListener('click', closeJornadaEditPanel);
    document.getElementById('jf-save')?.addEventListener('click', () => saveJornada(false));
    document.getElementById('jf-save-wa')?.addEventListener('click', () => saveJornada(true));
    document.getElementById('jd-close')?.addEventListener('click', () => { document.getElementById('jornada-detail-sheet').hidden = true; });
    document.getElementById('jc-close')?.addEventListener('click', () => { document.getElementById('jornada-close-sheet').hidden = true; });
    document.getElementById('jc-cancel')?.addEventListener('click', () => { document.getElementById('jornada-close-sheet').hidden = true; });
    document.getElementById('jc-save')?.addEventListener('click', saveJornadaClose);
  }

  async function onCoordReady() {
    initJornadasUi();
    await loadInventarioCat();
    await loadSitios();
    await loadJornadas();
  }

  function onShowTab(name) {
    if (name === 'jornadas') loadJornadas();
  }

  function getProximaJornada() {
    const today = new Date().toISOString().slice(0, 10);
    return jornadas.filter(j => j.fecha >= today && ['abierta', 'llena'].includes(j.estado))
      .sort((a, b) => a.fecha.localeCompare(b.fecha))[0] || null;
  }

  function getWaText(id) {
    const j = jornadas.find(x => x.id === id);
    return j ? waJornadaText(j) : '';
  }

  async function reloadSitios() {
    await loadSitios();
  }

  function setBrigadaFilter(slug) {
    jBrigFilter = slug || '';
    jTab = 'proximas';
    document.querySelectorAll('#j-filters .chip').forEach(c => c.classList.toggle('on', c.dataset.jf === 'proximas'));
    renderJornadaList();
  }

  async function getMaterialesExport(jId) {
    const j = jornadas.find((x) => x.id === jId);
    if (!j) return '';
    const { data } = await db.from('necesidades_jornada').select('*').eq('jornada_id', jId).order('orden');
    if (!data?.length) return `Para ${j.titulo}: sin checklist de materiales.`;
    return materialesWaText(j, data);
  }

  window.CC_JORN = { onCoordReady, onShowTab, openJornadaForm, openJornadaClose, openJornadaMedia, openAsignarVoluntarias, copyWa, loadJornadas, reloadSitios, getProximaJornada, getWaText, setBrigadaFilter, getMaterialesExport, deleteMediaItem };
})();
