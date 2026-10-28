# 01 · Linux 官方桌面显卡支持（AMD ROCm / Radeon 路线）

- 核验日期：2026-10-28（时区 Asia/Shanghai）。本路只读官方网页与官方仓库文件，无硬件实测，未安装任何软件。
- 范围：AMD 官方 ROCm / Radeon Linux 路线对**消费级桌面独显**的列名支持，及对应系统、驱动、PyTorch 版本。核显（Ryzen APU/iGPU）另路由查；Windows/WSL 另路查；Instinct 数据中心卡仅作边界说明。所有结论仅代表“官方名单/文档层面”，不代表具体模型、算子、插件可用。

## 直接结论

1. 当前统一口径是 **ROCm 10.1.0 统一兼容矩阵**（页面日期 2026-08-26）；另有一份仍可访问的旧 **Radeon 专项文档（ROCm 7.2.1）**，其自述“covers releases through 7.2.1；Starting with ROCm Core SDK 7.13.0, documentation is unified”，即 7.2.1 之后已并入统一文档。旧文档只用于说明旧安装组合（如 PyTorch 2.9.1 + ROCm 7.2.1），不作为当前完整支持口径 [L01-S01][L01-S02]。
   - 注意：任务书起点 URL `projects/radeon/en/latest/docs/compatibility.html` 及其下各子页目前 302 跳转到 radeon-ryzen 项目，真正的 7.2.1 Linux 矩阵页是 `.../compatibilityrad/native_linux/native_linux_compatibility.html`。
2. RX 9000 / 7000 中**只有官方逐型号列名的才计支持**；两份文档名单在 RX 7600、RX 9050、RX 9060 XT LP、PRO W6800 上不一致（见下表，以 10.1.0 为当前口径）。
3. **RX 6000 消费卡（6600/6700/6800/6900 等）未出现在本轮核对的 10.1.0 统一名单与旧 7.2.1 专项名单**；10.1.0 的 RDNA2 栏列 PRO W6800 与 PRO V620（均 gfx1030）。[L01-S01][L01-S02][L01-S07]

## 型号对照表（桌面独显；PRO/AI PRO 卡仅作参照）

| 型号                                     | LLVM/gfx | 统一矩阵 10.1.0（当前口径）[S01] | 旧 Radeon 7.2.1 文档 [S02] | 来源        |
| ---------------------------------------- | -------- | -------------------------------- | -------------------------- | ----------- |
| RX 9070 XT / 9070 GRE / 9070             | gfx1201  | 列入                             | 列入                       | S01,S02,S07 |
| RX 9060 XT / RX 9060                     | gfx1200  | 列入                             | 列入                       | S01,S02,S07 |
| RX 9060 XT LP                            | gfx1200  | 列入                             | 未列入                     | S01,S02     |
| RX 9050 / RX 9050 (4GB)                  | gfx1200  | 列入                             | 未列入                     | S01,S02     |
| RX 7900 XTX / XT / GRE                   | gfx1100  | 列入                             | 列入                       | S01,S02,S07 |
| RX 7800 XT / 7700 XT / 7700              | gfx1101  | 列入                             | 列入                       | S01,S02,S07 |
| RX 7600                                  | gfx1102  | 列入                             | 未列入                     | S01,S02     |
| RX 6900/6800/6700/6600 全系              | gfx103x  | 未列入                           | 未列入                     | S01,S02     |
| （参照）PRO W6800 / PRO V620             | gfx1030  | 列入                             | 未列入                     | S01,S02,S07 |
| （参照）AI PRO R9700/R9700S/R9600/R9600D | gfx1201  | 列入                             | 列入                       | S01,S02     |

“未列入”仅指**未列入该版本官方名单**，不是官方声明“不支持”；旧版 ROCm 6.x 是否曾列名见“未核实”。

## 系统 / 驱动 / 框架版本

| 项目            | ROCm 10.1.0（Radeon 栏）[S01]                                                                                                                                                             | Radeon 7.2.1 文档 [S02]                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Linux 发行版    | Ubuntu 26.04.1(GA 7.0) / 24.04.5(HWE 7.0) / 22.04.5(HWE 6.8)；RHEL 10.2(6.12.0-211) / 9.8(5.14.0-687)                                                                                     | Ubuntu 24.04.4 Desktop+HWE(kernel 6.17)、22.04.5+HWE(6.8)、RHEL 10.1(6.12)；另注明 24.04.3 为“用 24.04.2 安装器的初步支持” |
| 内核/用户态驱动 | amdgpu 31.60.0、31.50.0                                                                                                                                                                   | Radeon Software for Linux 22.04 / 24.04 / 25.10                                                                            |
| PyTorch         | **仅 2.14.0**（Linux，Python 3.14/3.13/3.12/3.11/3.10；Radeon/Ryzen 行）；2.13.0/2.12.0 只出现在 gfx950/942/90a/908（Instinct）条件单元格                                                 | 2.9.1 官方生产支持；2.9 nightly“未充分测试”；**2.7/Stable 明确“不支持 Radeon 7000 系列”**                                  |
| 其他框架        | 统一表另列 JAX 0.11.1、vLLM 0.29.0、SGLang 0.5.18、TF 2.21、ONNX Runtime 1.29.0、MIGraphX 2.18，但各行均带 gfx 条件，本路未逐项核其对 Radeon 消费卡的条件，不能据此宣称本表消费卡全部支持 | ONNX Runtime 1.23.2；TensorFlow 2.20；Triton 3.5.1                                                                         |

