---
title: Chunking Strategies for RAG
author: Dingfan
acknowledgment: Drafted in dialogue with Claude (Anthropic).
created: 2026-05-05
lastmod: 2026-05-05
source: https://www.pinecone.io/learn/chunking-strategies/
tags:
  - rag
  - chunking
  - embedding
  - retrieval
  - llm
  - ai-engineering
  - learning-note
summary: 基于 Pinecone Chunking Strategies 的精读笔记。重点整理了 chunk size 的双重影响、embedding 容量瓶颈与 lost-in-the-middle 的本质区别、RAG vs long context 的工程权衡、以及切分与增强的正交矩阵思维。
---

> 基于 Pinecone 文章和与 Claude 的讨论整理。后续会持续补充阅读其他文献（尤其是 Liu et al. 2023 等原始论文）后的修正与扩展。目前文中 Claude 提供的数据未经验证，无法保证可靠，但大方向的正确与否是很显然的，比如几种 chunk method 的效率和成本。

## 1. Chunking 的本质：信息完整度 vs 信息纯度的权衡

文章开头那句被反复引用的话：finding chunks that are big enough to contain meaningful information, while small enough to enable performant applications and low latency responses.

简而言之：**chunk size 是在"信息完整度"和"信息纯度"之间做权衡**。

- 太小 → 损失完整度。每块讲不清一件事，单独看缺乏必要的上下文。
- 太大 → 损失纯度。每块讲了太多事，关键信号被稀释。

这个 framing 比”找一个合适的大小“更有指导意义——它说明 chunk size 不是一个绝对最优值，而是与语料、query 分布、模型能力共同决定的一个平衡点。

## 2. chunk size 的双重影响：检索 vs 生成

chunk size 在 RAG pipeline 的两个阶段产生不同的影响，需要分别考虑。

**检索阶段**:

- chunk 太小 → 单个 chunk 信息缺乏上下文（比如没有主语的孤儿 chunk，it / this / above 等回指词），embedding 字面信息不足，检索时召不回。
- chunk 太大 → 多个话题被压缩成一个向量，每个话题的信号都被稀释，精确 query 难以匹配上。

**生成阶段**:

- chunk 太小 → 单个 chunk 信息不足，需要更多 chunk 才能拼出完整答案，挤占 LLM 的 context 预算。
- chunk 太大 → 输入 token 数增加，推理延迟上升、成本上升，且触发 lost-in-the-middle。

这个双重影响解释了为什么 chunk size 没有简单公式可衡量的根本原因。因此优化应该面向两个阶段同时存在的多个失败模式来进行。

## 3. 被混淆的损失机制

读这篇文章时踩过的坑：**把 embedding 容量瓶颈和 lost-in-the-middle 混为一谈**。虽然它们都是长文本上的信息丢失”，但发生在不同阶段、由不同机制造成。

### 机制 A：Embedding 的容量压缩损失

发生在检索阶段。embedding 模型把任意长度的文本压缩成一个固定维度的向量（比如 1024 维）。这是极度有损的压缩——输入越长，单位 token 能”占用“的向量空间越少。

类比：embedding 维度像一张固定分辨率的画布。

- 1024 维 ≈ 1024 像素的画布
- 一个句子 → 一张画布画一个苹果，细节清晰
- 整本书 → 同样大小的画布画整个超市，全糊成一片

实际后果：把整个参考文档编码成单个向量，向量只能粗粒度地代表“这是一份某领域的文档”。当用户 query 是某个具体细节问题时，embedding 距离对不上，细节信息已经在压缩中丢失了。

**这就是为什么 chunking 不只为适配 context window，还要充分考虑 embedding 模型的有损压缩，以保留更多细节**。

### 机制 B：Lost-in-the-Middle

发生在生成阶段。Liu et al. (2023) 的实验显示：把回答问题所需的关键信息放在长 context 的不同位置，准确率呈 U 型曲线——开头和结尾最高，中间最低。这是 LLM 注意力机制和训练数据分布共同导致的结构性问题。

需要特别注意“中间”指的是 **LLM prompt 中物理位置的中间**，而不是"被压缩进 embedding 时丢失的中间信息"。这两个"中间"完全是不同的概念。

### 两个机制的对照

| 维度     | Embedding 压缩损失 | Lost-in-the-Middle  |
| ------ | -------------- | ------------------- |
| 发生阶段   | 检索阶段(建索引时)     | 生成阶段(LLM 推理时)       |
| 涉及模型   | embedding 模型   | 生成式 LLM             |
| 损失原因   | 固定维度向量容量有限     | 注意力机制 + 训练分布偏置      |
| “中间”含义 | 没有"中间"概念，是整体压缩 | LLM prompt 中物理位置的中间 |

