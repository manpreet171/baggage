# Change log

What changed here and why. Appended every session. Newest first.

---

## 2026-08-06 — v1.0.0: pricing context by when it arrived

- **The thesis, and it came from data before it came from an idea.** 93 real
  transcripts on the author's machine: output tokens are **0.2%** of all token
  traffic, re-sent context is **96.9%**. The famous token-saving tools in this
  ecosystem all optimise the 0.2%. This measures the rest.
- **"Rent" is the one new idea here** — a tool result costs its size times the
  turns it survived, not its size. A build log dumped at turn 12 of a 200-turn
  session costs 188x what it appears to. Everything else follows from that.
- **The floor is the actionable half.** Turn one is billed for the system prompt,
  every tool schema, every skill and `CLAUDE.md` before you have said anything
  real. On one project that floor was 72k, paid across 7,224 turns — 20% of the
  entire bill for capability that may never have been called. It is also the only
  line on the report a user can shrink in thirty seconds.
- **Two bugs found by the tool being pointed at real data, not at fixtures:**
  - Project-path encoding collapsed runs of separators, so `D:\My work\x` became
    `D-My-work-x` instead of `D--My-work-x` and it found nothing while reporting
    a confident, clean-looking error. Now one dash per character.
  - Summing `usage` off every transcript line double-counted, because one API
    response is written as several lines that each repeat the same `usage`.
    Measured inflation: **1.72x**. Every number in the first draft was wrong.
- **The suite was sabotaged three ways to prove it could fail** — rent ignoring
  arrival turn, dedup removed, and the exact path-encoding bug above. All three
  were caught. A green suite that cannot fail is not evidence.
- **Refused to print a dollar figure.** Cached reads bill far below fresh input
  and most users are on a subscription, so a headline "$X wasted" would be the
  kind of number one informed reader kills in a comment. Rent predicts rate
  limits and latency; the README says exactly that.
- **Refused to invent the floor's breakdown.** We can measure the floor's total
  but not which MCP server contributed what. That gap is written into the README
  under "what it will not tell you" rather than papered over.
- **Naming.** `baggage` over `rent` and `hoard`: it is the only one of the three
  you can draw, and the banner had to show the object. npm has `baggage` taken,
  so the package name is `baggage-cli` and install goes through the repo.
- **Banner breaks the shelf's pattern deliberately** — four previous repos all
  sit on dark technical grounds, so this one is paper: an overstuffed bag with
  its claim tag tied to the handle, itemising what it costs to carry.
