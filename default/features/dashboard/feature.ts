import type { ApiContribution } from "ori/api";

import { Effect } from "effect";
import { FeatureLog } from "ori/services/feature-log";

import { getHtml } from "./lib/render";

export const api: ApiContribution = {
  routes: {
    "GET /": (req: Request) =>
      Effect.gen(function* () {
        const log = yield* FeatureLog;
        yield* log.info("Dashboard accessed");

        const html = getHtml(req);
        // Wrap with doctype since React doesn't include it
        const fullHtml = `<!DOCTYPE html>\n${html}`;

        return new Response(fullHtml, {
          headers: { "Content-Type": "text/html" },
        });
      }),
  },
};
