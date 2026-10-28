# 04 · llama.cpp 上的 AMD 显卡本地大模型路线

核验日期：2026-10-28（时区 Asia/Shanghai）。本路只做资料核验，无任何硬件实测，无性能结论。

## 范围与直接结论

范围：llama.cpp（ggml-org）的 Vulkan 与 HIP/ROCm 两条 AMD GPU 路线、官方预编译产物、入口条件；不涉及 Ollama/vLLM/ComfyUI。仓库内容统一固定在 master 提交 `604cc430239c76ff636c443e3400bf552b750421`（2026-10-28）。

直接结论：

1. llama.cpp 对 AMD 消费卡有**两条互相独立**的 GPU 路线：Vulkan 后端（只要 Vulkan 驱动达标，完全不需要 ROCm）和 HIP 后端（把 CUDA 内核经 HIP 编译到指定 gfx 架构，需要 ROCm/HIP ≥ 6.1）。这解释了为什么"ROCm 官方支持名单没列这张卡"不能推出"跑不了大模型"：ROCm 名单管的是 AMD 官方 PyTorch/库的发行范围，而 llama.cpp 自己编译内核，HIP 侧由 `GPU_TARGETS`/`AMDGPU_TARGETS` 指定 gfx 目标，Vulkan 侧根本不看 gfx 型号、只看 Vulkan 能力位。[L04-C01/C02/C03/C07]
2. 官方 nightly 预编译产物覆盖 Windows/Linux 的 Vulkan 与 ROCm 10.0；Windows ROCm 包编译目标 gfx1010–gfx1201（RDNA1/2/3/3.5/4），Ubuntu ROCm 包另含 gfx908/90a/942/950（CDNA）。**Vega 消费卡（gfx900/906）与 Polaris（gfx8xx）不在任何官方 HIP 编译目标中**，对预编译 ROCm 包属"未列入"，但 Vulkan 入口对这些卡仍然开放（RX 580 有多方社区实证）。[L04-C08/C09/C10/C14]
3. 正式版本（如 v0.8.0，2026-10-28 打 tag）不在 GitHub Releases 发二进制，Releases 页只有 nightly；正式版走 llama-install.sh（见下节注意事项）/ 包管理器 / 源码编译。[L04-C18]

### 为什么 ROCm 官方名单未列名 ≠ 跑不了大模型

判断一张卡能否跑，至少要分开看三层条件：AMD 官方支持名单划定的是厂商声明的支持范围；具体应用（这里指 llama.cpp）自己声明的编译目标决定它为哪些 gfx 架构编出了代码；实际能否运行还取决于驱动提供的功能。llama.cpp 有两条入口：HIP 后端按 `GPU_TARGETS` 指定 gfx 目标编译，Vulkan 后端只探测 Vulkan 1.2、16-bit storage 这类能力位，不要求 PyTorch，也不要求完整 ROCm 安装。因此名单外的卡能否运行要逐项核对（编译目标是否覆盖、驱动功能是否达标），不能仅凭名单自动判为可用或不可用。[L04-C01/C03/C05/C07]

旧卡的实证举例：所见的 RX 580 2048SP（特定卡型，Linux，AMD 开源驱动）案例日志显示 `fp16: 0 | int dot: 0 | matrix cores: none`，即该案例中 Vulkan 后端以无 fp16/整数点积/矩阵核的方式运行；这只反映该卡型与驱动版本下的探测结果，不外推到所有 Polaris 卡在所有驱动下的功能。[L04-C10]

### 是否一定要装完整 ROCm

分三种情况：走 Vulkan（含官方 Vulkan 预编译包和源码构建）——完全不需要 ROCm，社区在 RX 580 上验证过“no ROCm/HIP anywhere in the stack”的纯 Vulkan 栈；走 Ubuntu ROCm 预编译包——包内已链接 ROCm 10.0，系统需有匹配运行时（官方 CI 本身就是用 pip wheel `rocm[libraries,devel]` 而非完整 ROCm 安装器构建的，说明“完整 ROCm 安装”并非唯一形态）；走 Windows ROCm 预编译包——zip 里只塞了 `ggml-hip.dll` 加三个 HIP 运行时 DLL，rocBLAS/hipBLASLt 内核靠外部 ROCm/TheRock SDK 提供，用户需另装 AMD 的 ROCm SDK（Adrenalin 驱动不含）。[L04-C04/C06/C11]

## 后端与型号对照表

