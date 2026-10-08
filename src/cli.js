// Command line: epcis-event-check <events.json> [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkFile } from './check.js';
import { LEVELS } from './data.js';
import { listChecksJson, listChecksMarkdown, listChecksText, toJson, toMarkdown, toSarif, toText } from './report.js';
import { RULES } from './rules.js';
import { safeText } from './text.js';
import { TIME_FORM, readTime } from './time.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, sarif: toSarif };
const LISTS = { text: listChecksText, markdown: listChecksMarkdown, json: listChecksJson };

export const USAGE = `Usage: epcis-event-check <events.json> [options]

Reads a file of GS1 EPCIS 2.0 events in JSON or JSON-LD (an EPCISDocument with its events in epcisBody.eventList, an
EPCISQueryDocument, or a JSON list of events) before the events are written to a shared supply chain ledger, and lists
their mistakes: an event type EPCIS does not have, a missing or malformed eventTime, recordTime or time zone offset, a
missing or wrong action or an action on a TransformationEvent, an event that names no object, no parent or no business
transaction, a TransformationEvent with no inputs or outputs, a quantity that is not positive or has no unit, no
readPoint or bizLocation, no bizStep, a bizStep or disposition the CBV does not have, an eventID written twice or not at
all, events out of order or after the moment of --now, an EPC seen after it was deleted, shipped from a place it never
reached or put in two parents, an EPC URI whose digits do not add up, and a GTIN, SSCC or GLN whose check digit is
wrong. A private key or a seed in the file is an error whose value is never shown. It reads the file and certifies
nothing: it contacts no ledger, node or API, fetches nothing, writes nothing to a ledger, runs nothing, reads no clock
and writes nothing to disk.

Options:
  --format <name>            text, markdown, json or sarif (default: text)
  --json                     the same as --format json
  --min-severity <level>     the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: info)
  --fail-on <level>          the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: error)
  --now <time>               the moment to compare event times with, such as the time the file is checked, written
                             ${TIME_FORM}; without it future-event does not run
  --explain                  show the points of the standards behind each finding (text, markdown and JSON)
  --list-checks              list the checks with their level and kind, and exit
  --help                     show this text
  --version                  show the version

Checks: ${RULES.map((r) => r.id).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

export function parseArgs(argv) {
  const o = { paths: [], format: null, json: false, minSeverity: null, failOn: null, now: null, explain: false, listChecks: false, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give a file');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--explain') o.explain = true;
    else if (a === '--json') o.json = true;
    else if (a === '--list-checks') o.listChecks = true;
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--min-severity') o.minSeverity = once(a, o.minSeverity, next());
    else if (a === '--fail-on') o.failOn = once(a, o.failOn, next());
    else if (a === '--now') o.now = once(a, o.now, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give a file');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else {
      if (o.paths.length === 1) throw new Error('give one event file');
      o.paths.push(a);
    }
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${o.format} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown, json or sarif)`);
  for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${v} (${LEVELS.join(', ')})`);
  if (o.now !== null) {
    const t = readTime(o.now);
    if (t.problem) throw new Error(`--now: ${o.now} ${t.problem}`);
  }
  if (o.listChecks && o.format === 'sarif') throw new Error('--list-checks has no SARIF form; use text, markdown or json');
  if (!o.help && !o.version && !o.listChecks) {
    if (o.paths.length !== 1) throw new Error('give the event file, such as epcis-event-check events.json');
    if (isUrl(o.paths[0])) throw new Error('give a local path; the tool never fetches a URL');
    if (o.explain && o.format === 'sarif') throw new Error('--explain adds the points of the standards to the text, markdown and JSON reports; the sarif format has no place for them');
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`epcis-event-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.listChecks) {
    io.out(LISTS[o.format]());
    return 0;
  }
  let report;
  try {
    report = await checkFile({ path: o.paths[0], minSeverity: o.minSeverity ?? 'info', failOn: o.failOn ?? 'error', now: o.now, version: VERSION, limits: { ...LIMITS, ...(limits ?? {}) }, base });
  } catch (error) {
    if (error instanceof InputError) io.err(`epcis-event-check: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`epcis-event-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report, { explain: o.explain }));
  return report.result.pass ? 0 : 1;
}
