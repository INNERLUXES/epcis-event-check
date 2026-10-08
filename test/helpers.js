// Shared test helpers: EPCIS events built inline, checked in memory or written into a temporary folder that is removed
// after the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and
// Windows. The line a test expects is found with lineOf(), which counts lines the way the reader does, so a test never
// holds a line number worked out by hand for one system only. No test reads the clock, the time zone or the locale.
// Every identifier is made up, under the GS1 Prefix 952 that GS1 keeps for examples, and every time is in the made-up
// year 2101.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkText, main } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'epcis-event-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return text.slice(0, at).split('\n').length;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');

// The moment the tests are checked at, and a time of the first days of March of the made-up year, at an offset of +01:00.
export const NOW = '2101-03-10T12:00:00Z';
export const at = (hour, minute = 0, day = 1) => `2101-03-${pad(day)}T${pad(hour)}:${pad(minute)}:00.000+01:00`;

// Made-up identifiers of the GS1 Company Prefix 9521234.
export const sgtin = (serial = '1001', item = '012345') => `urn:epc:id:sgtin:9521234.${item}.${serial}`;
export const sscc = (serial = '0000000001') => `urn:epc:id:sscc:9521234.${serial}`;
export const sgln = (location = '00001', extension = '0') => `urn:epc:id:sgln:9521234.${location}.${extension}`;
export const lgtin = (lot = 'L1') => `urn:epc:class:lgtin:9521234.012346.${lot}`;
export const uuid = (n = 1) => `urn:uuid:00000000-0000-4000-8000-${pad(n, 12)}`;

const DEFAULTS = {
  ObjectEvent: { epcList: [sgtin()], action: 'OBSERVE', bizStep: 'inspecting' },
  AggregationEvent: { parentID: sscc(), childEPCs: [sgtin()], action: 'ADD', bizStep: 'packing' },
  TransactionEvent: { bizTransactionList: [{ type: 'po', bizTransaction: 'urn:epcglobal:cbv:bt:9521234000020:PO-1' }], epcList: [sgtin()], action: 'ADD', bizStep: 'accepting' },
  TransformationEvent: { inputEPCList: [sgtin('5001', '012346')], outputEPCList: [sgtin('6001', '012347')], bizStep: 'commissioning' },
  AssociationEvent: { parentID: sgln('00002', '7'), childEPCs: [sgtin()], action: 'ADD', bizStep: 'installing' }
};

// An event of a type that passes every check: its own eventID n, a time at 08:00 on the first day, the offset, a read
// point and a business step. over replaces fields, and a field set to undefined is left out.
export function event(type, over = {}, n = 1) {
  const out = { type, eventID: uuid(n), eventTime: at(8), eventTimeZoneOffset: '+01:00', readPoint: { id: sgln() }, ...structuredClone(DEFAULTS[type] ?? {}) };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}
export const objectEvent = (over, n) => event('ObjectEvent', over, n);
export const aggregationEvent = (over, n) => event('AggregationEvent', over, n);
export const transactionEvent = (over, n) => event('TransactionEvent', over, n);
export const ioEvent = (over, n) => event('TransformationEvent', over, n);
export const associationEvent = (over, n) => event('AssociationEvent', over, n);

// An EPCISDocument with these events; over replaces fields of the document, and a field set to undefined is left out.
export function doc(events = [objectEvent()], over = {}) {
  const out = { '@context': ['https://ref.gs1.org/standards/epcis/epcis-context.jsonld'], type: 'EPCISDocument', schemaVersion: '2.0', creationDate: '2101-03-10T12:00:00.000Z', epcisBody: { eventList: events } };
  for (const [k, v] of Object.entries(over)) {
    if (v === undefined) delete out[k];
    else out[k] = v;
  }
  return out;
}

export const text = (obj) => `${JSON.stringify(obj, null, 2)}\n`;

// The findings of a run in memory, for a document, a list of events or a text.
export const findingsOf = (p = doc(), options = {}) => checkText(typeof p === 'string' ? p : text(p), options).findings;

// The ids of the findings of a run.
export const idsOf = (p, options) => findingsOf(p, options).map((f) => f.id);

// The findings of one check.
export const ofCheck = (p, id, options) => findingsOf(p, options).filter((f) => f.id === id);

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// Writes the files and runs the command line in the folder.
export async function run(files, args) {
  return withFiles(files, (dir) => cli(args, dir));
}

// A clean document, and one with an action in small letters, for the command line tests.
export const GOOD = { 'events.json': text(doc()) };
export const BAD = { 'events.json': text(doc([objectEvent({ action: 'observe' })])) };
export const ARGS = ['events.json'];

// The time a hostile test may take: four times as long when the runner collects coverage, which sets NODE_V8_COVERAGE.
export const allowed = (ms) => (process.env.NODE_V8_COVERAGE ? ms * 4 : ms);
