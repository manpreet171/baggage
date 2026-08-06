// The rent metric is the entire product, so it gets checked against transcripts
// built by hand where the right answer is known by arithmetic.
// Run: node test/baggage.test.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const CLI = fileURLToPath(new URL('../bin/baggage.mjs', import.meta.url));
const home = realpathSync(mkdtempSync(join(tmpdir(), 'bag-home-')));
const work = realpathSync(mkdtempSync(join(tmpdir(), 'bag-work-')));

// Claude Code names a project folder after the working directory with every
// non-alphanumeric character replaced by a dash — one dash each, not collapsed.
const projectKey = work.replace(/[^A-Za-z0-9]/g, '-');
const projects = join(home, '.claude', 'projects', projectKey);
mkdirSync(projects, { recursive: true });

let n = 0;
const assistant = (text, usage, blocks = []) => JSON.stringify({
  type: 'assistant',
  message: { id: 'msg_' + ++n, usage, content: [...(text ? [{ type: 'text', text }] : []), ...blocks] },
});
const toolResult = (id, text) => JSON.stringify({
  type: 'user',
  message: { content: [{ type: 'tool_result', tool_use_id: id, content: [{ type: 'text', text }] }] },
});
const U = (o = {}) => ({
  input_tokens: 0, output_tokens: 100,
  cache_read_input_tokens: 0, cache_creation_input_tokens: 0, ...o,
});

function run(args = []) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: work, encoding: 'utf8',
    env: { ...process.env, USERPROFILE: home, HOME: home },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

try {
  // A four-turn session. One fat tool result arrives on turn 1, an identical
  // one on turn 4. Same size, wildly different rent — that is the whole thesis.
  const big = 'x'.repeat(4000);   // ~1000 tokens
  const lines = [
    assistant('starting', U({ cache_read_input_tokens: 50_000 }), [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'cd "/tmp" && npm run build' } }]),
    toolResult('t1', big),
    assistant('next', U({ cache_read_input_tokens: 60_000 }), [{ type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/a/b/small.js' } }]),
    toolResult('t2', 'tiny'),
    assistant('more', U({ cache_read_input_tokens: 70_000 })),
    assistant('done', U({ cache_read_input_tokens: 80_000 }), [{ type: 'tool_use', id: 't3', name: 'Bash', input: { command: 'echo late' } }]),
    toolResult('t3', big),
  ];
  writeFileSync(join(projects, 'a.jsonl'), lines.join('\n') + '\n');

  const json = JSON.parse(run(['--json']));

  assert.equal(json.turns, 4, 'four distinct message ids means four turns');
  assert.equal(json.usage.cacheRead, 260_000, 'cache read is summed from the API, not estimated');

  const early = json.top.find((r) => r.label === 'npm run build');
  const late = json.top.find((r) => r.label === 'echo late');
  assert.ok(early, 'the leading `cd ... &&` must be stripped from the label');
  assert.ok(late, 'the late command must be listed too');
  assert.equal(early.tokens, late.tokens, 'both results are the same size');
  // Arrived turn 1 of 4 -> survives 3 turns. Arrived turn 4 -> survives 0.
  assert.equal(early.rent, early.tokens * 3, 'rent is size x turns survived');
  assert.equal(late.rent, 0, 'something that arrives on the last turn costs nothing to carry');
  assert.ok(early.rent > late.rent, 'THE THESIS: identical payloads, different cost, decided by when they landed');

  // The same message id written across several lines (one per content block) is
  // one API response. Counting it twice inflated every number by ~1.7x before
  // this was fixed, so it gets a regression test.
  const dupe = [
    assistant('a', U({ cache_read_input_tokens: 10_000 })),
    JSON.stringify({ type: 'assistant', message: { id: 'msg_' + n, usage: U({ cache_read_input_tokens: 10_000 }), content: [{ type: 'text', text: 'same response, second block' }] } }),
    assistant('b', U({ cache_read_input_tokens: 20_000 })),
  ];
  writeFileSync(join(projects, 'b.jsonl'), dupe.join('\n') + '\n');
  const two = JSON.parse(run(['--json']));
  assert.equal(two.turns, 6, 'a repeated message id is one turn, not two');
  assert.equal(two.usage.cacheRead, 290_000, 'and it is billed once, not twice');

  // A directory with no transcripts must say so plainly rather than reporting
  // a confident zero — a wrong path-encoding would otherwise read as "clean".
  const empty = realpathSync(mkdtempSync(join(tmpdir(), 'bag-none-')));
  let failed = false;
  try {
    execFileSync(process.execPath, [CLI], {
      cwd: empty, encoding: 'utf8',
      env: { ...process.env, USERPROFILE: home, HOME: home },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (err) {
    failed = true;
    assert.match(String(err.stderr), /no transcripts for this directory/, 'must name the problem');
  }
  assert.ok(failed, 'an unknown directory must exit non-zero, not print an empty bill');
  rmSync(empty, { recursive: true, force: true });

  // Garbage in the middle of a transcript must not take the run down; these
  // files are appended to live and the last line is often half-written.
  writeFileSync(join(projects, 'c.jsonl'), '{"type":"assistant"\nnot json at all\n' + assistant('ok', U()) + '\n');
  const survived = JSON.parse(run(['--json']));
  assert.ok(survived.turns >= 6, 'a corrupt line is skipped, not fatal');

  console.log('ok — rent tracks when a thing landed, responses bill once, and a broken transcript does not stop the report');
} finally {
  rmSync(home, { recursive: true, force: true });
  rmSync(work, { recursive: true, force: true });
}
