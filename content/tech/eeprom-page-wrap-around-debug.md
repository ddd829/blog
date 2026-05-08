---
title: eeprom-page-wrap-around-debug
author: Dingfan
acknowledgments: Drafted in dialogue with Claude (Anthropic).
created: 2026-05-08
lastmod: 2026-05-08
tags:
  - subject/EEPROM
  - subject/I2C
  - topic/silent-data-corruption
  - topic/root-cause-analysis
  - topic/hardware-software-mismatch
  - topic/mock-fidelity
  - type/retrospective
---

> 记录一下今天遇到的一个 bug，由于软硬件错配导致遇到 eeprom 写回绕的，最终解决方案比较简单，但搜集线索和排查问题耗费了较多时间。

## 现象

设备从远端持续下载数据过程中始终失败，预期应该持续接收直到传输完成。

## 线索

通过与触发问题的同事交流以及自己调试排查，收集到几条线索：

1. 问题只在带真实 EEPROM/Flash 的硬件上复现，在 mock 掉 EEPROM 和 Flash 的纯软件仿真环境里，下载流程完全正常。
2. 出问题的数据都集中在 EEPROM 地址的起始区域，几份数据的存储地址很近。
3. 问题点并不集中于传输，设备启动阶段也观察到异常，共同点是两者都依赖 EEPROM 里的同一片区域。
4. 仅一款设备存在问题，其它型号正常。
5. 连续操作下，第一次下载前数据正常；第一次下载失败后读出"异常 A"；第二次下载失败后读出"异常 B"。异常本身有确定的模式，不是随机扰动。

## 推测

基于上述几条线索，基本可以确定

- 代码逻辑无问题：因为 mock 的 eeprom 和 flash 并不存在问题。而且若程序有问题，如何解释问题不集中在一处呢？
- 问题与 eeprom 有关，但与 eeprom 硬件故障无关：异常点处数据集中，异常模式稳定，若 eeprom 硬件故障，则不会保持稳定的异常模式

## 验证

查看工程配置，发现 EEPROM 的 `PAGE_SIZE` 被配置为了 512 bytes。

翻芯片 datasheet：

> **Page Write**
> The Page Write mode allows up to 256 bytes to be written in a single Write cycle, provided that they are all located in the same page in the memory: that is, the most significant memory address bits, b16–b8, are the same. If more bytes are sent than will fit up to the end of the page, a "roll-over" occurs, i.e. the bytes exceeding the page end are written on the same page, from location 0.

实际硬件的 page size 是 256 bytes。

至此问题定位完毕。

## 分析

EEPROM 的写操作不是按字节随机写的，而是按 page buffer：主控通过 I²C 发起始地址 + 一串数据，芯片把数据写进自己的 page buffer，然后整页烧到存储 cell。page buffer 的物理大小由芯片决定，地址低 N 位是 buffer 内偏移，高位是 page 号。

软件以为 page size 是 512 bytes，于是允许一次写入跨过物理 256 bytes 边界。但芯片硬件只认它自己的 256 bytes 边界：超出当前 page 末尾的字节，地址计数器在 page 内回绕（roll-over），从该 page 的偏移 0 开始覆盖写。

用一张抽象的示意图说明(由 claude 生成)：

```
软件假设的 page 边界（512B）
|<-------------------- "一页" -------------------->|
[ Block A ][ Block B ][ Block C ][ Block D ]......
                  ^
                  | 实际硬件 page 边界（256B）在这里
                  v
Page 0 (0x000-0x0FF) | Page 1 (0x100-0x1FF) | ...

跨界写 Block A 时，超出 Page 0 的字节回绕到 Page 0 起点，
覆盖掉 Block A 自己刚写入的前半段。
```

这就解释了所有现象：

- 为什么数据会变？跨边界写入时，后半段数据回绕，把同一个 page 起始位置（也就是前半段写入的内容）覆盖了。
- 为什么集中在低地址？低地址区域的数据块更可能跨过 256 边界（因为多个数据块紧邻排布，第一个块的写入就可能溢出到第二个块所在 page 的起点）。
- 为什么问题具有确定模式？覆盖逻辑由 page 内偏移决定，是纯硬件行为，给定相同输入必然产生相同输出——所以才有"第一次失败 → 异常 A，第二次失败 → 异常 B"。
- 为什么 mock 程序无法复现？mock 并没有模拟真实硬件的 wrap-around，因此行为和硬件不一致，反而掩盖了 bug。
- 为什么仅一款设备出现问题？这一款设备用的 EEPROM 芯片型号与配置不匹配，其他型号恰好 page size 真是 512 bytes（或者从未触发跨页写）。

## 修复

直接修复很简单：把在 bsp 中将该设备的 `EEPROM_PAGE_SIZE` 改回 256 bytes。

同时新增两个防御性措施：

1. **Mock 行为对齐硬件**：mock 的实现也按真实的 page size 模拟 wrap-around 行为，否则会导致 mock 反而掩盖了问题。
2. **在 mock 程序上新增几组 unit test**：跨页写入、起始地址恰好在 page 末尾、单次写满整页等。

## 结论

**Mock 必须以复现硬件的关键约束为目标，包括 page size、写入耗时、边界行为等。**