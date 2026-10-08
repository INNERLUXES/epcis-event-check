# 2. Read JSON with a reader of its own, and never show a secret

## Status

Accepted

## Context

An EPCIS file in JSON or JSON-LD is JSON. `JSON.parse` would read it, but it keeps no line and column of a value, so a
finding could not point at the event and the field to change; it takes the last of two values written under one key
without a word, so two readers of the same file could see two eventIDs or two actions; it builds objects whose keys
come from the file; and it turns every number into a floating point number, so a quantity is read as the nearest double
and not as written.

A file of events is written by capture applications and scripts that run next to the keys of a ledger, and a careless
file can hold a secret: the private key of the account that writes to the ledger pasted into the header, a seed phrase
in an extension field. A tool that reads such a file and echoes its values in a report would copy the secret into a
pipeline log, a pull request comment or a SARIF upload, where many more people can read it.

A file of events also holds values that have the shape of a key and are not one: the hex data of a sensor report, which
may be 64 hex digits, the shape the search for secrets of the sibling tools reads as a private key in hex.

A file that is not complete (an event with no type, a readPoint with no id, a misspelt bizLocation) would also be read
as if it were, and a check could take a value it never saw for one that is fine.

## Decision

1. The file is read by src/json.js, the reader of the sibling tools for strict JSON, kept unchanged, with the line and
   column of every value, a key written twice as an error, and limits of nesting, values and string length. It does not
   recurse. Every number keeps the characters it was written with.
2. Quantities are read from the characters of the file with the decimal reader of the sibling tools (src/decimal.js,
   kept unchanged) into a whole number and a scale; an exponent is applied exactly, up to 40 places. A number past the
   limit is a finding, never rounded.
3. The tool never asks for a private key, a seed or an API key: it checks the events as written. Before the file is
   read, src/secrets.js, kept unchanged from the sibling tools, walks every key and value of it. A key named for a key
   or a seed, and a value shaped like a mnemonic, an extended private key, a private key in hex or a key in WIF, is a
   `secret-in-file` error at its line. The value is marked, the reader leaves it out as if it were not there, and no
   report and no error message shows it, in any format.
4. A value of 64 hex digits, with or without 0x, under the key `hexBinaryValue` is read as the sensor data it is meant
   to be: src/check.js drops the finding of the search for that one value. The tool does not read sensor data and never
   shows the value of that key, so a key pasted there by mistake is not echoed either. Under any other key the same
   value is still a `secret-in-file` error, and a mnemonic or a key in WIF under that key is still one too.
5. Every field the checks need and the file does not give, every key the tool does not read in its place and every value
   of the wrong type is returned with its line and shown as a finding. A check never takes a value it did not read for
   one that is fine. A key that holds a colon is an extension field of JSON-LD, which the JSON schema of EPCIS allows,
   and is left alone.
6. The checks are a heuristic over the events as written, and every report says so; docs/method.md says what each check
   reads and docs/limits.md what it cannot see. The result is an input to a review of EPCIS events before they are
   written to a shared supply chain ledger: not a certification of conformance to EPCIS or the CBV, not an audit of the
   supply chain and not a guarantee that the events describe what really happened.

## Consequences

- The tool needs no install and no network, and the same file gives the same report on Linux, Windows and macOS.
- A finding points at the line of the event, the field, the EPC or the quantity it is about.
- A secret in the file fails the run and is never copied into the output. The shapes are loose, so a value that only
  looks like a secret, such as a note of twelve short lowercase words, is reported too; that is the safe side.
- A private key pasted under `hexBinaryValue` cannot be told apart from sensor data and is not reported; it is not shown
  either, and docs/limits.md says so.
- EPCIS written as XML is not read (docs/limits.md).
