# epcis-event-check: examples/good/events.json

- File: examples/good/events.json \(JSON, 111 lines, 5,263 bytes\)
- Document: EPCISDocument, schema version 2.0, created 2101-03-10T12:00:00.000Z
- Events: 8 \(3 ObjectEvent, 2 AggregationEvent, 1 TransactionEvent, 1 TransformationEvent and 1 AssociationEvent\)
- Identifiers: 5 EPCs, 2 classes and 2 places
- Event times: from 2101-03-01T08:00:00.000\+01:00 to 2101-03-04T11:00:00.000\+01:00
- Now: 2101-03-10T12:00:00Z, from --now
- Findings: 0
- Result: **PASS - no finding at or above error**

## Findings

None.

## Event types (5)

| Type | Events | ADD | OBSERVE | DELETE | No action |
| --- | --- | --- | --- | --- | --- |
| ObjectEvent | 3 | 1 | 2 | 0 | 0 |
| AggregationEvent | 2 | 1 | 0 | 1 | 0 |
| TransactionEvent | 1 | 1 | 0 | 0 | 0 |
| TransformationEvent | 1 | 0 | 0 | 0 | 1 |
| AssociationEvent | 1 | 1 | 0 | 0 | 0 |

This report is an input to a review of EPCIS events before they are written to a shared supply chain ledger: not a certification of conformance to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really happened.
