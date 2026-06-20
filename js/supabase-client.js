const SUPABASE_URL = 'https://xrgdfghiwjyrdckpjzdj.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0kk-1GHtUKwuGdWGlDBUHQ_VPlhBmh2';

async function supabaseFetch(path, params = {}) {
  const url = new URL(`/rest/v1/${path}`, SUPABASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json();
}
