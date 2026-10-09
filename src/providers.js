import { terms } from './tools.js';

const call = (name, args, id) => ({ type: 'function_call', name, arguments: JSON.stringify(args), call_id: id });
const message = text => ({ type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] });

// A deterministic teaching fixture. It exercises the same loop without pretending to be an LLM.
export class DemoProvider {
  async respond(input) {
    const question = input.find(x => x.role === 'user').content;
    const results = input.filter(x => x.type === 'function_call_output');
    if (!results.length) return { output: [call('list_notes', {}, 'demo-list')] };
    if (results.length === 1) return { output: [call('search_notes', { query: question }, 'demo-search')] };
    const search = JSON.parse(results[1].output);
    if (search.error) return { output: [message(`演示检索失败：${search.error}`)] };
    const hits = search.hits.slice(0, 2);
    const readResults = results.slice(2);
    if (readResults.length < hits.length) {
      const hit = hits[readResults.length];
      return { output: [call('read_note', { file: hit.file }, `demo-read-${readResults.length}`)] };
    }
    const tokens = terms(question);
    const bullets = readResults.flatMap(result => {
      const note = JSON.parse(result.output);
      if (note.error) return [];
      return note.lines.filter(l => l.text && !l.text.startsWith('#'))
        .map(l => ({ ...l, file: note.file, score: tokens.filter(t => l.text.toLowerCase().includes(t)).length }))
        .filter(l => l.score > 0).sort((a, b) => b.score - a.score || a.line - b.line).slice(0, 3);
    });
    const text = bullets.length
      ? `## 检索摘录\n\n${bullets.map(l => `- ${l.text} [${l.file}:${l.line}]`).join('\n')}\n\n这些是按关键词选取的原文摘录；需要真正的解释和规划时，请启用真实模型模式。`
      : '资料不足：没有检索到相关内容。请把相关 Markdown 或 TXT 笔记放进 knowledge 目录，或换用更明确的关键词。';
    return { output: [message(text)] };
  }
}

export class OpenAIProvider {
  constructor({ apiKey, model, fetchImpl = fetch }) {
    if (!apiKey || !model) throw new Error('真实模式需要 OPENAI_API_KEY 和 OPENAI_MODEL；免 Key 体验请使用 --demo。');
    this.apiKey = apiKey; this.model = model; this.fetch = fetchImpl;
  }
  async respond(input, tools, instructions) {
    const response = await this.fetch('https://api.openai.com/v1/responses', {
      method: 'POST', signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, instructions, input, tools,
        store: false, include: ['reasoning.encrypted_content'], max_output_tokens: 2000 }),
    });
    // Do not echo upstream bodies: they may contain prompts or other private details.
    if (!response.ok) throw new Error(`OpenAI HTTP ${response.status}; 检查 Key、模型权限、额度和网络。`);
    const body = await response.json();
    if (body.status && body.status !== 'completed') throw new Error(`模型响应未完成：${body.status}`);
    if (!Array.isArray(body.output)) throw new Error('OpenAI returned invalid output');
    return body;
  }
}
