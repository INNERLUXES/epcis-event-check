# 3. Check the events on disk, and contact no ledger

## Status

Accepted

## Context

Many facts about an event live elsewhere: the master data of a GTIN or a GLN, the company a prefix was issued to, the
events of an object already on the ledger, whether a partner may write to it. A check could call the ledger on every
run, ask a registry of company prefixes, resolve every GS1 Digital Link URI and fetch the `@context` of JSON-LD. That
would need the network, a node and often a key, would make the result depend on the state of a ledger and of other
people's services at the moment of the run, would send the identifiers of products and places of a partner to a third
party, and would let a file in a pull request make the pipeline reach any address it names.

What a team needs first, before the events are written, is a list of what is wrong in the events it is about to write
and where: a time with no zone, an action in small letters, a GTIN with a wrong check digit, an EPC seen after its
delete. The events are a file, and can be checked the same way on every run.

## Decision

1. The tool reads the file it is given, and nothing else. It contacts no ledger, node or API, fetches nothing, resolves
   no Digital Link and no `@context`, opens no link, needs no key, runs no program and sends no data anywhere. It cannot
   write, sign or endorse an event.
2. The checks work from the file alone. The checks across events see the events of the file, and docs/limits.md says
   that the rest of the history of an object is not seen.
3. The vocabularies of the CBV, the forms of EPC URIs and Digital Link URIs and the rule of the check digit are in the
   code, kept short and named in docs/method.md. They change in a release, never while the tool runs, and each rests
   on a saved copy of the standard it comes from.
4. The rules the checks apply are listed in docs/method.md, and the standards each documented check rests on are named
   in src/data.js and research/sources.md, each fetched and read before it was listed, with a copy of the parts the
   checks rest on under research/sources. A check that no standard says is a best practice of this tool and says so.
5. The tool lists what to look at and what to change; it changes nothing and sends nothing.

## Consequences

- The result depends only on the file and the options, and a run needs no network access, no secret and no node.
- A batch that is fine on its own may still clash with events already on the ledger; the ledger, or a later check with
  the whole history, has to catch that.
- A company prefix, a GTIN and a GLN are read for their form and their check digit, never looked up.
