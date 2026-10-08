import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_EVENT_KEYS, COMMON_KEYS, DOCUMENT_KEYS, DOCUMENT_REQUIRED, DOCUMENT_TYPES, EPC_LISTS, ERROR_KEYS, EVENT_KEYS, EVENT_LIMITS, EVENT_TYPES, LOCATION_KEYS, PERSISTENT_KEYS, QUANTITY_KEYS, QUANTITY_LISTS, QUERY_KEYS, RESULTS_KEYS, Reader, TRANSACTION_KEYS, checkText, cut, describe, isExtensionKey, oneEdit, readEvents, readJson, suggestKey, where } from '../src/index.js';
import { aggregationEvent, doc, findingsOf, idsOf, ioEvent, lineOf, objectEvent, ofCheck, sgln, sgtin, text, transactionEvent } from './helpers.js';

const read = (p) => readEvents(readJson(text(p)));

test('the keys of each event type are those of the JSON schema of EPCIS 2.0', () => {
  assert.deepEqual(EVENT_TYPES, ['ObjectEvent', 'AggregationEvent', 'TransactionEvent', 'TransformationEvent', 'AssociationEvent']);
  assert.ok(!EVENT_KEYS.TransformationEvent.includes('action'));
  for (const t of ['ObjectEvent', 'AggregationEvent', 'TransactionEvent', 'AssociationEvent']) assert.ok(EVENT_KEYS[t].includes('action'), t);
  assert.deepEqual(COMMON_KEYS, ['@context', 'type', 'eventTime', 'recordTime', 'eventTimeZoneOffset', 'eventID', 'certificationInfo', 'errorDeclaration']);
  assert.ok(ALL_EVENT_KEYS.includes('ilmd') && ALL_EVENT_KEYS.includes('transformationID'));
  assert.deepEqual(DOCUMENT_REQUIRED, ['@context', 'type', 'schemaVersion', 'creationDate', 'epcisBody']);
  assert.ok(DOCUMENT_REQUIRED.every((k) => DOCUMENT_KEYS.includes(k)));
  assert.deepEqual(DOCUMENT_TYPES, ['EPCISDocument', 'EPCISQueryDocument']);
  assert.deepEqual([EPC_LISTS.length, QUANTITY_LISTS.length], [4, 4]);
  assert.deepEqual([QUANTITY_KEYS, LOCATION_KEYS, TRANSACTION_KEYS, ERROR_KEYS, PERSISTENT_KEYS, QUERY_KEYS, RESULTS_KEYS].map((k) => k.length), [3, 1, 2, 3, 2, 3, 2]);
  assert.deepEqual(EVENT_LIMITS, { maxEvents: 100000, maxListItems: 10000 });
});

test('the three forms of a file: an EPCISDocument, an EPCISQueryDocument and a bare list of events', () => {
  assert.deepEqual(findingsOf(doc()), []);
  assert.deepEqual(findingsOf([objectEvent()]), []);
  const query = { '@context': 'https://ref.gs1.org/standards/epcis/epcis-context.jsonld', type: 'EPCISQueryDocument', schemaVersion: '2.0', creationDate: '2101-03-10T12:00:00Z', epcisBody: { queryResults: { queryName: 'SimpleEventQuery', resultsBody: { eventList: [objectEvent()] } } } };
  assert.deepEqual(findingsOf(query), []);
  const r = read(query);
  assert.equal(r.document.type, 'EPCISQueryDocument');
  assert.equal(r.events.length, 1);
  assert.equal(read([objectEvent()]).document.form, 'list');
  const d = read(doc());
  assert.deepEqual([d.document.form, d.document.type, d.document.schemaVersion, d.document.creationDate.value], ['document', 'EPCISDocument', '2.0', '2101-03-10T12:00:00.000Z']);
});

