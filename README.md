# epcis-event-check

EPCIS event check. Give it a file of GS1 EPCIS 2.0 events in JSON or JSON-LD, before the events are written to a
shared supply chain ledger: an EPCISDocument with its events in `epcisBody.eventList`, an EPCISQueryDocument, or a JSON
list of events. It reads the type, the times and the time zone offset of each event, its action, what it names (EPCs,
quantities of a class, a parent and its children, inputs and outputs, business transactions), where it took place
(readPoint, bizLocation, sources and destinations) and why (bizStep, disposition), and lists the data mistakes a
traceability engineer would catch before the events reach the ledger: an event type EPCIS does not have, an eventTime
or a time zone offset that is missing or malformed, an action that is missing, written wrong or put on a
TransformationEvent, an event that names no object, no parent or no business transaction, a TransformationEvent with
no inputs or outputs, a quantity that is not positive or a count with no unit, no readPoint or bizLocation, no
bizStep, a bizStep or disposition that is not in the CBV, an eventID written twice or not at all, events out of order
or later than the moment of `--now`, an EPC seen after it was deleted, shipped from a place it never reached or put in
two parents at once, an EPC URI whose digits do not add up, and a GTIN, SSCC or GLN whose check digit is wrong. Every
finding has its id, level, message and line, and the run exits with a code a pipeline can act on.

**It is an input to a review of EPCIS events before they are written to a shared supply chain ledger: not a
certification of conformance to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events
describe what really happened.** It reads one file only: it contacts no ledger, node or API, fetches nothing, writes
nothing to a ledger, runs nothing, needs no key and reads no clock, so it does not know whether a company prefix was
ever issued, whether the objects are where the events say, or what the rest of the history of an object holds; the
checks are a heuristic. A clean run means only that none of the problems of its checks were found in the file, and
the team still has to decide what its events mean and who may write them.

An event written to a shared ledger stays there, and every partner of the chain reads it. The EPCIS standard says what
an event holds and that eventTime, the action and the objects an event names are not optional; its JSON schema lists
the fields each event type may hold; the Core Business Vocabulary (CBV) lists the business steps and dispositions; the
Tag Data Standard says how many digits an EPC URI holds; and the GS1 General Specifications give the check digit of a
GTIN, an SSCC and a GLN. Everything else a careful team checks on a batch of events comes from practice rather than from
a standard: that every event can be placed, that a ledger can tell an event sent twice from two events, that times come
in order and not from the future, and that an object is not seen after it was destroyed, shipped from where it never
was or packed into two pallets at once. A time zone left off a time or a GTIN with one digit wrong is easy to miss in a
capture application and costly once the event is on a ledger no one can edit. This tool reads the events on every
change and points at the line.

- **One check per problem.** Thirty-two checks, each with what it looks at, what it cannot see, the public standards it
  rests on and what to change. Twenty are documented, by the EPCIS standard, its JSON schema, the CBV, the Tag Data
  Standard or the GS1 General Specifications; the others are best practices of this tool or problems with the file
  itself, and each message says which.
- **The file's own times.** Every time is read from its characters into the nanosecond it names, with its own time
  zone, never through the clock or the locale of the machine. The one moment the tool is given is the one of `--now`;
  without it, `future-event` does not run and the report says so.
- **Never a secret.** The tool needs no private key, no seed and no API key. A key named for a private key or a seed,
  and a value shaped like a mnemonic, an extended private key, a private key in hex or a key in WIF, is an error, and
  the value is never shown in any report.
- **Identifiers as written.** An EPC URI is read for its digits and a GS1 Digital Link URI for its check digit, and the
  same object written in both forms is followed as one across events.
- **A strict reader of its own.** The JSON reader keeps the line and column of every value, so a finding points at the
  event and the field; a key written twice stops the reader instead of letting two readers see two values. What the
  file does not say is listed as a finding, never taken for a value that is fine. A key with a colon is an extension of
  JSON-LD and is left alone.
- Reports as text, markdown, JSON and SARIF, with an exit code for a pipeline: `0` no finding at or above the
  `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 145
pass 143
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a
symbolic link or a device (a link to an event file, and `/dev/null` named as a file); they are guarded with
`process.platform`, run on Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs the same tests
with coverage; their time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/epcis-event-check.git
cd epcis-event-check
node bin/epcis-event-check.js examples/bad/events.json --now 2101-03-10T12:00:00Z
```

