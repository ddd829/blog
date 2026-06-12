---
title: UART DMA 首字节丢失与 USB 32 字节截断排查
date: 2026-05-31T00:00:00.000Z
updated: 2026-05-31T00:00:00.000Z
tags:
  - subject/Cortex-M0
  - subject/CH340
  - type/case-study
  - topic/usb
  - topic/interrupt-latency
---


> 排查 Cortex-M0 上 UART DMA 接收的两个问题。一是高波特率下首字节丢失——115200 下字节时间只有 87 μs，临界区稍长就会在 ISR 启用 DMA 之前 overrun，9600 下 1 ms 的余量则没问题；解法是让 UART 中断不被典型临界区屏蔽，或干脆用循环 DMA 让接收脱离 ISR 时序。二是低概率 32 字节截断——稳定的 32 这个数字指向 USB Bulk 端点的 `wMaxPacketSize`，叠加 CH340 内部缓冲与缺 ZLP 的行为，相邻包之间的 UART 静默期偶尔会超过帧超时。

---

## 现象

一个跑在 Cortex-M0 上的项目，UART 接收在 9600 波特率下表现正常，但切到 115200 后，有较高概率丢失首字节。

## 原因

当前实现是第一个字节到达触发 UART 中断，中断里申请 buffer 并启动 DMA。也就是说，UART 中断必须在第二个字节到达之前完成 buffer 申请 + DMA 配置 + 使能，否则数据寄存器 RDR 会被覆盖（硬件上对应 Overrun Error）。如果首字节到达时主流程刚好处在关中断的临界区内，UART 中断被挂起，等临界区退出再处理时，首字节已经被后续字节冲掉了。

为什么 9600 几乎不出问题，而 115200 频繁出问题？算一下就清楚。

UART 按常见的 8-N-1 帧格式（1 起始位 + 8 数据位 + 1 停止位 = 10 bit/字节）：

- 9600 baud：10 / 9600 ≈ 1042 μs/byte
- 115200 baud：10 / 115200 ≈ 86.8 μs/byte

也就是说，从首字节进入 RDR 到下一字节到来，9600 下有大约 1 ms 的窗口，115200 下只有约 87 μs。典型嵌入式工程的临界区——Flash 操作、跨外设的多寄存器配置、嵌套保护——持续几十到上百微秒并不少见。87 μs 这个值正好踩在易出问题的边界上；1 ms 则给到了非常充裕的余量，绝大多数合理时长的临界区都容纳得下。

## 几种解决方向

**方案一：分级临界区**

提供两套临界区：传统的全关中断用于真正需要原子性的场景；另一套关除 UART 外的所有中断用于需要保留 UART 实时响应的场景。

