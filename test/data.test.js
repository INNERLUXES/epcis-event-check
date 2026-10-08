import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEST, BIZ_STEPS, DEPRECATED_DISPOSITIONS, DISPOSITIONS, EVENT_KEYS, NOT_A, NOTICE, POINTS, RULES, SOURCES, flat, grouped, listText, plural, pointPage, safeText, source } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const norm = (t) => t.replace(/\s+/g, ' ');

const PLACES = /^https:\/\/(?:ref\.gs1\.org\/standards\/(?:epcis|cbv|tds|genspecs)\/|github\.com\/gs1\/EPCIS\/tree\/master\/JSON-Schema)$/;

test('every source has an official address of GS1, and no number that reads like a year', () => {
  for (const s of SOURCES) {
    assert.match(s.url, PLACES, s.id);
    assert.doesNotMatch(s.url, /\b(?:19|20)\d{2}\b/, s.id);
    assert.ok(s.title.length > 5);
  }
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length);
  assert.deepEqual(SOURCES.map((s) => s.id), ['epcis', 'epcis-schema', 'cbv', 'tds', 'genspecs']);
  assert.equal(NOTICE, `This report is an input to a review of EPCIS events before they are written to a shared supply chain ledger: ${NOT_A}.`);
  assert.match(NOT_A, /^not a certification of conformance to EPCIS or the CBV/);
});

test('every source has a text copy under research/sources that starts with its address, and research/sources.md lists it', async () => {
  const notes = await read('research/sources.md');
  for (const s of SOURCES) {
    const copy = await read(s.file);
    assert.ok(copy.startsWith(`Source: ${s.url}\n`), s.file);
    assert.ok(copy.length > 1500, `${s.file} holds the parts of the standard`);
    assert.ok(notes.includes(s.url), `research/sources.md lists ${s.id}`);
    assert.ok(notes.includes(s.file), `research/sources.md names ${s.file}`);
  }
});

test('every point belongs to a listed source, is written in a sentence of its own and is not a long quotation of its standard', async () => {
  for (const [id, p] of Object.entries(POINTS)) {
    const page = source(p.source);
    assert.ok(page, `${id}: the source ${p.source}`);
    assert.equal(pointPage(id), page);
    assert.ok(p.text.length > 40 && p.text.length < 400, id);
    assert.match(p.text, /\.$/, id);
    const copy = norm(await read(page.file));
    // No run of 12 words of the point appears word for word in its standard.
    const words = norm(p.text).split(' ');
    for (let i = 0; i + 12 <= words.length; i += 1) assert.ok(!copy.includes(words.slice(i, i + 12).join(' ')), `${id} quotes its standard`);
  }
});

test('every point is used by a rule, and every basis of a rule is a point', () => {
  const used = new Set(RULES.flatMap((r) => r.basis));
  for (const id of Object.keys(POINTS)) assert.ok(used.has(id), `${id} is not used by a rule`);
  for (const id of used) assert.ok(Object.hasOwn(POINTS, id), `${id} is not a point`);
});

