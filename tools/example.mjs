// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// EPCIS documents to examples/output. CI runs it and then fails if those files changed, so the example output in the
// repository is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The moment the examples are checked at, in the made-up year of their events; every path is relative to the root of the
// repository.
export const NOW = '2101-03-10T12:00:00Z';
export const BAD = ['examples/bad/events.json', '--now', NOW];
export const GOOD = ['examples/good/events.json', '--now', NOW];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the bad file: the counts, a finding of nearly every check, and the result.
export const EXPECTED = [
  'document: EPCISDocument, schema version 2.0, created 2101-03-10T12:00:00.000Z',
  'events: 17 (11 ObjectEvent, 3 AggregationEvent, 1 TransactionEvent, 1 TransformationEvent and 1 of another or no type)',
  'findings: 32 (21 error, 10 warning, 1 info)',
  'The file holds the key "mnemonic", which names a seed, a mnemonic or a private key.',
  'The epcList of event 1 (ObjectEvent) lists urn:epc:id:sgtin:9521234.012345.1001 twice, on line 15',
  'Event 2 has the type "Object", which is not one of the five event types of EPCIS 2.0',
  'Did you mean ObjectEvent?',
  'Event 3 (ObjectEvent) has no eventTime',
  'The eventTime of event 4 (ObjectEvent), "2101-03-01T08:20:00", has no time zone',
  'The eventTimeZoneOffset of event 4 (ObjectEvent), "+14:30", has 14 hours with minutes other than 00',
  'The action of event 4 (ObjectEvent) is "add"; write it in capitals, ADD.',
  'The bizStep of event 4 (ObjectEvent), "Commissioning", is not a business step of the CBV; the CBV writes commissioning in lower case',
  'Event 5 (AggregationEvent) has no action',
  'Event 5 (AggregationEvent) has no eventTimeZoneOffset',
  'Event 7 (AggregationEvent) adds urn:epc:id:sgtin:9521234.012345.1001 in the parent urn:epc:id:sscc:9521234.0000000003, but event 6 put it in urn:epc:id:sscc:9521234.0000000002',
  'Event 8 (TransformationEvent) has an action (ADD)',
  'Event 8 (TransformationEvent) has no output and no transformationID',
  'The quantity of item 1 of the inputQuantityList of event 8 (TransformationEvent) is 2.5 with no uom',
  'The quantity of item 1 of the quantityList of event 9 (ObjectEvent) is "5"; it must be a JSON number.',
  'is also the eventID of event 9 at line 93',
  'The readPoint of event 10 (ObjectEvent) has no id.',
  'Event 10 (ObjectEvent) has no bizStep',
  'The disposition of event 10 (ObjectEvent), "non_sellable_expired", is a value the CBV deprecates; use expired.',
  'Event 11 (ObjectEvent) has no eventID',
  'Event 12 (ObjectEvent) names urn:epc:id:sgtin:9521234.012345.1003, 3,600 seconds (1 hour) after event 11 ended it with an ObjectEvent with action DELETE',
  'The bizStep of event 12 (ObjectEvent), "urn:epcglobal:cbv:bizstep:shipped", is not a business step of the CBV.',
  'Event 14 (ObjectEvent) ships urn:epc:id:sscc:9521234.0000000002 from urn:epc:id:sgln:9521234.00003.0, but its earlier events place it elsewhere',
  'The recordTime of event 15 (ObjectEvent), 2101-03-04T07:00:00.000+01:00, is 3,600 seconds (1 hour) before its eventTime',
  'urn:epc:id:sgtin:9521234.01234.1, is an SGTIN URI that has 12 digits in its company prefix and an indicator and item reference, not 13.',
  'The GTIN 09521234123457 in an EPC of the epcList of event 15 (ObjectEvent) ends with 7, but its check digit is 3',
  'The SSCC 095212340000000010 in an EPC of the epcList of event 15 (ObjectEvent) ends with 0, but its check digit is 3',
  'The GLN 9521234000019 in the id of the readPoint of event 15 (ObjectEvent) ends with 9, but its check digit is 3',
  'The eventTime of event 16 (ObjectEvent), 2101-03-20T08:00:00.000+01:00, is 846,000 seconds (more than 9 days) after the moment given with --now',
  'Event 16 (ObjectEvent) has neither a readPoint nor a bizLocation',
  'Event 17 (TransactionEvent) names no business transaction',
  'not a certification of conformance to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really happened',
  'RESULT: FAIL - 21 findings at or above error (21 error, 10 warning, 1 info)'
];
// What must not be reported: the check the bad file cannot hold, the seed, and a pass.
export const UNWANTED = ['ERROR    file-unreadable', 'lantern', 'RESULT: PASS'];