## 4. RAG vs Long Context：为什么前者还没被淘汰

目前 LLM 的 context 已经越来越大，DeepSeek v4 甚至具备 1M 的上下文空间，那么 RAG 是否依然需要？

答案是肯定的。

最开始我的理解是，如果没有 RAG，那么 LLM 应该要自己去从整个输入中寻找需要的信息，但是 Claude 对我的理解进行了纠正：**LLM 不在 context 里"搜索"信息**。它的工作方式是每生成一个 output token 都对整个 context 做一次 attention 计算。所谓塞 200k 进去让模型自己找，实际上是让模型为每个生成步骤都消化一遍 200k token。因此基于这个认识，回答可以从如下几个方面展开：

**Quality**：lost-in-the-middle 导致中间内容被忽略,回答质量反而下降。

**Latency**：Self-attention 复杂度是 O(n²)。100k tokens 比 5k tokens 在 prefill 阶段不是慢 20 倍，而是慢约 400 倍(理论上限)。直接体现为 TTFT(Time To First Token)显著上升。

**Cost**：input token 按量计费。每次 query 处理整份文档是巨大浪费——RAG 的本质是把全文档 attention换成top-k chunk attention，n 从 200k 降到 2k，计算和计费都降两个数量级。

**架构清晰性**：RAG 把检索和生成职责分离，可以独立优化、独立替换、独立评估。这是软件设计层面的清晰性，仅有 long context 的方案做不到。

那如果将 prompt caching 机制考虑进来呢？答案是 **prompt caching** 虽然可以缓存重复使用的 prompt 前缀，缓解部分 cost 问题。但它不能解决 quality 和 lost-in-the-middle 问题，因此总体上 RAG 仍然具备优势。

### 关于 prefill 和 decoding

LLM 推理延迟实际由两段组成:

- **Prefill 阶段**：处理整个输入 prompt，这一步是 O(n²)，决定 TTFT
- **Decoding 阶段**：逐个生成 output token，借助 KV Cache 每个新 token 是 O(n)

KV Cache 解决的是 decoding 阶段的重复计算，但 prefill 阶段躲不开 O(n²)。所以“长 context 慢”的痛点主要在 prefill。这也是 prompt caching 能缓解 cost 的原因——它本质上是缓存 prefill 的中间结果(K/V)。

## 5. 几种 Chunking 方法

文章里的方法分类一开始读起来比较散，整理成层级会清楚得多:

```
Fixed-size chunking(不看内容,纯按 token 数切)
Content-aware chunking(看内容决定切分)
├── Sentence / paragraph splitting(NLTK, spaCy)
├── Recursive Character Splitter(LangChain)
├── Document structure-based(Markdown / HTML / LaTeX / PDF)
└── Semantic Chunking(Kamradt)
Contextual Chunking with LLMs(独立维度)
```

注意 **Contextual Chunking 不在切分方法的层级里**——它是对已切好的 chunk 做上下文增强，正交于切分方法。这是下一节要讨论的关键。

## 6. 切分与增强的正交性

**Semantic Chunking ≠ Contextual Chunking**。虽然两者都涉及 LLM 或 embedding，名称相似，但解决的问题完全不同。

|                      | Semantic Chunking    | Contextual Chunking     |
| -------------------- | -------------------- | ----------------------- |
| 解决的问题                | 在哪里切?                | 切完之后每块缺上下文怎么办？          |
| 利用 LLM/embedding 做什么 | 用 embedding 距离检测话题切换 | 用 LLM 给每个 chunk 生成上下文摘要 |
| 输出                   | 不同大小的 chunk          | 增强后的 chunk（原文 + 摘要）     |
| 是否互斥                 | 否，可以组合使用             | 否，可以组合使用                |

把它们拆开来看，一个 RAG 系统的 chunking 设计实际上是两个独立维度的组合:

```
切分维度(必选其一):    fixed-size | recursive | doc-structure | semantic
增强维度(可选叠加):    none | heading prefix | contextual chunking | ...
```

这种**正交分离的思维**意味着可以独立调试每个维度——先选定切分方法，再决定要不要叠加增强；或者先验证基础切分够不够好，再考虑是否需要 contextual 增强。

## 7. Recursive 的本质:用形式逼近语义

Recursive Character Splitter 的默认分隔符列表是 `["\n\n", "\n", " ", ""]`，按优先级递归切分。它通常比 fixed-size 更”聪明“，因为它利用的不是语义信号本身，而是**人类书写习惯的代理信号(proxy signal)**。人写作时会用 `\n\n` 表示话题切换、`\n` 表示句子结尾——这些都是结构形式，不是语义。Recursive 的核心假设是”形式边界 ≈ 语义边界“。

