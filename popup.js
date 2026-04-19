const statusEl = document.getElementById("status");
const proxyUrlInput = document.getElementById("proxyUrlInput");
const proxyTokenInput = document.getElementById("proxyTokenInput");
const modelInput = document.getElementById("modelInput");
const saveAiBtn = document.getElementById("saveAiBtn");
const testAiBtn = document.getElementById("testAiBtn");
const openMockBtn = document.getElementById("openMockBtn");

function setStatus(text) {
  statusEl.textContent = text;
}

function runtimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response || {});
    });
  });
}

function maskValue(value) {
  const clean = String(value || "").trim();
  if (!clean) {
    return "не задан";
  }
  if (clean.length <= 8) {
    return `${clean.slice(0, 2)}***`;
  }
  return `${clean.slice(0, 4)}...${clean.slice(-4)}`;
}

async function loadAiSettings() {
  const res = await runtimeMessage({ type: "AI_SETTINGS_GET" });
  if (!res.ok) {
    setStatus("Не удалось загрузить настройки.");
    return;
  }

  proxyUrlInput.value = res.proxyBaseUrl || "https://web-service-case.onrender.com";
  modelInput.value = res.model || "gpt-4o-mini";

  setStatus(
    `Proxy: ${res.proxyConfigured ? "подключен" : "не настроен"}\n` +
      `Token: ${res.proxyAuthConfigured ? "задан" : "не задан"}\n` +
      `Model: ${res.model || "gpt-4o-mini"}`
  );
}

saveAiBtn.addEventListener("click", async () => {
  const proxyBaseUrl = String(proxyUrlInput.value || "").trim();
  const proxyAuthToken = String(proxyTokenInput.value || "").trim();
  const openaiModel = String(modelInput.value || "gpt-4o-mini").trim() || "gpt-4o-mini";

  const res = await runtimeMessage({
    type: "AI_SETTINGS_SAVE",
    proxyBaseUrl,
    proxyAuthToken,
    openaiApiKey: "",
    openaiModel
  });

  if (!res.ok) {
    setStatus("Не удалось сохранить настройки.");
    return;
  }

  setStatus(
    `Сохранено.\n` +
      `Proxy: ${res.proxyConfigured ? "подключен" : "не настроен"}\n` +
      `Token: ${maskValue(proxyAuthToken)}\n` +
      `Model: ${res.model}`
  );

  proxyTokenInput.value = "";
});

testAiBtn.addEventListener("click", async () => {
  setStatus("Проверяю Render proxy...");
  const res = await runtimeMessage({ type: "AI_SETTINGS_TEST" });
  if (!res.ok) {
    setStatus(
      `AI proxy не отвечает.\n` +
        `Ошибка: ${res.error || "unknown"}\n` +
        `Details: ${res.details || "n/a"}`
    );
    return;
  }

  const fields = res.fields || {};
  setStatus(
    `AI proxy работает.\n` +
      `Provider: ${res.provider || "n/a"}\n` +
      `Model: ${res.model || "n/a"}\n` +
      `Жалобы: ${fields.complaints ? "ok" : "empty"}\n` +
      `Статус: ${fields.objective ? "ok" : "empty"}\n` +
      `Процедуры: ${Array.isArray(fields.procedures) ? fields.procedures.join(", ") : "empty"}`
  );
});

openMockBtn.addEventListener("click", () => {
  const url = chrome.runtime.getURL("mock/patient-card.html");
  chrome.tabs.create({ url });
  setStatus("Demo mock открыт.");
});

loadAiSettings().catch(() => {
  setStatus("Не удалось загрузить настройки.");
});
