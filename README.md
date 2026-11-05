# 学习通 DeepSeek 助手

面向 Windows + Edge 的课程视频与章节练习助手。当前稳定版本 **V4.7.5**，提供油猴自动启动入口、本地 DeepSeek 转发服务和页面识题诊断。

**[打开新手教程网站](https://char01011.github.io/xuexitong-deepseek-helper/)** · **[下载完整 V4.7.5 项目包](https://github.com/Char01011/xuexitong-deepseek-helper/releases/tag/v4.7.5)** · **[本次发布结果与后续维护](DELIVERY.md)**

本项目基于 [chaolucky18/xuexitongScript](https://github.com/chaolucky18/xuexitongScript) 继续整理与改进。维护账号：**Char01011**。它是非官方社区项目，与学习通、DeepSeek、Tampermonkey 没有隶属关系。

## 第一次使用

1. 获取完整项目包并全部解压。用浏览器打开根目录 **开始使用.html**，或阅读 **docs/index.html**。
2. 安装 [Node.js 官网 LTS 版本](https://nodejs.org/en/download)、Edge 和 [Tampermonkey](https://www.tampermonkey.net/index.php?browser=edge)。准备自己的可用 DeepSeek API Key。
3. 双击根目录 **START.cmd**；输入 API Key 后按 Enter，输入不回显。看到“本地服务已启动”后保持窗口打开。
4. 用记事本打开 `deepseek-console/xuexitong-deepseek.user.js`，复制全文。
5. 油猴管理面板 → 新建脚本 → 替换默认代码 → Ctrl+S。启用用户脚本权限、课程站点访问和该脚本；停用其他同时操作课程的脚本。
6. 关闭 F12，刷新带左侧目录的课程页。右下角应出现 **学习通 DeepSeek V4.7.5**。

**顺序要点：先启动服务，再复制生成的油猴文件。每次重启服务，都要把新文件全文重新保存到油猴，然后刷新课程页。** 不要单独移动 CMD；不要只下载一个脚本文件。

## 支持与限制

- 视频：默认静音、1 倍速；同页可访问视频依次处理，完成后进入下一步骤。
- 题型：单选、多选、判断、一题多空的填空；支持普通输入控件和可确认已有实例的 UEditor/TinyMCE。
- 流程：题量核对 → 每批 10 题顺序请求 → 全部答案校验 → 回填及回读 → 提交确认 → 等待成绩或完成标记 → 下一节。
- 诊断：页面“查看识题诊断”可导出数量、题型、失败原因、编辑器状态，不包含题干正文和密钥。
- 图片、简答、未知编辑器、受限 iframe、平台界面或接口变化不保证支持。模型可能答错，API 可能计费，首次使用请观察完整流程。
- 题目和选项会发送给 DeepSeek。API Key 仅保存在本地服务进程内存；运行时临时令牌会写入本机生成的脚本。

## 文档入口

| 文档 | 内容 |
| --- | --- |
| [网页指南](docs/index.html) | 从环境部署到日常运行，含交互检查清单和故障搜索 |
| [技术路线详解](TECHNICAL_GUIDE.md) | 浏览器、DOM、异步状态、本地 API、模型数据格式和工程知识点 |
| [修复过程](BUG_HISTORY.md) | 每类 bug 的现象、证据、原因、修复和验证边界 |
| [GitHub 发布手册](GITHUB_PUBLISH.md) | Fork、提交、Release、Pages 和后续版本维护 |
| [来源与授权](THIRD_PARTY_NOTICES.md) | 原项目来源、许可证待核实事项和新增内容的授权范围 |
| [原 V3 说明](LEGACY_V3.md) | 不调用 DeepSeek 的历史视频脚本 |

## 运行与本地检查

普通使用者不需要安装 npm 依赖。维护者在项目根目录执行：

```text
node deepseek-console/build-userscript.mjs
node tests/deepseek-flow.mjs
node tests/navigation-keeper.mjs
node tests/local-service-startup.mjs
node scripts/check-publication.mjs
```

前三类检查合计 100 项行为检查，使用模拟页面、模拟 AI 响应和临时端口，不调用真实答题接口。它们验证错误路径与数据一致性，不能代替实际课程验收。V4.7.5 已收到本次 Edge 课程测试“可以顺畅运行”的用户反馈，不代表所有课程均兼容。

## 反馈问题

请附：脚本版本、浏览器及油猴版本、卡住步骤、状态框文字、识题诊断。网址只提供域名和问号前路径。不要上传 API Key、LOCAL_TOKEN、Cookie 或包含课程会话参数的完整地址。

## 授权状态

公开可见和完整开源许可是两回事。当前原始下载包与上游主页未找到明确 LICENSE；沿用和衍生的浏览器脚本不应被直接重新声明为整体 MIT。新增网站、文档和明确列出的独立文件采用附加许可，具体见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 [LICENSE-ADDITIONS.md](LICENSE-ADDITIONS.md)。
