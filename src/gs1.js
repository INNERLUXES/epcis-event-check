// GS1 identifiers and vocabularies as EPCIS events write them. An identifier is read from its text alone: the EPC URIs
// of the Tag Data Standard for SGTIN, SSCC, SGLN and the class-level LGTIN and SGTIN pattern, and GS1 Digital Link URIs
// for a GTIN, an SSCC and a GLN. An EPC URI carries no check digit, so its digits are counted; a Digital Link URI
// carries the whole key, so its check digit is worked out by the rule of the GS1 General Specifications. Nothing is looked
// up: the tool cannot tell whether a company prefix was ever issued, only whether the digits add up.

// The check digit of the digits of a GS1 key written without it: from the right, the digits are weighted 3, 1, 3, 1
// and so on, added up, and the check digit is what is missing to the next multiple of ten.
export function checkDigit(digits) {
  let sum = 0;
  for (let i = digits.length - 1, w = 3; i >= 0; i -= 1, w = 4 - w) sum += Number(digits[i]) * w;
  return (10 - (sum % 10)) % 10;
}

// Whether the last digit of a key is its check digit: { ok, expected }.
export function verifyCheckDigit(key) {
  const expected = checkDigit(key.slice(0, -1));
  return { ok: Number(key.at(-1)) === expected, expected };
}

// The business steps and dispositions of the CBV, in the order of its tables, and the dispositions it deprecates with
// the value that replaces each (null where there is none).
export const BIZ_STEPS = ['accepting', 'arriving', 'assembling', 'collecting', 'commissioning', 'consigning', 'creating_class_instance', 'cycle_counting', 'decommissioning', 'departing', 'destroying', 'disassembling', 'dispensing', 'encoding', 'entering_exiting', 'holding', 'inspecting', 'installing', 'killing', 'loading', 'other', 'packing', 'picking', 'receiving', 'removing', 'repackaging', 'repairing', 'replacing', 'reserving', 'retail_selling', 'sampling', 'sensor_reporting', 'shipping', 'staging_outbound', 'stock_taking', 'stocking', 'storing', 'transporting', 'unloading', 'unpacking', 'void_shipping'];
export const DISPOSITIONS = ['active', 'available', 'completeness_inferred', 'completeness_verified', 'conformant', 'container_closed', 'container_open', 'damaged', 'destroyed', 'dispensed', 'disposed', 'encoded', 'expired', 'in_progress', 'in_transit', 'inactive', 'mismatch_class', 'mismatch_instance', 'mismatch_quantity', 'needs_replacement', 'no_pedigree_match', 'non_conformant', 'non_sellable_other', 'partially_dispensed', 'recalled', 'reserved', 'retail_sold', 'returned', 'sellable_accessible', 'sellable_not_accessible', 'stolen', 'unavailable', 'unknown'];
export const DEPRECATED_DISPOSITIONS = [['non_sellable_expired', 'expired'], ['non_sellable_damaged', 'damaged'], ['non_sellable_disposed', 'disposed'], ['non_sellable_no_pedigree_match', 'no_pedigree_match'], ['non_sellable_recalled', 'recalled'], ['no_pedigree_match', null]];

const VOCAB = {
  bizStep: { words: BIZ_STEPS, prefixes: ['urn:epcglobal:cbv:bizstep:', 'https://ref.gs1.org/cbv/bizstep-'] },
  disposition: { words: DISPOSITIONS, prefixes: ['urn:epcglobal:cbv:disp:', 'https://ref.gs1.org/cbv/disp-'] }
};
const SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;

