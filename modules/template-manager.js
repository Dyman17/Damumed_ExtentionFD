(() => {
  const STORAGE_KEY = "doctorTemplates";

  async function loadTemplates() {
    const data = await chrome.storage.local.get([STORAGE_KEY]);
    return Array.isArray(data[STORAGE_KEY]) ? data[STORAGE_KEY] : [];
  }

  async function saveTemplates(list) {
    const safe = Array.isArray(list) ? list : [];
    await chrome.storage.local.set({ [STORAGE_KEY]: safe });
    return safe;
  }

  async function addTemplate(name, content) {
    const current = await loadTemplates();
    const next = [
      ...current,
      {
        id: `tpl_${Date.now()}`,
        name: String(name || "template"),
        content: String(content || ""),
        createdAt: new Date().toISOString()
      }
    ];
    await saveTemplates(next);
    return next;
  }

  self.TemplateManager = {
    loadTemplates,
    saveTemplates,
    addTemplate
  };
})();
