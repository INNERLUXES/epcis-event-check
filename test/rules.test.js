import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BEST, RULES, analyze, atOrAbove, decide, epcKey, readQuantityValue, ruleById, siteOf } from '../src/index.js';
import { NOW, aggregationEvent, associationEvent, at, doc, event, findingsOf, idsOf, ioEvent, lgtin, lineOf, objectEvent, ofCheck, sgln, sgtin, sscc, text, transactionEvent, uuid } from './helpers.js';

const one = (p, id, options) => {
  const f = ofCheck(p, id, options);
  assert.equal(f.length, 1, `${id}: ${JSON.stringify(findingsOf(p, options).map((x) => x.id))}`);
  return f[0];
};
const none = (p, id, options) => assert.deepEqual(ofCheck(p, id, options), [], id);

test('the checks: thirty-two with unique ids, a level, a kind, what they look at and what to change', () => {
  assert.equal(RULES.length, 32);
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
  for (const r of RULES) {
    assert.ok(['error', 'warning', 'info'].includes(r.severity), r.id);
    assert.ok(['documented', 'best practice', 'input'].includes(r.kind), r.id);
    assert.ok(r.summary.length > 20 && r.fix.endsWith('.'), r.id);
  }
  assert.deepEqual(RULES.filter((r) => r.kind === 'documented').length, 20);
  assert.deepEqual(RULES.filter((r) => r.kind === 'best practice').map((r) => r.id), ['where-missing', 'event-id-missing', 'event-out-of-order', 'future-event', 'shipped-before-received', 'aggregation-child-in-two-parents']);
  assert.equal(ruleById('nothing'), undefined);
  assert.ok(atOrAbove('error', 'warning') && !atOrAbove('info', 'warning'));
});

test('decide: a pass and a fail at each level, with the counts', () => {
  assert.deepEqual(decide({ error: 0, warning: 0, info: 0 }, 'error'), { pass: true, failOn: 'error', text: 'PASS - no finding at or above error' });
  assert.equal(decide({ error: 0, warning: 2, info: 0 }, 'error').text, 'PASS - no finding at or above error (2 warning)');
  assert.equal(decide({ error: 0, warning: 1, info: 0 }, 'warning').text, 'FAIL - 1 finding at or above warning (1 warning)');
  assert.equal(decide({ error: 2, warning: 1, info: 1 }, 'info').text, 'FAIL - 4 findings at or above info (2 error, 1 warning, 1 info)');
});

test('a clean event of each of the five types passes every check, with and without --now', () => {
  for (const make of [objectEvent, aggregationEvent, transactionEvent, ioEvent, associationEvent]) {
    assert.deepEqual(idsOf(doc([make()])), [], make().type);
    assert.deepEqual(idsOf(doc([make()]), { now: NOW }), [], make().type);
  }
  assert.deepEqual(analyze(null), { findings: [], notes: [], summary: null });
});

test('event-type-unknown: a word that is not a type, a near miss named, and a URI of an extension only noted', () => {
  const f = one([objectEvent({ type: 'Object' })], 'event-type-unknown');
  assert.match(f.message, /^Event 1 has the type "Object", which is not one of the five event types of EPCIS 2\.0 \(ObjectEvent, AggregationEvent, TransactionEvent, TransformationEvent and AssociationEvent\), so its fields were not checked against a type\. Did you mean ObjectEvent\? The type of an extension is a URI\.$/);
  assert.match(one([objectEvent({ type: 'objectevent' })], 'event-type-unknown').message, /Did you mean ObjectEvent\?/);
  assert.doesNotMatch(one([objectEvent({ type: 'QuantityEvent' })], 'event-type-unknown').message, /Did you mean/);
  none([objectEvent()], 'event-type-unknown');
  const ext = findingsOf([objectEvent({ type: 'https://example.com/ColdChainEvent' })]);
  assert.deepEqual(ext, []);
  const { notes } = analyze({ document: { form: 'list' }, events: [{ n: 1, subject: 'event 1', kind: 'extension', type: 'https://example.com/X', of: 'event 1', epcs: {}, quantities: {}, sources: [], destinations: [], persistent: [], eventTime: null, eventTimeZoneOffset: null }] });
  assert.ok(notes.includes('event 1 has the type https://example.com/X, a type of an extension named by a URI; only its common fields were checked'));
});

