import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BIZ_STEPS, DEPRECATED_DISPOSITIONS, DISPOSITIONS, checkDigit, isUri, readIdentifier, readVocab, verifyCheckDigit } from '../src/index.js';

test('checkDigit: the rule of the GS1 General Specifications, with its own example of 18 digits', () => {
  assert.equal(checkDigit('37610425002123456'), 9, 'the worked example of the General Specifications');
  assert.equal(checkDigit('0952123412345'), 3);
  assert.equal(checkDigit('952123400001'), 3);
  assert.equal(checkDigit('09521234000000001'), 3);
  assert.equal(checkDigit('9501093'), 9, 'a GTIN-8');
  assert.equal(checkDigit('000000000000'), 0);
  assert.deepEqual(verifyCheckDigit('376104250021234569'), { ok: true, expected: 9 });
  assert.deepEqual(verifyCheckDigit('376104250021234568'), { ok: false, expected: 9 });
});

test('readIdentifier: SGTIN, SSCC, SGLN, LGTIN and the SGTIN pattern, with the key two forms of one object share', () => {
  assert.deepEqual(readIdentifier('urn:epc:id:sgtin:9521234.012345.1001'), { scheme: 'SGTIN', level: 'instance', problem: null, check: null, key: '01/09521234123453/21/1001', site: null });
  assert.equal(readIdentifier('urn:epc:id:sgtin:952123456789.0.1').key, '01/09521234567899/21/1', 'a company prefix of 12 digits');
  assert.equal(readIdentifier('urn:epc:id:sgtin:952123.1234567.A%2Fb').key, '01/19521232345670/21/A%2Fb');
  assert.equal(readIdentifier('urn:epc:id:sscc:9521234.0000000001').key, '00/095212340000000013');
  assert.deepEqual(readIdentifier('urn:epc:id:sgln:9521234.00001.0'), { scheme: 'SGLN', level: 'location', problem: null, check: null, key: '414/9521234000013', site: '414/9521234000013' });
  assert.equal(readIdentifier('urn:epc:id:sgln:9521234.00001.7').key, '414/9521234000013/254/7');
  assert.equal(readIdentifier('urn:epc:id:sgln:952123400001..1').site, '414/9521234000013', 'an empty location reference');
  assert.equal(readIdentifier('urn:epc:class:lgtin:9521234.012346.L1').key, '01/09521234123460/10/L1');
  assert.equal(readIdentifier('urn:epc:idpat:sgtin:9521234.012345.*').key, '01/09521234123453');
  assert.equal(readIdentifier('urn:epc:id:giai:9521234.1'), null, 'another scheme is left as it is');
  assert.equal(readIdentifier('https://example.com/products/7'), null);
  assert.equal(readIdentifier('urn:uuid:00000000-0000-4000-8000-000000000001'), null);
});

test('readIdentifier: EPC URIs whose digits do not add up, with near misses on each side', () => {
  const problem = (t) => readIdentifier(t).problem;
  assert.match(problem('urn:epc:id:sgtin:9521234.01234.1'), /has 12 digits in its company prefix and an indicator and item reference, not 13/);
  assert.match(problem('urn:epc:id:sgtin:9521234.0123456.1'), /has 14 digits/);
  assert.match(problem('urn:epc:id:sgtin:95212.12345678.1'), /company prefix of 5 digits, outside 6 to 12/);
  assert.match(problem('urn:epc:id:sgtin:9521234567890.1.1'), /company prefix of 13 digits, outside 6 to 12/);
  assert.equal(problem('urn:epc:id:sgtin:952123.1234567.1'), null, 'a company prefix of 6 digits');
  assert.match(problem('urn:epc:id:sgtin:95212A4.012345.1'), /company prefix that is not all digits/);
  assert.match(problem('urn:epc:id:sgtin:9521234.01234X.1'), /an indicator and item reference that is not all digits/);
  assert.match(problem('urn:epc:id:sgtin:9521234.012345'), /has 2 parts after "urn:epc:id:sgtin:", not 3/);
  assert.match(problem('urn:epc:id:sscc:9521234'), /has 1 part after/);
  assert.match(problem('urn:epc:id:sgtin:9521234.012345.'), /a serial number that is empty or holds a character/);
  assert.match(problem('urn:epc:id:sgtin:9521234.012345.a b'), /a serial number that is empty or holds a character/);
  assert.match(problem(`urn:epc:id:sgtin:9521234.012345.${'1'.repeat(21)}`), /a serial number of 21 characters, more than 20/);
  assert.equal(problem(`urn:epc:id:sgtin:9521234.012345.${'%2F'.repeat(20)}`), null, 'a percent escape is one character');
  assert.match(problem('urn:epc:id:sscc:9521234.000000001'), /has 16 digits in its company prefix and a serial reference, not 17/);
  assert.match(problem('urn:epc:id:sgln:9521234.0001.0'), /has 11 digits in its company prefix and a location reference, not 12/);
  assert.match(problem('urn:epc:id:sgln:9521234.00001.'), /an extension that is empty/);
  assert.match(problem('urn:epc:class:lgtin:9521234.012346.'), /a lot that is empty/);
  assert.match(problem('urn:epc:idpat:sgtin:9521234.012345.1'), /does not end with "\.\*"/);
  assert.equal(readIdentifier('urn:epc:id:sgtin:9521234.01234.1').key, null);
});

