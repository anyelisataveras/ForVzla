(function () {
  const RECIBOS_BUCKET = 'gastos-recibos';
  const DONACIONES_SOPORTES_BUCKET = 'donaciones-soportes';
  const MAX_RECIBO_BYTES = 15 * 1024 * 1024;
  let recibosPendientes = [];
  let soportesDonPendientes = [];

  function todayISO() {
    return new Date().toISOString().slice(0, 10);
  }

  function openSheet(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = false;
  }

  function closeSheet(id) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }

  function fmtMoney(n, currency) {
    const num = Number(n || 0);
    const code = String(currency || 'USD').toUpperCase();
    return `${num.toFixed(2)} ${code}`;
  }

  function fmtDate(d) {
    if (!d) return '—';
    const dt = new Date(`${d}T00:00:00`);
    if (Number.isNaN(dt.getTime())) return '—';
    const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
    return `${dt.getDate()} ${mes[dt.getMonth()]} ${dt.getFullYear()}`;
  }

  function getExt(mime) {
    const m = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/heic': 'heic',
      'application/pdf': 'pdf',
    };
    return m[mime] || 'bin';
  }

  async function signedUrl(path) {
    const { data, error } = await db.storage.from(RECIBOS_BUCKET).createSignedUrl(path, 3600);
    if (error) return null;
    return data.signedUrl;
  }

  async function signedUrlDon(path) {
    const { data, error } = await db.storage.from(DONACIONES_SOPORTES_BUCKET).createSignedUrl(path, 3600);
    if (error) return null;
    return data.signedUrl;
  }

  function setSoportesDonPendientes(files) {
    soportesDonPendientes = [];
    const info = document.getElementById('fin-don-soportes-info');
    for (const f of [...(files || [])]) {
      if (!/^(image\/|application\/pdf$)/.test(f.type)) {
        toast(`${f.name}: formato no permitido`);
        continue;
      }
      if (f.size > MAX_RECIBO_BYTES) {
        toast(`${f.name}: supera 15 MB`);
        continue;
      }
      soportesDonPendientes.push(f);
    }
    if (!info) return;
    info.textContent = soportesDonPendientes.length
      ? `${soportesDonPendientes.length} soporte(s) listo(s) para subir`
      : 'Sin soportes seleccionados.';
  }

  function setRecibosPendientes(files) {
    recibosPendientes = [];
    const info = document.getElementById('fin-gas-recibos-info');
    for (const f of [...(files || [])]) {
      if (!/^(image\/|application\/pdf$)/.test(f.type)) {
        toast(`${f.name}: formato no permitido`);
        continue;
      }
      if (f.size > MAX_RECIBO_BYTES) {
        toast(`${f.name}: supera 15 MB`);
        continue;
      }
      recibosPendientes.push(f);
    }
    if (!info) return;
    info.textContent = recibosPendientes.length
      ? `${recibosPendientes.length} recibo(s) listo(s) para subir`
      : 'Sin recibos seleccionados.';
  }

  async function uploadRecibos(gastoId) {
    if (!recibosPendientes.length) return 0;
    let ok = 0;
    for (const file of recibosPendientes) {
      const path = `${GRUPO}/${gastoId}/${crypto.randomUUID()}.${getExt(file.type)}`;
      const { error: upErr } = await db.storage.from(RECIBOS_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) {
        toast(upErr.message);
        continue;
      }
      const { error: dbErr } = await db.from('gasto_recibos').insert({
        gasto_id: gastoId,
        storage_path: path,
        mime_type: file.type,
        subido_por: session?.user?.email || null,
      });
      if (dbErr) {
        await db.storage.from(RECIBOS_BUCKET).remove([path]);
        toast(dbErr.message);
        continue;
      }
      ok++;
    }
    recibosPendientes = [];
    const input = document.getElementById('fin-gas-recibos');
    const info = document.getElementById('fin-gas-recibos-info');
    if (input) input.value = '';
    if (info) info.textContent = 'Sin recibos seleccionados.';
    return ok;
  }

  async function uploadSoportesDonacion(donacionId) {
    if (!soportesDonPendientes.length) return 0;
    let ok = 0;
    for (const file of soportesDonPendientes) {
      const path = `${GRUPO}/${donacionId}/${crypto.randomUUID()}.${getExt(file.type)}`;
      const { error: upErr } = await db.storage.from(DONACIONES_SOPORTES_BUCKET).upload(path, file, {
        contentType: file.type,
        upsert: false,
      });
      if (upErr) {
        toast(upErr.message);
        continue;
      }
      const { error: dbErr } = await db.from('donacion_soportes').insert({
        donacion_id: donacionId,
        storage_path: path,
        mime_type: file.type,
        subido_por: session?.user?.email || null,
      });
      if (dbErr) {
        await db.storage.from(DONACIONES_SOPORTES_BUCKET).remove([path]);
        toast(dbErr.message);
        continue;
      }
      ok++;
    }
    soportesDonPendientes = [];
    const input = document.getElementById('fin-don-soportes');
    const info = document.getElementById('fin-don-soportes-info');
    if (input) input.value = '';
    if (info) info.textContent = 'Sin soportes seleccionados.';
    return ok;
  }

  async function saveDonacion() {
    const desc = document.getElementById('fin-don-desc').value.trim();
    if (!desc) {
      toast('Describe la donación');
      return;
    }
    const payload = {
      grupo: GRUPO,
      tipo: document.getElementById('fin-don-tipo').value,
      fecha: document.getElementById('fin-don-fecha').value || todayISO(),
      monto: parseFloat(document.getElementById('fin-don-monto').value) || null,
      moneda: document.getElementById('fin-don-moneda').value.trim().toUpperCase() || 'USD',
      cantidad: parseFloat(document.getElementById('fin-don-cantidad').value) || null,
      unidad: document.getElementById('fin-don-unidad').value.trim() || null,
      donante_nombre: document.getElementById('fin-don-donante').value.trim() || null,
      donante_contacto: document.getElementById('fin-don-contacto').value.trim() || null,
      descripcion: desc,
      creado_por: session?.user?.email || null,
    };
    const btn = document.getElementById('btn-fin-save-don');
    btn.disabled = true;
    const { data, error } = await db.from('donaciones_grupo').insert(payload).select('id').single();
    btn.disabled = false;
    if (error) {
      toast(error.message);
      return;
    }
    const subidos = await uploadSoportesDonacion(data.id);
    toast(subidos ? `Donación guardada con ${subidos} soporte(s)` : 'Donación guardada');
    document.getElementById('fin-don-monto').value = '';
    document.getElementById('fin-don-cantidad').value = '';
    document.getElementById('fin-don-unidad').value = '';
    document.getElementById('fin-don-donante').value = '';
    document.getElementById('fin-don-contacto').value = '';
    document.getElementById('fin-don-desc').value = '';
    closeSheet('fin-don-sheet');
    refresh();
  }

  async function saveGasto() {
    const desc = document.getElementById('fin-gas-desc').value.trim();
    const monto = parseFloat(document.getElementById('fin-gas-monto').value) || 0;
    const fecha = document.getElementById('fin-gas-fecha').value;
    if (!desc || !fecha || monto <= 0) {
      toast('Completa fecha, monto y descripción');
      return;
    }
    const payload = {
      grupo: GRUPO,
      categoria: document.getElementById('fin-gas-cat').value,
      fecha_gasto: fecha,
      monto,
      moneda: document.getElementById('fin-gas-moneda').value.trim().toUpperCase() || 'USD',
      proveedor: document.getElementById('fin-gas-proveedor').value.trim() || null,
      pagado_por: document.getElementById('fin-gas-pagado').value.trim() || null,
      descripcion: desc,
      creado_por: session?.user?.email || null,
    };
    const btn = document.getElementById('btn-fin-save-gas');
    btn.disabled = true;
    const { data, error } = await db.from('gastos_grupo').insert(payload).select('id').single();
    if (error) {
      btn.disabled = false;
      toast(error.message);
      return;
    }
    const subidos = await uploadRecibos(data.id);
    btn.disabled = false;
    toast(subidos ? `Gasto guardado con ${subidos} recibo(s)` : 'Gasto guardado');
    document.getElementById('fin-gas-monto').value = '';
    document.getElementById('fin-gas-proveedor').value = '';
    document.getElementById('fin-gas-pagado').value = '';
    document.getElementById('fin-gas-desc').value = '';
    closeSheet('fin-gas-sheet');
    refresh();
  }

  function updateDonTipoUi() {
    const tipo = document.getElementById('fin-don-tipo')?.value || 'monetaria';
    const esMonetaria = tipo === 'monetaria';
    const rowMon = document.getElementById('fin-don-monetaria-row');
    const rowEsp = document.getElementById('fin-don-especie-row');
    if (rowMon) rowMon.style.display = esMonetaria ? '' : 'none';
    if (rowEsp) rowEsp.style.display = esMonetaria ? 'none' : '';
  }

  function resetDonForm() {
    document.getElementById('fin-don-tipo').value = 'monetaria';
    document.getElementById('fin-don-fecha').value = todayISO();
    document.getElementById('fin-don-moneda').value = 'USD';
    document.getElementById('fin-don-monto').value = '';
    document.getElementById('fin-don-cantidad').value = '';
    document.getElementById('fin-don-unidad').value = '';
    document.getElementById('fin-don-donante').value = '';
    document.getElementById('fin-don-contacto').value = '';
    document.getElementById('fin-don-desc').value = '';
    soportesDonPendientes = [];
    const input = document.getElementById('fin-don-soportes');
    const info = document.getElementById('fin-don-soportes-info');
    if (input) input.value = '';
    if (info) info.textContent = 'Sin soportes seleccionados.';
    updateDonTipoUi();
  }

  function resetGasForm() {
    document.getElementById('fin-gas-fecha').value = todayISO();
    document.getElementById('fin-gas-moneda').value = 'USD';
    document.getElementById('fin-gas-monto').value = '';
    document.getElementById('fin-gas-proveedor').value = '';
    document.getElementById('fin-gas-pagado').value = '';
    document.getElementById('fin-gas-desc').value = '';
    recibosPendientes = [];
    const input = document.getElementById('fin-gas-recibos');
    const info = document.getElementById('fin-gas-recibos-info');
    if (input) input.value = '';
    if (info) info.textContent = 'Sin recibos seleccionados.';
  }

  async function renderStats() {
    const el = document.getElementById('fin-stats');
    if (!el) return;
    const [{ data: don }, { data: gas }] = await Promise.all([
      db.from('donaciones_grupo').select('monto,moneda').eq('grupo', GRUPO),
      db.from('gastos_grupo').select('monto,moneda').eq('grupo', GRUPO),
    ]);
    const donRows = don || [];
    const gasRows = gas || [];
    const donUSD = donRows.filter((r) => String(r.moneda || 'USD').toUpperCase() === 'USD')
      .reduce((s, r) => s + Number(r.monto || 0), 0);
    const gasUSD = gasRows.filter((r) => String(r.moneda || 'USD').toUpperCase() === 'USD')
      .reduce((s, r) => s + Number(r.monto || 0), 0);
    el.innerHTML = `
      <div class="stat"><b>${donRows.length}</b><span>donaciones registradas</span></div>
      <div class="stat"><b>${gasRows.length}</b><span>gastos registrados</span></div>
      <div class="stat"><b>${fmtMoney(donUSD, 'USD')}</b><span>donaciones en USD</span></div>
      <div class="stat"><b>${fmtMoney(gasUSD, 'USD')}</b><span>gastos en USD</span></div>
    `;
  }

  async function renderMovimientos() {
    const el = document.getElementById('fin-movs');
    if (!el) return;
    el.innerHTML = '<div class="empty">Cargando…</div>';
    const [{ data: don }, { data: gas }] = await Promise.all([
      db.from('donaciones_grupo')
        .select('id,fecha,tipo,monto,moneda,cantidad,unidad,descripcion,donante_nombre,created_at')
        .eq('grupo', GRUPO)
        .order('created_at', { ascending: false })
        .limit(25),
      db.from('gastos_grupo')
        .select('id,fecha_gasto,categoria,monto,moneda,descripcion,proveedor,pagado_por,created_at')
        .eq('grupo', GRUPO)
        .order('created_at', { ascending: false })
        .limit(25),
    ]);
    const donRows = don || [];
    const donIds = donRows.map((d) => d.id);
    const donRecMap = {};
    if (donIds.length) {
      const { data: ds } = await db.from('donacion_soportes').select('id,donacion_id,storage_path').in('donacion_id', donIds);
      for (const r of ds || []) {
        if (!donRecMap[r.donacion_id]) donRecMap[r.donacion_id] = [];
        donRecMap[r.donacion_id].push(r);
      }
    }
    const donMovs = [];
    for (const d of donRows) {
      const recs = donRecMap[d.id] || [];
      const urls = await Promise.all(recs.map((r) => signedUrlDon(r.storage_path)));
      const links = urls.filter(Boolean).map((u, idx) => `<a href="${esc(u)}" target="_blank" rel="noopener">Soporte ${idx + 1}</a>`).join(' · ');
      donMovs.push({
        kind: 'donacion',
        at: d.created_at,
        date: d.fecha,
        html: `<b>Donación · ${esc(d.tipo)}</b>
        <div class="vcard-meta">${esc(d.descripcion)}</div>
        <div class="vcard-meta">${d.monto ? `💰 ${fmtMoney(d.monto, d.moneda)}` : ''}${d.cantidad ? ` · 📦 ${d.cantidad} ${esc(d.unidad || 'unid.')}` : ''}${d.donante_nombre ? ` · 🙌 ${esc(d.donante_nombre)}` : ''}</div>
        <div class="vcard-meta">${links || 'Sin soportes adjuntos'}</div>`,
      });
    }
    const gasRows = gas || [];
    const gasIds = gasRows.map((g) => g.id);
    const recibosMap = {};
    if (gasIds.length) {
      const { data: recs } = await db.from('gasto_recibos').select('id,gasto_id,storage_path').in('gasto_id', gasIds);
      for (const r of recs || []) {
        if (!recibosMap[r.gasto_id]) recibosMap[r.gasto_id] = [];
        recibosMap[r.gasto_id].push(r);
      }
    }
    const gasMovs = [];
    for (const g of gasRows) {
      const recs = recibosMap[g.id] || [];
      const urls = await Promise.all(recs.map((r) => signedUrl(r.storage_path)));
      const links = urls.filter(Boolean).map((u, idx) => `<a href="${esc(u)}" target="_blank" rel="noopener">Recibo ${idx + 1}</a>`).join(' · ');
      gasMovs.push({
        kind: 'gasto',
        at: g.created_at,
        date: g.fecha_gasto,
        html: `<b>Gasto · ${esc(g.categoria)}</b>
        <div class="vcard-meta">${esc(g.descripcion)}</div>
        <div class="vcard-meta">💸 ${fmtMoney(g.monto, g.moneda)}${g.pagado_por ? ` · pagado por ${esc(g.pagado_por)}` : ''}${g.proveedor ? ` · ${esc(g.proveedor)}` : ''}</div>
        <div class="vcard-meta">${links || 'Sin recibos adjuntos'}</div>`,
      });
    }
    const all = [...donMovs, ...gasMovs].sort((a, b) => String(b.at).localeCompare(String(a.at)));
    if (!all.length) {
      el.innerHTML = '<div class="empty">Aún no hay movimientos.</div>';
      return;
    }
    el.innerHTML = all.map((m) => `
      <article class="vcard ${m.kind === 'gasto' ? 'warn' : ''}">
        <div class="vcard-h">
          ${m.html}
          <span class="badge">${fmtDate(m.date)}</span>
        </div>
      </article>
    `).join('');
  }

  async function refresh() {
    await renderStats();
    await renderMovimientos();
  }

  function bind() {
    resetDonForm();
    resetGasForm();
    document.getElementById('btn-fin-refresh')?.addEventListener('click', refresh);
    document.getElementById('btn-fin-new-don')?.addEventListener('click', () => {
      resetDonForm();
      openSheet('fin-don-sheet');
    });
    document.getElementById('btn-fin-new-gas')?.addEventListener('click', () => {
      resetGasForm();
      openSheet('fin-gas-sheet');
    });
    document.getElementById('fin-don-close')?.addEventListener('click', () => closeSheet('fin-don-sheet'));
    document.getElementById('btn-fin-cancel-don')?.addEventListener('click', () => closeSheet('fin-don-sheet'));
    document.getElementById('fin-gas-close')?.addEventListener('click', () => closeSheet('fin-gas-sheet'));
    document.getElementById('btn-fin-cancel-gas')?.addEventListener('click', () => closeSheet('fin-gas-sheet'));
    document.getElementById('btn-fin-save-don')?.addEventListener('click', saveDonacion);
    document.getElementById('btn-fin-save-gas')?.addEventListener('click', saveGasto);
    document.getElementById('fin-don-tipo')?.addEventListener('change', updateDonTipoUi);
    document.getElementById('fin-don-soportes')?.addEventListener('change', (e) => setSoportesDonPendientes(e.target.files));
    document.getElementById('fin-gas-recibos')?.addEventListener('change', (e) => setRecibosPendientes(e.target.files));
  }

  window.CC_FIN = { refresh, bind };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind);
  } else {
    bind();
  }
})();