test('event-time-missing and event-time-invalid: no eventTime, an empty one, and times that are not times', () => {
  const p = [objectEvent({ eventTime: undefined })];
  const f = one(p, 'event-time-missing');
  assert.match(f.message, /^Event 1 \(ObjectEvent\) has no eventTime; EPCIS calls eventTime mandatory in every event/);
  assert.equal(f.line, lineOf(text(p), '"type"') - 1, 'at the event');
  assert.match(one([objectEvent({ eventTime: '' })], 'event-time-missing').message, /The eventTime of event 1 \(ObjectEvent\) is empty/);
  none([objectEvent({ eventTime: 7 })], 'event-time-missing');
  const bad = one([objectEvent({ eventTime: '2101-03-01T08:00:00' })], 'event-time-invalid');
  assert.match(bad.message, /The eventTime of event 1 \(ObjectEvent\), "2101-03-01T08:00:00", has no time zone, so the moment it names is not known; end it with Z or an offset such as \+01:00\. EPCIS types it as xsd:dateTimeStamp/);
  assert.match(one([objectEvent({ recordTime: '2101-02-30T08:00:00Z' })], 'event-time-invalid').message, /The recordTime of event 1 \(ObjectEvent\), "2101-02-30T08:00:00Z", has the day 30/);
  assert.match(one([objectEvent({ errorDeclaration: { declarationTime: 'yesterday' } })], 'event-time-invalid').message, /The declarationTime of the errorDeclaration of event 1 \(ObjectEvent\), "yesterday", is not a date and time written/);
  none([objectEvent({ eventTime: '2101-03-01T07:00:00Z', recordTime: '2101-03-01T07:00:00.000001Z' })], 'event-time-invalid');
});

test('timezone-offset-missing and timezone-offset-invalid: the offset is there and of its form, with near misses', () => {
  assert.match(one([objectEvent({ eventTimeZoneOffset: undefined })], 'timezone-offset-missing').message, /^Event 1 \(ObjectEvent\) has no eventTimeZoneOffset, which the JSON schema of EPCIS 2\.0 requires/);
  assert.match(one([objectEvent({ eventTimeZoneOffset: '' })], 'timezone-offset-missing').message, /is empty; the JSON schema of EPCIS 2\.0 requires it/);
  none([objectEvent({ eventTimeZoneOffset: 1 })], 'timezone-offset-missing');
  assert.match(one([objectEvent({ eventTimeZoneOffset: '+14:30' })], 'timezone-offset-invalid').message, /"\+14:30", has 14 hours with minutes other than 00/);
  assert.match(one([objectEvent({ eventTimeZoneOffset: 'Z' })], 'timezone-offset-invalid').message, /"Z", is not written \+hh:mm or -hh:mm/);
  for (const ok of ['+14:00', '-14:00', '+00:00', '+05:45']) none([objectEvent({ eventTimeZoneOffset: ok })], 'timezone-offset-invalid');
  none([objectEvent({ eventTime: '2101-03-01T07:00:00Z', eventTimeZoneOffset: '+09:00' })], 'timezone-offset-invalid', 'EPCIS lets the zone of the time and the offset differ');
});

test('action-missing, action-invalid and transformation-with-action, by type', () => {
  for (const make of [objectEvent, aggregationEvent, transactionEvent, associationEvent]) {
    const f = one([make({ action: undefined })], 'action-missing');
    assert.match(f.message, /has no action; the JSON schema of \w+ requires one, ADD, OBSERVE or DELETE/);
  }
  assert.match(one([objectEvent({ action: ' ' })], 'action-missing').message, /The action of event 1 \(ObjectEvent\) is empty/);
  none([objectEvent({ action: 3 })], 'action-missing');
  assert.match(one([objectEvent({ action: 'observe' })], 'action-invalid').message, /The action of event 1 \(ObjectEvent\) is "observe"; write it in capitals, OBSERVE\. EPCIS allows only ADD, OBSERVE and DELETE/);
  assert.doesNotMatch(one([objectEvent({ action: 'UPDATE' })], 'action-invalid').message, /write it in capitals/);
  for (const ok of ['ADD', 'OBSERVE', 'DELETE']) none([objectEvent({ action: ok })], 'action-invalid');
  const t = one([ioEvent({ action: 'ADD' })], 'transformation-with-action');
  assert.match(t.message, /^Event 1 \(TransformationEvent\) has an action \(ADD\), but the fields EPCIS gives a TransformationEvent hold no action/);
  assert.match(one([ioEvent({ action: 5 })], 'transformation-with-action').message, /has an action, but/);
  none([ioEvent()], 'transformation-with-action');
  none([ioEvent()], 'action-missing');
  none([ioEvent({ action: 'ADD' })], 'field-unknown');
});

