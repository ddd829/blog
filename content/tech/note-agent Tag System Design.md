---
title: note-agent Tag System Design
tags:
  - project/note-agent
  - topic/orthogonality
  - topic/eval-design
  - topic/tag-design
  - type/methodology
author: Dingfan
acknowledgments: Drafted in dialogue with Claude (Anthropic).
created: 2026-05-05
lastmod: 2026-05-05
summary: 讨论 note-agent 设计过程中 tag 设定的最佳实践，目标是降低 LLM 调用开销、提升 eval 可靠性、并减少阅读时的认知成本。
---

> note-agent 在处理部分语料时，存在 tag 推荐过于宽泛的现象（例如对一篇关于豆包的新闻只输出 `AI` 和 `付费`）。在与 Claude 讨论时进一步发现：即便换上更精准的 tag，多个 tag 之间也存在「维度混杂」的扁平化问题——主体、概念、项目归属被塞进同一个命名空间。两个问题的本质相通，于是写下这篇关于 tag 设定的标准与最佳实践。

---

## 1. tag 与 folder 的正交性

### 原则

类似于 chunking design，**能由文件结构本身提供的信息，就不必再让 LLM 通过语义来生成**——这是工程上“用确定性换概率性”的常规手段。一篇笔记的 folder 路径已经具备了大方向的前置信息，如：当一级目录是 `AI/` 时，所有归入此目录的笔记天然具有"AI 类"属性，再用 `AI` 作 tag 是**信息冗余**。

因此 tag 设计的第一条规范是：**tag 与 folder 提供的信息应当非冗余**——禁止 tag 与目录名重复。

### 关于"正交"一词的语义说明

此处的"正交"采用 *The Pragmatic Programmer* 第 10 章给出的工程语义[2]：

> "Two or more things are orthogonal if changes in one do not affect any of the others."

即**独立、解耦、信息不重复编码**——比数学上严格的"内积为零、互信息为零"要弱。Wikipedia 的 *Orthogonality (programming)* 词条也沿用此约定[3]。tag 与 folder 在严格数学意义上**不可能完全独立**（folder 路径会限制 tag 的合理取值），但可以做到工程意义上的非冗余：改 folder 不必同步改 tag，反之亦然。

---

## 2. tag 命名的 schema

衡量一个 agent 的可靠性需要充分的 eval 支撑。为了让 eval 能稳定打分，应当**优先建立机械可验证的命名规则**——能用正则解决的事情就不要消耗 LLM token：

- **专有名词**：保留官方英文写法或 PascalCase（如 `ByteDance`、`OpenAI`、`iPhone`、`GPT-4`、`LLaMA`）
- **概念类 tag**：全小写 + kebab-case（`ai-monetization`、`ai-chatbot`、`ad-driven-growth`）
- **禁止**：空格、下划线混用、中文（与代码标识符的英文规范保持一致）、与目录名重复的词

确立后将这些规则作为硬约束写入 system prompt，并在 eval 框架中加入正则校验层，不符合命名规范的 tag 直接扣分。这样就把 **tag 质量**分解成两个非冗余的维度：

| 维度 | 验证方式 | 成本 |
|---|---|---|
| 命名合规性 | regex（机械、确定） | 接近零 |
| 语义准确性 | LLM judge | 消耗 token |

前者免费且确定，后者才需要消耗推理成本——这是又一条工程上"非冗余分解"的应用。

### 关于 LLM judge 的可靠性

一个常见的疑虑是：tag 本身就是 LLM 生成的，再让 LLM 来 judge 不是循环吗？

并不是。原因有三：

1. **生成与判别不对称**：生成 tag 时模型要平衡多个目标（具体性、规范性、与 folder 不冗余等），判别时只需回答单一窄问题，注意力集中，错误率远低于生成。
2. **实证支持**：Zheng et al. (2023) 的研究表明，强 LLM judge（如 GPT-4）与人类专家的一致率可达 80% 以上，**与人类专家之间的互相一致率持平**[4][5]。
3. **缓解偏差**：让 judge 模型与生成器**不同**（例如用 DeepSeek 生成、用 Claude judge），可直接规避 self-enhancement bias[4]。

但 LLM-as-judge 不是无脑可信的，需要：

