import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../src/index.js';
import { BAD, EXPECTED, GOOD, GOOD_EXPECTED, NOW, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const BAD_FILE = 'examples/bad/events.json';
const GOOD_FILE = 'examples/good/events.json';

test('examples: the bad file fails with the report that is saved in examples/output', async () => {
  const r = await run(BAD);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('bad.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the good file passes at error, warning and info level with the report that is saved', async () => {
  const r = await run(GOOD);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('good.txt'));
  for (const e of GOOD_EXPECTED) assert.ok(r.out.includes(e), e);
  assert.equal((await run([...GOOD, '--fail-on', 'warning'])).code, 0);
  assert.equal((await run([...GOOD, '--fail-on', 'info'])).code, 0);
  assert.doesNotMatch(r.out, /ERROR {4}|WARNING {2}|INFO {5}/);
  assert.doesNotMatch(r.out, /\nnote: /);
  assert.equal(NOW, '2101-03-10T12:00:00Z');
});

test('examples: every output saved in examples/output is the real output, in all four formats for both files', async () => {
  const outputs = {
    'bad-explain.txt': [...BAD, '--explain'],
    'bad.md': [...BAD, '--format', 'markdown'],
    'bad-explain.md': [...BAD, '--format', 'markdown', '--explain'],
    'bad.json': [...BAD, '--json', '--explain'],
    'bad.sarif': [...BAD, '--format', 'sarif'],
    'good.md': [...GOOD, '--format', 'markdown'],
    'good.json': [...GOOD, '--json'],
    'good.sarif': [...GOOD, '--format', 'sarif'],
    'checks.txt': ['--list-checks'],
    'checks.json': ['--list-checks', '--format', 'json']
  };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: every check but file-unreadable fires on the bad file, each on the line built for it', async () => {
  const report = JSON.parse((await run([...BAD, '--json'])).out);
  const lines = (await readFile(resolve(root, BAD_FILE), 'utf8')).split('\n');
  const at = (needle, n = 1) => {
    let seen = 0;
    for (let i = 0; i < lines.length; i += 1) if (lines[i].includes(needle) && (seen += 1) === n) return `${BAD_FILE}:${i + 1}`;
    throw new Error(`${needle} x${n}`);
  };
  // The first line that holds needle after the first line that holds start.
  const after = (start, needle) => {
    const from = lines.findIndex((l) => l.includes(start));
    return `${BAD_FILE}:${from + 1 + lines.slice(from).findIndex((l) => l.includes(needle))}`;
  };
  const of = (id) => report.findings.filter((f) => f.id === id).map((f) => f.at).sort();
  const sorted = (...a) => a.sort();
  assert.deepEqual(of('secret-in-file'), [at('"mnemonic"')]);
  assert.deepEqual(of('field-duplicate'), [at('"epcList": ["urn:epc:id:sgtin:9521234.012345.1001", "urn:epc:id:sgtin:9521234.012345.1001"]')]);
  assert.deepEqual(of('field-unknown'), [at('"bizLocaton"')]);
  assert.deepEqual(of('event-type-unknown'), [at('"type": "Object"')]);
  assert.deepEqual(of('event-time-missing'), [`${BAD_FILE}:${Number(at('"urn:uuid:00000000-0000-4000-8000-000000000003"').split(':').at(-1)) - 2}`]);
  assert.deepEqual(of('event-time-invalid'), [at('"2101-03-01T08:20:00"')]);
  assert.deepEqual(of('timezone-offset-invalid'), [at('"+14:30"')]);
  assert.deepEqual(of('action-invalid'), [at('"action": "add"')]);
  assert.deepEqual(of('biz-step-unknown'), sorted(at('"Commissioning"'), at('"urn:epcglobal:cbv:bizstep:shipped"')));
  assert.deepEqual(of('action-missing'), [`${BAD_FILE}:${Number(at('"urn:uuid:00000000-0000-4000-8000-000000000005"').split(':').at(-1)) - 2}`]);
  assert.deepEqual(of('timezone-offset-missing'), of('action-missing'));
  assert.deepEqual(of('aggregation-child-in-two-parents'), [at('"childEPCs": ["urn:epc:id:sgtin:9521234.012345.1001"]', 2)]);
  assert.deepEqual(of('transformation-with-action'), [after('"type": "TransformationEvent"', '"action"')]);
  assert.deepEqual(of('transformation-inputs-outputs-empty'), [at('"inputQuantityList"')]);
  assert.deepEqual(of('quantity-invalid'), [at('"inputQuantityList"')]);
  assert.deepEqual(of('field-invalid'), [at('"quantity": "5"')]);
  assert.deepEqual(of('event-id-duplicate'), [at('"urn:uuid:00000000-0000-4000-8000-000000000009"', 2)]);
  assert.deepEqual(of('field-missing'), [at('"readPoint": {}')]);
  assert.deepEqual(of('why-missing'), [`${BAD_FILE}:${Number(at('"urn:uuid:00000000-0000-4000-8000-000000000009"', 2).split(':').at(-1)) - 2}`]);
  assert.deepEqual(of('disposition-unknown'), [at('"non_sellable_expired"')]);
  assert.deepEqual(of('event-id-missing'), [`${BAD_FILE}:${Number(at('"bizStep": "decommissioning"').split(':').at(-1)) - 6}`]);
  assert.deepEqual(of('object-after-delete'), [at('"epcList": ["urn:epc:id:sgtin:9521234.012345.1003"]', 4)]);
  assert.deepEqual(of('shipped-before-received'), [at('"epcList": ["urn:epc:id:sscc:9521234.0000000002"]', 2)]);
  assert.deepEqual(of('event-out-of-order'), [at('"recordTime"')]);
  assert.deepEqual(of('epc-uri-malformed'), [at('urn:epc:id:sgtin:9521234.01234.1')]);
  assert.deepEqual(of('gtin-check-digit-invalid'), [at('urn:epc:id:sgtin:9521234.01234.1')]);
  assert.deepEqual(of('sscc-check-digit-invalid'), [at('urn:epc:id:sgtin:9521234.01234.1')]);
  assert.deepEqual(of('gln-check-digit-invalid'), [at('https://id.gs1.org/414/9521234000019')]);
  assert.deepEqual(of('future-event'), [at('"2101-03-20T08:00:00.000+01:00"')]);
  assert.deepEqual(of('where-missing'), [`${BAD_FILE}:${Number(at('"urn:uuid:00000000-0000-4000-8000-000000000016"').split(':').at(-1)) - 2}`]);
  assert.deepEqual(of('what-missing'), [`${BAD_FILE}:${Number(at('"urn:uuid:00000000-0000-4000-8000-000000000017"').split(':').at(-1)) - 2}`]);
  // file-unreadable needs a file that cannot be read; test/files.test.js covers it.
  assert.deepEqual(report.rules.filter((r) => r.findings === 0).map((r) => r.id), ['file-unreadable']);
  assert.equal(report.rules.length, RULES.length);
});

test('examples: the good file holds no finding and no note, and the table of event types is the one of its file', async () => {
  const report = JSON.parse((await run([...GOOD, '--json'])).out);
  assert.deepEqual(report.findings, []);
  assert.deepEqual(report.notes, []);
  assert.deepEqual(report.eventTypes.map((x) => [x.type, x.events]), [['ObjectEvent', 3], ['AggregationEvent', 2], ['TransactionEvent', 1], ['TransformationEvent', 1], ['AssociationEvent', 1]]);
  assert.deepEqual([report.document.epcs, report.document.classes, report.document.places], [5, 2, 2]);
});

test('examples: the same files written with CRLF line ends and as UTF-16 give the same findings', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'epcis-event-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    for (const [file, args] of [[BAD_FILE, BAD], [GOOD_FILE, GOOD]]) {
      const ids = async () => JSON.parse((await run([...args, '--json'], dir)).out).findings.map((f) => `${f.id}:${f.at}:${f.column}`);
      const base = await ids();
      const text = await readFile(resolve(root, file), 'utf8');
      await writeFile(resolve(dir, file), text.split('\n').join('\r\n'));
      assert.deepEqual(await ids(), base, `${file} with CRLF`);
      await writeFile(resolve(dir, file), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
      assert.deepEqual(await ids(), base, `${file} as UTF-16`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('examples: the files are plain ASCII with LF line ends, made up under the GS1 Prefix 952, in the made-up year, and hold no real key', async () => {
  for (const f of [BAD_FILE, GOOD_FILE]) {
    const text = await readFile(resolve(root, f), 'utf8');
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), f);
    assert.ok(!text.includes('\r'), f);
    assert.doesNotMatch(text, /\b(?:19|20)\d{2}\b/, f);
    assert.match(text, /Made-up EPCIS document for the examples of epcis-event-check/, f);
    assert.match(text, /It is not a certification of anything\./, f);
    for (const m of text.matchAll(/urn:epc:(?:id|class):\w+:(\d+)\./g)) assert.equal(m[1], '9521234', m[0]);
    for (const m of text.matchAll(/\b(\d{4})-\d{2}-\d{2}T/g)) assert.equal(m[1], '2101', m[0]);
  }
  for (const o of ['bad.txt', 'bad.json', 'bad.md', 'bad.sarif', 'bad-explain.txt', 'bad-explain.md', 'good.txt', 'good.json', 'good.md', 'good.sarif']) {
    const out = await saved(o);
    assert.ok(!out.includes('lantern'), `${o} does not show the seed`);
  }
});

test('examples: the sample output of the bad file is the one the README shows', async () => {
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const bad = (await saved('bad.txt')).split('\n');
  assert.ok(readme.includes(bad.slice(0, bad.findIndex((l) => l.startsWith('Findings ('))).join('\n')));
  assert.ok(readme.includes(bad.slice(-4).join('\n')));
});
