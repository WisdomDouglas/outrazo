// User-moderation helper tests: suspension transition rules and the ban
// constants used by the admin server functions. Pure logic, no database.
//
// The final test reads the server source to prove the suspend/restore path
// performs no deletions: bans are Auth-level flags, and associated events,
// RSVPs, organizers, and history are never touched. It guards the source
// text against future edits, not live behavior.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  checkSuspensionTransition,
  CLEAR_BAN_DURATION,
  INDEFINITE_BAN_DURATION,
} from "@/showcase/admin/user-moderation";

describe("ban constants", () => {
  it("uses an effectively indefinite ban and a clear-to-restore value", () => {
    assert.equal(INDEFINITE_BAN_DURATION, "876000h");
    assert.equal(CLEAR_BAN_DURATION, "none");
  });
});

describe("checkSuspensionTransition", () => {
  it("blocks suspending an already-suspended account", () => {
    assert.match(checkSuspensionTransition(true, true) ?? "", /already suspended/);
  });

  it("blocks restoring an account that is not suspended", () => {
    assert.match(checkSuspensionTransition(false, false) ?? "", /not suspended/);
  });

  it("allows suspending an active account and restoring a banned one", () => {
    assert.equal(checkSuspensionTransition(true, false), null);
    assert.equal(checkSuspensionTransition(false, true), null);
  });
});

describe("moderation never deletes", () => {
  it("performs no deletions in the suspend/restore path", () => {
    const source = readFileSync(
      new URL("../src/showcase/admin/admin-functions.ts", import.meta.url),
      "utf8",
    );
    const start = source.indexOf("export const setAdminUserSuspended");
    assert.notEqual(start, -1, "expected setAdminUserSuspended in admin-functions.ts");
    const end = source.indexOf("export const ", start + 1);
    const body = end === -1 ? source.slice(start) : source.slice(start, end);
    assert.ok(body.includes("ban_duration"), "expected the ban write in the suspend path");
    assert.ok(!body.includes(".delete("), "suspend path must not delete rows");
    assert.ok(!body.includes("deleteUser"), "suspend path must not delete auth users");
  });
});