Or without a clone, in your own project:

```
npx --yes github:INNERLUXES/epcis-event-check events.json --now 2101-03-10T12:00:00Z
```

Give `--now` the moment the file is checked, such as the time your pipeline starts, written with its time zone.

`examples/` holds two made-up EPCISDocuments. Every identifier in them uses the GS1 Company Prefix 9521234, which starts
with 952, the GS1 Prefix that the GS1 General Specifications keep for demonstrations and examples, and every time is in
the made-up year 2101, so no time in the repository reads as a day something happened. The bad file, in
`examples/bad`, holds a mistake of nearly every check: a seed phrase in the header; an EPC listed twice and a misspelt
bizLocation; an event of the type "Object"; an event with no eventTime and one with a time of no zone, an offset of
+14:30, the action "add" and the bizStep "Commissioning"; an AggregationEvent with no action and no offset; a child
packed into a second pallet; a TransformationEvent with an action, an input and no output, and a count of 2.5 with no
unit; a quantity written as text; two events with one eventID, one of them with an empty readPoint, no bizStep and a
deprecated disposition; an event with no eventID; an EPC seen an hour after its decommissioning, under a bizStep the
CBV does not have; a pallet received at one warehouse and shipped from another; a recordTime before its eventTime, an
SGTIN of 12 digits and a GTIN, an SSCC and a GLN with a wrong check digit; an event ten days after `--now` with no
place; and a TransactionEvent with no business transaction. Only `file-unreadable` does not fire on it, because the
file can be read; the tests cover it. The good file, in `examples/good`, passes at error, warning and info level: two
products commissioned, packed on a pallet, shipped, received and unpacked, one of them tied to a purchase order through
its GS1 Digital Link URI, a lot of 25.5 kg turned into twelve new products and a product installed at a place.

## Usage

```
epcis-event-check <events.json> [options]
```

```
--format <name>            text, markdown, json or sarif (default: text)
--json                     the same as --format json
--min-severity <level>     the lowest level of a finding that is shown: info, warning, error (default: info)
--fail-on <level>          the lowest level of a finding that fails the run: info, warning, error (default: error)
--now <time>               the moment to compare event times with, written YYYY-MM-DDThh:mm:ss with a time zone;
                           without it future-event does not run
--explain                  show the points of the standards behind each finding (text, markdown and JSON)
--list-checks              list the checks with their level and kind, and exit
--help                     show the usage
--version                  show the version
```

[docs/inputs.md](docs/inputs.md) lists every field the tool reads, with a short file. The path in the report is relative
to the folder you run the command in, with forward slashes on every system, followed by the line.

The report of the bad example starts with what was read, the findings in one line, and the checks with the number of
findings of each; then the findings, errors first, each with what to change:

```
epcis-event-check: examples/bad/events.json
file: examples/bad/events.json (JSON, 184 lines, 7,840 bytes)
document: EPCISDocument, schema version 2.0, created 2101-03-10T12:00:00.000Z
events: 17 (11 ObjectEvent, 3 AggregationEvent, 1 TransactionEvent, 1 TransformationEvent and 1 of another or no type)
identifiers: 10 EPCs, 1 class and 4 places
event times: from 2101-03-01T08:00:00.000+01:00 to 2101-03-20T08:00:00.000+01:00
now: 2101-03-10T12:00:00Z, from --now
findings: 32 (21 error, 10 warning, 1 info)

Checks (32)

  check                                level    kind           findings
  file-unreadable                      error    input          0
  field-missing                        error    input          1
  field-unknown                        warning  input          1
  field-invalid                        error    input          1
  field-duplicate                      error    input          1
  secret-in-file                       error    input          1
  event-type-unknown                   error    documented     1
  event-time-missing                   error    documented     1
  event-time-invalid                   error    documented     1
  timezone-offset-missing              error    documented     1
  timezone-offset-invalid              error    documented     1
  action-missing                       error    documented     1
  action-invalid                       error    documented     1
  transformation-with-action           error    documented     1
  what-missing                         error    documented     1
  transformation-inputs-outputs-empty  error    documented     1
  quantity-invalid                     error    documented     1
  where-missing                        warning  best practice  1
  why-missing                          warning  documented     1
  biz-step-unknown                     warning  documented     2
  disposition-unknown                  warning  documented     1
  event-id-duplicate                   error    documented     1
  event-id-missing                     info     best practice  1
  event-out-of-order                   warning  best practice  1
  future-event                         error    best practice  1
  object-after-delete                  warning  documented     1
  shipped-before-received              warning  best practice  1
  aggregation-child-in-two-parents     warning  best practice  1
  epc-uri-malformed                    error    documented     1
  gtin-check-digit-invalid             error    documented     1
  sscc-check-digit-invalid             error    documented     1
  gln-check-digit-invalid              error    documented     1
```

