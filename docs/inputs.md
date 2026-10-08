# Inputs

The tool takes the path of a file of GS1 EPCIS 2.0 events in JSON or JSON-LD. There is no configuration file of the
tool itself, no environment variable and no standard input; the options are on the command line. The tool never asks
for a private key, a seed, an API key or the address of a node or a ledger, and needs none. Its result is an input to a
review of EPCIS events before they are written to a shared supply chain ledger: not a certification of conformance to
EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really happened.

```
epcis-event-check <events.json> [--format text|markdown|json|sarif] [--json] [--min-severity <level>]
                  [--fail-on <level>] [--now <time>] [--explain] [--list-checks]
```

| Option | Meaning |
| --- | --- |
| `--format <name>` | `text` (default), `markdown`, `json` or `sarif` |
| `--json` | the same as `--format json` |
| `--min-severity <level>` | the lowest level shown: `info` (default), `warning` or `error` |
| `--fail-on <level>` | the lowest level that fails the run: `info`, `warning` or `error` (default) |
| `--now <time>` | the moment event times are compared with, written as a time of EPCIS with its zone, such as `2101-03-10T12:00:00Z`; without it `future-event` does not run |
| `--explain` | add the points of the standards behind each finding to the text, markdown and JSON reports |
| `--list-checks` | list the checks with their level and kind, in text, markdown or JSON, and exit |
| `--help`, `--version` | the usage, the version |

Every option that takes a value takes it once. A value may not start with `--`. `-` (standard input) and an address such
as `https://...` are refused. A folder is refused: name the file. Two files are a usage error. A `--now` that is not a
date and time with a zone, or that names a day or an hour that does not exist, is a usage error with exit code `2`.

## The file

The file is always read as JSON, whatever its name. It is UTF-8, with or without a byte order mark, or UTF-16 with a
byte order mark, with LF, CRLF or CR line ends. It is strict JSON (RFC 8259): no comments, no trailing commas, no single
quotes, and no key written twice in one object. JSON-LD is read as JSON: the `@context` is accepted and not followed,
and a key that holds a colon, such as `example:temperature`, is an extension field that the tool leaves alone, as the
JSON schema of EPCIS allows. Every other key the tool does not read in its place is `field-unknown`.

The top level is one of three:

- **An EPCISDocument**: an object with `@context`, `type` (`EPCISDocument`), `schemaVersion` (such as `2.0`),
  `creationDate` (a time) and `epcisBody`, whose `eventList` holds the events. `id`, `instanceIdentifier`, `sender`,
  `receiver` and `epcisHeader` may be there; the master data of the header is not read. A missing `@context`, `type`,
  `schemaVersion`, `creationDate` or `epcisBody` is `field-missing`, as the JSON schema requires them.
- **An EPCISQueryDocument**: the same, with the events in `epcisBody.queryResults.resultsBody.eventList`.
- **A JSON list of events**, with no document around it.

### The fields of an event

Every event has a `type`, one of `ObjectEvent`, `AggregationEvent`, `TransactionEvent`, `TransformationEvent` and
`AssociationEvent`, and the common fields: `eventTime`, `eventTimeZoneOffset`, `recordTime`, `eventID`,
`errorDeclaration`, `certificationInfo` and `@context`. Each type adds its own fields, as the JSON schema of EPCIS 2.0
lists them:

| Type | Its own fields |
| --- | --- |
| ObjectEvent | `action`, `epcList`, `quantityList`, `bizStep`, `disposition`, `persistentDisposition`, `readPoint`, `bizLocation`, `bizTransactionList`, `sourceList`, `destinationList`, `sensorElementList`, `ilmd` |
| AggregationEvent | `parentID`, `childEPCs`, `childQuantityList`, `action`, `bizStep`, `disposition`, `readPoint`, `bizLocation`, `bizTransactionList`, `sourceList`, `destinationList`, `sensorElementList` |
| TransactionEvent | `bizTransactionList`, `parentID`, `epcList`, `quantityList`, `action`, `bizStep`, `disposition`, `readPoint`, `bizLocation`, `sourceList`, `destinationList`, `sensorElementList` |
| TransformationEvent | `inputEPCList`, `inputQuantityList`, `outputEPCList`, `outputQuantityList`, `transformationID`, `bizStep`, `disposition`, `persistentDisposition`, `readPoint`, `bizLocation`, `bizTransactionList`, `sourceList`, `destinationList`, `sensorElementList`, `ilmd` |
| AssociationEvent | `parentID`, `childEPCs`, `childQuantityList`, `action`, `bizStep`, `disposition`, `readPoint`, `bizLocation`, `bizTransactionList`, `sourceList`, `destinationList`, `sensorElementList` |

