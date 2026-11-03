// Event update-payload tests. Updates must never move an event between
// organizers (Scout drafts keep their chosen organizer) and edits must
// preserve the published state. No network, no database.
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildEventUpdateRow } from "@/showcase/event-update";

function savedRow() {
  return {
    organizer_id: "org-outrazo",
    created_by: "user-1",
    title: "DevFest",
    published: false,
  };
}

describe("buildEventUpdateRow", () => {
  it("always drops organizer_id so updates keep the original organizer", () => {
    assert.ok(!("organizer_id" in buildEventUpdateRow(savedRow(), true)));
    assert.ok(!("organizer_id" in buildEventUpdateRow(savedRow(), false)));
  });

  it("drops published only when editing", () => {
    assert.ok(!("published" in buildEventUpdateRow(savedRow(), true)));
    assert.equal(buildEventUpdateRow(savedRow(), false).published, false);
  });

  it("preserves every other field and never mutates the input", () => {
    const row = savedRow();
    const update = buildEventUpdateRow(row, true);
    assert.equal(update.title, "DevFest");
    assert.equal(update.created_by, "user-1");
    assert.equal(row.organizer_id, "org-outrazo");
    assert.equal(row.published, false);
  });
});
