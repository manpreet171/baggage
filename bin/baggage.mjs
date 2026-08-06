#!/usr/bin/env node
// baggage — what your session is still carrying.
//
// Everything that enters a Claude Code context gets re-sent on every turn that
// follows. So the cost of a tool result is not its size. It is its size times
// the number of turns it survived. This reads your own transcripts and prices
// each one that way.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, basename, sep } from 'node:path';
import { homedir } from 'node:os';

const ROOT = join(homedir(), '.claude', 'projects');
const argv = process.argv.slice(2);

function flag(name, fallback = null) {
  const i = argv.indexOf(name);
  if (i === -1) return fallback;
  const v = argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const has = (name) => argv.includes(name);

// ~4 characters per token. Deliberately approximate: this tool ranks things
// against each other, and every candidate is measured with the same ruler.
// The real usage numbers below come from the API and are exact.
const est = (s) => Math.ceil(String(s).length / 4);

function die(msg, code = 2) {
  console.error(`baggage: ${msg}`);
  process.exit(code);
}

// Claude Code encodes a project directory as its path with separators replaced.
// D:\My work\baggage -> D--My-work-baggage
function encodeProject(dir) {
  // One dash per character, never collapsed — `D:\My work` becomes
  // `D--My-work`, because the colon and the slash each get their own.
  return dir.replace(/[^A-Za-z0-9]/g, '-');
}

function projectDirs() {
  if (!existsSync(ROOT)) die(`no transcripts found at ${ROOT}`);
  return readdirSync(ROOT).filter((d) => {
    try { return statSync(join(ROOT, d)).isDirectory(); } catch { return false; }
  });
}

function pickProjects() {
  const all = projectDirs();
  if (has('--all')) return all;
  const want = encodeProject(process.cwd());
  // Longest matching prefix wins, so a subdirectory still finds its project.
  const hit = all.filter((d) => want.toLowerCase().startsWith(d.toLowerCase()))
    .sort((a, b) => b.length - a.length)[0];
  if (!hit) {
    die(`no transcripts for this directory.\n  looked for: ${want}\n  try --all to see every project`);
  }
  return [hit];
}

// One pass over a transcript. Returns every item that entered the context,
// stamped with the turn it arrived on, plus the exact usage the API reported.
function readSession(file) {
  const items = [];
  const usage = { out: 0, cacheRead: 0, cacheWrite: 0, in: 0 };
  const seen = new Set();
  const toolName = new Map();
  let turn = 0;
  let baseline = 0;

  let lines;
  try { lines = readFileSync(file, 'utf8').split('\n'); } catch { return null; }

  for (const line of lines) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }

    if (e.type === 'assistant') {
      // One API response is written as several entries, one per content block,
      // each carrying the same usage object. Counting them all inflates every
      // number by ~1.7x, so bill each response exactly once.
      const id = e.message?.id || e.requestId;
      const fresh = id && !seen.has(id);
      if (fresh) {
        seen.add(id);
        turn++;
        const u = e.message?.usage;
        if (u) {
          // Turn one is billed before you have said anything of substance: the
          // system prompt, every tool schema, every skill description, CLAUDE.md.
          // That is the floor you pay on every single turn after it, and it is
          // the one number you can actually shrink by turning things off.
          if (turn === 1) {
            baseline = (u.cache_read_input_tokens || 0)
              + (u.cache_creation_input_tokens || 0)
              + (u.input_tokens || 0);
          }
          usage.out += u.output_tokens || 0;
          usage.in += u.input_tokens || 0;
          usage.cacheRead += u.cache_read_input_tokens || 0;
          usage.cacheWrite += u.cache_creation_input_tokens || 0;
        }
      }
      for (const b of e.message?.content || []) {
        if (b.type === 'tool_use') {
          toolName.set(b.id, { name: b.name, input: b.input });
        } else if (b.type === 'text' && b.text) {
          items.push({ turn, tokens: est(b.text), kind: 'reply', label: 'assistant reply' });
        }
      }
    } else if (e.type === 'user') {
      const content = e.message?.content;
      if (typeof content === 'string') {
        items.push({ turn, tokens: est(content), kind: 'you', label: 'your message' });
        continue;
      }
      if (!Array.isArray(content)) continue;
      for (const b of content) {
        if (b.type === 'text' && b.text) {
          items.push({ turn, tokens: est(b.text), kind: 'you', label: 'your message' });
        }
        if (b.type !== 'tool_result') continue;
        const text = Array.isArray(b.content)
          ? b.content.map((x) => x.text || '').join('')
          : String(b.content || '');
        const meta = toolName.get(b.tool_use_id) || {};
        items.push({
          turn,
          tokens: est(text),
          kind: 'tool',
          tool: meta.name || 'unknown',
          label: describe(meta),
        });
      }
    }
  }
  return { items, usage, turns: turn, baseline, file };
}