A field of another type is `field-unknown` with the types it belongs to, except an `action` on a TransformationEvent,
which is `transformation-with-action`. An event of a type written as a URI is an extension: only its common fields are
checked, and a note says so. An event of another type is `event-type-unknown`.

How each field is read:

- **Times** (`eventTime`, `recordTime`, the `declarationTime` of an `errorDeclaration`, `creationDate`) are text of the
  form `YYYY-MM-DDThh:mm:ss`, with an optional fraction of a second, and a zone, `Z` or `+hh:mm`, as EPCIS types them as
  `xsd:dateTimeStamp`. They are read to the nanosecond, with no clock and no locale, and shown as the file writes them.
- **The offset** (`eventTimeZoneOffset`) is `+hh:mm` or `-hh:mm`, with hours from 00 to 14 and minutes from 00 to 59,
  and 00 minutes with 14 hours.
- **The action** is `ADD`, `OBSERVE` or `DELETE`, in capitals.
- **Identifiers** (the items of `epcList`, `childEPCs`, `inputEPCList` and `outputEPCList`, `parentID`, the `epcClass`
  of a quantity, the `id` of `readPoint` and `bizLocation`, and the values of `sourceList` and `destinationList`) are
  URIs. EPC URIs of the forms `urn:epc:id:sgtin:`, `urn:epc:id:sscc:`, `urn:epc:id:sgln:`, `urn:epc:class:lgtin:` and
  `urn:epc:idpat:sgtin:` are read for their digits, and GS1 Digital Link URIs for a GTIN (`/01/`), an SSCC (`/00/`) or a
  GLN (`/414/`) are read for their check digit; any other URI is taken as it is.
- **Quantities** (the items of `quantityList`, `childQuantityList`, `inputQuantityList` and `outputQuantityList`) are
  objects with an `epcClass`, a `quantity` written as a JSON number, and a `uom` of two or three capitals and digits.
  A quantity is read exactly from its characters, never through a floating point number.
- **Places** (`readPoint`, `bizLocation`) are objects with an `id`.
- **Business transactions** (the items of `bizTransactionList`) are objects with a `bizTransaction` and an optional
  `type`; **sources and destinations** are objects with a `type` and a `source` or a `destination`.
- **Vocabularies** (`bizStep`, `disposition`, the `set` and `unset` lists of `persistentDisposition`) are a word of the
  CBV, alone as JSON writes them, or after a prefix of the CBV such as `urn:epcglobal:cbv:bizstep:`, or a URI of
  another vocabulary.
- **Not read**: `ilmd`, `sensorElementList`, `certificationInfo`, the `reason` and `correctiveEventIDs` of an
  `errorDeclaration` beyond their type, and the `epcisHeader`, apart from the search for secrets, which reads every
  value of the file.

An event with an `errorDeclaration` corrects an earlier event: it keeps the eventID of that event and is left out of the
checks across events.

### A short file

A JSON list of one event that passes every check, with made-up identifiers of the GS1 Prefix 952, which the GS1 General
Specifications keep for demonstrations and examples, in a made-up year:

```json
[
  {
    "type": "ObjectEvent",
    "eventID": "urn:uuid:00000000-0000-4000-8000-000000000001",
    "eventTime": "2101-03-01T08:00:00.000+01:00",
    "eventTimeZoneOffset": "+01:00",
    "epcList": ["urn:epc:id:sgtin:9521234.012345.1001"],
    "action": "ADD",
    "bizStep": "commissioning",
    "disposition": "active",
    "readPoint": { "id": "urn:epc:id:sgln:9521234.00001.0" }
  }
]
```

## The output

The report goes to standard output and errors go to standard error; nothing is written to disk. Every finding has its
check id, its level (`error`, `warning` or `info`), its message, the file and the line and column of the field, the
event it is about, and what to change. [method.md](method.md) says what each check looks at.
