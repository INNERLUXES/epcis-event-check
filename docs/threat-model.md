# Threat model

The tool is an input to a review of EPCIS events before they are written to a shared supply chain ledger: not a
certification of conformance to EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events
describe what really happened. This document is about the tool itself: what it touches, what a hostile or careless file
of events can try, and what stops it.

## What the tool touches

- It reads the one file named on the command line. Nothing else is opened, and no URI, address or path written in the
  file is looked up, opened or followed; the `@context` of JSON-LD is not fetched.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no URL, contacts no ledger, node or API, writes nothing to a ledger, follows
  no symbolic link, runs nothing it reads, evaluates nothing and reads no clock and no locale.

## What the input may hold

A file of events comes from the capture application of a partner, an export of a repository or a person who edits it,
and in a pipeline that checks every pull request or every upload it may be written by whoever sent it. Through it, a
person can try to, or a careless change can:

- put a private key, a seed or a mnemonic in the file, in the header or as an extension field of an event, so that the
  tool copies it into a pipeline log, a pull request comment or a code scanning upload;
- hide a private key under `hexBinaryValue`, where sensor data of the same shape belongs;
- make the tool read outside the file: a link named on the command line, a folder, an address given as the path;
- make the tool reach a server: the `@context` of JSON-LD, a GS1 Digital Link URI, a certification address;
- exhaust the memory, the stack or the time: a file of many megabytes, a hundred thousand events, a hundred thousand
  EPCs in one list, one EPC shipped and packed a hundred thousand times, arrays and objects nested very deep, very long
  identifiers, numbers with thousands of digits and exponents of millions;
- move the result: a key written twice so that two readers see two eventIDs, a misspelt key that hides a bizLocation, a
  field of the wrong type that might be taken as fine, a quantity that a floating point number would read wrongly, a
  time with no zone that each reader turns into another moment;
- slip in something that is not text: a binary file named `.json`, bytes that are not valid UTF-8 or UTF-16;
- rewrite the terminal or break the output: control characters, escape sequences, direction controls and line separators
  in an EPC, a bizStep, a time or an eventID;
- hide markup in the markdown report: a link, a table separator or a tag in an identifier;
- change how objects behave: a key, a type or a Digital Link segment named `__proto__`, `constructor` or `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A secret in the file is copied into the output | Before the file is read, every key and value is looked at for a key or a seed; each one found is a `secret-in-file` error, the value is marked, the reader leaves it out as if it were not there, and no message names it. Tests put each shape under several fields and check every format for the value |
| A key under `hexBinaryValue` is copied into the output | The tool does not read sensor data and never shows a value under that key; a value of 64 hex digits there is not reported, and any other shape there is still a secret |
| A link makes the tool read a file it was not given | The path is checked with `lstat` and a link is refused by name; the file is opened with `O_NOFOLLOW` where the system has it, and its type and size are taken from the open handle. A test puts a link in the folder |
| The tool reaches a server, fetches, connects or runs something | No module of the network or of child processes is imported, nothing is evaluated, a URI is only text that is read for its form, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | The file has a size limit checked on the open handle before it is read; the reader keeps limits of nesting, values and string length; the JSON reader, the search for secrets and the walk for sensor data keep stacks of their own; at most 100,000 events and 10,000 items of a list are read; duplicates, deletes, places and parents are kept in maps, and a receipt is found by halving, never by comparing every pair. Tests check the time, with limits that widen under coverage only |
| A key written twice hides a value | A key written twice in one JSON object is a `file-unreadable` finding |
| A misspelt or missing field passes for one that is fine | A key the tool does not read is a `field-unknown` finding with the key it is probably meant to be; a missing field is `field-missing`; a value of the wrong type is `field-invalid`; each with its line |
| Quantities or times are read wrongly | Quantities are read from the characters of the file with BigInt; an exponent beyond 40 or a number past the limit is a finding, never rounded. Times are read from their characters with a calendar worked out by hand, and a time with no zone is a finding |
| A binary file or bytes in another encoding are read as text | A null byte in UTF-8, an odd number of bytes in UTF-16 and bytes that are not valid make the file an input error with exit code `2` and no report |
| Text from the file rewrites the terminal | Every text from the input goes through `safeText`, which replaces control, line separator and direction characters and caps the length. A test puts escapes and direction controls in an EPC and a bizStep, in every format |
| Markup in a value changes the markdown report | The markdown report escapes the characters markdown gives a meaning to. A test writes a link into an identifier |
| `__proto__` changes how objects behave | Objects of the file are lists of entries compared with the names the tool reads, and no object is built with a key from the file; the event types and the keys of a Digital Link are looked up with `Object.hasOwn`. A test uses `__proto__`, `constructor` and `toString` as keys, types and segments |
| The time of the run changes the result | No clock is read; the one moment is the one of `--now`, so the same file and options give the same report on every day |
| A device or a pipe hangs the tool | A path that is not a regular file is refused before it is read |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the events describe what happened, whether a company prefix belongs to the partner that uses it, whether a
partner may write to the ledger, whether the ledger accepts an event, the forms and secrets docs/limits.md says the tool
does not see, who may change or upload the file, and where your pipeline keeps the output.
