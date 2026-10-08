# Rules and sources

Every check of the tool, with what it looks at, the points of the public standards it rests on, what it cannot see, and what to change. The points are in this project's own words and are the ones the reports show with `--explain`; each standard was fetched and read before it was listed, and a text copy of the parts the checks rest on is kept under [research/sources](../research/sources) so that a point can be checked against the standard it came from. [../research/sources.md](../research/sources.md) has a note on each standard.

The tool is an input to a review of EPCIS events before they are written to a shared supply chain ledger: not a certification of conformance to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really happened. 20 checks are documented by the standards: the five event types, the times, the offset, the action, what an event names, the inputs and outputs of a TransformationEvent, the quantities, the eventID and the delete by the EPCIS standard and its JSON schema; the bizStep, the disposition and the end of an object by the CBV; the digits of an EPC URI by the Tag Data Standard; and the check digits by the GS1 General Specifications. Every other check that is not about the file itself is a best practice of this tool, not a rule in the standards it cites, and says so in its message and in its own entry below with the reason. No saved standard sets a rule across events for where an object may be shipped from, which parent holds a child, in what order events come or what moment they may name.

## The standards

- EPCIS Standard, Release 2.0, GS1: https://ref.gs1.org/standards/epcis/ (copy: `research/sources/gs1-epcis-standard.txt`)
- EPCIS 2.0 JSON schema, repository gs1/EPCIS: https://github.com/gs1/EPCIS/tree/master/JSON-Schema (copy: `research/sources/gs1-epcis-json-schema.txt`)
- Core Business Vocabulary (CBV) Standard, Release 2.0, GS1: https://ref.gs1.org/standards/cbv/ (copy: `research/sources/gs1-cbv-standard.txt`)
- EPC Tag Data Standard (TDS), GS1: https://ref.gs1.org/standards/tds/ (copy: `research/sources/gs1-tag-data-standard.txt`)
- GS1 General Specifications Standard: https://ref.gs1.org/standards/genspecs/ (copy: `research/sources/gs1-general-specifications.txt`)

## file-unreadable

- Level: error
- Kind: a problem with the file itself; it has no setting to lower
- Looks at: the file is not JSON the reader can follow, or its top level is neither an object nor a list, so nothing in it was read.
- Cannot see: It stops at the first place that is not strict JSON, or at a top level that is neither an object nor a list, so nothing in the file is checked; EPCIS written as XML is not read.
- What to change: Write the file as one EPCISDocument in JSON, with the events in epcisBody.eventList, or as a JSON list of events (docs/inputs.md); fix the line named.
- Points of the standards: none; this check is about the file itself.

## field-missing

- Level: error
- Kind: a problem with the file itself; it has no setting to lower
- Looks at: a field the file needs is not there: the type of an event, the @context, type, schemaVersion, creationDate or epcisBody of a document, its eventList, the id of a readPoint or bizLocation, the epcClass of a quantity, the bizTransaction of a business transaction, the type and value of a source or destination, or the declarationTime of an error declaration.
- Cannot see: It names the field and the event or part that lacks it; it does not guess the value, and the checks that need the field do not run for that event.
- What to change: Add the field named; docs/inputs.md lists what each part of the file needs.
- Points of the standards: none; this check is about the file itself.

## field-unknown

- Level: warning
- Kind: a problem with the file itself; it has no setting to lower
- Looks at: a key the tool does not read in that place, often a misspelt one or the field of another event type; its value was left out of every check. A key with a colon is an extension and is left alone.
- Cannot see: It cannot tell what a misspelt key was meant to say; it names a known key when one differs only in case or separators, is one letter apart or starts the same, and names the event types a key belongs to when it is the field of another type. A key with a colon is taken for an extension of JSON-LD and is never reported, so a misspelt extension is not seen.
- What to change: Correct the spelling to a field of docs/inputs.md, move the field to the event type it belongs to, or name an extension field with a prefix such as example:field.
- Points of the standards: none; this check is about the file itself.

## field-invalid

- Level: error
- Kind: a problem with the file itself; it has no setting to lower
- Looks at: a value of the wrong type or form: text where a list or an object belongs, a quantity written as text, an identifier that is not a URI, a document type or schema version the tool does not know, or a creationDate that is not a date and time with a zone.
- Cannot see: It reports the form of a value, not whether the value is right: a well formed URI of the wrong object passes this check.
- What to change: Write the value as docs/inputs.md shows: text for times, identifiers and vocabulary values, lists for the lists of EPCs and quantities, objects for locations, and JSON numbers for quantities.
- Points of the standards: none; this check is about the file itself.

