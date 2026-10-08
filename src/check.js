// A run: read the EPCIS file as JSON, look for keys and seeds in it, read the document and its events, run the checks
// and build the report object that the formats write.

import { analyze } from './analyze.js';
import { LEVELS, NOTICE, POINTS, pointPage } from './data.js';
import { EVENT_LIMITS, readEvents } from './events.js';
import { FILE_LIMITS, InputError, displayPath, locateInput, readInputText } from './files.js';
import { JsonError, isArray, isObject, isString, readJson } from './json.js';
import { RULES, decide, ruleById } from './rules.js';
import { findSecrets } from './secrets.js';
import { safeText } from './text.js';

export const LIMITS = { ...FILE_LIMITS, ...EVENT_LIMITS };

export { InputError };

const clean = (t, max = 900) => safeText(t, max);

const ORDER = { error: 0, warning: 1, info: 2 };

// The keys whose value may be 64 hex digits that are not a key: the hexBinaryValue of a sensor report. Such a value has
// the shape the search for secrets reads as a private key in hex, so a value of that form under this key is taken as the
// data it is meant to be and not reported. The tool does not read sensor data and never shows the value
// (docs/limits.md).
export const HEX_KEYS = ['hexBinaryValue'];
const HEX = /^(?:0x)?[0-9a-fA-F]{64}$/;

// The basis of a rule: the points with their standards.
function basisOf(rule) {
  return rule.basis.map((id) => {
    const page = pointPage(id);
    return { text: POINTS[id].text, source: page.title, url: page.url };
  });
}

// The value nodes of the file under a key of HEX_KEYS that have the form of 64 hex digits, found without recursion.
export function hexNodes(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (isObject(node)) {
      for (const e of node.entries) {
        if (HEX_KEYS.includes(e.key) && isString(e.value) && HEX.test(e.value.value.trim())) out.push(e.value);
        else stack.push(e.value);
      }
    } else if (isArray(node)) for (const item of node.items) stack.push(item);
  }
  return out;
}

// The search for keys and seeds of the sibling tools, kept unchanged in src/secrets.js, with two changes made here: its
// finding is named for the event file, and a value of 64 hex digits under a key of HEX_KEYS is not a finding.
export function fileSecrets(root) {
  const hexes = new Map(hexNodes(root).map((n) => [`${n.line}:${n.column}`, n]));
  const findings = [];
  for (const f of findSecrets(root)) {
    const node = hexes.get(`${f.line}:${f.column}`);
    if (node && f.message.endsWith('is shaped like a private key in hex. The tool never reads a seed or a key, and the value is not shown.')) {
      node.secret = false;
      continue;
    }
    findings.push({ ...f, id: 'secret-in-file', file: 'events', subject: null, message: f.message.replace(/^The configuration holds/, 'The file holds') });
  }
  return findings;
}

// The findings of the text of an EPCIS file, with no file system. Returns { read, analysis, findings, notes }.
export function checkText(text, { now = null, limits = EVENT_LIMITS } = {}) {
  let root;
  try {
    root = readJson(text);
  } catch (error) {
    if (!(error instanceof JsonError)) throw error;
    const findings = [{ id: 'file-unreadable', file: 'events', line: error.line, column: error.column, message: `The file is not JSON the reader can follow: ${error.message}. Nothing in the file was checked.`, subject: null }];
    return { read: null, analysis: analyze(null), findings, notes: ['the file was not checked, because it is not JSON the reader can follow'] };
  }
  const secrets = fileSecrets(root);
  const r = readEvents(root, limits);
  const analysis = analyze(r.document ? r : null, { now });
  return { read: r, analysis, findings: [...secrets, ...r.findings, ...analysis.findings], notes: [...r.notes, ...analysis.notes] };
}

const lineCount = (text) => {
  const parts = text === '' ? [] : text.split(/\r\n|\r|\n/);
  return parts.length > 0 && parts.at(-1) === '' ? parts.length - 1 : parts.length;
};

const textOf = (v, max = 60) => (v === null || v === undefined ? null : clean(v, max));

// What the file says, as the report shows it.
function eventsOf(s) {
  const d = s.document;
  return {
    form: d.form,
    type: d.type,
    schemaVersion: textOf(d.schemaVersion, 20),
    creationDate: d.creationDate ? textOf(d.creationDate.value, 40) : null,
    events: s.events,
    epcs: s.epcs,
    classes: s.classes,
    places: s.places,
    firstEventTime: textOf(s.first, 40),
    lastEventTime: textOf(s.last, 40)
  };
}

// The report object for the findings of the file. file is { file, bytes, lines }.
export function buildReport({ file, checked, version, minSeverity = 'info', failOn = 'error', now = null }) {
  const all = checked.findings.map((f) => {
    const rule = ruleById(f.id);
    return {
      id: f.id,
      severity: rule.severity,
      message: clean(f.message),
      file: file.file,
      line: f.line,
      column: f.column,
      at: `${file.file}:${f.line}`,
      subject: f.subject == null ? null : clean(f.subject, 120),
      fix: rule.fix,
      kind: rule.kind,
      basis: basisOf(rule),
      own: rule.own ?? null
    };
  });
  all.sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.line - b.line || a.column - b.column || a.id.localeCompare(b.id, 'en'));
  const shown = all.filter((f) => LEVELS.indexOf(f.severity) >= LEVELS.indexOf(minSeverity));
  const byLevel = { error: 0, warning: 0, info: 0 };
  for (const f of shown) byLevel[f.severity] += 1;
  const allByLevel = { error: 0, warning: 0, info: 0 };
  for (const f of all) allByLevel[f.severity] += 1;
  const summary = checked.analysis.summary;
  return {
    tool: 'epcis-event-check',
    version,
    input: { file: file.file, format: 'json', bytes: file.bytes, lines: file.lines },
    document: summary ? eventsOf(summary) : null,
    totals: { findings: shown.length, byLevel, hidden: all.length - shown.length },
    rules: RULES.map((r) => ({ id: r.id, level: r.severity, kind: r.kind, findings: shown.filter((f) => f.id === r.id).length })),
    options: { minSeverity, failOn, now },
    findings: shown,
    eventTypes: summary ? summary.types : null,
    notes: checked.notes.map((n) => clean(n)),
    notice: NOTICE,
    result: decide(allByLevel, failOn)
  };
}

// Reads the EPCIS file and builds the report.
export async function checkFile({ path, minSeverity = 'info', failOn = 'error', now = null, version, limits = LIMITS, base = process.cwd() }) {
  const absolute = await locateInput(path, base);
  const { text, bytes } = await readInputText(absolute, base, limits);
  const checked = checkText(text, { now, limits });
  return buildReport({ file: { file: displayPath(absolute, base), bytes, lines: lineCount(text) }, checked, version, minSeverity, failOn, now });
}