test('docs/rules-and-sources.md lists every standard with its copy and every check with its level, kind and points', async () => {
  const doc = await read('docs/rules-and-sources.md');
  for (const s of SOURCES) assert.ok(doc.includes(s.url) && doc.includes(s.file), s.id);
  for (const r of RULES) {
    const section = doc.split(/^## /m).find((p) => p.startsWith(`${r.id}\n`));
    assert.ok(section, r.id);
    assert.ok(section.includes(`- Level: ${r.severity}`), r.id);
    assert.ok(section.includes('- Cannot see: '), r.id);
    for (const b of r.basis) assert.ok(section.includes(POINTS[b].text), `${r.id}: ${b}`);
    if (r.kind === 'best practice') assert.ok(norm(section).includes(BEST), r.id);
    if (r.own) assert.ok(section.includes(r.own), `${r.id}: its own choice`);
  }
});

test('the documented checks name a standard and say no own choice, the best practice checks say what is their own choice, and the input checks rest on no standard', () => {
  for (const r of RULES.filter((x) => x.kind === 'documented')) {
    assert.ok(r.basis.length > 0, r.id);
    assert.equal(r.own, undefined, r.id);
  }
  for (const r of RULES.filter((x) => x.kind === 'best practice')) assert.ok(r.own && r.own.includes(BEST), `${r.id} says what is its own choice`);
  for (const r of RULES.filter((x) => x.kind === 'input')) assert.deepEqual(r.basis, [], r.id);
});

test('the EPCIS standard says what the documented checks rest on', async () => {
  const epcis = norm(await read('research/sources/gs1-epcis-standard.txt'));
  for (const s of [
    'enables disparate applications to create and share visibility event data, both within and across enterprises.',
    'Because eventTime is a mandatory field in all EPCIS events, it must occur exactly once.',
    'Note that the values above are the only values possible for Action. Unlike other types defined below, Action is not a vocabulary type, and SHALL NOT be extended by industry groups.',
    'followed by two digits whose value is within the range 00 through 14 (inclusive)',
    'An ObjectEvent SHALL contain either a non-empty epcList, a nonempty quantityList, or both.',
    'A parent identifier is required when action is ADD or DELETE, but optional when action is OBSERVE.',
    'the EPC(s) do not exist subsequent to the event and SHOULD NOT be observed again.',
    'If transformationID is omitted, then a TransformationEvent SHALL include at least one input',
    'If the QuantityElement lacks a uom field (below), then the quantity SHALL have a positive integer value',
    'globally unique across all events other than error declarations.',
    'TransformationEvent (subclass of EPCISEvent)'
  ]) assert.ok(epcis.includes(s), s);
  const fields = epcis.slice(epcis.indexOf('TransformationEvent (subclass of EPCISEvent)'), epcis.indexOf('AssociationEvent (subclass of EPCISEvent)'));
  assert.ok(fields.length > 1000 && !/\baction\b/.test(fields),'the fields of a TransformationEvent hold no action');
  assert.ok(!/ledger|blockchain/i.test(epcis), 'EPCIS says nothing of ledgers');
});

test('the JSON schema says what the documented checks rest on', async () => {
  const schema = await read('research/sources/gs1-epcis-json-schema.txt');
  const file = (name) => {
    const at = schema.indexOf(`/${name}\n`);
    return JSON.parse(schema.slice(schema.indexOf('\n', at) + 1, schema.indexOf('\n=== ', at) > 0 ? schema.indexOf('\n=== ', at) : undefined));
  };
  const defs = file('event-definitions-JSON-Schema.json').definitions;
  assert.deepEqual(defs.Event.required, ['eventTime', 'eventTimeZoneOffset']);
  assert.deepEqual(defs.action.enum, ['OBSERVE', 'ADD', 'DELETE']);
  assert.deepEqual([...defs.eventType.anyOf[0].enum].sort(), Object.keys(EVENT_KEYS).sort());
  for (const t of Object.keys(EVENT_KEYS)) {
    const s = file(`${t}-JSON-Schema.json`).definitions[t].allOf[1];
    assert.deepEqual([...s.propertyNames.anyOf[1].enum].sort(), [...EVENT_KEYS[t]].sort(), `the keys of ${t}`);
    if (t !== 'TransformationEvent') assert.ok(s.required.includes('action'), t);
  }
  assert.deepEqual(file('bizStep-JSON-Schema.json').definitions.bizStep.anyOf[1].enum.sort(), [...BIZ_STEPS].sort());
  assert.deepEqual(file('disposition-JSON-Schema.json').definitions.disposition.anyOf[1].enum.sort(), [...DISPOSITIONS].sort());
  assert.deepEqual(file('EPCIS-Document-JSON-Schema.json').definitions.epcisDocument.required, ['@context', 'type', 'schemaVersion', 'creationDate', 'epcisBody']);
});

test('the CBV, the Tag Data Standard and the General Specifications say what the documented checks rest on', async () => {
  const cbv = norm(await read('research/sources/gs1-cbv-standard.txt'));
  for (const s of ['Each EPCIS event in a CBV-Compliant Document SHOULD include a bizStep field', 'Each EPCIS event in a CBV-Compliant Document MAY include a disposition field.', 'For an instance-level identifier, the object should not be the subject of subsequent events', 'Use of new prefix 952 in all examples', 'non_sellable_expired', 'Deprecated Disposition values']) assert.ok(cbv.includes(s), s);
  for (const w of [...BIZ_STEPS, ...DISPOSITIONS, ...DEPRECATED_DISPOSITIONS.map(([d]) => d)]) assert.ok(new RegExp(`(?:^| )${w}(?: |$)`).test(cbv), w);
  const tds = norm(await read('research/sources/gs1-tag-data-standard.txt'));
  for (const s of ['The number of characters in the two PaddedNumericComponent fields must total 13', 'The number of characters in the two PaddedNumericComponent fields must total 17', 'The number of characters in the two PaddedNumericComponent fields must total 12', 'Note that the GTIN check digit d14 is not included in the EPC URI.', 'range of GS1 Company Prefix lengths permitted in the SGTIN EPC']) assert.ok(tds.includes(s), s);
  const gs = norm(await read('research/sources/gs1-general-specifications.txt'));
  for (const s of ['This algorithm is identical for all fixed length numeric GS1 data structures (including GDTI, GLN, GRAI, etc.) that require a check digit.', 'Subtract sum from nearest equal or higher multiple of ten = check digit', '952 Used for demonstrations and examples of the GS1 system']) assert.ok(gs.includes(s), s);
});

test('the copies leave out every line with a year, the people who wrote them, and are plain ASCII with the header of how they were read', async () => {
  for (const s of SOURCES) {
    const copy = await read(s.file);
    assert.doesNotMatch(copy, /\b(?:19|20)\d{2}\b/, s.file);
    assert.doesNotMatch(copy, /Contributors|AISBL|Page \d+ of \d+/, s.file);
    assert.ok([...copy].every((c) => c.charCodeAt(0) < 128), s.file);
    assert.match(copy.split('\n')[1], /^Read as the (?:PDF the address returns|raw files of the JSON schema)/, s.file);
    assert.ok(!copy.includes('\r'), s.file);
  }
});

test('size helpers: grouped numbers, lists for a sentence and plurals', () => {
  assert.equal(grouped(12345), '12,345');
  assert.equal(grouped(10n ** 12n), '1,000,000,000,000');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e'], 3), 'a, b, c and 2 more');
  assert.equal(plural(1, 'line'), '1 line');
  assert.equal(plural(2, 'class', 'classes'), '2 classes');
});

test('text helpers: safeText replaces control, direction and separator characters and caps the length; flat folds white space', () => {
  const bad = ['a', String.fromCharCode(0x1b), '[31m', String.fromCharCode(0x202e), 'b', String.fromCharCode(0x2028), 'c', String.fromCharCode(7), 'd', String.fromCharCode(0x85), 'e'].join('');
  const out = safeText(bad);
  assert.ok(![...out].some((c) => c.charCodeAt(0) < 32 || [0x202e, 0x2028, 0x85].includes(c.charCodeAt(0))));
  assert.equal(safeText('x'.repeat(50), 10), 'xxxxxxx...');
  assert.equal(safeText('short', 10), 'short');
  assert.equal(flat('  a \n  b\t c '), 'a b c');
});
