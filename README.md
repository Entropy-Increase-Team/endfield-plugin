<div align="center">

![endfield-plugin](https://socialify.git.ci/Entropy-Increase-Team/endfield-plugin/image?description=1&forks=1&issues=1&language=1&name=1&owner=1&pattern=Circuit+Board&pulls=1&stargazers=1&theme=Dark)

# endfield-plugin

基于森空岛 API 的 Yunzai-Bot **终末地**插件 · 绑定 / 便签 / 干员面板 / Wiki / 攻略 / 抽卡 / MaaEnd

[安装](#安装插件) · [功能](#当前功能) · [MaaEnd 教程](MaaEnd教程.md)

</div>

---

- 一个适用于 [Yunzai 系列机器人框架](https://github.com/yhArcadia/Yunzai-Bot-plugins-index) 的明日方舟：终末地游戏数据查询插件

- 支持网页授权 / 扫码 / 手机号 绑定，支持便签、干员面板、Wiki、攻略、帝江号与地区建设等查询

> [!TIP]
> 终末地-协议终端交流群，欢迎加入 [160759479](https://qm.qq.com/q/zZXruW6V4Q) 交流反馈。

## 使用须知

这是一个**正在快速迭代**的项目，可能会有一些小 BUG 出没 🐛（我们会努力消灭它们的！）

遇到问题？欢迎来提 [ISSUE](https://github.com/Entropy-Increase-Team/endfield-plugin/issues) 反馈，我们会第一时间处理！更多好玩的功能正在路上，敬请期待 ✨

## 安装插件

### 1. 克隆仓库

在 Yunzai 根目录执行：

```bash
git clone https://github.com/Entropy-Increase-Team/endfield-plugin ./plugins/endfield-plugin/
```

### 2. 配置 - 必须要绑定 API_KEY !!!

> [!TIP]
> **官网**：[终末地协议终端](https://end.shallow.ink)。授权登陆、绑定列表等接口需配置 `api_key`，请在官网注册并获取 API 密钥后，在 `config/common.yaml` 中填写。

---

## 当前功能

命令前缀固定为 `:` / `：` / `#zmd` / `#终末地`，例如 `:帮助` / `#zmd帮助`。

### 插件基本

| 命令 | 说明 |
|------|------|
| `:帮助` | 打开帮助菜单（`: / ： / #zmd / #终末地` 均可） |

### 森空岛账号绑定（支持多账号）

| 命令 | 说明 |
|------|------|
| `:绑定` | 私聊发送 cred 绑定（前缀同上） |
| `:授权登陆` | 网页授权登陆（需先去网站绑定） |
| `:扫码绑定` | 森空岛 App 扫码绑定 |
| `:手机绑定 [手机号]` | 手机验证码绑定（私聊） |
| `:绑定帮助` | 查看绑定方式说明 |
| `:绑定列表` | 查看已绑定账号（含绑定类型、⭐ 当前） |
| `:切换绑定 <序号>` | 切换当前激活账号 |
| `:删除绑定 <序号>` | 删除指定绑定（网页授权需前往官网解除） |
| `:我的cred` | 查询当前激活账号的 cred |
| `:删除cred` | 删除所有绑定 |

### 终末地信息查询（需绑定）

| 命令 | 说明 |
|------|------|
| `:便签` | 查询角色便签 |
| `:干员列表` | 查询干员列表 |
| `:<干员名>面板` | 干员面板（如 `:黎风面板`） |
| `:帝江号建设` | 查询帝江号建设信息 |
| `:地区建设` | 查询地区建设信息 |
| `:理智` / `:体力` | 查询理智与日常活跃 |
| `:订阅理智 <值>` | 订阅理智推送，不设值则满时推送 |
| `:取消订阅理智` | 取消理智推送订阅 |
| `:签到` | 森空岛签到 |
| `:日历` | 活动日历 |

#### 干员面板说明

命令：`:<干员名>面板`（如 `:黎风面板`）

详细数据 仅能查询 在展柜的4名干员

### 公告

| 命令 | 说明 |
|------|------|
| `:公告` | 终末地官方公告列表 |
| `:公告 <序号>` | 查看第 N 条公告详情 |
| `:公告最新` | 获取最新一条公告 |
| `:订阅公告 群聊` | 本群订阅新公告推送 |
| `:取消订阅公告` | 取消本群公告订阅 |

### 抽卡

| 命令 | 说明 |
|------|------|
| `:抽卡分析` / `:抽卡分析同步` | 查看抽卡分析（加「同步」拉取最新记录） |
| `:抽卡记录 <类型> <页码>` | 查看抽卡记录（常驻/新手/武器/限定） |
| `:全服抽卡统计` | 查看全服抽卡统计 |
| `:十连` / `:百连` / `:单抽` | 模拟抽卡（可选卡池：常驻/UP/武器/限定） |
| `:重置抽卡` | 重置个人模拟抽卡状态 |

### Wiki 查询（需绑定）

| 命令 | 说明 |
|------|------|
| `:wiki 干员 <名称>` | 干员百科 |
| `:wiki 装备 <名称>` | 装备百科 |
| `:wiki 战术物品 <名称>` | 战术物品百科 |
| `:wiki 武器 <名称>` | 武器百科 |

### 攻略查询

| 命令 | 说明 |
|------|------|
| `:<名称>攻略` | 查询攻略（如 `:黎风攻略`） |
| `:攻略列表` | 查看可查询的攻略名 |

### MaaEnd 远程控制

远程控制 [MaaEnd Client](https://github.com/Entropy-Increase-Team/MaaEnd-Client/releases) 执行终末地自动化任务。

> 详细教程请查看 [MaaEnd 教程](MaaEnd教程.md)

| 命令 | 说明 |
|------|------|
| `:maa 绑定` | 生成绑定码（仅私聊） |
| `:maa 设备` | 查看已绑定设备列表 |
| `:maa 设置设备 <序号>` | 设置默认设备，后续命令可省略序号 |
| `:maa 任务列表 [序号]` | 查看设备可用任务 |
| `:maa 执行 <任务名或序号>` | 在默认设备上执行任务 |
| `:maa 状态 [编号]` | 查询任务状态（默认最近一次） |
| `:maa 停止 [编号]` | 停止任务（默认最近一次） |
| `:maa 截图 [序号]` | 获取设备当前截图 |
| `:maa 重置 [序号]` | 重置设备任务状态 |
| `:maa 删除设备 <序号>` | 解绑并删除设备 |
| `:maa 历史 [页码]` | 查看任务执行历史 |

### 其他

| 命令 | 说明 |
|------|------|
| `:蓝图` | 查看蓝图文档链接 |

### 管理员

| 命令 | 说明 |
|------|------|
| `:全部签到` | 为所有已绑定账号执行签到 |
| `:同步全部抽卡` | 同步所有用户抽卡记录 |
| `:重置全员抽卡` | 重置所有用户的模拟抽卡状态 |
| `:上传攻略 <名称> <作者> <图片>` | 上传攻略图片 |
| `:更新` / `:强制更新` | 更新终末地插件 |

---

## 鸣谢

- **API支持**：感谢[浅巷墨黎](https://github.com/dnyo666)整理并提供的终末地API后端
- **代码贡献**：
  - [@QingYingX](https://github.com/QingYingX)：插件项目主要开发者
  - [@浅巷墨黎（Dnyo666）](https://github.com/dnyo666)：前后端开发者
- **特别鸣谢**：
  - [Yunzai-Bot](https://github.com/yoimiya-kokomi/Miao-Yunzai)：Miao-Yunzai机器人框架
  - [终末地官方](https://endfield.hypergryph.com)：感谢官方的数据（）

## 其他框架

- **云崽**：[endfield-plugin](https://github.com/Entropy-Increase-Team/endfield-plugin)

## 💖 感谢贡献者

感谢所有为 endfield-plugin 添砖加瓦的开发者们！🎉 你们都是最棒的！

[![贡献者](https://contrib.rocks/image?repo=Entropy-Increase-Team/endfield-plugin&max=1000)](https://github.com/Entropy-Increase-Team/endfield-plugin/graphs/contributors)

有你们的贡献，endfield-plugin 才能变得越来越好~ ❤️

如果你喜欢这个项目，请不妨点个 Star🌟，这是对开发者最大的动力。