test('a document: the required fields, its type, its version, its body and its event list', () => {
  const missing = findingsOf(doc([objectEvent()], { '@context': undefined, schemaVersion: undefined, creationDate: undefined }));
  assert.deepEqual(missing.map((f) => f.id), ['field-missing', 'field-missing', 'field-missing']);
  assert.match(missing[0].message, /^The document has no @context, which the JSON schema of an EPCISDocument requires\.$/);
  const nobody = findingsOf(doc([], { epcisBody: undefined, type: undefined }));
  assert.ok(nobody.some((f) => /no epcisBody, which the JSON schema of an EPCISDocument requires; the events go in epcisBody\.eventList/.test(f.message)));
  assert.ok(nobody.some((f) => /no type/.test(f.message)));
  assert.match(ofCheck(doc([], { type: 'EPCISEvents' }), 'field-invalid')[0].message, /The type of the document is "EPCISEvents"; it must be EPCISDocument/);
  assert.match(ofCheck(doc([], { type: ' ' }), 'field-invalid')[0].message, /The type of the document is empty/);
  assert.deepEqual(idsOf(doc([], { type: 3 })), ['field-invalid']);
  assert.match(ofCheck(doc([], { schemaVersion: 'two' }), 'field-invalid')[0].message, /schemaVersion of the document is "two"; it must be a version such as 2\.0/);
  assert.deepEqual(idsOf(doc([], { schemaVersion: '2.0.1' })), []);
  assert.match(ofCheck(doc([], { epcisBody: { eventList: {} } }), 'field-invalid')[0].message, /The eventList of the epcisBody is an object; it must be a list of events\./);
  assert.match(ofCheck(doc([], { epcisBody: {} }), 'field-missing')[0].message, /^The epcisBody has no eventList, the list of events\.$/);
  assert.match(ofCheck(doc([], { epcisBody: [] }), 'field-invalid')[0].message, /The epcisBody of the document is a list; it must be an object/);
  assert.match(ofCheck(doc([], { epcisBody: { eventList: [], eventLst: [] } }), 'field-unknown')[0].message, /The key "eventLst" of the epcisBody is not one the tool reads there.*Did you mean "eventList"\?/);
  assert.deepEqual(idsOf(doc([], { 'example:batch': 7, id: 'urn:uuid:1', sender: 'x', epcisHeader: {} })), [], 'an extension key and the optional fields');
  assert.ok(read(doc([])).notes.includes('the eventList is empty, so there was no event to check'));
});

test('a query document: its queryResults, its resultsBody and its eventList', () => {
  const q = (body) => ({ '@context': 'x:y', type: 'EPCISQueryDocument', schemaVersion: '2.0', creationDate: '2101-03-10T12:00:00Z', epcisBody: body });
  assert.match(ofCheck(q({}), 'field-missing')[0].message, /The epcisBody of the query document has no queryResults\./);
  assert.match(ofCheck(q({ queryResults: {} }), 'field-missing')[0].message, /The queryResults have no resultsBody\./);
  assert.match(ofCheck(q({ queryResults: { resultsBody: {} } }), 'field-missing')[0].message, /The resultsBody has no eventList/);
  assert.deepEqual(idsOf(q({ queryResults: 'x' })), ['field-invalid']);
});

test('the top level: a scalar is file-unreadable, and an item of the list that is not an object is field-invalid', () => {
  for (const scalar of ['7', '"events"', 'null', 'true']) {
    const r = checkText(scalar);
    assert.deepEqual(r.findings.map((f) => f.id), ['file-unreadable'], scalar);
    assert.equal(r.read.document, null);
    assert.match(r.findings[0].message, /not an EPCISDocument or a list of events, so nothing was checked/);
  }
  const f = findingsOf([objectEvent(), 7, 'x']);
  assert.deepEqual(f.map((x) => x.id), ['field-invalid', 'field-invalid']);
  assert.match(f[0].message, /^Item 2 of the list of events is the number 7; an event is an object\.$/);
});