test('what-missing: the objects, the children, the parent and the business transactions each type must name', () => {
  assert.match(one([objectEvent({ epcList: [] })], 'what-missing').message, /^Event 1 \(ObjectEvent\) names no object: its epcList and quantityList are missing or empty/);
  assert.match(one([objectEvent({ epcList: undefined })], 'what-missing').message, /names no object/);
  none([objectEvent({ epcList: undefined, quantityList: [{ epcClass: lgtin(), quantity: 2 }] })], 'what-missing');
  none([objectEvent({ epcList: undefined, sensorElementList: [{ sensorReport: [{ type: 'Temperature', value: 4 }] }] })], 'what-missing');
  one([objectEvent({ epcList: undefined, sensorElementList: [], readPoint: undefined, bizLocation: { id: sgln() } })], 'what-missing');
  none([objectEvent({ epcList: 'x' })], 'what-missing');
  for (const make of [aggregationEvent, associationEvent]) {
    assert.match(one([make({ childEPCs: [] })], 'what-missing').message, /names no child/);
    none([make({ childEPCs: [], action: 'DELETE' })], 'what-missing');
    none([make({ childEPCs: undefined, childQuantityList: [{ epcClass: lgtin(), quantity: 1 }] })], 'what-missing');
    assert.match(one([make({ parentID: undefined })], 'what-missing').message, /has the action ADD but no parentID/);
    assert.match(one([make({ parentID: undefined, action: 'DELETE' })], 'what-missing').message, /has the action DELETE but no parentID/);
    none([make({ parentID: undefined, action: 'OBSERVE' })], 'what-missing');
    none([make({ parentID: 7 })], 'what-missing');
  }
  assert.match(one([transactionEvent({ bizTransactionList: undefined })], 'what-missing').message, /names no business transaction/);
  one([transactionEvent({ bizTransactionList: [] })], 'what-missing');
  none([transactionEvent({ bizTransactionList: 'x' })], 'what-missing');
  assert.match(one([transactionEvent({ epcList: [] })], 'what-missing').message, /names no object/);
  none([transactionEvent({ epcList: [], action: 'DELETE' })], 'what-missing');
});

test('transformation-inputs-outputs-empty: inputs and outputs with and without a transformationID', () => {
  assert.match(one([ioEvent({ outputEPCList: undefined })], 'transformation-inputs-outputs-empty').message, /^Event 1 \(TransformationEvent\) has no output and no transformationID; EPCIS asks such a TransformationEvent for at least one input and one output\.$/);
  assert.match(one([ioEvent({ inputEPCList: [] })], 'transformation-inputs-outputs-empty').message, /has no input and no transformationID/);
  assert.match(one([ioEvent({ inputEPCList: undefined, outputEPCList: undefined, transformationID: 'urn:uuid:7' })], 'transformation-inputs-outputs-empty').message, /has no input and no output, though a TransformationEvent with a transformationID needs at least one of them/);
  none([ioEvent({ outputEPCList: undefined, transformationID: 'urn:uuid:7' })], 'transformation-inputs-outputs-empty');
  none([ioEvent({ inputEPCList: undefined, inputQuantityList: [{ epcClass: lgtin(), quantity: 2, uom: 'KGM' }] })], 'transformation-inputs-outputs-empty');
  none([ioEvent({ inputEPCList: 'x' })], 'transformation-inputs-outputs-empty');
  assert.equal(one([ioEvent({ inputEPCList: undefined, outputEPCList: undefined })], 'transformation-inputs-outputs-empty').line, 2, 'an event with no list is reported at the event');
});

