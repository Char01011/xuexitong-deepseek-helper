# 第一次把项目发布到 GitHub

目标账号：**Char01011**。计划仓库名：**xuexitong-deepseek-helper**。计划 Release 标签：**v4.7.5**。本文是可执行的发布步骤，不代表远程仓库已经创建；实际结果以 GitHub 页面和本次发布记录为准。

## 1. 先理解几个名称

| 名称 | 实际作用 |
| --- | --- |
| Repository / 仓库 | 项目文件、历史与协作入口 |
| Fork | 在自己账号下保留与上游关联的副本，适合本项目的来源关系 |
| Commit / 提交 | 一份带说明的本地版本快照 |
| Push / 推送 | 把本地提交上传到 GitHub |
| Tag / 标签 | 标记某次提交为一个版本，例如 v4.7.5 |
| Release | 在某个标签上附上版本说明和可下载文件 |
| GitHub Pages | 把仓库里的静态 HTML 文件变成网站 |

## 2. 发布前先看授权

本项目的原始来源是 chaolucky18/xuexitongScript。当前材料中未找到明确上游 LICENSE，不能因为代码可以下载就给整个衍生项目直接套用 MIT。保留 Fork 来源、原作者和 THIRD_PARTY_NOTICES；新增内容的许可单独列出。若要把整个浏览器衍生脚本按某个开源许可证授权给别人，需要先确认上游许可或取得相应授权。

GitHub 官方说明：没有许可证时默认版权规则仍适用；GitHub 平台对公开仓库的查看与 Fork 权利另有服务条款约定。公开仓库本身不等同于完整的开源许可。

## 3. 本次发布包的范围

准备发布的是 publication/repository 中的干净副本，而不是正在运行的工作目录。两个客户端中的 LOCAL_TOKEN 应为占位符 `__LOCAL_TOKEN__`；不包含 API Key、Cookie、日志、课程截图、聊天附件、编辑器配置和下载的工具程序。

可先运行 `node scripts/check-publication.mjs`，再执行模拟检查。不要把浏览器复制的整套诊断、完整课程地址或服务窗口截图直接提交。

## 4. 登录 GitHub

可以安装 [GitHub CLI](https://cli.github.com/) 并执行：

```text
gh auth login --hostname github.com --git-protocol https --web
gh api user --jq .login
```

按提示在 GitHub 网页完成设备授权。账号密码和验证码由你自己在 GitHub 输入；不需要发到聊天里。第二条应显示 Char01011，才能继续写入目标账号。

## 5. 保留上游关系创建 Fork

在 GitHub 打开上游仓库，点击右上角 Fork，Owner 选择 Char01011，Repository name 填 xuexitong-deepseek-helper，再创建。也可以使用 CLI：

```text
gh repo fork chaolucky18/xuexitongScript --fork-name xuexitong-deepseek-helper --clone=false
```

如果目标已经存在，先检查它是否是正确仓库，不要重复创建或覆盖已有历史。不要使用强制推送覆盖未知内容。

## 6. 把准备好的改动提交

克隆自己的 Fork，然后将干净发布副本中的文件合并进去，保留克隆生成的 .git。检查 git status，确认没有运行时凭据后：

```text
git add .
git commit -m "docs: add beginner guide and DeepSeek v4.7.5 release materials"
git push origin HEAD
```

GitHub 作者信息使用你自己的账号身份。GitHub CLI 可查询账号的公开提交身份；不要编造真实邮箱。一次提交后，GitHub 页面会出现文件和提交记录，说明“代码上传”完成。

## 7. 创建带附件的 Release

```text
gh release create v4.7.5 --repo Char01011/xuexitong-deepseek-helper --title "V4.7.5 新手部署指南与稳定版" --notes-file RELEASE_NOTES.md
```

再附上打包的 ZIP 和 SHA256SUMS.txt，或创建时把两个文件路径作为附件参数。Release 的完整项目包和 GitHub 自动生成的 Source code ZIP 是不同附件；新手优先下载有明确名称的完整项目包。

## 8. 启用教程网站

仓库 Settings → Pages → Build and deployment → Source 选择 Deploy from a branch → 选择当前主分支和 /docs → Save。等待页面给出访问地址。首次 Fork 的工作流可能需要你在 Actions 页确认启用。

预期网址形式：`https://char01011.github.io/xuexitong-deepseek-helper/`。只有部署成功并实际检查后，才应把它当成已上线地址。网站采用静态 HTML/CSS/JS，无需数据库和服务器账户；离线包里的开始使用.html 也能阅读。

## 9. 后续更新怎么做

先修源码并补回归检查 → 重新生成油猴文件 → 制作去令牌的发布包 → 更新 README、网站和修复记录 → 提交推送 → 打新版本标签和 Release。旧版本 Release 保留，方便追溯。

用户仍需按“先启动服务，再更新油猴副本”的顺序安装。版本更新说明应写出是否需要重启服务、是否改变协议，以及哪些真实页面已经验证。

## 10. 我们这次做的发布整理

将运行源码、网站文档、测试、来源说明与下载附件整理为清晰目录；制作脱敏发布包；准备 GitHub 检查工作流与发布说明。是否完成登录、Fork、推送、Release 与 Pages，以随包 PUBLICATION_STATUS.json 及本次交付说明为准，不能把本地准备完成写成已发布成功。

参考：[导入本地代码](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)、[管理 Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/managing-releases-in-a-repository)、[许可证说明](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository)。
