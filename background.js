importScripts(
  "modules/step-machine.js",
  "modules/scheduler.js",
  "modules/template-manager.js",
  "modules/context-engine.js",
  "modules/decision-engine.js",
  "modules/safety-gate.js"
);

const machine = new self.StepMachine();
const tabState = new Map();

const SYMPTOM_SUGGESTIONS = [
  "кашель",
  "слабость",
  "головная боль",
  "мышечный тонус повышен",
  "ЛФК",
  "массаж",
  "психолог",
  "анамнез",
  "объективный статус"
];

const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_PROXY_BASE_URL = "";

function normalize(value) {
  if (self.ContextEngine && typeof self.ContextEngine.normalize === "function") {
    return self.ContextEngine.normalize(value);
  }
  return String(value || "")
    .toLowerCase()
    .replace(/[.,!?;:()[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getAiSettings() {
  const data = await chrome.storage.local.get([
    "openaiApiKey",
    "openaiModel",
    "proxyBaseUrl",
    "proxyAuthToken"
  ]);
  const openaiApiKey = String(data.openaiApiKey || "").trim();
  const openaiModel = String(data.openaiModel || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
  const proxyBaseUrl = String(data.proxyBaseUrl || DEFAULT_PROXY_BASE_URL).trim().replace(/\/+$/, "");
  const proxyAuthToken = String(data.proxyAuthToken || "").trim();
  return { openaiApiKey, openaiModel, proxyBaseUrl, proxyAuthToken };
}

function safeJsonParse(text) {
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch (_err) {
    const match = String(text).match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch (_err2) {
      return null;
    }
  }
}

function normalizeParsedFields(raw, diagnosisFallback) {
  const src = raw && typeof raw === "object" ? raw : {};
  const proceduresRaw = src.procedures;
  let procedures = null;

  if (Array.isArray(proceduresRaw)) {
    procedures = proceduresRaw
      .map((x) => String(x || "").trim())
      .filter(Boolean)
      .slice(0, 12);
  } else if (typeof proceduresRaw === "string") {
    procedures = proceduresRaw
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  const objectiveCandidate =
    src.objective !== undefined ? src.objective : src.objective_status !== undefined ? src.objective_status : null;

  return {
    complaints: src.complaints ? String(src.complaints).trim() : null,
    anamnesis: src.anamnesis ? String(src.anamnesis).trim() : null,
    objective: objectiveCandidate ? String(objectiveCandidate).trim() : null,
    plan: src.plan ? String(src.plan).trim() : null,
    recommendations: src.recommendations ? String(src.recommendations).trim() : null,
    procedures: procedures && procedures.length ? procedures : null,
    diagnosis: src.diagnosis ? String(src.diagnosis).trim() : diagnosisFallback || null
  };
}

function buildFallbackReason(result) {
  if (!result || result.ok) {
    return null;
  }
  return [result.error, result.details].filter(Boolean).join(": ");
}

function summarizeContextItems(items, maxItems, maxChars) {
  return (Array.isArray(items) ? items : [])
    .slice(0, maxItems)
    .map((item) => ({
      name: String(item.name || "context").slice(0, 120),
      content: String(item.content || item.text || "").slice(0, maxChars)
    }))
    .filter((item) => item.content);
}

async function parseDictationViaOpenAI(transcript, patient, workflowStep, extraContext) {
  const { openaiApiKey, openaiModel } = await getAiSettings();
  if (!openaiApiKey) {
    return { ok: false, error: "api_key_missing" };
  }

  const systemPrompt = [
    "You are a medical secretary for a rehabilitation clinic.",
    "Convert doctor dictation into structured JSON for a medical information system.",
    "Return ONLY valid JSON object with these keys:",
    "complaints, anamnesis, objective, plan, procedures, recommendations, diagnosis.",
    "Rules:",
    "1) Use professional clinical terminology, not casual wording.",
    "2) Do not invent symptoms, diagnoses, procedures, dates, or lab values.",
    "3) Use patient context, uploaded documents, and doctor templates only as supporting context.",
    "4) If a value is absent, return null.",
    "5) procedures must be an array of procedure names or null.",
    "6) complaints are subjective symptoms; anamnesis is history/dynamics; objective is exam status; plan is treatment course; recommendations are regime/home advice."
  ].join("\n");

  const userPayload = {
    transcript: String(transcript || "").trim(),
    workflowStep: workflowStep || "collecting_dictation",
    patient: {
      fullName: (patient && patient.fullName) || "",
      diagnosis: (patient && patient.diagnosis) || "",
      age: (patient && patient.age) || ""
    },
    uploadedDocuments: summarizeContextItems(extraContext && extraContext.uploadedDocuments, 3, 2200),
    doctorTemplates: summarizeContextItems(extraContext && extraContext.doctorTemplates, 3, 1800)
  };

  let response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: openaiModel,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      })
    });
  } catch (err) {
    return { ok: false, error: "network_error", details: String(err && err.message ? err.message : err) };
  }

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch (_err) {
      details = "";
    }
    return {
      ok: false,
      error: `openai_http_${response.status}`,
      details: details.slice(0, 300)
    };
  }

  let data;
  try {
    data = await response.json();
  } catch (_err) {
    return { ok: false, error: "invalid_json_response" };
  }

  const content =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    typeof data.choices[0].message.content === "string"
      ? data.choices[0].message.content
      : "";

  const parsed = safeJsonParse(content);
  if (!parsed) {
    return { ok: false, error: "model_output_not_json", details: String(content || "").slice(0, 200) };
  }

  return {
    ok: true,
    preview: {
      fields: normalizeParsedFields(parsed, patient && patient.diagnosis ? patient.diagnosis : null)
    },
    provider: "openai",
    model: openaiModel
  };
}

