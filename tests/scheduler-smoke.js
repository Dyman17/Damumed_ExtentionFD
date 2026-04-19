global.self = global;

require("../modules/scheduler.js");

const cases = [
  {
    name: "Base rehab course",
    procedures: ["ЛФК", "массаж нижних конечностей", "консультация психолога"],
    expectedMinRows: 21,
    expectedDays: 9
  },
  {
    name: "Synonyms",
    procedures: ["лечебная физкультура", "massage", "psychologist"],
    expectedMinRows: 21,
    expectedDays: 9
  }
];

let failed = 0;

cases.forEach((item) => {
  const schedule = global.SchedulerModule.scheduleGreedy(item.procedures);
  const okRows = schedule.filter((row) => row.status === "ok");
  const days = new Set(okRows.map((row) => row.date));
  const unassigned = schedule.filter((row) => row.status !== "ok");

  const pass =
    schedule.length >= item.expectedMinRows &&
    days.size === item.expectedDays &&
    unassigned.length === 0;

  console.log(`${pass ? "PASS" : "FAIL"} ${item.name}`);
  console.log(`rows=${schedule.length}, days=${days.size}, unassigned=${unassigned.length}`);
  console.log(JSON.stringify(schedule.slice(0, 5), null, 2));

  if (!pass) {
    failed += 1;
  }
});

if (failed) {
  process.exit(1);
}
