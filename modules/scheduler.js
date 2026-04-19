(() => {
  const DAY_COUNT = 9;
  const TIMES = ["09:00", "09:40", "10:20", "11:00", "14:00", "14:40", "15:20", "16:00"];
  const SPECIALISTS = ["lfk", "massage", "psychologist", "doctor"];
  const SPECIALIST_LABELS = {
    lfk: "\u0418\u043d\u0441\u0442\u0440\u0443\u043a\u0442\u043e\u0440 \u041b\u0424\u041a",
    massage: "\u041c\u0430\u0441\u0441\u0430\u0436\u0438\u0441\u0442",
    psychologist: "\u041f\u0441\u0438\u0445\u043e\u043b\u043e\u0433",
    doctor: "\u0412\u0440\u0430\u0447"
  };

  function addWorkDays(startDate, days) {
    const result = [];
    const cursor = new Date(startDate.getTime());
    while (result.length < days) {
      const day = cursor.getDay();
      if (day !== 0 && day !== 6) {
        result.push(new Date(cursor.getTime()));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    return result;
  }

  function fmtDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/\u0451/g, "\u0435")
      .replace(/[.,!?;:()[\]{}"'`]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function generateSlots() {
    const slots = [];
    const days = addWorkDays(new Date(), DAY_COUNT);
    days.forEach((day, dayIndex) => {
      TIMES.forEach((time, timeIndex) => {
        SPECIALISTS.forEach((specialist) => {
          slots.push({
            date: fmtDate(day),
            dayIndex,
            time,
            timeIndex,
            specialist,
            busy: false
          });
        });
      });
    });
    return slots;
  }

  function inferSpecialist(procName) {
    const t = normalize(procName);
    if (t.includes("\u043b\u0444\u043a") || t.includes("\u043b\u0435\u0447\u0435\u0431\u043d") || t.includes("exercise")) {
      return "lfk";
    }
    if (t.includes("\u043c\u0430\u0441\u0441") || t.includes("massage")) {
      return "massage";
    }
    if (t.includes("\u043f\u0441\u0438\u0445") || t.includes("psych")) {
      return "psychologist";
    }
    return "doctor";
  }

  function normalizeProcedureName(procName) {
    const specialist = inferSpecialist(procName);
    const raw = String(procName || "").trim();
    if (specialist === "lfk") {
      return "\u041b\u0424\u041a";
    }
    if (specialist === "massage") {
      return "\u041c\u0430\u0441\u0441\u0430\u0436";
    }
    if (specialist === "psychologist") {
      return "\u041f\u0441\u0438\u0445\u043e\u043b\u043e\u0433";
    }
    return raw || "\u041e\u0441\u043c\u043e\u0442\u0440";
  }

  function priorityOf(procName) {
    const specialist = inferSpecialist(procName);
    if (specialist === "lfk") {
      return 1;
    }
    if (specialist === "massage") {
      return 2;
    }
    if (specialist === "psychologist") {
      return 3;
    }
    return 4;
  }

  function isHeavy(procName) {
    const specialist = inferSpecialist(procName);
    return specialist === "lfk" || specialist === "massage";
  }

  function sessionCount(procName) {
    const specialist = inferSpecialist(procName);
    if (specialist === "lfk" || specialist === "massage") {
      return DAY_COUNT;
    }
    if (specialist === "psychologist") {
      return 3;
    }
    return 1;
  }

  function expandProcedures(procedures) {
    const source = Array.isArray(procedures) && procedures.length ? procedures : ["\u041b\u0424\u041a", "\u041c\u0430\u0441\u0441\u0430\u0436", "\u041f\u0441\u0438\u0445\u043e\u043b\u043e\u0433"];
    const unique = [];
    source.forEach((proc) => {
      const name = normalizeProcedureName(proc);
      if (!unique.some((item) => inferSpecialist(item) === inferSpecialist(name))) {
        unique.push(name);
      }
    });

    return unique
      .sort((a, b) => priorityOf(a) - priorityOf(b))
      .flatMap((proc) => {
        const count = sessionCount(proc);
        return Array.from({ length: count }, (_, index) => ({
          name: proc,
          session: index + 1,
          total: count,
          desiredDayIndex: count === DAY_COUNT ? index : count === 3 ? [0, 3, 6][index] : 0,
          specialist: inferSpecialist(proc),
          heavy: isHeavy(proc)
        }));
      });
  }

  function hasHeavyNeighbor(assignments, slot) {
    return assignments.some((item) => {
      if (!item.heavy || item.date !== slot.date) {
        return false;
      }
      return Math.abs(item.timeIndex - slot.timeIndex) <= 1;
    });
  }

  function scheduleGreedy(procedures) {
    const slots = generateSlots();
    const sessions = expandProcedures(procedures);
    const assignments = [];

    function chooseSlot(proc, strictDay) {
      for (let i = 0; i < slots.length; i += 1) {
        const slot = slots[i];
        if (slot.busy || slot.specialist !== proc.specialist) {
          continue;
        }
        if (strictDay && slot.dayIndex !== proc.desiredDayIndex) {
          continue;
        }
        if (!strictDay && slot.dayIndex < proc.desiredDayIndex) {
          continue;
        }
        if (proc.heavy && hasHeavyNeighbor(assignments, slot)) {
          continue;
        }
        return slot;
      }
      return null;
    }

    sessions.forEach((proc) => {
      const chosen = chooseSlot(proc, true) || chooseSlot(proc, false);

      if (!chosen) {
        assignments.push({
          procedure: proc.name,
          session: proc.session,
          total: proc.total,
          specialist: SPECIALIST_LABELS[proc.specialist],
          status: "unassigned"
        });
        return;
      }

      chosen.busy = true;
      assignments.push({
        procedure: proc.name,
        session: proc.session,
        total: proc.total,
        date: chosen.date,
        time: chosen.time,
        timeIndex: chosen.timeIndex,
        specialist: SPECIALIST_LABELS[proc.specialist],
        heavy: proc.heavy,
        status: "ok"
      });
    });

    return assignments;
  }

  self.SchedulerModule = {
    scheduleGreedy
  };
})();
