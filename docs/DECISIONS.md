# FamilyCradle implementation decisions

These decisions resolve ambiguities found during the Phase 1 BRD review. The BRD remains the source of product requirements.

| Topic                    | Decision                                                                                                                                                                                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Multi-child log IDs      | The client-supplied UUIDv7 is the base ID and identifies the first child entry. Sibling entries use deterministic UUIDv5 IDs derived from the base ID and child ID. This is an explicit exception to the UUIDv7 convention, required for offline idempotency. |
| Optional vaccines        | Persist a `follow_optional` flag on each child-vaccine row, defaulting to false. Optional endemic vaccines count as late only after a parent opts in.                                                                                                         |
| Vaccine status           | `given_date` is authoritative for `done`; `status_override` is only `skipped`. Marking done clears `skipped`, and marking skipped clears `given_date`.                                                                                                        |
| Audit retention          | Active-family audit rows are retained for up to one year. Family deletion purges its audit rows with the rest of the family data after the seven-day restore window.                                                                                          |
| Offline timer timestamps | Offline timer timestamps must be no more than 24 hours old and must also meet the normal future-time and child-DOB bounds. Invalid timestamps are rejected with `VALIDATION_ERROR`.                                                                           |

## Deferred before deletion flows ship

- Account deletion must preserve the required "Mantan anggota / Former member" attribution without retaining unnecessary personal data. Decide the exact anonymized representation before implementing account deletion in Phase 1.6.
- Medical and reference seed values marked `[VERIFY]` must be checked by a qualified reviewer before public launch; this document does not validate those values.
