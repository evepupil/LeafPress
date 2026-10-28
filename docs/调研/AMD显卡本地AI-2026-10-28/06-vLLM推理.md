# 06 vLLM 的 AMD 支持：官方路线、Radeon 边界与安装入口

- 核验日期：2026-10-28（所有页面均于当日打开；本轮无任何硬件实测）
- 范围：vLLM 官方文档与官方仓库中关于 AMD ROCm 的支持声明；ROCm 官方兼容矩阵作为对照；不涉及 SGLang，未实际运行容器。

## 直接结论

1. vLLM 对 AMD GPU 的官方路线是 ROCm，要求 ROCm 6.3 及以上；官方 Requirements 点名的 GPU 只有六组：MI200s (gfx90a)、MI300 (gfx942)、MI350 (gfx950)、Radeon RX 7900 系列 (gfx1100/1101)、Radeon RX 9000 系列 (gfx1200/1201)、Ryzen AI MAX / AI 300 (gfx1151/1150)。其中 MI350 要求 ROCm 7.0+，Ryzen AI MAX / AI 300 要求 ROCm 7.0.2+。[L06-S01][L06-S02]
2. 消费级 Radeon 不是"全部支持"：官方名单只覆盖 RX 7900 一代（RDNA3 高端）和 RX 9000 一代（RDNA4）。RX 7600 (gfx1102)、RX 6000/5000 系列等未列入该名单，只能写"未列入 vLLM 官方支持名单"，不能写"官方不支持"。[L06-S01][L06-S03]
3. 操作系统层面 vLLM 官方 Requirements 写 OS: Linux、Python 3.11–3.14；vLLM 不原生支持 Windows，Windows 只能走 WSL 或社区 fork。ROCm 10.1.0 自身对 Radeon 声明了 Windows 11 25H2 支持，但这是 ROCm 层，不能外推到 vLLM 层。[L06-S01][L06-S03]
4. 预编译产物分两条线：wheel（wheels.vllm.ai/rocm/）与官方 Docker 镜像（vllm/vllm-openai-rocm）。AMD 旧镜像 rocm/vllm、rocm/vllm-dev 已被官方标记弃用，改用 vLLM 官方镜像。[L06-S01][L06-S05]

## 型号 / 变体对照表

| 层次              | 对象                       | 官方说法                                                                                           | 来源               |
| ----------------- | -------------------------- | -------------------------------------------------------------------------------------------------- | ------------------ |
| vLLM Requirements | Instinct MI200/MI300/MI350 | gfx90a / gfx942 / gfx950，MI350 需 ROCm 7.0+                                                       | [L06-S01][L06-S02] |
| vLLM Requirements | Radeon RX 7900 系列        | gfx1100/1101（RDNA3）                                                                              | [L06-S01][L06-S02] |
| vLLM Requirements | Radeon RX 9000 系列        | gfx1200/1201（RDNA4）                                                                              | [L06-S01][L06-S02] |
| vLLM Requirements | Ryzen AI MAX / AI 300      | gfx1151/1150，需 ROCm 7.0.2+                                                                       | [L06-S01][L06-S02] |
| vLLM Requirements | RX 7600 / RX 6000 等       | 未列入官方支持名单（本轮未见证据）                                                                 | [L06-S01][L06-S03] |
| vLLM 构建         | 官方 ROCm 构建目标架构     | gfx90a;gfx942;gfx950;gfx1100;gfx1101;gfx1200;gfx1201;gfx1150;gfx1151；AITER 附加层仅 gfx942;gfx950 | [L06-S09]          |
| ROCm 10.1.0 矩阵  | Radeon 全名单              | 含 RX 9050–9070 XT (gfx1200/1201)、RX 7600–7900 XTX (gfx1100/1101/1102)、PRO W6800 (gfx1030) 等    | [L06-S03]          |
| ROCm 10.1.0 矩阵  | AI 生态                    | vLLM 0.29.0，Python 3.14，需 PyTorch 2.13.0                                                        | [L06-S03]          |

wheel 变体（官方文档表格，Python 均为 3.12）[L06-S01][L06-S02]：

