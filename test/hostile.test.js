import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { EVENT_LIMITS, JSON_LIMITS, checkText } from '../src/index.js';
import { ARGS, GOOD, aggregationEvent, allowed, at, cli, doc, objectEvent, run, sgtin, text, withFiles } from './helpers.js';

// Each test builds input meant to make the tool slow or to exhaust the stack or the memory, and checks that it ends with
// an answer in good time. The time allowed is four times as long under coverage (NODE_V8_COVERAGE is set only when
// coverage is on).

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

test('a hundred thousand and one events: the first of the limit are read, with a note, in good time', () => {
  const events = Array.from({ length: EVENT_LIMITS.maxEvents + 1 }, (_, i) => ({ type: 'ObjectEvent', eventID: `urn:x:${i}`, eventTime: '2101-03-01T08:00:00Z', eventTimeZoneOffset: '+00:00', epcList: [`urn:x:e${i % 100}`], action: 'OBSERVE', bizStep: 'inspecting', readPoint: { id: 'urn:x:p' } }));
  const { value, ms } = timed(() => checkText(JSON.stringify(events)));
  assert.equal(value.read.events.length, EVENT_LIMITS.maxEvents);
  assert.ok(value.notes.includes(`the list of events holds ${EVENT_LIMITS.maxEvents + 1} events; the tool read the first ${EVENT_LIMITS.maxEvents} and left the rest out`));
  assert.deepEqual(value.findings, []);
  assert.ok(ms < allowed(20000), `took ${ms} ms`);
});

test('one EPC shipped, received, packed and unpacked a hundred thousand times: the checks across events stay linear', () => {
  const events = [];
  for (let i = 0; i < 25000; i += 1) {
    const t = (k) => `2101-03-01T08:00:${String(k % 60).padStart(2, '0')}.${String(i).padStart(6, '0')}Z`;
    events.push({ type: 'AggregationEvent', eventID: `urn:x:a${i}`, eventTime: t(0), eventTimeZoneOffset: '+00:00', parentID: 'urn:x:pallet', childEPCs: ['urn:x:case'], action: 'ADD', bizStep: 'packing', readPoint: { id: 'urn:x:p' } });
    events.push({ type: 'AggregationEvent', eventID: `urn:x:d${i}`, eventTime: t(1), eventTimeZoneOffset: '+00:00', parentID: 'urn:x:pallet', action: 'DELETE', bizStep: 'unpacking', readPoint: { id: 'urn:x:p' } });
    events.push({ type: 'ObjectEvent', eventID: `urn:x:s${i}`, eventTime: t(2), eventTimeZoneOffset: '+00:00', epcList: ['urn:x:case'], action: 'OBSERVE', bizStep: 'shipping', readPoint: { id: 'urn:x:p' } });
    events.push({ type: 'ObjectEvent', eventID: `urn:x:r${i}`, eventTime: t(3), eventTimeZoneOffset: '+00:00', epcList: ['urn:x:case'], action: 'OBSERVE', bizStep: 'receiving', readPoint: { id: 'urn:x:p' } });
  }
  const { value, ms } = timed(() => checkText(JSON.stringify(events)));
  assert.equal(value.read.events.length, 100000);
  assert.ok(ms < allowed(30000), `took ${ms} ms`);
});

test('a hundred thousand EPCs in one list, and a hundred thousand children of one parent taken out at once', () => {
  const many = Array.from({ length: 100000 }, (_, i) => `urn:x:${i}`);
  const { value, ms } = timed(() => checkText(text([objectEvent({ epcList: many }), aggregationEvent({ eventTime: at(9), childEPCs: many }, 2), aggregationEvent({ eventTime: at(10), childEPCs: undefined, action: 'DELETE' }, 3)])));
  assert.equal(value.read.events[0].epcs.epcList.values.length, EVENT_LIMITS.maxListItems);
  assert.ok(value.notes.includes(`the epcList of event 1 (ObjectEvent) holds more than ${EVENT_LIMITS.maxListItems} identifiers; the tool read the first ${EVENT_LIMITS.maxListItems}`));
  assert.ok(ms < allowed(20000), `took ${ms} ms`);
  const dup = timed(() => checkText(text([objectEvent({ epcList: Array.from({ length: 100000 }, () => sgtin()) })])));
  assert.equal(dup.value.findings.filter((f) => f.id === 'field-duplicate').length, EVENT_LIMITS.maxListItems - 1);
  assert.ok(dup.ms < allowed(20000), `took ${dup.ms} ms`);
  const q = checkText(text([objectEvent({ epcList: undefined, quantityList: Array.from({ length: 20000 }, () => ({ epcClass: 'urn:x:c', quantity: 1 })) })]));
  assert.ok(q.notes.some((n) => /quantityList of event 1 \(ObjectEvent\) holds more than 10000 quantities/.test(n)));
});

