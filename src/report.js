// The reports: text for a terminal, markdown for a job summary or a pull request, JSON for other tools and SARIF for code
// scanning. Every text that comes from the input (a file name, a time, an identifier, a vocabulary value) was cleaned
// by safeText before it reached the report object. The markdown format also escapes what markdown gives a meaning to,
// and the SARIF format is built as an object and written by JSON.stringify.

import { SOURCES } from './data.js';
import { RULES } from './rules.js';
import { grouped, listText, plural } from './size.js';

const URI = 'https://github.com/INNERLUXES/epcis-event-check';

function findingsLine(r) {
  const b = r.totals.byLevel;
  const parts = ['error', 'warning', 'info'].filter((l) => b[l]).map((l) => `${grouped(b[l])} ${l}`);
  return `${grouped(r.totals.findings)}${parts.length ? ` (${parts.join(', ')})` : ''}${r.totals.hidden ? `; ${grouped(r.totals.hidden)} below ${r.options.minSeverity} not shown` : ''}`;
}

const fileLine = (r) => `${r.input.file} (JSON, ${plural(r.input.lines, 'line')}, ${plural(r.input.bytes, 'byte')})`;

function documentText(d) {
  if (d.form === 'list') return 'a JSON list of events, with no EPCISDocument around it';
  const parts = [d.type ?? 'type not read', `schema version ${d.schemaVersion ?? 'not read'}`, `created ${d.creationDate ?? 'at a time not read'}`];
  return parts.join(', ');
}

function eventsText(r) {
  const types = r.eventTypes.map((t) => `${grouped(t.events)} ${t.type === 'other' ? 'of another or no type' : t.type}`);
  return `${grouped(r.document.events)}${types.length ? ` (${listText(types, 8)})` : ''}`;
}

// What the file says, a line for each part.
function documentLines(r) {
  const d = r.document;
  if (!d) return [['document', 'not read']];
  return [
    ['document', documentText(d)],
    ['events', eventsText(r)],
    ['identifiers', `${plural(d.epcs, 'EPC')}, ${plural(d.classes, 'class', 'classes')} and ${plural(d.places, 'place')}`],
    ['event times', d.firstEventTime === null ? 'none read' : d.firstEventTime === d.lastEventTime ? d.firstEventTime : `from ${d.firstEventTime} to ${d.lastEventTime}`],
    ['now', r.options.now === null ? 'not given, so future-event did not run' : `${r.options.now}, from --now`]
  ];
}

function table(head, rows, indent = '  ') {
  const widths = head.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells) => `${indent}${cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ')}`.trimEnd();
  return [line(head), ...rows.map(line)];
}

const TYPE_HEAD = ['type', 'events', 'ADD', 'OBSERVE', 'DELETE', 'no action'];
const typeRows = (r) => r.eventTypes.map((t) => [t.type, grouped(t.events), grouped(t.ADD), grouped(t.OBSERVE), grouped(t.DELETE), grouped(t.none)]);

const PAD = ' '.repeat(11);

export function toText(r, { explain = false } = {}) {
  const out = [];
  out.push(`epcis-event-check: ${r.input.file}`);
  out.push(`file: ${fileLine(r)}`);
  for (const [k, v] of documentLines(r)) out.push(`${k}: ${v}`);
  out.push(`findings: ${findingsLine(r)}`);
  out.push('', `Checks (${grouped(r.rules.length)})`, '');
  out.push(...table(['check', 'level', 'kind', 'findings'], r.rules.map((x) => [x.id, x.level, x.kind, grouped(x.findings)])), '');
  out.push(`Findings (${grouped(r.findings.length)})`, '');
  if (!r.findings.length) out.push('  none', '');
  const width = Math.max(...RULES.map((x) => x.id.length));
  for (const f of r.findings) {
    out.push(`  ${f.severity.toUpperCase().padEnd(8)} ${f.id.padEnd(width)}  ${f.at}`);
    out.push(`${PAD}${f.message}`);
    out.push(`${PAD}fix: ${f.fix}`);
    if (explain) {
      for (const b of f.basis) out.push(`${PAD}basis: ${b.text} (${b.source}, ${b.url})`);
      if (f.own) out.push(`${PAD}the tool's own choice: ${f.own}`);
    }
    out.push('');
  }
  if (r.eventTypes && r.eventTypes.length) out.push(`Event types (${grouped(r.eventTypes.length)})`, '', ...table(TYPE_HEAD, typeRows(r)), '');
  for (const n of r.notes) out.push(`note: ${n}`);
  if (r.notes.length) out.push('');
  out.push(r.notice, '');
  out.push(`RESULT: ${r.result.text}`);
  return `${out.join('\n')}\n`;
}

