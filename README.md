<div align="center">

<img src="assets/mark.png" alt="A character sitting on a suitcase packed far past its limit, still not closing" width="300">

# baggage

**What your session is still carrying.**

Part of [Singh Labs](https://singhlabs.dev/baggage/) — guardrails for AI coding agents.

Created by [Manpreet Singh](https://github.com/manpreet171)

![node 18+](https://img.shields.io/badge/node-18%2B-3c873a) ![zero dependencies](https://img.shields.io/badge/dependencies-0-c2410c) ![license MIT](https://img.shields.io/badge/license-MIT-blue)

</div>

---

```
caveman cuts 65% of your output tokens.
output is 0.2% of your bill.
this shows you the other 99.8%.
```

## Why

Everything in a context is re-sent on every turn that follows.

So a tool result does not cost what it weighs. It costs **what it weighs times the
turns it stayed.** A build log you dumped at turn 12 of a 200-turn session is not
4,000 tokens. It is 4,000 × 188.

Nobody prices it that way, so nobody knows why the limit arrives at 2pm. `baggage`
reads your own transcripts and puts a number on it.

## Quickstart

```bash
npm install -g github:manpreet171/baggage
```

`baggage` on npm belongs to someone else, so install from the repo.

```bash
baggage
```

Real output, from this author's own machine:

```
baggage — 37 sessions in New folder, 7,224 turns

  before you typed anything              72k  tokens
    system prompt, every tool schema, every skill, CLAUDE.md.
    paid again on all 7,224 turns = 521.7M tokens, 20% of the bill,
    whether you called any of it or not.

  conversation you can see              4.1M  tokens
  what the API billed                   2.6B  tokens

  output tokens            8.6M   0.3%
  re-sent context          2.6B   97.3%   <- the bill

  HEAVIEST THINGS YOU ARE STILL CARRYING
  (rent = its size x the turns it stayed in context)

   127.1M   19.0%  3624x  assistant reply
   119.1M   17.8%  1006x  your message
    32.7M    4.9%    10x  Read New folder\project-seal-master-doc.md
    15.3M    2.3%   244x  python "C:/Users/.../probe.py"
     9.8M    1.5%     2x  Read seal-task-v2\SKILL.md
```

That third row is one document read ten times. Ten copies, each paying rent on every
turn after it landed: **32.7 million tokens for a file you could have read once.**

## The number nobody shows you

`before you typed anything` is the floor — system prompt, every tool schema, every
skill description, every `CLAUDE.md`. You pay it again on every turn.

At 72k across 7,224 turns that is **521.7M tokens, 20% of the bill, for capability you
may never have called.** It is also the easiest thing here to shrink: turn off what
this project doesn't use and the floor drops for every future turn.

## Commands

| Command | Does |
| ------- | ---- |
| `baggage` | The bill for the project in this directory |
| `baggage --all` | Every project on this machine |
| `baggage --top 20` | More rows (default 10) |
| `baggage --json` | Machine-readable |
| `baggage version` | Print the version |

## What it will not tell you

**It cannot see inside the floor.** The transcript records what the API billed, not
which tool schema cost what. `baggage` says the floor is 72k; it cannot say that 9k of
it is one MCP server. Inventing that breakdown would be worse than admitting the gap.

**Conversation tokens are estimated** at ~4 characters each, so the *ranking* is sound
and those absolute figures are approximate. Everything labelled billed — output,
re-sent context, the floor — comes from the API's own usage reporting and is exact.

**Rent is not a dollar figure.** Re-sent context is cached and priced well below fresh
input, and on a subscription you aren't paying per token at all. What rent actually
predicts is **when you hit your limit and how slow the turn feels.**

## FAQ

**Does this send my code anywhere?**
No. It reads `~/.claude/projects` locally and prints. No network, no LLM, no telemetry,
nothing written outside stdout.

**Isn't this just another cost dashboard?**
Dashboards report what you spent. This prices *when* a thing arrived — the variable you
can actually change — then names the file and the command to put down.

**Why is `assistant reply` always near the top?**
Because that's the honest answer: on a long session the conversation itself is the
heaviest thing in the room. Which is the argument for starting fresh at a natural
boundary, and the report says so.

## Uninstall

```bash
npm uninstall -g baggage-cli
```

It writes nothing outside the terminal — no config, no cache, no state directory.

## Author

**Manpreet Singh** — [GitHub](https://github.com/manpreet171) ·
[LinkedIn](https://www.linkedin.com/in/manpreet17/) ·
[Medium](https://medium.com/@singh.manpreet171900)

More for people shipping with AI agents: **[singhlabs.dev](https://singhlabs.dev/)**

## License

MIT