test('readIdentifier: GS1 Digital Link URIs, their check digits, their lengths and the hosts they are read on', () => {
  assert.deepEqual(readIdentifier('https://id.gs1.org/01/09521234123453/21/1001'), { scheme: 'Digital Link GTIN', level: 'instance', problem: null, check: null, key: '01/09521234123453/21/1001', site: null });
  assert.deepEqual(readIdentifier('https://id.gs1.org/01/09521234123457/21/7').check, { kind: 'gtin', name: 'GTIN', value: '09521234123457', expected: 3 });
  assert.equal(readIdentifier('https://id.gs1.org/01/09521234123453').level, 'class');
  assert.equal(readIdentifier('https://id.gs1.org/01/09521234123460/10/L1').key, '01/09521234123460/10/L1');
  assert.equal(readIdentifier('https://id.gs1.org/01/9521234123453/21/9').key, '01/09521234123453/21/9', 'a GTIN-13 is padded to 14');
  assert.equal(readIdentifier('https://id.gs1.org/01/09521234123453/22/A/21/9').key, '01/09521234123453/21/9');
  assert.equal(readIdentifier('https://id.gs1.org/00/095212340000000013').key, '00/095212340000000013');
  assert.equal(readIdentifier('https://id.gs1.org/00/095212340000000010').check.expected, 3);
  assert.deepEqual(readIdentifier('https://id.gs1.org/414/9521234000013/254/7'), { scheme: 'Digital Link GLN', level: 'location', problem: null, check: null, key: '414/9521234000013/254/7', site: '414/9521234000013' });
  assert.equal(readIdentifier('https://id.gs1.org/414/9521234000019').check.kind, 'gln');
  assert.match(readIdentifier('https://id.gs1.org/01/09521234123').problem, /has a GTIN of "09521234123"/);
  assert.match(readIdentifier('https://id.gs1.org/01/123456789').problem, /not 8, 12, 13 or 14 digits/);
  assert.match(readIdentifier('https://id.gs1.org/00/12345').problem, /has a SSCC of "12345", not 18 digits/);
  assert.match(readIdentifier('https://id.gs1.org/414/abc').problem, /has a GLN of "abc"/);
  assert.equal(readIdentifier('https://brand.example.com/p/01/09521234123453/21/4?x=1#y').key, '01/09521234123453/21/4', 'another host, with a key of a right length');
  assert.equal(readIdentifier('https://example.com/items/01/123'), null, 'another host, with a key of a wrong length, is any web address');
  assert.equal(readIdentifier('https://id.gs1.org/'), null);
  assert.equal(readIdentifier('https://id.gs1.org/__proto__/1/constructor/2'), null);
  assert.equal(readIdentifier('ftp://id.gs1.org/01/09521234123453'), null);
});

test('readVocab: the business steps and dispositions of the CBV, alone, after a prefix of the CBV and as URIs of another vocabulary', () => {
  assert.equal(BIZ_STEPS.length, 41);
  assert.equal(DISPOSITIONS.length, 33);
  assert.deepEqual(readVocab('bizStep', 'shipping'), { form: 'bare', word: 'shipping', known: true, deprecated: false, replacedBy: null });
  assert.deepEqual(readVocab('bizStep', 'urn:epcglobal:cbv:bizstep:shipping'), { form: 'cbv', word: 'shipping', known: true, deprecated: false, replacedBy: null });
  assert.equal(readVocab('bizStep', 'https://ref.gs1.org/cbv/BizStep-receiving').known, true);
  assert.equal(readVocab('bizStep', 'https://ref.gs1.org/cbv/Bizstep-receiving').known, true);
  assert.equal(readVocab('bizStep', 'Shipping').known, false);
  assert.equal(readVocab('bizStep', 'urn:epcglobal:cbv:bizstep:Shipping').known, false, 'the word after the prefix keeps its case');
  assert.equal(readVocab('bizStep', 'urn:epcglobal:cbv:bizstep:shipped').known, false);
  assert.deepEqual(readVocab('bizStep', 'https://example.com/steps/blending'), { form: 'own', word: null, known: true, deprecated: false, replacedBy: null });
  assert.equal(readVocab('bizStep', 'example:blending').form, 'own');
  assert.equal(readVocab('disposition', 'in_transit').known, true);
  assert.equal(readVocab('disposition', 'https://ref.gs1.org/cbv/Disp-in_transit').known, true);
  assert.deepEqual(readVocab('disposition', 'non_sellable_expired'), { form: 'bare', word: 'non_sellable_expired', known: false, deprecated: true, replacedBy: 'expired' });
  assert.deepEqual(readVocab('disposition', 'no_pedigree_match'), { form: 'bare', word: 'no_pedigree_match', known: false, deprecated: true, replacedBy: null });
  assert.equal(readVocab('disposition', 'shipping').known, false);
  assert.equal(readVocab('bizStep', 'non_sellable_expired').deprecated, false, 'the deprecated values are dispositions');
  assert.equal(readVocab('bizStep', '__proto__').known, false);
  assert.equal(readVocab('disposition', 'constructor').known, false);
  assert.ok(DEPRECATED_DISPOSITIONS.every(([w, r]) => r === null || DISPOSITIONS.includes(r) || DEPRECATED_DISPOSITIONS.some(([x]) => x === r)), 'each replacement is a value of the CBV');
});

test('isUri: a scheme and a colon', () => {
  for (const ok of ['urn:epc:id:sgtin:1', 'https://id.gs1.org/01/1', 'example:x', 'a+b.c-d:e']) assert.ok(isUri(ok), ok);
  for (const bad of ['9521234', '01/09521234123453', ':x', '1a:b', '']) assert.ok(!isUri(bad), bad);
});