## field-duplicate

- Level: error
- Kind: a problem with the file itself; it has no setting to lower
- Looks at: one EPC listed twice in the same list of one event.
- Cannot see: EPCs are compared as written within one list; the same object written as an EPC URI and as a GS1 Digital Link URI in one list is not seen as one.
- What to change: List each EPC once in each list.
- Points of the standards: none; this check is about the file itself.

## secret-in-file

- Level: error
- Kind: a problem with the file itself; it has no setting to lower
- Looks at: the file holds a private key, a seed or a mnemonic, under a key named for one or as a value shaped like one; the tool never reads it and never shows it.
- Cannot see: The search knows a key or a seed by the name of its key and by its shape: a mnemonic of 12 to 24 lowercase words, an extended private key, 64 hex digits or a key in WIF. A secret split over fields, encoded another way or written under another name is not caught, and a value of 64 hex digits under hexBinaryValue is read as sensor data and not reported.
- What to change: Remove the value from the file and from wherever the file was copied, treat it as exposed and move what it controls to a new key. An event names objects, places and transactions, never the key of a ledger account.
- Points of the standards: none; this check is about the file itself.

## event-type-unknown

- Level: error
- Kind: documented by the standards below
- Looks at: the type of an event is a word that is not one of the five event types of EPCIS 2.0; a type named by a URI is an extension and is only noted.
- Cannot see: It compares the type with the five names of EPCIS 2.0, with their case. A type written as a URI is taken for an extension and only noted; the fields of an event of an unknown type are not checked against a type.
- What to change: Write ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent or AssociationEvent, with that spelling and case.
- Points of the standards:
  - EPCIS 2.0 defines five kinds of event, each a subclass of the common EPCISEvent: ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent and AssociationEvent. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)
  - In the JSON schema of EPCIS 2.0 the type of an event is one of the five event names, or else a URI that names an event type of an extension. (EPCIS 2.0 JSON schema, repository gs1/EPCIS, https://github.com/gs1/EPCIS/tree/master/JSON-Schema)

## event-time-missing

- Level: error
- Kind: documented by the standards below
- Looks at: an event has no eventTime, the field EPCIS calls mandatory in every event.
- Cannot see: It reads whether the eventTime is there and not empty. It cannot tell whether the time is the one at which the event took place.
- What to change: Add the eventTime: the date, time and time zone at which the event took place.
- Points of the standards:
  - EPCIS calls eventTime a mandatory field of every event, to be written exactly once. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)

## event-time-invalid

- Level: error
- Kind: documented by the standards below
- Looks at: an eventTime, recordTime or declarationTime that is not a date and time with a time zone, or names a day, hour or zone that does not exist.
- Cannot see: It reads the form of the time and whether its day, hour, minute, second and zone exist, in the proleptic Gregorian calendar of XML Schema; a leap second and the hour 24 are refused. It cannot tell whether the time is right.
- What to change: Write the time as YYYY-MM-DDThh:mm:ss, with an optional fraction of a second, and end it with Z or an offset such as +01:00.
- Points of the standards:
  - EPCIS types eventTime and recordTime as xsd:dateTimeStamp, a date and time that carries its own time zone, so the moment of an event is never left open. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)

## timezone-offset-missing

- Level: error
- Kind: documented by the standards below
- Looks at: an event has no eventTimeZoneOffset, which the JSON schema requires next to the eventTime.
- Cannot see: It reads whether the eventTimeZoneOffset is there. It does not compare it with the zone written in the eventTime, which EPCIS allows to differ.
- What to change: Add the eventTimeZoneOffset in effect where the event took place, such as +01:00, even when the eventTime is written in UTC.
- Points of the standards:
  - The JSON schema of EPCIS 2.0 lists eventTimeZoneOffset next to eventTime as the two required fields of the common event. (EPCIS 2.0 JSON schema, repository gs1/EPCIS, https://github.com/gs1/EPCIS/tree/master/JSON-Schema)

## timezone-offset-invalid

- Level: error
- Kind: documented by the standards below
- Looks at: an eventTimeZoneOffset that is not a sign, two digits of hours from 00 to 14, a colon and two digits of minutes, or that has minutes with 14 hours.
- Cannot see: It reads the form of the offset. It cannot tell whether the offset was in effect where the event took place.
- What to change: Write the offset as +hh:mm or -hh:mm, such as +05:30 or -08:00; write Z as +00:00.
- Points of the standards:
  - EPCIS writes eventTimeZoneOffset as a plus or minus sign, two digits of hours from 00 to 14, a colon and two digits of minutes from 00 to 59, and allows only 00 minutes with 14 hours. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)