A finding names its check, its level, the line of the field and what to change. With `--explain` it also gives the
points of the standards behind it and, for a best practice check, the tool's own choice:

```
  ERROR    transformation-with-action           examples/bad/events.json:86
           Event 8 (TransformationEvent) has an action (ADD), but the fields EPCIS gives a TransformationEvent hold no action, and its JSON schema does not allow one.
           fix: Remove the action; a TransformationEvent says what was used and what was made through its inputs and outputs.
           basis: The table of fields EPCIS gives a TransformationEvent has no action, though the tables of the other four event types have one. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)
           basis: The JSON schema of a TransformationEvent lists the keys such an event may hold, and action is not among them. (EPCIS 2.0 JSON schema, repository gs1/EPCIS, https://github.com/gs1/EPCIS/tree/master/JSON-Schema)
```

After the findings comes the table of event types, with the actions of each:

```
Event types (5)

  type                 events  ADD  OBSERVE  DELETE  no action
  ObjectEvent          11      2    7        1       1
  AggregationEvent     3       2    0        0       1
  TransactionEvent     1       1    0        0       0
  TransformationEvent  1       1    0        0       0
  other                1       1    0        0       0
```

The end of the report holds the notes, if any, the notice and the result:

```
This report is an input to a review of EPCIS events before they are written to a shared supply chain ledger: not a certification of conformance to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really happened.

RESULT: FAIL - 21 findings at or above error (21 error, 10 warning, 1 info)
```

The good example passes:

```

  none

Event types (5)

  type                 events  ADD  OBSERVE  DELETE  no action
  ObjectEvent          3       1    2        0       0
  AggregationEvent     2       1    0        1       0
  TransactionEvent     1       1    0        0       0
  TransformationEvent  1       0    0        0       1
  AssociationEvent     1       1    0        0       0

This report is an input to a review of EPCIS events before they are written to a shared supply chain ledger: not a certification of conformance to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really happened.

RESULT: PASS - no finding at or above error
```

## How the file is read

1. The path is resolved against the folder you run the command in. A link, a folder, a device or a file over 16 MB is
   refused, and so is a file that is not UTF-8 (or UTF-16 with a byte order mark) or holds a null byte, with exit code
   `2` and no report.
2. The file is read as strict JSON, whatever its name. The reader keeps the line and column of every value and refuses
   a key written twice in one object.
3. Every key and value of the file is looked at for a private key or a seed. One that is found is an error at its line,
   and its value is left out of everything that follows and never shown.
4. The document and its events are read with their lines. A key the tool does not read in that place is a
   `field-unknown` finding, unless it holds a colon and names an extension; a missing field and a value of the wrong
   type are findings of their own, and that value is left out of the checks that need it.
5. Each event is checked on its own: its type, its times and offset, its action, what it names, its quantities, where
   and why, and its identifiers. Then the events are checked together, in the order of their eventTime: eventIDs,
   order, the moment of `--now`, deletes, shipping and aggregations.

[docs/method.md](docs/method.md) says what each check reads, and [docs/inputs.md](docs/inputs.md) lists the fields.

## What it checks

