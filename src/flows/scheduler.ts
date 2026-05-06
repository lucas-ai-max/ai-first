import cron, { type ScheduledTask } from "node-cron";
import { getEnv } from "../config/env.js";
import { runDailyFlow } from "./daily-flow.js";
import { runWeeklyFlow } from "./weekly-flow.js";

let _jobs: ScheduledTask[] = [];

function scheduleJob(name: string, expression: string, timezone: string, fn: () => Promise<unknown>): ScheduledTask {
  if (!cron.validate(expression)) {
    throw new Error(`Cron inválido para ${name}: "${expression}"`);
  }
  const task = cron.schedule(
    expression,
    () => {
      console.log(`[scheduler] disparando ${name}`);
      fn().catch((err) => {
        console.error(`[scheduler] ${name} falhou:`, err);
      });
    },
    { timezone },
  );
  console.log(`[scheduler] ${name} registrado em "${expression}" (${timezone})`);
  return task;
}

export function startSchedulers(): void {
  const env = getEnv();
  if (!env.REPORTS_ENABLED) {
    console.log("[scheduler] REPORTS_ENABLED=false; schedulers não iniciados.");
    return;
  }
  _jobs.push(scheduleJob("daily-flow", env.DAILY_CRON, env.REPORTS_TIMEZONE, () => runDailyFlow()));
  _jobs.push(scheduleJob("weekly-flow", env.WEEKLY_CRON, env.REPORTS_TIMEZONE, () => runWeeklyFlow()));
}

export function stopSchedulers(): void {
  for (const job of _jobs) job.stop();
  _jobs = [];
}
