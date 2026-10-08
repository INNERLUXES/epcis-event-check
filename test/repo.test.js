import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES, checkText } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');
const HOMEPAGE = 'https://innerluxes.dev/blockchain/supply-chain';
const DECISIONS = ['docs/decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md', 'docs/decisions/0002-read-json-with-a-reader-of-its-own-and-never-show-a-secret.md', 'docs/decisions/0003-check-the-events-on-disk-and-contact-no-ledger.md'];
// The pattern of tools/check.mjs, kept unchanged: a word of four digits that starts with 19 or 20 reads like a year,
// unless it is the number of a standard after EIP or ERC.
const YEAR = /(?<!(?:EIP|ERC)[- ]?)\b(?:19|20)\d{2}\b/i;
const DATE = /\b(\d{4})-\d{2}-\d{2}\b/g;
const MADE_UP_YEAR = '2101';
const NOT_A = 'not a certification of conformance to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really happened';
const norm = (t) => t.replace(/\s+/g, ' ');

// Every file below a folder of the repository, with forward slashes.
async function filesOf(dir) {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel), { withFileTypes: true })) {
      const r = `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk(dir);
  return out.sort();
}

// Every file of the repository that is committed.
async function allFiles() {
  const out = [];
  const walk = async (rel) => {
    for (const e of await readdir(resolve(root, rel || '.'), { withFileTypes: true })) {
      if (['.git', 'coverage'].includes(e.name) || (!rel && ['dist', 'node_modules'].includes(e.name))) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(r);
      else out.push(r);
    }
  };
  await walk('');
  return out.sort();
}

const docFiles = async () => ['README.md', 'LICENSE', 'CHANGELOG.md', 'CONTRIBUTING.md', 'SECURITY.md', 'research/sources.md', ...(await filesOf('docs')).filter((f) => f.endsWith('.md'))];

test('package.json: a zero-dependency Node 22 ES module with the bin, the scripts, the author and the homepage', async () => {
  const pkg = JSON.parse(await read('package.json'));
  assert.equal(pkg.name, 'epcis-event-check');
  assert.equal(pkg.version, '1.0.0');
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.engines.node, '>=22');
  assert.equal(pkg.homepage, HOMEPAGE);
  assert.equal(pkg.license, 'MIT');
  assert.equal(pkg.author, 'INNERLUXES <info@innerluxes.dev>');
  assert.equal(pkg.repository.url, 'git+https://github.com/INNERLUXES/epcis-event-check.git');
  assert.equal(pkg.dependencies, undefined);
  assert.equal(pkg.devDependencies, undefined);
  assert.equal(pkg.bin['epcis-event-check'], 'bin/epcis-event-check.js');
  for (const k of ['epcis', 'gs1', 'supply-chain', 'blockchain', 'traceability', 'gtin', 'sgtin', 'hyperledger-fabric', 'data-quality', 'static-analysis', 'cli']) assert.ok(pkg.keywords.includes(k), k);
  assert.match(pkg.description, /^EPCIS event check: /);
  assert.match(pkg.description, /Not a certification of conformance\./);
  for (const script of ['test', 'check', 'example', 'test:coverage']) assert.ok(pkg.scripts[script], script);
  assert.equal(pkg.scripts.test, 'node --test "test/*.test.js"');
  const lock = JSON.parse(await read('package-lock.json'));
  assert.deepEqual(Object.keys(lock.packages), ['']);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.name, pkg.name);
  assert.ok((await read('bin/epcis-event-check.js')).startsWith('#!/usr/bin/env node\n'));
});

test('README: one link to the page on blockchain supply chain development, with its title, in the closing Background section', async () => {
  const readme = await read('README.md');
  const parts = readme.split(/^## /m);
  const background = parts.find((p) => p.startsWith('Background'));
  assert.ok(background, 'a Background section');
  assert.ok(norm(background).includes(`[Blockchain Supply Chain Solutions and Development](${HOMEPAGE})`));
  assert.equal(readme.split('innerluxes.dev/').length - 1, 1, 'the README links to the site once');
  assert.equal(parts.at(-1).split('\n')[0], 'License');
  assert.equal(parts.at(-2).split('\n')[0], 'Background');
});

test('README: the npm test block shows the summary counts with no symbol in front, and they add up', async () => {
  const readme = await read('README.md');
  const block = /```\n(tests (\d+)\npass (\d+)\nfail (\d+)\nskipped (\d+))\n```/.exec(readme);
  assert.ok(block, 'the npm test block');
  const [, , tests, pass, fail, skipped] = block.map(Number);
  assert.equal(pass + fail + skipped, tests);
  assert.equal(fail, 0);
  assert.ok(tests >= 100);
});

test('README: what it checks, how to run it with npx or node, the options, the example output and the limits', async () => {
  const readme = await read('README.md');
  for (const heading of ['## Quick start', '## Usage', '## How the file is read', '## What it checks', '## What is not checked', '## Formats', '## Exit codes', '## Limits', '## Architecture', '## Where the facts come from']) assert.ok(readme.includes(`\n${heading}\n`), heading);
  assert.match(readme, /npx --yes github:INNERLUXES\/epcis-event-check events\.json/);
  assert.match(readme, /node bin\/epcis-event-check\.js examples\/bad\/events\.json --now 2101-03-10T12:00:00Z/);
  for (const option of ['--format', '--json', '--min-severity', '--fail-on', '--now', '--explain', '--list-checks', '--help', '--version']) assert.ok(readme.includes(option), option);
  for (const r of RULES) assert.ok(readme.includes(`| \`${r.id}\` | ${r.severity} | ${r.kind} |`), `README: ${r.id}`);
  for (const s of ['ref.gs1.org/standards/epcis/', 'github.com/gs1/EPCIS/tree/master/JSON-Schema', 'ref.gs1.org/standards/cbv/', 'ref.gs1.org/standards/tds/', 'ref.gs1.org/standards/genspecs/']) assert.ok(readme.includes(s), s);
  for (const f of ['text', 'markdown', 'JSON', 'SARIF']) assert.ok(readme.includes(f), f);
  assert.match(readme, /Thirty-two checks/);
  assert.match(readme, /Twenty are documented/);
  assert.equal(RULES.length, 32);
  assert.equal(RULES.filter((r) => r.kind === 'documented').length, 20);
  assert.ok(!readme.includes('@@'), 'no placeholder is left');
});