test('an event: its type, the keys of its type, the keys of another type and the keys of an extension', () => {
  const p = [objectEvent({ parentID: sgtin(), bizLocaton: { id: sgln() }, 'example:temperature': 4, '@context': { example: 'https://example.com/' } })];
  const f = findingsOf(p);
  assert.deepEqual(f.map((x) => x.id), ['field-unknown', 'field-unknown']);
  assert.match(f[0].message, /The key "parentID" of event 1 \(ObjectEvent\) is not one the tool reads there.* It is a field of an AggregationEvent, a TransactionEvent or an AssociationEvent\./);
  assert.match(f[1].message, /The key "bizLocaton" .* Did you mean "bizLocation"\?/);
  assert.equal(f[1].line, lineOf(text(p), '"bizLocaton"'));
  assert.match(ofCheck([ioEvent({ epcList: [sgtin()] })], 'field-unknown')[0].message, /It is a field of an ObjectEvent or a TransactionEvent\./);
  assert.match(ofCheck([objectEvent({ inputEPCList: [sgtin()] })], 'field-unknown')[0].message, /It is a field of a TransformationEvent\./);
  assert.match(ofCheck([objectEvent({ zz: 1 })], 'field-unknown')[0].message, /The key "zz" .* left out of every check\. The keys of/);
  const none = findingsOf([objectEvent({ type: undefined })]);
  assert.deepEqual(none.map((x) => x.id), ['field-missing']);
  assert.match(none[0].message, /^Event 1 has no type; EPCIS names it ObjectEvent/);
  assert.deepEqual(idsOf([objectEvent({ type: 5 })]), ['field-invalid']);
  assert.deepEqual(idsOf([objectEvent({ type: 'https://example.com/SensorEvent', anything: 1 })]), [], 'an extension type has no unknown keys');
});

test('an event: the fields of the wrong type are field-invalid, and their values are left out of the checks', () => {
  const f = findingsOf([objectEvent({ eventTime: 7, epcList: 'x', readPoint: 'here', quantityList: {} })]);
  assert.deepEqual(f.map((x) => x.id).sort(), ['field-invalid', 'field-invalid', 'field-invalid', 'field-invalid']);
  assert.ok(f.some((x) => /The eventTime of event 1 \(ObjectEvent\) is the number 7; it must be text\./.test(x.message)));
  assert.ok(f.some((x) => /The epcList of event 1 \(ObjectEvent\) is text; it must be a list\./.test(x.message)));
  assert.ok(f.some((x) => /The readPoint of event 1 \(ObjectEvent\) is text; it must be an object with an id\./.test(x.message)));
  const items = findingsOf([objectEvent({ epcList: [sgtin(), 7, ' '] })]);
  assert.deepEqual(items.map((x) => x.id), ['field-invalid', 'field-invalid']);
  assert.match(items[0].message, /An item of the epcList of event 1 \(ObjectEvent\) is the number 7; it must be text\./);
  assert.match(items[1].message, /is empty; it must be text\./);
  assert.match(ofCheck([objectEvent({ quantityList: [7] })], 'field-invalid')[0].message, /Item 1 of the quantityList of event 1 \(ObjectEvent\) is the number 7; it must be an object\./);
});

test('an event: places, quantities, business transactions, sources, destinations and error declarations need their fields', () => {
  assert.match(ofCheck([objectEvent({ readPoint: {} })], 'field-missing')[0].message, /^The readPoint of event 1 \(ObjectEvent\) has no id\.$/);
  assert.deepEqual(idsOf([objectEvent({ readPoint: { id: sgln(), 'example:dock': 'A' } })]), []);
  assert.deepEqual(idsOf([objectEvent({ readPoint: { id: sgln(), name: 'A' } })]), ['field-unknown']);
  assert.match(ofCheck([objectEvent({ quantityList: [{ quantity: 1 }] })], 'field-missing')[0].message, /Item 1 of the quantityList of event 1 \(ObjectEvent\) has no epcClass/);
  assert.match(ofCheck([objectEvent({ quantityList: [{ epcClass: 'urn:epc:class:lgtin:9521234.012346.L1', quantity: '2' }] })], 'field-invalid')[0].message, /The quantity of item 1 of the quantityList of event 1 \(ObjectEvent\) is "2"; it must be a JSON number\./);
  assert.match(ofCheck([objectEvent({ quantityList: [{ epcClass: 'urn:epc:class:lgtin:9521234.012346.L1', quantity: null }] })], 'field-invalid')[0].message, /is null; it must be a JSON number/);
  assert.match(ofCheck([transactionEvent({ bizTransactionList: [{ type: 'po' }] })], 'field-missing')[0].message, /Item 1 of the bizTransactionList of event 1 \(TransactionEvent\) has no bizTransaction/);
  const src = ofCheck([objectEvent({ sourceList: [{}], destinationList: [{ type: 'location' }] })], 'field-missing').map((f) => f.message);
  assert.deepEqual(src, ['Item 1 of the sourceList of event 1 (ObjectEvent) has no type.', 'Item 1 of the sourceList of event 1 (ObjectEvent) has no source.', 'Item 1 of the destinationList of event 1 (ObjectEvent) has no destination.']);
  assert.match(ofCheck([objectEvent({ errorDeclaration: { reason: 'incorrect_data' } })], 'field-missing')[0].message, /The errorDeclaration of event 1 \(ObjectEvent\) has no declarationTime/);
  assert.deepEqual(idsOf([objectEvent({ errorDeclaration: { declarationTime: '2101-03-02T08:00:00Z', reason: 'incorrect_data', correctiveEventIDs: ['urn:uuid:1'] } })]), []);
  assert.deepEqual(idsOf([objectEvent({ errorDeclaration: 'yes' })]), ['field-invalid']);
  assert.deepEqual(idsOf([objectEvent({ persistentDisposition: { set: ['completeness_verified'], unset: ['completeness_inferred'] } })]), []);
  assert.deepEqual(idsOf([objectEvent({ persistentDisposition: { add: ['x'] } })]), ['field-unknown']);
  assert.deepEqual(idsOf([objectEvent({ sensorElementList: [{ sensorReport: [{ type: 'Temperature', value: 4 }] }], ilmd: { 'example:x': 1 }, certificationInfo: 'https://example.com/c' })]), [], 'sensor data, ILMD and certification are not read');
});

