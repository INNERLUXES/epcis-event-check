import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, USAGE, VERSION, buildReport, checkText, listChecksJson, listChecksMarkdown, listChecksText, main, parseArgs, toJson, toMarkdown, toSarif, toText } from '../src/index.js';
import { ARGS, BAD, GOOD, NOW, aggregationEvent, at, cli, doc, ioEvent, objectEvent, run, sgtin, text } from './helpers.js';

const ch = (...codes) => String.fromCharCode(...codes);
// A file with an error and a warning: an action in small letters, and no bizStep.
const MIXED = { 'events.json': text(doc([objectEvent({ action: 'observe', bizStep: undefined })])) };
const mem = { file: 'mem.json', bytes: 1, lines: 1 };

test('exit codes: 0 for a pass, 1 for a finding at or above the fail-on level, 2 for a usage or input error', async () => {
  assert.equal((await run(GOOD, ARGS)).code, 0);
  assert.equal((await run(BAD, ARGS)).code, 1);
  assert.equal((await run(GOOD, ['nothing.json'])).code, 2);
  assert.equal((await run(GOOD, [])).code, 2);
  assert.equal((await run(GOOD, ['events.json', 'other.json'])).code, 2);
  assert.equal((await run(GOOD, ['events.json', '--bogus'])).code, 2);
  const none = await run({}, ['a.json']);
  assert.equal(none.code, 2);
  assert.match(none.err, /the input has a problem:\n {2}a\.json: does not exist\n/);
});

test('--fail-on and --min-severity: a warning fails the run at warning, and a hidden finding still counts for the result', async () => {
  const w = { 'w.json': text(doc([objectEvent({ bizStep: undefined })])) };
  assert.equal((await run(w, ['w.json'])).code, 0);
  assert.equal((await run(w, ['w.json', '--fail-on', 'warning'])).code, 1);
  assert.equal((await run(w, ['w.json', '--fail-on', 'info'])).code, 1);
  const r = await run(MIXED, [...ARGS, '--min-severity', 'error']);
  assert.match(r.out, /findings: 1 \(1 error\); 1 below error not shown\n/);
  const hidden = await run(w, ['w.json', '--min-severity', 'error', '--fail-on', 'warning']);
  assert.match(hidden.out, /findings: 0; 1 below error not shown/);
  assert.equal(hidden.code, 1);
  const info = { 'i.json': text(doc([objectEvent({ eventID: undefined })])) };
  assert.equal((await run(info, ['i.json'])).code, 0);
  assert.equal((await run(info, ['i.json', '--fail-on', 'info'])).code, 1, 'a note fails the run at info');
});

test('--now: a time with a zone, given once, that turns future-event on', async () => {
  assert.equal(parseArgs(['e.json']).now, null);
  assert.equal(parseArgs(['e.json', '--now', NOW]).now, NOW);
  assert.equal(parseArgs(['e.json', '--now', '2101-03-10T13:00:00.5+01:00']).now, '2101-03-10T13:00:00.5+01:00');
  for (const [bad, why] of [['2101-03-10T12:00:00', /has no time zone/], ['2101-03-10', /is not a date and time written/], ['2101-02-30T12:00:00Z', /has the day 30/], ['now', /is not a date and time/]]) assert.throws(() => parseArgs(['e.json', '--now', bad]), (e) => e.message.startsWith(`--now: ${bad} `) && why.test(e.message), bad);
  assert.throws(() => parseArgs(['e.json', '--now', NOW, '--now', NOW]), /given twice/);
  const late = { 'e.json': text(doc([objectEvent({ eventTime: '2101-03-11T08:00:00.000+01:00' })])) };
  assert.equal((await run(late, ['e.json'])).code, 0);
  const r = await run(late, ['e.json', '--now', NOW]);
  assert.equal(r.code, 1);
  assert.match(r.out, /ERROR {4}future-event/);
  assert.match(r.out, /\nnow: 2101-03-10T12:00:00Z, from --now\n/);
  assert.match((await run(late, ['e.json'])).out, /\nnow: not given, so future-event did not run\n[\s\S]*\nnote: no --now was given, so future-event did not run\n/);
  const json = JSON.parse((await run(GOOD, [...ARGS, '--json', '--now', NOW])).out);
  assert.deepEqual(json.options, { minSeverity: 'info', failOn: 'error', now: NOW });
});

