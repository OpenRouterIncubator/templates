import type { StatusContext } from "./status";

import { describe, expect, test } from "bun:test";

import {
  internStatusLogFields,
  readInternStatus,
  statusHttpCode,
} from "./status";

const stateStore = (
  get: (key: string) => Promise<string | undefined>,
): NonNullable<StatusContext["stores"]>["state"] => ({
  exec: () => Promise.resolve(),
  get,
  name: "state",
  query: () => Promise.resolve([]),
  set: () => Promise.resolve(),
});

const contextWithStore = (
  get: (key: string) => Promise<string | undefined>,
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
      "the intern's state store did not open",
    );
  });

  test("is degraded and carries the cause when the state store rejects", async () => {
    const status = await readInternStatus({
      ctx: contextWithStore(() => Promise.reject(new Error("database is locked"))),
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
      "the intern's state store did not answer within 10ms",
    );
  });

  test("tells the three state-store faults apart", async () => {
    const [notOpen, rejected, hung] = await Promise.all([
      readInternStatus({
        ctx: { featureId: "dashboard", stores: undefined },
        uptimeSeconds: 0,
      }),
      readInternStatus({
        ctx: contextWithStore(() => Promise.reject(new Error("database is locked"))),
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
      ]).size,
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
      "uptimeSeconds",
    ]);
  });
});

describe("internStatusLogFields", () => {
  test("names every field it logs and omits the ones with no value", async () => {
    const healthy = internStatusLogFields(
      await readInternStatus({
        ctx: contextWithStore(() => Promise.resolve(undefined)),
        uptimeSeconds: 3,
      }),
    );

    expect(Object.keys(healthy).sort()).toEqual([
      "feature_id",
      "health",
      "state_store",
      "uptime_seconds",
    ]);
    expect(healthy.health).toBe("ok");
    expect(healthy.state_store).toBe("state");
    expect(healthy.uptime_seconds).toBe(3);
  });

  test("carries the cause when the state store never opened", async () => {
    const fields = internStatusLogFields(
      await readInternStatus({
        ctx: { featureId: "dashboard", stores: undefined },
        uptimeSeconds: 3,
      }),
    );

    expect(Object.keys(fields).sort()).toEqual([
      "feature_id",
      "health",
      "state_store_error",
      "uptime_seconds",
    ]);
    expect(fields.health).toBe("degraded");
    expect(fields.state_store_error).toBe(
      "the intern's state store did not open",
    );
  });
});

describe("statusHttpCode", () => {
  test("serves a degraded intern as 503 so an uptime check sees it", () => {
    expect(statusHttpCode("ok")).toBe(200);
    expect(statusHttpCode("degraded")).toBe(503);
  });
});
