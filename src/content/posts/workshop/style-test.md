---
title: 样式试验页（全要素）
date: 2026-06-11
summary: 验证代码标题、callout、公式、Mermaid、表格、图片与引用的渲染。本文为草稿，不会发布。
tags: [topic/markdown]
draft: true
---

行内代码 `0x3F8` 与行内公式 $E = mc^2$。

## 代码块

```c title="eeprom_write.c"
uint16_t remain = PAGE_SIZE - (addr % PAGE_SIZE);
if (len > remain) {
    eeprom_write_page(addr, buf, remain);
}
```

## Callout

:::tip
提示块：datasheet 里只有一句话。
:::

:::warn
警告块：回卷不会产生任何错误标志。
:::

## 块级公式

$$
f(x) = \int_{-\infty}^{\infty} \hat f(\xi)\, e^{2\pi i \xi x} \, d\xi
$$

## Mermaid

```mermaid
flowchart LR
  A[写入请求] --> B{跨页?}
  B -- 否 --> C[直接写]
  B -- 是 --> D[分段写]
```

## 表格与引用

| 起始地址 | 长度 | 结果 |
| --- | --- | --- |
| 0x3F0 | 8 | 正常 |
| 0x3F8 | 16 | 页首被覆盖 |

> 所谓「随机」，只是尚未被理解的确定性。
