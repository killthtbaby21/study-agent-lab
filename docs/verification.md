# 验证记录

验证日期：2026-10-09。环境：Windows，Node.js v24.19.0。

| 检查 | 本地结果 |
| --- | --- |
| `npm test` | 12 项：11 项通过，1 项跳过，0 项失败 |
| 符号链接越界测试 | Windows 未授予创建符号链接权限，跳过；Linux CI 会执行 |
| `npm run eval` | 5 / 5 离线检索与循环样例通过 |
| `node src/cli.js --demo --save` | 工具循环完成，生成 Markdown 和 JSON 报告 |
| 真实 Responses 协议 | 使用模拟 HTTP 响应验证请求结构、工具结果回传与 reasoning 保留 |
| 真实模型 API 请求 | 未运行：本地没有配置 API Key |

离线样例通过不代表模型答案准确率。引用结构校验不代表来源在语义上支持答案。下一步应配置自己的 Key，至少人工核对三个真实问题的回答与引用。

GitHub Actions 工作流包含 Windows / Linux 与 Node.js 22 / 24 四种组合。本记录只报告本地已运行的结果，远端结果请查看仓库 Actions 页面。
