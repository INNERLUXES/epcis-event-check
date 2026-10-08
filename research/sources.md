# Sources

The public standards the documented checks of this tool are based on, each with a short note in this project's own
words on what the standard says and which checks lean on it. Nothing here is a copy of a standard: read the standard
itself for its exact wording. A plain text copy of the parts of each standard the checks rest on, taken when it was
read, is kept in [research/sources](sources) so that a point can be checked against the standard it came from, and the
copies are the standards' own words, not this project's. src/data.js holds the standards and the points the reports
show, and test/data.test.js checks that every standard in src/data.js is listed here and has its copy, that no point
quotes its standard at length, and that the copies say what the documented checks rest on.

The tool reads a file of EPCIS events and runs nothing; its result is an input to a review of EPCIS events before they
are written to a shared supply chain ledger: not a certification of conformance to EPCIS or the CBV, not an audit of
the supply chain and not a guarantee that the events describe what really happened. These notes say what the standards
say so a reader can follow a finding back to its source. The standards were chosen with web addresses that hold no
number that reads like a year. Four of them are PDF files that the address on ref.gs1.org returns; each was fetched
with curl and turned into text with pdftotext of poppler, run by a short script of this project's maintainers, and only
the parts the checks rest on were kept. The JSON schema was fetched with curl as the raw files of the repository
gs1/EPCIS. No browser was used.

## What the standards say, and what they do not

- The EPCIS standard, Release 2.0, defines the common EPCISEvent and its five subclasses, ObjectEvent,
  AggregationEvent, TransactionEvent, TransformationEvent and AssociationEvent. Its own first lines describe EPCIS as a
  standard that enables disparate applications to create and share visibility event data, both within and across
  enterprises. It types eventTime and recordTime as xsd:dateTimeStamp, and in its section on validation it calls
  eventTime a mandatory field of all EPCIS events, to be written exactly once. It gives the exact form of
  eventTimeZoneOffset (a sign, hours 00 to 14, a colon, minutes 00 to 59, and 00 minutes with 14 hours). It says that
  the Action type has exactly three values, ADD, OBSERVE and DELETE, and that it may not be extended. It says what each
  event type must name: an ObjectEvent a non-empty epcList or quantityList, except for sensor data of a place; an
  AggregationEvent or AssociationEvent a non-empty childEPCs or childQuantityList unless the action is DELETE, and a
  parentID when the action is ADD or DELETE; a TransactionEvent its business transactions, and a non-empty epcList or
  quantityList unless the action is DELETE; a TransformationEvent at least one input and one output without a
  transformationID, or at least one of them with one. It says a quantity with no unit is a positive whole number, a
  quantity with a unit is positive, and a unit goes with a quantity. It asks that an eventID be unique across all events
  but error declarations, and says that the EPCs of an ObjectEvent with action DELETE should not be seen again.
- So `event-type-unknown`, `event-time-missing`, `event-time-invalid`, `timezone-offset-invalid`, `action-invalid`,
  `what-missing`, `transformation-inputs-outputs-empty`, `quantity-invalid`, `event-id-duplicate` and
  `object-after-delete` are documented by it. The table of fields it gives a TransformationEvent has no action, which
  with the JSON schema documents `transformation-with-action`.
- What the EPCIS standard does not say matters as much. Its table of the common fields marks recordTime, eventID,
  errorDeclaration and certificationInfo as optional and does not mark eventTimeZoneOffset so, but it does not call the
  offset mandatory in plain words; the check that it is there, `timezone-offset-missing`, rests on the JSON schema,
  which lists it as required. Nor does the standard call the action required in plain words: `action-missing` rests on
  the JSON schema too. EPCIS makes readPoint, bizLocation, bizStep and eventID optional, sets no rule across events
  about where an object may be shipped from, which parent holds a child, in what order events come or how a time
  relates to the moment a file is checked. `where-missing`, `event-id-missing`, `event-out-of-order`, `future-event`,
  `shipped-before-received` and `aggregation-child-in-two-parents` are best practices of this tool, and each says so.