## 安装入口（仅记录已见原文，未执行）

- 驱动/ROCm：`amdgpu-install` 脚本 7.2.1.70201-1（Ubuntu 24.04 noble / 22.04 jammy / RHEL 10.1 仓库），`amdgpu-install -y --usecase=graphics,rocm`；装后加入 `render,video` 组并以 `rocminfo` 验证（文档示例输出 `gfx1100`）。[S04]
- PyTorch 7.2.1：AMD 推荐 repo.radeon.com 的 wheel：`torch-2.9.1+rocm7.2.1`（cp312 对应 Ubuntu 24.04/RHEL 10.1，cp310 对应 22.04）、torchvision 0.24.0、torchaudio 2.9.0、triton 3.5.1；或 Docker `rocm/pytorch:rocm7.2.1_ubuntu24.04_py3.12_pytorch_release_2.9.1`；文档注明 numpy 2.0 与该 torch wheel 不兼容，需 `numpy==1.26.4`。[S05]

## 容易误读的限制

- **gfx 代号不能替代名单**：gfx1101 同时对应 7800 XT/7700 XT/7700/W7700/V710，是否列入需逐型号核对；gfx1030 只对应 PRO 卡。
- **矩阵表格带 GPU 过滤条件，不能整表平铺**：10.1.0 AI 生态表的 Linux PyTorch 行有两个条件单元格：`gfx:[gfx950,gfx942,gfx90a,gfx908]`（Instinct）对应“2.14.0, 2.13.0, 2.12.0”；`fam:[radeon,ryzen]` 对应“2.14.0”。该矩阵给 Radeon/Ryzen Linux 只列 PyTorch 2.14.0，2.13/2.12 属于 Instinct 条件单元格。[L01-S08]
- **当前口径 vs 旧文档**：Radeon 专项文档止于 7.2.1，只用于说明旧安装组合；把 7.2.1 名单当成当前支持面、或把 10.1.0 名单当成 7.2.1 安装包可用名单，都会出错。
- **旧 Windows 限制有版本范围**：旧 7.2.1 专项限制页写明 Windows 上只有 PyTorch、仅 Python 3.12、仅支持批量为 1 的 LLM 推理，且不提供机器学习训练支持。这些限制不能直接套到新版统一发行包或当前 ComfyUI 安装路线。[L01-S06]
- **未列名不能直接判为不可用**：旧前置条件页写明未列名的 GPU “might be community-enabled through TheRock nightly builds”，这是另行核对的路线，不构成该旧版本官方认证。[L01-S03]
- 7.2.1 已知问题：ONNX Runtime+MIGraphX EP 在部分产品（如 AI PRO R9700）可能失败；AO Triton 在 PyTorch 2.9 下对 **RX 7000 系列默认禁用**需手动开启。[S06]

## 未核实（详见 JSON gaps）

repo.radeon.com 是否实际提供面向 Radeon 消费卡的 PyTorch 2.14.0 wheel（本轮只读到 7.2.1 文档里的 2.9.1 wheel 链接）；统一表其他框架（JAX/vLLM/SGLang/TF/ONNX/MIGraphX）各行 gfx 条件与 Radeon 消费卡的对应对本路未逐项核（vLLM 另一路负责）；ROCm 6.x 旧版名单（docs-6.3 等 URL 全部 302 跳转到 latest，Wayback 429 限流）；ROCm 7.13.0/TheRock 预览路线的名单。

## 来源

- [L01-S01] ROCm 10.1.0 compatibility matrix — https://rocm.docs.amd.com/en/latest/compatibility/compatibility-matrix.html （AMD，页面日期 2026-08-26）
- [L01-S02] Linux support matrices by ROCm version（7.2.1）— https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/compatibility/compatibilityrad/native_linux/native_linux_compatibility.html （AMD）
- [L01-S03] Prerequisites to use ROCm on Radeon desktop GPUs — https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/prerequisites/prerequisitesrad.html （AMD）
- [L01-S04] Install Radeon software for Linux with ROCm — https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/native_linux/install-radeon.html （AMD）
- [L01-S05] Install PyTorch for Radeon GPUs（Linux）— https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/install/installrad/native_linux/install-pytorch.html （AMD）
- [L01-S06] Radeon Limitations and recommended settings — https://rocm.docs.amd.com/projects/radeon-ryzen/en/latest/docs/limitations/limitationsrad.html （AMD）
- [L01-S07] ROCm/rocm-docs 仓库 `docs/data/gpus.yaml`（固定提交 f47eb2f8ba97，2026-10-05）— https://raw.githubusercontent.com/ROCm/rocm-docs/f47eb2f8ba97/docs/data/gpus.yaml （AMD 官方仓库，主会话确认链接可访问）
- [L01-S08] ROCm 10.1.0 AI ecosystem 表的显卡家族筛选条件，主会话直接解析 HTML 核验 — https://rocm.docs.amd.com/en/latest/compatibility/compatibility-matrix.html#ai-ecosystem-compatibility
