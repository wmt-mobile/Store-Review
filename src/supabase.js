// Minimal PostgREST client (server-side only, service-role key). No extra dependency.
export const supabaseEnabled = () => Boolean(process.env.SUPABASE_URL && (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY));

function base() {
  const url = process.env.SUPABASE_URL.replace(/\/$/, '');
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return { url: `${url}/rest/v1`, key };
}

async function req(method, path, { body, prefer, headers = {} } = {}) {
  const { url, key } = base();
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${url}/${path}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        ...(prefer ? { Prefer: prefer } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if ((res.status >= 500 || res.status === 429) && attempt < 2) {
      await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    const text = await res.text();
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const e = new Error(`supabase ${method} ${path.split('?')[0]}: ${json?.message || res.status}`);
      e.status = res.status;
      e.details = json;
      throw e;
    }
    return json;
  }
}

const qs = (o = {}) => Object.entries(o).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');

export const db = {
  select: (table, query = {}) => req('GET', `${table}?${qs({ select: '*', ...query })}`),
  insert: (table, rows, { returning = true, ignoreDuplicates = false, onConflict } = {}) =>
    req('POST', `${table}${onConflict ? `?on_conflict=${onConflict}` : ''}`, {
      body: rows,
      prefer: [returning ? 'return=representation' : 'return=minimal', ignoreDuplicates ? 'resolution=ignore-duplicates' : null].filter(Boolean).join(','),
    }),
  upsert: (table, rows, onConflict, { returning = true } = {}) =>
    req('POST', `${table}?on_conflict=${onConflict}`, {
      body: rows,
      prefer: `resolution=merge-duplicates,${returning ? 'return=representation' : 'return=minimal'}`,
    }),
  update: (table, filter, patch) => req('PATCH', `${table}?${qs(filter)}`, { body: patch, prefer: 'return=representation' }),
  delete: (table, filter) => req('DELETE', `${table}?${qs(filter)}`, { prefer: 'return=minimal' }),
};
