// The checks on what was read: the type, the times and the action of each event, what it names, where and why, its
// quantities and identifiers, then the checks across events: eventIDs written twice, events out of order or from the
// future, EPCs seen after they were deleted, shipped from a place they never reached, or put in two parents at once.
// Each finding names the line of the field it is about. Times are the file's own; the moment of --now is the only one
// the tool is given, and it reads no clock.

import { formatDecimal, isZero, parseDecimal, placesOf } from './decimal.js';
import { EVENT_TYPES } from './events.js';
import { cut } from './fields.js';
import { isUri, readIdentifier, readVocab } from './gs1.js';
import { BEST } from './rules.js';
import { listText, plural } from './size.js';
import { compareTime, offsetProblem, readTime, spanText } from './time.js';

const BP = `This is ${BEST}.`;
const at = (e) => ({ line: e.line, column: e.column });
const ACTIONS = ['ADD', 'OBSERVE', 'DELETE'];
const WITH_ACTION = ['ObjectEvent', 'AggregationEvent', 'TransactionEvent', 'AssociationEvent'];
const UOM = /^[A-Z0-9]{2,3}$/;
const NUMBER = /^(-?)((?:0|[1-9][0-9]*)(?:\.[0-9]+)?)(?:[eE]([+-]?[0-9]+))?$/;
const LOCATION_TYPES = ['location', 'urn:epcglobal:cbv:sdt:location', 'https://ref.gs1.org/cbv/sdt-location'];

// Reads a JSON number as a quantity, exactly: { state, whole, text } with state 'positive', 'zero', 'negative' or
// 'unreadable' (an exponent beyond 40 or more than 40 digits on a side of the point).
export function readQuantityValue(raw) {
  const m = NUMBER.exec(raw);
  if (!m || (m[3] !== undefined && Math.abs(Number(m[3])) > 40)) return { state: 'unreadable', whole: false, text: raw };
  const d = parseDecimal(m[2]);
  if (!d) return { state: 'unreadable', whole: false, text: raw };
  const exp = m[3] === undefined ? 0 : Number(m[3]);
  const value = exp >= 0 ? { int: d.int * 10n ** BigInt(Math.max(0, exp - d.scale)), scale: Math.max(0, d.scale - exp) } : { int: d.int, scale: d.scale - exp };
  const text = formatDecimal(value);
  if (isZero(value)) return { state: 'zero', whole: true, text };
  return { state: m[1] ? 'negative' : 'positive', whole: placesOf(value) === 0, text: `${m[1]}${text}` };
}

// The site of a location: the GLN of an SGLN or a Digital Link GLN without its extension, or the identifier itself.
export function siteOf(id) {
  if (id === null || id === undefined) return null;
  return readIdentifier(id)?.site ?? id;
}

// The key an EPC is followed by across events: the same for its EPC URI and its Digital Link URI.
export const epcKey = (text) => readIdentifier(text)?.key ?? text;

