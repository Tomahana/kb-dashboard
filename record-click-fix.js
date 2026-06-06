// Robust record opening for long Supabase KB_ID values.
// Avoids relying on inline onclick="openRecord('long id')".

(function () {
  function isOpenButton(target) {
    const btn = target.closest && target.closest("button");
    if (!btn) return null;
    const text = (btn.textContent || "").trim().toLowerCase();
    if (!text.includes("otevřít")) return null;
    if (!btn.closest("#records")) return null;
    return btn;
  }

  function getVisibleRecordByButton(btn) {
    const buttons = Array.from(document.querySelectorAll("#records button"))
      .filter(b => (b.textContent || "").toLowerCase().includes("otevřít"));
    const idx = buttons.indexOf(btn);
    if (idx < 0) return null;

    let data = [];
    try {
      data = typeof filteredRecords === "function" ? filteredRecords() : records;
    } catch (_) {
      data = Array.isArray(records) ? records : [];
    }
    return data[idx] || null;
  }

  document.addEventListener("click", function (event) {
    const btn = isOpenButton(event.target);
    if (!btn) return;

    const record = getVisibleRecordByButton(btn);
    if (!record) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const id = record.id || record.kb_id || record.KB_ID;
    if (id && typeof window.openRecord === "function") {
      window.openRecord(id);
    }
  }, true);
})();