这个假设在格式良好的文档上成立，但形式边界并非永久成立，比如：

- 同一段落里也可能切换话题(`\n\n` 失灵)
- 一个话题可能跨多段(`\n\n` 过度切分)

理解了 Recursive 是 proxy signal 之后，就知道它什么时候会失灵——结构形式与实际话题边界不一致的文档（语音转写、聊天记录、不规范笔记）。这种文档恰好是 Semantic Chunking 的舞台。

## 8. Semantic Chunking 的真实成本

很多教程会推荐 Semantic Chunking 作为"更聪明"的选择，但生产环境很少用它。原因是成本：

|        | Recursive    | Semantic         |
| ------ | ------------ | ---------------- |
| 计算成本   | 接近 0，纯字符串处理  | 每个句子都要 embedding |
| 处理时间   | 1MB 文档 < 1 秒 | 1MB 文档约几分钟       |
| API 调用 | 0            | 数千到数万次           |
| 工程复杂度  | 几行代码         | 需处理 batch、阈值调参   |

Pinecone 用 "experimental" 形容它不是说效果差——而是性价比还没到能作为默认选项的程度。处理 100k 文档的语料库时，semantic 切分一次可能要跑几小时，这对快速迭代是致命的。

生产系统里更常见的组合是 **"Recursive 或 structure-based 切分 + contextual chunking 增强"**——避开 semantic 的预处理代价,但通过后处理弥补语义自洽性。这又是正交分离思维的应用。

## 9. 工程选型的多维权衡

把所有方法放进一个三维矩阵:

| 方法 | Quality | Speed | Cost |
|---|---|---|---|
| Fixed-size | 一般 | 极快 | 极低 |
| Recursive | 较好 | 极快 | 极低 |
| Doc-structure | 好(前提:结构存在) | 快 | 低 |
| Semantic | 好 | 慢 | 高 |
| + Contextual 增强 | 提升 | 略慢 | 略高 |

工程选型不是”选最好的“，而是**在 quality / speed / cost 三角形里找项目能接受的点**。语音转写场景可以接受 semantic 的高成本，因为没别的选择；规范文档场景就完全没必要付 semantic 的代价。

数据规模也是一个隐含约束:

- 小数据集(< 1k 文档)：怎么选都行,成本差异微不足道
- 中等数据集(1k - 100k 文档)：开始要权衡，semantic 的预处理时间显著
- 大数据集(> 100k 文档)：semantic 几乎不可行，必须用更便宜的方法 + 后处理增强

## 10. 把 chunk size 当超参数搜索

文章最后给出的调优指南本质上是一个超参数搜索：

> With a representative dataset, create the embeddings for the chunk sizes you want to test and save them in your index (or indices).

把它翻译成操作步骤：

1. **构建 query 集**：从真实使用场景采样问题，人工标注每个 query 应该命中的 gold chunk
2. **dev / test split**:按 7:3 分，test set 锁起来不看
3. **候选 size 列表**：[128, 256, 512, 1024]
4. **每个 size 切分 → embed → 建索引**：用不同 namespace 隔离
5. **在 dev set 上跑 query**：评估 recall@k、MRR 等指标
6. **选出 dev set 上最优 size**
7. **在 test set 上验证一次**：报告最终性能;如果与 dev 差距大说明 dev 上 overfit

起初向 Claude 阐述我的想法时，说的是训练集和测试集，后来它纠正了我：RAG 评估的标准术语是 **dev set / test set**,不是”训练集/测试集“——因为 RAG 系统里没有”模型训练“这一步，调的是 pipeline 工程参数,不是模型权重。

结合之前的量化探索，考虑进阶一步：**Monte Carlo 重采样验证稳定性**。多次随机重采样 dev/test split，看选出的“最优 chunk size”在不同 split 下是否稳定。如果 256 在 split 1 是最优、512 在 split 2 是最优，说明信号很弱，需要更大的 query 集才能做出可靠决策。

## 参考

- [Pinecone: Chunking Strategies for LLM Applications](https://www.pinecone.io/learn/chunking-strategies/)
- [Liu et al., "Lost in the Middle: How Language Models Use Long Contexts" (2023)](https://arxiv.org/abs/2307.03172)
- [Greg Kamradt's notebook on 5 Levels of Text Splitting](https://github.com/FullStackRetrieval-com/RetrievalTutorials/blob/main/tutorials/LevelsOfTextSplitting/5_Levels_Of_Text_Splitting.ipynb)
