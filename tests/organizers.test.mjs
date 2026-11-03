// Official-organizer rule tests. The verification check renders only for
// the exact platform name; any rename drops it automatically at render
// time. No network, no database.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { isOfficialOrganizerName, organizerSlug, OUTRAZO_OFFICIAL_NAME } from "@/showcase/organizers";

describe("isOfficialOrganizerName", () => {
  it("badges exactly the platform name", () => {
    assert.equal(OUTRAZO_OFFICIAL_NAME, "Outrazo");
    assert.equal(isOfficialOrganizerName("Outrazo"), true);
  });

  it("tolerates surrounding whitespace", () => {
    assert.equal(isOfficialOrganizerName("  Outrazo  "), true);
  });

  it("drops the badge for any other name", () => {
    assert.equal(isOfficialOrganizerName("outrazo"), false);
    assert.equal(isOfficialOrganizerName("OUTRAZO"), false);
    assert.equal(isOfficialOrganizerName("Outrazo Events"), false);
    assert.equal(isOfficialOrganizerName("My Outrazo"), false);
    assert.equal(isOfficialOrganizerName(""), false);
    assert.equal(isOfficialOrganizerName(null), false);
    assert.equal(isOfficialOrganizerName(undefined), false);
  });
});

describe("organizerSlug", () => {
  it("mirrors the create-event organizer slug convention", () => {
    assert.equal(organizerSlug("Outrazo", "1dae1997-b131-4b6d-97e8-6bff554b19fb"), "outrazo-1dae1997");
    assert.equal(organizerSlug("Wisdom Douglas!", "1dae1997-b131-4b6d-97e8-6bff554b19fb"), "wisdom-douglas-1dae1997");
    assert.equal(organizerSlug("!!!", "1dae1997-b131-4b6d-97e8-6bff554b19fb"), "organizer-1dae1997");
  });
});
