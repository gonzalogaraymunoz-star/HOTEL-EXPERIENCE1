import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://lpirjwifzosdzgdncsbt.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TWENTY_API_KEY = process.env.TWENTY_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const TWENTY_BASE_URL = 'https://api.twenty.com/rest';
const HOTEL_EXPERIENCE_COMPANY_ID = 'c673ed2f-56ce-42c1-b53b-d6a14033d247';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' }
  });
}

function splitName(value = '') {
  const clean = String(value || '').trim();
  if (!clean) return { firstName: 'Lead', lastName: '' };
  const parts = clean.split(/\s+/);
  return {
    firstName: parts.shift() || 'Lead',
    lastName: parts.join(' ')
  };
}

function parseContact(value = '') {
  const text = String(value || '');
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
  const phone = text
    .split('|')
    .map((part) => part.trim())
    .find((part) => part && /\+?\d[\d\s().-]{6,}/.test(part) && !part.includes('@')) || null;
  return { email, phone };
}

async function twenty(path, options = {}) {
  const response = await fetch(`${TWENTY_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TWENTY_API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!response.ok) {
    const message = body?.message || body?.error || `Twenty HTTP ${response.status}`;
    throw new Error(message);
  }
  return body;
}

async function syncLead(sb, lead) {
  const { data: existing } = await sb
    .from('twenty_sync_records')
    .select('*')
    .eq('source_lead_id', lead.id)
    .maybeSingle();

  if (existing?.status === 'synced' && new Date(existing.updated_at || existing.synced_at || 0) >= new Date(lead.updated_at)) {
    return { leadId: lead.id, status: 'unchanged' };
  }

  const attempts = Number(existing?.attempts || 0) + 1;
  await sb.from('twenty_sync_records').upsert({
    source_lead_id: lead.id,
    status: 'syncing',
    attempts,
    updated_at: new Date().toISOString()
  }, { onConflict: 'source_lead_id' });

  try {
    const { firstName, lastName } = splitName(lead.reserva);
    const { email, phone } = parseContact(lead.contacto);

    let personId = existing?.twenty_person_id || null;
    if (!personId) {
      const person = await twenty('/people', {
        method: 'POST',
        body: JSON.stringify({
          name: { firstName, lastName },
          ...(email ? { emails: { primaryEmail: email } } : {}),
          ...(phone ? { phones: { primaryPhoneNumber: phone } } : {}),
          contactType: 'BUYER',
          preferredChannel: email ? 'EMAIL' : phone ? 'MESSAGING' : 'OTHER'
        })
      });
      personId = person?.data?.id || person?.id;
    }

    const leadPayload = {
      name: `${lead.codigo} · ${lead.reserva || 'Lead'}`,
      leadCode: lead.codigo,
      reservation: lead.reserva,
      passengers: lead.numero_pax ?? null,
      service: lead.servicio || null,
      ...(lead.precio_venta != null ? {
        salePrice: {
          amountMicros: Math.round(Number(lead.precio_venta) * 1000000),
          currencyCode: lead.moneda || 'CLP'
        }
      } : {}),
      currencyCode: lead.moneda || 'CLP',
      checkin: lead.checkin || null,
      checkout: lead.checkout || null,
      contact: lead.contacto || null,
      priority: lead.prioridad || null,
      lifecycleStage: lead.lifecycle_stage || lead.estado || 'nuevo',
      channel: lead.canal || null,
      clientId: HOTEL_EXPERIENCE_COMPANY_ID,
      ...(personId ? { personId } : {}),
      controlCentralId: `HOTEL-EXPERIENCE:${lead.codigo}`,
      controlCentralSource: 'LINK CONTROL CENTRAL',
      supabaseLeadId: lead.id
    };

    const remote = existing?.twenty_lead_id
      ? await twenty(`/leads/${existing.twenty_lead_id}`, { method: 'PATCH', body: JSON.stringify(leadPayload) })
      : await twenty('/leads', { method: 'POST', body: JSON.stringify(leadPayload) });

    const twentyLeadId = remote?.data?.id || remote?.id || existing?.twenty_lead_id;

    await sb.from('twenty_sync_records').upsert({
      source_lead_id: lead.id,
      twenty_lead_id: twentyLeadId,
      twenty_person_id: personId,
      status: 'synced',
      attempts,
      last_error: null,
      synced_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'source_lead_id' });

    return { leadId: lead.id, codigo: lead.codigo, status: 'synced', twentyLeadId, twentyPersonId: personId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sb.from('twenty_sync_records').upsert({
      source_lead_id: lead.id,
      status: 'error',
      attempts,
      last_error: message,
      updated_at: new Date().toISOString()
    }, { onConflict: 'source_lead_id' });
    return { leadId: lead.id, codigo: lead.codigo, status: 'error', error: message };
  }
}

export default async function handler(req) {
  if (req.method !== 'GET' && req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!SUPABASE_SERVICE_ROLE_KEY || !TWENTY_API_KEY) {
    return json({ error: 'Missing SUPABASE_SERVICE_ROLE_KEY or TWENTY_API_KEY' }, 500);
  }

  if (CRON_SECRET) {
    const auth = req.headers.get('authorization') || '';
    if (auth !== `Bearer ${CRON_SECRET}`) return json({ error: 'Unauthorized' }, 401);
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });

  const { data: leads, error } = await sb
    .from('leads')
    .select('*')
    .order('updated_at', { ascending: true })
    .limit(60);
  if (error) return json({ error: error.message }, 500);

  const results = [];
  for (const lead of leads || []) {
    results.push(await syncLead(sb, lead));
  }

  return json({
    ok: true,
    source: 'Supabase',
    target: 'Twenty',
    client: 'HOTEL-EXPERIENCE',
    processed: results.length,
    synced: results.filter((r) => r.status === 'synced').length,
    unchanged: results.filter((r) => r.status === 'unchanged').length,
    errors: results.filter((r) => r.status === 'error').length,
    results
  });
}
