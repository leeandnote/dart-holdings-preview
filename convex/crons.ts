import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.interval("poll DART major holdings", { minutes: 10 }, internal.dart.pollMajorHoldingsInternal, {});
crons.interval("poll DART executive holdings", { minutes: 10 }, internal.dart.pollExecutiveHoldingsInternal, {});
crons.interval("poll DART contract reports", { minutes: 10 }, internal.dart.pollContractReportsInternal, {});
crons.daily(
  "final DART major holdings sweep",
  { hourUTC: 11, minuteUTC: 5 },
  internal.dart.backfillDailyReportItemsInternal,
  { limit: 100 },
);

crons.daily(
  "final DART executive holdings sweep",
  { hourUTC: 11, minuteUTC: 10 },
  internal.dart.backfillExecutiveDailyReportItemsInternal,
  { limit: 100 },
);

export default crons;