// The checks: { findings, notes, summary }. read may be null when the file could not be read.
export function analyze(read = null, { now = null } = {}) {
  const findings = [];
  const notes = [];
  const add = (id, where, message, subject = null) => findings.push({ id, file: 'events', line: where.line, column: where.column, message, subject });
  if (!read) return { findings, notes, summary: null };
  const { document, events } = read;
  const nowTime = now === null ? null : readTime(now);

  // The checks of each event on its own.
  const times = new Map();
  for (const ev of events) {
    const Ev = cap(ev.of);
    const s = ev.subject;
    if (ev.kind === 'unknown') add('event-type-unknown', at(ev.typeEntry), `${Ev} has the type "${cut(ev.type, 60)}", which is not one of the five event types of EPCIS 2.0 (${listText(EVENT_TYPES, 8)}), so its fields were not checked against a type.${nearType(ev.type)} The type of an extension is a URI.`, s);
    if (ev.kind === 'extension') notes.push(`event ${ev.n} has the type ${cut(ev.type, 80)}, a type of an extension named by a URI; only its common fields were checked`);

    // When: eventTime, recordTime, eventTimeZoneOffset and the time of an error declaration.
    const timeOf = (field, name) => {
      if (!field || field.value === null) return null;
      const t = readTime(field.value);
      if (t.problem) {
        add('event-time-invalid', at(field.entry), `The ${name} of ${ev.of}, "${cut(field.value, 60)}", ${t.problem}. EPCIS types it as xsd:dateTimeStamp, a date and time with its time zone.`, s);
        return null;
      }
      return t.ns;
    };
    if (!ev.eventTime) add('event-time-missing', ev, `${Ev} has no eventTime; EPCIS calls eventTime mandatory in every event, so no one can tell when it took place.`, s);
    else if (ev.eventTime.value === null && !ev.eventTime.invalid) add('event-time-missing', at(ev.eventTime.entry), `The eventTime of ${ev.of} is empty; EPCIS calls eventTime mandatory in every event.`, s);
    const eventNs = timeOf(ev.eventTime, 'eventTime');
    const recordNs = timeOf(ev.recordTime, 'recordTime');
    if (ev.errorDeclaration?.declarationTime) timeOf(ev.errorDeclaration.declarationTime, 'declarationTime of the errorDeclaration');
    times.set(ev, eventNs);
    if (!ev.eventTimeZoneOffset) add('timezone-offset-missing', ev, `${Ev} has no eventTimeZoneOffset, which the JSON schema of EPCIS 2.0 requires next to the eventTime: the offset from UTC in effect where the event took place.`, s);
    else if (ev.eventTimeZoneOffset.value === null && !ev.eventTimeZoneOffset.invalid) add('timezone-offset-missing', at(ev.eventTimeZoneOffset.entry), `The eventTimeZoneOffset of ${ev.of} is empty; the JSON schema of EPCIS 2.0 requires it.`, s);
    else if (ev.eventTimeZoneOffset.value !== null) {
      const p = offsetProblem(ev.eventTimeZoneOffset.value);
      if (p) add('timezone-offset-invalid', at(ev.eventTimeZoneOffset.entry), `The eventTimeZoneOffset of ${ev.of}, "${cut(ev.eventTimeZoneOffset.value, 30)}", ${p}; EPCIS writes it as a sign, two digits of hours from 00 to 14, a colon and two digits of minutes.`, s);
    }
    if (recordNs !== null && eventNs !== null && recordNs < eventNs) add('event-out-of-order', at(ev.recordTime.entry), `The recordTime of ${ev.of}, ${ev.recordTime.value}, is ${spanText(eventNs - recordNs)} before its eventTime, ${ev.eventTime.value}, though an event is recorded after it takes place. ${BP}`, s);
    if (nowTime !== null) {
      for (const [field, ns, name] of [[ev.eventTime, eventNs, 'eventTime'], [ev.recordTime, recordNs, 'recordTime']]) {
        if (ns !== null && ns > nowTime.ns) add('future-event', at(field.entry), `The ${name} of ${ev.of}, ${field.value}, is ${spanText(ns - nowTime.ns)} after the moment given with --now, ${now}, so it names a time that has not come. ${BP}`, s);
      }
    }

    // The action, by type.
    const action = ev.action?.value ?? null;
    if (ev.kind === 'TransformationEvent' && ev.action) add('transformation-with-action', at(ev.action.entry), `${Ev} has an action${action ? ` (${cut(action, 20)})` : ''}, but the fields EPCIS gives a TransformationEvent hold no action, and its JSON schema does not allow one.`, s);
    else if (WITH_ACTION.includes(ev.kind)) {
      if (!ev.action) add('action-missing', ev, `${Ev} has no action; the JSON schema of ${ev.kind} requires one, ADD, OBSERVE or DELETE, to say how the event changes what it names.`, s);
      else if (action === null && !ev.action.invalid) add('action-missing', at(ev.action.entry), `The action of ${ev.of} is empty; it must be ADD, OBSERVE or DELETE.`, s);
      else if (action !== null && !ACTIONS.includes(action)) add('action-invalid', at(ev.action.entry), `The action of ${ev.of} is "${cut(action, 30)}"${ACTIONS.includes(action.toUpperCase()) ? `; write it in capitals, ${action.toUpperCase()}` : ''}. EPCIS allows only ADD, OBSERVE and DELETE, and no group may add another.`, s);
    }
    const act = ACTIONS.includes(action) ? action : null;

    // What: the objects each type must name.
    whatChecks(ev, Ev, act, add);

    // The quantities.
    for (const list of Object.values(ev.quantities)) {
      for (const q of list.values ?? []) {
        const Of = `${q.of[0].toUpperCase()}${q.of.slice(1)}`;
        if (q.quantity) {
          const v = readQuantityValue(q.quantity.raw);
          if (v.state === 'unreadable') add('quantity-invalid', at(q.quantity.entry), `The quantity of ${q.of}, ${cut(q.quantity.raw, 40)}, cannot be read as an exact number of at most 40 digits on each side of the point.`, s);
          else if (v.state !== 'positive') add('quantity-invalid', at(q.quantity.entry), `The quantity of ${q.of} is ${v.text}; EPCIS asks for a positive quantity, or none when it is not known.`, s);
          else if (!q.uom && !v.whole) add('quantity-invalid', at(q.quantity.entry), `The quantity of ${q.of} is ${v.text} with no uom; EPCIS reads a quantity with no unit of measure as a count, which must be a positive whole number. Add the uom of the measure, such as KGM.`, s);
        } else if (q.uom && !q.quantityInvalid) add('quantity-invalid', at(q.uom.entry), `${Of} has a uom, ${cut(q.uom.value, 10)}, but no quantity; EPCIS leaves the uom out when the quantity is.`, s);
        if (q.uom && !UOM.test(q.uom.value)) add('quantity-invalid', at(q.uom.entry), `The uom of ${q.of} is "${cut(q.uom.value, 20)}"; a unit of measure is the code of two or three capitals and digits of UN/CEFACT Recommendation 20, such as KGM or MTR.`, s);
      }
    }

    // Where and why.
    if (!ev.readPoint && !ev.bizLocation) add('where-missing', ev, `${Ev} has neither a readPoint nor a bizLocation, so no one can tell where it took place. ${BP}`, s);
    if (!ev.bizStep) add('why-missing', ev, `${Ev} has no bizStep; the CBV says that every event should carry one, so the business step it was part of is not known.`, s);
    if (ev.bizStep?.value) {
      const v = readVocab('bizStep', ev.bizStep.value);
      if (!v.known) add('biz-step-unknown', at(ev.bizStep.entry), `The bizStep of ${ev.of}, "${cut(ev.bizStep.value, 60)}", is not a business step of the CBV${hint(v.word, 'bizStep')}. A step of your own is a URI of your own domain.`, s);
    }
    const dispositions = [...(ev.disposition?.value ? [{ value: ev.disposition.value, entry: ev.disposition.entry, name: 'disposition' }] : []), ...ev.persistent.map((p) => ({ value: p.value, entry: p.node, name: 'persistentDisposition' }))];
    for (const d of dispositions) {
      const v = readVocab('disposition', d.value);
      if (v.deprecated) add('disposition-unknown', at(d.entry), `The ${d.name} of ${ev.of}, "${cut(d.value, 60)}", is a value the CBV deprecates${v.replacedBy ? `; use ${v.replacedBy}` : ', with no value in its place'}.`, s);
      else if (!v.known) add('disposition-unknown', at(d.entry), `The ${d.name} of ${ev.of}, "${cut(d.value, 60)}", is not a disposition of the CBV${hint(v.word, 'disposition')}. A disposition of your own is a URI of your own domain.`, s);
    }

    // The identifiers: their form, and the check digit of a Digital Link.
    for (const id of identifiersOf(ev)) checkIdentifier(id, ev, add);

    if (!ev.eventID && !ev.errorDeclaration) add('event-id-missing', ev, `${Ev} has no eventID, so a ledger cannot tell it apart from the same event sent again. ${BP}`, s);
  }

  // eventIDs written twice; an error declaration repeats the eventID of the event it corrects.
  const ids = new Map();
  for (const ev of events) {
    if (!ev.eventID?.value || ev.errorDeclaration) continue;
    const first = ids.get(ev.eventID.value);
    if (first) add('event-id-duplicate', at(ev.eventID.entry), `The eventID of ${ev.of}, ${cut(ev.eventID.value, 80)}, is also the eventID of event ${first.n} at line ${first.eventID.entry.line}; EPCIS asks for an eventID unique across all events but error declarations.`, ev.subject);
    else ids.set(ev.eventID.value, ev);
  }

  // The checks across events follow the EPCs of events with a time, error declarations left out.
  const timed = events.filter((ev) => times.get(ev) !== null && !ev.errorDeclaration);
  outOfOrder(timed, times, add);
  const ordered = timed.map((ev, i) => ({ ev, i })).sort((a, b) => compareTime(times.get(a.ev), times.get(b.ev)) || a.i - b.i).map((x) => x.ev);
  afterDelete(ordered, times, add);
  shippedBeforeReceived(ordered, times, add);
  twoParents(ordered, add);

  if (nowTime === null && events.length) notes.push('no --now was given, so future-event did not run');
  return { findings, notes, summary: summaryOf(document, events, times, now) };
}

