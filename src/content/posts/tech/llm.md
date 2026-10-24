---
title: 将 LLM 引入程序处理流程
date: 2026-10-24T00:00:00.000Z
tags:
  - subject/LLM
  - subject/Python
  - topic/function-calling
  - topic/eval-design
  - type/study-note
draft: false
obsidian_id: f8b5fddc-ef2b-4669-ba6f-82b2cb61d26a
summary: 从一个任务标记的小例子出发，记录如何用 Responses API 接入 DeepSeek，声明工具、解析参数并校验结果，以及这个过程中容易混淆的几个概念。
layout: tech
---
10 月 22 日，Microsoft 与 Hugging Face 发布了 ThinkingBox 的训练工作：让 Agent 执行任务，再检查数据库最终状态，将检查结果用于强化学习。[原文](https://huggingface.co/blog/microsoft/thinkingbox-training)

例如，Agent 说“订单已修改”，并不代表修改成功。检查器还需要核实实际记录，以及有没有产生错误的额外改动。

所以我打算做一个练习：新建一个任务列表，通过自然语言要求完成其中一项，让模型选择任务，再由程序执行和检查。暂时不涉及训练，先把这条流程走通。

## 1. 先把修改和校验写出来

先不接模型，只提供最基本的：一份任务列表、一个修改函数，以及一个校验函数。

### 任务列表与修改器

```python
from copy import deepcopy

before = [
    {"id": 1, "title": "阅读开源项目 README", "done": False},
    {"id": 2, "title": "理解一个 Python 函数", "done": False},
]


def mark_done(tasks, task_id):
    after = deepcopy(tasks)

    for task in after:
        if task["id"] == task_id:
            task["done"] = True
            return after

    raise ValueError(f"任务 ID 不存在：{task_id}")
```

列表中有两项任务，每项包含 `id`、`title` 和 `done` 三个字段。`mark_done` 接收任务列表和待完成的任务 ID，找到对应任务后，将 `done` 置为 `True`，返回修改后的副本。找不到就明确报错，避免把“没有做任何修改”误当成执行成功。

一个容易忽略的地方是 `deepcopy`。如果直接写 `after = tasks`，两个变量指向的是同一份列表；即使使用 `tasks.copy()`，里面的任务字典仍然是共享的。这里需要保留修改前的数据供后面比较，所以使用深拷贝。[Python copy 文档](https://docs.python.org/3/library/copy.html)

### 校验器检查什么

```python
def check_result(before, after, target_id):
    expected = deepcopy(before)

    for task in expected:
        if task["id"] == target_id:
            task["done"] = True
            return after == expected

    return False  # 目标不存在
```

校验器先构造一份“应该得到的结果”：只完成指定任务，其它内容不动。再把实际结果 `after` 与它比较。

因此，它不只检查目标任务有没有完成，也会发现其它任务被修改、删除或新增的情况。这个例子还要求任务顺序保持不变，因为 Python 列表比较会考虑顺序。若允许重排，校验规则就需要相应调整。

先故意制造几种情况，看看检查器能不能区分：

```python
# 用户要求始终是完成任务 1
after = mark_done(before, task_id=1)
print("正确完成：", check_result(before, after, 1))  # True

after = deepcopy(before)
print("没有修改：", check_result(before, after, 1))  # False

after = mark_done(before, task_id=2)
print("改错任务：", check_result(before, after, 1))  # False

after = mark_done(before, task_id=1)
del after[1]
print("误删任务：", check_result(before, after, 1))  # False

print("目标不存在：", check_result(before, before, 3))  # False
```

## 2. 让模型决定调用哪个工具

接入 LLM 后，用户可以用自然语言表达需求。不过，在这个例子中，模型负责返回工具调用请求，真正修改数据的仍然是 Python 函数。

流程可以写成：用户要求 → 模型选择工具和参数 → 程序检查参数 → 执行函数 → 校验结果。

### 创建 API 客户端

先在运行脚本的 Python 环境中安装 SDK：

```powershell
python -m pip install -U openai
```

接下来的代码可以依次放在同一个 Python 文件中；前面两个函数和 `before` 列表也要保留，测试用的 `print` 可以单独放到另一个文件。

```python
import json
import os

from openai import OpenAI
from openai.types.responses import ToolParam

client = OpenAI(
    api_key=os.environ["DEEPSEEK_API_KEY"],
    base_url="https://api.deepseek.com",
)
```

这里创建的是 API 客户端，不是把模型加载到本地。`OpenAI` 是 SDK 的类名，服务地址由 `base_url` 指定，具体使用哪个模型则由请求中的 `model` 指定。

本例使用 DeepSeek，需要提前在运行脚本的环境中配置 `DEEPSEEK_API_KEY`。`os.environ[...]` 读取的是环境变量；没有设置时会报 `KeyError`。

截至本文整理时，DeepSeek 官方文档提供了 `deepseek-flash` 的 Responses 调用示例。不过“兼容接口”不等于每个参数都支持，具体差异仍要看服务商文档。[DeepSeek Responses 指南](https://api-docs.deepseek.com/guides/responses_api/)

### 把任务列表交给模型

```python
message = (
    "当前任务列表：\n"
    + json.dumps(before, ensure_ascii=False)
    + "\n请将第一个任务标记为已完成。"
)
```

模型既需要知道用户要做什么，也需要看到可选任务。只说“请给出任务 ID”，它并不知道该选择哪一项。

`before` 是列表套字典，而这里要与字符串拼接，不能直接写字符串加列表。因此用 `json.dumps` 把 Python 对象转为 JSON 文本。`ensure_ascii=False` 让中文直接显示，方便阅读；默认转义中文也不会改变它表达的内容。[Python json 文档](https://docs.python.org/3/library/json.html)

### 工具描述不等于函数实现

下面这段是给模型看的工具说明。真正的函数已经在前面定义好了。

```python
tools: list[ToolParam] = [
    {
        "type": "function",
        "name": "mark_done",
        "description": "根据任务 ID，将指定任务标记为已完成。",
        "parameters": {
            "type": "object",
            "properties": {
                "task_id": {
                    "type": "integer",
                    "enum": [task["id"] for task in before],
                    "description": "要标记为已完成的任务 ID",
                }
            },
            "required": ["task_id"],
            "additionalProperties": False,
        },
        "strict": True,
    }
]
```

这里没有让模型重新生成整份任务列表，只让它选择 `task_id`。执行时，程序再把自己持有的 `before` 传给函数。工具参数不一定要覆盖 Python 函数的所有参数，两者之间的对应关系由调用代码负责。

`parameters` 使用 JSON Schema 描述参数结构，几项容易混淆的写法整理如下：

| 字段 | 本例中的含义 |
| --- | --- |
| `type: object` | 整组参数是按名称组织的对象，例如 `{"task_id": 1}` |
| `properties` | 描述对象中每个字段的类型和含义 |
| `type: integer` | `task_id` 必须是整数；这里不写 Python 的 `int` |
| `enum` | 允许选择的实际任务 ID，本例为 `1`、`2` |
| `required` | 必须提供 `task_id` |
| `additionalProperties: False` | 不允许增加未声明的参数 |

Schema 中的数组类型写 `array`，不是 `list`，还需要用 `items` 描述元素。另一方面，这段定义本身是 Python 代码，所以布尔值要写 `True`、`False`；序列化成 JSON 后才是 `true`、`false`。[JSON Schema 对象说明](https://json-schema.org/understanding-json-schema/reference/object)

`strict=True` 用于要求参数符合工具的 Schema。OpenAI 的严格模式要求对象禁用额外字段，并将声明的属性全部列为必填。第三方兼容服务仍需核对其支持情况。格式正确不代表任务选对了：用户要求完成任务 `1`，模型选择 `2`，也可能完全符合上面的 Schema。[OpenAI Function calling：Strict mode](https://developers.openai.com/api/docs/guides/function-calling#strict-mode)

## 3. 发起请求，再解析工具参数

```python
response = client.responses.create(
    model="deepseek-flash",
    instructions="根据用户要求和任务列表，调用 mark_done 工具。只处理这一项任务。",
    tools=tools,
    input=message,
)
```

这次请求把用户输入和工具说明送给模型。默认情况下，模型不一定调用工具，也可能返回文字，所以解析时要处理“没有工具调用”的情况。

### 先看清楚响应的层次

调试时可以打印完整响应：

```python
print(response.model_dump_json(indent=2))
```

`indent=2` 表示 JSON 文本每层缩进两个空格，只影响打印格式。输出为：

```json
{
  "id": "111750c6-265e-4e9f-8f30-848833066f19",
  "created_at": 1792812045.0,
  "error": null,
  "incomplete_details": null,
  "instructions": "根据用户要求和任务列表，调用 mark_done 工具。",
  "metadata": {},
  "model": "deepseek-flash",
  "object": "response",
  "output": [
    {
      "arguments": "{\"task_id\": 1}",
      "call_id": "call_00_ET_T4lUNAFBUgxgOp8W9mVV6340",
      "name": "mark_done",
      "type": "function_call",
      "id": "8d3a3f8d-da28-4664-8287-4a3501114319",
      "status": "completed"
    }
  ],
  "parallel_tool_calls": true,
  "temperature": 1.0,
  "tool_choice": "auto",
  "tools": [
    {
      "name": "mark_done",
      "parameters": {
        "type": "object",
        "properties": {
          "task_id": {
            "type": "integer",
            "enum": [
              1,
              2
            ],
            "description": "要标记为已完成的任务 ID"
          }
        },
        "required": [
          "task_id"
        ],
        "additionalProperties": false
      },
      "strict": true,
      "type": "function",
      "description": "根据任务 ID, 将指定任务标记为已完成"
    }
  ],
  "top_p": 1.0,
  "background": false,
  "completed_at": 1792812045.0,
  "conversation": null,
  "max_output_tokens": null,
  "max_tool_calls": null,
  "previous_response_id": null,
  "prompt": null,
  "prompt_cache_key": null,
  "prompt_cache_retention": null,
  "reasoning": {
    "effort": null,
    "generate_summary": null,
    "summary": null
  },
  "safety_identifier": null,
  "service_tier": "default",
  "status": "completed",
  "text": {
    "format": {
      "type": "text"
    },
    "verbosity": null
  },
  "top_logprobs": 0,
  "truncation": "disabled",
  "usage": {
    "input_tokens": 390,
    "input_tokens_details": {
      "cached_tokens": 256
    },
    "output_tokens": 40,
    "output_tokens_details": {
      "reasoning_tokens": 0
    },
    "total_tokens": 430
  },
  "user": null,
  "content_filters": null,
  "frequency_penalty": 0.0,
  "moderation": null,
  "presence_penalty": 0.0,
  "store": false
}
```

`response` 已经是 SDK 返回的 Python 对象；`output` 是输出项列表，里面可能包含消息、工具调用等不同类型。真正需要 `json.loads` 的是 `arguments`：它是 JSON 字符串，解析后才成为字典。

```python
# JSON 文本 → Python 字典 → 整数
arguments = json.loads('{"task_id": 1}')
task_id = arguments["task_id"]
```

普通文字可以通过 `response.output_text` 读取，工具参数则要从 `response.output` 中找。不要假设第一项一定是工具调用，也不要把整个 `response` 交给 `json.loads`。[OpenAI Function calling](https://developers.openai.com/api/docs/guides/function-calling)

### 检查参数后再执行

这个练习只允许修改一项任务。先确认模型恰好提出一次函数调用，再处理参数，避免多次调用互相覆盖结果。

```python
calls = [item for item in response.output if item.type == "function_call"]

if not calls:
    print("模型没有请求调用工具：", response.output_text)
    raise SystemExit(0)

if len(calls) != 1:
    raise ValueError("本例只处理一次工具调用")

call = calls[0]
if call.name != "mark_done":
    raise ValueError(f"不支持的工具：{call.name}")

arguments = json.loads(call.arguments)
if not isinstance(arguments, dict) or set(arguments) != {"task_id"}:
    raise ValueError("参数必须是只包含 task_id 的对象")

task_id = arguments["task_id"]
if type(task_id) is not int:
    raise ValueError("任务 ID 必须是整数")

if task_id not in [task["id"] for task in before]:
    raise ValueError(f"任务 ID 不存在：{task_id}")

after = mark_done(before, task_id=task_id)

# 对应本次固定要求：“将第一个任务标记为已完成”
expected_id = before[0]["id"]
passed = check_result(before, after, target_id=expected_id)

print("模型选择的 ID：", task_id)
print("执行后的任务列表：", after)
print("是否正确完成：", passed)
```

这里使用 `type(task_id) is int`，是为了也排除 Python 中属于 `int` 子类的布尔值。JSON 解析失败、字段缺失或类型不对时，程序会报错停止，不会继续修改数据。本例先保留这种直接的处理方式。

还有一点比解析本身更重要：`expected_id` 不能直接取模型给出的 `task_id`。它来自这次固定的用户要求，即列表第一项的 ID。否则模型选错任务，校验器也会跟着选错。

这个预期值是为本次练习预先设定的，并不意味着程序已经能验证任意自然语言。实际需求如果变成“完成昨天那条还没做的任务”，就需要可靠的任务上下文、人工确认或单独设计的验收条件，不能继续硬写第一项。

本次原始运行记录选中了任务 `1`，得到的关键结果如下。模型输出并非每次都保证一样。

```text
模型选择的 ID： 1
执行后的任务列表： [{'id': 1, 'title': '阅读开源项目 README', 'done': True}, {'id': 2, 'title': '理解一个 Python 函数', 'done': False}]
是否正确完成： True
```

## 4. 结果要不要再交回模型

到这里，程序已经执行了函数，并在本地验证结果。如果只是想完成这个小练习，可以停在这里。

如果还需要模型根据结果回复用户，就要把执行结果交回去。`call_id` 用来对应“这份结果属于哪次工具调用”。它不是任务 ID，也不是响应顶层的 `id`。

下面是可选的第二次请求，会额外调用一次 API：

```python
history = [{"role": "user", "content": message}]
history.extend(response.output)
history.append({
    "type": "function_call_output",
    "call_id": call.call_id,
    "output": json.dumps({
        "task_id": task_id,
        "verified": passed,
        "tasks_after": after,
    }, ensure_ascii=False),
})

final_response = client.responses.create(
    model="deepseek-flash",
    instructions="根据工具结果简短回复。verified 为 false 时明确说明校验未通过。",
    tools=tools,
    tool_choice="none",  # 本轮只说明结果，不再执行其它操作
    input=history,
)
print(final_response.output_text)
```

这里保留完整的 `response.output`，再追加工具结果。DeepSeek 的 Responses 接口目前是无状态的，不支持用 `previous_response_id` 自动接续历史，因此显式传入这些内容。[DeepSeek 兼容性说明](https://api-docs.deepseek.com/guides/responses_api/#compatibility-details)

模型最后的文字只是对结果的说明，不能替代前面的程序校验。

## 5. 这个小例子能说明什么

这次最容易混在一起的，其实是三个步骤：模型选出参数、程序执行函数、检查器判断结果。把它们拆开后，才能知道错误发生在哪一层。

| 检查位置 | 本例能发现什么 |
| --- | --- |
| 参数检查 | ID 类型错误、不存在的 ID、多余字段 |
| 结果校验 | 选错任务、没有完成、误改其它任务 |
| 人工检查需求 | 用户说的“第一个”究竟对应哪条任务 |

这个校验器也有边界。它比较的是最后的数据，看不到中途发生过什么；如果某个操作曾向外部发送消息，随后又把本地数据改回原样，这种检查并不能发现。因此实际业务还可能需要操作日志、权限检查和执行前确认。

这里所有修改都发生在内存副本中。`passed=False` 只表示检查没通过，程序没有自动重试或回滚；也没有写入数据库。实际系统若已经产生外部影响，事后发现问题不等于问题已经撤销。

与 ThinkingBox 的联系是：执行结果可以通过程序检查，并进一步用于评测或训练奖励。这个练习只做到检查结果，没有更新模型参数，也没有训练出一个 Agent。

先把这一步弄清楚，后面再学习多轮工具调用、错误恢复和状态保存，就知道每一层是在补什么了。

## 参考

1. Microsoft / Hugging Face. [Turning Database Grading into RL Rewards: Post-Training Agents with ThinkingBox](https://huggingface.co/blog/microsoft/thinkingbox-training)，2026-10-22。本文练习的起点，介绍如何检查任务执行后的数据库状态，并把检查结果用于强化学习。

2. DeepSeek. [Using the Responses API](https://api-docs.deepseek.com/guides/responses_api/)。对应本文的客户端配置、模型请求与结果回传；其中的 Compatibility Details 列出了与 OpenAI Responses API 的兼容范围，包括 `previous_response_id` 不受支持等差异。

3. OpenAI. [Function calling](https://developers.openai.com/api/docs/guides/function-calling)。对应工具声明、严格模式、工具参数解析，以及通过 `function_call_output` 回传结果的完整流程。阅读时选择 Responses API 的 Python 示例。

4. OpenAI. [OpenAI Python SDK](https://github.com/openai/openai-python)。Python 客户端的官方仓库，包含安装、类型标注、响应对象与错误处理等说明。

5. Python Software Foundation. [copy — Shallow and deep copy operations](https://docs.python.org/3/library/copy.html)。对应本文为什么使用 `deepcopy`，以及赋值、浅拷贝和深拷贝之间的区别。

6. Python Software Foundation. [json — JSON encoder and decoder](https://docs.python.org/3/library/json.html)。对应 `json.dumps`、`json.loads`、`ensure_ascii` 和 `indent` 的作用，以及 Python 对象与 JSON 文本之间的转换。

7. JSON Schema. [Understanding JSON Schema: object](https://json-schema.org/understanding-json-schema/reference/object)。对应工具参数中的 `object`、`properties`、`required` 和 `additionalProperties`；用于理解这些字段如何约束参数结构。
