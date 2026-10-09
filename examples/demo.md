# 实际离线演示结果

模式：确定性规则；未调用大模型。

问题：Agent 和普通聊天有什么区别？

```text
[第 1 轮] 选择下一步
  → list_notes {}
[第 2 轮] 选择下一步
  → search_notes {"query":"Agent 和普通聊天有什么区别？"}
[第 3 轮] 选择下一步
  → read_note {"file":"agent-basics.md"}
[第 4 轮] 选择下一步
  → read_note {"file":"project-practice.md"}
[第 5 轮] 选择下一步
完成
```

## 检索摘录

- 普通聊天主要生成文字；Agent 还能调用工具，根据工具结果决定后续行动。 [agent-basics.md:4]
- Agent 是围绕目标反复执行“选择行动、调用工具、观察结果、决定下一步”的程序。 [agent-basics.md:3]
- Agent loop 必须有停止条件：获得最终答案、超过轮数上限、超过调用次数上限或遇到不可恢复错误。 [agent-basics.md:8]
- 第四步：阅读 agent.js，理解函数调用结果如何回传以及为什么必须保留模型输出项。 [project-practice.md:6]
- 第三步：配置 API Key 和模型，体验模型自主选择工具的真实 Agent 模式。 [project-practice.md:5]

这些是按关键词选取的原文摘录；需要真正的解释和规划时，请启用真实模型模式。
