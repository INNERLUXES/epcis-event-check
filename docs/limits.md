# Limits

The tool is not a certification and not an audit. It reads a file of EPCIS events, and its result is an input to a
review of EPCIS events before they are written to a shared supply chain ledger: not a certification of conformance to
EPCIS or the CBV, not an audit of the supply chain and not a guarantee that the events describe what really happened. A
clean run means only that none of the problems in [method.md](method.md) were found in the file.

## What it cannot see

- **The real world.** It cannot tell whether an object was where an event says, at the time it says, in the state it
  says. A well formed event about the wrong pallet passes.
- **Who issued an identifier.** A company prefix is read for its length only. The tool cannot tell whether a prefix was
  ever issued, to whom, where it ends inside the digits of an EPC URI, or whether the company that wrote the event may
  use it. It has no table of prefixes and asks no registry.
- **Master data.** It reads no master data of a GTIN, a GLN, a lot or a location, in the header of a document or
  anywhere else, so it cannot tell whether a GTIN is a product, whether a GLN is the place a partner means, or whether
  a lot exists.
- **The rest of the history.** The checks across events see the events of the file only. An EPC commissioned in an
  earlier batch, a delete written by another partner, or a pallet opened before the file starts are not seen, and a
  file of one part of a journey may look as if an object came from nowhere; `shipped-before-received` and
  `aggregation-child-in-two-parents` report only what the file contradicts.
- **The ledger.** It contacts no ledger, node or API. It cannot tell whether an eventID is already on the ledger,
  whether a partner may write an event, whether the chaincode or contract of the ledger accepts it, or how the ledger
  orders events.
- **The children of a whole.** A pallet shipped whole is followed as the SSCC of the pallet; the EPCs packed on it are
  not taken to move with it.
- **Sensor data, instance and lot master data, certification.** `sensorElementList`, `ilmd` and `certificationInfo` are
  not read, and neither are the `reason` and `correctiveEventIDs` of an error declaration beyond their form.
- **Every identifier.** EPC URIs of SGTIN, SSCC, SGLN, LGTIN and the SGTIN pattern, and GS1 Digital Link URIs of a GTIN,
  an SSCC and a GLN, are read. Other GS1 keys (GRAI, GIAI, GSRN, GDTI and the others), the tag URIs of RFID, the
  barcode forms and private identifiers are taken as URIs and not read further.
- **Units of measure.** A `uom` is checked for its form of two or three capitals and digits, not against the table of
  UN/CEFACT Recommendation 20.
- **XML.** EPCIS written as XML is not read; a JSON-LD file is read as JSON, and its `@context` is not followed.
- **Time.** Every time is the file's own; the one moment the tool is given is the one of `--now`. A clock that is a few
  seconds wrong gives `event-out-of-order` or `future-event` for those seconds. An offset written in the eventTime that
  differs from the eventTimeZoneOffset is not reported, as EPCIS allows it.
- **What a misspelt key meant.** A key the tool does not read is reported and left out. A misspelt `bizLocation` makes
  the event look as if it had none; read the `field-unknown` findings first. A key with a colon is an extension and is
  never reported, so a misspelt extension is not seen.
- **Every secret.** The search for keys and seeds knows them by the name of their key and by their shape: a mnemonic of
  12 to 24 lowercase English words, an extended private key, 64 hex digits or a key in WIF. A value of 64 hex digits
  under `hexBinaryValue` is read as sensor data and cannot be told apart from a private key pasted there; it is never
  shown. A secret split over fields, encoded another way or written under another name is not caught, and API keys and
  passwords are not looked for by their shape. A clean run does not say that the file holds no secret.

## Size limits

| Limit | Value | What happens past it |
| --- | --- | --- |
| Size of the file | 16 MB | the file is refused before it is read, with exit code `2` |
| JSON nesting | 1,000 deep | `file-unreadable` at the place |
| JSON values | 2,000,000 | `file-unreadable` at the place |
| Length of a string | 1,000,000 characters | `file-unreadable` at the place |
| Events | 100,000 | the first are read, and a note says how many were left out |
| Items in a list of an event | 10,000 | the first are read, and a note says so |
| Digits of a quantity | 40 on each side of the point, an exponent up to 40 | `quantity-invalid` |

The JSON reader, the search for secrets and the walk for the hex data of sensors work with stacks of their own and
never recurse; the checks across events use maps, never a comparison of every pair. The tests run each limit with
hostile input and a time check.
