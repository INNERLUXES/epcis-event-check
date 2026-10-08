// Reading an EPCIS file from the nodes of the JSON reader: an EPCISDocument with its events in epcisBody.eventList, an
// EPCISQueryDocument with them in epcisBody.queryResults.resultsBody.eventList, or a bare list of events. Every field is
// read with the line and column of its key. A field that is missing, of the wrong type or unknown is a finding of its
// own, and the value is left out of the checks that need it; nothing that was not read is taken for a value that is
// fine. Times are kept as the text the file writes; src/analyze.js reads them. The master data of the header, the
// sensor data, the instance and lot master data and the certification of an event are not read.

import { Reader, cut, describe, where } from './fields.js';
import { isArray, isNumber, isObject, isString } from './json.js';

export const EVENT_LIMITS = { maxEvents: 100000, maxListItems: 10000 };

export const DOCUMENT_TYPES = ['EPCISDocument', 'EPCISQueryDocument'];
export const DOCUMENT_KEYS = ['@context', 'id', 'type', 'schemaVersion', 'creationDate', 'instanceIdentifier', 'sender', 'receiver', 'epcisHeader', 'epcisBody'];
export const DOCUMENT_REQUIRED = ['@context', 'type', 'schemaVersion', 'creationDate', 'epcisBody'];
export const QUERY_KEYS = ['queryName', 'subscriptionID', 'resultsBody'];
export const RESULTS_KEYS = ['eventList', 'vocabularyList'];
export const COMMON_KEYS = ['@context', 'type', 'eventTime', 'recordTime', 'eventTimeZoneOffset', 'eventID', 'certificationInfo', 'errorDeclaration'];
export const EVENT_KEYS = {
  ObjectEvent: ['action', 'epcList', 'quantityList', 'bizStep', 'disposition', 'persistentDisposition', 'readPoint', 'bizLocation', 'bizTransactionList', 'sourceList', 'destinationList', 'sensorElementList', 'ilmd'],
  AggregationEvent: ['parentID', 'childEPCs', 'childQuantityList', 'action', 'bizStep', 'disposition', 'readPoint', 'bizLocation', 'bizTransactionList', 'sourceList', 'destinationList', 'sensorElementList'],
  TransactionEvent: ['bizTransactionList', 'parentID', 'epcList', 'quantityList', 'action', 'bizStep', 'disposition', 'readPoint', 'bizLocation', 'sourceList', 'destinationList', 'sensorElementList'],
  TransformationEvent: ['inputEPCList', 'inputQuantityList', 'outputEPCList', 'outputQuantityList', 'transformationID', 'bizStep', 'disposition', 'persistentDisposition', 'readPoint', 'bizLocation', 'bizTransactionList', 'sourceList', 'destinationList', 'sensorElementList', 'ilmd'],
  AssociationEvent: ['parentID', 'childEPCs', 'childQuantityList', 'action', 'bizStep', 'disposition', 'readPoint', 'bizLocation', 'bizTransactionList', 'sourceList', 'destinationList', 'sensorElementList']
};
export const EVENT_TYPES = Object.keys(EVENT_KEYS);
export const ALL_EVENT_KEYS = [...new Set([...COMMON_KEYS, ...EVENT_TYPES.flatMap((t) => EVENT_KEYS[t])])];
export const EPC_LISTS = ['epcList', 'childEPCs', 'inputEPCList', 'outputEPCList'];
export const QUANTITY_LISTS = ['quantityList', 'childQuantityList', 'inputQuantityList', 'outputQuantityList'];
export const QUANTITY_KEYS = ['epcClass', 'quantity', 'uom'];
export const LOCATION_KEYS = ['id'];
export const TRANSACTION_KEYS = ['type', 'bizTransaction'];
export const ERROR_KEYS = ['declarationTime', 'reason', 'correctiveEventIDs'];
export const PERSISTENT_KEYS = ['set', 'unset'];
const TEXT_KEYS = ['eventTime', 'recordTime', 'eventTimeZoneOffset', 'eventID', 'action', 'bizStep', 'disposition', 'parentID', 'transformationID'];
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

const article = (type) => (/^[AEIOU]/.test(type) ? 'an' : 'a');

// The event types that have a key, for a message about a key that belongs to another type.
const ownersOf = (key) => {
  const types = EVENT_TYPES.filter((t) => EVENT_KEYS[t].includes(key));
  const named = types.map((t) => `${article(t)} ${t}`);
  return named.length === 0 ? null : named.length === 1 ? named[0] : `${named.slice(0, -1).join(', ')} or ${named.at(-1)}`;
};

