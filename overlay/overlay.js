(function () {
  const ROOT_ID = "ai-doc-agent-overlay";
  if (document.getElementById(ROOT_ID)) {
    return;
  }

  const SpeechCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
  const SUGGESTION_MODULE_PREFIX = "__module__:";
  const STYLE_ID = "ai-doc-agent-overlay-inline-style";
  const STATE_KEY = "aiDocOverlayState";
  const MAX_LOGS = 60;

  function now() {
    return new Date().toLocaleTimeString("ru-RU", { hour12: false });
  }

  function runtimeMessage(message) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(message, (response) => {
        resolve(response || {});
      });
    });
  }

  function injectCriticalStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
      #ai-doc-agent-overlay { position: fixed; right: 16px; bottom: 16px; width: 430px; max-width: calc(100vw - 32px); max-height: 84vh; overflow: auto; z-index: 2147483647; border: 1px solid #b7d8d1; border-radius: 18px; background: #fbfffd; box-shadow: 0 22px 60px rgba(15, 23, 42, .24); font: 14px/1.42 "Segoe UI", Tahoma, sans-serif; color: #172033; }
      #ai-doc-agent-overlay * { box-sizing: border-box; }
      #ai-doc-agent-overlay .head { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid #d8ebe7; background: linear-gradient(135deg, #e9fbf7 0%, #f7fffd 100%); }
      #ai-doc-agent-overlay .head strong { color: #0f172a; font-weight: 700; }
      #ai-doc-agent-overlay .title { display: flex; align-items: center; gap: 8px; min-width: 0; }
      #ai-doc-agent-overlay .window-controls { display: flex; align-items: center; gap: 6px; }
      #ai-doc-agent-overlay .icon-btn { min-width: 30px; min-height: 28px; padding: 3px 8px; border-radius: 8px; line-height: 1; }
      #ai-doc-agent-overlay .pill { flex: 0 0 auto; min-width: 70px; border: 1px solid #0f766e; color: #0f766e; background: #fff; border-radius: 999px; font-size: 12px; line-height: 1; padding: 5px 10px; text-align: center; }
      #ai-doc-agent-overlay[data-recording="1"] .pill { color: #991b1b; border-color: #ef4444; background: #fef2f2; }
      #ai-doc-agent-overlay[data-collapsed="1"] { width: 260px; }
      #ai-doc-agent-overlay[data-collapsed="1"] .body { display: none; }
      #ai-doc-agent-overlay[data-collapsed="1"] .head { border-bottom: 0; }
      #ai-doc-agent-overlay .body { padding: 12px 14px 14px; }
      #ai-doc-agent-overlay .hero { border: 1px solid #d7ebe6; border-radius: 14px; padding: 12px; margin-bottom: 10px; background: linear-gradient(135deg, #0f766e 0%, #0b9384 100%); color: #fff; }
      #ai-doc-agent-overlay .hero-title { font-weight: 800; font-size: 15px; margin-bottom: 3px; }
      #ai-doc-agent-overlay .hero-sub { color: rgba(255,255,255,.86); font-size: 12px; }
      #ai-doc-agent-overlay .row { display: flex; gap: 8px; margin-bottom: 8px; align-items: center; }
      #ai-doc-agent-overlay .action-row { flex-wrap: wrap; }
      #ai-doc-agent-overlay .action-row button { flex: 1 1 auto; min-width: 112px; }
      #ai-doc-agent-overlay .control-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
      #ai-doc-agent-overlay .action-row.compact button { min-width: 82px; }
      #ai-doc-agent-overlay button, #ai-doc-agent-overlay textarea { border: 1px solid #cbd5df; border-radius: 8px; font: inherit; }
      #ai-doc-agent-overlay button { min-height: 40px; background: #fff; color: #1f2937; cursor: pointer; padding: 8px 11px; text-align: center; white-space: normal; }
      #ai-doc-agent-overlay button.primary { background: #087568; border-color: #087568; color: #fff; font-weight: 700; }
      #ai-doc-agent-overlay button.ghost { background: #f8fafc; color: #475569; }
      #ai-doc-agent-overlay button.wide { width: 100%; }
      #ai-doc-agent-overlay #ai-schedule-btn { border-color: #0ea5a2; background: linear-gradient(135deg, #f0fdfa, #ffffff); color: #0f766e; font-weight: 700; }
      #ai-doc-agent-overlay .secondary-action { border-color: #cbd5df; background: #ffffff; color: #334155; }
      #ai-doc-agent-overlay textarea { width: 100%; min-height: 104px; resize: vertical; padding: 10px; color: #111827; background: #fff; }
      #ai-doc-agent-overlay .record-card { border: 1px solid #dbe7e4; border-radius: 14px; padding: 10px; margin-bottom: 10px; background: #ffffff; }
      #ai-doc-agent-overlay .record-head { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }
      #ai-doc-agent-overlay .preview { border: 1px solid #dbe3ea; border-radius: 14px; padding: 12px; background: #f8fafc; margin-bottom: 10px; }
      #ai-doc-agent-overlay #ai-preview-content { white-space: pre-wrap; overflow-wrap: anywhere; color: #263241; }
      #ai-doc-agent-overlay .logs { border: 1px solid #dbe3ea; border-radius: 8px; padding: 8px; background: #fff; max-height: 160px; overflow: auto; }
      #ai-doc-agent-overlay .logs div { font-size: 12px; color: #394557; margin-bottom: 5px; overflow-wrap: anywhere; }
      #ai-doc-agent-overlay .mic-state { flex: 0 0 auto; min-width: 76px; font-size: 12px; color: #64748b; border: 1px solid #d1d5db; border-radius: 999px; padding: 7px 10px; background: #fff; text-align: center; }
      #ai-doc-agent-overlay .mic-state[data-active="1"] { color: #065f46; border-color: #10b981; background: #ecfdf5; }
      #ai-doc-agent-overlay .suggestions { display: none; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      #ai-doc-agent-overlay .suggestions button { border-radius: 999px; min-height: 30px; padding: 5px 10px; font-size: 12px; background: #f8fafc; color: #253044; }
      #ai-doc-agent-overlay .suggestions button.module-chip { border-color: #0ea5e9; color: #0369a1; background: #f0f9ff; }
      #ai-doc-agent-overlay .asset-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 8px 0 10px; }
      #ai-doc-agent-overlay .asset-row input[type="file"] { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      #ai-doc-agent-overlay .file-row { display: none; }
      #ai-doc-agent-overlay .file-row input[type="file"] { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
      #ai-doc-agent-overlay .file-btn { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; border: 1px solid #cbd5df; border-radius: 10px; background: #fff; color: #1f2937; cursor: pointer; padding: 7px 10px; }
      #ai-doc-agent-overlay .file-name { min-width: 0; color: #4b5563; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      #ai-doc-agent-overlay details { border: 1px solid #e2e8f0; border-radius: 12px; background: #fff; }
      #ai-doc-agent-overlay summary { cursor: pointer; padding: 9px 10px; color: #475569; font-weight: 700; }
      #ai-doc-agent-overlay details .logs { border: 0; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px; }
      #ai-doc-agent-overlay .context-preview { border-top: 1px solid #e2e8f0; padding: 10px; max-height: 120px; overflow: auto; white-space: pre-wrap; color: #334155; font-size: 12px; }
      @media (max-width: 520px) { #ai-doc-agent-overlay { right: 8px; bottom: 8px; width: calc(100vw - 16px); } }
    `;
    document.head.appendChild(style);
  }

  injectCriticalStyles();

  const root = document.createElement("aside");
  root.id = ROOT_ID;
  root.innerHTML = `
    <div class="head">
      <div class="title">
        <strong>AI Doc Agent</strong>
        <span class="pill" id="ai-step-pill">idle</span>
      </div>
      <div class="window-controls">
        <button id="ai-minimize-btn" class="icon-btn" title="Свернуть">_</button>
        <button id="ai-close-btn" class="icon-btn" title="Закрыть">x</button>
      </div>
    </div>
    <div class="body">
      <div class="hero">
        <div class="hero-title">Полный автопилот приема</div>
        <div class="hero-sub">Слушает врача, читает страницу, готовит поля и сохраняет только после подтверждения.</div>
      </div>

      <div class="control-grid">
        <button id="ai-start-btn" class="primary">Начать прием</button>
        <button id="ai-end-btn" class="ghost">Завершить</button>
      </div>

      <div class="control-grid">
        <button id="ai-mic-btn">Включить микрофон</button>
        <button id="ai-record-btn">Начать запись</button>
      </div>

      <div class="record-card">
        <div class="record-head">
          <span id="ai-mic-state" class="mic-state">mic: off</span>
          <span class="file-name">Команды: начни запись, разбери в поля, подтверди</span>
        </div>
        <textarea id="ai-dictation" placeholder="Диктовка врача..."></textarea>
      </div>

      <div id="ai-suggestions" class="suggestions"></div>

      <button id="ai-parse-btn" class="primary wide">Разобрать и подготовить preview</button>
      <button id="ai-schedule-btn" class="wide">Сформировать расписание</button>
      <button id="ai-apply-schedule-btn" class="wide secondary-action">Применить расписание на этой странице</button>

      <div class="preview" id="ai-preview-box">
        <b>Предпросмотр перед сохранением</b>
        <div id="ai-preview-content">Пока пусто</div>
      </div>

      <button id="ai-confirm-btn" class="primary wide">Подтвердить и сохранить</button>

      <div class="asset-row">
        <label class="file-btn" for="ai-file-input">+ Документ/PDF</label>
        <label class="file-btn" for="ai-template-input">+ Шаблон врача</label>
        <input id="ai-file-input" type="file" accept=".pdf,.txt,.md" />
        <input id="ai-template-input" type="file" accept=".txt,.md,.json" />
      </div>
      <div class="file-name" id="ai-file-name">PDF не загружен</div>
      <div class="file-name" id="ai-template-name">Шаблон не загружен</div>

      <details id="ai-context-details">
        <summary>Контекст документов</summary>
        <div id="ai-document-preview" class="context-preview">Документы не загружены.</div>
      </details>

      <details>
        <summary>Журнал действий AI</summary>
        <div class="logs" id="ai-logs"></div>
      </details>
    </div>
  `;
  document.body.appendChild(root);

  const ui = {
    step: root.querySelector("#ai-step-pill"),
    minimize: root.querySelector("#ai-minimize-btn"),
    close: root.querySelector("#ai-close-btn"),
    start: root.querySelector("#ai-start-btn"),
    end: root.querySelector("#ai-end-btn"),
    micBtn: root.querySelector("#ai-mic-btn"),
    record: root.querySelector("#ai-record-btn"),
    micState: root.querySelector("#ai-mic-state"),
    dictation: root.querySelector("#ai-dictation"),
    parse: root.querySelector("#ai-parse-btn"),
    schedule: root.querySelector("#ai-schedule-btn"),
    applySchedule: root.querySelector("#ai-apply-schedule-btn"),
    suggestions: root.querySelector("#ai-suggestions"),
    preview: root.querySelector("#ai-preview-content"),
    confirm: root.querySelector("#ai-confirm-btn"),
    file: root.querySelector("#ai-file-input"),
    fileName: root.querySelector("#ai-file-name"),
    template: root.querySelector("#ai-template-input"),
    templateName: root.querySelector("#ai-template-name"),
    documentPreview: root.querySelector("#ai-document-preview"),
    logs: root.querySelector("#ai-logs")
  };

  let recognition = null;
  let micActive = false;
  let lastPreview = null;
  let suggestionsCache = [];
  let inlineHintTimer = 0;
  let logsCache = [];
  let restoreInProgress = false;
  let persistTimer = 0;
  let recordingMode = false;

  function persistOverlayState() {
    if (restoreInProgress) {
      return;
    }
    if (persistTimer) {
      clearTimeout(persistTimer);
    }
    persistTimer = setTimeout(() => {
      chrome.storage.local
        .set({
          [STATE_KEY]: {
            dictation: ui.dictation.value || "",
            preview: lastPreview,
            logs: logsCache.slice(0, MAX_LOGS),
            micWanted: micActive,
            recordingMode,
            step: ui.step.textContent || "idle",
            fileName: ui.fileName.textContent || "PDF не загружен",
            templateName: ui.templateName.textContent || "Шаблон не загружен",
            documentPreview: ui.documentPreview.textContent || "Документы не загружены."
          }
        })
        .catch(() => {});
    }, 120);
  }

  function renderLogLine(text, appendToCache) {
    const line = document.createElement("div");
    line.textContent = text;
    ui.logs.prepend(line);
    while (ui.logs.children.length > 25) {
      ui.logs.removeChild(ui.logs.lastChild);
    }
    if (appendToCache) {
      logsCache.unshift(text);
      logsCache = logsCache.slice(0, MAX_LOGS);
      persistOverlayState();
    }
  }

  function addLog(text) {
    renderLogLine(`[${now()}] ${text}`, true);
  }

  function logSafety(safety, prefix) {
    if (!safety) {
      return;
    }
    const tag = prefix ? `${prefix}: ` : "";
    const blocking = Array.isArray(safety.blockingIssues) ? safety.blockingIssues : [];
    const warnings = Array.isArray(safety.warnings) ? safety.warnings : [];

    if (blocking.length) {
      addLog(`${tag}blocking -> ${blocking.join("; ")}`);
    }
    if (warnings.length) {
      addLog(`${tag}warnings -> ${warnings.join("; ")}`);
    }
    if (!blocking.length && !warnings.length && safety.ok) {
      addLog(`${tag}safety ok`);
    }
  }

  function setMicState(active, note, skipPersist) {
    micActive = Boolean(active);
    ui.micState.textContent = `mic: ${micActive ? "on" : "off"}${note ? ` (${note})` : ""}`;
    ui.micState.dataset.active = micActive ? "1" : "0";
    ui.micBtn.textContent = micActive ? "Выключить микрофон" : "Включить микрофон";
    if (!skipPersist) {
      persistOverlayState();
    }
  }

  function setStep(step) {
    ui.step.textContent = step || "idle";
    persistOverlayState();
  }

  function setRecordingMode(active) {
    recordingMode = Boolean(active);
    root.dataset.recording = recordingMode ? "1" : "0";
    ui.step.textContent = recordingMode ? "recording" : "listening";
    if (ui.record) {
      ui.record.textContent = recordingMode ? "Остановить запись" : "Начать запись";
      ui.record.classList.toggle("primary", recordingMode);
    }
    addLog(recordingMode ? "Recording started" : "Recording stopped");
    persistOverlayState();
  }

  function setCollapsed(collapsed) {
    const value = Boolean(collapsed);
    root.dataset.collapsed = value ? "1" : "0";
    ui.minimize.textContent = value ? "+" : "_";
    ui.minimize.title = value ? "Развернуть" : "Свернуть";
    chrome.storage.local.set({ aiDocOverlayCollapsed: value }).catch(() => {});
  }

  function restoreCollapsedState() {
    chrome.storage.local.get(["aiDocOverlayCollapsed"], (data) => {
      if (chrome.runtime.lastError) {
        return;
      }
      setCollapsed(Boolean(data && data.aiDocOverlayCollapsed));
    });
  }

  function restoreOverlayState() {
    chrome.storage.local.get([STATE_KEY], (data) => {
      if (chrome.runtime.lastError || !data || !data[STATE_KEY]) {
        return;
      }
      const saved = data[STATE_KEY];
      restoreInProgress = true;

      ui.dictation.value = String(saved.dictation || "");
      ui.fileName.textContent = saved.fileName || "PDF не загружен";
      ui.templateName.textContent = saved.templateName || "Шаблон не загружен";
      ui.documentPreview.textContent = saved.documentPreview || "Документы не загружены.";
      if (saved.step) {
        ui.step.textContent = saved.step;
      }
      recordingMode = Boolean(saved.recordingMode);
      root.dataset.recording = recordingMode ? "1" : "0";
      if (ui.record) {
        ui.record.textContent = recordingMode ? "Остановить запись" : "Начать запись";
        ui.record.classList.toggle("primary", recordingMode);
      }
      if (saved.preview) {
        renderPreview(saved.preview);
      }

      logsCache = Array.isArray(saved.logs) ? saved.logs.slice(0, MAX_LOGS) : [];
      ui.logs.innerHTML = "";
      logsCache
        .slice()
        .reverse()
        .forEach((line) => renderLogLine(line, false));

      restoreInProgress = false;

      if (saved.micWanted) {
        setTimeout(() => {
          startMic();
          addLog("Microphone restored after page change");
        }, 350);
      }
    });
  }

  function renderPreview(payload) {
    if (!payload) {
      ui.preview.textContent = "Пока пусто";
      lastPreview = null;
      persistOverlayState();
      return;
    }
    lastPreview = payload;
    const fields = payload.fields || payload;
    const lines = [];
    Object.keys(fields).forEach((key) => {
      const value = fields[key];
      if (value === null || value === undefined || value === "") {
        return;
      }
      lines.push(`${key}: ${Array.isArray(value) ? value.join(", ") : value}`);
    });
    ui.preview.textContent = lines.length ? lines.join("\n") : "Пустой результат";
    persistOverlayState();
  }

  function appendToDictation(text) {
    const current = String(ui.dictation.value || "").trim();
    ui.dictation.value = [current, text].filter(Boolean).join(current ? ", " : "");
    ui.dictation.dispatchEvent(new Event("input", { bubbles: true }));
    persistOverlayState();
  }

  function isMicStopCommand(text) {
    const value = String(text || "").toLowerCase();
    return (
      value.includes("выключи микрофон") ||
      value.includes("отключи микрофон") ||
      value.includes("стоп микрофон") ||
      value.includes("останови запись")
    );
  }

  function isPhrase(text, variants) {
    const value = String(text || "").toLowerCase().trim();
    return variants.some((variant) => value.includes(variant));
  }

  async function parseCurrentDictation(source) {
    const transcript = String(ui.dictation.value || "").trim();
    if (!transcript) {
      addLog(`${source || "parse"}: dictation is empty`);
      return;
    }

    const response = await runtimeMessage({ type: "PARSE_DICTATION", transcript });

    if (response && response.preview) {
      renderPreview(response.preview);
      addLog("Preview updated");
    } else {
      addLog(`Parse error: ${response.error || "no data"}`);
    }

    if (response.step) {
      setStep(response.step);
    }
    if (Array.isArray(response.hints)) {
      renderSuggestions(response.hints);
    }
    if (response.action && response.action.intent) {
      addLog(`Action: ${response.action.intent} (${response.action.tool || "n/a"})`);
    }
    if (response.parseMeta) {
      addLog(
        `Parser: ${response.parseMeta.provider || "n/a"}${response.parseMeta.model ? ` (${response.parseMeta.model})` : ""}`
      );
      if (response.parseMeta.fallbackReason) {
        addLog(`Parser fallback: ${response.parseMeta.fallbackReason}`);
      }
    }
    logSafety(response.safety, source || "parse");
  }

  async function requestSchedule(source) {
    const response = await runtimeMessage({ type: "VOICE_CHUNK", transcript: "сформируй расписание" });
    if (response.preview) {
      renderPreview(response.preview);
      addLog(`${source || "schedule"}: preview generated`);
    }
    if (response.step) {
      setStep(response.step);
    }
    if (response.action && response.action.intent) {
      addLog(`Action: ${response.action.intent} (${response.action.tool || "n/a"})`);
    }
    logSafety(response.safety, source || "schedule");
  }

  async function applyPendingSchedule(source) {
    const response = await runtimeMessage({ type: "APPLY_PENDING_SCHEDULE" });
    if (response && response.ok) {
      addLog(`${source || "schedule"}: applied ${response.schedule.applied} rows`);
    } else {
      addLog(`${source || "schedule"}: no pending schedule`);
    }
  }

  async function confirmCurrentPreview(source) {
    const response = await runtimeMessage({ type: "PREVIEW_DECISION", decision: "confirm" });
    if (response.ok) {
      addLog(`${source || "confirm"}: saved`);
    } else {
      addLog(`${source || "confirm"}: error (${response.error || "unknown"})`);
    }
    logSafety(response.safety, source || "confirm");
    if (response.step) {
      setStep(response.step);
    }
  }

  async function rejectCurrentPreview(source) {
    const response = await runtimeMessage({ type: "PREVIEW_DECISION", decision: "reject" });
    addLog(`${source || "reject"}: ${response.ok ? "ok" : "error"}`);
    renderPreview(null);
    if (response.step) {
      setStep(response.step);
    }
  }

  function clearDictation() {
    ui.dictation.value = "";
    renderPreview(null);
    addLog("Dictation cleared");
    persistOverlayState();
  }

  async function extractReadableText(file) {
    if (!file) {
      return "";
    }
    const name = String(file.name || "").toLowerCase();
    if (name.endsWith(".txt") || name.endsWith(".md") || String(file.type || "").startsWith("text/")) {
      return (await file.text()).slice(0, 8000);
    }

    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const limit = Math.min(bytes.length, 900000);
    for (let i = 0; i < limit; i += 1) {
      const code = bytes[i];
      binary += code >= 32 && code <= 126 ? String.fromCharCode(code) : " ";
    }
    return binary
      .replace(/\s+/g, " ")
      .match(/[A-Za-zА-Яа-яЁё0-9.,:;()%/+\-\s]{16,}/g)
      ?.join(" ")
      .slice(0, 8000) || "";
  }

  function handleVoiceCommand(value) {
    if (isPhrase(value, ["начни запись", "начать запись", "старт запись", "начинай запись"])) {
      setRecordingMode(true);
      return true;
    }
    if (isPhrase(value, ["стоп запись", "останови запись", "закончи запись", "хватит запись"])) {
      setRecordingMode(false);
      return true;
    }
    if (isPhrase(value, ["разбери в поля", "разобрать в поля", "заполни поля", "обработай запись"])) {
      setRecordingMode(false);
      parseCurrentDictation("voice-parse");
      return true;
    }
    if (isPhrase(value, ["сформируй расписание", "сделай расписание", "построй расписание", "создай расписание"])) {
      setRecordingMode(false);
      requestSchedule("voice-schedule");
      return true;
    }
    if (isPhrase(value, ["подтверди", "подтвердить", "сохрани", "сохранить"])) {
      confirmCurrentPreview("voice-confirm");
      return true;
    }
    if (isPhrase(value, ["отклони", "отклонить", "не сохраняй"])) {
      rejectCurrentPreview("voice-reject");
      return true;
    }
    if (isPhrase(value, ["очисти запись", "очистить запись", "сбрось запись"])) {
      clearDictation();
      return true;
    }
    if (isPhrase(value, ["сверни окно", "свернуть окно"])) {
      setCollapsed(true);
      addLog("Window collapsed by voice");
      return true;
    }
    if (isPhrase(value, ["разверни окно", "развернуть окно"])) {
      setCollapsed(false);
      addLog("Window expanded by voice");
      return true;
    }
    if (isMicStopCommand(value)) {
      addLog(`Voice command: ${value}`);
      stopMic();
      return true;
    }
    return false;
  }

  function insertSuggestion(suggestion) {
    if (String(suggestion).startsWith(SUGGESTION_MODULE_PREFIX)) {
      const target = suggestion.replace(SUGGESTION_MODULE_PREFIX, "");
      runtimeMessage({ type: "VOICE_CHUNK", transcript: `Открой ${target}` }).then((res) => {
        if (res.step) {
          setStep(res.step);
        }
        if (res.done) {
          addLog(`Navigation: ${target}`);
        }
      });
      return;
    }
    appendToDictation(suggestion);
    addLog(`Hint inserted: ${suggestion}`);
  }

  function renderSuggestions(items) {
    suggestionsCache = Array.isArray(items) ? items.filter(Boolean) : [];
    ui.suggestions.innerHTML = "";
    if (!suggestionsCache.length) {
      ui.suggestions.style.display = "none";
      return;
    }
    ui.suggestions.style.display = "flex";

    suggestionsCache.forEach((item) => {
      const btn = document.createElement("button");
      btn.type = "button";
      const moduleLike = String(item).startsWith(SUGGESTION_MODULE_PREFIX);
      const text = moduleLike ? `Перейти: ${item.replace(SUGGESTION_MODULE_PREFIX, "")}` : item;
      btn.textContent = text;
      btn.className = moduleLike ? "module-chip" : "";
      btn.addEventListener("click", () => insertSuggestion(item));
      ui.suggestions.appendChild(btn);
    });
  }

  async function refreshInlineHints() {
    const text = ui.dictation.value || "";
    const res = await runtimeMessage({ type: "INLINE_HINTS", text });
    const hints = Array.isArray(res.hints) ? res.hints : [];
    const modules = (res.modules || [])
      .slice(0, 4)
      .map((m) => `${SUGGESTION_MODULE_PREFIX}${m.label}`);
    renderSuggestions(hints.concat(modules));
  }

  function initSpeech() {
    if (!SpeechCtor) {
      addLog("Web Speech API unavailable");
      ui.micBtn.disabled = true;
      return;
    }

    recognition = new SpeechCtor();
    recognition.lang = "ru-RU";
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    let interimText = "";

    recognition.onstart = function () {
      setMicState(true);
      addLog("Microphone active");
    };

    recognition.onend = function () {
      if (micActive) {
        try {
          recognition.start();
          return;
        } catch (_err) {
          // race guard
        }
      }
      setMicState(false);
    };

    recognition.onerror = function (event) {
      addLog(`Mic error: ${event.error || "unknown"}`);
      if (event.error === "no-speech" || event.error === "nomatch") {
        return;
      }
      setMicState(false, "error");
    };

    recognition.onresult = async function (event) {
      interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const part = event.results[i];
        const value = String(part[0] ? part[0].transcript : "").trim();
        if (!value) {
          continue;
        }

        if (part.isFinal) {
          if (handleVoiceCommand(value)) {
            continue;
          }

          appendToDictation(value);
          addLog(`${recordingMode ? "Recorded" : "Speech"}: ${value}`);

          if (recordingMode) {
            continue;
          }

          const response = await runtimeMessage({ type: "VOICE_CHUNK", transcript: value });
          if (response.step) {
            setStep(response.step);
          }
          if (response.preview) {
            lastPreview = response.preview;
            renderPreview(lastPreview);
          }
          if (Array.isArray(response.hints)) {
            renderSuggestions(response.hints);
          }
          if (response.action && response.action.intent) {
            addLog(`Action: ${response.action.intent} (${response.action.tool || "n/a"})`);
          }
          if (response.parseMeta) {
            addLog(
              `Parser: ${response.parseMeta.provider || "n/a"}${response.parseMeta.model ? ` (${response.parseMeta.model})` : ""}`
            );
            if (response.parseMeta.fallbackReason) {
              addLog(`Parser fallback: ${response.parseMeta.fallbackReason}`);
            }
          }
          logSafety(response.safety, "voice");
          continue;
        }

        interimText = value;
      }

      if (interimText) {
        ui.micState.textContent = `mic: on (${interimText.slice(0, 28)}...)`;
      } else if (micActive) {
        ui.micState.textContent = "mic: on";
      }
    };
  }

  function startMic() {
    if (!recognition || micActive) {
      return;
    }
    micActive = true;
    try {
      recognition.start();
    } catch (_err) {
      // race guard
    }
  }

  function stopMic() {
    if (!recognition) {
      return;
    }
    micActive = false;
    try {
      recognition.stop();
    } catch (_err) {
      // ignore
    }
    setMicState(false);
  }

  ui.start.addEventListener("click", async () => {
    const response = await runtimeMessage({ type: "VISIT_START" });
    addLog(`Visit start: ${response.ok ? "ok" : "error"}`);
    if (response.step) {
      setStep(response.step);
    }
    if (response.context && response.context.diagnosis) {
      addLog(`Context diagnosis: ${response.context.diagnosis}`);
    }
    if (response.modules) {
      const moduleHints = response.modules.slice(0, 4).map((m) => `${SUGGESTION_MODULE_PREFIX}${m.label}`);
      renderSuggestions(moduleHints);
    }
  });

  ui.end.addEventListener("click", async () => {
    stopMic();
    const response = await runtimeMessage({ type: "VISIT_END" });
    addLog(`Visit end: ${response.ok ? "ok" : "error"}`);
    setStep("idle");
  });

  ui.minimize.addEventListener("click", () => {
    setCollapsed(root.dataset.collapsed !== "1");
  });

  ui.close.addEventListener("click", () => {
    stopMic();
    chrome.storage.local.set({ aiDocOverlayClosed: true }).catch(() => {});
    root.remove();
  });

  ui.micBtn.addEventListener("click", () => {
    if (micActive) {
      stopMic();
    } else {
      startMic();
    }
  });

  ui.record.addEventListener("click", () => {
    if (!micActive) {
      startMic();
    }
    setRecordingMode(!recordingMode);
  });

  ui.dictation.addEventListener("input", () => {
    persistOverlayState();
    if (inlineHintTimer) {
      clearTimeout(inlineHintTimer);
    }
    inlineHintTimer = setTimeout(() => {
      refreshInlineHints();
    }, 180);
  });

  ui.parse.addEventListener("click", async () => {
    await parseCurrentDictation("parse");
  });

  ui.schedule.addEventListener("click", async () => {
    await requestSchedule("schedule");
  });

  ui.applySchedule.addEventListener("click", async () => {
    await applyPendingSchedule("manual-schedule");
  });

  ui.confirm.addEventListener("click", async () => {
    await confirmCurrentPreview("confirm");
  });

  ui.file.addEventListener("change", async () => {
    const file = ui.file.files && ui.file.files[0];
    if (!file) {
      return;
    }
    const extractedText = await extractReadableText(file);
    const response = await runtimeMessage({
      type: "PDF_FILE_UPLOADED",
      fileMeta: { name: file.name, size: file.size, type: file.type || "application/pdf" },
      extractedText
    });
    ui.fileName.textContent = file.name;
    ui.documentPreview.textContent = extractedText
      ? `${file.name}\n\n${extractedText.slice(0, 900)}${extractedText.length > 900 ? "\n..." : ""}`
      : `${file.name}\n\nТекст не извлечен. Для демо надежнее использовать .txt/.md или текстовый PDF.`;
    addLog(`Document upload: ${response.ok ? `accepted (${response.chars || 0} chars)` : "error"}`);
    persistOverlayState();
    ui.file.value = "";
  });

  ui.template.addEventListener("change", async () => {
    const file = ui.template.files && ui.template.files[0];
    if (!file) {
      return;
    }

    const text = await file.text();
    const response = await runtimeMessage({
      type: "TEMPLATE_UPLOADED",
      template: { name: file.name, content: text }
    });

    ui.templateName.textContent = file.name;
    addLog(`Template upload: ${response.ok ? "saved" : "error"}`);
    ui.template.value = "";
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || typeof message !== "object") {
      return;
    }

    if (message.type === "OVERLAY_STATUS") {
      if (message.step) {
        setStep(message.step);
      }
      if (message.text) {
        addLog(message.text);
      }
    }

    if (message.type === "SHOW_PREVIEW") {
      lastPreview = message.preview || null;
      renderPreview(lastPreview);
      addLog("Preview received");
      if (message.action && message.action.intent) {
        addLog(`Action: ${message.action.intent} (${message.action.tool || "n/a"})`);
      }
      if (message.parseMeta) {
        addLog(
          `Parser: ${message.parseMeta.provider || "n/a"}${
            message.parseMeta.model ? ` (${message.parseMeta.model})` : ""
          }`
        );
        if (message.parseMeta.fallbackReason) {
          addLog(`Parser fallback: ${message.parseMeta.fallbackReason}`);
        }
      }
      logSafety(message.safety, "preview");
      if (message.step) {
        setStep(message.step);
      }
    }

    if (message.type === "TIMELINE_LOG") {
      addLog(message.text || "event");
    }
  });

  initSpeech();
  setMicState(false, "", true);
  restoreCollapsedState();
  restoreOverlayState();
  addLog("Overlay ready");
})();
