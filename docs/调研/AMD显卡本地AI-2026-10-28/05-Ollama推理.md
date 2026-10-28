# 05：Ollama 的 AMD 支持

- 核验日期：2026-10-28（时区 Asia/Shanghai）
- 性质：网页资料调研，本轮无硬件实测，未安装或运行 Ollama。
- Ollama 版本语境：官方文档页 dateModified 2026-10-27；GitHub 仓库最新正式 release 为 v0.40.12（2026-10-27）。历史对照取 v0.12.6（2025-10-15）。

## 范围与直接结论

只查 Ollama 官方（docs.ollama.com 与 github.com/ollama/ollama）对 AMD 显卡的型号名单、Windows/Linux 路线、Vulkan 入口及成熟度。**不由 llama.cpp 的支持情况推断 Ollama 官方安装包一定支持**（Ollama 打包的是自己的后端组合，Vulkan 章节变量名 GGML_VK_* 只是沿用 llama.cpp 系命名）。

直接结论：

1. **官方入口已迁移且改名**：起点 URL `github.com/ollama/ollama/blob/main/docs/gpu.md` 本轮实测返回 **HTTP 404**。该文件曾在 2025-10-28 的提交 6d02a43（"docs: rename to mdx to setup docs site"）中改名——但此提交只说明改名历史，**不能作为当前正文的固定提交**：仓库 `docs/gpu.mdx` 在 main 上是浮动入口，本轮未固定其当前提交。`docs.ollama.com/gpu` 有效，本轮比对两者正文一致。最终官方页记为 https://docs.ollama.com/gpu 。
2. **Linux 官方 ROCm 名单比 Windows 宽一截**：Linux 要求 ROCm v7 驱动，名单含 RX 9070/9060 系、7900/7800/7700/7600 系、6950/6900/6800 系；Windows 要求 "AMD ROCm v7 / HIP7-capable driver stack"，名单只到 7900/7800/7700/7600 系和 W 系专业卡，**没有 RDNA2（6000 系）和 RDNA4（9000 系）**，官方在 Windows 页面另给 RDNA2 一条 Vulkan 兜底说明。
3. **当前文档写明 Vulkan 默认启用已安装的后端，但"默认启用"不等于稳定级别声明**：v0.12.6（2025-10）release note 写 "Experimental support for Vulkan…when you build locally from source…In a future release, Vulkan support will be included in the binary release as well"；当前文档已写 "Vulkan is enabled by default when the backend is installed"。现有证据只能建立"当前文档默认启用"这一点；v0.12.6 的"实验"标签何时撤销、是否对全部 AMD 卡验证过，本轮均未查到，且官方同时保留 iGPU 不稳、VRAM 上报需 root/capability 等限制条款。
4. **RX 6600 在两份官方 ROCm 名单里都是"未列名"**：当前 Windows ROCm 名单未列名（本轮未实测这张卡在当前版本的任何表现）；已见历史社区记录（issue #4464，2024 年，Windows + ZLUDA：0.1.32 可用、0.1.33-0.1.38 报 0xc000001d；这是 ZLUDA 路径，不代表原生 ROCm 路径的表现）；官方对名单外 AMD 卡提供的补充入口是 Vulkan，但该卡当前表现同样未实测。Linux 方面，该 issue 标题声称 "gfx override works on linux"，但正文没有 Linux 运行环境、日志或应用版本佐证，本轮未核实；官方文档另有 Linux 下可用 HSA_OVERRIDE_GFX_VERSION 试驗近似 target 的说明（官方原文用词 "experiment"，与该个案证据强度不同）。

## 典型 RX 6000/7000/9000 逐卡对照表（依据 L05-S01/S02，均为当前 main 文档）

