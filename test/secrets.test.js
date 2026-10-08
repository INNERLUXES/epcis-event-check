import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HEX_KEYS, SECRET_KEYS, checkText, fileSecrets, findSecrets, hexNodes, isSecretKey, readJson, secretShape } from '../src/index.js';
import { ARGS, doc, findingsOf, lineOf, objectEvent, run, sgtin, text } from './helpers.js';

// Shapes built from repeated characters, so that no file of the repository holds anything that could be a real seed or
// key.
const MNEMONIC = Array.from({ length: 12 }, () => 'lantern').join(' ');
const MNEMONIC_24 = Array.from({ length: 24 }, (_, i) => (i % 2 ? 'harbor' : 'lantern')).join(' ');
const XPRV = `x${'prv'}${'9'.repeat(107)}`;
const HEX = `0x${'ab'.repeat(32)}`;
const WIF = `5${'H'.repeat(50)}`;

// A sensor report with hex data of 32 bytes.
const SENSOR = [{ sensorReport: [{ type: 'Temperature', hexBinaryValue: 'cd'.repeat(32) }] }];

test('secretShape: a mnemonic of 12 to 24 words, an extended private key, a key in hex and a key in WIF', () => {
  assert.equal(secretShape(MNEMONIC), 'a mnemonic');
  assert.equal(secretShape(MNEMONIC_24), 'a mnemonic');
  assert.equal(secretShape(`  ${MNEMONIC}  `), 'a mnemonic');
  assert.equal(secretShape(XPRV), 'an extended private key');
  assert.equal(secretShape(HEX), 'a private key in hex');
  assert.equal(secretShape(HEX.slice(2)), 'a private key in hex');
  assert.equal(secretShape(WIF), 'a private key in WIF');
  assert.equal(secretShape(`K${'z'.repeat(51)}`), 'a private key in WIF');
});

test('secretShape: identifiers, times, vocabulary values and other near misses of an event are not secrets', () => {
  for (const ok of [sgtin(), 'https://id.gs1.org/01/09521234123453/21/1001', 'urn:uuid:00000000-0000-4000-8000-000000000001', `ni:///sha-256;${'ab'.repeat(32)}?ver=CBV2.0`, '2101-03-01T08:00:00.000+01:00', 'in_transit', 'commissioning', 'OBSERVE', Array.from({ length: 11 }, () => 'lantern').join(' '), `x${'pub'}${'9'.repeat(107)}`, '']) assert.equal(secretShape(ok), null, ok);
});

test('isSecretKey: names of keys and seeds in any case and with any separator, and near misses', () => {
  for (const k of ['privateKey', 'private_key', 'PRIVATE-KEY', 'mnemonic', 'seedPhrase', 'seed phrase', 'xprv', 'wif', 'secret', 'passphrase', 'password']) assert.ok(isSecretKey(k), k);
  for (const k of ['eventID', 'epcList', 'parentID', 'bizTransaction', 'hexBinaryValue', 'certificationInfo', 'publicKey']) assert.ok(!isSecretKey(k), k);
  assert.ok(SECRET_KEYS.includes('privatekey'));
});

test('secret-in-file: a key named for a seed in the header, at its line, reported once and never shown in any format', async () => {
  const p = doc([objectEvent()], { epcisHeader: { seedPhrase: MNEMONIC } });
  const f = findingsOf(p);
  assert.deepEqual(f.map((x) => x.id), ['secret-in-file'], 'the key is reported once, as a secret');
  assert.match(f[0].message, /^The file holds the key "seedPhrase", which names a seed, a mnemonic or a private key\. The tool never reads one, and the value is not shown\.$/);
  assert.equal(f[0].line, lineOf(text(p), '"seedPhrase"'));
  assert.equal(f[0].file, 'events');
  for (const format of ['text', 'markdown', 'json', 'sarif']) {
    const r = await run({ 'events.json': text(p) }, [...ARGS, '--format', format]);
    assert.equal(r.code, 1, format);
    assert.ok(!r.out.includes('lantern'), format);
  }
});

test('secret-in-file: a value shaped like a key under any field, the field left out of the checks and never echoed', async () => {
  for (const [shape, value] of [['a mnemonic', MNEMONIC], ['an extended private key', XPRV], ['a private key in hex', HEX], ['a private key in WIF', WIF]]) {
    const p = [objectEvent({ eventID: value, 'example:note': value })];
    const r = checkText(text(p));
    const secrets = r.findings.filter((f) => f.id === 'secret-in-file');
    assert.equal(secrets.length, 2, shape);
    assert.match(secrets.find((f) => f.message.includes('"eventID"')).message, new RegExp(`^The value of "eventID" is shaped like ${shape}\\. The tool never reads a seed or a key, and the value is not shown\\.$`));
    assert.ok(!r.findings.some((f) => f.message.includes(value)), shape);
    assert.deepEqual(r.findings.map((f) => f.id), ['secret-in-file', 'secret-in-file'], `${shape}: the eventID is there, but not read, and not reported as missing`);
    const out = await run({ 'events.json': text(p) }, [...ARGS, '--json', '--explain']);
    assert.ok(!out.out.includes(value), shape);
  }
});

