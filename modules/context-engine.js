(() => {
  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[.,!?;:()[\]{}"'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function deriveWorkflowStep(step, preview) {
    if (step === "preview" && preview) {
      return "awaiting_confirmation";
    }
    if (step === "listening") {
      return "collecting_dictation";
    }
    if (step === "saving") {
      return "saving_to_dom";
    }
    return step || "idle";
  }

  function classifyTextKind(text) {
    const t = normalize(text);
    if (!t) {
      return "empty";
    }
    if (/^(open|go to|switch|show|open tab|navigate|открой|перейди|переключи|покажи|аш|көрсет|ауыс)/.test(t)) {
      return "navigation_command";
    }
    if (/(расписан|schedule|calendar|slot|кесте)/.test(t)) {
      return "schedule_request";
    }
    if (/(stop visit|finish visit|end visit|заверши прием|стоп прием|қабылдауды аяқта)/.test(t)) {
      return "visit_end";
    }
    return "clinical_dictation";
  }

  function getMissingCoreFields(preview) {
    const fields = (preview && preview.fields) || {};
    const required = ["complaints", "objective", "plan"];
    return required.filter((name) => {
      const value = fields[name];
      return value === null || value === undefined || String(value).trim() === "";
    });
  }

  function buildActionContext(payload) {
    const state = payload && payload.state ? payload.state : {};
    const transcript = String((payload && payload.transcript) || "");
    const textKind = classifyTextKind(transcript);
    const context = state.context || {};
    const preview = state.preview || null;

    return {
      transcript,
      normalizedTranscript: normalize(transcript),
      textKind,
      workflowStep: deriveWorkflowStep(payload && payload.machineStep, preview),
      patient: {
        fullName: context.fullName || "",
        diagnosis: context.diagnosis || "",
        age: context.age || ""
      },
      modules: Array.isArray(state.modules) ? state.modules : [],
      hasPreview: Boolean(preview),
      missingCoreFields: getMissingCoreFields(preview),
      machineStep: payload && payload.machineStep ? payload.machineStep : "idle"
    };
  }

  self.ContextEngine = {
    buildActionContext,
    normalize
  };
})();