test('README and documents: an input to a review, not a certification and not a guarantee', async () => {
  for (const file of ['README.md', 'docs/limits.md', 'docs/method.md', 'docs/secure-defaults.md', 'docs/threat-model.md', 'docs/rules-and-sources.md', 'docs/inputs.md', 'SECURITY.md', 'CONTRIBUTING.md', 'CHANGELOG.md', 'research/sources.md', DECISIONS[1]]) assert.ok(norm(await read(file)).includes(NOT_A), file);
  const readme = await read('README.md');
  assert.ok(norm(readme).indexOf('not a certification of conformance') < norm(readme).indexOf('## Quick start'), 'said before the quick start');
  assert.ok(norm(readme).includes('it contacts no ledger, node or API, fetches nothing, writes nothing to a ledger, runs nothing, needs no key and reads no clock'));
  assert.ok(readme.includes('heuristic'));
  assert.match(await read('docs/limits.md'), /^The tool is not a certification and not an audit\./m);
});

test('README and documents: the eventTimeZoneOffset and the action are never said to be required by the EPCIS standard in plain words', async () => {
  const notes = norm(await read('research/sources.md'));
  assert.ok(notes.includes('it does not call the offset mandatory in plain words'));
  assert.ok(notes.includes('Nor does the standard call the action required in plain words'));
  for (const file of await docFiles()) assert.doesNotMatch(norm(await read(file)), /EPCIS (?:standard )?(?:requires|calls) (?:the )?(?:eventTimeZoneOffset|action)/i, file);
});