test('hex data of a sensor report under hexBinaryValue is not a key, and is never shown', async () => {
  const p = [objectEvent({ sensorElementList: SENSOR })];
  assert.deepEqual(findingsOf(p), []);
  assert.deepEqual(HEX_KEYS, ['hexBinaryValue']);
  assert.equal(hexNodes(readJson(text(p))).length, 1);
  assert.deepEqual(fileSecrets(readJson(text(p))), []);
  assert.equal(findSecrets(readJson(text(p))).length, 1, 'the search of the sibling tools alone takes the data for a key');
  for (const format of ['text', 'markdown', 'json', 'sarif']) assert.ok(!(await run({ 'events.json': text(p) }, [...ARGS, '--format', format])).out.includes('cd'.repeat(32)), format);
  assert.deepEqual(findingsOf([objectEvent({ sensorElementList: [{ sensorReport: [{ hexBinaryValue: `0x${'cd'.repeat(32)}` }] }] })]), [], 'with 0x in front');
});

test('a 64-hex value under any other key is still a key, and a mnemonic or a WIF under hexBinaryValue is still a secret', () => {
  assert.deepEqual(findingsOf([objectEvent({ 'example:hash': 'cd'.repeat(32) })]).map((f) => f.id), ['secret-in-file']);
  for (const value of [MNEMONIC, WIF, XPRV]) {
    const f = findingsOf([objectEvent({ sensorElementList: [{ sensorReport: [{ hexBinaryValue: value }] }] })]);
    assert.deepEqual(f.map((x) => x.id), ['secret-in-file']);
    assert.ok(!f.some((x) => x.message.includes(value)));
  }
  assert.deepEqual(findingsOf([objectEvent({ privateKey: { hexBinaryValue: 'cd'.repeat(32) } })]).map((f) => f.id), ['secret-in-file'], 'a value under a key named for a key stays hidden');
});

test('secret-in-file: a key shaped like a mnemonic is not shown, and a secret in a list or under a secret key is reported once', () => {
  const r = checkText(text([{ ...objectEvent(), [MNEMONIC]: 1, 'example:list': [HEX], privateKey: { nested: XPRV } }]));
  const secrets = r.findings.filter((f) => f.id === 'secret-in-file');
  assert.equal(secrets.length, 3);
  assert.ok(secrets.some((f) => /a key shaped like a mnemonic/.test(f.message)));
  assert.ok(secrets.some((f) => /^The value of "example:list" is shaped like a private key in hex/.test(f.message)));
  assert.ok(secrets.some((f) => /the key "privateKey"/.test(f.message)));
  assert.ok(!r.findings.some((f) => f.message.includes('lantern') || f.message.includes(HEX) || f.message.includes(XPRV)));
});

test('secret-in-file: a secret value where a time, a list, a place or an event belongs is not described and not reported as missing', () => {
  const only = (p) => assert.deepEqual(findingsOf(p).map((f) => f.id), ['secret-in-file'], JSON.stringify(p).slice(0, 120));
  only([objectEvent({ eventTime: WIF })]);
  only([objectEvent({ eventTimeZoneOffset: WIF })]);
  only([objectEvent({ epcList: WIF, quantityList: [{ epcClass: 'urn:epc:class:lgtin:9521234.012346.L1', quantity: 1 }] })]);
  only([objectEvent({ epcList: [sgtin(), WIF] })]);
  only([objectEvent({ readPoint: WIF, bizLocation: { id: 'urn:epc:id:sgln:9521234.00001.0' } })]);
  only([objectEvent({ readPoint: { id: WIF } })]);
  only([objectEvent({ type: WIF, readPoint: { id: 'urn:epc:id:sgln:9521234.00001.0' } })]);
  only([objectEvent({ action: WIF })]);
  only([objectEvent({ bizStep: WIF })]);
  only([objectEvent({ quantityList: [{ epcClass: 'urn:epc:class:lgtin:9521234.012346.L1', quantity: 1, uom: WIF }] })]);
  only([objectEvent({ errorDeclaration: WIF })]);
  only([objectEvent(), WIF]);
  only(doc(WIF));
  only({ ...doc(), epcisBody: { eventList: WIF } });
  only({ ...doc(), epcisBody: WIF });
});
