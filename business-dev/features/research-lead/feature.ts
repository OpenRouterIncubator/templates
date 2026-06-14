// Feature module entry: the loader scans feature.ts for named exports and
// registers the `command` export (RFC 0002.1); the hooks live in cmd.ts.
import hooks from "./cmd.ts";

export const command = hooks;