| 显卡家族 / gfx                          | Vulkan 后端                                                   | HIP/ROCm 后端（官方预编译产物目标）                                                                                     | 证据                        |
| --------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| RX 5000（RDNA1，gfx1010/1011/1012）     | 后端通用，无型号白名单；RX 5700 XT 官方 Vulkan 包实跑（社区） | gfx1010/1011/1012 在 win-rocm 与 ubuntu-rocm 目标内                                                                     | [L04-S04][L04-S12]          |
| RX 6000（RDNA2，gfx1030–gfx1036）       | 同上                                                          | gfx1030/1031/1032/1033/1034/1035/1036 全部在目标内；RX 6700 XT（gfx1031）社区实测仍需 `HSA_OVERRIDE_GFX_VERSION=10.3.0` | [L04-S04][L04-S09]          |
| RX 7000（RDNA3，gfx1100–1103）          | 同上                                                          | gfx1100/1101/1102/1103 在目标内                                                                                         | [L04-S04]                   |
| APU/Strix Halo（RDNA3.5，gfx1150–1153） | 同上                                                          | gfx1150/1151/1152/1153 在目标内；Windows 上 gfx1151 曾报显存识别为 0（社区）                                            | [L04-S04][L04-S11]          |
| RX 9000（RDNA4，gfx1200/1201）          | 同上；KHR_coopmat 在 AMD 专有驱动上仅对 RDNA3/RDNA4 放行      | gfx1200/1201 在目标内；RX 9070 XT 双后端可用（社区）                                                                    | [L04-S04][L04-S05][L04-S14] |
| Vega 消费卡（gfx900/906）               | 入口开放，本轮无个案                                          | 未列入官方编译目标（目标里的 gfx908/90a/942/950 是 CDNA）                                                               | [L04-S04]                   |
| Polaris（gfx803 等）                    | 入口开放，RX 580 多方个案（Linux 需 RADV）                    | 未列入任何官方目标；HIP 链 ROCm ≥ 6.1 已无 gfx8xx                                                                       | [L04-S04][L04-S06][L04-S10] |

注意：上表"在编译目标内"= CI 为该 gfx 架构编出了代码，**不等于逐张卡验证过**；llama.cpp 文档不提供任何"每张卡已验证"名单。

## 安装入口与必要条件（仅记录原文，未执行）

- 预编译：从官方 Releases 下载页（https://github.com/ggml-org/llama.cpp/releases）获取 nightly 包 `llama-b11962-bin-win-vulkan-x64.zip`、`...-win-rocm-10.0-x64.zip`、`...-ubuntu-vulkan-x64.tar.gz`、`...-ubuntu-rocm-10.0-x64.tar.gz`（b11962，2026-10-28T13:42Z）；conda-forge 提供 Windows+Linux 的 Vulkan 构建；winget 仅 Windows。README 另列有 llama.app 一键安装脚本（install.sh / install.ps1），但该脚本会递归删除并重建 `~/.llama-app` 安装目录，已有目录内的自定义文件会被清除；本轮未执行该脚本，不作为无损升级方式推荐。Vulkan 运行时最低条件（代码级）：实例版本 ≥ Vulkan 1.2，且设备支持 16-bit storage（`storageBuffer16BitAccess`），否则报 "Vulkan 1.2 required"/"Unsupported device"；fp16 另需 16bit_storage + shader_float16_int8 + shaderFloat16 特性。文档未给任何具体 AMD 驱动版本号。
- Vulkan 源码编译：Windows 三种途径（w64devkit / Git Bash+VS+CMake / MSYS2，均需 Vulkan SDK）、Linux（LunarG SDK 或 `apt install libvulkan-dev glslc spirv-headers`，先 `vulkaninfo` 验证）、Docker 镜像内置 SDK。
- HIP 源码编译：需先装 ROCm（官方文档链接到 ROCm Quick Start）；Linux 例 `HIPCXX=... cmake -DGGML_HIP=ON -DGPU_TARGETS=gfx1030`，Windows 例用 VS x64 Native Tools + clang + `-DGPU_TARGETS=gfx1100`（文档注明 gfx1100 对应 RX 7900XTX/XT/GRE）；HIP CMake 强制 ROCm/HIP ≥ 6.1，链接 hipblas/rocblas；多卡 RCCL 需 `-DGGML_HIP_RCCL=ON` 且默认禁用。
- 未列入官方 ROCm 名单的卡：文档原文允许 Linux 下用 `HSA_OVERRIDE_GFX_VERSION`（RDNA2→10.3.0，RDNA3→11.0.0），并**明确注明该变量在 Windows 不被支持**。

## 容易误读的点

1. "win-rocm zip" 只是往 CPU 包里注入 `ggml-hip.dll` + `amdhip64_7.dll`/`rocm_kpack.dll`/`amd_comgr.dll` 三个运行时 DLL；Windows 的 Adrenalin 驱动**不内置** ROCm 运行时，用户需另行安装 AMD 的 ROCm/TheRock SDK，否则 `--list-devices` 可能一张卡都看不到（#26929，RX 7900 XTX，2026-08）。rocBLAS/hipBLASLt 内核仍按 gfx 目标匹配。
2. "后端支持" ≠ "该架构每张卡都跑得好"：RDNA4 曾因架构探测分支缺失被误判（#26663/#26697 关联讨论，RX 9070 XT，2026-08）；RDNA1（RX 5700 XT）在 b10455→b11429 之间出现约 45% 的 PP 回归（#30039，2026-10-06，open）。旧版本行为随版本变化，引用时必须带构建号。
3. KHR_cooperative_matrix（矩阵核）在 AMD 专有/AMD 开源驱动上被 llama.cpp **硬性白名单到 RDNA3/RDNA4**（源码注释称是对"AMD 专有驱动在所有 GPU 上都报告支持"的规避）；RADV 等其他驱动则一律放行。所以 Linux 上同一张卡换驱动可能改变可用加速路径；多驱动并存时项目按 RADV > AMD 开源 > AMD 专有的优先级选设备。
4. Linux 上 Polaris 的 amdvlk 已被项目维护者称为 deprecated 且"更早就不支持这些 GPU"，建议换 RADV（#20699，0cc4m 2026-03-18；用户 2026-03-25 换 RADV 后恢复正常）。
5. 显存容量 ≠ 可跑模型规模；本轮无实测，不做任何速度/容量换算。

