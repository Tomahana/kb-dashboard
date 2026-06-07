// Přihlášení přes Supabase Auth – brána před přístupem k interní znalostní bázi.

(function () {
  const IDLE_CHECK_MS = 60_000;
  let client = null;
  let idleTimer = null;
  let lastActivity = Date.now();

  function cfg() {
    return window.KB_SUPABASE || {};
  }

  function authCfg() {
    return cfg().auth || {};
  }

  function el(id) {
    return document.getElementById(id);
  }

  function n(s) {
    return (s || "").toString().trim();
  }

  function requireAuth() {
    return authCfg().requireAuth !== false;
  }

  function allowedDomains() {
    const raw = authCfg().allowedEmailDomains;
    if (!raw || !raw.length) return [];
    return raw.map(d => n(d).replace(/^@/, "").toLowerCase()).filter(Boolean);
  }

  function sessionTimeoutMs() {
    const minutes = Number(authCfg().sessionTimeoutMinutes);
    if (!minutes || minutes <= 0) return 0;
    return minutes * 60_000;
  }

  function emailAllowed(email) {
    const domains = allowedDomains();
    if (!domains.length) return true;
    const lower = n(email).toLowerCase();
    return domains.some(domain => lower.endsWith(`@${domain}`));
  }

  function getClient() {
    if (client) return client;
    const { url, anonKey } = cfg();
    if (!url || !anonKey) {
      throw new Error("Chybí supabase-config.js s Project URL a anon key.");
    }
    if (!window.supabase?.createClient) {
      throw new Error("Supabase JS knihovna není načtená.");
    }
    client = window.supabase.createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
    return client;
  }

  function setLocked(locked) {
    document.body.classList.toggle("auth-locked", locked);
    const overlay = el("authOverlay");
    if (overlay) overlay.hidden = !locked;
  }

  function setAuthUserLabel(user) {
    const node = el("authUserLabel");
    if (!node) return;
    if (!user) {
      node.textContent = "";
      node.hidden = true;
      return;
    }
    node.textContent = user.email || "Přihlášen";
    node.hidden = false;
  }

  function touchActivity() {
    lastActivity = Date.now();
  }

  function bindActivityTracking() {
    ["click", "keydown", "mousemove", "scroll", "touchstart"].forEach(evt => {
      document.addEventListener(evt, touchActivity, { passive: true });
    });
  }

  async function checkIdleTimeout() {
    const timeout = sessionTimeoutMs();
    if (!timeout || !requireAuth()) return;
    const session = (await getClient().auth.getSession()).data.session;
    if (!session) return;
    if (Date.now() - lastActivity > timeout) {
      await signOut({ reason: "idle" });
    }
  }

  function startIdleWatch() {
    if (idleTimer) clearInterval(idleTimer);
    idleTimer = setInterval(() => {
      checkIdleTimeout().catch(console.error);
    }, IDLE_CHECK_MS);
  }

  async function ensureSessionValid(session) {
    const user = session?.user;
    if (!user) return null;
    if (!emailAllowed(user.email)) {
      await getClient().auth.signOut();
      throw new Error(`Účet ${user.email} nemá povolený e-mail pro tento dashboard.`);
    }
    return user;
  }

  async function applyAuthState(session) {
    if (!requireAuth()) {
      setLocked(false);
      setAuthUserLabel(null);
      document.dispatchEvent(new CustomEvent("kb:auth-ready", { detail: { user: null, skipped: true } }));
      return;
    }

    try {
      const user = await ensureSessionValid(session);
      if (user) {
        setLocked(false);
        setAuthUserLabel(user);
        touchActivity();
        document.dispatchEvent(new CustomEvent("kb:auth-ready", { detail: { user } }));
        return;
      }
    } catch (error) {
      showAuthError(error.message || String(error));
    }

    setLocked(true);
    setAuthUserLabel(null);
    document.dispatchEvent(new CustomEvent("kb:auth-locked"));
  }

  function showAuthError(message) {
    const box = el("authError");
    if (!box) return;
    box.textContent = message || "";
    box.hidden = !message;
  }

  async function signInWithPassword(email, password) {
    if (!emailAllowed(email)) {
      throw new Error(`Přihlášení je povoleno jen pro domény: ${allowedDomains().map(d => `@${d}`).join(", ")}`);
    }
    const { data, error } = await getClient().auth.signInWithPassword({ email, password });
    if (error) throw error;
    await applyAuthState(data.session);
    showAuthError("");
    return data.user;
  }

  async function sendPasswordReset(email) {
    if (!n(email)) throw new Error("Zadejte e-mail pro obnovení hesla.");
    const redirectTo = `${location.origin}${location.pathname}`;
    const { error } = await getClient().auth.resetPasswordForEmail(email, { redirectTo });
    if (error) throw error;
  }

  async function signOut(options = {}) {
    const supa = getClient();
    await supa.auth.signOut();
    if (options.clearLocalData || authCfg().clearLocalDataOnLogout) {
      [
        "kb-dashboard-records-v1",
        "kb-dashboard-topics-v1",
        "kb-dashboard-ai-settings-v1",
        "kb-dashboard-task-export-v1"
      ].forEach(key => localStorage.removeItem(key));
    }
    setLocked(requireAuth());
    setAuthUserLabel(null);
    showAuthError(options.reason === "idle" ? "Byli jste odhlášeni z důvodu nečinnosti." : "");
    document.dispatchEvent(new CustomEvent("kb:auth-signed-out", { detail: options }));
  }

  function injectAuthUi() {
    if (el("authOverlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "authOverlay";
    overlay.className = "authOverlay";
    overlay.innerHTML = `
      <div class="authCard">
        <h2>KB Dashboard</h2>
        <p class="hint">Interní znalostní báze — přihlaste se účtem Supabase.</p>
        <form id="authForm" class="authForm">
          <label>E-mail
            <input id="authEmail" type="email" autocomplete="username" required />
          </label>
          <label>Heslo
            <input id="authPassword" type="password" autocomplete="current-password" required />
          </label>
          <p id="authError" class="authError" hidden></p>
          <button id="authSubmitBtn" type="submit" class="button accent full">Přihlásit se</button>
        </form>
        <div class="authLinks">
          <button id="authResetBtn" type="button" class="linkish">Zapomenuté heslo</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const foot = document.querySelector(".sidebarFoot");
    if (foot && !el("authUserLabel")) {
      const userLabel = document.createElement("p");
      userLabel.id = "authUserLabel";
      userLabel.className = "authUserLabel";
      userLabel.hidden = true;
      const logoutBtn = document.createElement("button");
      logoutBtn.id = "authLogoutBtn";
      logoutBtn.type = "button";
      logoutBtn.className = "button secondary full authLogoutBtn";
      logoutBtn.textContent = "Odhlásit";
      foot.insertBefore(logoutBtn, foot.firstChild);
      foot.insertBefore(userLabel, logoutBtn);
      logoutBtn.addEventListener("click", () => {
        const clear = confirm("Odhlásit a smazat lokální kopii dat v prohlížeči?\n\nOK = ano, Zrušit = odhlásit bez mazání");
        signOut({ clearLocalData: clear });
      });
    }

    el("authForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = el("authSubmitBtn");
      const prev = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Přihlašuji…";
      showAuthError("");
      try {
        await signInWithPassword(el("authEmail").value, el("authPassword").value);
      } catch (error) {
        showAuthError(error.message || "Přihlášení se nezdařilo.");
      } finally {
        btn.disabled = false;
        btn.textContent = prev;
      }
    });

    el("authResetBtn").addEventListener("click", async () => {
      const email = n(el("authEmail").value);
      try {
        await sendPasswordReset(email);
        alert("Odkaz pro obnovení hesla byl odeslán na " + email);
      } catch (error) {
        showAuthError(error.message || "Odeslání resetu hesla selhalo.");
      }
    });
  }

  async function initAuth() {
    injectAuthUi();
    bindActivityTracking();
    startIdleWatch();

    const supa = getClient();
    const { data } = await supa.auth.getSession();
    await applyAuthState(data.session);

    supa.auth.onAuthStateChange(async (_event, session) => {
      await applyAuthState(session);
    });
  }

  window.kbAuth = {
    getClient,
    requireAuth,
    signInWithPassword,
    signOut,
    sendPasswordReset,
    getSession: async () => (await getClient().auth.getSession()).data.session,
    getUser: async () => (await getClient().auth.getUser()).data.user
  };

  document.addEventListener("DOMContentLoaded", () => {
    initAuth().catch((error) => {
      console.error(error);
      if (requireAuth()) {
        setLocked(true);
        showAuthError("Chyba inicializace přihlášení: " + (error.message || error));
      }
    });
  });
})();
