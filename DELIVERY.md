# V4.7.5 发布结果与后续维护

2026 年 11 月 5 日，已在 Char01011 账号完成本次发布。

| 入口 | 用途 |
| --- | --- |
| [教程网站](https://char01011.github.io/xuexitong-deepseek-helper/) | 给首次使用的同学，从下载、环境准备到 Edge 中运行 |
| [公开仓库](https://github.com/Char01011/xuexitong-deepseek-helper) | 查看源代码、文档和提交历史 |
| [V4.7.5 Release](https://github.com/Char01011/xuexitong-deepseek-helper/releases/tag/v4.7.5) | 下载完整 ZIP 和 SHA256SUMS.txt |
| [技术路线](TECHNICAL_GUIDE.md) | 理解 DOM、iframe、播放器、异步流程、本地服务、模型格式与编辑器 |
| [修复记录](BUG_HISTORY.md) | 按证据回顾遇到的故障、失败假设与最终修复 |
| [发布操作手册](GITHUB_PUBLISH.md) | 学习 Fork、Commit、Push、Release 和 Pages |

## 这次实际完成的操作

1. 从正在运行的工程生成单独的发布副本，保留源码、测试和历史文件；将运行时连接令牌改成占位符，不改动本机正在使用的原始文件。
2. 通过你完成的设备授权确认账号为 Char01011，将原项目 Fork 到你的账号，保留原作者关联。
3. 将新增与修改文件提交到 master 并推送。版本源码提交为 `ca1cbce859d7978365113b3239565a39e9d866b0`。
4. GitHub Actions 的 Verify 检查通过，包含发布内容检查及 100 项模拟行为检查。
5. 为上述提交创建 v4.7.5 Release，上传完整 ZIP 与校验文件。
6. 将 master 分支的 /docs 设置为 GitHub Pages 来源；构建和部署成功，开启 HTTPS。
7. 使用真实 Edge 引擎访问线上网站，确认页面 HTTP 200、站内资源可访问、下载包校验值一致、手机宽度无横向溢出，未发现页面脚本错误。

ZIP 为 293727 字节，SHA-256：

```text
57d135dc6c28ca859dc75568be5f5910495bbf93c2a2abaf8e3fa3b93e9d72bc
```

包内 `PUBLICATION_STATUS.json` 记录打包时尚未发布的历史状态，`remote_verified:false` 不是当前失败提示。当前状态以本页、Release 和 GitHub Pages 为准。本文件在发布验证后补充，因此不在先前生成的 ZIP 中。

## 同学拿到文件以后怎么开始

优先下载 Release 中名为 `xuexitong-deepseek-helper-v4.7.5.zip` 的附件，全部解压，打开根目录的“开始使用.html”。不要只拿 CMD 或单个用户脚本。

首次运行按“环境准备 → START.cmd → 输入自己的 API Key → 复制本次生成的油猴文件 → 保存启用 → 关闭 F12 → 刷新课程页”进行。每次重启服务都要更新油猴保存的副本。

## 以后你怎样维护

- 改文档：仓库打开文件 → 铅笔编辑 → Commit changes。只修改根目录 Markdown 不会自动更新已经生成的网页文章；网页也需重新生成或编辑 /docs 中的 HTML。
- 改程序：本地修改源码 → 运行行为检查 → 重新生成用户脚本 → 运行 `node scripts/prepare-publication.mjs` 生成去令牌的干净副本与 ZIP → 检查发布内容 → 将准备好的文件合并回自己的 Git 克隆并推送。不要覆盖克隆的 .git。
- 更新网站：提交 /docs 的内容后，Pages 会重新部署；在 Actions 查看成功状态。
- 发新版本：统一更新版本说明，再创建新的版本标签和 Release，附上新 ZIP 与校验文件。不要用新内容替换旧版附件。
- 回答问题：让反馈者提供版本、状态框和脱敏识题诊断，先区分启动、连接、识题、请求、回填、提交各阶段。

## 授权和验证范围

当前上游没有发现明确许可证，不能把整个衍生工程直接重新授权为 MIT。已保留 Fork 来源，新增内容的授权范围见 [来源说明](THIRD_PARTY_NOTICES.md) 与 [附加许可](LICENSE-ADDITIONS.md)。

100 项模拟行为检查、网站自动检查和本次实际课程的用户反馈，分别验证不同层次；它们不保证所有课程兼容或模型答案必然正确。