test('deep nesting ends with a file-unreadable finding at the limit, never a stack overflow, and the walks do not recurse', () => {
  const deep = `${'['.repeat(100000)}${']'.repeat(100000)}`;
  const { value } = timed(() => checkText(deep));
  assert.equal(value.findings[0].id, 'file-unreadable');
  assert.match(value.findings[0].message, new RegExp(`nested more than ${JSON_LIMITS.maxDepth} deep`));
  const nested = text([objectEvent()]).replace('"type": "ObjectEvent",', `"type": "ObjectEvent", "example:x": ${'['.repeat(JSON_LIMITS.maxDepth - 3)}"x"${']'.repeat(JSON_LIMITS.maxDepth - 3)},`);
  assert.deepEqual(checkText(nested).findings, []);
  const keyed = `{"privateKey": ${'{"a": '.repeat(JSON_LIMITS.maxDepth - 1)}1${'}'.repeat(JSON_LIMITS.maxDepth - 1)}}`;
  assert.equal(checkText(keyed).findings.filter((f) => f.id === 'secret-in-file').length, 1);
  const hexes = `{"hexBinaryValue": ${'{"hexBinaryValue": '.repeat(JSON_LIMITS.maxDepth - 2)}"${'1'.repeat(64)}"${'}'.repeat(JSON_LIMITS.maxDepth - 1)}`;
  assert.deepEqual(checkText(hexes).findings.filter((f) => f.id === 'secret-in-file'), [], 'the walk for sensor data does not recurse either');
});

test('numbers with thousands of digits and huge exponents are refused, not worked out', () => {
  const huge = `1${'0'.repeat(5000)}`;
  const big = text([objectEvent({ epcList: undefined, quantityList: [{ epcClass: 'urn:x:c', quantity: 1 }] })]).replace('"quantity": 1', `"quantity": ${huge}`);
  const { value, ms } = timed(() => checkText(big));
  assert.ok(value.findings.some((f) => f.id === 'quantity-invalid' && /cannot be read as an exact number/.test(f.message)));
  assert.ok(value.findings.every((f) => f.message.length < 700));
  assert.ok(ms < allowed(3000), `took ${ms} ms`);
  const exp = checkText(text([objectEvent({ epcList: undefined, quantityList: [{ epcClass: 'urn:x:c', quantity: 1 }] })]).replace('"quantity": 1', '"quantity": 1e999999'));
  assert.ok(exp.findings.some((f) => f.id === 'quantity-invalid'));
});

test('long strings, long identifiers and long times are read in good time, and the messages stay short', () => {
  const long = 'urn:x:'.concat('n'.repeat(200000));
  const { value, ms } = timed(() => checkText(text([objectEvent({ epcList: [long, `urn:epc:id:sgtin:9521234.012345.${'1'.repeat(200000)}`, `https://id.gs1.org/01/${'1'.repeat(200000)}`], bizStep: 'x'.repeat(200000), eventTime: '2'.repeat(200000), type: 'T'.repeat(200000) })])));
  assert.ok(value.findings.length >= 4);
  assert.ok(value.findings.every((x) => x.message.length < 900), value.findings.map((x) => x.message.length).join());
  assert.ok(value.notes.every((n) => n.length < 900));
  assert.ok(ms < allowed(5000), `took ${ms} ms`);
});

test('names such as __proto__, constructor and toString are only names', () => {
  const t = text([objectEvent()]).replace('"type": "ObjectEvent",', '"type": "ObjectEvent", "__proto__": {"polluted": 1}, "hasOwnProperty": 2,');
  const { value } = timed(() => checkText(t));
  assert.ok(value.findings.some((f) => f.id === 'field-unknown' && /"__proto__"/.test(f.message)));
  assert.ok(value.findings.some((f) => f.id === 'field-unknown' && /"hasOwnProperty"/.test(f.message)));
  assert.equal({}.polluted, undefined);
  for (const type of ['__proto__', 'constructor', 'toString']) assert.deepEqual(checkText(text([objectEvent({ type })])).findings.map((f) => f.id), ['event-type-unknown'], type);
  assert.deepEqual(checkText(text([objectEvent({ bizStep: 'constructor', disposition: '__proto__' })])).findings.map((f) => f.id), ['biz-step-unknown', 'disposition-unknown']);
  assert.deepEqual(checkText(text([objectEvent({ epcList: ['https://id.gs1.org/__proto__/1', 'https://id.gs1.org/constructor/1'] })])).findings, []);
  assert.deepEqual(checkText(text(doc([objectEvent()], { type: '__proto__' }))).findings.map((f) => f.id), ['field-invalid']);
});

test('a run leaves the folder as it was: the tool writes nothing', async () => {
  await withFiles(GOOD, async (dir) => {
    const before = (await readdir(dir, { recursive: true })).sort();
    await cli([...ARGS, '--format', 'sarif'], dir);
    await cli([...ARGS, '--json', '--explain'], dir);
    assert.deepEqual((await readdir(dir, { recursive: true })).sort(), before);
  });
  assert.equal((await run(GOOD, ARGS)).code, 0);
});
