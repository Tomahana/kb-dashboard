// Robust record opening: entire cards/rows are clickable for classification.
// Avoids inline onclick with long Supabase KB_ID values.

(function () {
  function shouldIgnoreClick(target) {
    return !!(
      target.closest("input, button, a, label.recordSelectWrap, .recordSelectWrap, .recordActions button")
    );
  }

  function findRecordElement(target) {
    return target.closest?.(".record[data-record-id], tr[data-record-id], [data-open-record]");
  }

  function openRecordById(id) {
    if (!id || typeof window.openRecord !== "function") return;
    window.openRecord(id);
  }

  document.addEventListener("click", function (event) {
    if (shouldIgnoreClick(event.target)) return;

    const host = findRecordElement(event.target);
    if (!host || !host.closest("#records")) return;

    const id = host.dataset.recordId || host.dataset.openRecord;
    if (!id) return;

    event.preventDefault();
    openRecordById(id);
  }, true);

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    const host = findRecordElement(event.target);
    if (!host || !host.closest("#records")) return;
    if (shouldIgnoreClick(event.target)) return;
    const id = host.dataset.recordId || host.dataset.openRecord;
    if (!id) return;
    event.preventDefault();
    openRecordById(id);
  });
})();
