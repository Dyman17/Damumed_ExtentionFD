(() => {
  class StepMachine {
    constructor() {
      this.step = "idle";
      this.humanApproved = false;
      this.updatedAt = Date.now();
      this.allowed = {
        idle: ["scraping"],
        scraping: ["listening", "idle"],
        listening: ["parsing", "idle"],
        parsing: ["preview", "idle"],
        preview: ["confirmed", "idle"],
        confirmed: ["saving", "idle"],
        saving: ["done", "idle"],
        done: ["idle", "scraping"]
      };
    }

    canGo(next) {
      return (this.allowed[this.step] || []).includes(next);
    }

    transition(next) {
      if (!this.canGo(next)) {
        return { ok: false, from: this.step, to: next, error: "invalid_transition" };
      }
      this.step = next;
      this.updatedAt = Date.now();
      if (next !== "confirmed") {
        this.humanApproved = false;
      }
      return { ok: true, step: this.step, updatedAt: this.updatedAt };
    }

    approveHuman() {
      this.humanApproved = true;
      this.updatedAt = Date.now();
      return { ok: true, humanApproved: true };
    }

    reset() {
      this.step = "idle";
      this.humanApproved = false;
      this.updatedAt = Date.now();
      return { ok: true, step: this.step };
    }
  }

  self.StepMachine = StepMachine;
})();