test('the text report names the file, the document, the events, the checks, each finding with its line and fix, the event types, and ends with the notice and the result', async () => {
  const r = await run(MIXED, ARGS);
  assert.match(r.out, /^epcis-event-check: events\.json\n/);
  assert.match(r.out, /\nfile: events\.json \(JSON, \d+ lines, [\d,]+ bytes\)\n/);
  assert.match(r.out, /\ndocument: EPCISDocument, schema version 2\.0, created 2101-03-10T12:00:00\.000Z\n/);
  assert.match(r.out, /\nevents: 1 \(1 ObjectEvent\)\n/);
  assert.match(r.out, /\nidentifiers: 1 EPC, 0 classes and 1 place\n/);
  assert.match(r.out, /\nevent times: 2101-03-01T08:00:00\.000\+01:00\n/);
  assert.match(r.out, /\nfindings: 2 \(1 error, 1 warning\)\n/);
  assert.match(r.out, /ERROR {4}action-invalid +events\.json:\d+\n/);
  assert.match(r.out, /fix: Write ADD, OBSERVE or DELETE, in capitals/);
  assert.match(r.out, /\nChecks \(32\)\n/);
  assert.ok(r.out.includes(['Event types (1)', '', '  type         events  ADD  OBSERVE  DELETE  no action', '  ObjectEvent  1       0    0        0       1'].join('\n')));
  assert.match(r.out, /what really happened\.\n\nRESULT: FAIL - 1 finding at or above error \(1 error, 1 warning\)\n$/);
  const good = await run(GOOD, ARGS);
  assert.match(good.out, /Findings \(0\)\n\n {2}none\n/);
});