// What the README says of the good file: no finding.
export const GOOD_EXPECTED = [
  'events: 8 (3 ObjectEvent, 2 AggregationEvent, 1 TransactionEvent, 1 TransformationEvent and 1 AssociationEvent)',
  'findings: 0',
  'RESULT: PASS - no finding at or above error'
];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = await run(BAD);
  process.stdout.write(bad.out);
  expect('bad file', bad, 1, EXPECTED, UNWANTED);

  const good = await run(GOOD);
  expect('good file', good, 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'INFO     ', 'RESULT: FAIL', 'note: ']);
  // The good file also passes when warnings and notes fail the run.
  expect('good, fail on warning', await run([...GOOD, '--fail-on', 'warning']), 0, ['RESULT: PASS - no finding at or above warning'], []);
  expect('good, fail on info', await run([...GOOD, '--fail-on', 'info']), 0, ['RESULT: PASS - no finding at or above info'], []);
  // Without --now the good file still passes, and the report says that future-event did not run.
  expect('good, no --now', await run(['examples/good/events.json']), 0, ['now: not given, so future-event did not run', 'note: no --now was given, so future-event did not run'], []);
  // A --now before the last event makes the good file fail.
  expect('good, earlier --now', await run(['examples/good/events.json', '--now', '2101-03-04T10:30:00+01:00']), 1, ['ERROR    future-event', 'The eventTime of event 8 (AssociationEvent), 2101-03-04T11:00:00.000+01:00, is 1,800 seconds (30 minutes) after the moment given with --now'], []);
  // The bad file with only the errors shown still counts the rest.
  expect('bad, errors only', await run([...BAD, '--min-severity', 'error']), 1, ['findings: 21 (21 error); 11 below error not shown'], ['WARNING  ', 'INFO     ']);
  // A file that is not there stops the run with no report, and so does a --now with no time zone.
  expect('missing file', await run(['examples/none/events.json']), 2, ['examples/none/events.json: does not exist'], [], 'err');
  expect('now with no zone', await run([...GOOD.slice(0, 1), '--now', '2101-03-10T12:00:00']), 2, ['--now: 2101-03-10T12:00:00 has no time zone'], [], 'err');

  // The README shows the head of the report of the bad file with its table of checks, one finding with its basis, the
  // table of event types and the end of the report, and the end of the report of the good file.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const lines = bad.out.split('\n');
  const head = lines.slice(0, lines.findIndex((l) => l.startsWith('Findings ('))).join('\n');
  if (!readme.includes(head)) problems.push('README: the head of the sample output of the bad file differs from a real run');
  const explained = (await run([...BAD, '--explain'])).out.split('\n');
  const at = explained.findIndex((l) => l.includes('transformation-with-action') && l.includes('examples/bad/events.json:'));
  const sample = explained.slice(at, at + 5).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the sample finding of the TransformationEvent differs from a real run');
  const t = lines.findIndex((l) => l.startsWith('Event types ('));
  const table = lines.slice(t, t + 8).join('\n');
  if (t < 0 || !readme.includes(table)) problems.push('README: the table of event types of the bad file differs from a real run');
  const tail = lines.slice(-4).join('\n');
  if (!readme.includes(tail)) problems.push('README: the tail of the sample output of the bad file differs from a real run');
  const goodTail = good.out.split('\n').slice(-16).join('\n');
  if (!readme.includes(goodTail)) problems.push('README: the tail of the sample output of the good file differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/bad.txt'), bad.out);
  await writeFile(resolve(root, 'examples/output/good.txt'), good.out);
  const outputs = [
    ['bad-explain.txt', [...BAD, '--explain'], 1],
    ['bad.md', [...BAD, '--format', 'markdown'], 1],
    ['bad-explain.md', [...BAD, '--format', 'markdown', '--explain'], 1],
    ['bad.json', [...BAD, '--json', '--explain'], 1],
    ['bad.sarif', [...BAD, '--format', 'sarif'], 1],
    ['good.md', [...GOOD, '--format', 'markdown'], 0],
    ['good.json', [...GOOD, '--json'], 0],
    ['good.sarif', [...GOOD, '--format', 'sarif'], 0],
    ['checks.txt', ['--list-checks'], 0],
    ['checks.json', ['--list-checks', '--format', 'json'], 0]
  ];
  for (const [name, args, code] of outputs) {
    const r = await run(args);
    if (r.code !== code) problems.push(`${name}: exit code ${r.code}, expected ${code}`);
    await writeFile(resolve(root, 'examples/output', name), r.out);
  }

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
