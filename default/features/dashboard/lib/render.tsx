import { renderToString } from "react-dom/server";

import type { InternStatus } from "./status";

import { DashboardPage } from "./page";

const MESSAGE: Record<InternStatus["health"], string> = {
  degraded: "This intern is serving, but its own state store is not answering",
  ok: "This intern is serving and its own state store is answering",
};

// Takes the intern's status, never the Request: nothing about the caller can
// reach the page. Credentials reach an intern in request headers.
export const getHtml = (status: InternStatus): string =>
  renderToString(
    <DashboardPage
      heading="Intern status"
      message={MESSAGE[status.health]}
      stats={[
        {
          label: "Feature",
          value: status.featureId,
        },
        {
          label: "Health",
          value: status.health,
        },
        {
          label: "State store",
          value: status.stateStore ?? "unavailable",
        },
        {
          label: "Uptime",
          value: `${status.uptimeSeconds}s`,
        },
      ]}
    />
  );