## action-missing

- Level: error
- Kind: documented by the standards below
- Looks at: an ObjectEvent, AggregationEvent, TransactionEvent or AssociationEvent has no action.
- Cannot see: It reads whether an ObjectEvent, AggregationEvent, TransactionEvent or AssociationEvent has an action. It cannot tell whether the action is the right one.
- What to change: Add the action: ADD when the objects or the link are created, OBSERVE when they are seen unchanged, DELETE when they end.
- Points of the standards:
  - The JSON schemas of ObjectEvent, AggregationEvent, TransactionEvent and AssociationEvent each list action as a required field. (EPCIS 2.0 JSON schema, repository gs1/EPCIS, https://github.com/gs1/EPCIS/tree/master/JSON-Schema)

## action-invalid

- Level: error
- Kind: documented by the standards below
- Looks at: an action that is not ADD, OBSERVE or DELETE, written in capitals.
- Cannot see: It compares the action with ADD, OBSERVE and DELETE, in capitals. An action in small letters is reported with the value it probably meant.
- What to change: Write ADD, OBSERVE or DELETE, in capitals; EPCIS allows no other value.
- Points of the standards:
  - The Action type of EPCIS has exactly three values, ADD, OBSERVE and DELETE, and EPCIS says that industry groups may not extend it. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)

## transformation-with-action

- Level: error
- Kind: documented by the standards below
- Looks at: a TransformationEvent has an action, a field its type does not have.
- Cannot see: It reads whether a TransformationEvent has a key named action.
- What to change: Remove the action; a TransformationEvent says what was used and what was made through its inputs and outputs.
- Points of the standards:
  - The table of fields EPCIS gives a TransformationEvent has no action, though the tables of the other four event types have one. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)
  - The JSON schema of a TransformationEvent lists the keys such an event may hold, and action is not among them. (EPCIS 2.0 JSON schema, repository gs1/EPCIS, https://github.com/gs1/EPCIS/tree/master/JSON-Schema)

## what-missing

- Level: error
- Kind: documented by the standards below
- Looks at: an event does not name its objects as EPCIS asks: an ObjectEvent or TransactionEvent with no EPC and no quantity, an AggregationEvent or AssociationEvent with no child unless it removes them all, one with action ADD or DELETE and no parentID, or a TransactionEvent with no business transaction.
- Cannot see: It reads whether the lists are there and hold an item. A list whose items are all malformed still counts as holding one; the items are reported by the checks of identifiers. The exception of EPCIS for sensor data of a place is taken when an ObjectEvent has a sensorElementList and a readPoint; the sensor data itself is not read.
- What to change: Name the objects in the lists of the event type, the parent of an aggregation or association that is added or removed, and the business transaction of a TransactionEvent.
- Points of the standards:
  - An ObjectEvent must name its objects in a non-empty epcList or quantityList; the one exception is a sensor reading of a physical location named in the readPoint. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)
  - An AggregationEvent or an AssociationEvent must hold a non-empty childEPCs or childQuantityList, unless its action is DELETE and it removes every child. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)
  - An AggregationEvent or an AssociationEvent needs a parentID when its action is ADD or DELETE; only an OBSERVE may leave the parent out. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)
  - A TransactionEvent names one or more business transactions, and must hold a non-empty epcList or quantityList unless its action is DELETE. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)

## transformation-inputs-outputs-empty

- Level: error
- Kind: documented by the standards below
- Looks at: a TransformationEvent with no transformationID lacks inputs or outputs, or one with a transformationID has neither.
- Cannot see: It reads whether the lists of inputs and outputs hold an item, and whether there is a transformationID. It cannot see the other TransformationEvents a transformationID links when they are not in the file.
- What to change: List what was used in inputEPCList or inputQuantityList and what was made in outputEPCList or outputQuantityList, or link events of one process with a transformationID.
- Points of the standards:
  - Without a transformationID a TransformationEvent needs at least one input and at least one output; with one, it needs at least one input or one output. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)