// A type the file probably meant, for a message.
function nearType(type) {
  const lower = type.toLowerCase().replace(/[^a-z]/g, '');
  const near = EVENT_TYPES.find((t) => t.toLowerCase() === lower || t.toLowerCase() === `${lower}event`);
  return near ? ` Did you mean ${near}?` : '';
}

// A word of the CBV a value probably meant, for a message.
function hint(word, kind) {
  if (word === null) return '';
  const v = readVocab(kind, word.toLowerCase().replace(/[\s-]+/g, '_'));
  return v.known && !v.deprecated ? `; the CBV writes ${word.toLowerCase().replace(/[\s-]+/g, '_')} in lower case with underscores` : '';
}

const nonEmpty = (list) => Boolean(list?.values?.length);
const invalid = (list) => Boolean(list?.invalid);

// What each type of event must name.
function whatChecks(ev, Ev, act, add) {
  const s = ev.subject;
  const e = ev.epcs;
  const q = ev.quantities;
  if (ev.kind === 'ObjectEvent') {
    if (!nonEmpty(e.epcList) && !nonEmpty(q.quantityList) && !invalid(e.epcList) && !invalid(q.quantityList) && !(ev.hasSensors && ev.readPoint)) add('what-missing', at(e.epcList?.entry ?? q.quantityList?.entry ?? ev), `${Ev} names no object: its epcList and quantityList are missing or empty. EPCIS asks an ObjectEvent for one of them, unless it reports sensor data of the place in its readPoint.`, s);
  }
  if (ev.kind === 'AggregationEvent' || ev.kind === 'AssociationEvent') {
    if (!nonEmpty(e.childEPCs) && !nonEmpty(q.childQuantityList) && !invalid(e.childEPCs) && !invalid(q.childQuantityList) && act !== 'DELETE') add('what-missing', at(e.childEPCs?.entry ?? q.childQuantityList?.entry ?? ev), `${Ev} names no child: its childEPCs and childQuantityList are missing or empty. EPCIS allows that only when the action is DELETE and every child is taken out.`, s);
    if (!ev.parentID?.value && !ev.parentID?.invalid && (act === 'ADD' || act === 'DELETE')) add('what-missing', at(ev.parentID?.entry ?? ev.action.entry), `${Ev} has the action ${act} but no parentID; EPCIS asks for the parent whenever children are added or taken out, and lets only an OBSERVE leave it out.`, s);
  }
  if (ev.kind === 'TransactionEvent') {
    if (!ev.bizTransactions || (ev.bizTransactions.values && ev.bizTransactions.values.length === 0)) add('what-missing', at(ev.bizTransactions?.entry ?? ev), `${Ev} names no business transaction; a TransactionEvent exists to tie objects to one, so EPCIS asks for its bizTransactionList.`, s);
    if (!nonEmpty(e.epcList) && !nonEmpty(q.quantityList) && !invalid(e.epcList) && !invalid(q.quantityList) && act !== 'DELETE') add('what-missing', at(e.epcList?.entry ?? q.quantityList?.entry ?? ev), `${Ev} names no object: its epcList and quantityList are missing or empty. EPCIS allows that only when the action is DELETE and every object leaves the transaction.`, s);
  }
  if (ev.kind === 'TransformationEvent') {
    const lists = [e.inputEPCList, q.inputQuantityList, e.outputEPCList, q.outputQuantityList];
    if (lists.some(invalid)) return;
    const inputs = nonEmpty(e.inputEPCList) || nonEmpty(q.inputQuantityList);
    const outputs = nonEmpty(e.outputEPCList) || nonEmpty(q.outputQuantityList);
    const linked = Boolean(ev.transformationID?.value);
    if (linked ? !inputs && !outputs : !inputs || !outputs) {
      const lacks = !inputs && !outputs ? 'no input and no output' : !inputs ? 'no input' : 'no output';
      add('transformation-inputs-outputs-empty', at(lists.find((l) => l)?.entry ?? ev), `${Ev} has ${lacks}${linked ? ', though a TransformationEvent with a transformationID needs at least one of them' : ' and no transformationID; EPCIS asks such a TransformationEvent for at least one input and one output'}.`, s);
    }
  }
}