// Reads the file from the root node: { document, events, findings, notes }. document is null when the top level is
// neither an object nor a list.
export function readEvents(root, limits = EVENT_LIMITS) {
  const reader = new Reader('events');
  const notes = [];
  const missing = (at, message, subject = null) => reader.add('field-missing', at, message, subject);
  let list = null;
  let document;
  if (isArray(root)) {
    document = { form: 'list', type: null, schemaVersion: null, creationDate: null, line: root.line };
    list = { items: root.items, entry: root, of: 'the list of events' };
  } else if (!isObject(root)) {
    reader.add('file-unreadable', where(root), `The top level of the file is ${describe(root)}, not an EPCISDocument or a list of events, so nothing was checked.`);
    return { document: null, events: [], findings: reader.findings, notes: ['the file was not checked, because it holds neither an object nor a list at its top level'] };
  } else {
    const top = reader.fields(root, DOCUMENT_KEYS, 'the document');
    const type = reader.text(top, 'type', 'the document');
    document = { form: 'document', type: null, schemaVersion: null, creationDate: null, line: root.line };
    for (const key of DOCUMENT_REQUIRED) if (!top.has(key)) missing(where(root), `The document has no ${key}, which the JSON schema of an EPCISDocument requires${key === 'epcisBody' ? '; the events go in epcisBody.eventList' : ''}.`);
    if (type.value !== null) {
      if (DOCUMENT_TYPES.includes(type.value)) document.type = type.value;
      else reader.add('field-invalid', where(type.entry), `The type of the document is "${cut(type.value, 40)}"; it must be EPCISDocument, or EPCISQueryDocument for the answer to a query. A file of events alone is a JSON list.`);
    } else if (type.entry && !type.invalid) reader.add('field-invalid', where(type.entry), 'The type of the document is empty; it must be EPCISDocument.');
    const version = reader.text(top, 'schemaVersion', 'the document');
    if (version.value !== null) {
      if (/^[0-9]+(?:\.[0-9]+)*$/.test(version.value)) document.schemaVersion = version.value;
      else reader.add('field-invalid', where(version.entry), `The schemaVersion of the document is "${cut(version.value, 40)}"; it must be a version such as 2.0.`);
    }
    const created = reader.text(top, 'creationDate', 'the document');
    if (created.value !== null) document.creationDate = { value: created.value, entry: created.entry };
    const body = reader.object(top, 'epcisBody', 'the document', 'the eventList');
    if (body.value) {
      const query = document.type === 'EPCISQueryDocument';
      const b = reader.fields(body.value, query ? ['queryResults'] : ['eventList'], 'the epcisBody');
      if (query) {
        const qr = reader.object(b, 'queryResults', 'the epcisBody', 'the queryName and the resultsBody');
        if (!qr.entry) missing(where(body.entry), 'The epcisBody of the query document has no queryResults.');
        if (qr.value) {
          const q = reader.fields(qr.value, QUERY_KEYS, 'the queryResults');
          const rb = reader.object(q, 'resultsBody', 'the queryResults', 'the eventList');
          if (!rb.entry) missing(where(qr.entry), 'The queryResults have no resultsBody.');
          if (rb.value) list = listOf(reader, reader.fields(rb.value, RESULTS_KEYS, 'the resultsBody'), 'the resultsBody', rb.entry, missing);
        }
      } else list = listOf(reader, b, 'the epcisBody', body.entry, missing);
    }
  }
  const events = [];
  if (list) {
    if (list.items.length > limits.maxEvents) notes.push(`${list.of} holds ${list.items.length} events; the tool read the first ${limits.maxEvents} and left the rest out`);
    for (const [i, node] of list.items.slice(0, limits.maxEvents).entries()) {
      if (node.secret) continue;
      if (!isObject(node)) reader.add('field-invalid', where(node), `Item ${i + 1} of ${list.of} is ${describe(node)}; an event is an object.`, `event ${i + 1}`);
      else events.push(readEvent(reader, node, i + 1, limits, notes));
    }
    if (list.items.length === 0) notes.push(`${list.of} is empty, so there was no event to check`);
  }
  return { document, events, findings: reader.findings, notes };
}

// The eventList of a body: { items, entry, of } or null with a finding.
function listOf(reader, map, of, at, missing) {
  const e = map.get('eventList');
  if (!e) {
    missing(where(at), `The ${of.slice(4)} has no eventList, the list of events.`);
    return null;
  }
  if (e.value.secret) return null;
  if (!isArray(e.value)) {
    reader.add('field-invalid', where(e), `The eventList of ${of} is ${describe(e.value)}; it must be a list of events.`);
    return null;
  }
  return { items: e.value.items, entry: e, of: 'the eventList' };
}