test('quantity-invalid: positive counts and measures, a unit with no quantity and the form of a unit', () => {
  const q = (quantity, uom) => [objectEvent({ epcList: undefined, quantityList: [{ epcClass: lgtin(), ...(quantity === undefined ? {} : { quantity }), ...(uom === undefined ? {} : { uom }) }] })];
  none(q(12), 'quantity-invalid');
  none(q(2.5, 'KGM'), 'quantity-invalid');
  none(q(undefined), 'quantity-invalid');
  none(q(1e2), 'quantity-invalid');
  assert.match(one(q(0), 'quantity-invalid').message, /The quantity of item 1 of the quantityList of event 1 \(ObjectEvent\) is 0; EPCIS asks for a positive quantity/);
  assert.match(one(q(-3, 'KGM'), 'quantity-invalid').message, /is -3; EPCIS asks for a positive quantity/);
  assert.match(one(q(2.5), 'quantity-invalid').message, /is 2\.5 with no uom; EPCIS reads a quantity with no unit of measure as a count/);
  assert.match(one(q(undefined, 'KGM'), 'quantity-invalid').message, /^Item 1 of the quantityList of event 1 \(ObjectEvent\) has a uom, KGM, but no quantity/);
  assert.match(one(q(2, 'kg'), 'quantity-invalid').message, /The uom of item 1 .* is "kg"; a unit of measure is the code of two or three capitals and digits/);
  none(q('2', 'KGM'), 'quantity-invalid', 'a quantity of the wrong type is field-invalid only');
  assert.match(one('[{"type":"ObjectEvent","eventID":"urn:x:1","eventTime":"2101-03-01T07:00:00Z","eventTimeZoneOffset":"+00:00","action":"OBSERVE","bizStep":"inspecting","readPoint":{"id":"urn:x:p"},"quantityList":[{"epcClass":"urn:x:c","quantity":1e999}]}]', 'quantity-invalid').message, /cannot be read as an exact number/);
});

test('readQuantityValue: exact values, exponents and limits', () => {
  assert.deepEqual(readQuantityValue('12'), { state: 'positive', whole: true, text: '12' });
  assert.deepEqual(readQuantityValue('2.50'), { state: 'positive', whole: false, text: '2.5' });
  assert.deepEqual(readQuantityValue('1.5e1'), { state: 'positive', whole: true, text: '15' });
  assert.deepEqual(readQuantityValue('15E-1'), { state: 'positive', whole: false, text: '1.5' });
  assert.deepEqual(readQuantityValue('1e40'), { state: 'positive', whole: true, text: `1${'0'.repeat(40)}` });
  assert.deepEqual(readQuantityValue('0.0'), { state: 'zero', whole: true, text: '0' });
  assert.deepEqual(readQuantityValue('-0.5'), { state: 'negative', whole: false, text: '-0.5' });
  assert.equal(readQuantityValue('1e41').state, 'unreadable');
  assert.equal(readQuantityValue(`1${'0'.repeat(41)}`).state, 'unreadable');
  assert.equal(readQuantityValue('abc').state, 'unreadable');
});

test('where-missing and why-missing: a place and a business step, with near misses', () => {
  assert.match(one([objectEvent({ readPoint: undefined })], 'where-missing').message, new RegExp(`^Event 1 \\(ObjectEvent\\) has neither a readPoint nor a bizLocation, so no one can tell where it took place\\. This is ${BEST}\\.$`));
  none([objectEvent({ readPoint: undefined, bizLocation: { id: sgln() } })], 'where-missing');
  none([objectEvent({ readPoint: 'x' })], 'where-missing');
  assert.match(one([objectEvent({ bizStep: undefined })], 'why-missing').message, /^Event 1 \(ObjectEvent\) has no bizStep; the CBV says that every event should carry one/);
  none([objectEvent({ bizStep: '' })], 'why-missing');
});

