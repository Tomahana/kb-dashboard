// Zkopírujte jako supabase-config.js a doplňte hodnoty z Supabase Dashboard.
// supabase-config.js je v .gitignore — necommitujte do veřejného repozitáře.

window.KB_SUPABASE = {
  url: "https://VAS_PROJEKT.supabase.co",
  anonKey: "VAS_PUBLISHABLE_ANON_KEY",

  // Po přihlášení automaticky načíst e-maily ze Supabase (místo lokální kopie / kb.json)
  autoLoadOnLogin: true,

  auth: {
    // false = vypne přihlašovací bránu (jen pro vývoj)
    requireAuth: true,

    // Povolené e-mailové domény (prázdné = libovolný účet)
    allowedEmailDomains: ["uhk.cz"],

    // Automatické odhlášení po nečinnosti (minuty, 0 = vypnuto)
    sessionTimeoutMinutes: 480,

    // Při odhlášení vždy smazat lokální cache záznamů
    clearLocalDataOnLogout: false
  }
};