| Check | Level | Kind | What it reports |
| --- | --- | --- | --- |
| `event-type-unknown` | error | documented | an event type that is not one of the five of EPCIS 2.0 |
| `event-time-missing` | error | documented | an event with no eventTime |
| `event-time-invalid` | error | documented | an eventTime, recordTime or declarationTime with no zone or a day that does not exist |
| `timezone-offset-missing` | error | documented | an event with no eventTimeZoneOffset |
| `timezone-offset-invalid` | error | documented | an offset that is not +hh:mm from 00:00 to 14:00 |
| `action-missing` | error | documented | an ObjectEvent, AggregationEvent, TransactionEvent or AssociationEvent with no action |
| `action-invalid` | error | documented | an action that is not ADD, OBSERVE or DELETE |
| `transformation-with-action` | error | documented | a TransformationEvent with an action |
| `what-missing` | error | documented | no EPC or quantity, no child, no parent of an ADD or DELETE, or no business transaction |
| `transformation-inputs-outputs-empty` | error | documented | a TransformationEvent with no input or no output |
| `quantity-invalid` | error | documented | a quantity of 0 or less, a count that is not whole, a unit with no quantity or of the wrong form |
| `where-missing` | warning | best practice | an event with neither a readPoint nor a bizLocation |
| `why-missing` | warning | documented | an event with no bizStep |
| `biz-step-unknown` | warning | documented | a bizStep that is not in the CBV |
| `disposition-unknown` | warning | documented | a disposition that is not in the CBV or that the CBV deprecates |
| `event-id-duplicate` | error | documented | two events with one eventID, neither an error declaration |
| `event-id-missing` | info | best practice | an event with no eventID |
| `event-out-of-order` | warning | best practice | a recordTime before its eventTime, or an EPC whose events are listed out of time order |
| `future-event` | error | best practice | an eventTime or recordTime after the moment of `--now` |
| `object-after-delete` | warning | documented | an EPC in an event later than the DELETE, decommissioning or destroying that ended it |
| `shipped-before-received` | warning | best practice | an EPC shipped from a place it never reached, or received there only after |
| `aggregation-child-in-two-parents` | warning | best practice | a child put in a second parent while it is still in the first |
| `epc-uri-malformed` | error | documented | an SGTIN, SSCC, SGLN, LGTIN or pattern URI whose digits do not add up |
| `gtin-check-digit-invalid` | error | documented | a GTIN of a Digital Link URI with a wrong check digit |
| `sscc-check-digit-invalid` | error | documented | an SSCC of a Digital Link URI with a wrong check digit |
| `gln-check-digit-invalid` | error | documented | a GLN of a Digital Link URI with a wrong check digit |
| `secret-in-file` | error | input | a key or a seed; its value is never shown |
| `field-duplicate` | error | input | an EPC listed twice in one list |
| `field-invalid` | error | input | a value of the wrong type or form, such as an identifier that is not a URI |
| `field-unknown` | warning | input | a key the tool does not read there, often a misspelt one |
| `field-missing` | error | input | a field the file needs, such as the type of an event |
| `file-unreadable` | error | input | a file that is not strict JSON, or holds neither an object nor a list |

A documented check rests on the EPCIS standard, its JSON schema, the CBV, the Tag Data Standard or the GS1 General
Specifications. A best practice check is this tool's own choice, and its message says "a best practice of this tool,
not a rule in the standards it cites". `--list-checks` shows the kind of each check. Some of the choices are worth a
word:

- `event-time-missing` and `timezone-offset-missing` are errors: EPCIS calls eventTime mandatory, and the JSON schema
  lists eventTimeZoneOffset as required next to it. A time with no zone of its own is `event-time-invalid`, because
  EPCIS types it as a date and time with a zone; the offset field does not stand in for it.
- `transformation-with-action` is documented by the table of fields of a TransformationEvent in EPCIS, which has no
  action, and by its JSON schema, which does not allow one.
- `why-missing`, `biz-step-unknown` and `disposition-unknown` are warnings: the CBV says an event should carry a
  bizStep, and a value of another vocabulary written as a URI of its own is allowed and left alone.
- `object-after-delete` is a warning documented by EPCIS, which says that the EPCs of an ObjectEvent with action DELETE
  should not be seen again, and by the CBV on the business steps decommissioning and destroying.
- The check digit checks read only GS1 Digital Link URIs: an EPC URI such as `urn:epc:id:sgtin:` leaves the check digit
  out, as the Tag Data Standard says, so only its digits are counted.
- `future-event` is an error but runs only with `--now`, because the tool reads no clock. `event-id-missing` is a note.

## What is not checked

[docs/limits.md](docs/limits.md) lists what the tool cannot see. Among them: whether a company prefix was ever issued or
belongs to the company that wrote the event; the master data of a GTIN, a GLN or a lot; the sensor data, the instance
and lot master data and the certification of an event; the rest of the history of an object that the file does not
hold; whether a partner may write the event to the ledger; the XML form of EPCIS; identifiers of other GS1 keys than
GTIN, SSCC and GLN; and secrets in a shape the search does not know.

## Formats