// Every identifier of an event with its place and what it names: the EPCs of its lists and its parent, the classes of
// its quantities, its locations and its sources and destinations.
function identifiersOf(ev) {
  const out = [];
  for (const [key, list] of Object.entries(ev.epcs)) for (const v of list.values ?? []) out.push({ value: v.value, entry: v.node, what: `an EPC of the ${key}` });
  if (ev.parentID?.value) out.push({ value: ev.parentID.value, entry: ev.parentID.entry, what: 'the parentID' });
  for (const [key, list] of Object.entries(ev.quantities)) for (const q of list.values ?? []) if (q.epcClass) out.push({ value: q.epcClass.value, entry: q.epcClass.entry, what: `the epcClass of a quantity of the ${key}` });
  for (const key of ['readPoint', 'bizLocation']) if (ev[key]?.id) out.push({ value: ev[key].id, entry: ev[key].idEntry, what: `the id of the ${key}` });
  for (const [list, name] of [[ev.sources, 'a source'], [ev.destinations, 'a destination']]) for (const x of list) if (x.value) out.push({ value: x.value, entry: x.entry, what: name });
  return out;
}

function checkIdentifier(id, ev, add) {
  const s = ev.subject;
  const shown = cut(id.value, 100);
  if (!isUri(id.value)) {
    add('field-invalid', at(id.entry), `${cap(id.what)} of ${ev.of}, "${shown}", is not a URI; EPCIS names objects, classes and places by URIs such as urn:epc:id:sgtin: or a GS1 Digital Link URI.`, s);
    return;
  }
  const r = readIdentifier(id.value);
  if (!r) return;
  if (r.problem) add('epc-uri-malformed', at(id.entry), `${cap(id.what)} of ${ev.of}, ${shown}, is ${r.scheme.startsWith('Digital Link') ? 'a GS1 Digital Link URI that' : `an ${r.scheme} URI that`} ${r.problem}.`, s);
  else if (r.check) add(`${r.check.kind}-check-digit-invalid`, at(id.entry), `The ${r.check.name} ${r.check.value} in ${id.what} of ${ev.of} ends with ${r.check.value.at(-1)}, but its check digit is ${r.check.expected} by the rule of the GS1 General Specifications, so the key names no product, unit or place.`, s);
}

