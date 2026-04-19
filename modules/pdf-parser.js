(() => {
  async function parsePdfFile(file) {
    // Day-1 placeholder: no full PDF.js integration yet.
    // Keeps API shape for day-2 integration.
    if (!file) {
      return { ok: false, error: "no_file" };
    }
    return {
      ok: true,
      text: "",
      meta: {
        name: file.name || "unknown.pdf",
        size: file.size || 0,
        note: "PDF.js integration planned on Day 2"
      }
    };
  }

  self.PdfParser = {
    parsePdfFile
  };
})();
