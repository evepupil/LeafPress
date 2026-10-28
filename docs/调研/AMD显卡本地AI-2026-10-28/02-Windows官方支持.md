# 02：原生 Windows 官方支持（AMD PyTorch / ROCm 组件 / HIP SDK）

- 核验日期：2026-10-28（时区 Asia/Shanghai）
- 性质：网页资料调研，本轮无硬件实测，未执行任何安装。
- 版本边界：本文件核对旧 Radeon/Ryzen 专项文档的 ROCm 7.2.1 与 HIP SDK 7.2.0，不能代表截止日全部 Windows 安装入口。新版统一文档和当前 ComfyUI 手动路线另见 [Linux 版本对照](01-Linux官方支持.md) 与 [ComfyUI 调研](07-ComfyUI生图.md)；本页的 Python、训练和组件限制只按所引旧版本解读。

## 范围与直接结论

只查 AMD 官方在原生 Windows（不含 WSL、不含 ZLUDA/DirectML 社区方案）提供的 PyTorch、ROCm 运行组件与 HIP SDK 的支持名单和限制。官方入口有两个文档体系：

1. 《Use ROCm on Radeon and Ryzen》（rocm.docs.amd.com/projects/radeon，现已 302 跳转到 radeon-ryzen），其中"Windows support matrices by ROCm version"给出 PyTorch on Windows 的 OS/GPU/框架矩阵，当前版本 ROCm 7.2.1。
2. 《HIP SDK for Windows 7.2.0》（rocm.docs.amd.com/projects/install-on-windows），是另一套面向 HIP 开发者的 SDK 文档，版本号 7.2.0，与 Radeon 文档的 7.2.1 不是同一发布。

直接结论：**原生 Windows 上官方只发布了 PyTorch，没有发布完整 ROCm 栈**；官方 PyTorch Windows 版目前仅支持 Python 3.12、Windows 11，且明确"无 ML 训练支持"。HIP SDK 支持的 GPU 名单比官方 PyTorch Windows 轮子宽得多（含 gfx1102 的 RX 7600/7650 GRE、RDNA3.5 APU），但 HIP SDK 支持 ≠ PyTorch 支持，二者不能互推。

## 型号与功能对照表

### A. 官方 PyTorch on Windows 支持矩阵（ROCm 7.2.1，来源 L02-S01）

| 项目                | 官方内容                                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| OS                  | Windows 11 = Yes；表中未列其他 Windows 版本                                                                                |
| 支持架构            | gfx1201、gfx1200、gfx1100、gfx1101                                                                                         |
| 支持桌面卡/工作站卡 | RX 9070、RX 9070 XT、Radeon AI PRO R9700、RX 9060 XT、RX 7900 XTX、PRO W7900、PRO W7900 Dual Slot、RX 7700（页面原文如此） |
| PyTorch + ROCm      | PyTorch 2.9 + ROCm 7.2.1 + Python 3.12                                                                                     |
| 数据类型            | FP16；FP8 仅 RDNA4 GPU                                                                                                     |
| 驱动                | 7.2.1 PyTorch Windows 版需安装 26.2.2 图形驱动（来源 L02-S02）                                                             |

注：RX 7700 原文未写 XT，照录；gfx1102（RX 7600 系）未出现在该 PyTorch 架构名单中，只能写"未列入该版本的官方支持名单"。

补充说明两套文档的关系：Radeon 文档（radeon-ryzen）面向想直接用 PyTorch 跑 AI 的用户，Windows 部分就是一套 pip 轮子（rocm_sdk_core / rocm_sdk_devel / rocm_sdk_libraries_custom 加 torch 三件套），轮子里自带 ROCm 7.2.1 运行组件；HIP SDK 文档面向用 HIP 语言写高性能程序的开发者，是带图形界面的安装器，组件表里明确写 Windows 版不含 AI 框架和 AI 库。想在原生 Windows 上跑 PyTorch 的用户走第一条路（pip），想做 HIP 开发或移植的用户走第二条路（HIP SDK 安装器），两条路的服务对象和支持名单都不一样。

### B. HIP SDK for Windows 7.2.0 系统 requirements（来源 L02-S04）

