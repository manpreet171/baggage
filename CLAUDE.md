# Working rules for baggage

Zero-dependency Node 18+ CLI, one file: `bin/baggage.mjs`. No build step.

## Always log what you did

**Every session that changes anything appends to `LOG.md` before it finishes.
Nobody should have to ask.** Newest date first, one line per change, what changed
and *why*. Log decisions and rejected ideas too — "skipped X because Y" is worth
more in six months than any diff. Get the date from the system, never guess it.

## The numbers are the product

- **Never print an estimated number next to a billed one without saying which is
  which.** Conversation sizes are estimated at ~4 chars/token; `output`,
  `re-sent context` and the floor come from the API's `usage` and are exact.
- **One API response is written to the transcript as several lines**, one per
  content block, each carrying the same `usage` object. Bill each `message.id`
  once. Not doing this inflates every number by about 1.7x.
- **Never invent a breakdown we cannot measure.** We can see the floor's total.
  We cannot see which MCP server contributed what. Say so instead of guessing.
- Rent is not dollars. Cached reads are billed well below fresh input, and most
  users are on a subscription. Rent predicts *rate limits and latency*.

## Path encoding

Claude Code names a project folder after its working directory with **every**
non-alphanumeric character replaced by a dash, one each, never collapsed —
`D:\My work` becomes `D--My-work`. Collapsing runs silently finds no transcripts
and reports a confident nothing, which is why the test asserts on that failure.

## Commits

One short human line. **Never a `Co-Authored-By: Claude` trailer and no AI
attribution of any kind** — GitHub renders it as a second Contributor on the
repo front page, beside the author. Commit as `manpreet171
<singh.manpreet171900@gmail.com>`. Saying "Claude Code" in a body as a technical
term is fine; the attribution trailer is not.