// Reads one event: what the checks need, each field with its entry.
function readEvent(reader, node, n, limits, notes) {
  const label = `event ${n}`;
  const typeEntry = node.entries.find((e) => e.key === 'type' && !e.secret);
  const ev = { n, line: node.line, column: node.column, subject: label, type: null, kind: null, typeEntry: typeEntry ?? null, action: null, epcs: {}, quantities: {}, sources: [], destinations: [], persistent: [], hasSensors: false, errorDeclaration: null };
  let known = ALL_EVENT_KEYS;
  if (typeEntry?.value.secret) {
    // A type shaped like a secret was reported by src/secrets.js; the event is read with no type, and nothing is said of it.
  } else if (!typeEntry) reader.add('field-missing', where(node), `Event ${n} has no type; EPCIS names it ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent or AssociationEvent, so only its common fields were checked.`, label);
  else if (!isString(typeEntry.value)) reader.add('field-invalid', where(typeEntry), `The type of event ${n} is ${describe(typeEntry.value)}; it must be text.`, label);
  else {
    ev.type = typeEntry.value.value.trim();
    if (Object.hasOwn(EVENT_KEYS, ev.type)) {
      ev.kind = ev.type;
      known = [...COMMON_KEYS, ...EVENT_KEYS[ev.type], ...(ev.type === 'TransformationEvent' ? ['action'] : [])];
    } else ev.kind = SCHEME.test(ev.type) ? 'extension' : 'unknown';
  }
  const of = ev.kind && ev.kind !== 'extension' && ev.kind !== 'unknown' ? `event ${n} (${ev.kind})` : `event ${n}`;
  ev.of = of;
  // A type the tool does not know leaves its fields unchecked for keys: they may be the fields of that type.
  const map = ev.kind === null || ev.kind === 'extension' || ev.kind === 'unknown' ? fieldsQuiet(node) : reader.fields(node, known, of, label, (key) => ownersOf(key));
  for (const key of TEXT_KEYS) {
    const r = reader.text(map, key, of, label);
    ev[key] = r.value === null ? (r.entry ? { value: null, entry: r.entry, invalid: Boolean(r.invalid), empty: Boolean(r.empty) } : null) : { value: r.value, entry: r.entry };
  }
  for (const key of ['readPoint', 'bizLocation']) {
    const r = reader.object(map, key, of, 'an id', label);
    ev[key] = null;
    if (r.value) {
      const m = reader.fields(r.value, LOCATION_KEYS, `the ${key} of ${of}`, label);
      const id = reader.text(m, 'id', `the ${key} of ${of}`, label);
      if (id.value === null && !id.invalid) reader.add('field-missing', where(id.entry ?? r.entry), `The ${key} of ${of} has no id.`, label);
      ev[key] = { id: id.value, entry: r.entry, idEntry: id.entry };
    } else if (r.invalid) ev[key] = { id: null, entry: r.entry, invalid: true };
  }
  for (const key of EPC_LISTS) {
    const r = reader.texts(map, key, of, limits.maxListItems, label);
    if (!r.entry) continue;
    if (r.more) notes.push(`the ${key} of ${of} holds more than ${limits.maxListItems} identifiers; the tool read the first ${limits.maxListItems}`);
    if (r.values) {
      const seen = new Map();
      for (const v of r.values) {
        if (seen.has(v.value)) reader.add('field-duplicate', where(v.node), `The ${key} of ${of} lists ${cut(v.value, 80)} twice, ${seen.get(v.value).node.line === v.node.line ? `on line ${v.node.line}` : `at lines ${seen.get(v.value).node.line} and ${v.node.line}`}; an EPC is listed once.`, label);
        else seen.set(v.value, v);
      }
      ev.epcs[key] = { values: [...seen.values()], entry: r.entry };
    } else ev.epcs[key] = { values: null, entry: r.entry, invalid: true };
  }
  for (const key of QUANTITY_LISTS) {
    const r = reader.objects(map, key, of, limits.maxListItems, (q, i) => readQuantity(reader, q, `item ${i} of the ${key} of ${of}`, label), label);
    if (!r.entry) continue;
    if (r.more) notes.push(`the ${key} of ${of} holds more than ${limits.maxListItems} quantities; the tool read the first ${limits.maxListItems}`);
    ev.quantities[key] = r.values ? { values: r.values, entry: r.entry } : { values: null, entry: r.entry, invalid: true };
  }
  const tx = reader.objects(map, 'bizTransactionList', of, limits.maxListItems, (t, i) => {
    const m = reader.fields(t, TRANSACTION_KEYS, `item ${i} of the bizTransactionList of ${of}`, label);
    const b = reader.text(m, 'bizTransaction', `item ${i} of the bizTransactionList of ${of}`, label);
    if (b.value === null && !b.invalid) reader.add('field-missing', where(b.entry ?? t), `Item ${i} of the bizTransactionList of ${of} has no bizTransaction, the identifier of the transaction.`, label);
    reader.text(m, 'type', `item ${i} of the bizTransactionList of ${of}`, label);
    return { value: b.value, node: t };
  }, label);
  ev.bizTransactions = tx.entry ? { values: tx.values, entry: tx.entry, invalid: Boolean(tx.invalid) } : null;
  for (const [key, field, out] of [['sourceList', 'source', ev.sources], ['destinationList', 'destination', ev.destinations]]) {
    reader.objects(map, key, of, limits.maxListItems, (s, i) => {
      const at = `item ${i} of the ${key} of ${of}`;
      const m = reader.fields(s, ['type', field], at, label);
      const type = reader.text(m, 'type', at, label);
      const value = reader.text(m, field, at, label);
      for (const [r, k] of [[type, 'type'], [value, field]]) if (r.value === null && !r.invalid) reader.add('field-missing', where(r.entry ?? s), `${at[0].toUpperCase()}${at.slice(1)} has no ${k}.`, label);
      out.push({ type: type.value, value: value.value, entry: value.entry, node: s });
      return null;
    }, label);
  }
  const err = reader.object(map, 'errorDeclaration', of, 'its declarationTime', label);
  if (err.value) {
    const m = reader.fields(err.value, ERROR_KEYS, `the errorDeclaration of ${of}`, label);
    const t = reader.text(m, 'declarationTime', `the errorDeclaration of ${of}`, label);
    if (t.value === null && !t.invalid) reader.add('field-missing', where(t.entry ?? err.entry), `The errorDeclaration of ${of} has no declarationTime, the time the event was declared wrong.`, label);
    reader.text(m, 'reason', `the errorDeclaration of ${of}`, label);
    reader.texts(m, 'correctiveEventIDs', `the errorDeclaration of ${of}`, limits.maxListItems, label);
    ev.errorDeclaration = { entry: err.entry, declarationTime: t.value === null ? null : { value: t.value, entry: t.entry } };
  } else if (err.entry) ev.errorDeclaration = { entry: err.entry, declarationTime: null };
  const pd = reader.object(map, 'persistentDisposition', of, 'set and unset lists of dispositions', label);
  if (pd.value) {
    const m = reader.fields(pd.value, PERSISTENT_KEYS, `the persistentDisposition of ${of}`, label);
    for (const key of PERSISTENT_KEYS) ev.persistent.push(...(reader.texts(m, key, `the persistentDisposition of ${of}`, limits.maxListItems, label).values ?? []));
  }
  ev.hasSensors = map.has('sensorElementList');
  return ev;
}

