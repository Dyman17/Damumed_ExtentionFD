(() => {
  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
  }

  function hasPlainSpeech(value) {
    const text = normalize(value);
    if (!text) {
      return false;
    }
    const plainWords = ["better", "worse", "good", "bad", "normal", "fine", "ok"];
    return plainWords.some((w) => text.includes(w));
  }

  function validatePreview(preview, context) {
    const issues = [];
    const warnings = [];

    if (!preview || !preview.fields) {
      issues.push("Preview is empty");
      return { ok: false, blockingIssues: issues, warnings };
    }

    const fields = preview.fields;
    const required = ["complaints", "objective", "plan"];

    required.forEach((key) => {
      const value = fields[key];
      if (value === null || value === undefined || String(value).trim() === "") {
        issues.push(`Required field missing: ${key}`);
      }
    });

    if (hasPlainSpeech(fields.objective)) {
      warnings.push("Objective field may be too informal");
    }

    if (context && context.patient && context.patient.diagnosis) {
      const diagnosis = normalize(context.patient.diagnosis);
      const planText = normalize(fields.plan || "");
      if (diagnosis.includes("g80") && !/(lfk|massage|rehab|psycholog)/.test(planText)) {
        warnings.push("Plan may not include expected rehab procedures for diagnosis context");
      }
    }

    return {
      ok: issues.length === 0,
      blockingIssues: issues,
      warnings
    };
  }

  self.SafetyGate = {
    validatePreview
  };
})();
