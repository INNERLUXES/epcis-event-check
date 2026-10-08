// The tool never reads a seed or a key. A configuration that holds one anyway, under a key such as "mnemonic" or as a
// value shaped like one, is a finding of its own, and the value is never written to a report or an error message: the
// node is marked, and the configuration reader leaves a marked value out as if it were not there.
//
// The shapes are kept loose on purpose, so that a seed or a key is caught even when it is not quite valid: a mnemonic is
// 12, 15, 18, 21 or 24 words of 3 to 8 lowercase letters (the length of the words of the English list of BIP-39); an
// extended private key starts with a letter and "prv" (xprv, yprv, zprv, tprv and their kin) followed by 100 or more
// base58 characters; a private key in hex is 64 hex digits, with or without 0x; a private key in WIF is 51 or 52 base58
// characters that start with 5, K, L, c or 9.

import { isArray, isObject, isString } from './json.js';

// The names of keys that hold a seed or a key, compared in lowercase with everything but the letters left out.
export const SECRET_KEYS = ['mnemonic', 'mnemonicphrase', 'seed', 'seedphrase', 'seedwords', 'phrase', 'recoveryphrase', 'secretphrase', 'words', 'entropy', 'privatekey', 'privkey', 'secretkey', 'secret', 'xprv', 'xpriv', 'wif', 'passphrase', 'password', 'masterkey'];

const WORD = /^[a-z]{3,8}$/;
const MNEMONIC_WORDS = [12, 15, 18, 21, 24];
const EXTENDED = /^[a-zA-Z]prv[1-9A-HJ-NP-Za-km-z]{100,}$/;
const HEX_KEY = /^(?:0x)?[0-9a-fA-F]{64}$/;
const WIF = /^[5KLc9][1-9A-HJ-NP-Za-km-z]{50,51}$/;

// Whether the name of a key says that it holds a seed or a key.
export const isSecretKey = (key) => SECRET_KEYS.includes(key.toLowerCase().replace(/[^a-z]/g, ''));

// What a text looks like when it looks like a seed or a key, or null.
export function secretShape(text) {
  const v = text.trim();
  if (v.length > 4000) return null;
  const words = v.split(/\s+/);
  if (MNEMONIC_WORDS.includes(words.length) && words.every((w) => WORD.test(w))) return 'a mnemonic';
  if (EXTENDED.test(v)) return 'an extended private key';
  if (HEX_KEY.test(v)) return 'a private key in hex';
  if (WIF.test(v)) return 'a private key in WIF';
  return null;
}

// Walks every node of the file without recursion. A key whose name says it holds a seed or a key, and a string shaped
// like one, are marked (entry.secret, node.secret) and returned as findings with their line; no value is put in a
// message, and a key name is shown only when it is not itself shaped like a secret.
export function findSecrets(root) {
  const findings = [];
  const stack = [{ node: root, key: null }];
  while (stack.length > 0) {
    const { node, key } = stack.pop();
    if (isObject(node)) {
      for (const e of node.entries) {
        const keyShape = secretShape(e.key);
        if (keyShape || isSecretKey(e.key)) {
          e.secret = true;
          markAll(e.value);
          const name = keyShape ? `a key shaped like ${keyShape}` : `the key "${e.key}"`;
          findings.push({ id: 'secret-in-config', line: e.line, column: e.column, message: `The configuration holds ${name}, which names a seed, a mnemonic or a private key. The tool never reads one, and the value is not shown.` });
        } else stack.push({ node: e.value, key: e.key });
      }
    } else if (isArray(node)) {
      for (let i = node.items.length - 1; i >= 0; i -= 1) stack.push({ node: node.items[i], key });
    } else if (isString(node)) {
      const shape = secretShape(node.value);
      if (shape) {
        node.secret = true;
        const of = key === null || key.length > 120 ? 'A value' : `The value of "${key}"`;
        findings.push({ id: 'secret-in-config', line: node.line, column: node.column, message: `${of} is shaped like ${shape}. The tool never reads a seed or a key, and the value is not shown.` });
      }
    }
  }
  return findings.sort((a, b) => a.line - b.line || a.column - b.column);
}

// Marks every string below a node as secret, so that no part of it reaches a report.
function markAll(node) {
  const stack = [node];
  while (stack.length > 0) {
    const n = stack.pop();
    if (isObject(n)) for (const e of n.entries) stack.push(e.value);
    else if (isArray(n)) for (const item of n.items) stack.push(item);
    else n.secret = true;
  }
}
