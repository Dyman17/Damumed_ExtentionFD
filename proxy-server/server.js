const express = require("express");
const cors = require("cors");

const app = express();

const PORT = Number(process.env.PORT || 10000);
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || "").trim();
const OPENAI_MODEL = String(process.env.OPENAI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";
const CLIENT_SHARED_TOKEN = String(process.env.CLIENT_SHARED_TOKEN || "").trim();
const ALLOWED_ORIGINS_RAW = String(process.env.ALLOWED_ORIGINS || "").trim();

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function normalizeFieldText(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeParsedFields(raw, diagnosisFallback) {
  const src = raw && typeof raw === "object" ? raw : {};

  let procedures = null;
  if (Array.isArray(src.procedures)) {
    procedures = src.procedures.map((x) => String(x || "").trim()).filter(Boolean).slice(0, 12);
  } else if (typeof src.procedures === "string") {
    procedures = src.procedures
      .split(/[;,]/)
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12);
  }

  const objectiveCandidate = src.objective !== undefined ? src.objective : src.objective_status;

  return {
    complaints: normalizeFieldText(src.complaints),
    anamnesis: normalizeFieldText(src.anamnesis),
    objective: normalizeFieldText(objectiveCandidate),
    plan: normalizeFieldText(src.plan),
    recommendations: normalizeFieldText(src.recommendations),
    procedures: procedures && procedures.length ? procedures : null,
    diagnosis: normalizeFieldText(src.diagnosis) || normalizeFieldText(diagnosisFallback)
  };
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

function checkClientToken(req, res, next) {
  if (!CLIENT_SHARED_TOKEN) {
    next();
    return;
  }
  const incoming = String(req.headers["x-client-token"] || "").trim();
  if (!incoming || incoming !== CLIENT_SHARED_TOKEN) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  next();
}

function buildCorsOptions() {
  if (!ALLOWED_ORIGINS_RAW) {
    return { origin: true };
  }
  const allowed = ALLOWED_ORIGINS_RAW.split(",").map((x) => x.trim()).filter(Boolean);
  return {
    origin(origin, callback) {
      if (!origin || allowed.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Not allowed by CORS"));
    }
  };
}

app.use(cors(buildCorsOptions()));
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "ai-doc-agent-proxy",
    model: OPENAI_MODEL,
    openaiConfigured: Boolean(OPENAI_API_KEY),
    tokenRequired: Boolean(CLIENT_SHARED_TOKEN)
  });
});

app.post("/api/parse-dictation", checkClientToken, async (req, res) => {
  if (!OPENAI_API_KEY) {
    res.status(500).json({ ok: false, error: "server_openai_key_missing" });
    return;
  }

  const transcript = String((req.body && req.body.transcript) || "").trim();
  const workflowStep = String((req.body && req.body.workflowStep) || "collecting_dictation").trim();
  const patient = (req.body && req.body.patient) || {};

  if (!transcript) {
    res.status(400).json({ ok: false, error: "transcript_empty" });
    return;
  }

  const systemPrompt = [
    "You are a medical documentation assistant for rehabilitation clinic workflows.",
    "Return ONLY valid JSON object.",
    "Extract and structure dictated text into these keys:",
    "complaints, anamnesis, objective, plan, procedures, recommendations, diagnosis.",
    "Rules:",
    "1) Use clinical language and concise phrasing.",
    "2) Do not invent facts that are absent in transcript/context.",
    "3) If value is absent, return null.",
    "4) procedures must be an array of strings or null."
  ].join("\n");

  const userPayload = {
    transcript,
    workflowStep,
    patient: {
      fullName: String(patient.fullName || ""),
      diagnosis: String(patient.diagnosis || ""),
      age: String(patient.age || "")
    }
  };

  let response;
  try {
    response = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: JSON.stringify(userPayload) }
        ]
      })
    });
  } catch (err) {
    res.status(502).json({ ok: false, error: "openai_network_error", details: String(err.message || err) });
    return;
  }

  if (!response.ok) {
    let details = "";
    try {
      details = await response.text();
    } catch (_err) {
      details = "";
    }
    res.status(502).json({
      ok: false,
      error: `openai_http_${response.status}`,
      details: details.slice(0, 400)
    });
    return;
  }

  let data;
  try {
    data = await response.json();
  } catch (_err) {
    res.status(502).json({ ok: false, error: "openai_invalid_json" });
    return;
  }

  const content =
    data && data.choices && data.choices[0] && data.choices[0].message && typeof data.choices[0].message.content === "string"
      ? data.choices[0].message.content
      : "";

  const parsed = safeJsonParse(content);
  if (!parsed) {
    res.status(502).json({ ok: false, error: "model_output_not_json", details: String(content || "").slice(0, 220) });
    return;
  }

  const fields = normalizeParsedFields(parsed, patient.diagnosis || null);

  res.json({
    ok: true,
    provider: "render-proxy",
    model: OPENAI_MODEL,
    fields
  });
});

app.use((err, _req, res, _next) => {
  res.status(500).json({ ok: false, error: "server_error", details: String(err && err.message ? err.message : err) });
});

app.listen(PORT, () => {
  console.log(`ai-doc-agent-proxy listening on ${PORT}`);
});
