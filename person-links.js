// Propojení záznamů v modulech s centrální tabulkou kb_persons (osobni_cislo jako obchodní klíč).

(function () {
  const LINKS = {
    resitel: {
      idField: "resitel_id",
      cisloField: "resitel_osobni_cislo",
      labelField: "resitel"
    },
    odpovedna_osoba: {
      cisloField: "odpovedna_osoba_osobni_cislo",
      labelField: "odpovedna_osoba"
    },
    odesilatel: {
      cisloField: "odesilatel_osobni_cislo",
      labelField: "odesilatel",
      matchEmail: true
    },
    gestor: {
      cisloField: "gestor_osobni_cislo",
      labelField: "gestor",
      emailField: "email"
    }
  };

  const MODULE_TABLES = [
    { module: "interni-souteze", table: "kb_competition_applications", role: "resitel" },
    { module: "interni-souteze", table: "kb_competition_supported", role: "resitel" },
    { module: "terminy", table: "kb_deadlines", role: "odpovedna_osoba" },
    { module: "pcr-vyzkum", table: "kb_pcr_research_topics", role: "gestor" },
    { module: "emaily", table: "kb_records", role: "odesilatel" },
    { module: "emaily", table: "kb_records", role: "odpovedna_osoba" }
    // budoucí: kb_publications (autor), kb_vysledky (resitel)
  ];

  function n(s) {
    return (s || "").toString().trim();
  }

  function getRegistry() {
    return MODULE_TABLES.map(row => ({ ...row, config: LINKS[row.role] }));
  }

  function resolvePerson(item, role) {
    if (!item) return null;
    const config = LINKS[role];
    if (!config) return null;
    const kb = window.kbPersons;
    if (!kb) return null;
    if (config.idField && item[config.idField]) {
      const byId = kb.getPerson?.(item[config.idField]);
      if (byId) return byId;
    }
    if (config.cisloField && item[config.cisloField]) {
      const byCislo = kb.getPersonByOsobniCislo?.(item[config.cisloField]);
      if (byCislo) return byCislo;
    }
    if (config.emailField && item[config.emailField]) {
      const email = n(item[config.emailField]).toLowerCase();
      const persons = kb.getPersons?.() || [];
      const byEmailField = persons.find(p => n(p.email).toLowerCase() === email);
      if (byEmailField) return byEmailField;
    }
    if (config.matchEmail && config.labelField) {
      const label = n(item[config.labelField]).toLowerCase();
      if (label.includes("@")) {
        const persons = kb.getPersons?.() || [];
        const byEmail = persons.find(p => n(p.email).toLowerCase() === label);
        if (byEmail) return byEmail;
      }
    }
    return null;
  }

  function personDisplay(item, role) {
    const config = LINKS[role];
    const person = resolvePerson(item, role);
    if (person) return window.kbPersons?.personLabel?.(person) || "";
    return config?.labelField ? n(item?.[config.labelField]) : "";
  }

  function applyPersonLink(item, person, role) {
    const config = LINKS[role];
    const result = { ...item };
    if (!config) return result;
    if (config.idField) result[config.idField] = person?.id || null;
    if (config.cisloField) result[config.cisloField] = person?.osobni_cislo || null;
    if (config.labelField) {
      result[config.labelField] = person
        ? (window.kbPersons?.personLabel?.(person) || "")
        : n(result[config.labelField]);
    }
    return result;
  }

  function clearPersonLink(item, role) {
    const config = LINKS[role];
    const result = { ...item };
    if (!config) return result;
    if (config.idField) result[config.idField] = null;
    if (config.cisloField) result[config.cisloField] = null;
    return result;
  }

  function personSelectId(item, role) {
    return resolvePerson(item, role)?.id || "";
  }

  window.kbPersonLinks = {
    LINKS,
    MODULE_TABLES,
    getRegistry,
    resolvePerson,
    personDisplay,
    applyPersonLink,
    clearPersonLink,
    personSelectId
  };
})();
