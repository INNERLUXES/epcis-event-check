# Contributing

Every change goes through a pull request and is reviewed before it is merged. The pipeline runs the tests on Linux,
Windows and macOS with Node 22 and 24, the tests with coverage, the repository checks, CodeQL, and a secure
development check of the repository itself.

Commit messages in this repository follow Conventional Commits: `feat:`, `fix:`, `docs:`, `test:`, `ci:`, `chore:`,
with `!` for a breaking change.

This tool reads a file of EPCIS events and runs nothing; its result is an input to a review of EPCIS events before they
are written to a shared supply chain ledger: not a certification of conformance to EPCIS or the CBV, not an audit of
the supply chain and not a guarantee that the events describe what really happened. A change must keep it that way: a
check reports what the file holds, and the tool never contacts a ledger, a node or an API, never writes or signs
anything, and never fetches, opens, runs or evaluates what it reads.

## Never a secret, never real events

The tool never asks for a private key, a seed or an API key, and never looks up a company prefix, a product or a place.
Do not add an option, a field or a test that gives it one: the checks are about the events as written. A test of the
search for secrets builds its values from repeated characters (see test/secrets.test.js), so that no file of the
repository holds anything that could be a real key or seed. Never paste the events of a real partner, a key or a seed
into an issue, a pull request or an example; use the GS1 Prefix 952, which GS1 keeps for examples, and made-up times.

## Never a certification

The rules a documented check applies are the standards' own. A check that is not in a saved standard is a best
practice of the tool and says so. Do not write a message, a document or an example that reads as a statement that a
file conforms to EPCIS or the CBV, or that the events are true.

## Changing a check

1. Describe the change in docs/method.md first: what the check looks at and what it can and cannot see, and add what it
   cannot see to docs/limits.md and docs/rules-and-sources.md. Where the tool makes its own choice, say so in `own` in
   src/rules.js and in the message, and say why; a check is `documented` only when one of the saved standards says the
   rule.
2. Keep the checks to what is written. A finding must point at something a reader can check in the file: a line and a
   column. Never add a check that needs the network, a ledger, a registry, a key or the clock.
3. A check says what to change, in `fix` in src/rules.js, and names the points of the public standards it rests on in
   `basis`; a new standard goes into src/data.js and research/sources.md, the parts the checks rest on are saved as
   text under research/sources, and docs/rules-and-sources.md lists it. Fetch and read a standard before it is listed,
   and never write a rule you could not read in the standards as if it were one.
4. A run must never pass because something could not be read: a file that is not strict JSON is an error finding, and a
   field that is missing, unknown or of the wrong type is a finding that names it.
5. Add a test with the events written inline (`doc()`, `event()`, `objectEvent()`, `aggregationEvent()`,
   `transactionEvent()`, `ioEvent()`, `associationEvent()`, `findingsOf()`, `idsOf()`, `ofCheck()`, `run()`
   and `cli()` in test/helpers.js), small enough to work out by hand, with a near miss on each side: the value that is
   reported and the one next to it that is not.
6. A check id, once released, keeps its meaning: pipelines and other tools read it from the JSON, SARIF and markdown
   output.

## Changing the reader

1. The JSON reader (src/json.js) keeps its limits (`JSON_LIMITS`) and works with a stack of its own; it has no
   recursion, and neither has the search for secrets (src/secrets.js) nor the walk for sensor data in src/check.js. The
   reader of the events keeps `EVENT_LIMITS`, and the decimal reader (src/decimal.js) keeps `DECIMAL_LIMITS`.
   src/secrets.js, src/json.js, src/decimal.js and the bounded reading of a file in src/files.js are kept as they are in
   the sibling tools; the only change to what the search reports is made in src/check.js, for a value under
   `hexBinaryValue` (decision 2).
2. A quantity is read from the characters of the file into a whole number and a scale with BigInt; a number past the
   limit is a finding, never a guess.
3. A time is read from its characters by src/time.js; the tool never reads the clock and never uses the date functions
   of the platform.
4. A value marked as a secret is left out as if it were not there; no message may name it.
5. A field that is read is listed in docs/inputs.md; a part the file does not give is a finding or a note, so that it
   never goes by unnoticed.
6. No pattern is built from the file or an argument. A test fails when `new RegExp` appears in src outside src/text.js.
7. The checks across events use maps and never compare every pair; a hostile test with a hundred thousand events of one
   EPC checks it.
8. A time check in a test widens under coverage: read `process.env.NODE_V8_COVERAGE`, which the test runner sets only
   when coverage is on, and allow four times the time (`allowed()` in test/helpers.js). Run `npm run test:coverage`
   before you open the pull request.
9. A file written with LF, CRLF or CR line ends, as UTF-8 with or without a byte order mark or as UTF-16 with one, must
   give the same findings.

## Changing a source

1. Every point the reports show is in src/data.js, written in this project's own words, with the standard it comes
   from. A short phrase of a standard may be named; a long quotation may not.
2. research/sources.md lists every standard with a note on what it says and the lines its copy leaves out,
   research/sources holds a text copy of the parts of each standard the checks rest on, and docs/rules-and-sources.md
   lists every check with its points and what to change. A test checks them against each other. Leave out a line of a
   standard that holds a date or a number that reads like a year, and the contact details of people, and never write a
   publication date or the date a standard was last changed.

## The examples

The files under `examples/` are made-up input for the tool: an EPCISDocument that holds a mistake of nearly every check,
and one that passes at error, warning and info level, with identifiers of the GS1 Company Prefix 9521234 under the GS1
Prefix 952, times in the made-up year 2101, and no key and no seed. A change to them goes with the real output that
`npm run example` writes to `examples/output`.

## Tests that depend on the system

A test that depends on the operating system (a symbolic link, a device) is guarded with `process.platform` and says why
in its `skip`. A test never asserts a line number written by hand: a line is worked out with `lineOf()` of
test/helpers.js or from the text itself. Every other test builds its paths with `resolve()` from names with forward
slashes, and a test never writes a backslash into a file name.

A test never reads the clock, the time zone of the machine or the locale.

## Rules for the code

- No runtime dependencies and no development dependencies. Node 22 or newer and nothing else; the tests use `node:test`.
- The tool reads the file it is given and writes only to standard output and standard error. It opens no network
  connection, contacts no ledger, node or API, opens no link, signs nothing, runs no program and evaluates nothing it
  reads.
- Text from the input, file names, identifiers, times and vocabulary values included, goes through `safeText` before it
  reaches the output or an error message.
- Source files stay ASCII; write any other character as a Unicode escape, or build it from its code point.
- No file carries a date in its prose, and no file holds a number that reads like a year. Version numbers (Node 22,
  1.0.0), counts, seconds and the number of a standard (EPCIS 2.0, SARIF 2.1.0, NIST SP 800-218) are fine; the times of
  events in the examples, the tests and the documents are in the made-up year 2101 (decision 1).
- Examples and tests use made-up partners, products and places.
- Plain words in the documents: `npm run check` fails on a short list of words that say little. EPCIS names one of its
  event types with a word of that list; that name, its field and the two checks named after them are the only words of
  the list the check passes over.

## Before you open the pull request

```
npm test
npm run test:coverage
npm run check
npm run example
```