test('biz-step-unknown and disposition-unknown: the words of the CBV, its prefixes, URIs of another vocabulary and deprecated values', () => {
  assert.match(one([objectEvent({ bizStep: 'Shipping' })], 'biz-step-unknown').message, /"Shipping", is not a business step of the CBV; the CBV writes shipping in lower case with underscores/);
  assert.match(one([objectEvent({ bizStep: 'cycle-counting' })], 'biz-step-unknown').message, /the CBV writes cycle_counting/);
  assert.doesNotMatch(one([objectEvent({ bizStep: 'shipped' })], 'biz-step-unknown').message, /the CBV writes/);
  one([objectEvent({ bizStep: 'urn:epcglobal:cbv:bizstep:shipped' })], 'biz-step-unknown');
  for (const ok of ['shipping', 'urn:epcglobal:cbv:bizstep:shipping', 'https://ref.gs1.org/cbv/BizStep-shipping', 'https://example.com/steps/blending']) none([objectEvent({ bizStep: ok })], 'biz-step-unknown');
  assert.match(one([objectEvent({ disposition: 'non_sellable_expired' })], 'disposition-unknown').message, /is a value the CBV deprecates; use expired\./);
  assert.match(one([objectEvent({ disposition: 'no_pedigree_match' })], 'disposition-unknown').message, /deprecates, with no value in its place\./);
  assert.match(one([objectEvent({ disposition: 'In_Transit' })], 'disposition-unknown').message, /is not a disposition of the CBV; the CBV writes in_transit/);
  assert.match(one([objectEvent({ persistentDisposition: { set: ['quarantined'] } })], 'disposition-unknown').message, /The persistentDisposition of event 1 \(ObjectEvent\), "quarantined", is not a disposition of the CBV\. A disposition of your own/);
  for (const ok of ['in_transit', 'urn:epcglobal:cbv:disp:in_transit', 'https://ref.gs1.org/cbv/Disp-damaged', 'https://example.com/disp/quarantined']) none([objectEvent({ disposition: ok })], 'disposition-unknown');
});

test('field-invalid, epc-uri-malformed and the check digits: every identifier of an event, in every place', () => {
  assert.match(one([objectEvent({ epcList: ['9521234.012345.1'] })], 'field-invalid').message, /^An EPC of the epcList of event 1 \(ObjectEvent\), "9521234\.012345\.1", is not a URI; EPCIS names objects/);
  const bad = 'urn:epc:id:sgtin:9521234.01234.1';
  for (const [p, where] of [[objectEvent({ epcList: [bad] }), 'An EPC of the epcList'], [aggregationEvent({ parentID: bad }), 'The parentID'], [objectEvent({ epcList: undefined, quantityList: [{ epcClass: 'urn:epc:class:lgtin:9521234.01234.L', quantity: 1 }] }), 'The epcClass of a quantity of the quantityList'], [objectEvent({ readPoint: { id: 'urn:epc:id:sgln:9521234.0001.0' } }), 'The id of the readPoint'], [objectEvent({ sourceList: [{ type: 'location', source: 'urn:epc:id:sgln:9521234.0001.0' }] }), 'A source'], [objectEvent({ destinationList: [{ type: 'location', destination: 'urn:epc:id:sgln:9521234.0001.0' }] }), 'A destination']]) {
    assert.match(one([p], 'epc-uri-malformed').message, new RegExp(`^${where} of event 1 \\(\\w+\\), urn:epc:\\S+, is an \\w+ URI that has`), where);
  }
  assert.match(one([objectEvent({ epcList: ['https://id.gs1.org/01/123'] })], 'epc-uri-malformed').message, /is a GS1 Digital Link URI that has a GTIN of "123"/);
  assert.match(one([objectEvent({ epcList: ['https://id.gs1.org/01/09521234123457/21/7'] })], 'gtin-check-digit-invalid').message, /^The GTIN 09521234123457 in an EPC of the epcList of event 1 \(ObjectEvent\) ends with 7, but its check digit is 3 by the rule of the GS1 General Specifications/);
  one([objectEvent({ epcList: ['https://id.gs1.org/00/095212340000000010'] })], 'sscc-check-digit-invalid');
  one([objectEvent({ readPoint: { id: 'https://id.gs1.org/414/9521234000019' } })], 'gln-check-digit-invalid');
  for (const ok of ['https://id.gs1.org/01/09521234123453/21/7', 'https://id.gs1.org/00/095212340000000013', 'urn:epc:id:giai:9521234.1', 'https://example.com/7']) assert.deepEqual(idsOf([objectEvent({ epcList: [ok] })]), [], ok);
  none([objectEvent({ readPoint: { id: 'https://id.gs1.org/414/9521234000013' } })], 'gln-check-digit-invalid');
});