## 来源

- [L04-S01] docs/build.md（HIP/Vulkan 章节）@ `604cc430` · https://raw.githubusercontent.com/ggml-org/llama.cpp/604cc430239c76ff636c443e3400bf552b750421/docs/build.md
- [L04-S02] README.md 后端表 @ `604cc430` · https://raw.githubusercontent.com/ggml-org/llama.cpp/604cc430239c76ff636c443e3400bf552b750421/README.md
- [L04-S03] Releases b11962（API 正文+资产清单，2026-10-28T13:42Z）· https://github.com/ggml-org/llama.cpp/releases/tag/b11962
- [L04-S04] .github/workflows/release.yml @ `604cc430` · https://raw.githubusercontent.com/ggml-org/llama.cpp/604cc430239c76ff636c443e3400bf552b750421/.github/workflows/release.yml
- [L04-S05] ggml/src/ggml-vulkan/ggml-vulkan.cpp @ `604cc430` · https://raw.githubusercontent.com/ggml-org/llama.cpp/604cc430239c76ff636c443e3400bf552b750421/ggml/src/ggml-vulkan/ggml-vulkan.cpp
- [L04-S06] ggml/src/ggml-hip/CMakeLists.txt @ `604cc430` · https://raw.githubusercontent.com/ggml-org/llama.cpp/604cc430239c76ff636c443e3400bf552b750421/ggml/src/ggml-hip/CMakeLists.txt
- [L04-S07] docs/release.md @ `604cc430` · https://raw.githubusercontent.com/ggml-org/llama.cpp/604cc430239c76ff636c443e3400bf552b750421/docs/release.md
- [L04-S08] docs/install.md @ `604cc430` · https://raw.githubusercontent.com/ggml-org/llama.cpp/604cc430239c76ff636c443e3400bf552b750421/docs/install.md
- [L04-S09] issue #26702（RX 6700 XT gfx1031，2026-08-07）· https://github.com/ggml-org/llama.cpp/issues/26702
- [L04-S10] issue #20699 + 评论（双 RX 580，2026-03-17→03-25）· https://github.com/ggml-org/llama.cpp/issues/20699
- [L04-S11] issue #26929 + 评论（Windows ROCm 检测不到 GPU，2026-08-11）· https://github.com/ggml-org/llama.cpp/issues/26929
- [L04-S12] issue #30039（RX 5700 XT PP 回归，2026-10-06）· https://github.com/ggml-org/llama.cpp/issues/30039
- [L04-S13] discussion #24846（RX 580 Vulkan Win+Linux，2026-06-20）· https://github.com/ggml-org/llama.cpp/discussions/24846
- [L04-S14] issue #26663 + 评论（RX 9070 XT RDNA4，2026-08-06）· https://github.com/ggml-org/llama.cpp/issues/26663
- [L04-S15] .github/actions/windows-setup-rocm/action.yml @ `604cc430` · https://raw.githubusercontent.com/ggml-org/llama.cpp/604cc430239c76ff636c443e3400bf552b750421/.github/actions/windows-setup-rocm/action.yml
- [L04-S16] Releases v0.8.0（仅 nightly-tag.txt 资产，2026-10-28T12:47Z）· https://github.com/ggml-org/llama.cpp/releases/tag/v0.8.0
- [L04-S17] .devops/rocm.Dockerfile（ROCm 7.2.1 镜像架构集）@ `604cc430` · https://raw.githubusercontent.com/ggml-org/llama.cpp/604cc430239c76ff636c443e3400bf552b750421/.devops/rocm.Dockerfile
- [L04-S18] discussion #11572（RX 7800 XT Ubuntu HIP 构建求助，2025-02-01）· https://github.com/ggml-org/llama.cpp/discussions/11572

## 拿不准的点

见 JSON `gaps`：Vega（gfx900/906）与 Windows 下 Polaris 的 Vulkan 个案、最低 AMD 驱动版本、ROCm 10.0 包对 gfx9 消费卡的运行时行为、#11572（RX 7800 XT）最终是否解决、`win-hip-radeon` 与 `win-rocm` 包差异，均未在本轮核实。