// The fields of an event of a type the tool does not know: every key it reads elsewhere, with no finding for the rest.
function fieldsQuiet(node) {
  const map = new Map();
  for (const e of node.entries) if (!e.secret && ALL_EVENT_KEYS.includes(e.key) && !map.has(e.key)) map.set(e.key, e);
  return map;
}

// Reads a QuantityElement: { epcClass, quantity, uom } with the raw text of the quantity, each with its entry.
function readQuantity(reader, node, of, subject) {
  const m = reader.fields(node, QUANTITY_KEYS, of, subject);
  const cls = reader.text(m, 'epcClass', of, subject);
  if (cls.value === null && !cls.invalid) reader.add('field-missing', where(cls.entry ?? node), `${of[0].toUpperCase()}${of.slice(1)} has no epcClass, the class of the objects it counts.`, subject);
  const q = m.get('quantity');
  let quantity = null;
  if (q && !q.value.secret) {
    if (isNumber(q.value)) quantity = { raw: q.value.raw, entry: q };
    else reader.add('field-invalid', where(q), `The quantity of ${of} is ${isString(q.value) ? `"${cut(q.value.value, 40)}"` : describe(q.value)}; it must be a JSON number.`, subject);
  }
  const uom = reader.text(m, 'uom', of, subject);
  return { epcClass: cls.value === null ? null : { value: cls.value, entry: cls.entry }, quantity, quantityInvalid: Boolean(q) && quantity === null, uom: uom.value === null ? null : { value: uom.value, entry: uom.entry }, node, of };
}
