import { fileURLToPath } from 'node:url';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NoteTools } from './tools.js';
import { DemoProvider, OpenAIProvider } from './providers.js';
import { runAgent } from './agent.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2);
const demo = args.includes('--demo');
const save = args.includes('--save');
const knownFlags = new Set(['--demo', '--save', '--help']);
if (args.includes('--help')) {
  console.log('npm run demo -- "Agent 和普通聊天有什么区别？" --save\nnpm start -- "解释 RAG"\n--demo  离线关键词演示\n--save  导出 reports/ 下的 Markdown 和 JSON\n真实模式从 .env 读取 OPENAI_API_KEY 和 OPENAI_MODEL。');
  process.exit(0);
}
try {
  if (args.some(x => x.startsWith('--') && !knownFlags.has(x))) throw new Error('未知参数，使用 --help 查看说明');
  const question = args.filter(x => !knownFlags.has(x)).join(' ') || 'Agent 和普通聊天有什么区别？';
  const provider = demo ? new DemoProvider() : new OpenAIProvider({ apiKey: process.env.OPENAI_API_KEY, model: process.env.OPENAI_MODEL });
  console.log(`\nStudy Agent Lab | ${demo ? '离线演示（规则驱动，不调用大模型）' : `真实模型：${process.env.OPENAI_MODEL}`}\n问题：${question}\n`);
  const result = await runAgent({ question, provider, tools: new NoteTools(path.join(root, 'knowledge')),
    onEvent(event) {
      if (event.type === 'model') console.log(`[第 ${event.turn} 轮] 选择下一步`);
      if (event.type === 'tool') console.log(`  → ${event.name} ${event.args}${event.result.error ? ` [失败：${event.result.error}]` : ''}`);
    },
  });
  console.log(`\n${result.answer}\n`);
  for (const warning of result.warnings) console.log(`提示：${warning}`);
  if (save) {
    const dir = path.join(root, 'reports');
    await mkdir(dir, { recursive: true });
    const stem = `study-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    const report = `# 学习资料报告\n\n模式：${demo ? '离线规则演示' : '真实模型'}\n\n问题：${question}\n\n${result.answer}\n\n## 实际读取的资料\n\n${result.sources.map(s => `- ${s}`).join('\n') || '无'}\n`;
    await writeFile(path.join(dir, `${stem}.md`), report, 'utf8');
    await writeFile(path.join(dir, `${stem}.json`), JSON.stringify(result, null, 2), 'utf8');
    console.log(`已保存：reports/${stem}.md 和 .json`);
  }
} catch (error) {
  console.error(`失败：${error.message}`);
  process.exitCode = 1;
}