| 型号                            | gfx          | Linux ROCm 官方名单                     | Windows ROCm 官方名单    | 备注                                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ------------ | --------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RX 6600                         | gfx1032      | 未列名                                  | 未列名                   | issue #4464（2024 历史社区记录）仅正文确认了 Windows + ZLUDA 的版本与报错（0.1.32 可用、0.1.33-0.1.38 报 0xc000001d）；其标题声称 Linux gfx override 可用，但缺运行环境与日志，本轮未核实（L05-S06）；gfx1032 不在官方 "known supported LLVM targets" 表（表中 RDNA2 仅 gfx1030）；本轮未实测该卡当前表现 |
| RX 6800 / 6800 XT               | gfx1030      | 列名（`6800 XT` `6800`）                | 未列名                   | Windows 官方文档明确点名 "RX 6800-class cards, may not expose ROCm v7 on current Windows AMD drivers"，推荐 Vulkan 兜底（L05-S03）                                                                                                                                                                        |
| RX 6900 XT / 6900 XTX / 6950 XT | gfx1030      | 列名（`6950 XT` `6900 XTX` `6900XT`）   | 未列名                   | v0.12.6 时代 Windows 曾列 6000 系（L05-S09），当前版本已不再列                                                                                                                                                                                                                                            |
| RX 7600 / 7600 XT               | gfx1102      | 列名（`7600 XT` `7600`）                | 列名（`7600 XT` `7600`） | gfx1102 在 LLVM targets 表的示例卡就是 RX 7600                                                                                                                                                                                                                                                            |
| RX 7800 XT                      | gfx1101      | 列名                                    | 列名                     | —                                                                                                                                                                                                                                                                                                         |
| RX 7900 / XTX / GRE             | gfx1100      | 列名（`7900 XTX` `7900 XT` `7900 GRE`） | 列名                     | gfx1100 示例卡是 PRO W7900（同架构）                                                                                                                                                                                                                                                                      |
| RX 9070 / 9070 XT / 9070 GRE    | gfx1200/1201 | 列名（`9070 XT` `9070 GRE` `9070`）     | 未列名                   | gfx1200/gfx1201 出现在 Linux LLVM targets 表；Windows ROCm 路线未列，Vulkan 是 Windows 上的补充入口                                                                                                                                                                                                       |
| RX 9060 / 9060 XT / 9060 XT LP  | gfx1200      | 列名                                    | 未列名                   | Radeon AI PRO R9700/R9600D 也仅在 Linux 名单                                                                                                                                                                                                                                                              |

注："列名"仅指"出现在该版本官方支持名单"，不代表全部模型/量化格式在该卡上被验证；"未列名"按共同约定只写"未列入该版本的官方支持名单"，不写"官方不支持"或"不可用"。

## 系统要求与安装入口（仅记录原文，未执行）

| 项                 | 官方原文要点                                                                                                                                                                              | 来源             |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Windows 系统要求   | Windows 10 22H2 或更新（Home/Pro）；"AMD ROCm v7 / HIP7-capable driver stack for ROCm acceleration, **or** a Vulkan-capable AMD Radeon driver for Vulkan acceleration"                    | L05-S03          |
| Windows RDNA2 兜底 | "Some RDNA2 / Radeon RX 6000 systems, including RX 6800-class cards, may not expose ROCm v7 on current Windows AMD drivers. Vulkan is enabled by default and is the recommended fallback" | L05-S03          |
| Linux 驱动         | "Ollama requires the AMD ROCm v7 driver on Linux"，用 `amdgpu-install` 安装/升级；troubleshooting 补充 Ollama 自带 ROCm 7 Linux 库，遇到 ROCm 6.x 或更早内核驱动会初始化挂起超时回退 CPU  | L05-S01、L05-S08 |
| Linux 手动装       | 基础包 `ollama-linux-amd64.tar.zst`；"If you have an AMD GPU, also download and extract the additional ROCm package" `ollama-linux-amd64-rocm.tar.zst`                                    | L05-S04          |
| Windows 手动装     | `OllamaSetup.exe` 常规安装；独立 CLI 另有 `ollama-windows-amd64-rocm.zip`（AMD GPU）需解压到同目录                                                                                        | L05-S03          |
| Vulkan 选择/关闭   | `GGML_VK_VISIBLE_DEVICES` 选卡；`OLLAMA_VULKAN=0` 或 `GGML_VK_VISIBLE_DEVICES=-1` 关闭全部 Vulkan；Linux 需额外 Vulkan 组件、可能要把 `ollama` 用户加进 `render` 组                       | L05-S01          |
| Vulkan VRAM 上报   | 需要 root 或 `sudo setcap cap_perfmon+ep /usr/local/bin/ollama`，否则调度器只能按模型近似大小做 best effort                                                                               | L05-S01          |
| ROCm 选卡          | `ROCR_VISIBLE_DEVICES`（多卡时优先用 Uuid），`rocminfo` 查看设备                                                                                                                          | L05-S01          |
| release 资产       | v0.40.12 提供 `ollama-linux-amd64-rocm.tar.zst` 与 `ollama-windows-amd64-rocm.zip`；资产列表中无单独的 Vulkan 安装包（此为列表观察，非官方逐字声明）                                      | L05-S07          |

