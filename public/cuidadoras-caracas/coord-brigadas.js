/* Panel coordinadoras — brigadas (catálogo, coordinadoras, miembros). */
(function () {
  let brigFull = [];
  let brigJornCounts = {};
  let brigEditId = null;
  let brigMembersSlug = null;

  function brigNombreCorto(n) {
    return String(n || '').replace(/^Brigada de\s*/i, '');
  }

  function volLabel(v) {
    if (!v) return '';
    return `#${v.numero_voluntaria} ${v.nombre} ${v.apellido || ''}`.trim();
  }

  function coordLabel(b) {
    if (!b.coordinador_voluntario_id) return null;
    const v = (typeof vols !== 'undefined' ? vols : []).find((x) => x.id === b.coordinador_voluntario_id);
    return v ? volLabel(v) : 'Coordinadora asignada';
  }

  function miembrosDe(slug) {
    return (typeof vols !== 'undefined' ? vols : [])
      .filter((v) => v.activa !== false && (v.brigadas || []).includes(slug))
      .sort((a, b) => a.numero_voluntaria - b.numero_voluntaria);
  }

  async function loadBrigJornCounts() {
    brigJornCounts = {};
    const { data } = await db
      .from('jornadas')
      .select('brigadas,estado')
      .eq('grupo', GRUPO)
      .in('estado', ['abierta', 'llena', 'borrador']);
    (data || []).forEach((j) => {
      (j.brigadas || []).forEach((s) => {
        brigJornCounts[s] = (brigJornCounts[s] || 0) + 1;
      });
    });
  }

  async function loadBrigadasFull() {
    const { data, error } = await db
      .from('brigadas')
      .select('id,slug,nombre,mision,acciones,requisitos,icono,color_bg,color_fg,orden,activa,coordinador_voluntario_id')
      .eq('grupo', GRUPO)
      .eq('activa', true)
      .order('orden');
    if (error && typeof toast === 'function') toast('Brigadas: ' + error.message);
    brigFull = data || [];
    await loadBrigJornCounts();
  }

  function getBrigCat() {
    return brigFull.map((b) => ({ slug: b.slug, nombre: b.nombre, icono: b.icono }));
  }

  function renderBrigadas() {
    const counts = {};
    (typeof vols !== 'undefined' ? vols : []).forEach((v) =>
      (v.brigadas || []).forEach((s) => {
        counts[s] = (counts[s] || 0) + 1;
      })
    );
    const conBrig = (typeof vols !== 'undefined' ? vols : []).filter((v) => v.brigadas?.length).length;
    const elCount = document.getElementById('brig-count');
    if (elCount) {
      elCount.textContent = `${brigFull.length} brigadas · ${conBrig} voluntarias con al menos una`;
    }
    const el = document.getElementById('brig-list');
    if (!el) return;
    if (!brigFull.length) {
      el.innerHTML =
        '<div class="coming"><h3>Sin brigadas en catálogo</h3><p>Corre la migración de brigadas en Supabase.</p></div>';
      return;
    }
    const maxN = Math.max(1, ...brigFull.map((b) => counts[b.slug] || 0));
    el.innerHTML = brigFull
      .map((b) => {
        const n = counts[b.slug] || 0;
        const jn = brigJornCounts[b.slug] || 0;
        const coord = coordLabel(b);
        const pct = Math.round((n / maxN) * 100);
        const bg = b.color_bg || '#EEEBF6';
        const fg = b.color_fg || '#463A82';
        return `<article class="brig-card" style="--brig-bg:${esc(bg)};--brig-fg:${esc(fg)}">
        <div class="brig-card-top">
          <div class="brig-card-ico" aria-hidden="true">${esc(b.icono || '•')}</div>
          <div class="brig-card-body">
            <div class="brig-card-h">
              <b>${esc(brigNombreCorto(b.nombre))}</b>
              <span class="badge brig-badge">${n} voluntaria${n === 1 ? '' : 's'}</span>
            </div>
            <p class="brig-mision">${esc(b.mision || '')}</p>
            <div class="brig-meta">
              <span>${coord ? '👤 ' + esc(coord) : '⚠️ Sin coordinadora'}</span>
              <span>· ${jn} jornada${jn === 1 ? '' : 's'} activa${jn === 1 ? '' : 's'}</span>
            </div>
            <div class="brig-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
          </div>
        </div>
        <div class="brig-card-actions">
          <button type="button" class="btn btn-p btn-sm" data-brig-miembros="${esc(b.slug)}">Ver miembros</button>
          <button type="button" class="btn btn-s btn-sm" data-brig-edit="${esc(b.id)}">Editar</button>
          <button type="button" class="btn btn-s btn-sm" data-brig-jornadas="${esc(b.slug)}">Jornadas</button>
        </div>
      </article>`;
      })
      .join('');
    el.querySelectorAll('[data-brig-miembros]').forEach((btn) => {
      btn.onclick = () => openBrigMembers(btn.dataset.brigMiembros);
    });
    el.querySelectorAll('[data-brig-edit]').forEach((btn) => {
      btn.onclick = () => openBrigEdit(btn.dataset.brigEdit);
    });
    el.querySelectorAll('[data-brig-jornadas]').forEach((btn) => {
      btn.onclick = () => filterJornadasBrigada(btn.dataset.brigJornadas);
    });
  }

  function filterVoluntariasBrigada(slug) {
    if (typeof filter !== 'undefined') filter = 'brigada:' + slug;
    document.querySelectorAll('#filters .chip').forEach((c) => c.classList.remove('on'));
    const q = document.getElementById('q');
    if (q) q.value = '';
    if (typeof showTab === 'function') showTab('voluntarias');
    if (typeof renderList === 'function') renderList();
    const b = brigFull.find((x) => x.slug === slug);
    toast('Voluntarias · ' + brigNombreCorto(b?.nombre || slug));
  }

  function filterJornadasBrigada(slug) {
    if (window.CC_JORN?.setBrigadaFilter) window.CC_JORN.setBrigadaFilter(slug);
    if (typeof showTab === 'function') showTab('jornadas');
    const b = brigFull.find((x) => x.slug === slug);
    toast('Jornadas · ' + brigNombreCorto(b?.nombre || slug));
  }

  function openBrigMembers(slug) {
    brigMembersSlug = slug;
    const b = brigFull.find((x) => x.slug === slug);
    const rows = miembrosDe(slug);
    document.getElementById('brig-m-title').textContent = (b?.icono || '') + ' ' + brigNombreCorto(b?.nombre || 'Brigada');
    document.getElementById('brig-m-count').textContent = `${rows.length} voluntaria${rows.length === 1 ? '' : 's'}`;
    const el = document.getElementById('brig-m-list');
    if (!rows.length) {
      el.innerHTML = '<div class="empty">Nadie inscrita en esta brigada todavía.</div>';
    } else {
      el.innerHTML = rows
        .map(
          (v) => `<div class="brig-m-row">
        <div><b>${esc(volLabel(v))}</b><div class="brig-m-sub">${esc(v.profesion || '—')} · ${esc(v.asistencia_zona || 'Sin zona')}</div></div>
        <button type="button" class="btn btn-s btn-sm" data-brig-m-edit="${esc(v.id)}">Editar</button>
      </div>`
        )
        .join('');
      el.querySelectorAll('[data-brig-m-edit]').forEach((btn) => {
        btn.onclick = () => {
          document.getElementById('brig-members-sheet').hidden = true;
          if (typeof openEdit === 'function') openEdit(btn.dataset.brigMEdit);
        };
      });
    }
    document.getElementById('brig-members-sheet').hidden = false;
  }

  function openBrigEdit(id) {
    brigEditId = id;
    const b = brigFull.find((x) => x.id === id);
    if (!b) return;
    document.getElementById('brig-e-title').textContent = 'Editar · ' + brigNombreCorto(b.nombre);
    document.getElementById('brig-e-slug').textContent = b.slug;
    document.getElementById('brig-e-nombre').value = b.nombre || '';
    document.getElementById('brig-e-mision').value = b.mision || '';
    document.getElementById('brig-e-acciones').value = b.acciones || '';
    document.getElementById('brig-e-req').value = b.requisitos || '';
    document.getElementById('brig-e-icono').value = b.icono || '';
    const sel = document.getElementById('brig-e-coord');
    const miembros = miembrosDe(b.slug);
    const opts = miembros.length ? miembros : (typeof vols !== 'undefined' ? vols : []).filter((v) => v.activa !== false);
    sel.innerHTML =
      '<option value="">— Sin coordinadora —</option>' +
      opts
        .map(
          (v) =>
            `<option value="${esc(v.id)}"${v.id === b.coordinador_voluntario_id ? ' selected' : ''}>${esc(volLabel(v))}</option>`
        )
        .join('');
    document.getElementById('brig-edit-sheet').hidden = false;
  }

  async function saveBrigEdit() {
    if (!brigEditId) return;
    const nombre = document.getElementById('brig-e-nombre').value.trim();
    const mision = document.getElementById('brig-e-mision').value.trim();
    if (!nombre || !mision) {
      toast('Nombre y misión son obligatorios');
      return;
    }
    const btn = document.getElementById('brig-e-save');
    btn.disabled = true;
    const coordVal = document.getElementById('brig-e-coord').value;
    const { error } = await db
      .from('brigadas')
      .update({
        nombre,
        mision,
        acciones: document.getElementById('brig-e-acciones').value.trim(),
        requisitos: document.getElementById('brig-e-req').value.trim(),
        icono: document.getElementById('brig-e-icono').value.trim(),
        coordinador_voluntario_id: coordVal || null,
      })
      .eq('id', brigEditId);
    btn.disabled = false;
    if (error) {
      toast(error.message);
      return;
    }
    toast('Brigada guardada');
    document.getElementById('brig-edit-sheet').hidden = true;
    brigEditId = null;
    await loadBrigadasFull();
    renderBrigadas();
  }

  function bindBrigSheets() {
    document.getElementById('brig-edit-close')?.addEventListener('click', () => {
      document.getElementById('brig-edit-sheet').hidden = true;
      brigEditId = null;
    });
    document.getElementById('brig-e-cancel')?.addEventListener('click', () => {
      document.getElementById('brig-edit-sheet').hidden = true;
      brigEditId = null;
    });
    document.getElementById('brig-e-save')?.addEventListener('click', saveBrigEdit);
    document.getElementById('brig-m-close')?.addEventListener('click', () => {
      document.getElementById('brig-members-sheet').hidden = true;
    });
    document.getElementById('brig-m-vol')?.addEventListener('click', () => {
      if (brigMembersSlug) filterVoluntariasBrigada(brigMembersSlug);
      document.getElementById('brig-members-sheet').hidden = true;
    });
  }

  window.CC_BRIG = {
    onCoordReady: loadBrigadasFull,
    onShowTab: async (name) => {
      if (name === 'brigadas') {
        await loadBrigJornCounts();
        renderBrigadas();
      }
    },
    renderBrigadas,
    loadBrigadasFull,
    getBrigCat,
    filterVoluntariasBrigada,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindBrigSheets);
  } else {
    bindBrigSheets();
  }
})();
