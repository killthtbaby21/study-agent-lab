import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NoteTools } from '../src/tools.js';
import { DemoProvider, OpenAIProvider } from '../src/providers.js';
import { runAgent } from '../src/agent.js';

const knowledge = fileURLToPath(new URL('../knowledge', import.meta.url));
const msg = text => ({ type: 'message', content: [{ type: 'output_text', text }] });
const call = (name, args, id = 'c1') => ({ type: 'function_call', name, arguments: JSON.stringify(args), call_id: id });
const scripted = (...outputs) => ({ async respond() { return { output: outputs.shift() }; } });

test('Chinese and English searches find relevant notes', async () => {
  const tools = new NoteTools(knowledge);
  for (const query of ['普通聊天', 'function calling']) {
    const { hits } = await tools.execute('search_notes', { query });
    assert.equal(hits[0].file, 'agent-basics.md');
  }
});

test('offline demo completes the tool loop with verified citations', async () => {
  const result = await runAgent({ question: 'Agent 和普通聊天有什么区别？', provider: new DemoProvider(), tools: new NoteTools(knowledge) });
  assert.ok(result.answer.includes('普通聊天'));
  assert.ok(result.citations.length > 0);
  assert.ok(result.citations.every(c => c.valid));
  assert.deepEqual(result.trace.filter(e => e.type === 'tool').slice(0, 2).map(e => e.name), ['list_notes', 'search_notes']);
});

test('unrelated query explicitly reports insufficient evidence', async () => {
  const result = await runAgent({ question: '火星地铁票价', provider: new DemoProvider(), tools: new NoteTools(knowledge) });
  assert.match(result.answer, /资料不足/);
  assert.deepEqual(result.sources, []);
});

test('path traversal, absolute paths, hidden files and unexpected arguments are rejected', async () => {
  const tools = new NoteTools(knowledge);
  for (const file of ['../README.md', '/tmp/private.md', 'C:\\secret.txt', '.env', 'x/../../private.md']) {
    await assert.rejects(tools.execute('read_note', { file }));
  }
  await assert.rejects(tools.execute('list_notes', { extra: 'x' }), /arguments/);
  await assert.rejects(tools.execute('search_notes', { query: '' }));
  await assert.rejects(tools.execute('search_notes', { query: 'a'.repeat(501) }));
});

test('oversized files are blocked and long notes are bounded', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'study-agent-test-'));
  await writeFile(path.join(dir, 'large.md'), 'x'.repeat(65537));
  await writeFile(path.join(dir, 'long.md'), Array(200).fill('Agent').join('\n'));
  const tools = new NoteTools(dir);
  await assert.rejects(tools.execute('read_note', { file: 'large.md' }), /64 KiB/);
  const result = await tools.execute('read_note', { file: 'long.md' });
  assert.equal(result.lines.length, 160);
  assert.equal(result.truncated, true);
});

test('symlink to outside knowledge is blocked', async t => {
  const base = await mkdtemp(path.join(tmpdir(), 'study-agent-link-'));
  const dir = path.join(base, 'knowledge');
  await mkdir(dir);
  await writeFile(path.join(base, 'secret.md'), 'secret');
  try { await symlink(path.join(base, 'secret.md'), path.join(dir, 'linked.md')); }
  catch (error) {
    if (error.code === 'EPERM') { t.skip('Windows requires symlink privileges'); return; }
    throw error;
  }
  await assert.rejects(new NoteTools(dir).execute('read_note', { file: 'linked.md' }), /outside/);
});

test('malformed and unknown tool calls return errors for model recovery', async () => {
  let step = 0;
  const provider = { async respond(input) {
    if (step++ === 0) return { output: [call('shell', {}), { ...call('search_notes', {} ,'c2'), arguments: '{' }] };
    const results = input.filter(x => x.type === 'function_call_output');
    assert.equal(results.length, 2);
    assert.ok(results.every(x => JSON.parse(x.output).error));
    return { output: [msg('无法调用这个工具。')] };
  } };
  const result = await runAgent({ question: 'test', provider, tools: new NoteTools(knowledge) });
  assert.match(result.answer, /无法/);
});

test('decision and tool budgets stop runaway loops', async () => {
  const provider = { async respond() { return { output: [call('list_notes', {})] }; } };
  await assert.rejects(runAgent({ question: 'test', provider, tools: new NoteTools(knowledge), maxTurns: 2 }), /轮数上限/);
  await assert.rejects(runAgent({ question: 'test', provider, tools: new NoteTools(knowledge), maxCalls: 1 }), /调用上限/);
});

test('fabricated file or line citation fails validation', async () => {
  for (const answer of ['假来源 [missing.md:1]', '假行号 [agent-basics.md:999]']) {
    const provider = scripted([call('read_note', { file: 'agent-basics.md' })], [msg(answer)]);
    await assert.rejects(runAgent({ question: 'test', provider, tools: new NoteTools(knowledge) }), /引用/);
  }
});

test('raw Responses requests preserve reasoning and tool call IDs', async () => {
  const bodies = [];
  const reasoning = { type: 'reasoning', id: 'r1', summary: [], encrypted_content: 'fixture' };
  const provider = new OpenAIProvider({ apiKey: 'test-only', model: 'test-model', fetchImpl: async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body); bodies.push(body);
    return new Response(JSON.stringify({ status: 'completed', output: bodies.length === 1
      ? [reasoning, call('read_note', { file: 'agent-basics.md' }, 'api-call-1')]
      : [msg('工具调用由应用执行。[agent-basics.md:5]')] }), { status: 200 });
  } });
  await runAgent({ question: 'test', provider, tools: new NoteTools(knowledge) });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].store, false);
  assert.ok(bodies[1].input.some(x => x.encrypted_content === 'fixture'));
  assert.ok(bodies[1].input.some(x => x.type === 'function_call_output' && x.call_id === 'api-call-1'));
});

test('HTTP errors and incomplete responses are explicit and hide upstream body', async () => {
  const make = response => new OpenAIProvider({ apiKey: 'fixture', model: 'fixture', fetchImpl: async () => response });
  await assert.rejects(make(new Response('private upstream content', { status: 429 })).respond([], [], ''), /HTTP 429/);
  await assert.rejects(make(new Response(JSON.stringify({ status: 'incomplete', output: [] }))).respond([], [], ''), /未完成/);
  assert.throws(() => new OpenAIProvider({ apiKey: '', model: '' }), /OPENAI_API_KEY/);
});

test('empty and excessively long questions fail before model use', async () => {
  for (const question of ['', 'a'.repeat(2001)]) {
    await assert.rejects(runAgent({ question, provider: new DemoProvider(), tools: new NoteTools(knowledge) }), /长度/);
  }
});