test('event-id-duplicate and event-id-missing: eventIDs written twice or not at all, and error declarations left out', () => {
  const f = one([objectEvent({}, 1), objectEvent({}, 1)], 'event-id-duplicate');
  assert.match(f.message, /^The eventID of event 2 \(ObjectEvent\), urn:uuid:00000000-0000-4000-8000-000000000001, is also the eventID of event 1 at line \d+; EPCIS asks for an eventID unique across all events but error declarations\.$/);
  none([objectEvent({}, 1), objectEvent({}, 2)], 'event-id-duplicate');
  none([objectEvent({}, 1), objectEvent({ errorDeclaration: { declarationTime: '2101-03-02T08:00:00Z' } }, 1)], 'event-id-duplicate');
  assert.equal(ofCheck([objectEvent({}, 1), objectEvent({}, 1), objectEvent({}, 1)], 'event-id-duplicate').length, 2);
  assert.match(one([objectEvent({ eventID: undefined })], 'event-id-missing').message, /^Event 1 \(ObjectEvent\) has no eventID, so a ledger cannot tell it apart from the same event sent again\./);
  none([objectEvent({ eventID: undefined, errorDeclaration: { declarationTime: '2101-03-02T08:00:00Z' } })], 'event-id-missing');
  none([objectEvent({ eventID: '' })], 'event-id-missing');
});

test('event-out-of-order: a recordTime before its eventTime, and events of one EPC listed out of time order', () => {
  assert.match(one([objectEvent({ recordTime: at(7, 59) })], 'event-out-of-order').message, /^The recordTime of event 1 \(ObjectEvent\), 2101-03-01T07:59:00\.000\+01:00, is 60 seconds \(1 minute\) before its eventTime/);
  none([objectEvent({ recordTime: at(8) })], 'event-out-of-order');
  const p = [objectEvent({ eventTime: at(9) }, 1), objectEvent({ eventTime: at(8) }, 2)];
  assert.match(one(p, 'event-out-of-order').message, /^Event 2 \(ObjectEvent\) is listed after event 1, which names the same EPC urn:epc:id:sgtin:9521234\.012345\.1001, but took place 3,600 seconds \(1 hour\) before it/);
  none([objectEvent({ eventTime: at(8) }, 1), objectEvent({ eventTime: at(8) }, 2)], 'event-out-of-order');
  none([objectEvent({ eventTime: at(9) }, 1), objectEvent({ eventTime: at(8), epcList: [sgtin('2')] }, 2)], 'event-out-of-order');
  const dl = [objectEvent({ eventTime: at(9) }, 1), objectEvent({ eventTime: at(8), epcList: ['https://id.gs1.org/01/09521234123453/21/1001'] }, 2)];
  one(dl, 'event-out-of-order');
  none([objectEvent({ eventTime: at(9) }, 1), objectEvent({ eventTime: at(8), errorDeclaration: { declarationTime: at(10) } }, 2)], 'event-out-of-order');
});

test('future-event: only with --now, for the eventTime and the recordTime, with the moment itself not reported', () => {
  const p = [objectEvent({ eventTime: '2101-03-10T13:00:00.000+01:00' })];
  none(p, 'future-event');
  none(p, 'future-event', { now: NOW });
  const f = one([objectEvent({ eventTime: '2101-03-10T13:00:01.000+01:00' })], 'future-event', { now: NOW });
  assert.match(f.message, /^The eventTime of event 1 \(ObjectEvent\), 2101-03-10T13:00:01\.000\+01:00, is 1 second after the moment given with --now, 2101-03-10T12:00:00Z/);
  one([objectEvent({ recordTime: '2101-03-11T08:00:00Z' })], 'future-event', { now: NOW });
  assert.deepEqual(analyze({ document: { form: 'list' }, events: [] }).notes, [], 'no note of --now for a file with no event');
});

