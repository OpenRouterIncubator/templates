import type { ApiContribution } from "ori";

import { getHtml } from "./lib/render";
import {
  internStatusLogFields,
  readInternStatus,
  statusHttpCode,
} from "./lib/status";

const STARTED_AT_MS = Date.now();

export const api: ApiContribution = {
  routes: {
    "GET /": async (_req: Request, ctx) => {
      const uptimeSeconds = Math.floor((Date.now() - STARTED_AT_MS) / 1000);
      const status = await readInternStatus({ ctx, uptimeSeconds });

      ctx.logger.info("Dashboard accessed", internStatusLogFields(status));

      const html = getHtml(status);
      // Wrap with doctype since React doesn't include it
      const fullHtml = `<!DOCTYPE html>\n${html}`;

      return new Response(fullHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" },
        status: statusHttpCode(status.health),
      });
    },
  },
};