| 类别          | 支持（Runtime/HIP SDK 均为支持）                                                                                                                                                    | 不支持                                                                          |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| OS            | Windows 11 x86-64（验证更新 22H2 GA）                                                                                                                                               | 表中未列 Windows 10                                                             |
| Radeon 桌面卡 | RX 9070 XT、RX 9070、RX 9070 GRE、RX 9060 XT、RX 9060（gfx1200/1201）；RX 7900 XTX、RX 7900 XT、RX 7800 XT、RX 7700 XT（gfx1100/1101）；RX 7650 GRE、RX 7600 XT、RX 7600（gfx1102） | RX 6950/6900/6800/6750/6700/6650/6600 XT 及 RX 6800/6700/6600（RDNA2，gfx103x） |
| Radeon PRO    | AI PRO R9700、PRO W7900/W7900 DS、W7800、W7700                                                                                                                                      | W6800、W6600（RDNA2）、W5500（RDNA1）、Radeon PRO VII（GCN5.1）                 |
| APU           | Ryzen AI Max 300/400 系（gfx1151）、Ryzen AI 300 / AI 9 400 系（gfx1150）                                                                                                           | ——                                                                              |
| ROCm Debugger | 仅 RDNA4 桌面卡（RX 9000 系、AI PRO R9700）三列均为支持                                                                                                                             | gfx1100/1101 卡 Debugger 为不支持                                               |

页面明确："If a GPU is not listed on this table, it is not officially supported by AMD."

### C. ROCm 组件在 Windows 的可得性（来源 L02-S05）

| 组件               | Linux                  | Windows(HIP SDK)                                   |
| ------------------ | ---------------------- | -------------------------------------------------- |
| AI 框架            | PyTorch、TensorFlow 等 | **Not available**                                  |
| AI 库              | MIOpen、MIGraphX       | **Not available**                                  |
| 通信库             | 支持                   | Not available（即无 RCCL/分布式通信）              |
| CMake HIP Language | Enabled                | Unsupported                                        |
| HIP 运行时         | 开源                   | 闭源                                               |
| Math/Primitives 库 | 支持                   | 支持（HIPBlasLT 6.4.2 起在 Windows 可用，gfx1101） |

## 官方 Windows 限制（来源 L02-S03，标注适用 7.2 release）

- "Only Pytorch is currently available on Windows - the rest of the ROCm stack is only supported on Linux."
- **No ML training support：该版本官方不提供机器学习训练支持（L02-S10）**。这是官方支持层面的声明，不能据此断言所有社区训练方案都无法运行。
- 仅支持 Python 3.12；Windows 上官方仅支持 LLM batch size = 1；transformers 需用最新 pip 版本，<4.55.5 的旧版本可能不受支持（均 L02-S10）。
- ComfyUI 低显存配置建议加 `--lowvram` 和 `--disable-pinned-memory`。
- 需关闭 WDAG 与 Smart App Control；缺 .dll 时装 VC++ 2015-2022 Redistributables（L02-S11）。
- Radeon GPU 在 Windows 不支持 vLLM 用例（L02-S08）。

## 安装入口（仅记录原文，未执行）

1. PyTorch（Radeon 文档，L02-S02）：pip 安装 `https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/` 下的 `rocm_sdk_core/devel/libraries_custom-7.2.1-*.whl` + `rocm-7.2.1.tar.gz`，再装 `torch-2.9.1+rocm7.2.1-cp312`、`torchvision-0.24.1+rocm7.2.1`、`torchaudio-2.9.1+rocm7.2.1` 的 win_amd64 轮子；前置条件为 26.2.2 图形驱动。该目录索引已实测存在（L02-S07）。
2. HIP SDK（L02-S06/S09）：AMD 官网 HIP SDK download page 下载安装器；组件含 HIP SDK Core 7.2.0、HIP Libraries（Full/Partial/None）、HIP Runtime Compiler、HIP Ray Tracing、Visual Studio 2017/2019/2022 插件、AMD ROCm Debugger，并捆绑 AMD Radeon Software PRO 25.30 驱动安装器（装完需重启，可选 Factory Reset 会清掉旧驱动且无法回滚）。安装需要管理员权限，中途会临时把安装包解压到 C:\AMD。
3. ComfyUI（L02-S08）：先装上列 ROCm PyTorch 轮子，再 clone ComfyUI、`pip install -r requirements.txt`、`python main.py`。

可直接核对的组合（验收项）：**AMD Radeon RX 7900 XTX（gfx1100）+ Windows 11 + Python 3.12 + PyTorch 2.9.1+rocm7.2.1（pip 轮子 cp312/win_amd64）+ 26.2.2 图形驱动**，出自 L02-S01/S02；该组合仅保证官方推理路径可用，不含训练、不含全部算子/插件。