test('object-after-delete: an EPC after an ObjectEvent DELETE, a decommissioning or a destroying, and the near misses', () => {
  const del = (over = {}) => objectEvent({ eventTime: at(9), action: 'DELETE', bizStep: 'decommissioning', ...over }, 2);
  const f = one([objectEvent({}, 1), del(), objectEvent({ eventTime: at(10) }, 3)], 'object-after-delete');
  assert.match(f.message, /^Event 3 \(ObjectEvent\) names urn:epc:id:sgtin:9521234\.012345\.1001, 3,600 seconds \(1 hour\) after event 2 ended it with an ObjectEvent with action DELETE, after which EPCIS says the EPC should not be seen again\.$/);
  const destroyed = one([objectEvent({ eventTime: at(9), bizStep: 'destroying' }, 2), aggregationEvent({ eventTime: at(10), parentID: sscc(), childEPCs: [sgtin(), sgtin('2')] }, 3)], 'object-after-delete');
  assert.match(destroyed.message, /after event 1 ended it with an event of the business step destroying, after which the CBV says the object should not be the subject of events/);
  one([objectEvent({ eventTime: at(9), bizStep: 'urn:epcglobal:cbv:bizstep:decommissioning' }, 2), objectEvent({ eventTime: at(10), epcList: [sgtin(), sgtin('2')] }, 3)], 'object-after-delete');
  const two = one([objectEvent({ eventTime: at(9), action: 'DELETE', epcList: [sgtin('1'), sgtin('2')] }, 2), objectEvent({ eventTime: at(10), epcList: [sgtin('1'), sgtin('2')] }, 3)], 'object-after-delete');
  assert.match(two.message, /names urn:epc:id:sgtin:9521234\.012345\.1 and 1 other EPC, /);
  none([del(), objectEvent({ eventTime: at(9) }, 3)], 'object-after-delete', 'at the same moment is not after');
  none([del(), objectEvent({ eventTime: at(10), epcList: [sgtin('2')] }, 3)], 'object-after-delete');
  none([aggregationEvent({ eventTime: at(9), action: 'DELETE' }, 2), objectEvent({ eventTime: at(10) }, 3)], 'object-after-delete', 'an AggregationEvent DELETE ends the aggregation, not the objects');
  none([del(), objectEvent({ eventTime: at(10), errorDeclaration: { declarationTime: at(11) } }, 3)], 'object-after-delete');
  one([objectEvent({ eventTime: at(10) }, 3), del()], 'object-after-delete');
});

test('shipped-before-received: shipped from a place never reached, received there only later, and the near misses', () => {
  const pack = aggregationEvent({ eventTime: at(8), bizLocation: { id: sgln('00001') } }, 1);
  const ship = (from, over = {}) => objectEvent({ eventTime: at(10), epcList: [sscc()], bizStep: 'shipping', readPoint: { id: from }, ...over }, 3);
  none([pack, ship(sgln('00001', '1'))], 'shipped-before-received', 'the dock of the same site');
  const f = one([pack, objectEvent({ eventTime: at(9), epcList: [sscc()], bizStep: 'receiving', readPoint: { id: sgln('00002') } }, 2), ship(sgln('00003'))], 'shipped-before-received');
  assert.match(f.message, /^Event 3 \(ObjectEvent\) ships urn:epc:id:sscc:9521234\.0000000001 from urn:epc:id:sgln:9521234\.00003\.0, but its earlier events place it elsewhere, last at urn:epc:id:sgln:9521234\.00002\.0 in event 2, and never there\./);
  none([pack, ship(sgln('00003'), { sourceList: [{ type: 'location', source: sgln('00001') }] })], 'shipped-before-received', 'the source of the type location is the place it ships from');
  one([pack, ship(sgln('00001'), { sourceList: [{ type: 'urn:epcglobal:cbv:sdt:location', source: sgln('00004') }] })], 'shipped-before-received');
  none([pack, ship(sgln('00001'), { sourceList: [{ type: 'owning_party', source: 'urn:epc:id:pgln:9521234.00004' }] })], 'shipped-before-received');
  none([pack, ship('https://id.gs1.org/414/9521234000013')], 'shipped-before-received', 'the same site written as a Digital Link');
  const later = one([ship(sgln('00005')), objectEvent({ eventTime: at(11), epcList: [sscc()], bizStep: 'receiving', readPoint: { id: sgln('00005') } }, 4)], 'shipped-before-received');
  assert.match(later.message, /ships urn:epc:id:sscc:9521234\.0000000001 from urn:epc:id:sgln:9521234\.00005\.0 3,600 seconds \(1 hour\) before event 2 receives it there\./);
  none([ship(sgln('00005')), objectEvent({ eventTime: at(10), epcList: [sscc()], bizStep: 'arriving', readPoint: { id: sgln('00005') } }, 4)], 'shipped-before-received', 'received at the same moment');
  none([ship(sgln('00005')), objectEvent({ eventTime: at(11), epcList: [sscc()], bizStep: 'receiving', readPoint: { id: sgln('00006') } }, 4)], 'shipped-before-received');
  none([ship(sgln('00005'))], 'shipped-before-received', 'no history at all');
  none([pack, ship(sgln('00003'), { readPoint: undefined })], 'shipped-before-received', 'no place to ship from');
  none([pack, objectEvent({ eventTime: at(10), epcList: [sscc()], bizStep: 'inspecting', readPoint: { id: sgln('00003') } }, 3)], 'shipped-before-received');
  none([objectEvent({ eventTime: at(10), epcList: [sscc()], readPoint: { id: sgln('00001') } }, 1), ship(sgln('00003'), { eventTime: at(10) })], 'shipped-before-received', 'an event at the same moment is not earlier');
});