## quantity-invalid

- Level: error
- Kind: documented by the standards below
- Looks at: a quantity of 0 or below, a count that is not a whole number with no unit of measure, a unit of measure with no quantity, or a unit that is not a code of two or three capitals and digits.
- Cannot see: It reads the quantity exactly from its characters and the form of the unit. It does not check that the unit is a code of UN/CEFACT Recommendation 20 for a length, an area, a volume or a mass, only its form of two or three capitals and digits.
- What to change: Write a count of objects as a positive whole number with no uom, or a measure as a positive number with its UN/CEFACT code, such as KGM; leave the uom out when the quantity is unknown.
- Points of the standards:
  - A quantity with no unit of measure must be a positive whole number, a quantity with a unit must be positive, and a unit of measure is left out when the quantity is. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)

## where-missing

- Level: warning
- Kind: a best practice of this tool, not a rule in the standards it cites
- Looks at: an event has neither a readPoint nor a bizLocation, so no one can tell where it took place.
- Cannot see: It reads whether the event has a readPoint or a bizLocation. It cannot tell whether the place is the right one.
- What to change: Add the readPoint where the event was seen, and the bizLocation where the objects are afterwards when they stay there.
- Points of the standards: none. The tool's own choice: asking for a readPoint or a bizLocation is a best practice of this tool, not a rule in the standards it cites; EPCIS makes both optional, but an event with neither cannot be placed on a map of the chain.

## why-missing

