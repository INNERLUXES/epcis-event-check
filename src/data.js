// The public standards the documented checks rest on, and the points of each that the reports show, written in this
// project's own words. A standard is named by its address; a text copy of the parts of it the checks rest on, read before
// it was listed, is kept under research/sources. research/sources.md lists every standard with a note,
// docs/rules-and-sources.md lists every rule with its points, and test/data.test.js checks the three against each other.

export const LEVELS = ['info', 'warning', 'error'];

export const NOT_A = 'not a certification of conformance to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really happened';

export const NOTICE = `This report is an input to a review of EPCIS events before they are written to a shared supply chain ledger: ${NOT_A}.`;

export const SOURCES = [
  { id: 'epcis', title: 'EPCIS Standard, Release 2.0, GS1', url: 'https://ref.gs1.org/standards/epcis/', file: 'research/sources/gs1-epcis-standard.txt' },
  { id: 'epcis-schema', title: 'EPCIS 2.0 JSON schema, repository gs1/EPCIS', url: 'https://github.com/gs1/EPCIS/tree/master/JSON-Schema', file: 'research/sources/gs1-epcis-json-schema.txt' },
  { id: 'cbv', title: 'Core Business Vocabulary (CBV) Standard, Release 2.0, GS1', url: 'https://ref.gs1.org/standards/cbv/', file: 'research/sources/gs1-cbv-standard.txt' },
  { id: 'tds', title: 'EPC Tag Data Standard (TDS), GS1', url: 'https://ref.gs1.org/standards/tds/', file: 'research/sources/gs1-tag-data-standard.txt' },
  { id: 'genspecs', title: 'GS1 General Specifications Standard', url: 'https://ref.gs1.org/standards/genspecs/', file: 'research/sources/gs1-general-specifications.txt' }
];

// Points: id -> { source, text }.
export const POINTS = {
  'epcis-event-types': { source: 'epcis', text: 'EPCIS 2.0 defines five kinds of event, each a subclass of the common EPCISEvent: ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent and AssociationEvent.' },
  'schema-event-type': { source: 'epcis-schema', text: 'In the JSON schema of EPCIS 2.0 the type of an event is one of the five event names, or else a URI that names an event type of an extension.' },
  'epcis-event-time-mandatory': { source: 'epcis', text: 'EPCIS calls eventTime a mandatory field of every event, to be written exactly once.' },
  'epcis-event-time-type': { source: 'epcis', text: 'EPCIS types eventTime and recordTime as xsd:dateTimeStamp, a date and time that carries its own time zone, so the moment of an event is never left open.' },
  'schema-required-offset': { source: 'epcis-schema', text: 'The JSON schema of EPCIS 2.0 lists eventTimeZoneOffset next to eventTime as the two required fields of the common event.' },
  'epcis-offset-form': { source: 'epcis', text: 'EPCIS writes eventTimeZoneOffset as a plus or minus sign, two digits of hours from 00 to 14, a colon and two digits of minutes from 00 to 59, and allows only 00 minutes with 14 hours.' },
  'schema-action-required': { source: 'epcis-schema', text: 'The JSON schemas of ObjectEvent, AggregationEvent, TransactionEvent and AssociationEvent each list action as a required field.' },
  'epcis-action-values': { source: 'epcis', text: 'The Action type of EPCIS has exactly three values, ADD, OBSERVE and DELETE, and EPCIS says that industry groups may not extend it.' },
  'epcis-no-action-field': { source: 'epcis', text: 'The table of fields EPCIS gives a TransformationEvent has no action, though the tables of the other four event types have one.' },
  'schema-no-action-key': { source: 'epcis-schema', text: 'The JSON schema of a TransformationEvent lists the keys such an event may hold, and action is not among them.' },
  'epcis-object-what': { source: 'epcis', text: 'An ObjectEvent must name its objects in a non-empty epcList or quantityList; the one exception is a sensor reading of a physical location named in the readPoint.' },
  'epcis-children': { source: 'epcis', text: 'An AggregationEvent or an AssociationEvent must hold a non-empty childEPCs or childQuantityList, unless its action is DELETE and it removes every child.' },
  'epcis-parent-required': { source: 'epcis', text: 'An AggregationEvent or an AssociationEvent needs a parentID when its action is ADD or DELETE; only an OBSERVE may leave the parent out.' },
  'epcis-transaction-what': { source: 'epcis', text: 'A TransactionEvent names one or more business transactions, and must hold a non-empty epcList or quantityList unless its action is DELETE.' },
  'epcis-inputs-outputs': { source: 'epcis', text: 'Without a transformationID a TransformationEvent needs at least one input and at least one output; with one, it needs at least one input or one output.' },
  'epcis-quantity': { source: 'epcis', text: 'A quantity with no unit of measure must be a positive whole number, a quantity with a unit must be positive, and a unit of measure is left out when the quantity is.' },
  'epcis-event-id-unique': { source: 'epcis', text: 'EPCIS asks that an eventID be unique across all events, with the one exception of an error declaration, which repeats the eventID of the event it corrects.' },
  'epcis-delete-not-observed': { source: 'epcis', text: 'After an ObjectEvent with action DELETE the identifiers it names no longer exist, and EPCIS says they should not be seen in later events.' },
  'cbv-destroying': { source: 'cbv', text: 'The CBV says that an object whose identifier was destroyed should not appear in later events, and that a later event about it most likely marks a mistake.' },
  'cbv-bizstep-should': { source: 'cbv', text: 'The CBV says that every event of a document that conforms to it should carry a bizStep.' },
  'cbv-bizstep-values': { source: 'cbv', text: 'A bizStep of the CBV is one of the words of its table of business steps, written in lower case with underscores, alone in JSON or after the prefix urn:epcglobal:cbv:bizstep: or its web form; any other value is a URI of its own.' },
  'cbv-disposition-values': { source: 'cbv', text: 'A disposition of the CBV is one of the words of its table of dispositions, written in lower case with underscores, alone in JSON or after the prefix urn:epcglobal:cbv:disp: or its web form.' },
  'cbv-deprecated': { source: 'cbv', text: 'The CBV marks the dispositions that start with non_sellable and the value no_pedigree_match as deprecated, and names the value that replaces each where there is one.' },
  'tds-uri-digits': { source: 'tds', text: 'The Tag Data Standard writes an SGTIN as a company prefix and an item reference of 13 digits in all, an SSCC as 17 digits in all and an SGLN as 12, each followed where it applies by a serial or an extension.' },
  'tds-check-digit': { source: 'tds', text: 'The Tag Data Standard leaves the check digit of the GTIN out of an SGTIN and works it out from the other 13 digits when the GTIN is needed again.' },
  'genspecs-check-digit': { source: 'genspecs', text: 'The GS1 General Specifications give one check digit rule for GTIN, GLN and SSCC: weight the digits 3 and 1 from the right, add them up, and take what is missing to the next multiple of ten.' }
};

export const source = (id) => SOURCES.find((s) => s.id === id);
export const pointPage = (id) => source(POINTS[id].source);
