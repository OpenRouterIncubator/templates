import { describe, expect, test } from "bun:test";

import type { StatusContext } from "./status";

import { dashboardLogLine, readInternStatus, statusHttpCode } from "./status";

const stateStore = (
  get: (key: string) => Promise<string | undefined>
): NonNullable<StatusContext["stores"]>["state"] => ({
  exec: () => Promise.resolve(),
  get,
  name: "state",
  query: () => Promise.resolve([]),
  set: () => Promise.resolve(),
});

const contextWithStore = (
  get: (key: string) => Promise<string | undefined>
): StatusContext => {
  const state = stateStore(get);
  return {
    featureId: "dashboard",
    stores: { db: () => Promise.resolve(state), state },
  };
};

describe("readInternStatus", () => {
  test("is ok and names the store when the intern's state store answers", async () => {
    const status = await readInternStatus({
      ctx: contextWithStore(() => Promise.resolve(undefined)),
      uptimeSeconds: 42,
    });

    expect(status.health).toBe("ok");
    expect(status.stateStore).toBe("state");
    expect(status.stateStoreError).toBeUndefined();
    expect(status.featureId).toBe("dashboard");
    expect(status.uptimeSeconds).toBe(42);
  });

  test("is degraded when the intern's state store never opened", async () => {
    const status = await readInternStatus({
      ctx: { featureId: "dashboard", stores: undefined },
      uptimeSeconds: 7,
    });

    expect(status.health).toBe("degraded");
    expect(status.stateStore).toBeUndefined();
    expect(status.stateStoreError).toBe(
      "the intern's state store did not open"
    );
  });

  test("is degraded and carries the cause when the state store rejects", async () => {
    const status = await readInternStatus({
      ctx: contextWithStore(() =>
        Promise.reject(new Error("database is locked"))
      ),
      uptimeSeconds: 7,
    });

    expect(status.health).toBe("degraded");
    expect(status.stateStore).toBe("state");
    expect(status.stateStoreError).toBe("Error: database is locked");
  });

  test("answers degraded rather than hanging when the state store never settles", async () => {
    const status = await readInternStatus({
      ctx: contextWithStore(() => new Promise<string | undefined>(() => {})),
      probeTimeoutMs: 10,
      uptimeSeconds: 7,
    });

    expect(status.health).toBe("degraded");
    expect(status.stateStore).toBe("state");
    expect(status.stateStoreError).toBe(
      "the intern's state store did not answer within 10ms"
    );
  });

  test("tells the three state-store faults apart", async () => {
    const [notOpen, rejected, hung] = await Promise.all([
      readInternStatus({
        ctx: { featureId: "dashboard", stores: undefined },
        uptimeSeconds: 0,
      }),
      readInternStatus({
        ctx: contextWithStore(() =>
          Promise.reject(new Error("database is locked"))
        ),
        uptimeSeconds: 0,
      }),
      readInternStatus({
        ctx: contextWithStore(() => new Promise<string | undefined>(() => {})),
        probeTimeoutMs: 10,
        uptimeSeconds: 0,
      }),
    ]);

    expect(
      new Set([
        notOpen.stateStoreError,
        rejected.stateStoreError,
        hung.stateStoreError,
      ]).size
    ).toBe(3);
  });

  test("exposes only the intern's own state to the page, never the request", async () => {
    const status = await readInternStatus({
      ctx: contextWithStore(() => Promise.resolve(undefined)),
      uptimeSeconds: 1,
    });

    expect(Object.keys(status).sort()).toEqual([
      "featureId",
      "health",
      "stateStore",
      "stateStoreError",
      "stateStoreFault",
      "uptimeSeconds",
    ]);
  });
});

describe("dashboardLogLine", () => {
  test("logs a healthy read at info, naming every field it carries", async () => {
    const line = dashboardLogLine(
      await readInternStatus({
        ctx: contextWithStore(() => Promise.resolve(undefined)),
        uptimeSeconds: 3,
      })
    );

    expect(line.level).toBe("info");
    expect(Object.keys(line.fields).sort()).toEqual([
      "feature_id",
      "health",
      "state_store",
      "uptime_seconds",
    ]);
    expect(line.fields.health).toBe("ok");
    expect(line.fields.state_store).toBe("state");
    expect(line.fields.uptime_seconds).toBe(3);
  });

  test("logs a degraded read at error so a monitor can see it", async () => {
    const line = dashboardLogLine(
      await readInternStatus({
        ctx: { featureId: "dashboard", stores: undefined },
        uptimeSeconds: 3,
      })
    );

    expect(line.level).toBe("error");
    expect(Object.keys(line.fields).sort()).toEqual([
      "feature_id",
      "health",
      "state_store_error",
      "state_store_fault",
      "uptime_seconds",
    ]);
    expect(line.fields.state_store_fault).toBe("did_not_open");
    expect(line.fields.state_store_error).toBe(
      "the intern's state store did not open"
    );
  });

  test("groups the three state-store faults under three distinct values", async () => {
    const [notOpen, rejected, hung] = await Promise.all([
      readInternStatus({
        ctx: { featureId: "dashboard", stores: undefined },
        uptimeSeconds: 0,
      }),
      readInternStatus({
        ctx: contextWithStore(() => Promise.reject(new Error("locked"))),
        uptimeSeconds: 0,
      }),
      readInternStatus({
        ctx: contextWithStore(() => new Promise<string | undefined>(() => {})),
        probeTimeoutMs: 10,
        uptimeSeconds: 0,
      }),
    ]);

    expect([
      dashboardLogLine(notOpen).fields.state_store_fault,
      dashboardLogLine(rejected).fields.state_store_fault,
      dashboardLogLine(hung).fields.state_store_fault,
    ]).toEqual(["did_not_open", "read_failed", "probe_timeout"]);
    expect(
      new Set([notOpen, rejected, hung].map((s) => dashboardLogLine(s).level))
    ).toEqual(new Set(["error"]));
  });
});

describe("statusHttpCode", () => {
  test("serves a degraded intern as 503 so an uptime check sees it", () => {
    expect(statusHttpCode("ok")).toBe(200);
    expect(statusHttpCode("degraded")).toBe(503);
  });
});