- The JSON schema of EPCIS 2.0, in the repository gs1/EPCIS of GS1, lists eventTime and eventTimeZoneOffset as the
  required fields of the common event; requires type and action for ObjectEvent, AggregationEvent and AssociationEvent
  and type, bizTransactionList and action for TransactionEvent; lists the keys each event type may hold, where a
  TransformationEvent has no action; lets the type of an event be one of the five names or a URI; lets any key that is a
  URI stand next to the fields of an event as an extension; and requires @context, type, schemaVersion, creationDate and
  epcisBody of an EPCISDocument. So `timezone-offset-missing`, `action-missing` and `transformation-with-action` lean on
  it, and so do the reading of extension keys and the `field-missing` findings of a document. The schema allows a bare
  bizStep or disposition only from the words of the CBV, so a schema validator would refuse a bare word the CBV does
  not have; the tool reports it as a warning, as the CBV does.
- The Core Business Vocabulary, Release 2.0, says that each event of a document that conforms to it should carry a
  bizStep, and that a bizStep or disposition of such a document is one of the words of its tables after the prefix
  urn:epcglobal:cbv:bizstep: or urn:epcglobal:cbv:disp:, or their web forms on ref.gs1.org, written exactly in lower
  case with underscores; a document that is only compatible with the CBV may use any other URI. It lists the deprecated
  dispositions with the values that replace them. Of the business step destroying it says that an object with an
  instance-level identifier should not be the subject of later events, and of decommissioning that an object may be
  commissioned again only with a new identifier. It also says that its examples use the GS1 Prefix 952. So `why-missing`,
  `biz-step-unknown` and `disposition-unknown` are documented by it, and `object-after-delete` leans on it next to the
  EPCIS standard. The CBV writes the prefix of the web form as Bizstep in its section on business steps and as BizStep
  elsewhere; the tool compares the prefixes in any case.
- The EPC Tag Data Standard writes an SGTIN URI as a company prefix and an item reference with indicator of 13 digits in
  all, followed by a serial number of the characters it allows; an SSCC URI as 17 digits in all; and an SGLN URI as 12
  digits before an extension. It says that the GTIN check digit is not part of an SGTIN URI and how to work it out from
  the other 13 digits, and it names 6 to 12 digits as the range of company prefix lengths permitted in the SGTIN. So
  `epc-uri-malformed` is documented by it, and `gtin-check-digit-invalid` leans on it. The class-level forms LGTIN and
  the SGTIN pattern are read with the same 13 digits, as the CBV writes them; the copy of the CBV holds the rows that
  name them.
- The GS1 General Specifications give one check digit rule for every fixed length numeric GS1 key, GTIN, GLN and SSCC
  among them, with an example worked out for 18 digits, and keep the GS1 Prefix 952 for demonstrations and examples of
  the GS1 system. So `gtin-check-digit-invalid`, `sscc-check-digit-invalid` and `gln-check-digit-invalid` are
  documented by them; and the examples of this repository use the GS1 Company Prefix 9521234 under that prefix.
- None of the standards says how a GS1 Digital Link URI on another host than id.gs1.org is told apart from any other
  web address. The tool reads such a path as a Digital Link only when its key has a length the key can have, which is
  its own choice; the copies do not hold the GS1 Digital Link standard.

The tool reads EPCIS of its own accord, from the standards, and was not tied to the documentation of one ledger
product or one capture application on purpose: such pages describe one product and change often.

## What the copies leave out

Each copy is the text of the standard as it was read, with a two-line header that names its address and how it was
read, and with these lines left out or changed, so that no copy holds a date, a number that reads like a year, personal
contact details or a word this project keeps out of every file, and every copy is plain ASCII (decision 1 in
docs/decisions):