- 拆解为多个**单维度 yes/no 判别**而非整体打分
- 用 30-50 条**人工标注样本**做小规模校准，确认 judge 与人工的一致率 ≥ 75% 后再大规模部署
- 警惕 position bias、verbosity bias、self-enhancement bias 等已知偏差[4]

这一步在思路上等同于量化策略的 out-of-sample 验证：先在小样本上证明评估器自身可靠，再用它去评估大规模产出。

---

## 3. tag 命名的 namespace

### 问题：扁平 namespace 的维度混淆

目前个人笔记中的 tag 存在维度混淆，例如：

- `Doubao` —— **主体**（这篇笔记关于谁/是什么）
- `ai-monetization` —— **概念**（涉及什么思想/范畴）
- `note-agent` —— **项目归属**（属于哪个工程）
- `wechat` —— **来源**（笔记从哪里导入，例如经由微信渠道同步）

这四类 tag 处于同一个扁平的 namespace 时会带来一个隐蔽问题：当未来搜索 `note-agent`，预期返回的是该项目的设计文档，还是为这个项目搜集的语料？两种意图会冲突，扁平 tag 不会告诉用户它们的区别。

**这本质上是上一节"正交性"的同一原则反过来用——不同维度的信息不应当挤进同一个命名空间**。

### 解决方案：用 `/` 显式声明维度

Obsidian 原生支持嵌套 tag，使用 `/` 作为分层符号[6][7]。建议规划如下 namespace：

| Namespace | 含义 | 命名规范 | 例子 |
|---|---|---|---|
| `project/` | 项目归属 | kebab-case（匹配 repo 名） | `project/note-agent`, `project/dlms-agent`, `project/stock-system` |
| `topic/` | 概念 / 方法论 | kebab-case | `topic/orthogonality`, `topic/eval-design`, `topic/prompt-engineering` |
| `subject/` | 真实世界主体（人 / 公司 / 产品） | 保留原始大小写 | `subject/Doubao`, `subject/ByteDance`, `subject/OpenAI` |
| `type/` | 笔记类型 | kebab-case | `type/news-summary`, `type/design-doc`, `type/retrospective` |
| `source/` | 笔记的导入来源 | kebab-case | `source/wechat`, `source/rss`, `source/manual` |

### 渐进原则：schema 应被使用反推，而非先验设计

不要一开始就启用全部 namespace。建议先用 `project/` 加无前缀的混合 tag（subject、topic 暂时混在一起）跑两到四周，观察实际检索行为缺什么——

- "我想看所有 note-agent 的设计文档" → 需要 `type/design-doc`
- "我想看所有提到正交性的笔记" → 需要 `topic/orthogonality`
- "我想看所有从微信同步过来的内容" → 需要 `source/wechat`

让 pain point 来驱动 namespace 的扩张。这与量化系统中"先有信号再加约束"的开发节奏是一致的：**结构源于使用，而不是反过来**。

---

## 参考

[1] Denvir, B. T. (1979). On orthogonality in programming languages. *ACM SIGPLAN Notices*, 14(7), 18–30. https://dl.acm.org/doi/10.1145/953029.808475

[2] Hunt, A., & Thomas, D. (2019). Topic 10: Orthogonality. In *The Pragmatic Programmer: Your Journey to Mastery* (20th Anniversary Edition). Addison-Wesley. https://www.oreilly.com/library/view/the-pragmatic-programmer/9780135956977/f_0028.xhtml

[3] Wikipedia. *Orthogonality (programming)*. https://en.wikipedia.org/wiki/Orthogonality_(programming)

[4] Zheng, L., Chiang, W.-L., Sheng, Y., et al. (2023). Judging LLM-as-a-Judge with MT-Bench and Chatbot Arena. *NeurIPS 2023*. https://arxiv.org/abs/2306.05685

[5] Evidently AI. *LLM-as-a-judge: a complete guide to using LLMs for evaluations*. https://www.evidentlyai.com/llm-guide/llm-as-a-judge

[6] Obsidian Help. *Tags*. https://obsidian.md/help/tags

[7] Obsidian Forum. *Nested tags*. https://forum.obsidian.md/t/nested-tags/169