- Level: warning
- Kind: documented by the standards below
- Looks at: an event has no bizStep, though the CBV says that each event should carry one.
- Cannot see: It reads whether the event has a bizStep. It cannot tell whether the step is the right one.
- What to change: Add the bizStep of the business process, such as shipping, receiving or commissioning.
- Points of the standards:
  - The CBV says that every event of a document that conforms to it should carry a bizStep. (Core Business Vocabulary (CBV) Standard, Release 2.0, GS1, https://ref.gs1.org/standards/cbv/)

## biz-step-unknown

- Level: warning
- Kind: documented by the standards below
- Looks at: a bizStep that is not a business step of the CBV, alone or after a prefix of the CBV; a URI of another vocabulary is left alone.
- Cannot see: It compares the word alone, or after the prefix urn:epcglobal:cbv:bizstep: or its web form, with the table of the CBV. A URI of another vocabulary is allowed by the CBV and left alone, so a misspelt URI of your own is not seen.
- What to change: Use a value of the CBV table, in lower case with underscores, such as shipping; name a step of your own with a URI of your own domain.
- Points of the standards:
  - A bizStep of the CBV is one of the words of its table of business steps, written in lower case with underscores, alone in JSON or after the prefix urn:epcglobal:cbv:bizstep: or its web form; any other value is a URI of its own. (Core Business Vocabulary (CBV) Standard, Release 2.0, GS1, https://ref.gs1.org/standards/cbv/)

## disposition-unknown

- Level: warning
- Kind: documented by the standards below
- Looks at: a disposition or persistent disposition that is not a disposition of the CBV, or is one the CBV deprecates; a URI of another vocabulary is left alone.
- Cannot see: It compares the word alone, or after the prefix urn:epcglobal:cbv:disp: or its web form, with the table of the CBV and its list of deprecated values. A URI of another vocabulary is left alone.
- What to change: Use a value of the CBV table, such as in_transit or sellable_accessible, or the value that replaces a deprecated one.
- Points of the standards:
  - A disposition of the CBV is one of the words of its table of dispositions, written in lower case with underscores, alone in JSON or after the prefix urn:epcglobal:cbv:disp: or its web form. (Core Business Vocabulary (CBV) Standard, Release 2.0, GS1, https://ref.gs1.org/standards/cbv/)
  - The CBV marks the dispositions that start with non_sellable and the value no_pedigree_match as deprecated, and names the value that replaces each where there is one. (Core Business Vocabulary (CBV) Standard, Release 2.0, GS1, https://ref.gs1.org/standards/cbv/)

## event-id-duplicate

- Level: error
- Kind: documented by the standards below
- Looks at: two events of the file have the same eventID, and neither is an error declaration.
- Cannot see: It compares the eventIDs of the file as written; an eventID seen in an earlier file or on the ledger is not known. An event with an errorDeclaration is left out, since it repeats the eventID of the event it corrects.
- What to change: Give every event an eventID of its own, such as a UUID URI; an error declaration keeps the eventID of the event it corrects.
- Points of the standards:
  - EPCIS asks that an eventID be unique across all events, with the one exception of an error declaration, which repeats the eventID of the event it corrects. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)

## event-id-missing

- Level: info
- Kind: a best practice of this tool, not a rule in the standards it cites
- Looks at: an event has no eventID, so a ledger cannot tell the same event sent twice from two events; a note.
- Cannot see: It reads whether an event other than an error declaration has an eventID. It does not check the form of a UUID URI or of an event hash.
- What to change: Give each event an eventID, such as a UUID URI or the hash ID of the CBV, when the events go to a ledger.
- Points of the standards: none. The tool's own choice: asking for an eventID is a best practice of this tool, not a rule in the standards it cites; EPCIS makes it optional, but a shared ledger needs it to keep an event that is sent again from being written twice, so it is a note.

## event-out-of-order

- Level: warning
- Kind: a best practice of this tool, not a rule in the standards it cites
- Looks at: a recordTime earlier than its eventTime, or an event listed after another event of the same EPC but with an earlier eventTime.
- Cannot see: It compares the recordTime with the eventTime of each event, and the eventTime of events that name the same EPC in the order of the file. Events of other EPCs may come in any order; EPCIS does not ask for an order.
- What to change: Check the clocks of the readers and the order the events were captured in; list the events of an object in the order they took place.
- Points of the standards: none. The tool's own choice: comparing the times this way is a best practice of this tool, not a rule in the standards it cites; EPCIS does not ask for events in time order, but a ledger that keeps them in the order they arrive shows the history of an object out of order.

## future-event

- Level: error
- Kind: a best practice of this tool, not a rule in the standards it cites
- Looks at: an eventTime or recordTime later than the moment given with --now; without --now the check does not run.
- Cannot see: It runs only with --now, because the tool reads no clock; it compares each eventTime and recordTime with that moment. A clock that is a few seconds fast is reported as well.
- What to change: Correct the clock or the time zone of the system that wrote the event; an event cannot take place after it is reported.
- Points of the standards: none. The tool's own choice: refusing an event from the future is a best practice of this tool, not a rule in the standards it cites; EPCIS sets no rule about it, and the tool reads no clock, so the moment is the one given with --now.

## object-after-delete

- Level: warning
- Kind: documented by the standards below
- Looks at: an EPC that appears in an event later than an ObjectEvent with action DELETE, or than an event of the business step decommissioning or destroying, that named it.
- Cannot see: It follows the EPCs of the file in the order of their eventTime, with error declarations left out. It cannot see a re-commissioning with the same EPC that a partner meant, nor a delete that is not in the file. An EPC in a quantity of a class is not followed.
- What to change: Check whether the later event read the wrong tag or the delete was a mistake; correct the wrong event with an error declaration rather than a new event.
- Points of the standards:
  - After an ObjectEvent with action DELETE the identifiers it names no longer exist, and EPCIS says they should not be seen in later events. (EPCIS Standard, Release 2.0, GS1, https://ref.gs1.org/standards/epcis/)
  - The CBV says that an object whose identifier was destroyed should not appear in later events, and that a later event about it most likely marks a mistake. (Core Business Vocabulary (CBV) Standard, Release 2.0, GS1, https://ref.gs1.org/standards/cbv/)

## shipped-before-received

- Level: warning
- Kind: a best practice of this tool, not a rule in the standards it cites
- Looks at: an EPC shipped from a place it was never seen at before, while earlier events put it elsewhere, or that is received at that place only after it was shipped from there.
- Cannot see: It follows an EPC across the events of the file by the site of their bizLocation or readPoint: an SGLN or a GLN of a Digital Link without its extension, or the identifier as written. A shipping event ships from its source of the type location, or else from its readPoint or bizLocation. It cannot see the events the file does not hold, nor the children of a pallet that is shipped whole.
- What to change: Check the readPoint and source of the shipping event and whether an event of the arrival is missing or out of place.
- Points of the standards: none. The tool's own choice: following an EPC from place to place is a best practice of this tool, not a rule in the standards it cites; EPCIS says what each event means but sets no rule across events, and a file may hold only part of the history of an object.

## aggregation-child-in-two-parents

- Level: warning
- Kind: a best practice of this tool, not a rule in the standards it cites
- Looks at: a child EPC added to or observed in one parent while an earlier AggregationEvent put it in another parent and no event took it out.
- Cannot see: It follows the AggregationEvents of the file in the order of their eventTime. An AggregationEvent with action DELETE takes out the children it names, or every child of its parent when it names none. A child of a quantity of a class and an aggregation that was opened before the file are not seen.
- What to change: Add the AggregationEvent with action DELETE that took the child out of its first parent, or correct the parent of the later event.
- Points of the standards: none. The tool's own choice: following the aggregations of a child is a best practice of this tool, not a rule in the standards it cites; EPCIS describes each AggregationEvent on its own, and a file may not hold the event that took the child out.

## epc-uri-malformed

- Level: error
- Kind: documented by the standards below
- Looks at: an SGTIN, SSCC, SGLN, LGTIN or SGTIN pattern URI whose company prefix and reference do not add up to the digits of its scheme, or with a serial, lot or extension it does not allow, or a GS1 Digital Link URI with a key of the wrong length.
- Cannot see: It reads the digits of SGTIN, SSCC, SGLN, LGTIN and SGTIN pattern URIs, and the length of the key of a GS1 Digital Link URI for a GTIN, an SSCC or a GLN. It cannot tell where the company prefix ends inside the digits, nor whether a prefix was ever issued; other EPC schemes are not read.
- What to change: Write the EPC as the Tag Data Standard does: urn:epc:id:sgtin: with 13 digits before the serial, urn:epc:id:sscc: with 17 digits, urn:epc:id:sgln: with 12 digits before the extension.
- Points of the standards:
  - The Tag Data Standard writes an SGTIN as a company prefix and an item reference of 13 digits in all, an SSCC as 17 digits in all and an SGLN as 12, each followed where it applies by a serial or an extension. (EPC Tag Data Standard (TDS), GS1, https://ref.gs1.org/standards/tds/)

## gtin-check-digit-invalid

- Level: error
- Kind: documented by the standards below
- Looks at: a GTIN in a GS1 Digital Link URI whose last digit is not its check digit.
- Cannot see: It works the check digit out for a GTIN of 8, 12, 13 or 14 digits in a Digital Link URI. An EPC URI holds no check digit and is not read by this check.
- What to change: Work the check digit out again from the other digits, or copy the GTIN again from its source.
- Points of the standards:
  - The GS1 General Specifications give one check digit rule for GTIN, GLN and SSCC: weight the digits 3 and 1 from the right, add them up, and take what is missing to the next multiple of ten. (GS1 General Specifications Standard, https://ref.gs1.org/standards/genspecs/)
  - The Tag Data Standard leaves the check digit of the GTIN out of an SGTIN and works it out from the other 13 digits when the GTIN is needed again. (EPC Tag Data Standard (TDS), GS1, https://ref.gs1.org/standards/tds/)

## sscc-check-digit-invalid

- Level: error
- Kind: documented by the standards below
- Looks at: an SSCC in a GS1 Digital Link URI whose last digit is not its check digit.
- Cannot see: It works the check digit out for an SSCC of 18 digits in a Digital Link URI. An EPC URI holds no check digit and is not read by this check.
- What to change: Work the check digit out again from the first 17 digits, or copy the SSCC again from the label.
- Points of the standards:
  - The GS1 General Specifications give one check digit rule for GTIN, GLN and SSCC: weight the digits 3 and 1 from the right, add them up, and take what is missing to the next multiple of ten. (GS1 General Specifications Standard, https://ref.gs1.org/standards/genspecs/)

## gln-check-digit-invalid

- Level: error
- Kind: documented by the standards below
- Looks at: a GLN in a GS1 Digital Link URI whose last digit is not its check digit.
- Cannot see: It works the check digit out for a GLN of 13 digits in a Digital Link URI. An EPC URI holds no check digit and is not read by this check.
- What to change: Work the check digit out again from the first 12 digits, or copy the GLN again from the master data of the location.
- Points of the standards:
  - The GS1 General Specifications give one check digit rule for GTIN, GLN and SSCC: weight the digits 3 and 1 from the right, add them up, and take what is missing to the next multiple of ten. (GS1 General Specifications Standard, https://ref.gs1.org/standards/genspecs/)
