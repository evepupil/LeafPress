# 07 ComfyUI 官方 AMD 路线（生图）

- 核验日期：2026-10-28（时区 Asia/Shanghai）
- 本轮无硬件实测，全部结论来自官方文档、官方仓库与发布记录的页面原文；速度、稳定性不作判断。
- 范围：ComfyUI 官方对 AMD 显卡的 Windows/Linux 安装路线与支持边界。社区 DirectML/ZLUDA 历史补丁不在本路范围，只标注官方是否提供入口。

## 直接结论

1. ComfyUI 官方为 AMD 提供三条入口，路线并不相同：**Windows 桌面版**（comfy.org 下载安装器）、**Windows 便携包**（`ComfyUI_windows_portable_amd.7z`，解压即用）、**手动安装**（git clone + pip，Windows/Linux 通用）。官方 README 明确手动安装"支持所有操作系统和 GPU 类型（NVIDIA、AMD、Intel、Apple Silicon、Ascend）"[L07-S01]。
2. AMD 支持的官方表述按操作系统分开：**Linux 走 ROCm 7.2（pytorch.org 官方轮子，stable 或 nightly）**；**Windows 走 ROCm 10.0，用 AMD 多架构（multi-architecture）PyTorch 包**，并声明"不需要单独安装 HIP SDK"[L07-S01][L07-S02][L07-S03]。
3. 三条入口版本不一致：README/手动安装文档写 ROCm 10.0 + PyTorch 2.13；Windows 便携包 CI 仍标 "Release AMD ROCm 7.2"（Python 3.12.10）[L07-S07]；桌面版 2.0 的 standalone 环境定义钉在 ROCm 7.14 TheRock 多架构轮子（torch 2.12.0+rocm7.14.0）[L07-S08]。同一天查到的三个"官方 AMD 版本"是三条不同产线，不能互相推断。

## 安装入口对照

| 入口                         | 平台                                                     | AMD 条件（页面原文所见）                                                                                                                                                                                                                                                          | 来源             |
| ---------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 手动安装（git+pip，Linux）   | Linux                                                    | `pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/rocm7.2`（nightly 同源 `nightly/rocm7.2`）                                                                                                                                                 | L07-S01, L07-S03 |
| 手动安装（git+pip，Windows） | Windows 11                                               | AMD 多架构 PyTorch 包 + ROCm 10.0；64 位 Python 3.13；最新 AMD 显卡驱动；无需 HIP SDK；`pip install --index-url https://stable.repo.amd.com/rocm/whl-next/ "torch[device-all]==2.13.0+rocm10.0.0" "torchvision[device-all]==0.28.0+rocm10.0.0" "torchaudio==2.11.0.2+rocm10.0.0"` | L07-S01, L07-S03 |
| 便携包（portable）           | 仅 Windows                                               | 下载 `ComfyUI_windows_portable_amd.7z`，解压后双击 `run_amd_gpu.bat`（ROCm）                                                                                                                                                                                                      | L07-S04, L07-S01 |
| 桌面版（desktop）            | Windows / macOS (Apple Silicon) / Linux (AppImage、.deb) | 系统要求页写"Windows 10 or later. NVIDIA or AMD GPU recommended"；桌面页写"独显（NVIDIA / AMD）推荐但非必需"                                                                                                                                                                      | L07-S02          |

便携包实测入口：GitHub release 最新版 v0.43.0（发布于 2026-10-27）资产中含 `ComfyUI_windows_portable_amd.7z`（约 1.66 GB），与 nvidia / intel 便携包并列[L07-S05]。`run_amd_gpu.bat` 内容为 `.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build`，另有 `run_amd_gpu_enable_dynamic_vram.bat` 追加 `--enable-dynamic-vram`；随包 README 要求"recent driver"[L07-S06]。

## 可证明的型号范围

ComfyUI 官方只给到**架构级 + 示例表**，不给完整型号名单。README/manual_install 的 device extra 示例表[L07-S01][L07-S03]：

| GPU                               | device extra     |
| --------------------------------- | ---------------- |
| RX 9070 / XT、Radeon AI PRO R9700 | `device-gfx1201` |
| RX 9060 / XT                      | `device-gfx1200` |
| RX 7900 XT / XTX                  | `device-gfx1100` |
| RX 7700 XT / 7800 XT              | `device-gfx1101` |
| RX 7600 / XT                      | `device-gfx1102` |
| Ryzen AI Max / Max+（Strix Halo） | `device-gfx1151` |

原文明示"此表只列示例，未列出的 GPU 仍可能受支持：支持的架构包括 RDNA 2、RDNA 3、RDNA 3.5 和 RDNA 4"。RDNA 2（如 RX 6700/6600）在示例表中没有 device extra 行，只出现在"未获 ROCm 官方支持的卡"的变通段（`HSA_OVERRIDE_GFX_VERSION=10.3.0`）[L07-S01]——即 RDNA 2 属于"架构级支持"但无官方列名的 device extra。