理想情况下这应该用优先级阈值屏蔽来实现——Cortex-M3 及以上有 [BASEPRI](https://developer.arm.com/documentation/dui0552/a/the-cortex-m3-processor/programmers-model/core-registers) 寄存器，可以"只屏蔽优先级低于某阈值的中断"，UART 中断放进 BASEPRI 不屏蔽的范围就好。但 Cortex-M0 实现的是 ARMv6-M，[只有 PRIMASK](https://developer.arm.com/documentation/dui0497/a/cortex-m0-peripherals/system-control-block/interrupt-control-and-state-register)，要么全开要么全关，没有原生的阈值机制，只能手动操作 NVIC 的 ISER/ICER 来做选择性 mask。嵌套临界区、ISR 中再次进出临界区、关中断期间 NVIC 状态的保存/恢复都需要小心，否则容易引入更隐蔽的问题。

**方案二：循环 DMA + Idle Line 触发**

UART 持续运行在 Circular DMA 模式，DMA 通道不停搬运，每 ms 轮询 buffer 来判断是否有新数据，进而及时将数据拷贝出去。

这条路最干净，根本上规避了中断响应来不及的问题，因为 DMA 在数据搬运上完全不依赖 CPU。代价是 DMA 通道数。部分入门级 MCU 上 DMA 通道有限，多个通讯口子并存时不一定排得开。

## 一个未消除的低概率现象：32 字节截断

不论方案一二，进一步测试都发现一个极低概率现象：长帧偶尔会在第 32 字节处被截断。

错误模式高度一致——总是 32 字节。如果是判帧机制本身的概率性失效（比如硬件计时器抖动、中断丢失），截断点应当随机分布。这么稳定的 32，必然对应着某个真实存在的 32 字节边界。

回想起之前调试 USB 串口时遇到过的32 字节整倍数数据发不出去问题，这指向了 USB 协议的一个参数：`wMaxPacketSize`。

根据 [USB 2.0 Specification 第 5.8.3 节](https://www.usb.org/document-library/usb-20-specification)，Full-Speed Bulk 端点的 `wMaxPacketSize` 只能是 8、16、32 或 64 之一（USB-Serial 转换器普遍走 Bulk 端点）。我使用的上位机连接的 USB-Serial 转换器协商出 32 字节。

这里值得展开一下：USB-Serial 转换器有不同的芯片实现，常见的 FTDI（[Future Technology Devices International](https://ftdichip.com/)，一家苏格兰公司，FT232/FT2232 等 USB-Serial 芯片的老牌厂商）和 CP210x 协商出来通常是 64 字节，而 [CH340/CH341](https://www.wch-ic.com/products/CH340.html) 系列协商出来恰好是 32 字节。换言之，32 字节这个特征已经把芯片范围缩得相当窄。

## 可能的具体诱因

USB 是基于 1 ms 帧调度的协议。Full-Speed 上 SOF（Start of Frame）每 1 ms 发送一次，把总线时间切片。每个 `wMaxPacketSize` 大小的数据需要等到主机发起一次 IN/OUT 事务才能传输。Bulk 传输优先级最低，遵循"带宽可用时执行"原则——理论上一帧可以塞下多个 Bulk 包（32 字节 payload 在 12 Mbps 上传输不过 ~21 μs），但实际能不能塞下取决于等时/中断传输的占用、主机控制器对 Bulk 队列的调度，以及主机端 USB 驱动到用户态的数据通路是否被及时调度。

FTDI 的 [AN232B-04](https://ftdichip.com/wp-content/uploads/2020/08/AN232B-04_DataLatencyFlow.pdf) 应用笔记里明确指出：

> USB does not transfer data using interrupts. It uses a scheduled system and as a result, there can be periods when the USB request does not get scheduled and, if handshaking is not used, data loss will occur.

> For a USB device, data transfer is done in packets. If data is to be sent from the PC, then a packet of data is built up by the device driver and sent to the USB scheduler. This scheduler puts the request onto the list of tasks for the USB host controller to perform. This will typically take at least 1 millisecond to execute because it will not pick up the new request until the next 'USB Frame' (the frame period is 1 millisecond).

因此，在 OS 用户态进程被抢占、驱动线程让出 CPU、或 USB 主机控制器队列被高优先级设备占据的瞬间，确实存在 Bulk 传输被推迟数十毫秒的可能。

把视角进一步收窄到具体芯片——CH340 系列在这件事上还有两个值得注意的硬件行为，都被 Linux 内核 `ch341.c` 驱动源码及相关 commit 历史明确记载：

第一，CH340A 在 OUT 方向（主机 → CH340 → UART）默认会在内部缓冲数据直到收满 32 字节才向 UART 转发，除非驱动主动设置某个寄存器的 bit 7 来关闭这个行为。源码注释：

> CH341A buffers data until a full endpoint-size packet (32 bytes) has been received unless bit 7 is set. ([linux/drivers/usb/serial/ch341.c](https://github.com/torvalds/linux/blob/master/drivers/usb/serial/ch341.c))

第二，CH340 系列不会主动发 ZLP。Linux 内核 2021 年的一次 commit 把 ch341 driver 的 bulk-in 缓冲改回端点大小，理由是 ["These devices do not appear to send a zero-length packet when the transfer size is a multiple of the bulk-endpoint max-packet size."](https://lkml.iu.edu/hypermail/linux/kernel/2108.3/00472.html) 而 USB 规范规定，Bulk 传输结束的标志之一就是出现一个长度小于 `wMaxPacketSize` 的短包；如果一次传输恰好是 `wMaxPacketSize` 的整数倍，发送端必须额外发一个 ZLP 来显式告知接收端"传输结束"，否则接收端会持续等待。这就是之前32 字节整倍数发不出去的根源（[Argon Blue 的这篇博客](https://argon.blue/blog/programming/2023/12/16/usb-zlp/)对 ZLP 在 CDC 中的角色描述得很清楚，虽然 CH340 不走 CDC，但 ZLP 机制是共通的）。

把这几条线索叠起来，32 字节截断的更完整解释是：

数据从上位机 App → USB Driver → CH340 → UART → 设备。芯片以 32 字节为最小调度单元在 USB 与 UART 间转发；正常情况下若干个 32 字节包紧密相连，UART 端看起来是连续的字节流。但当主机系统负载、驱动调度、或者 ZLP 行为缺失带来的等待，使得两个相邻 32 字节包之间的 UART 静默期超过设备侧的字符间帧超时，UART 接收端就判定当前帧结束，把已经收到的 32 字节抛给上层。多个因素叠加，恰好对应到 32 字节这个稳定的截断边界。

需要承认，这条解释链不是单一因果，更像是一个具备这些条件就有概率出现的复合现象。低概率也正是 USB 调度抖动 + 硬件缓冲 + 主机负载的偶发交叠所致。

## 验证与解决方向

短期排查：

- 换一台 `wMaxPacketSize` 非 32 字节的主机做对照，看截断频率是否消失
- 增大字符间帧超时做对比，逼近真实调度抖动的上限

长期解法：

- 协议层不要单纯依赖字符间超时来判帧。更稳健的做法是 长度前缀 + CRC，或者 SLIP 风格的 framing。这样即使 USB 端引入了几十毫秒抖动，也能从字节流正确恢复出帧边界
- 如果产品形态允许，避免在传输链路上引入有已知缺陷的 USB-Serial 芯片

---

## 参考资料

- [USB 2.0 Specification](https://www.usb.org/document-library/usb-20-specification), Section 5.8.3 _Bulk Transfer Packet Size Constraints_
- [FTDI Application Note AN232B-04](https://ftdichip.com/wp-content/uploads/2020/08/AN232B-04_DataLatencyFlow.pdf), _Data Throughput, Latency and Handshaking Processes between Hardware and a Software Driver_
- [USB in a NutShell — Chapter 4: Endpoint Types](https://www.beyondlogic.org/usbnutshell/usb4.shtml)
- [Argon Blue: Much ado about nothing: USB zero-length packets](https://argon.blue/blog/programming/2023/12/16/usb-zlp/)
- [ARM Cortex-M0 Devices Generic User Guide](https://developer.arm.com/documentation/dui0497/a/), 特别是 PRIMASK 与 NVIC 章节
- [linux/drivers/usb/serial/ch341.c](https://github.com/torvalds/linux/blob/master/drivers/usb/serial/ch341.c) 中关于 CH341A 32 字节缓冲行为的注释
- ["USB: serial: ch341: fix character loss at high transfer rates" 的 revert commit log](https://lkml.iu.edu/hypermail/linux/kernel/2108.3/00472.html)，明确记录了 CH341 不发 ZLP 的行为