async function parseDictationViaProxy(transcript, patient, workflowStep, extraContext) {
  const { proxyBaseUrl, proxyAuthToken } = await getAiSettings();
  if (!proxyBaseUrl) {
    return { ok: false, error: "proxy_not_configured" };
  }

  let response;
  try {
    const headers = {
      "Content-Type": "application/json"
    };
    if (proxyAuthToken) {
      headers["x-client-token"] = proxyAuthToken;
    }

    response = await fetch(`${proxyBaseUrl}/api/parse-dictation`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        transcript: String(transcript || "").trim(),
        workflowStep: workflowStep || "collecting_dictation",
        patient: {
          fullName: (patient && patient.fullName) || "",
          diagnosis: (patient && patient.diagnosis) || "",
          age: (patient && patient.age) || ""
        },
        uploadedDocuments: summarizeContextItems(extraContext && extraContext.uploadedDocuments, 3, 2200),
        doctorTemplates: summarizeContextItems(extraContext && extraContext.doctorTemplates, 3, 1800)
      })
    });
  } catch (err) {
    return { ok: false, error: "proxy_network_error", details: String(err && err.message ? err.message : err) };
  }

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch (_err) {
      details = "";
    }
    return {
      ok: false,
      error: `proxy_http_${response.status}`,
      details: details.slice(0, 300)
    };
  }

  let data;
  try {
    data = await response.json();
  } catch (_err) {
    return { ok: false, error: "proxy_invalid_json_response" };
  }

  const parsed = data && data.fields ? data.fields : safeJsonParse(data && data.content ? data.content : "");
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "proxy_output_invalid" };
  }

  return {
    ok: true,
    preview: {
      fields: normalizeParsedFields(parsed, patient && patient.diagnosis ? patient.diagnosis : null)
    },
    provider: data.provider || "proxy",
    model: data.model || null
  };
}

async function parseDictationWithLLM(transcript, patient, workflowStep, extraContext) {
  const viaProxy = await parseDictationViaProxy(transcript, patient, workflowStep, extraContext);
  if (viaProxy.ok) {
    return viaProxy;
  }

  const direct = await parseDictationViaOpenAI(transcript, patient, workflowStep, extraContext);
  if (direct.ok) {
    return direct;
  }

  return {
    ok: false,
    error: "llm_unavailable",
    details: [viaProxy.error, direct.error].filter(Boolean).join(",")
  };
}

function getTabState(tabId) {
  if (!tabState.has(tabId)) {
    tabState.set(tabId, {
      context: null,
      modules: [],
      preview: null,
      timeline: [],
      transcript: "",
      currentAction: null,
      lastSafety: null,
      uploadedDocuments: []
    });
  }
  return tabState.get(tabId);
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message || "tab_message_failed" });
        return;
      }
      resolve(response || {});
    });
  });
}

