const SUPABASE_URL = 'https://xrgdfghiwjyrdckpjzdj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhyZ2RmZ2hpd2p5cmRja3BqemRqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MjczMTcsImV4cCI6MjA5NjMwMzMxN30.nhNWO6macl4SuH-b9NA3KpWAVermc2nRTEdLp2i2gqA';

export async function supabaseFetch(path, params = {}) {
  const url = new URL(`/rest/v1/${path.replace(/^\//, '')}`, SUPABASE_URL);
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
