# Changes

## 1.0.0

First release.

- Reads a file of GS1 EPCIS 2.0 events in JSON or JSON-LD (an EPCISDocument with its events in `epcisBody.eventList`,
  an EPCISQueryDocument, or a JSON list of events) before the events are written to a shared supply chain ledger, and
  lists with its line every data mistake the checks know, as an input to a review: not a certification of conformance
  to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really
  happened. It reads the file, contacts no ledger, node or API, fetches nothing, writes nothing to a ledger, opens no
  link, runs nothing, needs no key, follows no symbolic link and reads no clock.
- Reads the document with its type, schema version and creation time; and for each event its type, eventTime,
  recordTime, eventTimeZoneOffset, eventID and error declaration, its action, its EPCs, parent, children, inputs and
  outputs, its quantities with their class and unit, its readPoint and bizLocation, its business transactions, sources
  and destinations, its bizStep, disposition and persistent disposition. A key with a colon is an extension of JSON-LD
  and is left alone.
- Every time is read from its characters into the nanosecond it names, with its own zone and a calendar worked out by
  hand; the tool never reads the clock, and the one moment it is given is the one of `--now`.
- The strict JSON reader of the sibling tools, kept unchanged, with no dependency and no recursion, with the line and
  column of every value, a key written twice as a finding, and limits of size, nesting, values and string length; the
  bounded reading of a file and the decimal reader of the sibling tools. Quantities are read from the characters of the
  file with BigInt, never through a floating point number.
- A search for keys and seeds in the file before anything else is read, kept unchanged from the sibling tools: each one
  found is an error whose value is left out of every check and never shown. A value of 64 hex digits under
  `hexBinaryValue` is read as sensor data and never shown.
- Thirty-two checks in three levels, each documented or a best practice of the tool and saying which: an event type
  EPCIS does not have, per EPCIS and its JSON schema (`event-type-unknown`); no eventTime, per EPCIS
  (`event-time-missing`); a time with no zone or of a day that does not exist, per EPCIS (`event-time-invalid`); no
  eventTimeZoneOffset, per the JSON schema (`timezone-offset-missing`), or one of the wrong form, per EPCIS
  (`timezone-offset-invalid`); no action, per the JSON schema (`action-missing`), an action other than ADD, OBSERVE and
  DELETE, per EPCIS (`action-invalid`), or an action on a TransformationEvent, per EPCIS and the JSON schema
  (`transformation-with-action`); an event that names no object, no child, no parent of an ADD or DELETE or no business
  transaction, per EPCIS (`what-missing`); a TransformationEvent with no inputs or outputs, per EPCIS
  (`transformation-inputs-outputs-empty`); a quantity that is not positive, a count that is not whole or a unit of the
  wrong form, per EPCIS (`quantity-invalid`); no readPoint or bizLocation (`where-missing`); no bizStep, per the CBV
  (`why-missing`); a bizStep (`biz-step-unknown`) or a disposition (`disposition-unknown`) outside the CBV, per the CBV;
  an eventID written twice, per EPCIS (`event-id-duplicate`), or not at all, as a note (`event-id-missing`); a recordTime
  before its eventTime or events of an EPC out of order (`event-out-of-order`); an event later than `--now`
  (`future-event`); an EPC seen after its delete, decommissioning or destroying, per EPCIS and the CBV
  (`object-after-delete`); an EPC shipped from a place it never reached (`shipped-before-received`); a child in two
  parents (`aggregation-child-in-two-parents`); an EPC URI whose digits do not add up, per the Tag Data Standard
  (`epc-uri-malformed`); a GTIN, SSCC or GLN of a GS1 Digital Link URI with a wrong check digit, per the GS1 General
  Specifications (`gtin-check-digit-invalid`, `sscc-check-digit-invalid`, `gln-check-digit-invalid`); and six checks
  about the file (`file-unreadable`, `field-missing`, `field-unknown`, `field-invalid`, `field-duplicate`,
  `secret-in-file`).
- A table of the event types with the actions of each, in every format but SARIF.
- Reports as text, markdown, JSON and SARIF 2.1.0; every finding has its id, severity, message, file, line, column and
  subject; `--min-severity`, `--fail-on`, `--now`, `--explain` with the points of the standards behind each finding, and
  `--list-checks`. Exit code `0` when no finding is at or above the fail-on level, `1` when one is, `2` for a usage or
  input error, with no result.
- Plain text copies of the parts of the public standards the documented checks rest on, under research/sources, with a
  note on each: the EPCIS standard, its JSON schema, the CBV, the Tag Data Standard and the GS1 General Specifications.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate
  of the repository.
