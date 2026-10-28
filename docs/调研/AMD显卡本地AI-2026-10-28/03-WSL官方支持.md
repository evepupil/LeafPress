# 03：WSL 2 官方支持（AMD ROCm on WSL / ROCDXG / roc4wsl）

- 核验日期：2026-10-28（时区 Asia/Shanghai）
- 性质：网页资料调研，本轮无硬件实测；未在本机运行 WSL、未安装任何驱动或包，所有命令仅为页面原文照录。
- 边界：本文只讲 **WSL 2 路线**（Windows 内跑 Ubuntu 的 GPU 计算），与原生 Windows 的 Python 轮子（见 02 路）严格分开；也不覆盖 ZLUDA/DirectML 等社区方案。

## 范围与直接结论

从起点页 https://rocm.docs.amd.com/projects/radeon/en/latest/docs/compatibility.html 进入（该域名现 302 跳转到 radeon-ryzen 项目，两处正文一致）。当前官方 WSL 支持的权威出处有三层：

1. **现行方案 ROCDXG**：《WSL How to guide - Use ROCm on Radeon》latest（覆盖到 ROCm 7.2.1），AMD 用 Adrenalin 26.2.2 + ROCm 7.2.1 引入对开源 ROCDXG（librocdxg）的"production support"，取代旧 roc4wsl 打包模型（L03-S02）。
2. **旧方案矩阵**：ROCm 7.2 的 "WSL support matrices"（docs-7.2 固定版本），是旧 roc4wsl 路线的一份固定版本矩阵，逐卡列出 WSL GPU 名单与框架条目（L03-S03）。逐卡的 WSL GPU 名单在 librocdxg 仓库矩阵（下条第 3 点）同样存在，两表口径并不相同。
3. **仓库矩阵**：GitHub ROCm/librocdxg README 的 "WSL Compatibility Matrix"，给出 librocdxg 版本 ↔ ROCm 版本 ↔ GPU 名单（L03-S05）。

直接结论：

- **现行 WSL 路线的入口组合是：Windows 侧装 AMD Software: Adrenalin Edition 26.2.2 for WSL2 驱动 + WSL2 内 Ubuntu 24.04 或 22.04 + librocdxg**；不再要求装 Radeon Software for Linux 的 RSL 包，也"不要求指定/匹配 ROCm 驱动版本"（L03-S02）。
- **WSL 的 GPU 名单比原生 Windows PyTorch 矩阵宽，但两份 WSL 名单要分列**：docs-7.2 矩阵（L03-S03）包含 RX 7900 XT/GRE、PRO W7800/W7800 48GB、RX 7800 XT、RX 9070 GRE，以及该表独有的 RX 7700/7700 XT、AI PRO R9600D；librocdxg 1.2.0+7.2.x 行（L03-S05）包含上述前几款，另含 Ryzen AI Max 系，但**不含** RX 7700/7700 XT、AI PRO R9600D。这些卡均不在 7.2.1 原生 Windows PyTorch 矩阵中（对照 L03-S04）。两表是不同出处的名单，不能合并成交集或并集后引用。**RX 6000 系（RDNA2）在所有已核的 WSL 名单中均未出现**，只能写"未列入官方支持名单"。
- **ROCm 7.2 旧矩阵（旧 roc4wsl 路线，配套 Adrenalin 26.1.1）是多框架路线**：PyTorch 2.9.1 / ONNX Runtime 1.23.1 / TensorFlow 2.20 / Triton 3.5.1 都有"Official production support"条目（L03-S03），比原生 Windows 只有 PyTorch 宽。这些框架版本条目**只属于 docs-7.2 固定矩阵**；现行 ROCDXG（Adrenalin 26.2.2 + ROCm 7.2.1）路线的框架版本组合本轮未核实，latest 指南仅写 "Non-WSL framework guides can be used to install the frameworks"（L03-S02），未给 WSL 框架版本矩阵。无论哪条路线，**MIGraphX 与 mGPU 配置明确写"WSL 目前不支持"**，JAX 明确写"未在 WSL 启用或验证"（L03-S02/S03）。
- 监控能力按路线分述：**旧 ROCm 7.2 限制页写 "Due to WSL architectural limitations for native Linux User Kernel Interface (UKI), amd-smi is not supported"，并逐项列出 UKI 不支持的活动计算进程、GPU 利用率、可修改状态特性**；ROCm-profiler 与 Debugger 也 "not currently supported"（L03-S06）。**ROCDXG/librocdxg 仓库侧则写 "AMD-SMI currently provides a limited set of features on WSL2"**，即新路线下 amd-smi 提供有限功能，但显存等具体计数器本轮未核实（L03-S05）。两处口径不同，不能合并成“所有 WSL 路线都不能监控显存”；旧页未列显存读数一项，不应由“无利用率/无进程列表”推断无显存读数，也不排除其他工具的监控可能性。