test('aggregation-child-in-two-parents: a child added to or observed in a second parent, and taken out first', () => {
  const add = (parent, n, over = {}) => aggregationEvent({ eventTime: at(8 + n), parentID: sscc(parent), ...over }, n);
  const f = one([add('0000000001', 1), add('0000000002', 2)], 'aggregation-child-in-two-parents');
  assert.match(f.message, /^Event 2 \(AggregationEvent\) adds urn:epc:id:sgtin:9521234\.012345\.1001 in the parent urn:epc:id:sscc:9521234\.0000000002, but event 1 put it in urn:epc:id:sscc:9521234\.0000000001 and no event took it out\./);
  assert.match(one([add('0000000001', 1), add('0000000002', 2, { action: 'OBSERVE' })], 'aggregation-child-in-two-parents').message, /observes/);
  none([add('0000000001', 1), add('0000000001', 2, { action: 'OBSERVE' })], 'aggregation-child-in-two-parents');
  none([add('0000000001', 1), add('0000000001', 2, { action: 'DELETE' }), add('0000000002', 3)], 'aggregation-child-in-two-parents');
  none([add('0000000001', 1), add('0000000001', 2, { action: 'DELETE', childEPCs: undefined }), add('0000000002', 3)], 'aggregation-child-in-two-parents', 'a DELETE with no child takes every child out');
  one([add('0000000001', 1), add('0000000003', 2, { action: 'DELETE', childEPCs: undefined }), add('0000000002', 3)], 'aggregation-child-in-two-parents');
  none([add('0000000001', 1), add('0000000001', 2, { action: 'DELETE', childEPCs: [sgtin('9')] }), add('0000000002', 3, { childEPCs: [sgtin('9')] })], 'aggregation-child-in-two-parents');
  assert.equal(ofCheck([add('0000000001', 1), add('0000000002', 2), add('0000000003', 3)], 'aggregation-child-in-two-parents').length, 2, 'a move is reported, and the child is then in its new parent');
  none([add('0000000001', 1), add('0000000002', 2, { action: 'OBSERVE', parentID: undefined })], 'aggregation-child-in-two-parents');
  none([add('0000000001', 1), add('0000000002', 2, { action: 'ADDED' })], 'aggregation-child-in-two-parents');
  none([add('0000000001', 1), associationEvent({ eventTime: at(10) }, 2)], 'aggregation-child-in-two-parents');
});

test('siteOf and epcKey: the site of a place and the key of an EPC in both forms', () => {
  assert.equal(siteOf(sgln('00001', '4')), siteOf('https://id.gs1.org/414/9521234000013/254/9'));
  assert.equal(siteOf('urn:example:dock'), 'urn:example:dock');
  assert.equal(siteOf(null), null);
  assert.equal(siteOf(undefined), null);
  assert.equal(epcKey(sgtin()), epcKey('https://id.gs1.org/01/09521234123453/21/1001'));
  assert.equal(epcKey('urn:example:1'), 'urn:example:1');
  assert.equal(uuid(12), 'urn:uuid:00000000-0000-4000-8000-000000000012');
  assert.equal(event('NoSuchEvent', { readPoint: undefined }).type, 'NoSuchEvent');
});
