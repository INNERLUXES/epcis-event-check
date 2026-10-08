# Method

This document says how the tool reads a file of EPCIS events and what each check looks at. The tool is an input to a
review of EPCIS events before they are written to a shared supply chain ledger: not a certification of conformance to
EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really happened.
A clean run means only that none of the problems below were found in the file.

## Why the events

A supply chain that shares a ledger, such as a Hyperledger Fabric network or another blockchain, shares the events its
partners write to it. Each event says what was seen (the objects), when (the time and its zone), where (the read point
and the business location) and why (the business step and the disposition), in the form GS1 sets in the EPCIS standard
and the Core Business Vocabulary. Once an event is on a ledger no one can edit, a mistake in it reaches every partner
and stays: a time with no zone that every reader turns into another moment, a GTIN with one digit wrong that names no
product, an action written in small letters that one reader takes and the next refuses, a pallet shipped from a place
it never reached.

Most of these mistakes can be seen in the file, before the events are written. The tool reads the file as it is, so the
same check runs on every batch, in a pipeline or by hand, and every finding points at a line.

## Reading the file

1. The path is resolved against the folder the command runs in. A link, a folder, a device or a pipe is refused; a file
   over 16 MB is refused before it is read; a file with a null byte, or bytes that are not UTF-8 (or UTF-16 with a byte
   order mark), is refused with exit code `2` and no report.
2. The file goes to the JSON reader of the sibling tools (`src/json.js`, kept unchanged), which keeps the line and column
   of every value and the characters every number was written with: a comment, a trailing comma, a key written twice in
   one object or text after the value is `file-unreadable`, and so is a top level that is neither an object nor a list.
3. Every key and value of the file is looked at for a key or a seed (`src/secrets.js`, kept unchanged from the sibling
   tools). A key named for a private key, a seed or a mnemonic, and a value shaped like a mnemonic, an extended private
   key, a private key in hex or a key in WIF, is `secret-in-file`. The value is marked and left out of everything that
   follows, and no report shows it. A value of 64 hex digits under `hexBinaryValue`, the hex data of a sensor report, is
   the data it is meant to be and not a key (decision 2).
4. The document and its events are read (`src/events.js`) as [inputs.md](inputs.md) lists them. A missing field is
   `field-missing`, a key the tool does not read in its place is `field-unknown` (a key with a colon is an extension and
   is left alone), and a value of the wrong type or form is `field-invalid`. The value is then left out of every check
   that needs it.
5. Each event is checked on its own, then the events are checked together, in the order of their eventTime, with error
   declarations and events whose eventTime could not be read left out.

## The checks of the file

- A file that is not strict JSON, or holds neither an object nor a list (`file-unreadable`).
- A field the file needs that is not there (`field-missing`): the `@context`, `type`, `schemaVersion`, `creationDate`
  and `epcisBody` of a document and its `eventList` (or the `queryResults` and `resultsBody` of a query document); the
  `type` of an event; the `id` of a `readPoint` or a `bizLocation`; the `epcClass` of a quantity; the `bizTransaction`
  of a business transaction; the `type` and value of a source or destination; the `declarationTime` of an
  `errorDeclaration`.
- A key the tool does not read in its place (`field-unknown`), with the known key it is probably meant to be, or the
  event types it belongs to.
- A value of the wrong type or form (`field-invalid`): text where a list or an object belongs, a list where text
  belongs, a quantity written as text, an identifier that is not a URI, a document type other than EPCISDocument and
  EPCISQueryDocument, a schema version that is not a version, and a `creationDate` that is not a time of EPCIS.
- One EPC listed twice in the same list of one event (`field-duplicate`).
- A private key, a seed or a mnemonic (`secret-in-file`).

## The checks of each event

### Type and time

- `event-type-unknown`: the type is a word that is not ObjectEvent, AggregationEvent, TransactionEvent,
  TransformationEvent or AssociationEvent. A near miss such as `Object` is named. A type written as a URI is an
  extension and only noted.
- `event-time-missing`: the event has no eventTime, or an empty one.
- `event-time-invalid`: an eventTime, recordTime or declarationTime that is not `YYYY-MM-DDThh:mm:ss` with an optional
  fraction and a zone, that has no zone, or that names a month, a day, an hour, a minute, a second or a zone that does
  not exist (a 30th of February, an hour 24, a leap second, an offset of +15:00). The calendar is worked out by hand,
  so no clock or locale of the machine is read.
- `timezone-offset-missing`: the event has no eventTimeZoneOffset, or an empty one.
- `timezone-offset-invalid`: the offset is not a sign, two digits of hours from 00 to 14, a colon and two digits of
  minutes from 00 to 59, or has minutes with 14 hours.

### Action

- `action-missing`: an ObjectEvent, AggregationEvent, TransactionEvent or AssociationEvent has no action, or an empty
  one.
- `action-invalid`: the action is not `ADD`, `OBSERVE` or `DELETE`. A value in small letters names the value in
  capitals.
- `transformation-with-action`: a TransformationEvent has an action.

### What