## WSL 名单与版本组合对照表

### A. 现行方案（ROCDXG，Adrenalin 26.2.2 + ROCm 7.2.1，latest 文档）

| 项目         | 官方内容                                                                                                               | 来源             |
| ------------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------- |
| Windows 驱动 | AMD Software: Adrenalin Edition™ 26.2.2 for WSL2（26.2.2 驱动本身兼容 Windows 11 21H2+ / Windows 10 64-bit 21H2+）     | L03-S02、L03-S07 |
| WSL 发行版   | "Ubuntu 24.04 and 22.04 are the supported distros on WSL"                                                              | L03-S02          |
| 安装路径     | 装 Adrenalin 驱动 → 装 WSL → 按 ROCm/librocdxg GitHub Quickstart → 用 Radeon 框架 How-To 装框架                        | L03-S02          |
| 取代关系     | ROCDXG 经 Microsoft DXCore (/dev/dxg) 通信，"replaces the legacy roc4wsl packaging model"；不需要 RSL 包，不需版本配对 | L03-S02          |
| Ryzen        | 首次支持 Ryzen Strix / Strix Halo SKU（对比旧 WSL 方案）                                                               | L03-S02          |

### B. ROCm 7.2 WSL 兼容矩阵（旧 roc4wsl 路线，docs-7.2 固定版本页）

| 项目               | 官方内容                                                                                                                                                                                                                                                  |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OS                 | Ubuntu 24.04.2 Desktop with HWE（WSL2-Linux-Kernel 5.15）= Yes；Ubuntu 22.04 / 22.04 LTS（WSL2-Linux-Kernel 5.15）= Yes                                                                                                                                   |
| 配套软件           | ROCm 7.2 + Radeon Software for Linux 22.04/24.04/25.10.1 for WSL + **Radeon Software for Windows: Adrenalin 26.1.1 for WSL2**                                                                                                                             |
| 桌面/工作站 GPU    | RX 9070、RX 9070 XT、RX 9070 GRE、AI PRO R9700、RX 9060、RX 9060 XT、RX 7900 XTX、RX 7900 XT、RX 7900 GRE、PRO W7900、PRO W7900 Dual Slot、PRO W7800、PRO W7800 48GB、RX 7800 XT、PRO W7700、RX 7700、RX 7700 XT、AI PRO R9600D（另有一处重复列 RX 9060） |
| PyTorch            | 2.9.1 + ROCm 7.2 = Official production support；2.9/Nightly 未被 AMD 广泛测试；**2.7/Stable "Not supported for Radeon 7000 series"**                                                                                                                      |
| 其他框架           | ONNX Runtime 1.23.1、TensorFlow 2.20、Triton 3.5.1 均 7.2 官方生产支持；数据类型 FP32/FP16/混合精度/INT8（INT8 走 MIGraphX）                                                                                                                              |
| 旧安装命令（照录） | `amdgpu-install -y --usecase=wsl,rocm --no-dkms`（先装 amdgpu-install_7.2.70200-1 deb，Ubuntu noble/jammy 二选一）                                                                                                                                        |

来源：L03-S03、L03-S08。

### C. GitHub ROCm/librocdxg 的 WSL Compatibility Matrix（develop 分支 README，固定提交 a2baffea，2026-08-29；仓库已标 deprecated，源码迁往 ROCm/rocm-systems）

| librocdxg 版本 | ROCm 版本 | Windows 驱动                                         | GPU 名单                                                                                                                                                                                                                                                                            |
| -------------- | --------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.2.1          | 7.14      | 从 AMD Driver 页直接下载 x86 驱动                    | 含此前所有版本 ASIC，另加 Ryzen AI 5 PRO 435、AI 7 445、AI 5 435、AI 5 430、AI MAX+ PRO 495、AI MAX PRO 490、AI MAX PRO 485、Ryzen AI Halo                                                                                                                                          |
| 1.2.0          | 7.13      | 同上                                                 | 含此前所有 ASIC，另加 Ryzen AI 7 PRO 360、AI 7 PRO 350、AI 5 PRO 340、AI 7 350、AI 7 345、AI 5 340、AI 5 330                                                                                                                                                                        |
| 1.2.0          | 7.2.x     | 同上                                                 | Radeon：RX 9070、RX 9070 XT、RX 9070 GRE、AI PRO R9700、RX 9060、RX 9060 XT、RX 7900 XTX、RX 7900 XT、RX 7900 GRE、PRO W7900、PRO W7900 Dual Slot、PRO W7800、PRO W7800 48GB、RX 7800 XT、PRO W7700；Ryzen：AI Max+ 395、AI Max 390、AI Max 385、AI 9 HX 375、AI 9 HX 370、AI 9 365 |
| 兼容 OS        | ——        | Windows 11；Ubuntu 26.04 LTS / 24.04 LTS / 22.04 LTS | ——                                                                                                                                                                                                                                                                                  |