## 容易误读的点

1. **HIP SDK 支持 ≠ PyTorch 支持**：HIP SDK 名单里的 RX 7600/7650 GRE（gfx1102）、Ryzen AI APU（gfx1150/1151）都没有出现在 ROCm 7.2.1 的 PyTorch Windows 支持矩阵中，不能反推能跑官方 PyTorch 轮子。
2. **两套文档版本号不同**：Radeon 文档是 ROCm 7.2.1（含 torch 轮子），HIP SDK 文档是 7.2.0，且 HIP SDK 组件表写 AI 框架/AI 库在 Windows "Not available"——这是指 HIP SDK 发行版不含 PyTorch/MIOpen，PyTorch Windows 轮子由 Radeon 文档单独提供。
3. "No ML training support" 是官方支持层面的声明：指该版本官方不提供训练支持，不能扩推成"物理上绝对无法训练"，也不因显卡型号高级而解除（L02-S03/S10）。
4. gfx 名单按表逐卡核对，不能把 RDNA3 全系推定为支持。
5. PyTorch Windows 矩阵里的 "RX 7700" 是否就是 RX 7700 XT，原文未写明，别自行补 XT。

## 来源

- L02-S01 Windows support matrices by ROCm version（Radeon/Ryzen 文档）：https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/compatibility/compatibilityrad/windows/windows_compatibility.html
- L02-S02 Install PyTorch for Radeon GPUs（Windows，PIP）：https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/windows/install-pytorch.html
- L02-S03 Radeon Limitations and recommended settings：https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/limitations/limitationsrad.html
- L02-S04 HIP SDK System requirements for Windows：https://rocm.docs.amd.com/projects/install-on-windows/en/latest/reference/system-requirements.html
- L02-S05 ROCm components supported in HIP SDK：https://rocm.docs.amd.com/projects/install-on-windows/en/latest/conceptual/component-support.html
- L02-S06 AMD HIP SDK for Windows 7.2.0 Release Notes：https://rocm.docs.amd.com/projects/install-on-windows/en/latest/about/releasenotes.html
- L02-S07 AMD repo 目录索引 rocm-rel-7.2.1：https://repo.radeon.com/rocm/windows/rocm-rel-7.2.1/
- L02-S08 Install ComfyUI（Radeon, Windows）/ LLM 页：https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/advanced/advancedrad/windows/comfyui/installcomfyui.html
- L02-S09 Install HIP SDK（HIP SDK for Windows 7.2.0 文档）：https://rocm.docs.amd.com/projects/install-on-windows/en/latest/install/install.html
- L02-S10 / L02-S11 Radeon Limitations（Windows Limitations、Windows 环境提示两小节，同页拆分）：https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/limitations/limitationsrad.html
- L02-S12 HIP SDK System requirements（不支持名单小节，同页拆分）：https://rocm.docs.amd.com/projects/install-on-windows/en/latest/reference/system-requirements.html

## 容易误读的点（续前文第 1-5 条）

6. **"无训练支持"是官方支持层面的声明**：指该版本官方不提供机器学习训练支持，不能据此断言所有社区训练方案都无法运行；想走官方训练路径要换 Linux（另路）。
7. **官方验证深度很浅**：Radeon 文档的"Verify PyTorch installation"只验证 `import torch`、`torch.cuda.is_available()` 和设备名能读出来，不代表任何具体模型、自定义节点、采样器组合都被验证过；ComfyUI 官方文档也只演示了 SDXL Turbo 一个模板。
8. **ROCm Debugger 的限制别算到 PyTorch 头上**：调试器仅支持 RDNA4、不支持多 GPU、不支持 Python 脚本、不支持 core dump，这是调试器组件自身限制。

## 拿不准 / 未核实

- PyTorch Windows 矩阵中 "AMD Radeon RX 7700" 是否即 RX 7700 XT：页面原文无 XT，未知。
- 26.2.2 驱动：本轮未核驱动发布说明和最低驱动差异；页面仅给出驱动号，未查到对应正式发布说明，不能断言页面没有公开版本号。
- Windows 10 是否被明确排除（矩阵只列 Windows 11 = Yes，未见 Windows 10 条目，属未列入名单而非"官方声明不支持"）。
- 7.2.1 之前的 Windows 版本回滚名单：需点 Version List 逐版本查，本轮未核。
