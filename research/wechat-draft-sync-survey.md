# 个人未认证订阅号「自动同步到草稿箱」方案调研

> 调研时间：2026-10-15 · 结论先行：**官方 API 路线对未认证个人订阅号走不通，云调用路线被官方文档明确封死；唯一能自动进草稿箱的是浏览器自动化，但违反平台运营规范、有封号风险。手动粘贴（当前方案）是零风险的唯一选择。**

---

## 一、先厘清权限事实（官方信源）

| 事实 | 来源 |
|---|---|
| `freepublish/submit`（发布接口）：**仅企业主体已认证账号**可调用；2025 年 7 月起个人主体/未认证企业账号的该权限已被回收 | 官方文档「发布草稿」页适用范围 |
| 未认证账号调用 `/cgi-bin/material/add_material`、`/cgi-bin/draft/add` 返回 **48001 api unauthorized**；微信开放社区官方运营专员答复：「未认证的服务号，没有接口权限」 | 微信开放社区工单 |
| `draft/add` 官方文档：**「本接口不支持云调用」** | 官方文档「新增草稿」页调用方式一节 |
| 云调用/开放接口服务的使用限制原文：「**公众号类型不满足该接口权限要求（云调用无法改变接口对公众号类型的要求）**」 | 微信云托管官方文档「云调用」 |

自查方法：登录 mp.weixin.qq.com →「设置与开发 → 接口权限」，搜「草稿箱」。若显示未获得，即无权限，任何调用姿势都绕不过。

> 注：网上部分教程/文档（如某些 Skill 的 README）声称个人订阅号有草稿箱权限，与官方社区答复和 48001 实际报错不符，属于过时或以讹传讹。

---

## 二、GitHub 现存方案盘点

### 方案 A：官方 API 直连（AppID + AppSecret + IP 白名单）

**代表项目**
- [MaydayV/wechat-article-skill](https://github.com/MaydayV/wechat-article-skill)：写作 → 排版 → 封面生成 → 纯 Python 推草稿
- [smallnest/md2wechat-skill](https://github.com/smallnest/md2wechat-skill)（fork 自 geekjourneyx/md2wechat-skill，1.4k+ stars）：多主题排版 + `--upload` 上传草稿
- [vluma/wechat_official_account_mcp](https://github.com/vluma/wechat_official_account_mcp)：MCP 服务器，集成素材/草稿/发布，README 明确标注「订阅号(未认证)不支持发布功能」
- [chuanSir123/AiWeChatOfficialAccounts](https://github.com/chuanSir123/AiWeChatOfficialAccounts)：AI 热点抓取 + 自动写文 + API 管理草稿

**原理**：AppID+Secret 换 `access_token` → `media/uploadimg` 上传正文图 → `material/add_material` 上传永久封面 → `draft/add` 建草稿。

**风险/限制**
- ❌ 未认证个人订阅号直接 48001，**对你不可用**（我们上个版本脚本就是这么写的，所以失败）
- AppSecret 是账号最高敏感凭据，落盘/进仓库即泄露风险
- IP 白名单：家庭宽带 IP 变动就得重配（40164 报错）
- 即便有权限，自动**群发**也已被官方收紧，只能停在草稿

### 方案 B：微信云托管「开放接口服务」免鉴权 relay

**代表项目**
- [shinchen6/wechat-draft-publisher-skill](https://github.com/shinchen6/wechat-draft-publisher-skill)：本地只做排版，草稿请求经部署在微信云托管的 relay 代理转发

**原理**：云托管容器内直连 `api.weixin.qq.com`，微信自动注入鉴权——**免 AppSecret 管理、免 IP 白名单**。

**风险/限制**
- ❌ **官方文档明确 `draft/add` 不支持云调用**；且云调用无法突破账号类型权限限制。社区有号称跑通的文章，但与 2026 年现行官方文档冲突，可能基于旧版行为或小程序关联资源复用的特殊配置
- 需要开通微信云托管环境、配置接口权限，链路复杂
- 本质仍是走微信服务端接口，未认证账号的权限天花板没变

**判定：对未认证个人号不可靠，且你已明确不走接口路线。**

### 方案 C：浏览器自动化（Playwright/Selenium 模拟人工操作）

**代表项目**
- wechat-mp-smart-publish（LobeHub/ClawHub Skill）：Playwright 打开 mp.weixin.qq.com 新建图文 → 注入排版后 HTML → 上传封面 → 自动点「保存为草稿」，返回草稿链接和截图
- md2wechat 部分流程、AiWeChatOfficialAccounts 的发布环节也属此类

**原理**：人工扫码登录一次 → Playwright 持久化 cookie（storageState）→ 之后每次用无头浏览器模拟真人填标题、贴正文、存草稿。

**风险**
- ⚠️ **违反《微信公众平台运营规范》第 11.3 条**：「使用自动化工具模拟用户操作……视为严重违规」——轻则弹验证码/功能受限，重则限制账号
- ⚠️ 风控识别：设备指纹、鼠标轨迹、UA、TLS 指纹都在检测范围；实测模拟登录滑块验证触发率高
- cookie 有效期有限，过期需重新扫码，自动化随时断
- 公众号编辑器（UEditor 定制版）DOM 一改版，脚本即失效，维护成本高

**判定：技术上唯一能让未认证账号「自动进草稿箱」的路径，但合规风险由你的账号承担，不建议对主力号使用。**

### 方案 D：逆向 mp 后台 Web 接口（cookie + token + fakeid 直连私有接口）

**代表项目**：wechat-article-exporter、WechatOAApis、wechat_article_collection 等（此类多用于**采集**，发布方向的实现同理）

**风险**：最重。非官方接口、协议逆向，涉《微信公众平台运营规范》与《网络安全法》；已有刑事判例（2023 沪 0104 刑初 287 号，破解微信算法被判侵犯计算机信息系统罪）；凭据有效期短（token 级分钟级失效）、封号率高。

**判定：不碰。**

### 方案 E：纯前端排版 + 手动粘贴（当前采用）

**代表项目**
- [doocs/md](https://github.com/doocs/md)（30k+ stars）：Markdown → 微信内联样式 HTML，浏览器复制粘贴
- wechat-format / online-markdown 等一众「微信排版器」

**特点**：零权限、零凭据、零风险，不碰任何微信接口；唯一「手动」动作是复制粘贴，而这一步恰好也是方案 C 里浏览器自动化干的事——但由你亲手做，完全合规。

---

## 三、结论

1. **权限层面**：个人未认证订阅号没有草稿箱接口权限（48001 实锤），且官方 2025 年 7 月还在收紧个人主体的接口（回收 freepublish）。等微信开放权限不现实。
2. **技术层面**：A（官方 API）不可用、B（云调用）被官方文档封死、D（逆向）法律与封号风险最高。只有 C（浏览器自动化）技术上可行，但明确违反平台规范，封号风险自担——对辛辛苦苦做起来的号不值得。
3. **决策**：**维持「本地转换 HTML + 固定尾注 + 手动复制粘贴」方案**。这也是 GitHub 上最主流、star 最多的成熟路线（doocs/md 30k+ stars 都是这么做的）。从 markdown 到可粘贴的成品，自动化已经覆盖了 95%，剩下 5%（复制→粘贴→点群发）是合规边界内的必要人工动作。

> 附：GitHub 上自动化程度最高的 md2wechat 系列，其最终发布形态也都是「停在草稿箱等人工确认」，全自动群发在微信的规则体系里对任何账号类型都不存在。