来源：L03-S05。注意该表 7.2.x 行**不含 RX 7700 / 7700 XT / AI PRO R9600D**，与 docs-7.2 矩阵（B 表）不完全一致；保留两处原文，按各自适用版本理解。

### D. 与 Linux/原生 Windows 的差异速查

| 能力                | Linux（7.2.1 矩阵）              | 原生 Windows（02 路） | WSL                                                                                                          |
| ------------------- | -------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| 框架                | PyTorch/TF/ONNX/Triton/JAX(推理) | 仅 PyTorch            | PyTorch/TF/ONNX/Triton；JAX 未启用验证                                                                       |
| MIGraphX / mGPU     | 支持                             | Not available         | **明确不支持**                                                                                               |
| amd-smi 监控        | 支持                             | ——                    | 旧 7.2 限制页：不支持（明确列无活动计算进程/GPU 利用率/可修改状态）；ROCDXG 仓库：仅有限功能，显存计数器未核 |
| Profiler / Debugger | 支持                             | Debugger 仅 RDNA4     | **不支持**                                                                                                   |
| RX 6000 系          | 未列入 7.2.1 矩阵                | 未列入                | 未列入                                                                                                       |

（Linux/Windows 列依据 L03-S04、L03-S06 与 02 路结论交叉，WSL 列见 L03-S02/S03/S05/S06。WSL "框架"行按 docs-7.2 矩阵（旧 roc4wsl 路线）填写；现行 ROCDXG 路线的框架组合未核。）

## 安装入口（仅记录原文，未执行）

1. **现行 ROCDXG 路线**（L03-S02）：① 安装 AMD Software: Adrenalin Edition™ 26.2.2 for WSL2 驱动；② 安装 WSL（微软文档）；③ 打开 ROCm/librocdxg GitHub 按 Quickstart 安装；④ 用 Radeon 框架 How-To 指南在 WSL 装框架。
2. **librocdxg Quickstart 要点**（L03-S05）：装 ROCm 包 → 源码编译（需 CMake ≥3.15、GCC ≥11.4、Windows SDK）或装 rocdxg-roct deb → `rocminfo` 验证 GPU 出现为 agent（示例输出 gfx1100 / Radeon RX 7900 XTX）；legacy ROCm 需 `export HSA_ENABLE_DXG_DETECTION=1`（注明 7.13 起该要求移除）。
3. **旧 roc4wsl 路线**（L03-S08，仍保留在 docs-7.2）：WSL 内 Ubuntu 22.04/24.04 装 amdgpu-install 7.2 deb，`amdgpu-install -y --usecase=wsl,rocm --no-dkms`，配套 Windows 驱动为 **Adrenalin 26.1.1 for WSL2**；装完重启。latest 文档注明想继续用旧实现"必须用 ROCm 7.2"（L03-S02）。

可直接核对的组合（验收项，分两条列出，**不得混搭**）：

- **旧 roc4wsl 矩阵组合**：AMD Radeon RX 7900 XTX（gfx1100）+ Windows + WSL2 Ubuntu 22.04 或 24.04.2（WSL2-Linux-Kernel 5.15）+ **Adrenalin 26.1.1 for WSL2** 驱动 + ROCm 7.2 + PyTorch 2.9.1（"Official production support"条目），出自 L03-S03/S08。
- **现行 ROCDXG 路线（仅已核对部分）**：Adrenalin **26.2.2 for WSL2** 驱动 + WSL2 Ubuntu 24.04 或 22.04 + librocdxg（配合 ROCm 7.2.1），GPU 范围按 librocdxg 矩阵 7.2.x 行（含 RX 7900 XTX），出自 L03-S02/S05。**该路线下 PyTorch 等框架的具体版本组合本轮未核实**（latest 指南只指引用 Radeon 框架 How-To 安装，未给 WSL 框架版本矩阵），不能把 7.2 矩阵的 PyTorch 2.9.1 条目直接套到 26.2.2 路线上。

两条都只保证官方声明的计算路径与各自页面所列版本，不含 MIGraphX、多卡，也不含旧路线下 amd-smi 监控（新路线 amd-smi 为有限功能，见监控结论），不保证所有模型/插件可用。

## 容易误读的点