test('the text report of a list of events, of a document read in part, and of a file of no event', async () => {
  const list = (await run({ 'e.json': text([objectEvent(), aggregationEvent({ eventTime: at(9) }, 2), ioEvent({ eventTime: at(10) }, 3), objectEvent({ type: 'Thing' }, 4)]) }, ['e.json'])).out;
  assert.match(list, /\ndocument: a JSON list of events, with no EPCISDocument around it\n/);
  assert.match(list, /\nevents: 4 \(1 ObjectEvent, 1 AggregationEvent, 1 TransformationEvent and 1 of another or no type\)\n/);
  assert.match(list, /\nevent times: from 2101-03-01T08:00:00\.000\+01:00 to 2101-03-01T10:00:00\.000\+01:00\n/);
  assert.ok(list.includes('  TransformationEvent  1       0    0        0       1\n  other                1       0    1        0       0\n'));
  const part = (await run({ 'e.json': text(doc([objectEvent({ eventTime: 'x' })], { type: 'Nope', schemaVersion: 'v', creationDate: 7 })) }, ['e.json'])).out;
  assert.match(part, /\ndocument: type not read, schema version not read, created at a time not read\n/);
  assert.match(part, /\nevent times: none read\n/);
  const empty = (await run({ 'e.json': text(doc([])) }, ['e.json'])).out;
  assert.match(empty, /\nevents: 0\n/);
  assert.doesNotMatch(empty, /\nEvent types \(/);
  assert.match(empty, /\nnote: the eventList is empty, so there was no event to check\n/);
  assert.doesNotMatch(empty, /no --now was given/);
  const json = JSON.parse((await run({ 'e.json': text([objectEvent()]) }, ['e.json', '--json'])).out);
  assert.deepEqual(json.document, { form: 'list', type: null, schemaVersion: null, creationDate: null, events: 1, epcs: 1, classes: 0, places: 1, firstEventTime: at(8), lastEventTime: at(8) });
  assert.deepEqual(json.eventTypes, [{ type: 'ObjectEvent', events: 1, ADD: 0, OBSERVE: 1, DELETE: 0, none: 0 }]);
});

test('--explain adds the points of the standards to text, markdown and JSON, and the tool\'s own choice to a best practice check', async () => {
  const set = { 'events.json': text(doc([objectEvent({ action: 'observe', readPoint: undefined })])) };
  const r = await run(set, [...ARGS, '--explain']);
  assert.match(r.out, /basis: The Action type of EPCIS has exactly three values, ADD, OBSERVE and DELETE.*\(EPCIS Standard, Release 2\.0, GS1, https:\/\/ref\.gs1\.org\/standards\/epcis\/\)/);
  assert.match(r.out, /the tool's own choice: asking for a readPoint or a bizLocation is a best practice of this tool/);
  const md = (await run(set, [...ARGS, '--format', 'markdown', '--explain'])).out;
  assert.match(md, /## Basis\n\n### action-invalid\n\n- The Action type of EPCIS/);
  assert.match(md, /### where-missing\n\n- The tool's own choice: asking for a readPoint/);
  const input = (await run({ 'events.json': text(doc([objectEvent({ zz: 1 })])) }, [...ARGS, '--format', 'markdown', '--explain'])).out;
  assert.match(input, /### field-unknown\n\n- A problem with the file itself; it rests on no standard\./);
  const json = JSON.parse((await run(set, [...ARGS, '--json', '--explain'])).out);
  assert.ok(json.findings.every((f) => Array.isArray(f.basis)));
  const plain = JSON.parse((await run(set, [...ARGS, '--json'])).out);
  assert.ok(plain.findings.every((f) => f.basis === undefined && f.own === undefined));
});

test('the markdown report: the head, a table of findings, the event types, the notes and the notice, with markdown escaped', async () => {
  const r = await run(MIXED, [...ARGS, '--format', 'markdown']);
  assert.match(r.out, /^# epcis-event-check: events\.json\n\n- File: events\.json \\\(JSON, /);
  assert.match(r.out, /\n- Events: 1 \\\(1 ObjectEvent\\\)\n/);
  assert.match(r.out, /\n- Result: \*\*FAIL - 1 finding at or above error \\\(1 error, 1 warning\\\)\*\*\n/);
  assert.match(r.out, /\| Level \| Check \| Where \| Message \|\n\| --- \| --- \| --- \| --- \|\n\| error \| action-invalid \| events\.json:\d+ \|/);
  assert.match(r.out, /## Event types \(1\)\n\n\| Type \| Events \| ADD \| OBSERVE \| DELETE \| No action \|/);
  assert.match(r.out, /\nNote: no --now was given, so future-event did not run\n/);
  const good = await run(GOOD, [...ARGS, '--format', 'markdown']);
  assert.match(good.out, /## Findings\n\nNone\.\n/);
  const link = await run({ 'events.json': text(doc([objectEvent({ epcList: ['[x](https://example.com)|<b>'] })])) }, [...ARGS, '--format', 'markdown']);
  assert.ok(link.out.includes('\\[x\\]\\(https://example.com\\)\\|\\<b\\>'));
  assert.ok(!link.out.includes('[x](https://example.com)'));
});

test('the JSON report: every finding with its id, severity, message, file, line, column, subject and fix', async () => {
  const r = JSON.parse((await run(MIXED, [...ARGS, '--json'])).out);
  assert.equal(r.tool, 'epcis-event-check');
  assert.equal(r.version, VERSION);
  assert.deepEqual(Object.keys(r.findings[0]), ['id', 'severity', 'message', 'file', 'line', 'column', 'at', 'subject', 'fix', 'kind']);
  assert.equal(r.findings[0].subject, 'event 1');
  assert.deepEqual(r.totals, { findings: 2, byLevel: { error: 1, warning: 1, info: 0 }, hidden: 0 });
  assert.equal(r.rules.length, RULES.length);
  assert.equal(r.result.pass, false);
  assert.deepEqual(r.input, { file: 'events.json', format: 'json', bytes: Buffer.byteLength(MIXED['events.json']), lines: MIXED['events.json'].split('\n').length - 1 });
});

test('the SARIF report: the checks as rules, the file as the artifact, a result with its line and column for each finding', async () => {
  const s = JSON.parse((await run(MIXED, [...ARGS, '--format', 'sarif'])).out);
  assert.equal(s.version, '2.1.0');
  const runOf = s.runs[0];
  assert.equal(runOf.tool.driver.name, 'epcis-event-check');
  assert.equal(runOf.tool.driver.rules.length, RULES.length);
  assert.equal(runOf.tool.driver.rules.find((x) => x.id === 'event-id-missing').defaultConfiguration.level, 'note');
  assert.deepEqual(runOf.artifacts, [{ location: { uri: 'events.json' } }]);
  const res = runOf.results.find((x) => x.ruleId === 'action-invalid');
  assert.equal(res.level, 'error');
  assert.equal(runOf.tool.driver.rules[res.ruleIndex].id, 'action-invalid');
  assert.ok(res.locations[0].physicalLocation.region.startLine > 1);
  assert.ok(res.locations[0].physicalLocation.region.startColumn > 1);
  assert.equal(runOf.properties.sources.length, 5);
  assert.equal(runOf.results.find((x) => x.ruleId === 'why-missing').level, 'warning');
});

test('--list-checks in text, markdown and JSON, and not in SARIF', async () => {
  const t = await cli(['--list-checks'], process.cwd());
  assert.equal(t.code, 0);
  assert.ok(t.out.startsWith('epcis-event-check checks\n'));
  for (const r of RULES) assert.ok(t.out.includes(r.id), r.id);
  assert.match(t.out, /None of it certifies conformance\./);
  assert.equal(t.out, listChecksText());
  assert.equal((await cli(['--list-checks', '--format', 'markdown'], process.cwd())).out, listChecksMarkdown());
  const j = JSON.parse(listChecksJson());
  assert.equal(j.length, RULES.length);
  assert.deepEqual(Object.keys(j[0]), ['id', 'severity', 'kind', 'summary', 'fix', 'basis', 'own']);
  assert.equal((await cli(['--list-checks', '--format', 'sarif'], process.cwd())).code, 2);
});

test('the usage: --help, --version, unknown options, values that look like options, standard input and URLs', async () => {
  const h = await cli(['--help'], process.cwd());
  assert.equal(h.code, 0);
  assert.equal(h.out, USAGE);
  for (const opt of ['--format', '--json', '--min-severity', '--fail-on', '--now', '--explain', '--list-checks']) assert.ok(USAGE.includes(opt), opt);
  assert.equal((await cli(['-h'], process.cwd())).code, 0);
  assert.equal((await cli(['--version'], process.cwd())).out, `${VERSION}\n`);
  assert.equal((await cli(['-v'], process.cwd())).out, '1.0.0\n');
  const bad = [
    [['e.json', '--format'], /--format needs a value/],
    [['e.json', '--format', '--json'], /--format needs a value/],
    [['e.json', '--format', 'xml'], /unknown format xml/],
    [['e.json', '--json', '--format', 'text'], /--json and --format text ask for two formats/],
    [['e.json', '--min-severity', 'high'], /--min-severity: unknown level high/],
    [['e.json', '--fail-on', 'all'], /--fail-on: unknown level all/],
    [['e.json', '--format', 'json', '--format', 'json'], /--format was given twice/],
    [['-'], /reading from standard input is not supported/],
    [['e.json', '--now', '-'], /reading from standard input is not supported/],
    [['https://example.com/events.json'], /give a local path; the tool never fetches a URL/],
    [['e.json', '--format', 'sarif', '--explain'], /--explain adds the points of the standards to the text, markdown and JSON reports/],
    [['--explain'], /give the event file, such as epcis-event-check events\.json/],
    [['a.json', 'b.json'], /give one event file/],
    [['e.json', '-x'], /unknown argument -x/]
  ];
  for (const [argv, pattern] of bad) assert.throws(() => parseArgs(argv), pattern, argv.join(' '));
  const r = await cli(['e.json', '--bogus'], process.cwd());
  assert.match(r.err, /^epcis-event-check: unknown argument --bogus\n\nUsage: epcis-event-check/);
  assert.equal(parseArgs(['e.json', '--json']).format, 'json');
  assert.equal(parseArgs(['e.json', '--json', '--format', 'json']).format, 'json');
});

test('an error that is not about the input is reported with exit code 2 and no report', async () => {
  const r = await cli(['events.json'], { toString: () => { throw new Error('the folder is gone'); } });
  assert.equal(r.code, 2);
  assert.match(r.err, /^epcis-event-check: /);
  let out = '';
  const code = await main(['--version'], { out: (t) => { out += t; }, err: () => {} });
  assert.equal(code, 0);
  assert.equal(out, `${VERSION}\n`);
});

test('text from the input never reaches the output with control, separator or direction characters', async () => {
  const nasty = `urn:x:${ch(0x1b)}[2J${ch(0x202e)}a${ch(0x2028)}b${ch(7)}`;
  for (const format of ['text', 'markdown', 'json', 'sarif']) {
    const r = await run({ 'events.json': text(doc([objectEvent({ bizStep: nasty, epcList: [nasty] })])) }, [...ARGS, '--format', format]);
    const shown = format === 'text' || format === 'markdown' ? r.out : JSON.stringify(JSON.parse(r.out));
    assert.ok(![ch(0x1b), ch(0x202e), ch(0x2028), ch(7)].some((c) => (format === 'json' || format === 'sarif' ? r.out.includes(c) || shown.includes('\\u001b') : shown.includes(c))), format);
  }
});

test('buildReport and the formats in memory: a hidden level, notes and every format of one report', () => {
  const checked = checkText(text(doc([objectEvent({ eventID: undefined, bizStep: undefined })])), { now: NOW });
  const r = buildReport({ file: mem, checked, version: '9.9.9', minSeverity: 'warning', failOn: 'info', now: NOW });
  assert.deepEqual(r.totals, { findings: 1, byLevel: { error: 0, warning: 1, info: 0 }, hidden: 1 });
  assert.equal(r.result.pass, false);
  assert.match(toText(r), /findings: 1 \(1 warning\); 1 below warning not shown/);
  assert.match(toMarkdown(r), /- Now: 2101-03-10T12:00:00Z, from --now/);
  assert.equal(JSON.parse(toJson(r)).version, '9.9.9');
  assert.equal(JSON.parse(toSarif(r)).runs[0].results.length, 1);
  const unread = buildReport({ file: mem, checked: checkText('['), version: '0' });
  assert.equal(unread.document, null);
  assert.match(toText(unread), /\ndocument: not read\n/);
  assert.match(toMarkdown(unread), /\n- Document: not read\n/);
  assert.equal(unread.eventTypes, null);
});

test('one EPC in both forms counts once, and a run with two events of one time shows the time once', async () => {
  const r = JSON.parse((await run({ 'e.json': text([objectEvent(), objectEvent({ epcList: ['https://id.gs1.org/01/09521234123453/21/1001', sgtin('2')] }, 2)]) }, ['e.json', '--json'])).out);
  assert.equal(r.document.epcs, 2);
  assert.equal(r.document.firstEventTime, r.document.lastEventTime);
});
