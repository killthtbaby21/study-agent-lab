import { fileURLToPath } from 'node:url';
import { NoteTools } from '../src/tools.js';
import { DemoProvider } from '../src/providers.js';
import { runAgent } from '../src/agent.js';

const knowledge = fileURLToPath(new URL('../knowledge', import.meta.url));
const cases = [
  { question: 'Agent 和普通聊天有什么区别？', file: 'agent-basics.md' },
  { question: 'function calling', file: 'agent-basics.md' },
  { question: 'RAG 关键词检索', file: 'rag-notes.md' },
  { question: 'API Key 项目练习', file: 'project-practice.md' },
  { question: '火星地铁票价', insufficient: true },
];
let passed = 0;
for (const item of cases) {
  const result = await runAgent({ question: item.question, provider: new DemoProvider(), tools: new NoteTools(knowledge) });
  const pass = item.insufficient ? result.sources.length === 0 && result.answer.includes('资料不足')
    : result.sources.includes(item.file) && result.citations.length > 0 && result.citations.every(c => c.valid);
  if (pass) passed++;
  console.log(JSON.stringify({ question: item.question, pass, sources: result.sources, citationCount: result.citations.length }));
}
console.log(`Offline retrieval/loop fixtures: ${passed}/${cases.length}. This is not an LLM quality benchmark.`);
if (passed !== cases.length) process.exitCode = 1;