function pushTimeline(tabId, text) {
  const state = getTabState(tabId);
  state.timeline.unshift({ ts: Date.now(), text });
  state.timeline = state.timeline.slice(0, 100);
  chrome.tabs.sendMessage(tabId, { type: "TIMELINE_LOG", text });
}

function notify(tabId, text) {
  chrome.tabs.sendMessage(tabId, {
    type: "OVERLAY_STATUS",
    step: machine.step,
    text
  });
  pushTimeline(tabId, text);
}

function proposeInlineHints(inputText, context) {
  const text = normalize(inputText);
  const lastToken = text.split(" ").pop() || "";
  const hints = [];

  SYMPTOM_SUGGESTIONS.forEach((item) => {
    const low = normalize(item);
    if (lastToken.length >= 2 && low.includes(lastToken) && !text.includes(low)) {
      hints.push(item);
    }
  });

  const diagnosis = normalize((context && context.diagnosis) || "");
  if (diagnosis.includes("дцп") || diagnosis.includes("g80")) {
    ["спастический синдром", "реабилитационный курс", "неврологический статус"].forEach((x) => {
      if (!hints.includes(x)) {
        hints.push(x);
      }
    });
  }

  return hints.slice(0, 8);
}

function buildSchedulePreview(schedule) {
  const lines = [];
  schedule.forEach((item) => {
    if (item.status !== "ok") {
      lines.push(`${item.procedure}: no available slot`);
      return;
    }
    lines.push(`${item.procedure} ${item.session}/${item.total} -> ${item.date} ${item.time} (${item.specialist})`);
  });
  return {
    mode: "schedule",
    scheduleItems: schedule,
    fields: {
      schedule: lines.join("; ")
    }
  };
}

function buildActionContext(state, transcript) {
  return self.ContextEngine.buildActionContext({
    state,
    transcript,
    machineStep: machine.step
  });
}

async function handleNavigator(tabId, state, envelope) {
  const target = envelope.args && envelope.args.target ? envelope.args.target : "первичный осмотр";
  const nav = await sendToTab(tabId, { type: "NAVIGATE_TO", target });

  notify(tabId, nav.ok ? `Navigation: opened "${target}".` : `Navigation: not found "${target}".`);

  return {
    ok: true,
    mode: "navigate",
    target,
    done: Boolean(nav.ok),
    action: envelope
  };
}

async function handleScheduler(tabId, state, envelope) {
  const procedures = ((state.preview || {}).fields || {}).procedures || [];
  const schedule = self.SchedulerModule.scheduleGreedy(Array.isArray(procedures) ? procedures : []);
  const schedulePreview = buildSchedulePreview(schedule);

  state.preview = schedulePreview;
  state.lastSafety = { ok: true, blockingIssues: [], warnings: [] };

  machine.transition("preview");
  chrome.tabs.sendMessage(tabId, {
    type: "SHOW_PREVIEW",
    preview: schedulePreview,
    safety: state.lastSafety,
    action: envelope,
    step: machine.step
  });

  notify(tabId, "Schedule preview generated. Confirm before save.");

  return {
    ok: true,
    mode: "schedule",
    preview: schedulePreview,
    safety: state.lastSafety,
    action: envelope
  };
}

async function handleScribe(tabId, state, envelope) {
  machine.transition("parsing");
  const transcript = envelope.args.transcript || "";
  const actionContextBeforeParse = buildActionContext(state, transcript);
  const doctorTemplates = await self.TemplateManager.loadTemplates();
  const llmParsed = await parseDictationWithLLM(
    transcript,
    actionContextBeforeParse.patient,
    actionContextBeforeParse.workflowStep,
    {
      uploadedDocuments: state.uploadedDocuments || [],
      doctorTemplates
    }
  );

  const parsed = llmParsed.ok
    ? {
        ok: true,
        preview: llmParsed.preview,
        context: null,
        hints: [],
        provider: llmParsed.provider,
        model: llmParsed.model
      }
    : await sendToTab(tabId, {
        type: "PARSE_ON_PAGE",
        transcript
      });

  state.preview = parsed.preview || null;
  if (parsed.context) {
    state.context = parsed.context;
  }

  machine.transition("preview");

  const actionContext = buildActionContext(state, envelope.args.transcript || "");
  state.lastSafety = self.SafetyGate.validatePreview(state.preview, actionContext);

  chrome.tabs.sendMessage(tabId, {
    type: "SHOW_PREVIEW",
    preview: state.preview,
    safety: state.lastSafety,
    action: envelope,
    parseMeta: {
      provider: parsed.provider || "heuristic",
      model: parsed.model || null,
      fallbackReason: buildFallbackReason(llmParsed) || (llmParsed.ok ? null : "fallback_used")
    },
    step: machine.step
  });

  if (state.lastSafety.ok) {
    notify(
      tabId,
      `Dictation parsed into structured fields (${parsed.provider || "heuristic"}). Check preview.`
    );
  } else {
    notify(tabId, `Preview blocked by safety checks: ${state.lastSafety.blockingIssues.join("; ")}`);
  }

  return {
    ok: true,
    mode: "parse",
    preview: state.preview,
    hints: parsed.hints || [],
    safety: state.lastSafety,
    parseMeta: {
      provider: parsed.provider || "heuristic",
      model: parsed.model || null,
      fallbackReason: buildFallbackReason(llmParsed) || (llmParsed.ok ? null : "fallback_used")
    },
    action: envelope
  };
}

