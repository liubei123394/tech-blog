---
title: 第一个 AI 小项目：命令行翻译助手，从调通 API 到处理各种异常
date: 2026-10-05
category: ai
tags:
  - 大模型
  - API
  - 命令行工具
summary: 用大模型 API 写了个命令行翻译工具。真正花时间的不是调通接口，而是处理超时、限流、输出格式不稳定这些现实问题。
repo: https://github.com/yourname/llm-translate
stack: Python, OpenAI API, rich
---

## 目标

想要一个在终端里随手能用的翻译工具：

```bash
tr "这个函数的作用是把时间戳转成本地时区"
```

输出中文翻译结果，同时把结果写进剪贴板。

选它当第一个 AI 项目，是因为**需求足够简单，但 API 调用的坑一个都不少**。

## 第一版：能跑就行

```python
from openai import OpenAI
import sys

client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

def translate(text, target="English"):
    resp = client.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": f"你是专业翻译。把用户输入翻译成{target}，只输出译文，不要任何解释。"},
            {"role": "user", "content": text},
        ],
    )
    return resp.choices[0].message.content.strip()

if __name__ == "__main__":
    print(translate(" ".join(sys.argv[1:])))
```

二十行搞定，能跑。但接下来一个星期，我 80% 的时间都花在处理它的意外情况上。

## 问题一：模型不听话，喜欢加解释

虽然说了"只输出译文"，但模型偶尔还是会返回：

```text
这句话的翻译是：This function converts a timestamp to the local timezone.
```

解决办法不是把 prompt 写得更长，而是**用 API 的结构化输出能力**。新版的接口支持指定 JSON Schema：

```python
resp = client.chat.completions.create(
    model="gpt-4o-mini",
    response_format={"type": "json_object"},
    messages=[
        {"role": "system", "content": '返回 JSON：{"translation": "译文", "notes": "生词备注"}'},
        {"role": "user", "content": text},
    ],
)
data = json.loads(resp.choices[0].message.content)
print(data["translation"])
```

> 经验：**凡是需要程序解析模型输出，就别用自然语言约束，用结构化输出。** 用 `json.loads` 解析的稳定性远高于正则去猜。

## 问题二：超时和限流

批量翻译一段文档时，跑到第二十几条就报错：

```text
RateLimitError: 429 Too Many Requests
```

需要加指数退避重试：

```python
import time, random

def with_retry(fn, retries=4, base=1.0):
    for attempt in range(retries):
        try:
            return fn()
        except RateLimitError:
            if attempt == retries - 1:
                raise
            # 指数退避 + 随机抖动，避免多个请求同时重试
            delay = base * (2 ** attempt) + random.uniform(0, 0.5)
            time.sleep(delay)
```

这里的**随机抖动**很关键。如果几个请求同时被限流、同时又用同样的延迟重试，它们会再次撞在一起，形成新的峰值。

## 问题三：长文本要分块

模型有上下文长度限制。直接丢一篇几千字的文章进去会报错，或者被静默截断。

分块时不能简单按字数切，否则会把句子切成两半，翻译质量明显下降。我的做法是按段落切，再把段落聚合成不超过阈值的块：

```python
def chunk_paragraphs(text, max_chars=1500):
    paras = [p.strip() for p in text.split("\n\n") if p.strip()]
    chunks, current = [], ""
    for p in paras:
        if len(current) + len(p) > max_chars and current:
            chunks.append(current)
            current = p
        else:
            current = f"{current}\n\n{p}" if current else p
    if current:
        chunks.append(current)
    return chunks
```

## 问题四：流式输出的体感

不流式输出时，长句翻译要等两三秒才出结果，感觉像卡住了。改成流式之后，字一个一个字出来，体感快很多：

```python
stream = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=messages,
    stream=True,
)
for chunk in stream:
    delta = chunk.choices[0].delta.content
    if delta:
        print(delta, end="", flush=True)
```

`flush=True` 不能少，否则 Python 会缓冲输出，等于没流式。

## 问题五：API Key 不能进代码

一开始我图省事把 key 写在了脚本里。后来意识到如果这个仓库误设成 public，key 会立刻泄露，而且是在 GitHub 上被爬虫秒扫的那种。

正确做法：

```bash
# .env 文件（写进 .gitignore）
OPENAI_API_KEY=sk-xxxxx
```

```python
from dotenv import load_dotenv
load_dotenv()
```

再加一道保险，提交前检查：

```bash
# 安装 pre-commit 钩子后自动扫描
pip install detect-secrets
detect-secrets scan > .secrets.baseline
```

**如果 key 已经泄露过，第一件事是去后台把它吊销，而不是只把它从代码里删掉。** Git 历史里还留着。

## 最终命令行体验

用 `rich` 美化了一下输出，加了剪贴板支持：

```bash
$ tr "The function returns the index of the first matching element."
该函数返回第一个匹配元素的索引。

$ tr "hello" --to ja
こんにちは
```

## 小结

这个项目让我明白一件事：**调用大模型 API 的第一版代码，大概只占最终代码量的 20%**。剩下的是工程问题 —— 重试、限流、分块、密钥管理、输出解析。

好消息是这些问题在任何 AI 项目里都会遇到，写一次就能复用。下一步打算把它包成一个 MCP 工具，让编辑器里的 AI 助手也能直接调用。
