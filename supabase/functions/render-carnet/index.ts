import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { renderCuidadorasCarnetPdf } from './render-pdf.ts';
import type { CarnetSnapshot, PlantillaConfig } from './template-cuidadoras.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

type JobRow = {
  id: string;
  voluntario_id: string;
  grupo: string;
  snapshot: CarnetSnapshot;
  regeneracion: boolean;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!supabaseUrl || !serviceKey) {
      throw new Error('Missing Supabase env');
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let jobId: string | null = null;
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        jobId = body?.job_id ?? null;
      } catch {
        jobId = null;
      }
    }

    const { data: claimData, error: claimErr } = await admin.rpc('claim_carnet_job', {
      p_job_id: jobId,
    });

    if (claimErr) throw claimErr;
    if (!claimData?.ok || !claimData?.job) {
      return json({ ok: false, error: claimData?.error ?? 'No hay jobs en cola' });
    }

    const job = claimData.job as JobRow;
    const snap = (job.snapshot ?? {}) as CarnetSnapshot;
    const fotoPath = snap.foto_storage_path;

    if (!fotoPath) {
      await failJob(admin, job.id, 'Falta foto en el snapshot');
      return json({ ok: false, error: 'Falta foto' });
    }

    const { data: plantilla } = await admin
      .from('carnet_plantillas')
      .select('config')
      .eq('grupo', job.grupo)
      .eq('activo', true)
      .maybeSingle();

    const config = (plantilla?.config ?? null) as PlantillaConfig | null;
    const slug = config?.template_slug ?? 'cuidadoras_caracas_v3';
    const implemented = ['cuidadoras_caracas_v1', 'cuidadoras_caracas_v2', 'cuidadoras_caracas_v3'];

    if (!implemented.includes(slug)) {
      await failJob(admin, job.id, 'Plantilla no implementada');
      return json({ ok: false, error: 'Plantilla no implementada' });
    }

    let bgBytes: Uint8Array | null = null;
    let bgMime = config?.background_mime_type ?? 'image/png';
    const bgPath = config?.background_storage_path;
    if (bgPath) {
      const { data: bgBlob, error: bgErr } = await admin.storage
        .from('carnet-plantillas')
        .download(bgPath);
      if (bgErr || !bgBlob) {
        await failJob(admin, job.id, 'No se pudo leer el fondo del carnet');
        return json({ ok: false, error: 'No se pudo leer el fondo del carnet' });
      }
      bgBytes = new Uint8Array(await bgBlob.arrayBuffer());
    }

    const { data: photoBlob, error: photoErr } = await admin.storage
      .from('voluntario-fotos')
      .download(fotoPath);

    if (photoErr || !photoBlob) {
      await failJob(admin, job.id, 'No se pudo leer la foto');
      return json({ ok: false, error: 'No se pudo leer la foto' });
    }

    const photoBytes = new Uint8Array(await photoBlob.arrayBuffer());
    const pdfBytes = await renderCuidadorasCarnetPdf(
      snap,
      photoBytes,
      snap.foto_mime_type ?? 'image/jpeg',
      config,
      bgBytes,
      bgMime,
    );

    const outPath = `${job.grupo}/${job.voluntario_id}/${job.id}.pdf`;
    const { error: upErr } = await admin.storage
      .from('carnet-generados')
      .upload(outPath, pdfBytes, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (upErr) {
      await failJob(admin, job.id, 'No se pudo guardar el PDF');
      throw upErr;
    }

    const { data: doneData, error: doneErr } = await admin.rpc('completar_carnet_job', {
      p_job_id: job.id,
      p_output_storage_path: outPath,
      p_ok: true,
      p_error: null,
    });

    if (doneErr) throw doneErr;

    const oldPaths = (doneData?.old_storage_paths as string[] | undefined)?.filter(Boolean);
    if (oldPaths?.length) {
      const { error: rmErr } = await admin.storage.from('carnet-generados').remove(oldPaths);
      if (rmErr) console.warn('No se pudieron borrar PDFs viejos:', rmErr.message);
    }

    return json({
      ok: true,
      job_id: job.id,
      output_storage_path: outPath,
      completar: doneData,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error al generar carnet';
    return json({ ok: false, error: msg }, 500);
  }
});

async function failJob(
  admin: ReturnType<typeof createClient>,
  jobId: string,
  message: string,
) {
  await admin.rpc('completar_carnet_job', {
    p_job_id: jobId,
    p_output_storage_path: '',
    p_ok: false,
    p_error: message,
  });
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Invocación:
 * - Tras solicitar_carnet: supabase.functions.invoke('render-carnet', { body: { job_id } })
 * - O POST sin body: procesa el siguiente job queued (cron / manual)
 * Deploy: supabase functions deploy render-carnet
 */
