// Pure event-save payload rules (no secrets, no network, no database).
//
// Shared by manual event creation and Scout-driven drafts so updates can
// never silently move an event between organizers or flip its published
// state by accident.
export function buildEventUpdateRow(
  row: Record<string, unknown>,
  isEditing: boolean,
): Record<string, unknown> {
  const updateRow: Record<string, unknown> = { ...row };
  // Editing must preserve the event's published state; new rows start unpublished.
  if (isEditing) delete updateRow.published;
  // Updates never move events between organizers: a draft keeps the organizer
  // it was created under (Scout drafts stay under their chosen organizer).
  delete updateRow.organizer_id;
  return updateRow;
}