const cap = (t) => `${t[0].toUpperCase()}${t.slice(1)}`;

// The instance-level EPCs an event names, with the list each is in.
function epcsOf(ev) {
  const out = [];
  for (const key of ['epcList', 'childEPCs', 'inputEPCList', 'outputEPCList']) for (const v of ev.epcs[key]?.values ?? []) out.push({ key: epcKey(v.value), text: v.value, entry: v.node, list: key });
  if (ev.parentID?.value) out.push({ key: epcKey(ev.parentID.value), text: ev.parentID.value, entry: ev.parentID.entry, list: 'parentID' });
  return out;
}

// An event listed after another event of the same EPC with a later eventTime.
function outOfOrder(timed, times, add) {
  const latest = new Map();
  for (const ev of timed) {
    const t = times.get(ev);
    let reported = false;
    for (const epc of epcsOf(ev)) {
      const before = latest.get(epc.key);
      if (!reported && before && t < times.get(before)) {
        add('event-out-of-order', at(ev.eventTime.entry), `${cap(ev.of)} is listed after event ${before.n}, which names the same EPC ${cut(epc.text, 80)}, but took place ${spanText(times.get(before) - t)} before it, so a ledger that keeps the order of the file shows its history out of order. ${BP}`, ev.subject);
        reported = true;
      }
      if (!before || times.get(before) < t) latest.set(epc.key, ev);
    }
  }
}