`--format text` (the default) is for a terminal. `--format markdown` is a report for a job summary or a pull request,
with a table of findings and the table of event types. `--format json` writes every finding with its `id`,
`severity`, `message`, `file`, `line`, `column`, `subject` and `fix`, what the file holds, the table of event types, and
with `--explain` the points of the standards. `--format sarif` writes SARIF 2.1.0, with the checks as rules, the event
file as the artifact and a result for each finding with its line and column, for code scanning; the table of event
types has no place in it. The saved output of the examples is in [examples/output](examples/output).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | no finding at or above the `--fail-on` level (default `error`) |
| `1` | a finding at or above it |
| `2` | a usage error, such as an unknown option or a `--now` with no time zone, or an input error such as a path that does not exist, a link or a folder, or a file that is not text or is too large; there is no report |

Findings below `--min-severity` are not shown, and still count for the result.

## Limits

The tool reads the one file it is given; it contacts no ledger or node and connects to nothing. A run reports the
problems of docs/method.md that the file holds. [docs/limits.md](docs/limits.md) lists what it cannot see, with the size
limits: 16 MB for the file, 100,000 events, 10,000 items in each list of an event, JSON nested up to 1,000 deep and
quantities of up to 40 digits on each side of the point. [docs/threat-model.md](docs/threat-model.md) lists the risks
of reading events from a pull request, a partner or an upload and their controls, and
[docs/secure-defaults.md](docs/secure-defaults.md) the defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the file as JSON, looks for keys and seeds, reads the events, runs the checks and builds the report of the run |
| `src/files.js` | the bounded reading of a file by its byte order mark, with no link followed, kept from the sibling tools |
| `src/json.js` | the JSON reader of the sibling tools: lines and columns, keys written twice, limits, a stack of its own |
| `src/secrets.js` | the search for keys and seeds by the name of a key and the shape of a value, kept from the sibling tools |
| `src/decimal.js` | numbers read from their characters and worked out with BigInt, kept from the sibling tools |
| `src/fields.js` | reading text, objects and lists with their lines, and the keys of extensions |
| `src/events.js` | the document and the fields of each event type |
| `src/time.js` | times and offsets read from their characters into nanoseconds, with no clock |
| `src/gs1.js` | EPC URIs, GS1 Digital Link URIs, check digits and the business steps and dispositions of the CBV |
| `src/analyze.js` | the checks on each event and across events |
| `src/rules.js` | the checks, their levels and kinds, and the result |
| `src/report.js`, `src/text.js`, `src/size.js` | the text, markdown, JSON and SARIF output, the cleaning of text from the input and number formats |
| `src/data.js` | the public standards and the points the checks rest on, in this project's own words |
| `research/sources/` | text copies of the parts of the standards the checks rest on, as they were read |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

The documented checks rest on five public standards of GS1, nothing else. Each was read before it was listed, a text
copy of the parts the checks rest on is kept in [research/sources](research/sources), and
[research/sources.md](research/sources.md) has a note on each, says what the standards do not say, and lists the lines
the copies leave out. [docs/rules-and-sources.md](docs/rules-and-sources.md) lists every check with the points of the
standards it rests on, what it cannot see and what to change. Where a check is a best practice and not a rule in the
standards, it says so. No page of a ledger product is saved, and no check rests on one.

- EPCIS Standard, Release 2.0: https://ref.gs1.org/standards/epcis/
- EPCIS 2.0 JSON schema, repository gs1/EPCIS: https://github.com/gs1/EPCIS/tree/master/JSON-Schema
- Core Business Vocabulary (CBV) Standard, Release 2.0: https://ref.gs1.org/standards/cbv/
- EPC Tag Data Standard (TDS): https://ref.gs1.org/standards/tds/
- GS1 General Specifications Standard: https://ref.gs1.org/standards/genspecs/

## Background

EPCIS events are written by the capture applications of many partners: the warehouse system of a manufacturer, the
handheld reader of a carrier, the receiving dock of a retailer. When the partners share one ledger, such as a
Hyperledger Fabric network or another blockchain, a mistake in one of them reaches everyone and stays. The events are
checked when a partner joins the network, when a capture application changes, when a new product line or a new kind of
event is added, or when engineers are brought in to build the ledger, its chaincode and the bridge that feeds it events.
How such work is staffed and carried out is described on the page
[Blockchain Supply Chain Solutions and Development](https://innerluxes.dev/blockchain/supply-chain).

## License

MIT