async function runCoordinator(tabId, transcript) {
  const state = getTabState(tabId);
  const actionContext = buildActionContext(state, transcript);
  const envelope = self.DecisionEngine.decide(actionContext);
  state.currentAction = envelope;

  if (envelope.tool === "none") {
    return { ok: true, mode: "noop", action: envelope };
  }

  if (envelope.tool === "navigator") {
    return handleNavigator(tabId, state, envelope);
  }

  if (envelope.tool === "scheduler") {
    return handleScheduler(tabId, state, envelope);
  }

  if (envelope.tool === "flow" && envelope.intent === "visit_end") {
    machine.reset();
    notify(tabId, "Visit has been ended.");
    return { ok: true, mode: "end", action: envelope };
  }

  return handleScribe(tabId, state, envelope);
}

chrome.runtime.onInstalled.addListener(() => {
  machine.reset();
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== "object") {
    return false;
  }

  const tabId = sender && sender.tab ? sender.tab.id : null;

  if (message.type === "VISIT_START") {
    (async () => {
      if (!tabId) {
        sendResponse({ ok: false, error: "no_tab" });
        return;
      }

      machine.reset();
      machine.transition("scraping");
      notify(tabId, "Reading page context...");

      const scraped = await sendToTab(tabId, { type: "SCRAPE_CONTEXT_REQUEST" });
      const state = getTabState(tabId);
      state.context = scraped.context || null;
      state.modules = scraped.modules || [];
      state.preview = null;
      state.lastSafety = null;
      state.currentAction = null;

      await chrome.storage.session.set({ [`ctx_${tabId}`]: state.context });

      machine.transition("listening");
      notify(tabId, "Context loaded. Start dictation or voice commands.");

      sendResponse({
        ok: true,
        step: machine.step,
        context: state.context,
        modules: state.modules
      });
    })();
    return true;
  }

  if (message.type === "VISIT_END") {
    if (tabId) {
      tabState.delete(tabId);
      chrome.storage.session.remove([`ctx_${tabId}`]).catch(() => {});
    }
    machine.reset();
    sendResponse({ ok: true, step: machine.step });
    return false;
  }

  if (message.type === "PARSE_DICTATION") {
    (async () => {
      if (!tabId) {
        sendResponse({ ok: false, error: "no_tab" });
        return;
      }
      const result = await runCoordinator(tabId, message.transcript || "");
      sendResponse({ ok: true, step: machine.step, ...result });
    })();
    return true;
  }

  if (message.type === "VOICE_CHUNK") {
    (async () => {
      if (!tabId) {
        sendResponse({ ok: false, error: "no_tab" });
        return;
      }
      const state = getTabState(tabId);
      const transcript = String(message.transcript || "").trim();
      if (!transcript) {
        sendResponse({ ok: false, error: "empty_transcript" });
        return;
      }

      state.transcript = [state.transcript, transcript].filter(Boolean).join(" ").slice(-5000);
      const result = await runCoordinator(tabId, transcript);
      const hints = proposeInlineHints(state.transcript, state.context);

      sendResponse({
        ok: true,
        step: machine.step,
        hints,
        ...result
      });
    })();
    return true;
  }

  if (message.type === "INLINE_HINTS") {
    (async () => {
      if (!tabId) {
        sendResponse({ ok: false, error: "no_tab" });
        return;
      }

      const state = getTabState(tabId);
      const tabHints = await sendToTab(tabId, {
        type: "INLINE_HINTS_REQUEST",
        text: message.text || ""
      });

      const hints = proposeInlineHints(message.text || "", state.context)
        .concat(tabHints.hints || [])
        .filter((v, idx, arr) => arr.indexOf(v) === idx)
        .slice(0, 10);

      sendResponse({ ok: true, hints, modules: state.modules || tabHints.modules || [] });
    })();
    return true;
  }

  if (message.type === "PREVIEW_DECISION") {
    (async () => {
      if (!tabId) {
        sendResponse({ ok: false, error: "no_tab" });
        return;
      }

      const decision = message.decision || "reject";
      const state = getTabState(tabId);

      if (decision === "confirm") {
        if (state.lastSafety && !state.lastSafety.ok) {
          notify(tabId, "Save blocked by safety gate. Resolve blocking issues first.");
          sendResponse({
            ok: false,
            error: "safety_blocked",
            step: machine.step,
            safety: state.lastSafety
          });
          return;
        }

        machine.transition("confirmed");
        machine.approveHuman();

        if (machine.step === "confirmed" && machine.humanApproved === true) {
          machine.transition("saving");
          const saveRes = await sendToTab(tabId, { type: "SAVE_FORM", preview: state.preview });
          machine.transition("done");

          if (saveRes && saveRes.navigating) {
            notify(tabId, "Opening schedule page and applying generated timetable.");
          } else if (saveRes && saveRes.schedule && saveRes.schedule.applied) {
            notify(tabId, `Schedule saved to DOM: ${saveRes.schedule.applied} rows.`);
          } else if (saveRes && saveRes.fill && Array.isArray(saveRes.fill.missing) && saveRes.fill.missing.length) {
            notify(tabId, `Saved with missing fields: ${saveRes.fill.missing.join(", ")}`);
          } else {
            notify(tabId, "Data saved to DOM after human confirmation.");
          }

          sendResponse({ ok: true, step: machine.step, saveRes });
          return;
        }
      }

      if (decision === "edit") {
        machine.transition("preview");
        notify(tabId, "Preview is in edit mode. Confirm when ready.");
        sendResponse({ ok: true, step: machine.step });
        return;
      }

      machine.transition("idle");
      state.preview = null;
      state.lastSafety = null;
      notify(tabId, "Preview rejected.");
      sendResponse({ ok: true, step: machine.step });
    })();
    return true;
  }

  if (message.type === "PROACTIVE_REPLY") {
    if (tabId) {
      notify(tabId, `Doctor reply: ${message.reply || "none"}`);
    }
    sendResponse({ ok: true, reply: message.reply || "none" });
    return false;
  }

  if (message.type === "TIMELINE_FROM_CONTENT") {
    if (tabId) {
      notify(tabId, message.text || "Content action completed.");
    }
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "PDF_FILE_UPLOADED") {
    const state = tabId ? getTabState(tabId) : null;
    const meta = message.fileMeta || {};
    const text = String(message.extractedText || "").trim().slice(0, 8000);
    if (state) {
      state.uploadedDocuments = [
        ...(state.uploadedDocuments || []),
        {
          name: String(meta.name || "document"),
          type: String(meta.type || "application/octet-stream"),
          size: Number(meta.size || 0),
          content: text,
          createdAt: new Date().toISOString()
        }
      ].slice(-5);
      notify(tabId, text ? `Document added to AI context: ${meta.name || "document"}.` : `Document uploaded, but text extraction is limited: ${meta.name || "document"}.`);
    }
    sendResponse({
      ok: true,
      note: text ? "Document text added to AI context." : "Document accepted, but text extraction returned empty content.",
      chars: text.length,
      fileMeta: meta
    });
    return false;
  }

  if (message.type === "TEMPLATE_UPLOADED") {
    (async () => {
      const template = message.template || {};
      const list = await self.TemplateManager.addTemplate(template.name, template.content);
      sendResponse({ ok: true, count: list.length });
    })();
    return true;
  }

  if (message.type === "SCHEDULE_GENERATE") {
    const procedures = Array.isArray(message.procedures) ? message.procedures : [];
    const schedule = self.SchedulerModule.scheduleGreedy(procedures);
    sendResponse({ ok: true, schedule });
    return false;
  }

  if (message.type === "APPLY_PENDING_SCHEDULE") {
    (async () => {
      if (!tabId) {
        sendResponse({ ok: false, error: "no_tab" });
        return;
      }
      const result = await sendToTab(tabId, { type: "APPLY_PENDING_SCHEDULE" });
      if (result && result.ok) {
        notify(tabId, `Schedule applied manually: ${result.schedule.applied} rows.`);
      } else {
        notify(tabId, "No pending schedule found on this page.");
      }
      sendResponse(result);
    })();
    return true;
  }

  if (message.type === "AI_SETTINGS_SAVE") {
    (async () => {
      const openaiApiKey = String(message.openaiApiKey || "").trim();
      const openaiModel = String(message.openaiModel || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL;
      const proxyBaseUrl = String(message.proxyBaseUrl || DEFAULT_PROXY_BASE_URL).trim().replace(/\/+$/, "");
      const proxyAuthToken = String(message.proxyAuthToken || "").trim();
      await chrome.storage.local.set({ openaiApiKey, openaiModel, proxyBaseUrl, proxyAuthToken });
      sendResponse({
        ok: true,
        configured: Boolean(openaiApiKey) || Boolean(proxyBaseUrl),
        model: openaiModel,
        proxyBaseUrl,
        proxyConfigured: Boolean(proxyBaseUrl),
        proxyAuthConfigured: Boolean(proxyAuthToken)
      });
    })();
    return true;
  }

  if (message.type === "AI_SETTINGS_TEST") {
    (async () => {
      const sample =
        "\u0418\u0432\u0430\u043d\u043e\u0432 \u0410\u0440\u0442\u0435\u043c, 8 \u043b\u0435\u0442. " +
        "\u0420\u0435\u0431\u0435\u043d\u043e\u043a \u0436\u0430\u043b\u0443\u0435\u0442\u0441\u044f \u043d\u0430 \u0441\u043b\u0430\u0431\u043e\u0441\u0442\u044c \u0432 \u043d\u043e\u0433\u0430\u0445. " +
        "\u0421\u043e\u0441\u0442\u043e\u044f\u043d\u0438\u0435 \u0443\u0434\u043e\u0432\u043b\u0435\u0442\u0432\u043e\u0440\u0438\u0442\u0435\u043b\u044c\u043d\u043e\u0435. " +
        "\u0420\u0435\u043a\u043e\u043c\u0435\u043d\u0434\u0443\u0435\u0442\u0441\u044f \u041b\u0424\u041a, \u043c\u0430\u0441\u0441\u0430\u0436, \u043f\u0441\u0438\u0445\u043e\u043b\u043e\u0433.";
      const result = await parseDictationWithLLM(
        sample,
        {
          fullName: "\u0418\u0432\u0430\u043d\u043e\u0432 \u0410\u0440\u0442\u0435\u043c \u0421\u0435\u0440\u0433\u0435\u0435\u0432\u0438\u0447",
          age: "8 \u043b\u0435\u0442",
          diagnosis: "\u0414\u0426\u041f, G80.1"
        },
        "settings_test"
      );
      sendResponse({
        ok: Boolean(result && result.ok),
        provider: result.provider || null,
        model: result.model || null,
        error: result.error || null,
        details: result.details || null,
        fields: result.preview && result.preview.fields ? result.preview.fields : null
      });
    })();
    return true;
  }

  if (message.type === "AI_SETTINGS_GET") {
    (async () => {
      const cfg = await getAiSettings();
      sendResponse({
        ok: true,
        configured: Boolean(cfg.openaiApiKey) || Boolean(cfg.proxyBaseUrl),
        model: cfg.openaiModel,
        proxyBaseUrl: cfg.proxyBaseUrl,
        proxyConfigured: Boolean(cfg.proxyBaseUrl),
        proxyAuthConfigured: Boolean(cfg.proxyAuthToken),
        localKeyConfigured: Boolean(cfg.openaiApiKey)
      });
    })();
    return true;
  }

  if (message.type === "STATE_GET") {
    const state = tabId ? getTabState(tabId) : null;
    sendResponse({
      ok: true,
      step: machine.step,
      humanApproved: machine.humanApproved,
      action: state ? state.currentAction : null,
      safety: state ? state.lastSafety : null
    });
    return false;
  }

  return false;
});