AMD 官方 PyTorch 安装页给出更长的 gfx 清单（RX 9070 XT/GRE/9070=gfx1201、9060 XT/9060/9050=gfx1200、7900 XTX/XT/GRE=gfx1100、7800/7700 XT=gfx1101、7600=gfx1102、PRO W6800=gfx1030、AI PRO R9700/R9600=gfx1201、Ryzen AI Max+ 395 等=gfx1151、Ryzen AI 300 系列=gfx1150/1152/1153、Ryzen 7x0M 核显=gfx1103；OS 仅 Linux 与 Windows；Python 3.10–3.14）[L07-S09]。注意这是 AMD PyTorch 层的名单，ComfyUI 引用它，但**上一层 PyTorch 支持不等于某一模型、工作流或自定义节点可跑**。

## Windows 与 Linux 的区别

- Windows 手动安装被钉死在 Windows 11 + Python 3.13 + ROCm 10.0 多架构包；Linux 用 pytorch.org 的 rocm7.2 轮子，Python 版本约束宽松（3.13 推荐、3.12 兜底、3.14 "部分自定义节点可能有问题"）[L07-S01][L07-S02]。
- 便携包仅 Windows；桌面版覆盖三平台[L07-S02]。
- `HSA_OVERRIDE_GFX_VERSION` 变通写法是 Linux 环境变量形式，页面未给 Windows 等价命令[L07-S01]。

## 容易误读的限制

1. **"能装"≠"都能跑"**。官方页面只承诺安装路线，不给任何模型/插件兼容承诺；README 同时警告 Python 3.14 下部分自定义节点依赖可能出问题、PyTorch 2.7 仅"最低支持"[L07-S01]。CUDA 专用自定义节点、xformers、FlashAttention 在 ROCm 下的可用性本轮**未查任何具体项目文档，不作断言**（社区路线另查）。
2. **版本碎片化**：历史版本记录只有站点身份未核的来源——comfyui.org 网站文章（2026-01-07）称 ROCm 支持自 Desktop v0.7.0 进入 Windows、当时用 ROCm 7.1.1[L07-S11]，但该站点官方身份未核，不作为官方发布依据，不能用于证明官方何时开始支持；当前可核的官方版本是：便携包 CI 标 ROCm 7.2[L07-S07]、桌面 standalone 钉 ROCm 7.14[L07-S08]、手动安装文档写 ROCm 10.0。旧教程里任何一条 pip 命令都不能当作当前命令使用，须以 README/manual_install 当日版本为准。
3. **AMD 便携包不做 CI 启动自检**：`release-stable-all.yml` 中 AMD job 的 `test_release: false`，而 nvidia/arm64/cu126/xpu 均为 `true`[L07-S07]。这只说明发布流程差异，不等于不可用。
4. **官方不提供 DirectML/ZLUDA 入口**：README 与 docs.comfy.org 安装页全文只出现 ROCm 路线，无 DirectML/ZLUDA 字样[L07-S01][L07-S03]。
5. **Docker 镜像非官方**：系统要求页明示 Docker Hub 上的 ComfyUI 镜像"不由 Comfy-Org 官方维护、ComfyUI 团队不支持"[L07-S02]。
6. **AMD 文档站旧页冲突**：AMD radeon-ryzen 文档的 ComfyUI 安装页仍写 Python 3.12 + 驱动 26.2.2 + ROCm 7.2.1 轮子 + clone `comfyanonymous/ComfyUI`[L07-S10]，与 ComfyUI 官方当前命令（ROCm 10.0 / PyTorch 2.13 / Python 3.13 / `Comfy-Org/ComfyUI`）冲突，保留双方出处，以 ComfyUI 官方文档为当前准绳。

## 来源

- L07-S01 ComfyUI README（comfyanonymous/ComfyUI master，提交 4845e7a3ffc48a6961f15824239e9042cc7d4ad1，2026-10-28）
- L07-S02 docs.comfy.org/installation/system_requirements
- L07-S03 docs.comfy.org/installation/manual_install
- L07-S04 docs.comfy.org/installation/comfyui_portable_windows
- L07-S05 github.com/Comfy-Org/ComfyUI releases（v0.43.0，2026-10-27，含 amd 便携包资产）
- L07-S06 ComfyUI 仓库 `.ci/windows_amd_base_files/`（run_amd_gpu.bat、README_VERY_IMPORTANT.txt）
- L07-S07 ComfyUI 仓库 `.github/workflows/release-stable-all.yml`
- L07-S08 Comfy-Org/ComfyUI-Standalone-Environments（requirements-amd-win.txt、torch-index-stacks.json）
- L07-S09 rocm.docs.amd.com AI ecosystem "Install PyTorch for ROCm"
- L07-S10 rocmdocs.amd.com radeon-ryzen "Install ComfyUI"（旧版冲突出处）
- L07-S11 comfyui.org 网站 "Official AMD ROCm Support Arrives on Windows for ComfyUI Desktop"（2026-01-07，站点官方身份未核的历史记录，不作官方发布依据）

## 拿不准的点

见 JSON gaps 字段：桌面版实际随包 ROCm 版本未逐字节核验、amd.7z 未解包、桌面版 AMD 专用安装页未找到、CUDA 专用节点兼容性未查、无任何硬件实测。