// Whether an event ends the EPCs of its epcList: an ObjectEvent with action DELETE, or a business step of
// decommissioning or destroying.
const deletes = (ev) => (ev.kind === 'ObjectEvent' && ev.action?.value === 'DELETE') || ['decommissioning', 'destroying'].includes(ev.bizStep?.value ? readVocab('bizStep', ev.bizStep.value).word : null);

// An EPC named by an event later than the event that ended it.
function afterDelete(ordered, times, add) {
  const ended = new Map();
  for (const ev of ordered) {
    const t = times.get(ev);
    const later = epcsOf(ev).filter((e) => ended.has(e.key) && times.get(ended.get(e.key)) < t);
    if (later.length) {
      const first = later[0];
      const by = ended.get(first.key);
      const how = by.kind === 'ObjectEvent' && by.action?.value === 'DELETE' ? 'an ObjectEvent with action DELETE, after which EPCIS says the EPC should not be seen again' : `an event of the business step ${readVocab('bizStep', by.bizStep.value).word}, after which the CBV says the object should not be the subject of events`;
      add('object-after-delete', at(first.entry), `${cap(ev.of)} names ${cut(first.text, 80)}${later.length > 1 ? ` and ${plural(later.length - 1, 'other EPC')}` : ''}, ${spanText(t - times.get(by))} after event ${by.n} ended it with ${how}.`, ev.subject);
    }
    if (deletes(ev)) for (const v of ev.epcs.epcList?.values ?? []) if (!ended.has(epcKey(v.value))) ended.set(epcKey(v.value), ev);
  }
}

// The place of an event, by the site of its bizLocation or else its readPoint.
const placeId = (ev) => ev.bizLocation?.id ?? ev.readPoint?.id ?? null;
const placeOf = (ev) => siteOf(placeId(ev));

// The place a shipping event ships from: its source of type location, or else its readPoint or bizLocation.
function shipFromId(ev) {
  const src = ev.sources.find((x) => x.value && x.type && LOCATION_TYPES.includes(x.type.toLowerCase()));
  return src?.value ?? ev.readPoint?.id ?? ev.bizLocation?.id ?? null;
}

const isStep = (ev, ...words) => Boolean(ev.bizStep?.value) && words.includes(readVocab('bizStep', ev.bizStep.value).word);

// The first event of a list in time order that is later than t, found by halving.
function firstAfter(list, times, t) {
  let lo = 0;
  let hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (times.get(list[mid]) > t) hi = mid;
    else lo = mid + 1;
  }
  return list[lo] ?? null;
}

// The key of the receipts of an EPC at a site: the two joined by a line end.
const receiptKey = (epc, site) => `${epc}\n${site}`;

// An EPC shipped from a place it never reached before, or received there only after it was shipped from there. The
// events are taken in groups of one eventTime, so that an event is compared only with events that took place before it.
function shippedBeforeReceived(ordered, times, add) {
  const receipts = new Map();
  for (const ev of ordered) {
    const site = placeOf(ev);
    if (site === null || !isStep(ev, 'receiving', 'arriving')) continue;
    for (const e of epcsOf(ev)) {
      const k = receiptKey(e.key, site);
      if (!receipts.has(k)) receipts.set(k, []);
      receipts.get(k).push(ev);
    }
  }
  const seen = new Map();
  for (let i = 0; i < ordered.length;) {
    const t = times.get(ordered[i]);
    let j = i;
    while (j < ordered.length && times.get(ordered[j]) === t) j += 1;
    const group = ordered.slice(i, j);
    for (const ev of group) {
      const fromId = isStep(ev, 'shipping') ? shipFromId(ev) : null;
      if (fromId === null) continue;
      const from = siteOf(fromId);
      for (const e of epcsOf(ev)) {
        const state = seen.get(e.key);
        if (state?.sites.has(from)) continue;
        if (state) {
          add('shipped-before-received', at(e.entry), `${cap(ev.of)} ships ${cut(e.text, 80)} from ${cut(fromId, 80)}, but its earlier events place it elsewhere, last at ${cut(placeId(state.last), 80)} in event ${state.last.n}, and never there. ${BP}`, ev.subject);
          break;
        }
        const received = firstAfter(receipts.get(receiptKey(e.key, from)) ?? [], times, t);
        if (received) {
          add('shipped-before-received', at(e.entry), `${cap(ev.of)} ships ${cut(e.text, 80)} from ${cut(fromId, 80)} ${spanText(times.get(received) - t)} before event ${received.n} receives it there. ${BP}`, ev.subject);
          break;
        }
      }
    }
    for (const ev of group) {
      const site = placeOf(ev);
      if (site === null) continue;
      for (const e of epcsOf(ev)) {
        if (!seen.has(e.key)) seen.set(e.key, { sites: new Set(), last: ev });
        const state = seen.get(e.key);
        state.sites.add(site);
        state.last = ev;
      }
    }
    i = j;
  }
}