- `what-missing`: an ObjectEvent names no object in `epcList` or `quantityList`, unless it has a `sensorElementList` and
  a `readPoint`; an AggregationEvent or AssociationEvent names no child in `childEPCs` or `childQuantityList`, unless
  its action is DELETE; an AggregationEvent or AssociationEvent with action ADD or DELETE has no `parentID`; a
  TransactionEvent has no `bizTransactionList`, or names no object unless its action is DELETE. A list that could not
  be read is `field-invalid` and not this check.
- `transformation-inputs-outputs-empty`: a TransformationEvent with no `transformationID` lacks an input or an output,
  or one with a `transformationID` has neither.
- `quantity-invalid`: a quantity of 0 or below; a quantity that is not a whole number and has no `uom`, since EPCIS
  reads a quantity with no unit as a count; a `uom` with no quantity; a `uom` that is not two or three capitals and
  digits; or a quantity that cannot be read exactly in 40 digits on each side of the point.

### Where and why

- `where-missing`: the event has neither a `readPoint` nor a `bizLocation`.
- `why-missing`: the event has no `bizStep`.
- `biz-step-unknown`: the `bizStep` is not a word of the table of business steps of the CBV, alone or after
  `urn:epcglobal:cbv:bizstep:` or `https://ref.gs1.org/cbv/BizStep-`. A word in capitals names the word in lower case.
  A URI of another vocabulary is left alone.
- `disposition-unknown`: the `disposition`, or a value of the `set` or `unset` lists of `persistentDisposition`, is not
  a word of the table of dispositions of the CBV, or is one the CBV deprecates; the message names the value that replaces
  it.

### Identifiers

Every identifier of an event is read (`src/gs1.js`): the EPCs of its lists, its parent, the classes of its quantities,
its places and its sources and destinations. A value that is not a URI is `field-invalid`.

- `epc-uri-malformed`: an SGTIN or LGTIN whose company prefix and indicator with item reference are not 13 digits in
  all, an SSCC that is not 17, an SGLN that is not 12, a company prefix outside 6 to 12 digits, a serial number, lot or
  extension that is empty, longer than 20 characters or holds a character an EPC URI does not allow, an SGTIN pattern
  that does not end with `.*`, the wrong number of parts, or a GS1 Digital Link URI whose GTIN is not 8, 12, 13 or 14
  digits, whose SSCC is not 18 or whose GLN is not 13. On a host other than `id.gs1.org`, a path is read as a Digital
  Link only when the key has one of those lengths.
- `gtin-check-digit-invalid`, `sscc-check-digit-invalid`, `gln-check-digit-invalid`: the last digit of the GTIN, SSCC or
  GLN of a Digital Link URI is not the check digit of the other digits: weighted 3 and 1 from the right, added up, and
  what is missing to the next multiple of ten. An EPC URI holds no check digit, so these checks do not read it.

### The eventID

- `event-id-missing`: an event other than an error declaration has no eventID. A note.

## The checks across events

An EPC is followed across events by a key that is the same for its EPC URI and its GS1 Digital Link URI: the GTIN with
its serial, the SSCC, or the GLN with its extension. The events are taken in the order of their eventTime, and in the
order of the file when two have the same time.

- `event-id-duplicate`: an eventID that an earlier event of the file already has, neither event being an error
  declaration.
- `event-out-of-order`: a recordTime earlier than the eventTime of its event; or an event listed after another event of
  the same EPC whose eventTime is later. One finding for each event.
- `future-event`: with `--now`, an eventTime or recordTime later than that moment. Without `--now` the check does not
  run, the report says so, and a note says so too.
- `object-after-delete`: an EPC named by an event later than an ObjectEvent with action DELETE, or an event of the
  business step `decommissioning` or `destroying`, that named it in its `epcList`. One finding for each event, at the
  first such EPC, with the number of others.
- `shipped-before-received`: an EPC of an event of the business step `shipping` that ships from a site where no earlier
  event of the EPC took place, while earlier events place it elsewhere; or, when there is no earlier place, that an
  event of the business step `receiving` or `arriving` receives at that site after the shipping. The site an event took
  place at is the GLN of its `bizLocation`, or else of its `readPoint`, without the extension of an SGLN; a shipping
  event ships from its source of the type location, or else from its `readPoint` or `bizLocation`.
- `aggregation-child-in-two-parents`: an AggregationEvent with action ADD or OBSERVE names a child that an earlier
  AggregationEvent put in another parent, with no AggregationEvent with action DELETE between them that took it out.

## Levels

The level of each check is in [rules-and-sources.md](rules-and-sources.md) and in `--list-checks`. A problem with the file
itself never gets lower. A rule of a standard that says SHALL or calls a field mandatory is an error; one that says
SHOULD, or a vocabulary value that a URI of another vocabulary could stand in for, is a warning; a check that is this
tool's own choice is a warning or a note, except `future-event`, which is an error because an event cannot take place
after the moment it is checked.

## The result

The run fails when a finding is at or above `--fail-on` (`error` by default), with exit code `1`. `--min-severity` hides
findings below a level; hidden findings still count for the result, and the report says how many were hidden.
