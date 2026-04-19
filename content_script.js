(function () {
  if (!window.AdaptiveSelectors) {
    return;
  }

  const state = {
    lastPreview: null
  };
  const PENDING_SCHEDULE_KEY = "aiDocPendingSchedule";

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function scrapeTableData(selector) {
    const rows = document.querySelectorAll(selector || ".diary-table tr, .previous-records tr");
    const out = [];
    rows.forEach((row) => {
      const text = String(row.textContent || "").trim();
      if (text) {
        out.push(text);
      }
    });
    return out.slice(0, 20);
  }

  function matchesAny(text, hints) {
    const normalizedText = normalize(text);
    return hints.some((hint) => normalizedText.includes(normalize(hint)));
  }

  function readValueFromContainer(container) {
    if (!container) {
      return "";
    }
    const valueNode = container.querySelector("input, textarea, select, .value, [data-value]");
    if (valueNode && "value" in valueNode) {
      return String(valueNode.value || "").trim();
    }
    if (valueNode) {
      return String(valueNode.textContent || "").trim();
    }
    return "";
  }

  function findValueByLabel(hints) {
    const labels = Array.from(document.querySelectorAll("label"));
    for (let i = 0; i < labels.length; i += 1) {
      const label = labels[i];
      if (!matchesAny(label.textContent || "", hints)) {
        continue;
      }

      const forId = label.getAttribute("for");
      if (forId) {
        const linked = document.getElementById(forId);
        if (linked && "value" in linked) {
          return String(linked.value || "").trim();
        }
      }

      const local = readValueFromContainer(label.parentElement);
      if (local) {
        return local;
      }
    }

    const fields = Array.from(document.querySelectorAll("input, textarea, select, [contenteditable='true']"));
    for (let i = 0; i < fields.length; i += 1) {
      const el = fields[i];
      const descriptor = [
        el.getAttribute("aria-label"),
        el.getAttribute("placeholder"),
        el.getAttribute("name"),
        el.getAttribute("id")
      ]
        .filter(Boolean)
        .join(" ");

      if (matchesAny(descriptor, hints) && "value" in el) {
        return String(el.value || "").trim();
      }
    }

    return "";
  }

  function scrapePatientContext() {
    const fullNameFixed =
      findValueByLabel(["\u0444\u0438\u043e", "\u043f\u0430\u0446\u0438\u0435\u043d\u0442", "patient", "\u0430\u0442\u044b"]) || "";
    const diagnosisFixed =
      findValueByLabel(["\u0434\u0438\u0430\u0433\u043d\u043e\u0437", "\u043c\u043a\u0431", "diagnosis"]) || "";
    const ageFixed =
      findValueByLabel(["\u0432\u043e\u0437\u0440\u0430\u0441\u0442", "\u0434\u0430\u0442\u0430 \u0440\u043e\u0436\u0434\u0435\u043d\u0438\u044f", "age", "\u0436\u0430\u0441"]) || "";
    return {
      fullName: fullNameFixed,
      diagnosis: diagnosisFixed,
      age: ageFixed,
      prevRecords: scrapeTableData(".diary-table tr, .previous-records tr"),
      currentTab: document.title || ""
    };
    const fullName =
      window.AdaptiveSelectors.findTextNear(["фио", "пациент", "patient", "аты жөні"]) || "";
    const diagnosis =
      window.AdaptiveSelectors.findTextNear(["диагноз", "diagnosis", "мкб", "диагнозы"]) || "";
    const age =
      window.AdaptiveSelectors.findTextNear(["возраст", "дата рождения", "age", "жасы"]) || "";
    const prevRecords = scrapeTableData(".diary-table tr, .previous-records tr");
    const currentTab = document.title || "";
    return { fullName, diagnosis, age, prevRecords, currentTab };
  }

  function scrapeAvailableModules() {
    const nodes = document.querySelectorAll("a, button, [role='tab'], [data-page], .nav-item");
    const modules = [];
    nodes.forEach((el) => {
      const label = String(el.textContent || el.innerText || "").trim();
      if (!label) {
        return;
      }
      const page = String(el.getAttribute("data-page") || "").trim();
      const id = String(el.getAttribute("id") || "").trim();
      modules.push({ label, page, id });
    });
    return modules.slice(0, 30);
  }

  function fillForm(fields) {
    const map = {
      complaints: ["\u0436\u0430\u043b\u043e\u0431", "complaint", "\u0448\u0430\u0493\u044b\u043c"],
      anamnesis: ["\u0430\u043d\u0430\u043c\u043d\u0435\u0437", "\u0438\u0441\u0442\u043e\u0440\u0438\u044f \u0431\u043e\u043b\u0435\u0437\u043d\u0438"],
      objective: ["\u043e\u0431\u044a\u0435\u043a\u0442\u0438\u0432", "\u0441\u0442\u0430\u0442\u0443\u0441", "\u043e\u0441\u043c\u043e\u0442\u0440", "objective"],
      plan: ["\u043f\u043b\u0430\u043d", "\u043b\u0435\u0447\u0435\u043d\u0438\u0435", "plan"],
      recommendations: ["\u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0430\u0446", "recommendation"],
      diagnosis: ["\u0434\u0438\u0430\u0433\u043d\u043e\u0437", "\u043c\u043a\u0431", "diagnosis"],
      procedures: ["\u043f\u0440\u043e\u0446\u0435\u0434\u0443\u0440", "\u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d", "procedure"]
    };

    const missing = [];
    let filled = 0;
    Object.keys(fields || {}).forEach((key) => {
      const value = fields[key];
      if (value === null || value === undefined || value === "") {
        return;
      }
      const hints = map[key] || [key];
      const field = window.AdaptiveSelectors.findField(hints.concat([key]));
      if (!field) {
        missing.push(key);
        return;
      }
      window.AdaptiveSelectors.writeValue(field, value);
      filled += 1;
    });

    return { filled, missing };
  }

  function ensureScheduleRows(count) {
    const table = document.querySelector("table");
    if (!table) {
      return [];
    }

    const rows = Array.from(table.querySelectorAll("tr[data-procedure-index]"));
    while (rows.length < count) {
      const tr = document.createElement("tr");
      tr.setAttribute("data-procedure-index", String(rows.length + 1));
      ["procedure", "date", "time", "specialist"].forEach((name) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.name = name;
        td.appendChild(input);
        tr.appendChild(td);
      });
      table.appendChild(tr);
      rows.push(tr);
    }
    return rows;
  }

  function applySchedule(scheduleItems) {
    const items = Array.isArray(scheduleItems) ? scheduleItems.filter((item) => item && item.status === "ok") : [];
    if (!items.length) {
      return { applied: 0, missing: ["scheduleItems"] };
    }

    const rows = ensureScheduleRows(items.length);
    if (!rows.length) {
      return { applied: 0, missing: ["scheduleTable"] };
    }

    let applied = 0;
    items.forEach((item, index) => {
      const row = rows[index];
      if (!row) {
        return;
      }
      const values = {
        procedure: `${item.procedure || ""}${item.session ? ` ${item.session}/${item.total}` : ""}`.trim(),
        date: item.date || "",
        time: item.time || "",
        specialist: item.specialist || ""
      };
      Object.keys(values).forEach((name) => {
        const input = row.querySelector(`[name="${name}"]`);
        if (input) {
          window.AdaptiveSelectors.writeValue(input, values[name]);
        }
      });
      row.classList.add("ai-filled-schedule-row");
      applied += 1;
    });

    return { applied, missing: [] };
  }

  function queueScheduleForSchedulePage(payload) {
    chrome.storage.local.set({ [PENDING_SCHEDULE_KEY]: payload || {} }).catch(() => {});
    const navigated = window.AdaptiveSelectors.navigateTo("\u0440\u0430\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0435") ||
      window.AdaptiveSelectors.navigateTo("\u043d\u0430\u0437\u043d\u0430\u0447\u0435\u043d\u0438\u044f") ||
      window.AdaptiveSelectors.navigateTo("schedule");
    return Boolean(navigated);
  }

  function applyPendingScheduleIfPresent() {
    if (!document.querySelector("tr[data-procedure-index], table")) {
      return;
    }

    chrome.storage.local.get([PENDING_SCHEDULE_KEY], (data) => {
      const payload = data && data[PENDING_SCHEDULE_KEY];
      if (!payload || !Array.isArray(payload.scheduleItems)) {
        return;
      }
      const result = applySchedule(payload.scheduleItems || []);
      if (result.applied > 0) {
        clickSaveButton();
        chrome.storage.local.remove([PENDING_SCHEDULE_KEY]).catch(() => {});
        chrome.runtime.sendMessage({
          type: "TIMELINE_FROM_CONTENT",
          text: `Schedule applied: ${result.applied} rows`
        });
      }
    });
  }

  function clickSaveButton() {
    const candidates = document.querySelectorAll("button, a, [role='button'], input[type='button']");
    for (let i = 0; i < candidates.length; i += 1) {
      const el = candidates[i];
      const text = String(el.textContent || el.value || "").toLowerCase();
      if (
        text.includes("сохран") ||
        text.includes("submit") ||
        text.includes("утверд") ||
        text.includes("сақта")
      ) {
        el.click();
        return true;
      }
    }
    return false;
  }

  function parseDictationHeuristic(transcript, context) {
    const text = String(transcript || "").trim();
    const lower = text.toLowerCase();

    function clean(value) {
      return String(value || "")
        .replace(/\s+/g, " ")
        .replace(/^[,.:;\-\s]+/, "")
        .trim();
    }

    function firstMatch(pattern) {
      const match = text.match(pattern);
      return match ? clean(match[1] || match[0]) : "";
    }

    const complaints =
      firstMatch(/(?:\u0436\u0430\u043b\u0443\u0435\u0442\u0441\u044f\s+\u043d\u0430|\u0436\u0430\u043b\u043e\u0431\u044b?\s*:?)\s*([^.]*)/i) ||
      null;
    const anamnesis =
      firstMatch(/((?:\u043f\u0440\u043e\u0445\u043e\u0434\u0438\u0442|\u0440\u0430\u043d\u0435\u0435|\u0443\u0445\u0443\u0434\u0448\u0435\u043d|\u0434\u0438\u043d\u0430\u043c\u0438\u043a)[^.]*\.)/i) ||
      null;
    const objective =
      firstMatch(/((?:\u0441\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435|\u0441\u043e\u0437\u043d\u0430\u043d\u0438\u0435|\u043c\u044b\u0448\u0435\u0447\u043d\u044b\u0439|\u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0446|\u043f\u043e\u0445\u043e\u0434\u043a)[^.]*\.(?:\s*(?:\u0441\u043e\u0437\u043d\u0430\u043d\u0438\u0435|\u043c\u044b\u0448\u0435\u0447\u043d\u044b\u0439|\u043a\u043e\u043e\u0440\u0434\u0438\u043d\u0430\u0446|\u043f\u043e\u0445\u043e\u0434\u043a)[^.]*)*)/i) ||
      null;
    const plan =
      firstMatch(/((?:\u0440\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0443\u0435\u0442\u0441\u044f|\u043d\u0430\u0437\u043d\u0430\u0447\u0438\u0442\u044c)[^.]*\.)/i) ||
      null;
    const recommendations =
      firstMatch(/((?:\u043f\u0440\u043e\u0434\u043e\u043b\u0436\u0438\u0442\u044c|\u0441\u043e\u0431\u043b\u044e\u0434\u0430\u0442\u044c|\u0432\u044b\u043f\u043e\u043b\u043d\u044f\u0442\u044c)[^.]*\.)/i) ||
      null;

    const procedures = [];
    if (lower.includes("\u043b\u0444\u043a")) {
      procedures.push("\u041b\u0424\u041a");
    }
    if (lower.includes("\u043c\u0430\u0441\u0441\u0430\u0436")) {
      procedures.push("\u043c\u0430\u0441\u0441\u0430\u0436");
    }
    if (lower.includes("\u043f\u0441\u0438\u0445\u043e\u043b\u043e\u0433")) {
      procedures.push("\u043a\u043e\u043d\u0441\u0443\u043b\u044c\u0442\u0430\u0446\u0438\u044f \u043f\u0441\u0438\u0445\u043e\u043b\u043e\u0433\u0430");
    }
    if (lower.includes("\u0444\u0438\u0437\u0438\u043e")) {
      procedures.push("\u0444\u0438\u0437\u0438\u043e\u0442\u0435\u0440\u0430\u043f\u0438\u044f");
    }
    if (lower.includes("\u0438\u043d\u0433\u0430\u043b\u044f\u0446")) {
      procedures.push("\u0438\u043d\u0433\u0430\u043b\u044f\u0446\u0438\u044f");
    }

    return {
      fields: {
        complaints,
        anamnesis,
        objective,
        plan,
        recommendations,
        procedures: procedures.length ? procedures : null,
        diagnosis: context && context.diagnosis ? context.diagnosis : null
      }
    };
  }

  function computeInlineHints(transcript) {
    const t = normalize(transcript);
    const hints = [];
    if (!t) {
      return hints;
    }

    const vocab = [
      "кашель",
      "слабость",
      "головная боль",
      "мышечный тонус повышен",
      "ЛФК",
      "массаж",
      "психолог",
      "объективный статус",
      "анамнез"
    ];

    const lastToken = t.split(" ").pop() || "";
    vocab.forEach((item) => {
      const low = normalize(item);
      if (low.includes(lastToken) && !t.includes(low)) {
        hints.push(item);
      }
    });
    return hints.slice(0, 6);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (!message || typeof message !== "object") {
      return false;
    }

    if (message.type === "SCRAPE_CONTEXT_REQUEST") {
      sendResponse({
        ok: true,
        context: scrapePatientContext(),
        modules: scrapeAvailableModules()
      });
      return false;
    }

    if (message.type === "NAVIGATE_TO") {
      const ok = window.AdaptiveSelectors.navigateTo(message.target || "");
      sendResponse({ ok });
      return false;
    }

    if (message.type === "PARSE_ON_PAGE") {
      const context = scrapePatientContext();
      const parsed = parseDictationHeuristic(message.transcript || "", context);
      state.lastPreview = parsed;
      sendResponse({
        ok: true,
        preview: parsed,
        context,
        hints: computeInlineHints(message.transcript || "")
      });
      return false;
    }

    if (message.type === "INLINE_HINTS_REQUEST") {
      sendResponse({
        ok: true,
        hints: computeInlineHints(message.text || ""),
        modules: scrapeAvailableModules()
      });
      return false;
    }

    if (message.type === "SAVE_FORM") {
      const payload = message.preview || state.lastPreview || {};
      if (payload.mode === "schedule" || Array.isArray(payload.scheduleItems)) {
        if (!document.querySelector("tr[data-procedure-index]")) {
          const navigationStarted = queueScheduleForSchedulePage(payload);
          sendResponse({
            ok: Boolean(navigationStarted),
            schedule: { applied: 0, missing: navigationStarted ? [] : ["schedulePage"] },
            navigating: Boolean(navigationStarted)
          });
          return false;
        }
        const schedule = applySchedule(payload.scheduleItems || []);
        const saved = clickSaveButton();
        sendResponse({ ok: true, schedule, savedClick: saved });
        return false;
      }
      const result = fillForm(payload.fields || {});
      const saved = clickSaveButton();
      sendResponse({ ok: true, fill: result, savedClick: saved });
      return false;
    }

    if (message.type === "APPLY_PENDING_SCHEDULE") {
      chrome.storage.local.get([PENDING_SCHEDULE_KEY], (data) => {
        const payload = data && data[PENDING_SCHEDULE_KEY];
        const result = applySchedule((payload && payload.scheduleItems) || []);
        if (result.applied > 0) {
          chrome.storage.local.remove([PENDING_SCHEDULE_KEY]).catch(() => {});
          clickSaveButton();
        }
        sendResponse({ ok: result.applied > 0, schedule: result });
      });
      return true;
    }

    return false;
  });

  applyPendingScheduleIfPresent();
})();