// A label a human recognises, so the report names the actual culprit rather
// than "a Bash call".
function describe(meta) {
  const { name, input } = meta;
  if (!name) return 'unknown';
  if (name === 'Bash' || name === 'PowerShell') {
    // Strip the throat-clearing — a leading `cd "..." &&` and any VAR=... prefix
    // — so the row names the command that actually produced the output.
    let c = String(input?.command || '').replace(/\s+/g, ' ').trim();
    c = c.replace(/^cd\s+("[^"]*"|'[^']*'|\S+)\s*&&\s*/, '');
    c = c.replace(/^(\w+=("[^"]*"|'[^']*'|\S+)\s+)+/, '');
    return c.slice(0, 68) || name;
  }
  if (name === 'Read' || name === 'Write' || name === 'Edit') {
    const p = String(input?.file_path || '');
    return `${name} ${p.split(/[\\/]/).slice(-2).join(sep)}`;
  }
  if (name === 'Grep') return `Grep ${String(input?.pattern || '').slice(0, 40)}`;
  if (name === 'WebFetch') return `WebFetch ${String(input?.url || '').slice(0, 50)}`;
  if (name.startsWith('mcp__')) return name.split('__').slice(1).join(' · ');
  return name;
}

// The whole idea, in one line: a token that arrives on turn t of an N-turn
// session is re-sent on every turn after it.
function rentOf(item, turns) {
  return item.tokens * Math.max(0, turns - item.turn);
}

const num = (n) => n.toLocaleString('en-US');
function short(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'k';
  return String(n);
}

function main() {
  if (has('--help') || has('-h')) return usage(0);
  if (argv[0] === 'version' || has('--version')) {
    console.log('baggage 1.0.0');
    return;
  }

  const dirs = pickProjects();
  const sessions = [];
  for (const d of dirs) {
    const dir = join(ROOT, d);
    let files;
    try { files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const s = readSession(join(dir, f));
      if (s && s.turns > 0) sessions.push({ ...s, project: d });
    }
  }
  if (!sessions.length) die('no sessions with any turns yet.');

  const top = Number(flag('--top', 10)) || 10;
  const usage = { out: 0, cacheRead: 0, cacheWrite: 0, in: 0 };
  const byLabel = new Map();   // label -> {rent, tokens, n, tool}
  const byTool = new Map();
  let totalRent = 0, totalTokens = 0, turns = 0;

  for (const s of sessions) {
    turns += s.turns;
    for (const k of Object.keys(usage)) usage[k] += s.usage[k];
    for (const it of s.items) {
      const rent = rentOf(it, s.turns);
      totalRent += rent;
      totalTokens += it.tokens;
      const key = it.kind === 'tool' ? it.label : it.label;
      const row = byLabel.get(key) || { rent: 0, tokens: 0, n: 0, tool: it.tool || it.kind };
      row.rent += rent; row.tokens += it.tokens; row.n++;
      byLabel.set(key, row);
      const t = byTool.get(it.tool || it.kind) || { rent: 0, tokens: 0, n: 0 };
      t.rent += rent; t.tokens += it.tokens; t.n++;
      byTool.set(it.tool || it.kind, t);
    }
  }

  const billed = usage.in + usage.out + usage.cacheRead + usage.cacheWrite;

  if (has('--json')) {
    console.log(JSON.stringify({
      sessions: sessions.length, turns, billedTokens: billed, usage,
      uniqueTokens: totalTokens, estimatedRent: totalRent,
      multiplier: totalTokens ? +(billed / totalTokens).toFixed(1) : 0,
      top: [...byLabel.entries()].sort((a, b) => b[1].rent - a[1].rent).slice(0, top)
        .map(([label, v]) => ({ label, ...v })),
    }, null, 2));
    return;
  }

  const scope = has('--all') ? `${sessions.length} sessions, all projects` : `${sessions.length} sessions in ${basename(process.cwd())}`;
  console.log(`\nbaggage — ${scope}, ${num(turns)} turns\n`);

  const baselines = sessions.map((s) => s.baseline).filter(Boolean).sort((a, b) => a - b);
  const medBase = baselines.length ? baselines[Math.floor(baselines.length / 2)] : 0;
  if (medBase) {
    const fixed = medBase * turns;
    console.log(`  before you typed anything         ${short(medBase).padStart(8)}  tokens`);
    console.log('    system prompt, every tool schema, every skill, CLAUDE.md.');
    console.log(`    paid again on all ${num(turns)} turns = ${short(fixed)} tokens, ${(fixed / billed * 100).toFixed(0)}% of the bill,`);
    console.log('    whether you called any of it or not.\n');
  }

  console.log('  conversation you can see          ' + short(totalTokens).padStart(8) + '  tokens');
  console.log('  what the API billed               ' + short(billed).padStart(8) + '  tokens');
  if (totalTokens) {
    console.log(`\n  a ${Math.round(billed / totalTokens)}x gap. Some of it is the fixed cost above; the rest`);
    console.log('  is everything you picked up being re-sent on every later turn.\n');
  }

  const pct = billed ? (usage.cacheRead / billed * 100) : 0;
  console.log(`  output tokens        ${short(usage.out).padStart(8)}   ${(usage.out / billed * 100).toFixed(1)}%`);
  console.log(`  re-sent context      ${short(usage.cacheRead).padStart(8)}   ${pct.toFixed(1)}%   <- the bill`);

  console.log('\n  HEAVIEST THINGS YOU ARE STILL CARRYING');
  console.log('  (rent = its size x the turns it stayed in context)\n');
  const rows = [...byLabel.entries()].sort((a, b) => b[1].rent - a[1].rent).slice(0, top);
  const w = Math.max(...rows.map(([l]) => Math.min(l.length, 60)));
  for (const [label, v] of rows) {
    const share = totalRent ? (v.rent / totalRent * 100).toFixed(1) : '0.0';
    console.log(`  ${short(v.rent).padStart(7)}  ${String(share + '%').padStart(6)}  ${String(v.n + 'x').padStart(5)}  ${label.slice(0, 60).padEnd(w)}`);
  }

  console.log('\n  BY TOOL\n');
  for (const [t, v] of [...byTool.entries()].sort((a, b) => b[1].rent - a[1].rent).slice(0, 8)) {
    console.log(`  ${short(v.rent).padStart(7)}  ${String(v.n).padStart(6)} calls  avg ${short(Math.round(v.tokens / v.n)).padStart(6)}  ${t}`);
  }

  advise(rows, byTool, sessions);
}

// The part that is worth something: what to actually change.
function advise(rows, byTool, sessions) {
  const tips = [];

  // A command run many times, each time paying rent for the rest of the session.
  const repeats = rows.filter(([, v]) => v.n >= 5 && v.tool === 'Bash');
  if (repeats.length) {
    const [label, v] = repeats[0];
    tips.push(`That command ran ${v.n}x and each run's output stays for the rest of the session.\n     Pipe it: append \`| tail -30\` — you keep the failure and drop the rest.\n     ${label}`);
  }

  // The same file read again and again.
  const reads = rows.filter(([l, v]) => v.tool === 'Read' && v.n >= 3);
  if (reads.length) {
    const [label, v] = reads[0];
    tips.push(`Read ${v.n}x — every copy is still in context.\n     Read once with an offset/limit, or put the stable part in CLAUDE.md.\n     ${label}`);
  }

  const big = [...byTool.entries()].filter(([t, v]) => v.n > 0 && v.tokens / v.n > 3000);
  for (const [t, v] of big.slice(0, 2)) {
    tips.push(`${t} averages ${short(Math.round(v.tokens / v.n))} tokens per call. Ask for less, or write it to a file and read the part you need.`);
  }

  const long = sessions.filter((s) => s.turns > 120).length;
  if (long) {
    tips.push(`${long} session${long > 1 ? 's' : ''} ran past 120 turns. Rent is quadratic in session length — the cheapest single fix is starting a fresh session at a natural boundary.`);
  }

  if (!tips.length) return;
  console.log('\n  WHAT TO PUT DOWN\n');
  tips.forEach((t, i) => console.log(`  ${i + 1}. ${t}\n`));
}

function usage(code = 2) {
  console.log(`
baggage — what your session is still carrying

  baggage                 the bill for the project in this directory
  baggage --all           every project on this machine
  baggage --top 20        show more rows (default 10)
  baggage --json          machine-readable
  baggage version

Everything in a context is re-sent on every turn that follows, so a tool result
costs its size times the turns it survived. That number is "rent".
`);
  process.exit(code);
}

main();
