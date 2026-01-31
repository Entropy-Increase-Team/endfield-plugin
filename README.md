<div align="center">

![endfield-plugin](https://socialify.git.ci/Entropy-Increase-Team/endfield-plugin/image?description=1&forks=1&issues=1&language=1&name=1&owner=1&pattern=Circuit+Board&pulls=1&stargazers=1&theme=Dark)

# endfield-plugin

基于森空岛 API 的 Yunzai-Bot **终末地**插件 · 绑定 / 便签 / 干员面板 / Wiki / 攻略 / AI 对话

[安装](#安装插件) · [功能](#当前功能) · [说明](#说明)

</div>

---

- 一个适用于 [Yunzai 系列机器人框架](https://github.com/yhArcadia/Yunzai-Bot-plugins-index) 的明日方舟：终末地游戏数据查询插件

- 支持网页授权 / 扫码 / 手机号 / Cred 绑定，支持便签、干员面板、Wiki、攻略、帝江号与地区建设等查询

> [!TIP]
> 终末地-协议终端交流群，欢迎加入 [160759479](https://qm.qq.com/q/zZXruW6V4Q) 交流反馈。

## 安装插件

### 1. 克隆仓库

在 Yunzai 根目录执行：

```bash
git clone https://github.com/Entropy-Increase-Team/endfield-plugin ./plugins/endfield-plugin/
```

### 2. 配置 - 必须要绑定 API_KEY !

> [!TIP]
> **官网**：[终末地协议终端](https://end.shallow.ink)。授权登陆、绑定列表等接口需配置 `api_key`，请在官网注册并获取 API 密钥后，在 `config/common.yaml` 中填写。

---

## 当前功能

默认前缀为 `:` / `：`，例如 `:帮助`；更多前缀请前往锅巴配置。

### 插件基本

| 命令 | 说明 |
|------|------|
| `:帮助` | 打开帮助菜单 |

### 森空岛账号绑定（支持多账号）

| 命令 | 说明 |
|------|------|
| `:绑定` | 私聊发送 cred 绑定 |
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
| `:理智` | 查询理智与日常活跃 |
| `:订阅理智` | 订阅理智与日常活跃推送 |
| `:签到` | 森空岛签到 |

### Wiki 查询（需绑定）

| 命令 | 说明 |
|------|------|
| `:wiki 干员 <干员名称>` | 干员百科 |
| `:wiki 装备 <装备名称>` | 装备百科 |
| `:wiki 战术物品 <物品名称>` | 战术物品百科 |
| `:wiki 武器 <武器名称>` | 武器百科 |

### AI 对话

| 命令 | 说明 |
|------|------|
| `:ai [消息内容]` | AI 对话 |
| `:ai 新会话 [消息内容]` | 创建新会话 |

### 攻略查询

| 命令 | 说明 |
|------|------|
| `:<攻略名>攻略` | 查询攻略（如 `:黎风攻略`） |
| `:攻略资源下载` | 下载所有攻略资源 |
| `:攻略资源更新` | 增量更新新攻略 |
| `:攻略资源强制更新` | 强制更新所有攻略 |

### 其他

| 命令 | 说明 |
|------|------|
| `:蓝图` | 查看蓝图文档链接 |

### 管理员

| 命令 | 说明 |
|------|------|
| `:全部签到` | 为所有已绑定账号执行签到 |

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

- **云崽**：[delta-force-plugin](https://github.com/Entropy-Increase-Team/endfield-plugin)

## 支持与贡献

如果你喜欢这个项目，请不妨点个 Star🌟，这是对开发者最大的动力。

有意见或者建议也欢迎提交 [Issues](https://github.com/Entropy-Increase-Team/endfield-plugin/issues) 和 [Pull requests](https://github.com/Entropy-Increase-Team/endfield-plugin/pulls)。

