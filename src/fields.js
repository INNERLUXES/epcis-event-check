// Reading fields from the nodes of the JSON reader. Every field is read with the line and column of its key, so a
// finding can point at it. A field that is of the wrong type or unknown is a finding of its own, and its value is left
// out of the checks that need it; nothing that was not read is taken for a value that is fine. Keys of the file are only
// compared with the names the tool reads; no object is built with a key from the file. A value that src/secrets.js
// marked as a seed or a key is left out as if it were not there, and never shown.

import { isArray, isObject, isString } from './json.js';

export const where = (e) => ({ line: e.line, column: e.column });

// A text from the file as a message names it: cut at a length, so that a long value does not fill a report.
export const cut = (text, max = 120) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);

// Whether two texts are one letter apart: one letter added, left out or changed.
export function oneEdit(a, b) {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1);
  return a.length > b.length ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);
}

// A known key that an unknown one is probably meant to be: the same letters in another case or with other separators,
// one a letter apart, or one that starts with the other.
export function suggestKey(key, known) {
  const k = key.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (k.length < 3) return null;
  const flat = (n) => n.toLowerCase().replace(/[^a-z0-9]/g, '');
  return known.find((n) => flat(n) === k) ?? known.find((n) => oneEdit(flat(n), k)) ?? known.find((n) => flat(n).startsWith(k) || k.startsWith(flat(n))) ?? null;
}

export const describe = (node) => (node.secret ? 'a value that is not shown' : node.kind === 'object' ? 'an object' : node.kind === 'array' ? 'a list' : node.kind === 'null' ? 'null' : node.kind === 'boolean' ? `${node.value}` : node.kind === 'number' ? `the number ${node.raw.length > 40 ? `${node.raw.slice(0, 37)}...` : node.raw}` : 'text');

// A key of an extension: EPCIS lets an event, a document and a location carry fields of other vocabularies, named by a
// URI or a compact URI such as example:temperature. A key with a colon is read as one and left alone; @context belongs
// to JSON-LD.
export const isExtensionKey = (key) => key.includes(':');

// The fields of the file, with the findings of what could not be read.
export class Reader {
  constructor(file = 'events') {
    this.file = file;
    this.findings = [];
  }

  add(id, at, message, subject = null) {
    this.findings.push({ id, file: this.file, line: at.line, column: at.column, message, subject });
  }

  // The entries of an object, with a field-unknown finding for each key that is not in known, and the first entry of
  // each known key in a map. A key that names a seed or a key was reported by src/secrets.js and is passed over, and so
  // is a key of an extension. other(key) may name the owner of a key that belongs elsewhere, for the message.
  fields(obj, known, label, subject = null, other = () => null) {
    const map = new Map();
    for (const e of obj.entries) {
      if (e.secret || isExtensionKey(e.key)) continue;
      if (known.includes(e.key)) map.set(e.key, e);
      else {
        const elsewhere = other(e.key);
        const near = elsewhere ? null : suggestKey(e.key, known);
        this.add('field-unknown', where(e), `The key "${cut(e.key)}" of ${label} is not one the tool reads there, so its value was left out of every check.${elsewhere ? ` It is a field of ${elsewhere}.` : near ? ` Did you mean "${near}"?` : ''} The keys of ${label} are ${known.join(', ')}; a key of an extension holds a colon.`, subject);
      }
    }
    return map;
  }

  // An object field: the node, or null when it is missing, a secret or not an object (a finding).
  object(map, key, of, what, subject = null) {
    const e = map.get(key);
    if (!e) return { value: null, entry: null };
    if (e.value.secret) return { value: null, entry: e, invalid: true };
    if (!isObject(e.value)) {
      this.add('field-invalid', where(e), `The ${key} of ${of} is ${describe(e.value)}; it must be an object with ${what}.`, subject);
      return { value: null, entry: e, invalid: true };
    }
    return { value: e.value, entry: e };
  }

  // A text field: null when it is missing, empty, of another type or marked as a secret; invalid is true when it is there
  // but could not be read, so that it is not reported as missing too.
  text(map, key, of, subject = null) {
    const e = map.get(key);
    if (!e) return { value: null, entry: null };
    if (e.value.secret) return { value: null, entry: e, invalid: true };
    if (!isString(e.value)) {
      this.add('field-invalid', where(e), `The ${key} of ${of} is ${describe(e.value)}; it must be text.`, subject);
      return { value: null, entry: e, invalid: true };
    }
    if (e.value.value.trim() === '') return { value: null, entry: e, empty: true };
    return { value: e.value.value.trim(), entry: e };
  }

  // A list field: { items, entry, more } with the nodes of the list cut at max, or null items when it is missing, a
  // secret or not a list (a finding). more is the number of items left out.
  list(map, key, of, max, subject = null) {
    const e = map.get(key);
    if (!e) return { items: null, entry: null, more: 0 };
    if (e.value.secret) return { items: null, entry: e, invalid: true, more: 0 };
    if (!isArray(e.value)) {
      this.add('field-invalid', where(e), `The ${key} of ${of} is ${describe(e.value)}; it must be a list.`, subject);
      return { items: null, entry: e, invalid: true, more: 0 };
    }
    const items = e.value.items.slice(0, max).filter((n) => !n.secret);
    return { items, entry: e, more: Math.max(0, e.value.items.length - max) };
  }

  // The texts of a list field: { values: [{ value, node }], entry, more }, an item that is not text being a finding.
  texts(map, key, of, max, subject = null) {
    const r = this.list(map, key, of, max, subject);
    if (r.items === null) return { values: null, entry: r.entry, invalid: r.invalid, more: 0 };
    const values = [];
    for (const node of r.items) {
      if (!isString(node) || node.value.trim() === '') this.add('field-invalid', where(node), `An item of the ${key} of ${of} is ${isString(node) ? 'empty' : describe(node)}; it must be text.`, subject);
      else values.push({ value: node.value.trim(), node });
    }
    return { values, entry: r.entry, more: r.more };
  }

  // The objects of a list field, each read by read(node, index); an item that is not an object is a finding.
  objects(map, key, of, max, read, subject = null) {
    const r = this.list(map, key, of, max, subject);
    if (r.items === null) return { values: null, entry: r.entry, invalid: r.invalid, more: 0 };
    const values = [];
    for (const [i, node] of r.items.entries()) {
      if (!isObject(node)) this.add('field-invalid', where(node), `Item ${i + 1} of the ${key} of ${of} is ${describe(node)}; it must be an object.`, subject);
      else values.push(read(node, i + 1));
    }
    return { values, entry: r.entry, more: r.more };
  }
}