// Text for a markdown table cell or line: the characters markdown gives a meaning to are escaped.
const md = (t) => String(t).replace(/[\\`*_{}[\]<>()#+!|~]/g, (c) => `\\${c}`).replace(/\r?\n/g, ' ');

export function toMarkdown(r, { explain = false } = {}) {
  const out = [];
  out.push(`# epcis-event-check: ${md(r.input.file)}`, '');
  out.push(`- File: ${md(fileLine(r))}`);
  for (const [k, v] of documentLines(r)) out.push(`- ${k[0].toUpperCase()}${k.slice(1)}: ${md(v)}`);
  out.push(`- Findings: ${md(findingsLine(r))}`);
  out.push(`- Result: **${md(r.result.text)}**`, '');
  out.push('## Findings', '');
  if (!r.findings.length) out.push('None.', '');
  else {
    out.push('| Level | Check | Where | Message |', '| --- | --- | --- | --- |');
    for (const f of r.findings) out.push(`| ${f.severity} | ${f.id} | ${md(f.at)} | ${md(f.message)} Fix: ${md(f.fix)} |`);
    out.push('');
  }
  if (explain) {
    out.push('## Basis', '');
    const seen = new Set();
    for (const f of r.findings) {
      if (seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(`### ${f.id}`, '');
      for (const b of f.basis) out.push(`- ${md(b.text)} (${md(b.source)}, <${b.url}>)`);
      if (f.own) out.push(`- The tool's own choice: ${md(f.own)}`);
      if (!f.basis.length && !f.own) out.push('- A problem with the file itself; it rests on no standard.');
      out.push('');
    }
  }
  if (r.eventTypes && r.eventTypes.length) {
    out.push(`## Event types (${grouped(r.eventTypes.length)})`, '');
    out.push('| Type | Events | ADD | OBSERVE | DELETE | No action |', '| --- | --- | --- | --- | --- | --- |');
    for (const row of typeRows(r)) out.push(`| ${row.map(md).join(' | ')} |`);
    out.push('');
  }
  for (const n of r.notes) out.push(`Note: ${md(n)}`, '');
  out.push(`${md(r.notice)}`, '');
  return `${out.join('\n')}`;
}

export function toJson(r, { explain = false } = {}) {
  const out = { ...r, findings: r.findings.map((f) => (explain ? f : { ...f, basis: undefined, own: undefined })) };
  return `${JSON.stringify(out, null, 2)}\n`;
}

const SARIF_LEVEL = { error: 'error', warning: 'warning', info: 'note' };

// SARIF 2.1.0: the checks as rules of the driver, the event file as the artifact, and one result for each finding with
// its line and column. The table of event types has no place in SARIF and is left out.
export function toSarif(r) {
  const sarif = {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [
      {
        tool: {
          driver: {
            name: 'epcis-event-check',
            version: r.version,
            informationUri: URI,
            rules: RULES.map((x) => ({
              id: x.id,
              name: x.id,
              shortDescription: { text: x.summary },
              help: { text: `${x.fix} (${x.kind})` },
              defaultConfiguration: { level: SARIF_LEVEL[x.severity] },
              properties: { kind: x.kind }
            }))
          }
        },
        artifacts: [{ location: { uri: r.input.file } }],
        results: r.findings.map((f) => ({
          ruleId: f.id,
          ruleIndex: RULES.findIndex((x) => x.id === f.id),
          level: SARIF_LEVEL[f.severity],
          message: { text: `${f.message} Fix: ${f.fix}` },
          locations: [{ physicalLocation: { artifactLocation: { uri: f.file, index: 0 }, region: { startLine: f.line, startColumn: f.column } } }],
          properties: { kind: f.kind, subject: f.subject }
        })),
        properties: { notice: r.notice, result: r.result.text, sources: SOURCES.map((s) => s.url) }
      }
    ]
  };
  return `${JSON.stringify(sarif, null, 2)}\n`;
}

// The list of checks, for --list-checks.
export function listChecksText() {
  const width = Math.max(...RULES.map((x) => x.id.length));
  const out = ['epcis-event-check checks', ''];
  for (const x of RULES) out.push(`  ${x.id.padEnd(width)}  ${x.severity.padEnd(7)}  ${x.kind.padEnd(13)}  ${x.summary}`);
  out.push('', `A documented check rests on ${listText(['the EPCIS standard', 'its JSON schema', 'the CBV', 'the Tag Data Standard', 'the GS1 General Specifications'], 8)}; a best practice check is this tool's own choice and says so in its message. An input check is about the file itself. None of it certifies conformance.`, '');
  return out.join('\n');
}

export function listChecksMarkdown() {
  const out = ['# epcis-event-check checks', '', '| Check | Level | Kind | What it looks at |', '| --- | --- | --- | --- |'];
  for (const x of RULES) out.push(`| ${x.id} | ${x.severity} | ${x.kind} | ${md(x.summary)} |`);
  out.push('');
  return out.join('\n');
}

export function listChecksJson() {
  return `${JSON.stringify(RULES.map((x) => ({ id: x.id, severity: x.severity, kind: x.kind, summary: x.summary, fix: x.fix, basis: x.basis, own: x.own ?? null })), null, 2)}\n`;
}