test('field-duplicate: an EPC listed twice in one list of one event, and the same EPC in two lists or two events is fine', () => {
  const p = [objectEvent({ epcList: [sgtin('1'), sgtin('2'), sgtin('1')] })];
  const f = ofCheck(p, 'field-duplicate');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /lists urn:epc:id:sgtin:9521234\.012345\.1 twice, at lines \d+ and \d+; an EPC is listed once\./);
  assert.equal(f[0].line, lineOf(text(p), `"${sgtin('1')}"`, 2));
  assert.match(ofCheck('[{"type":"ObjectEvent","epcList":["urn:x:1","urn:x:1"]}]', 'field-duplicate')[0].message, /twice, on line 1;/);
  assert.deepEqual(ofCheck([aggregationEvent({ parentID: sgtin('9'), childEPCs: [sgtin('1')] }), objectEvent({ epcList: [sgtin('1')] }, 2)], 'field-duplicate'), []);
});

test('fields: where, cut, oneEdit, suggestKey, describe, isExtensionKey and the Reader', () => {
  assert.deepEqual(where({ line: 3, column: 4, other: 1 }), { line: 3, column: 4 });
  assert.equal(cut('abcdef', 5), 'ab...');
  assert.equal(cut('abc', 5), 'abc');
  assert.ok(oneEdit('bizStep', 'bizStp'));
  assert.ok(oneEdit('bizStep', 'bizSteps'));
  assert.ok(oneEdit('action', 'actiom'));
  assert.ok(!oneEdit('action', 'action'));
  assert.ok(!oneEdit('action', 'act'));
  assert.ok(!oneEdit('abc', 'xyz'));
  assert.equal(suggestKey('BIZ_STEP', ['bizStep']), 'bizStep');
  assert.equal(suggestKey('eventtimes', ['eventTime']), 'eventTime');
  assert.equal(suggestKey('epc', ['epcList']), 'epcList');
  assert.equal(suggestKey('xy', ['xyz']), null);
  assert.equal(suggestKey('zzzz', ['epcList']), null);
  assert.equal(describe({ kind: 'string', secret: true }), 'a value that is not shown');
  assert.equal(describe({ kind: 'boolean', value: false }), 'false');
  assert.equal(describe({ kind: 'null' }), 'null');
  assert.equal(describe({ kind: 'array' }), 'a list');
  assert.equal(describe({ kind: 'number', raw: '1'.repeat(50) }), `the number ${'1'.repeat(37)}...`);
  assert.ok(isExtensionKey('example:x') && !isExtensionKey('bizStep'));
  const r = new Reader();
  r.add('field-missing', { line: 1, column: 2 }, 'm');
  assert.deepEqual(r.findings, [{ id: 'field-missing', file: 'events', line: 1, column: 2, message: 'm', subject: null }]);
});