| 变体                | ROCm  | glibc | 覆盖版本              | 本轮实测 wheels.vllm.ai                                                             |
| ------------------- | ----- | ----- | --------------------- | ----------------------------------------------------------------------------------- |
| rocm700             | 7.0   | ≥2.35 | 0.14.0–0.18.0（稳定） | 0.18.0/rocm700 存在 [L06-S04]                                                       |
| rocm721             | 7.2.1 | ≥2.35 | nightly               | 0.19.0、0.20.0 下仅 rocm721 [L06-S04]                                               |
| rocm72              | 7.2   | ≥2.39 | nightly（旧栈）       | 未单测                                                                              |
| rocm100             | 10.0  | ≥2.35 | nightly（默认）       | nightly/rocm100 有 0.33.0rc1.dev wheel [L06-S04]                                    |
| （文档未列）rocm723 | 7.2.3 | —     | 文档表格未列          | 0.30.0/0.31.0/0.32.0 与顶层 vllm 索引均为 rocm723（0.32.0+rocm723, cp312）[L06-S04] |

Docker 镜像（官方文档 + Docker Hub 实测）[L06-S01][L06-S05]：`latest`（ROCm 10.0，兼 tag `latest-rocm100`）、`nightly`（`nightly-rocm100`）、`latest-rocm72` / `nightly-rocm72`（过渡期保留）。实测 `latest`/`v0.32.0` 于 2026-10-18 推送；`nightly-rocm100`、`nightly-rocm72` 每日构建（2026-10-28 当天有构建）；历史稳定 tag 中仅 `v0.15.1-rocm` 带显式 -rocm 后缀。

## 安装入口（仅记录官方文档已见命令，未执行）

- wheel（官方推荐 uv，Python 3.12）：`uv pip install vllm --extra-index-url https://wheels.vllm.ai/rocm/ --upgrade`；指定版本示例 `uv pip install vllm==0.18.0 --extra-index-url https://wheels.vllm.ai/rocm/0.18.0/rocm700`。[L06-S01][L06-S02]
- ROCm 10.0 wheel 会经 pip 安装 ROCm SDK（TheRock），并附带所支持架构的 GPU 内核。[L06-S01]
- 容器：`docker run ... --device /dev/kfd --device /dev/dri ... vllm/vllm-openai-rocm:<tag>`。[L06-S01]
- 源码编译路径：官方给出 ROCm 10.0（pip/TheRock）与旧栈 7.2（系统 ROCm）两套 Dockerfile（`Dockerfile.rocm_base` / `Dockerfile.rocm_72_base`），并钉死各组件版本；文档明言旧分支支持 ROCm 5.7–7.0。[L06-S01][L06-S02][L06-S09]

## 容易误读的限制

