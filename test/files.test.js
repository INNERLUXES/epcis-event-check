import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, symlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { FILE_LIMITS, InputError, checkFile, decode, displayPath, locateInput, readInputText } from '../src/index.js';
import { ARGS, GOOD, cli, run, withFiles } from './helpers.js';

test('decode: UTF-8 with and without a byte order mark, and UTF-16 in both byte orders', () => {
  assert.equal(decode(Buffer.from('[]\n')), '[]\n');
  assert.equal(decode(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('"\u00e9"', 'utf16le')])), '"\u00e9"');
  const be = Buffer.from('{"a": 1}', 'utf16le').swap16();
  assert.equal(decode(Buffer.concat([Buffer.from([0xfe, 0xff]), be])), '{"a": 1}');
});

test('decode: the byte order mark of UTF-8 is dropped', () => {
  assert.equal(decode(Buffer.from([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), '{}');
});

test('decode: a null byte, bytes that are not UTF-8, an odd number of UTF-16 bytes and a lone UTF-16 surrogate are refused', () => {
  assert.throws(() => decode(Buffer.from([0x7b, 0x00, 0x7d])), /null byte/);
  assert.throws(() => decode(Buffer.from([0xc3, 0x28])), /not valid UTF-8/);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x61])), /odd number of bytes/);
  assert.throws(() => decode(Buffer.from([0xff, 0xfe, 0x00, 0xd8])), /not valid UTF-16/);
});

test('displayPath: relative with forward slashes inside the folder, and the whole path outside it', () => {
  const base = resolve('/work/project');
  assert.equal(displayPath(resolve(base, 'batches/events.json'), base), 'batches/events.json');
  const outside = resolve(base, '..', 'elsewhere', 'events.json');
  assert.ok(!displayPath(outside, base).includes('\\'));
  assert.ok(displayPath(outside, base).endsWith('elsewhere/events.json'));
});

test('locateInput: a file is read; a folder and a missing path are refused', async () => {
  await withFiles({ 'a/events.json': GOOD['events.json'] }, async (dir) => {
    assert.equal(await locateInput('a/events.json', dir), resolve(dir, 'a/events.json'));
    await assert.rejects(locateInput('a', dir), /is a folder; give the event file/);
    await assert.rejects(locateInput('missing.json', dir), /does not exist/);
    await assert.rejects(locateInput('a/events.json/x', dir), /does not exist/);
  });
});

test('an absolute path is used as it is, with resolve() and not a join', async () => {
  await withFiles(GOOD, async (dir) => {
    const r = await cli([resolve(dir, 'events.json')], process.cwd());
    assert.equal(r.code, 0, r.err);
  });
});

test('a file over the size limit is refused before it is read, and the limit is in the error', async () => {
  await withFiles(GOOD, async (dir) => {
    await assert.rejects(checkFile({ path: 'events.json', version: '0', base: dir, limits: { maxBytes: 200 } }), (e) => e instanceof InputError && /larger than 200 bytes/.test(e.message));
  });
  assert.ok(FILE_LIMITS.maxBytes >= 1024 * 1024);
});

test('a binary file, and bytes that are not UTF-8, are an input error with exit code 2 and no report', async () => {
  const bin = await run({ 'events.json': Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]) }, ARGS);
  assert.equal(bin.code, 2);
  assert.match(bin.err, /events.json: holds a null byte/);
  assert.equal(bin.out, '');
  const bad = await run({ 'events.json': Buffer.from([0x7b, 0xc3, 0x28, 0x7d]) }, ARGS);
  assert.equal(bad.code, 2);
  assert.match(bad.err, /events.json: is not valid UTF-8/);
  const none = await run({}, ['a.json']);
  assert.match(none.err, /a problem:\n {2}a\.json: does not exist/);
});

test('an empty file, and a file that is not JSON, are an error finding, not a pass', async () => {
  const r = await run({ 'events.json': '' }, ARGS);
  assert.equal(r.code, 1);
  assert.match(r.out, /ERROR {4}file-unreadable +events\.json:1\n/);
  assert.match(r.out, /the file holds no JSON value/);
  assert.match(r.out, /\ndocument: not read\n/);
  const xml = await run({ 'events.json': '<epcis:EPCISDocument/>\n' }, ARGS);
  assert.equal(xml.code, 1);
  assert.match(xml.out, /The file is not JSON the reader can follow: expected a value and found "<" at line 1, column 1\. Nothing in the file was checked\./);
});

test('a symbolic link is refused by name, not followed', { skip: process.platform === 'win32' ? 'creating symbolic links needs a privilege on Windows' : false }, async () => {
  await withFiles({ 'real/events.json': GOOD['events.json'] }, async (dir) => {
    await mkdir(resolve(dir, 'linked'));
    await symlink(resolve(dir, 'real/events.json'), resolve(dir, 'linked/events.json'));
    const r = await cli(['linked/events.json'], dir);
    assert.equal(r.code, 2);
    assert.match(r.err, /symbolic link/);
  });
});

test('a device is refused as not a regular file', { skip: process.platform === 'win32' ? 'there is no /dev/null on Windows' : false }, async () => {
  const r = await cli(['/dev/null'], process.cwd());
  assert.equal(r.code, 2);
  assert.match(r.err, /not a regular file/);
});

test('readInputText reads a file through a handle and reports its size in bytes', async () => {
  await withFiles({ 'events.json': '"\u00e9"\n' }, async (dir) => {
    const r = await readInputText(resolve(dir, 'events.json'), dir);
    assert.equal(r.text, '"\u00e9"\n');
    assert.equal(r.bytes, 5);
  });
});

test('a file of events with another extension is still read as JSON', async () => {
  const r = await run({ 'events.jsonld': GOOD['events.json'] }, ['events.jsonld']);
  assert.equal(r.code, 0);
  assert.match(r.out, /\nfile: events.jsonld \(JSON, /);
});
