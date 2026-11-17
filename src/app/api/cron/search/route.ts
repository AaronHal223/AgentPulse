import { NextResponse } from "next/server";
import { handler } from "@/lib/api";
import { assertCron } from "@/lib/cron";
import { recordError, recordJobRun } from "@/lib/monitor";
import { dueForRecheck, dueForSearch, recheckStep, searchStep, type Due, type StepResult } from "@/lib/daily";

export const maxDuration = 300;

/**
 * The morning run: searches for every active buyer that hasn't been searched in ~20 hours,
 * then re-checks saved homes for price drops and status changes. Stops starting new work when
 * the time budget runs low and reports how much remains, so the scheduler can call it again
 * until `remaining` is 0.
 */
export const GET = handler(async (req: Request) => {
  assertCron(req);
  const started = Date.now();
  const budgetMs = Number(process.env.CRON_BUDGET_SECONDS || 200) * 1000;
  const inBudget = () => Date.now() - started <= budgetMs;

  const done: StepResult[] = [];
  async function work(queue: Due[], step: (due: Due) => Promise<StepResult>) {
    let finished = 0;
    for (const due of queue) {
      if (!inBudget()) break;
      done.push(await step(due));
      finished++;
    }
    return queue.length - finished;
  }

  const searchesLeft = await work(await dueForSearch(), searchStep);
  const rechecksLeft = await work(await dueForRecheck(), recheckStep);
  const failed = done.filter((d) => d.error);
  const remaining = searchesLeft + rechecksLeft;
  if (failed.length) await recordError("morning run", `${failed.length} of ${done.length} step(s) failed. First: ${failed[0].error}`);
  if (done.length) await recordJobRun("search", { processed: done.length, failed: failed.length, remaining });
  return NextResponse.json({ processed: done.length, remaining, errors: failed.map((d) => `${d.buyerId}: ${d.error}`) });
});
