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

> 记录一下今天遇到的一个 bug，由于软件 eeprom 配置错误导致写回绕，数据丢失 + 数据覆盖，虽然定位到问题后解决比较简单，但搜集线索和排查耗费了较多时间。

## 现象

设备从远端持续下载数据过程中始终失败，预期应该持续接收直到传输完成。

## 线索

通过与触发问题的同事交流以及自己调试排查，收集到几条线索：

1. 问题只在带真实 EEPROM/Flash 的硬件上复现，在 mock 掉 EEPROM 和 Flash 的纯软件仿真环境里，下载流程完全正常。
2. 出问题的数据都集中在 EEPROM 地址的起始区域，几份数据的存储地址很近。
3. 问题点并不集中于传输，设备启动阶段也观察到异常，共同点是两者都依赖 EEPROM 里的同一片区域。
4. 触发点在传输，不传输则遇不到，比如正常启动时不会遇到该问题。
5. 仅一款设备存在问题，其它型号正常。
6. 连续操作下，第一次下载前数据正常；第一次下载失败后读出"异常 A"；第二次下载失败后读出"异常 B"。异常本身有确定的模式，不是随机扰动。

## 推测

基于上述几条线索，基本可以确定

- 代码逻辑无问题：因为 mock 的 eeprom 和 flash 并不存在问题。而且若程序有问题，如何解释问题不集中在一处呢？
- 问题与 eeprom 有关，但与 eeprom 硬件故障无关：异常点处数据集中，异常模式稳定，若 eeprom 硬件故障，则不会保持稳定的异常模式。
- 问题与数据传输时，与 eeprom 有关的数据项具有强关联。因为触发点很确定。

## 验证

事后回顾时，发现当时解决问题时的思路不够清晰，但是也不算糊涂。

先去确认了当前工程的 eeprom 配置，发现工程配置的芯片型号是 XXXX，查阅的对应的 datasheet：

> **Page Write**
> The Page Write mode allows up to 256 bytes to be written in a single Write cycle, provided that they are all located in the same page in the memory: that is, the most significant memory address bits, b16–b8, are the same. If more bytes are sent than will fit up to the end of the page, a "roll-over" occurs, i.e. the bytes exceeding the page end are written on the same page, from location 0.

发现它的 page size 大小是 256 bytes，于是请硬件同事确认该 eeprom 容量是否真的是 1Mbit（对应 256 bytes 的 page size），发现并不是，而是 500kbit，那么实际的 page size 就应该是 128 bytes。

同时 datasheet 中提到了一个重要的机制 “roll-over”。但是在事后分析前，先简单将配置调整为 128 bytes 的 page size，尝试复现问题来确认解决是否有效，果然发现问题已经消失。

## 分析

当工程的 page size 配置为 256 bytes，实际物理 eeprom 的 page size 为 128 bytes 时，就会导致当写入的数据在 256 bytes 以内，但又恰好超过了 eeprom 中以 128 bytes 为倍数的物理边界时，就会导致驱动程序认为当前写入安全，未超出 256 bytes 的上界，不需要拆包直接写，但是实际硬件并非如此，没有被拆包的就会发生上述 “roll-over” 现象。导致 eeprom 前面已经写入的数据被覆盖掉，进而设备业务逻辑出现异常。

但是这是事后分析猜得出的，实际上确实是思路不够清晰。本应该首先检查传输阶段哪些数据会向 eeprom 中写入，写入地址是多少，写入字节数是多少，是否会撞到特殊点处，比如 2 的幂次倍数据，数据是否跨页等。但是误打误撞从配置角度切入，发现了问题症结，然后从现象反推原因。

后来为了确认，再次复现复盘了一下，发现实际写入过程与推理一致，传输过程中有几项需要写入 eeprom 的数据比较大块（130 bytes），恰好就踩到了 eeprom 128 bytes 的物理边界上，且由于写入地址非常接近 128 bytes 边界，所以回绕后的数据快追上数据头了，也就导致不仅自身传输业务受到了影响，在写入地址前的所有业务都受到了影响，但比较容易观测的只有设备启动时的异常。

## 修复

除了修改掉软件配置外，同时新增两个防御性措施：

1. **Mock 行为对齐硬件**：mock 的实现也按真实的 page size 模拟 wrap-around 行为，否则会导致 mock 反而掩盖了问题。
2. **在 mock 程序上新增几组 unit test**：跨页写入、起始地址恰好在 page 末尾、单次写满整页等。

## 结论

1. 越是接近答案，越要保持头脑清晰
2. Mock 须以复现硬件的关键约束为目标，包括 page size、写入耗时、边界行为等。