1. **ROCm 支持 ≠ vLLM 支持**：ROCm 10.1.0 矩阵把 RX 7600、PRO W6800 等都列为支持，但 vLLM 官方 Requirements 只点名六组；下层（驱动/ROCm）支持不证明上层应用支持，更不证明所有模型、量化、算子可用。[L06-S01][L06-S03]
2. **gfx1101 归属歧义**：vLLM 文档写 "Radeon RX 7900 series (gfx1100/1101)"，而 AMD ROCm 矩阵中 gfx1100 对应 RX 7900 XTX/XT/GRE，gfx1101 对应 RX 7800 XT/7700 XT/7700。两份官方文本型号措辞不一致，本轮不裁决，仅并列记录。[L06-S02][L06-S03]
3. **Python 3.12 硬约束（仅 wheel）**：官方警告 ROCm 预编译 wheel 只发 Python 3.12，用 3.11/3.13 会静默回落到 PyPI 的 CUDA wheel，在 AMD 卡上报 `libcudart.so` 之类的错误。这与 vLLM 通用 Requirements 的 3.11–3.14 不同口径，以 ROCm 专页为准。[L06-S01][L06-S02]
4. **wheel 捆绑 PyTorch**：官方说明 ROCm wheel 自带 PyTorch 与依赖，且因编译大量 ROCm 内核，与其他 ROCm/PyTorch 构建可能不兼容；要换 ROCm 版本或复用现有 PyTorch 需源码编译——"能从源码编译"与"官方发布支持"是两回事。[L06-S01][L06-S02]
5. **量化矩阵口径冲突**：官方量化文档的硬件兼容表中 AMD GPU 列对 AWQ、GPTQ、Marlin、bitsandbytes、DeepSpeedFP 标不支持，仅 GGUF 与 llm-compressor FP8 (W8A8) 标支持；而平台源码 `supported_quantization` 列表又包含 awq/gptq/fp8/quark/mxfp4 等。两处并存记录，源码列表是"平台声明可注册"，不代表每个量化在每个 AMD 卡上都有可用内核。[L06-S07][L06-S06]
6. **注意力与模型的版本限制**：ROCm 有独立的一组注意力后端（ROCM_ATTN、ROCM_AITER_FA、ROCM_AITER_UNIFIED_ATTN、ROCM_OCTAVE、ROCM_SEGMENTED_ATTN 及 ROCM_AITER_MLA 系列），选择逻辑与 CUDA 平台不同。Octave 3-bit KV 仅在 RDNA3 与 CDNA3 启用、只验证过 gfx1100 (RX 7900 XTX) 与 gfx942 (MI300)，"同一 RDNA3 家族的其他芯片报 not validated"；且它绑定注意力形状（部分 RoPE 的 Qwen3-Next/Qwen3.5/3.6/3.8 家族），全 RoPE 的 Llama/Qwen3 会在启动时被拒绝。[L06-S08]

## 数据中心不可外推

Instinct 的支持深度（AITER 附加层仅 gfx942/gfx950、MORI 仅 gfx942;gfx950、MI300X 调优指南等）是数据中心专属路径；vLLM 文档明确 MI350 需更高 ROCm，且 AMD 旧的 MI300X 性能验证镜像（rocm/vllm，已弃用）面向 Instinct。这些都不能用来推定任意 Radeon 的可用性或性能。[L06-S01][L06-S02][L06-S09]

## 来源

- [L06-S01] vLLM 官方安装文档 GPU 页：https://docs.vllm.ai/en/latest/getting_started/installation/gpu/ （页面日期 2026-10-08）
- [L06-S02] vllm 仓库 `docs/getting_started/installation/gpu.rocm.inc.md`，main @ 6cfb375（2026-10-28）：https://github.com/vllm-project/vllm/blob/6cfb375fd6a2c7aee76b086c19911646711834a5/docs/getting_started/installation/gpu.rocm.inc.md
- [L06-S03] AMD ROCm 10.1.0 兼容性矩阵：https://rocm.docs.amd.com/en/latest/compatibility/compatibility-matrix.html （页面日期 2026-08-26）
- [L06-S04] vLLM ROCm wheel 索引：https://wheels.vllm.ai/rocm/ 及各版本子目录（2026-10-28 实测）
- [L06-S05] Docker Hub vllm/vllm-openai-rocm tags API（2026-10-28 实测）：https://hub.docker.com/v2/repositories/vllm/vllm-openai-rocm/tags/
- [L06-S06] `vllm/platforms/rocm.py`，main @ eaf1627（2026-10-27）：https://github.com/vllm-project/vllm/blob/eaf1627c01f553ea9a26b3d77f3cff8495dbf404/vllm/platforms/rocm.py
- [L06-S07] vLLM 量化文档：https://docs.vllm.ai/en/latest/features/quantization/
- [L06-S08] vLLM Octave 设计文档：https://docs.vllm.ai/en/latest/design/rocm_octave/
- [L06-S09] `docker/Dockerfile.rocm_base`，@ 21d9758（2026-10-08）：https://github.com/vllm-project/vllm/blob/21d97584593de08f7a1a44dad8aca32aa4a01c51/docker/Dockerfile.rocm_base

## 拿不准的点

见 JSON gaps：rocm723 稳定 wheel 与文档表格的不一致；gfx1101 型号归属；量化表与源码列表口径；社区补丁路径本轮未核实。
