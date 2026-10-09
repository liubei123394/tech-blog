---
title: Python 虚拟环境备忘：venv、conda、uv 该用哪个
date: 2026-10-02
category: tools
tags:
  - Python
  - 环境管理
  - 备忘录
summary: 每次都记不住激活命令，干脆一次性整理清楚。附一份可以直接抄的日常工作流。
---

## 为什么必须要用虚拟环境

不做隔离的话，所有项目的包都装在同一个全局环境里。项目 A 要 `requests==2.28`，项目 B 要 `requests==2.31`，装完 B 之后 A 就跑不起来了。

而且换电脑时，你根本说不清这个项目到底依赖了什么。

## 三种方案的定位

| 方案 | 适合场景 | 速度 | 依赖管理文件 |
| --- | --- | --- | --- |
| `venv` | 标准库自带，纯 Python 项目 | 快 | `requirements.txt` |
| `conda` | 需要非 Python 依赖（CUDA、GDAL 等） | 慢 | `environment.yml` |
| `uv` | 想快，想要现代依赖锁定 | 很快 | `pyproject.toml` + `uv.lock` |

我的选择：**日常用 `uv`，需要装 CUDA 相关的用 `conda`，给别人交接的脚本用 `venv`**。

## venv 常用命令

```bash
# 创建（约定俗成叫 .venv，编辑器能自动识别）
python -m venv .venv

# 激活 —— Windows Git Bash
source .venv/Scripts/activate

# 激活 —— Windows PowerShell
.venv\Scripts\Activate.ps1

# 激活 —— macOS / Linux
source .venv/bin/activate

# 退出
deactivate
```

导出和安装依赖：

```bash
pip freeze > requirements.txt
pip install -r requirements.txt
```

> 注意：`pip freeze` 会把所有间接依赖都写进去，版本极其精确但很难读。想要清爽一点，可以用 `pipreqs` 只导出代码里实际 import 的包。

## uv 常用命令

`uv` 用 Rust 写的，装包速度大概是 pip 的十几倍。

```bash
# 安装 uv（Windows 用 pipx 或官方脚本）
pipx install uv

# 初始化项目
uv init my-project
cd my-project

# 加依赖
uv add requests openai

# 加开发依赖
uv add --dev ruff pytest

# 按锁文件精确还原环境
uv sync

# 不激活环境直接跑脚本
uv run main.py
```

最后一条是我最常用的。不用 `source activate`，直接 `uv run` 就行，少一个记命令的负担。

## conda 什么时候非用不可

判断标准很简单：**你要装的包里有编译好的二进制，或者依赖系统级库**。

典型例子：

```bash
# PyTorch + CUDA
conda install pytorch torchvision pytorch-cuda=12.1 -c pytorch -c nvidia

# 地理信息处理
conda install -c conda-forge geopandas
```

这些包在 pip 里也能装，但经常卡在编译环节，或者版本对不上。conda 直接给预编译好的包，省事。

代价是 conda 环境体积大、求解依赖慢。所以我只在这类项目里用它，不混用。

## 容易踩的坑

### 忘记激活环境

最常见的错误。装完包发现 `import` 还是失败，一看 `which python` 指向的是全局解释器。

建议把终端提示符配一下，激活后显示环境名。VS Code 里右下角也能看到当前解释器，写代码前扫一眼。

### 把 .venv 提交到 Git

```gitignore
# .gitignore
.venv/
venv/
env/
__pycache__/
*.pyc
```

虚拟环境目录动辄几百 MB，而且和操作系统绑定，提交上去没有任何意义。别人的机器上重新建一个就好。

### 中文路径导致的编码错误

Windows 上如果项目路径含中文，某些包安装时会报 `UnicodeDecodeError`。尽量把项目放在纯英文路径下，比如 `D:\projects\`。

## 我现在的固定流程

新建一个 Python 小项目时：

```bash
mkdir my-tool && cd my-tool
uv init
uv add requests rich
uv run main.py
```

完成。没有 activate、没有手动建目录、没有环境变量要改。

如果是学习 AI 相关的项目，需要 GPU 时再切到 conda：

```bash
conda create -n ai-lab python=3.11
conda activate ai-lab
```

## 小结

- 纯 Python 项目一律用 `venv` 或 `uv`，别碰全局环境
- 涉及 CUDA、地理信息、科学计算这类重型依赖时才用 `conda`
- `.venv/` 永远写进 `.gitignore`
