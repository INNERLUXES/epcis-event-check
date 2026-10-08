# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "epcis-event-check security", or use private vulnerability
reporting on this repository. Please do not open a public issue for a vulnerability.

Include a small made-up file of events that shows the problem, the command you ran, what you expected and what
happened. Use made-up identifiers, such as those of the GS1 Prefix 952 that GS1 keeps for examples, never the events of
a real partner or a real product, and never a real private key, seed or mnemonic, even an old one or one from a test
network.

## Scope

The tool is an input to a review of EPCIS events before they are written to a shared supply chain ledger: not a
certification of conformance to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events
describe what really happened. In scope:

- an input that makes the tool show a private key, a seed or a mnemonic, or any part of one, in a report or an error
  message, in any format, or the value under `hexBinaryValue`
- a key or a seed in one of the shapes docs/limits.md names that the tool does not report, outside the key of sensor
  data that docs/limits.md names
- an input that makes the tool read a file other than the one it was given, or follow a symbolic link
- an input that makes the tool open a network connection, fetch a URL or a `@context`, contact a ledger, a node or an
  API, write or sign anything, run any other program, or evaluate anything it reads
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as a very large
  file, a hundred thousand events or EPCs, one EPC in a hundred thousand events, arrays and objects nested deep, very
  long identifiers or numbers with thousands of digits
- binary or invalid input that the tool reads as if it were a file of events
- a key written twice whose second value is taken without a finding, a field the tool did not read that a check reports
  as fine, or a misspelt key that is not reported
- a file of events that docs/method.md says is reported (an unknown event type, a time with no zone, an action in small
  letters, a GTIN with a wrong check digit, an EPC seen after its delete) that the tool does not report
- a quantity or a time that the tool reads in a way the text of the file does not say, so that a check passes or fails
  because of it
- a run that passes at a `--fail-on` level although the input holds a finding at that level that docs/method.md says is
  reported
- text from the file or a file name that rewrites the terminal through control or direction characters, is shown
  unescaped in the output, or puts markup into the markdown report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, whether the events describe what happened (a clean
result is not a certification), whether a company prefix belongs to the partner that uses it, whether the ledger
accepts an event, secrets in shapes the search does not claim to know, who may change or upload the file, and where
your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