test('docs/inputs.md: the short file passes every check', async () => {
  const inputs = await read('docs/inputs.md');
  const json = /### A short file\n\n[^\n]*\n[^\n]*\n\n```json\n([\s\S]*?)\n```/.exec(inputs)[1];
  const r = checkText(json);
  assert.deepEqual(r.findings.map((f) => f.id), []);
  assert.equal(r.read.events.length, 1);
});

test('README and documents: no number that reads like a year and no date in words; every full date is in the made-up year', async () => {
  for (const file of await docFiles()) {
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d/, file);
  }
  for (const file of await allFiles()) {
    if (file.startsWith('research/sources/') || file === 'tools/check.mjs') continue;
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    for (const m of text.matchAll(DATE)) assert.equal(m[1], MADE_UP_YEAR, `${file}: ${m[0]}`);
  }
  for (const file of await filesOf('research/sources')) {
    const text = await read(file);
    assert.doesNotMatch(text, YEAR, file);
    assert.doesNotMatch(text, /\b\d{4}-\d{2}-\d{2}\b/, file);
  }
  for (const file of ['package.json', ...DECISIONS, ...(await filesOf('src'))]) assert.doesNotMatch(await read(file), /\b\d{4}-\d{2}-\d{2}\b/, file);
  assert.match(await read('CHANGELOG.md'), /^## 1\.0\.0$/m);
});

test('the year pattern passes over versions, seconds, counts, identifiers and the numbers of standards and still catches a year', () => {
  for (const ok of ['1.0.0', 'Node 22', 'EPCIS 2.0', 'SARIF 2.1.0', 'RFC 8259', '846,000 seconds', '100,000 events', 'NIST SP 800-218', 'urn:epc:id:sgtin:9521234.012345.1001', '09521234123453', '2101-03-10T12:00:00Z', 'GS1 Prefix 952']) assert.doesNotMatch(ok, YEAR, ok);
  const year = ['20', '24'].join('');
  const old = ['19', '99'].join('');
  for (const bad of [year, `in ${year}`, old, `${year}.`, `serial ${['20', '01'].join('')}`, `11.${['20', '50'].join('')}`]) assert.match(bad, YEAR, bad);
});

test('README and documents: plain ASCII, with no emoji and no decorative character', async () => {
  for (const file of [...(await docFiles()), '.github/pull_request_template.md', '.github/CODEOWNERS', 'package.json', ...(await filesOf('research/sources'))]) {
    const text = await read(file);
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), file);
  }
});

test('every file: none of the words this project keeps out of its prose, and no name of a tool that wrote it', async () => {
  // Built from pieces, so that this file does not hold the words; a word is matched at its start. The names EPCIS gives
  // one of its event types and its field, and the ids of the checks named after them, are names of the standard and
  // are taken out first, as tools/check.mjs does.
  const words = [['har', 'ness'], ['del', 'v'], ['lever', 'ag'], ['seam', 'less'], ['rob', 'ust'], ['cutting', '-edg'], ['un', 'lock'], ['em', 'power'], ['ele', 'vat'], ['stream', 'lin'], ['game', '-changer'], ['tap', 'estr'], ['re', 'alm'], ['further', 'more'], ['more', 'over'], ['in today', "'s"], ['gene', 'rated'], ['trans', 'form']].map((p) => p.join(''));
  const banned = new RegExp(`\\b(?:${words.join('|')})`, 'i');
  const standardNames = new RegExp(`\\b(?:${['Trans', 'formationEvents?'].join('')}|${['trans', 'formationID'].join('')}|${['trans', 'formation-with-action'].join('')}|${['trans', 'formation-inputs-outputs-empty'].join('')})\\b`, 'g');
  const names = new RegExp(`${['cla', 'ude'].join('')}|${['anthro', 'pic'].join('')}|\\b${['A', 'I'].join('')}\\b|\\b${['assis', 'tant'].join('')}|\\b${['ch', 'at'].join('')}\\b|\\b${['ses', 'sion'].join('')}|${['co-', 'authored'].join('')}|${['gene', 'rated'].join('')}`, 'i');
  for (const file of await allFiles()) {
    if (file === 'tools/check.mjs') continue;
    const text = await read(file);
    if (!file.startsWith('research/sources/')) assert.doesNotMatch(text.replace(standardNames, ''), banned, file);
    assert.doesNotMatch(text, names, file);
    // One word of the list is kept out of the saved copies of the standards too.
    assert.doesNotMatch(text, new RegExp(['un', 'lock'].join(''), 'i'), file);
  }
  assert.match(`an ${['assis', 'tant'].join('')} wrote this`, names);
  assert.match(['Trans', 'formationEvent'].join('').replace(standardNames, ''), /^$/);
  assert.match(`a ${['trans', 'formation'].join('')} of the business`.replace(standardNames, ''), banned, 'the word itself is still caught');
});

