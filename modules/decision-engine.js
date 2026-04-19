(() => {
  function extractNavigateTarget(transcript) {
    const text = String(transcript || "").trim();
    const cleaned = text
      .replace(/^(open|go to|switch|show|открой|перейди|переключи|покажи|аш|көрсет|ауыс)\s+/i, "")
      .replace(/^(to|tab|module|к|на|вкладку|модуль|бетіне)\s+/i, "")
      .trim();
    return cleaned || "первичный осмотр";
  }

  function buildEnvelope(intent, tool, args, confidence, requiresHumanApproval, reason) {
    return {
      intent,
      tool,
      args: args || {},
      confidence: typeof confidence === "number" ? confidence : 0.5,
      requiresHumanApproval: Boolean(requiresHumanApproval),
      reason: reason || ""
    };
  }

  function decide(context) {
    const kind = context && context.textKind;

    if (kind === "empty") {
      return buildEnvelope("noop", "none", {}, 0.1, false, "empty transcript");
    }

    if (kind === "navigation_command") {
      return buildEnvelope(
        "navigate",
        "navigator",
        { target: extractNavigateTarget(context.transcript) },
        0.92,
        false,
        "voice navigation command"
      );
    }

    if (kind === "schedule_request") {
      return buildEnvelope("schedule", "scheduler", {}, 0.9, true, "schedule requested");
    }

    if (kind === "visit_end") {
      return buildEnvelope("visit_end", "flow", {}, 0.95, false, "visit end command");
    }

    return buildEnvelope(
      "parse_dictation",
      "scribe",
      {
        transcript: context.transcript,
        patient: context.patient,
        workflowStep: context.workflowStep
      },
      0.88,
      true,
      "clinical dictation"
    );
  }

  self.DecisionEngine = {
    decide
  };
})();