## 容易误读的点

1. **HSA_OVERRIDE_GFX_VERSION 不是万能解法，且官方明确限定 Linux**。原文小节标题就是 "Overrides on Linux"，语境是 "Ollama leverages the AMD ROCm library, which does not support all AMD GPUs. In some cases you can force the system to try to use a similar LLVM target that is close"——即"试运行近似目标"，且 "you can experiment using the list of supported types below"。issue #3107 显示 Windows 上设了该变量仍报 `rocBLAS error … for GPU arch : gfx1032`（社区案例）；RX 6600（gfx1032）本就不在官方 LLVM targets 表里。
2. **Windows 名单 ≠ Linux 名单**。同一份文档两张表：Linux 有 6000/9000 系与 Ryzen AI、Instinct，Windows 没有。看到"Ollama 支持 RX 6800"必须追问是哪个系统（v0.12.6 时代 Windows 确实列过 6000 系，后来版本收窄了，两版出处都保留在 L05-S01/S09）。
3. **Vulkan"默认启用"不等于"和 ROCm 同等成熟"**。它最初的定位是 "Additional AMD GPU support is provided by the Vulkan Library"——补名单外的卡；官方文档自己写了 iGPU 不稳要绕开、VRAM 数据可能拿不到。别把 Vulkan 当成 6000 系在 Windows 上的"官方同等支持"；"默认启用"也不等于全部 AMD 卡测试通过。
4. **不在名单 ≠ 完全跑不了**：可以 Vulkan（默认开）、Linux 下 HSA_OVERRIDE 实验、或老版本（v0.12.6 的 Windows ROCm 名单含 6000 系）。这些都是有明确限制的路线，不是官方同等承诺。
5. **驱动是 ROCm 7 一刀切**：troubleshooting 写明系统装 ROCm 6.x 或更早内核驱动时 GPU 初始化会挂起超时、回退 CPU。Linux 用户先看内核驱动版本再看显卡名单。

## 来源

- L05-S01 Hardware support（官方文档站）：https://docs.ollama.com/gpu （dateModified 2026-10-27）
- L05-S02 ollama/ollama 仓库 `docs/gpu.mdx`（main，浮动入口，本轮未固定当前提交；提交 6d02a43a75cd3364b3c230e9070f1413e60f0d02 仅为 2025-10-28 的改名历史，不作为当前正文的固定提交）：https://github.com/ollama/ollama/blob/main/docs/gpu.mdx
- L05-S03 Windows 安装文档：https://docs.ollama.com/windows
- L05-S04 Linux 安装文档：https://docs.ollama.com/linux
- L05-S05 v0.12.6 release（2025-10-15，Vulkan 实验说明）：https://github.com/ollama/ollama/releases/tag/v0.12.6
- L05-S06 issue #4464（RX6600，2024 历史社区记录；正文仅含 Windows + ZLUDA 版本与报错，标题声称的 Linux 可用缺佐证）：https://github.com/ollama/ollama/issues/4464
- L05-S07 v0.40.12 release 资产列表（2026-10-27）：https://github.com/ollama/ollama/releases/tag/v0.40.12
- L05-S08 Troubleshooting：https://docs.ollama.com/troubleshooting
- L05-S09 ollama/ollama 仓库 `docs/gpu.md`（v0.12.6 tag，固定版本，Windows ROCm v6.2 名单含 6000 系）：https://github.com/ollama/ollama/blob/v0.12.6/docs/gpu.md

## 拿不准 / 未核实

- 当前官方包捆绑的具体 ROCm 小版本号（如 7.x.y）：文档只写 "ROCm v7 / HIP7"，troubleshooting 写 "ROCm 7 linux libraries"，未给小版本，未核实。
- Vulkan 后端在 Ollama 官方二进制里默认开启是从哪个版本开始的：只找到 v0.12.6 的"实验、需自行构建"与当前文档"默认开启"两个时间点，中间转折版本未核实。
- RX 9060 XT / AI PRO R9600D 等 RDNA4 卡在 Windows 上 Vulkan 路线的实际表现：官方名单外，无官方声明，未核实。