- Every copy of a PDF: only the parts the checks rest on are kept, each where it was in the text that pdftotext gave,
  with `[...]` where text was left out. pdftotext writes a table column by column, so the cells of some tables follow
  one another rather than standing in rows; they were kept as they came. The lines that stand on every page were left
  out: the line of the release, which names its month and year; the copyright line of GS1, which names years; the line
  that numbers the page; and the running title of the standard. The list of the people who wrote each standard was not
  kept. Curly quotes and dashes are written as ASCII quotes and hyphens, and the bullets of the PDF, some of them in a
  private font, as hyphens.
- The EPCIS standard: the parts on the Action type, the QuantityElement, the common EPCISEvent, each of the five event
  types, and the sentence of its section on validation that calls eventTime mandatory. The release, Release 2.0,
  Ratified, is named in the header line of the copy without its month and year.
- The CBV: its first lines, the paragraph of its history that says its examples use the prefix 952, and its sections on
  business steps and dispositions with their tables and the table of deprecated dispositions.
- The Tag Data Standard: its first lines, the common grammar of its URIs, its sections on SGTIN, SSCC and SGLN, its
  section on the correspondence between an SGTIN and a GTIN, and the sentence on the lengths of company prefixes in its
  section on ISBN. In seven places it writes the two-letter abbreviation of Application Identifier before a number; the
  copy writes Application Identifier in full, because this project keeps that abbreviation out of its files.
- The GS1 General Specifications: its first lines, the row of the table of GS1 Prefixes for 952, and its section on the
  standard check digit with its two tables. The rows of the table of prefixes around it were left out; the row of 951
  names the years in which it was used.
- The JSON schema: ten files kept whole, each under its own raw address, with their CRLF line ends written as LF.

The checks of `npm run check` and of test/repo.test.js pass over the rest of the text of the copies as it was read.

## Events

### EPCIS Standard, Release 2.0, GS1

https://ref.gs1.org/standards/epcis/

Copy: research/sources/gs1-epcis-standard.txt

The standard of the events themselves: the five event types, their fields, the Action type, the QuantityElement and
the rules each event type follows. `event-type-unknown`, `event-time-missing`, `event-time-invalid`,
`timezone-offset-invalid`, `action-invalid`, `transformation-with-action`, `what-missing`,
`transformation-inputs-outputs-empty`, `quantity-invalid`, `event-id-duplicate` and `object-after-delete` lean on it.

### EPCIS 2.0 JSON schema, repository gs1/EPCIS

https://github.com/gs1/EPCIS/tree/master/JSON-Schema

Copy: research/sources/gs1-epcis-json-schema.txt

The JSON schema of EPCIS 2.0 that GS1 keeps with the standard: the required fields of an event and of a document, the
keys of each event type and the values of the action and the event type. `event-type-unknown`,
`timezone-offset-missing`, `action-missing` and `transformation-with-action` lean on it.

## Vocabulary

### Core Business Vocabulary (CBV) Standard, Release 2.0, GS1

https://ref.gs1.org/standards/cbv/

Copy: research/sources/gs1-cbv-standard.txt

The business steps and dispositions an event names, with the forms they are written in and the values the CBV
deprecates. `why-missing`, `biz-step-unknown`, `disposition-unknown` and `object-after-delete` lean on it.

## Identifiers

### EPC Tag Data Standard (TDS), GS1

https://ref.gs1.org/standards/tds/

Copy: research/sources/gs1-tag-data-standard.txt

The forms of EPC URIs and their correspondence with the GS1 keys. `epc-uri-malformed` and `gtin-check-digit-invalid`
lean on it.

### GS1 General Specifications Standard

https://ref.gs1.org/standards/genspecs/

Copy: research/sources/gs1-general-specifications.txt

The rule of the check digit of the GS1 keys and the GS1 Prefix kept for examples. `gtin-check-digit-invalid`,
`sscc-check-digit-invalid` and `gln-check-digit-invalid` lean on it.
