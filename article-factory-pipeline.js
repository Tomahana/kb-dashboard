// Klient pro Edge Function article-pipeline (Article Factory AI orchestrace).

(function () {
  const n = (s) => (s || "").toString().trim();

  function getBaseUrl() {
    const url = n(window.KB_SUPABASE?.url).replace(/\/$/, "");
    if (!url) throw new Error("Chybí KB_SUPABASE.url v supabase-config.js.");
    return `${url}/functions/v1/article-pipeline`;
  }

  async function getAuthHeaders() {
    const session = await window.kbAuth?.getSession?.();
    const token = session?.access_token;
    if (!token) throw new Error("Pro pipeline se nejdříve přihlaste.");
    return {
      Authorization: `Bearer ${token}`,
      apikey: n(window.KB_SUPABASE?.anonKey),
      "Content-Type": "application/json"
    };
  }

  async function invoke(action, payload = {}) {
    const headers = await getAuthHeaders();
    const res = await fetch(getBaseUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({ action, ...payload })
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch (_) {
      body = { error: text.slice(0, 500) };
    }
    if (!res.ok) {
      throw new Error(body.error || `Pipeline HTTP ${res.status}`);
    }
    return body;
  }

  async function ping() {
    return invoke("ping");
  }

  async function getStatus() {
    return invoke("status");
  }

  window.kbArticlePipeline = {
    invoke,
    ping,
    getStatus
  };
})();