1. **"Linux 支持"不能直接套到 WSL**：官方 WSL 是单独的矩阵与单独的 Windows 驱动版本（26.1.1 旧 / 26.2.2 新）。Linux 原生支持的 ROCm 6.x 老卡、RDNA2 等在已核 WSL 名单中均未出现；反向同理——WSL 名单里的 AI PRO R9600D 等不在原生 Windows PyTorch 矩阵中（L03-S03/S04/S05）。
2. **Adrenalin 26.2.2 驱动本身兼容一堆 RX 6000/5000 显卡**（L03-S07），这只是**显示驱动**兼容列表，不等于这些卡被 ROCm WSL 支持；ROCm WSL 名单要以 B/C 表为准。
3. **两套矩阵版本口径不同**：docs-7.2 WSL 矩阵对应旧 roc4wsl + Adrenalin 26.1.1；latest 文档对应 ROCDXG + 26.2.2。GPU 名单有两处不一致（RX 7700/7700 XT、AI PRO R9600D 只在 docs-7.2 矩阵；Ryzen AI Max 系只在 librocdxg 表），本页保留双方原文，不做合并。
4. **"WSL 支持多框架"的条目出自 7.2 旧矩阵**：该矩阵配套的是 Adrenalin 26.1.1 与 roc4wsl 安装方式，不是 26.2.2 新路线的验证结果。另外 JAX 未启用/验证（可能装不上或初始化失败），MIGraphX、mGPU 明确不支持；监控方面旧 7.2 页写 amd-smi 不支持（列明无利用率/进程/可改状态）而 ROCDXG 仓库写有限功能，两处口径不同，Profiler/Debugger 两处均写不支持；vLLM 在 WSL2 用 V2 model runner 可能因 pinned memory 默认关闭而报 `UVA is not available`（vLLM PR #41496 修复）（L03-S02/S05/S06）。
5. librocdxg 仓库已标 **deprecated**（源码迁到 ROCm/rocm-systems），1.2.1 行对应 ROCm 7.14——这属于 unified 文档体系（ROCm Core SDK 7.13.0 起文档统一），与 radeon-ryzen 文档的 7.2.1 不是同一发布口径，引用时需注明。
6. 官方 WSL 已知问题清单中包括"WSL2 下推理性能可能低于原生 Linux"，这是定性表述，本页不做任何速度量化结论。

## 来源

- L03-S01 Use ROCm on Radeon and Ryzen 总览（起点页）：https://rocm.docs.amd.com/projects/radeon/en/latest/docs/compatibility.html
- L03-S02 WSL How to guide - Use ROCm on Radeon（latest，ROCDXG）：https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/wsl/howto_wsl.html
- L03-S03 WSL support matrices by ROCm version（docs-7.2 固定版本）：https://rocm.docs.amd.com/projects/radeon-ryzen/en/docs-7.2/docs/compatibility/compatibilityrad/wsl/wsl_compatibility.html
- L03-S04 Windows support matrices by ROCm version（对照用）：https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/compatibility/compatibilityrad/windows/windows_compatibility.html
- L03-S05 ROCm/librocdxg README（develop@a2baffea，2026-08-29）：https://github.com/ROCm/librocdxg
- L03-S06 Radeon Limitations and recommended settings（7.2，WSL 节）：https://rocm.docs.amd.com/projects/radeon-ryzen/en/docs-7.2/docs/limitations/limitationsrad.html
- L03-S07 AMD Software: Adrenalin Edition 26.2.2 Release Notes（更新于 2026-02-26）：https://www.amd.com/en/resources/support-articles/release-notes/RN-RAD-WIN-26-2-2.html
- L03-S08 Install Radeon software for WSL with ROCm（docs-7.2）：https://rocm.docs.amd.com/projects/radeon-ryzen/en/docs-7.2/docs/install/installrad/wsl/install-radeon.html

## 拿不准 / 未核实

- ROCDXG 现行方案（26.2.2）下**逐卡的 GPU 支持矩阵**：latest 文档只链接 librocdxg 仓库矩阵（即 C 表），未在 radeon-ryzen 文档内单列；两表口径差异见"误读 3"。
- RX 6000 系（RDNA2）在 WSL 是否曾被更早 ROCm 版本（6.x）支持：需逐版本点 Version List 回滚核对，本轮未核，只能写"未列入本次核对的 WSL 名单"。
- Ubuntu 26.04 LTS（librocdxg README 所列）与 latest 安装指南只写 24.04/22.04 的矛盾：双方原文照录，未判定哪个是最新的权威口径。
- WSL 下 PyTorch 具体安装命令/轮子 URL：ROCDXG 指南直接指向"Radeon 框架 How-To"，本轮未逐页打开 PyTorch-on-WSL 安装页；**现行 ROCDXG（26.2.2 + 7.2.1）路线下 PyTorch/ONNX/TF/Triton 的版本组合亦未核实**，docs-7.2 的框架条目不能直接套用到该路线。
- WSL 是否支持 ROCm 官方 Docker 镜像：docs-7.2 矩阵只给 "See Docker Image Support Matrix" 链接，未展开；librocdxg README 给了容器启动 flag 示例但未给版本承诺，均不作为支持结论。