test('no file holds a string shaped like a token or a private key', async () => {
  const shapes = [new RegExp(`\\b(?:${['gh', 'p'].join('')}|${['gh', 'o'].join('')}|${['gh', 's'].join('')}|${['github', '_pat'].join('')})_[A-Za-z0-9_]{6,}`), new RegExp(`-----BEGIN [A-Z ]*${['PRIVATE', ' KEY'].join('')}-----`), new RegExp(`\\b${['AK', 'IA'].join('')}[0-9A-Z]{16}\\b`)];
  for (const file of await allFiles()) {
    const text = await read(file);
    for (const shape of shapes) assert.doesNotMatch(text, shape, file);
    assert.ok(!text.includes(['gh', 'p_'].join('')), file);
  }
});

test('LICENSE: MIT with the copyright line of INNERLUXES and no year', async () => {
  const license = await read('LICENSE');
  assert.ok(license.startsWith('MIT License\n\nCopyright (c) INNERLUXES\n'));
});

test('SECURITY.md: how to report, and no promise about reply times or fixes', async () => {
  const text = await read('SECURITY.md');
  assert.match(text, /info@innerluxes\.dev/);
  assert.match(text, /"epcis-event-check security"/);
  assert.doesNotMatch(text, /within\s+\d|business days|within a (?:day|week)|\d+\s*(?:hours|days)\b|we will|we guarantee|guaranteed|respond within|reply within/i);
});

