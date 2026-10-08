# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

EPCIS events are full of time: when an event took place, when it was recorded, the offset in effect where it took
place, when an error was declared. The tool has to read these times, compare them and put them in order. It does not
need the clock of the machine to do so: every time of an event carries its own zone, and the mistakes in them are
mistakes in the file (a time with no zone, a day that does not exist, a recordTime before its eventTime, an EPC seen
after its delete). The one check that needs a moment from outside, an event later than the moment it is checked, can be
given that moment.

Reading the clock would make the same file give a different report on a different day. Reading the time zone or the
locale of the machine through the date functions of the platform would make the same time name another moment on
another machine.

## Decision

1. The tool reads no clock, no time zone of the machine and no locale. It never prints the current time. The same file
   and the same options give the same output on every machine and on every day.
2. Times are read from their characters (`src/time.js`) into the nanosecond they name, with a calendar worked out by
   hand: the proleptic Gregorian calendar of XML Schema, from the start of the Unix epoch, with BigInt. The date
   functions of the platform are not used, and a test fails if src names them.
3. The one moment from outside is the one of `--now`, written by the person or the pipeline that runs the tool, with its
   zone. Without it, `future-event` does not run, and the report says so in its head and in a note.
4. A time is shown as the file writes it, never in another zone or format; a span between two times is shown in
   seconds with the largest whole unit it makes.
5. No document, test or source file of this repository holds a date or a number that reads like a year in its prose:
   not the licence, not the changelog, not the documents, not the comments of the code. `npm run check` and a test fail
   on any word of four digits that starts with 19 or 20. The examples, the tests and the documents that show an event
   need times, and every one of them is a made-up time in the year 2101, which the check passes over and no one reads
   as a day something happened; a test checks that every full date of the repository outside the saved copies is in
   that year. The saved copies of the standards under research/sources are the standards' own words; even so, the
   lines that carry a date or a year (the month and year of a release, the copyright lines of each page, the years a
   GS1 Prefix was used) were left out of the copies, so the test that reads every file for a year passes over them too.
   research/sources.md lists every line that was left out.
6. A version, a count, a number of seconds or the number of a standard is not a year and is not caught: 1.0.0, Node 22,
   EPCIS 2.0, 846,000 seconds, SARIF 2.1.0 and NIST SP 800-218 hold no year. A test of test/repo.test.js runs the
   pattern over such values and checks that none of them is caught, and that a year in the same place still is.
7. The standards are named with addresses that hold no year, and the notes on them name no publication date.

## Consequences

- The output of a run can be saved in the repository (`examples/output`) and compared on every change.
- A batch of events can be checked again later with the `--now` of the first check and gives the same report.
- A pipeline that wants `future-event` passes its own time; the tool never decides what "now" is.
