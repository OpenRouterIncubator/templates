import type { ApiRouteContext } from "ori";

export type InternHealth = "ok" | "degraded";

export interface InternStatus {
  readonly featureId: string;
  readonly health: InternHealth;
  readonly stateStore: string | undefined;
  readonly stateStoreError: string | undefined;
  readonly uptimeSeconds: number;
}

export type StatusContext = Pick<ApiRouteContext, "featureId" | "stores">;

const STATE_PROBE_TIMEOUT_MS = 5000;

const STATE_PROBE_KEY = "ori:dashboard:probe";

const STORE_DID_NOT_OPEN = "the intern's state store did not open";

type StateStoreProbe = { answered: true } | { answered: false; error: string };

type SettleProbe = (probe: StateStoreProbe) => void;

const readIntoProbe = async (
  read: () => Promise<unknown>,
  settle: SettleProbe,
): Promise<void> => {
  try {
    await read();
    settle({ answered: true });
  } catch (error) {
    settle({ answered: false, error: String(error) });
  }
};

// Settles on the first of an answer, a rejection or the timeout. A store that
// never settles would otherwise hang the route, and a page that hangs reads as
// a network fault rather than as a sick intern.
const probeStateStore = (
  read: () => Promise<unknown>,
  timeoutMs: number,
): Promise<StateStoreProbe> =>
  new Promise<StateStoreProbe>((resolve) => {
    const pending: {
      settled: boolean;
      timer: ReturnType<typeof setTimeout> | undefined;
    } = { settled: false, timer: undefined };

    const settle: SettleProbe = (probe) => {
      if (pending.settled) {
        return;
      }
      pending.settled = true;
      clearTimeout(pending.timer);
      resolve(probe);
    };

    pending.timer = setTimeout(() => {
      settle({
        answered: false,
        error: `the intern's state store did not answer within ${timeoutMs}ms`,
      });
    }, timeoutMs);

    void readIntoProbe(read, settle);
  });

export const readInternStatus = async (input: {
  ctx: StatusContext;
  probeTimeoutMs?: number;
  uptimeSeconds: number;
}): Promise<InternStatus> => {
  const stores = input.ctx.stores;
  if (stores === undefined) {
    return {
      featureId: input.ctx.featureId,
      health: "degraded",
      stateStore: undefined,
      stateStoreError: STORE_DID_NOT_OPEN,
      uptimeSeconds: input.uptimeSeconds,
    };
  }

  const probe = await probeStateStore(
    () => stores.state.get(STATE_PROBE_KEY),
    input.probeTimeoutMs ?? STATE_PROBE_TIMEOUT_MS,
  );

  return {
    featureId: input.ctx.featureId,
    health: probe.answered ? "ok" : "degraded",
    stateStore: stores.state.name,
    stateStoreError: probe.answered ? undefined : probe.error,
    uptimeSeconds: input.uptimeSeconds,
  };
};

export const internStatusLogFields = (
  status: InternStatus,
): Readonly<Record<string, string | number>> => ({
  feature_id: status.featureId,
  health: status.health,
  uptime_seconds: status.uptimeSeconds,
  ...(status.stateStore === undefined ? {} : { state_store: status.stateStore }),
  ...(status.stateStoreError === undefined
    ? {}
    : { state_store_error: status.stateStoreError }),
});

const HTTP_CODE: Record<InternHealth, number> = {
  degraded: 503,
  ok: 200,
};

export const statusHttpCode = (health: InternHealth): number =>
  HTTP_CODE[health];