// Reads a bizStep or a disposition: { form, word, known, deprecated, replacedBy }. form is 'bare' for a word alone,
// 'cbv' for a word after a prefix of the CBV (compared in any case, as the CBV itself writes BizStep and Bizstep) and
// 'own' for a URI of another vocabulary, which the CBV allows and the tool does not check.
export function readVocab(kind, text) {
  const v = VOCAB[kind];
  const lower = text.toLowerCase();
  const prefix = v.prefixes.find((p) => lower.startsWith(p));
  if (!prefix && SCHEME.test(text)) return { form: 'own', word: null, known: true, deprecated: false, replacedBy: null };
  const word = prefix ? text.slice(prefix.length) : text;
  const old = kind === 'disposition' ? DEPRECATED_DISPOSITIONS.find(([w]) => w === word) : undefined;
  return { form: prefix ? 'cbv' : 'bare', word, known: v.words.includes(word) && !old, deprecated: Boolean(old), replacedBy: old ? old[1] : null };
}

// The characters of a serial number, a lot or an extension in an EPC URI: GS3A3, with a percent escape as one character.
const GS3A3 = /^(?:[A-Za-z0-9!'()*+,\-.:;=_]|%[0-9A-Fa-f]{2})+$/;
const gs3a3Length = (text) => text.replace(/%[0-9A-Fa-f]{2}/g, '%').length;
const DIGITS = /^[0-9]+$/;

// The company prefix and reference of an EPC URI: what is wrong with them, or null.
function digitsProblem(prefix, ref, total, refName, allowEmptyRef = false) {
  if (!DIGITS.test(prefix)) return 'has a company prefix that is not all digits';
  if (!(DIGITS.test(ref) || (allowEmptyRef && ref === ''))) return `has ${refName} that is not all digits`;
  if (prefix.length < 6 || prefix.length > 12) return `has a company prefix of ${prefix.length} digits, outside 6 to 12`;
  if (prefix.length + ref.length !== total) return `has ${prefix.length + ref.length} digits in its company prefix and ${refName}, not ${total}`;
  return null;
}

function tailProblem(text, name) {
  if (!GS3A3.test(text)) return `has ${name} that is empty or holds a character an EPC URI does not allow`;
  if (gs3a3Length(text) > 20) return `has ${name} of ${gs3a3Length(text)} characters, more than 20`;
  return null;
}

// The 14 digits of a GTIN from the 13 digits of an SGTIN or an LGTIN: the indicator first, then the check digit worked
// out and put at the end.
const gtinOf = (prefix, ref) => {
  const d = `${ref[0]}${prefix}${ref.slice(1)}`;
  return `${d}${checkDigit(d)}`;
};

const DL_KEYS = { '01': { name: 'GTIN', check: 'gtin', lengths: [8, 12, 13, 14] }, '00': { name: 'SSCC', check: 'sscc', lengths: [18] }, 414: { name: 'GLN', check: 'gln', lengths: [13] } };
const DL = /^https?:\/\/([^/?#]+)(\/[^?#]*)?(?:[?#].*)?$/i;

// Reads a GS1 Digital Link URI: null when the text is not one, or the identifier it names.
function readDigitalLink(text) {
  const m = DL.exec(text);
  if (!m) return null;
  const canonical = m[1].toLowerCase() === 'id.gs1.org';
  const segments = (m[2] ?? '').split('/').slice(1);
  for (let i = 0; i + 1 < segments.length; i += 1) {
    const key = Object.hasOwn(DL_KEYS, segments[i]) ? DL_KEYS[segments[i]] : null;
    if (!key) continue;
    const value = segments[i + 1];
    // On another host than id.gs1.org a path is read as a Digital Link only when the key has a length the key can have.
    if (!canonical && !(DIGITS.test(value) && key.lengths.includes(value.length))) continue;
    const out = { scheme: `Digital Link ${key.name}`, level: 'instance', problem: null, check: null, key: null, site: null };
    if (!DIGITS.test(value) || !key.lengths.includes(value.length)) {
      out.problem = `has a ${key.name} of "${value.slice(0, 30)}", not ${key.lengths.join(', ').replace(/, (\d+)$/, ' or $1')} digits`;
      return out;
    }
    const v = verifyCheckDigit(value);
    if (!v.ok) out.check = { kind: key.check, name: key.name, value, expected: v.expected };
    const rest = segments.slice(i + 2);
    const pair = (code) => {
      const at = rest.indexOf(code);
      return at >= 0 && at % 2 === 0 && at + 1 < rest.length ? rest[at + 1] : null;
    };
    if (key.check === 'gtin') {
      const gtin = value.padStart(14, '0');
      const serial = pair('21');
      out.level = serial === null ? 'class' : 'instance';
      out.key = serial === null ? `01/${gtin}${pair('10') === null ? '' : `/10/${pair('10')}`}` : `01/${gtin}/21/${serial}`;
    } else if (key.check === 'sscc') out.key = `00/${value}`;
    else {
      out.level = 'location';
      out.site = `414/${value}`;
      const ext = pair('254');
      out.key = ext === null ? out.site : `${out.site}/254/${ext}`;
    }
    return out;
  }
  return null;
}

const EPC_FORMS = [
  ['urn:epc:id:sgtin:', 'SGTIN', 'instance'],
  ['urn:epc:id:sscc:', 'SSCC', 'instance'],
  ['urn:epc:id:sgln:', 'SGLN', 'location'],
  ['urn:epc:class:lgtin:', 'LGTIN', 'class'],
  ['urn:epc:idpat:sgtin:', 'SGTIN pattern', 'class']
];

// Reads an identifier of an event: null when its text is not an EPC URI of the forms above or a GS1 Digital Link URI,
// which the tool leaves as it is, or { scheme, level, problem, check, key, site }. problem says what is wrong with its
// form; check names a key whose check digit is wrong; key is the text two identifiers of the same object share in both
// forms; site is the GLN of a location without its extension.
export function readIdentifier(text) {
  const form = EPC_FORMS.find(([p]) => text.startsWith(p));
  if (!form) return readDigitalLink(text);
  const [prefix, scheme, level] = form;
  const parts = text.slice(prefix.length).split('.');
  const out = { scheme, level, problem: null, check: null, key: null, site: null };
  const want = scheme === 'SSCC' ? 2 : 3;
  if (parts.length !== want) {
    out.problem = `has ${parts.length} ${parts.length === 1 ? 'part' : 'parts'} after "${prefix}", not ${want}, separated by dots`;
    return out;
  }
  if (scheme === 'SSCC') {
    out.problem = digitsProblem(parts[0], parts[1], 17, 'a serial reference');
    if (!out.problem) {
      const d = `${parts[1][0]}${parts[0]}${parts[1].slice(1)}`;
      out.key = `00/${d}${checkDigit(d)}`;
    }
    return out;
  }
  if (scheme === 'SGLN') {
    out.problem = digitsProblem(parts[0], parts[1], 12, 'a location reference', true) ?? tailProblem(parts[2], 'an extension');
    if (!out.problem) {
      const d = `${parts[0]}${parts[1]}`;
      out.site = `414/${d}${checkDigit(d)}`;
      out.key = parts[2] === '0' ? out.site : `${out.site}/254/${parts[2]}`;
    }
    return out;
  }
  out.problem = digitsProblem(parts[0], parts[1], 13, 'an indicator and item reference');
  if (!out.problem) {
    if (scheme === 'SGTIN pattern') out.problem = parts[2] === '*' ? null : 'does not end with ".*", the whole class';
    else out.problem = tailProblem(parts[2], scheme === 'SGTIN' ? 'a serial number' : 'a lot');
  }
  if (!out.problem) {
    const gtin = gtinOf(parts[0], parts[1]);
    out.key = scheme === 'SGTIN' ? `01/${gtin}/21/${parts[2]}` : scheme === 'LGTIN' ? `01/${gtin}/10/${parts[2]}` : `01/${gtin}`;
  }
  return out;
}

// Whether a text is a URI: a scheme, then a colon.
export const isUri = (text) => SCHEME.test(text);
