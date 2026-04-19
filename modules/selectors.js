(function () {
  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/[.,!?;:()[\]{}"'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function tokens(value) {
    return normalize(value)
      .split(" ")
      .filter((part) => part.length > 1);
  }

  const MODULE_ALIASES = {
    reception: ["первичный", "осмотр", "прием", "қабылдау", "reception", "exam"],
    schedule: ["расписание", "назначения", "кесте", "schedule"],
    status: ["статус", "журнал", "қызмет", "services", "status"],
    epicrisis: ["эпикриз", "выпис", "epicrisis", "discharge"]
  };

  function resolveModuleTarget(targetText) {
    const tks = tokens(targetText);
    if (!tks.length) {
      return "";
    }
    const keys = Object.keys(MODULE_ALIASES);
    for (let i = 0; i < keys.length; i += 1) {
      const key = keys[i];
      const aliases = MODULE_ALIASES[key];
      const hit = tks.some((tk) => aliases.some((a) => normalize(a).includes(tk) || tk.includes(normalize(a))));
      if (hit) {
        return key;
      }
    }
    return "";
  }

  function getLabel(element) {
    if (!element) {
      return "";
    }
    const attrs = [
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("name"),
      element.getAttribute("id")
    ]
      .filter(Boolean)
      .join(" ");

    const id = element.getAttribute("id");
    let fromLabel = "";
    if (id) {
      const label = document.querySelector(`label[for="${id}"]`);
      if (label) {
        fromLabel = label.textContent || "";
      }
    }

    const parentText =
      (element.closest("tr, .field, .form-group, section, div") || {}).textContent || "";

    return `${attrs} ${fromLabel} ${parentText}`.trim();
  }

  function findField(hints) {
    const needle = (Array.isArray(hints) ? hints : [])
      .map((h) => normalize(h))
      .filter(Boolean);
    const candidates = document.querySelectorAll("input, textarea, select, [contenteditable='true']");
    for (let i = 0; i < candidates.length; i += 1) {
      const el = candidates[i];
      const label = normalize(getLabel(el));
      if (!label) {
        continue;
      }
      if (needle.some((hint) => label.includes(hint))) {
        return el;
      }
    }
    return null;
  }

  function findTextNear(hints) {
    const needle = (Array.isArray(hints) ? hints : [])
      .map((h) => normalize(h))
      .filter(Boolean);
    const nodes = document.querySelectorAll("label, th, td, span, p, div, li");
    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const text = normalize(node.textContent || "");
      if (!text) {
        continue;
      }
      if (!needle.some((hint) => text.includes(hint))) {
        continue;
      }
      const row = node.closest("tr, .row, .field, .item") || node.parentElement;
      if (!row) {
        continue;
      }
      const valueNode = row.querySelector("input, textarea, select, .value, [data-value]");
      if (valueNode && "value" in valueNode) {
        return String(valueNode.value || "").trim();
      }
      if (valueNode) {
        return String(valueNode.textContent || "").trim();
      }
      return String(node.textContent || "").trim();
    }
    return "";
  }

  function navigateTo(targetText) {
    const target = normalize(targetText);
    const targetTokens = tokens(targetText);
    const moduleKey = resolveModuleTarget(targetText);

    if (moduleKey) {
      const byData = document.querySelector(
        `[data-page="${moduleKey}"], [data-module="${moduleKey}"], #tab-${moduleKey}`
      );
      if (byData) {
        byData.click();
        return true;
      }
    }

    const allClickable = document.querySelectorAll("a, button, [role='tab'], .nav-item, li, [data-page]");
    let best = null;
    let bestScore = 0;

    for (let i = 0; i < allClickable.length; i += 1) {
      const el = allClickable[i];
      const text = normalize(el.textContent || el.innerText || "");
      const aria = normalize(el.getAttribute("aria-label") || "");
      const title = normalize(el.getAttribute("title") || "");
      if (text.includes(target) || aria.includes(target) || title.includes(target)) {
        el.click();
        return true;
      }

      if (!targetTokens.length) {
        continue;
      }
      const hay = `${text} ${aria} ${title}`;
      let score = 0;
      targetTokens.forEach((tk) => {
        if (hay.includes(tk)) {
          score += 1;
        }
      });
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }

    if (best && bestScore >= Math.max(1, Math.ceil(targetTokens.length / 2))) {
      best.click();
      return true;
    }
    return false;
  }

  function writeValue(element, value) {
    if (!element) {
      return false;
    }
    const normalized = Array.isArray(value) ? value.join(", ") : String(value ?? "");
    if (element.tagName === "SELECT") {
      const options = Array.from(element.options || []);
      const hit = options.find((opt) => normalize(opt.textContent).includes(normalize(normalized)));
      element.value = hit ? hit.value : element.value;
    } else {
      element.value = normalized;
    }
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  window.AdaptiveSelectors = {
    findField,
    findTextNear,
    navigateTo,
    writeValue,
    resolveModuleTarget
  };
})();