// A child put in a second parent while an earlier AggregationEvent holds it in another. Each parent keeps the set of its
// children, so a DELETE that names no child takes them all out at once.
function twoParents(ordered, add) {
  const parentOf = new Map();
  const childrenOf = new Map();
  const leave = (child) => {
    const held = parentOf.get(child);
    if (held) childrenOf.get(held.parent).delete(child);
    parentOf.delete(child);
  };
  for (const ev of ordered) {
    if (ev.kind !== 'AggregationEvent' || !ev.parentID?.value) continue;
    const act = ev.action?.value;
    const parent = epcKey(ev.parentID.value);
    const children = (ev.epcs.childEPCs?.values ?? []).map((v) => ({ key: epcKey(v.value), text: v.value, entry: v.node }));
    if (act === 'DELETE') {
      const out = children.length ? children.map((c) => c.key) : [...(childrenOf.get(parent) ?? [])];
      for (const k of out) if (parentOf.get(k)?.parent === parent) leave(k);
      continue;
    }
    if (act !== 'ADD' && act !== 'OBSERVE') continue;
    for (const c of children) {
      const held = parentOf.get(c.key);
      if (held && held.parent !== parent) add('aggregation-child-in-two-parents', at(c.entry), `${cap(ev.of)} ${act === 'ADD' ? 'adds' : 'observes'} ${cut(c.text, 80)} in the parent ${cut(ev.parentID.value, 80)}, but event ${held.ev.n} put it in ${cut(held.text, 80)} and no event took it out. ${BP}`, ev.subject);
      if (act === 'ADD' || !held) {
        leave(c.key);
        parentOf.set(c.key, { parent, text: ev.parentID.value, ev });
        if (!childrenOf.has(parent)) childrenOf.set(parent, new Set());
        childrenOf.get(parent).add(c.key);
      }
    }
  }
}

// What the file says, as the report shows it.
function summaryOf(document, events, times, now) {
  const byType = new Map();
  for (const ev of events) {
    const k = ev.kind === null || ev.kind === 'unknown' || ev.kind === 'extension' ? 'other' : ev.kind;
    if (!byType.has(k)) byType.set(k, { type: k, events: 0, ADD: 0, OBSERVE: 0, DELETE: 0, none: 0 });
    const row = byType.get(k);
    row.events += 1;
    const a = ev.action?.value;
    if (ACTIONS.includes(a)) row[a] += 1;
    else row.none += 1;
  }
  const types = [...EVENT_TYPES, 'other'].filter((t) => byType.has(t)).map((t) => byType.get(t));
  const epcs = new Set();
  const classes = new Set();
  const places = new Set();
  for (const ev of events) {
    for (const e of epcsOf(ev)) epcs.add(e.key);
    for (const list of Object.values(ev.quantities)) for (const q of list.values ?? []) if (q.epcClass) classes.add(epcKey(q.epcClass.value));
    for (const key of ['readPoint', 'bizLocation']) if (ev[key]?.id) places.add(siteOf(ev[key].id));
  }
  let first = null;
  let last = null;
  for (const ev of events) {
    const t = times.get(ev);
    if (t === null || t === undefined) continue;
    if (first === null || t < times.get(first)) first = ev;
    if (last === null || t > times.get(last)) last = ev;
  }
  return {
    document,
    events: events.length,
    types,
    epcs: epcs.size,
    classes: classes.size,
    places: places.size,
    first: first ? first.eventTime.value : null,
    last: last ? last.eventTime.value : null,
    now
  };
}