test('workflows: every action is pinned to a commit, the CI runs three systems, two Node versions and coverage, and the SSDF gate is there', async () => {
  for (const name of ['ci.yml', 'codeql.yml', 'release.yml']) {
    const text = await read(`.github/workflows/${name}`);
    assert.match(text, /^permissions:\n {2}contents: read$/m, name);
    const uses = [...text.matchAll(/^\s*- uses: (\S+)/gm)].map((m) => m[1]);
    assert.ok(uses.length > 0, name);
    for (const u of uses) assert.match(u, /@[0-9a-f]{40}$/, `${name}: ${u}`);
    assert.doesNotMatch(text, /marketplace|escrow|nft-|token-transfer|payout-batch|crypto-checkout|tokenomics/i, name);
  }
  const ci = await read('.github/workflows/ci.yml');
  assert.match(ci, /os: \[ubuntu-latest, windows-latest, macos-latest\]/);
  assert.match(ci, /node: \[22, 24\]/);
  assert.match(ci, /run: npm run test:coverage/);
  assert.match(ci, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(ci, /repository: INNERLUXES\/ssdf-repo-check/);
  assert.match(ci, /ref: dfda194a3ed35623b8b420df05e110b66d984586 # v1\.0\.0/);
  for (const s of [/npm ci/, /npm run check/, /npm run example/, /git diff --exit-code -- examples/]) assert.match(ci, s);
});

test('codeql: JavaScript only, with the security-extended queries, and the examples and saved copies left out', async () => {
  const codeql = await read('.github/workflows/codeql.yml');
  assert.match(codeql, /languages: javascript-typescript/);
  assert.doesNotMatch(codeql, /autobuild/i);
  assert.match(codeql, /security-extended/);
  assert.match(codeql, /paths-ignore:\n\s+- examples\n\s+- research/);
  const attributes = await read('.gitattributes');
  assert.match(attributes, /^examples\/\*\* linguist-documentation$/m);
  assert.match(attributes, /^examples\/\*\* linguist-detectable=false$/m);
  assert.match(attributes, /^research\/sources\/\*\* -text$/m);
  assert.doesNotMatch(await read('.github/dependabot.yml'), /package-ecosystem: (?:nuget|pip|maven)/);
});

test('release workflow: the SSDF gate, then a tgz, a CycloneDX SBOM, SHA256SUMS and a provenance attestation named for this package', async () => {
  const release = await read('.github/workflows/release.yml');
  assert.match(release, /node \.ssdf\/bin\/ssdf-repo-check\.js repo --require-all --fail-on-problem/);
  assert.match(release, /ref: dfda194a3ed35623b8b420df05e110b66d984586 # v1\.0\.0/);
  assert.ok(release.indexOf('ssdf-repo-check.js') < release.indexOf('npm pack'), 'the gate runs before the package is made');
  assert.match(release, /npm pack --pack-destination dist/);
  assert.match(release, /npm sbom --sbom-format cyclonedx > dist\/epcis-event-check\.cdx\.json/);
  assert.match(release, /sha256sum \* > SHA256SUMS/);
  assert.match(release, /actions\/attest-build-provenance@/);
  assert.match(release, /tags: \['v\*'\]/);
});

test('repository files: Dependabot for actions and npm, CODEOWNERS, a pull request template and the line-end rules', async () => {
  const dependabot = await read('.github/dependabot.yml');
  assert.match(dependabot, /package-ecosystem: github-actions/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(await read('.github/CODEOWNERS'), /^\* @innerluxesdev$/m);
  assert.match(await read('.github/pull_request_template.md'), /Conventional Commits/);
  assert.match(await read('.gitattributes'), /^\* text=auto eol=lf$/m);
  assert.match(await read('.gitignore'), /^\*\.pem$/m);
});

test('docs/secure-defaults.md is long enough for the SSDF gate, and every document the README links to exists', async () => {
  assert.ok(norm(await read('docs/secure-defaults.md')).length > 4000);
  const readme = await read('README.md');
  const files = await allFiles();
  for (const link of readme.matchAll(/\]\(((?:docs|research|examples)\/[^)#]*)\)/g)) assert.ok(files.includes(link[1].replace(/\/$/, '')) || files.some((f) => f.startsWith(link[1])), link[1]);
  for (const d of DECISIONS) assert.ok(files.includes(d), d);
});

test('src never reaches the network, runs a program or reads a clock, and builds no regular expression from input', async () => {
  const banned = [/node:(?:net|http|https|http2|dgram|tls|dns|child_process|worker_threads|vm|cluster)/, /\bfetch\(/, /\bXMLHttpRequest\b/, /\beval\(/, /new Function\(/, /\bDate\b/, /Date\.now/, /Math\.random/, /process\.env/, /Intl\./, /parseFloat\(/, /performance\.now/, /hrtime/];
  for (const file of await filesOf('src')) {
    const text = await read(file);
    for (const b of banned) assert.doesNotMatch(text.replace(/^\s*\/\/.*$/gm, ''), b, `${file}: ${b}`);
    if (file !== 'src/text.js') assert.ok(!/new RegExp/.test(text), `${file} builds a regular expression`);
  }
  assert.ok((await read('src/size.js')).includes('toLocaleString'), 'grouped() fixes the locale in the call');
});

test('src is only written to standard output and standard error, never to the disk', async () => {
  for (const file of await filesOf('src')) {
    const text = await read(file);
    assert.doesNotMatch(text, /writeFile|appendFile|createWriteStream|mkdir|unlink|rmSync|rename\(/, file);
  }
});

test('the secret search, the JSON reader, the decimal reader and the bounded file reader are the ones of the sibling tools, kept unchanged, with their limits and no recursion', async () => {
  assert.match(await read('src/secrets.js'), /^\/\/ The tool never reads a seed or a key\. A configuration that holds one anyway/);
  const json = await read('src/json.js');
  assert.match(json, /stack\.length \+ 1 > limits\.maxDepth/);
  assert.match(json, /nodes > limits\.maxNodes/);
  assert.match(json, /> limits\.maxStringLength/);
  // The functions inside readJson end at a closing brace with two spaces in front; none of them calls itself.
  for (const name of ['skipSpace', 'readString', 'scalar', 'begin', 'member']) {
    const from = json.indexOf(`  function ${name}(`);
    assert.ok(from > 0, name);
    const body = json.slice(json.indexOf('\n', from), json.indexOf('\n  }\n', from));
    assert.ok(!body.includes(`${name}(`), `${name} calls itself`);
  }
  const files = await read('src/files.js');
  assert.match(files, /O_NOFOLLOW/);
  assert.match(files, /s\.size > limits\.maxBytes/);
  assert.match(await read('src/events.js'), /limits\.maxEvents/);
  assert.match(await read('src/decimal.js'), /> limits\.maxDigits/);
  const check = await read('src/check.js');
  assert.ok(check.includes('const stack = [root];') && !/function hexNodes[\s\S]*hexNodes\(node/.test(check), 'the walk for sensor data has a stack of its own');
});

test('a guarded test never asserts a line of its own', async () => {
  const text = await read('test/files.test.js');
  for (const block of text.split(/\ntest\(/).filter((b) => b.includes("process.platform === 'win32'"))) assert.doesNotMatch(block, /\.line\b|lineOf\(/);
});

test('every test file builds its paths with resolve(), and no test writes a backslash into a file name', async () => {
  for (const file of (await filesOf('test')).filter((f) => f.endsWith('.js'))) {
    const text = await read(file);
    assert.doesNotMatch(text, /\bjoin\(\s*(?:dir|tmpdir|root)/, `${file} joins an absolute path`);
    assert.doesNotMatch(text, /['"`][A-Za-z0-9_]+\\\\[A-Za-z0-9_]+\.json['"`]/, `${file} writes a backslash into a file name`);
  }
});

test('tools/check.mjs and tools/example.mjs exist, the year check and the list of plain words are those of the sibling tools, and the saved example outputs are all there', async () => {
  const files = await filesOf('examples/output');
  for (const f of ['bad.txt', 'good.txt', 'bad-explain.txt', 'bad.md', 'good.md', 'bad-explain.md', 'bad.json', 'good.json', 'bad.sarif', 'good.sarif', 'checks.txt', 'checks.json']) assert.ok(files.includes(`examples/output/${f}`), f);
  const check = await read('tools/check.mjs');
  assert.ok(check.includes('no problems'));
  assert.ok(check.includes(`const YEAR = ${YEAR.toString()};`), 'the year check is unchanged');
  assert.ok(check.includes("const BANNED_WORDS = [['har', 'ness'], ['del', 've'], ['lever', 'age'], ['seam', 'less'], ['rob', 'ust'], ['cutting', '-edge'], ['un', 'lock'], ['em', 'power'], ['ele', 'vate'], ['stream', 'line'], ['game', '-changer'], ['tap', 'estry'], ['re', 'alm'], ['further', 'more'], ['more', 'over'], ['in today', \"'s\"], ['trans', 'form']].map((p) => p.join(''));"), 'the list of plain words is unchanged');
  assert.ok((await read('tools/example.mjs')).includes('examples/output'));
});

test('the docs name every check id and every option of the command line', async () => {
  const method = await read('docs/method.md');
  for (const r of RULES) assert.ok(method.includes(`\`${r.id}\``), `docs/method.md: ${r.id}`);
  const inputs = await read('docs/inputs.md');
  for (const option of ['--format', '--json', '--min-severity', '--fail-on', '--now', '--explain', '--list-checks']) assert.ok(inputs.includes(option), option);
  const changelog = await read('CHANGELOG.md');
  for (const r of RULES) assert.ok(changelog.includes(`\`${r.id}\``), `CHANGELOG.md: ${r.id}`);
});
