const SUPABASE_URL = 'https://xrgdfghiwjyrdckpjzdj.supabase.co/rest/v1/';
const SUPABASE_ANON_KEY = 'sb_publishable_0kk-1GHtUKwuGdWGlDBUHQ_VPlhBmh2';

async function supabaseFetch(path, params = {}) {
  const url = new URL(path.replace(/^\//, ''), SUPABASE_URL);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.json();
}
