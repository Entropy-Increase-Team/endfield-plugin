# Endfield-API 接口文档

版本号：2.1.0

## 概述

Endfield-API 是一个基于 Go + Gin 的终末地 API 服务，提供森空岛账号登录、游戏数据查询、Web 平台认证、数据授权、开发者 API 等功能。

- **Base URL**: `http://localhost:15618`

---

### 认证凭证说明

本系统使用三种不同的凭证，各有不同用途：

| 凭证类型 | Header | 用途 | 获取方式 |
|----------|--------|------|----------|
| **Anonymous Token** | `X-Anonymous-Token` | 未登录用户访问凭证，绑定设备指纹 | 提交设备指纹获取 |
| **Framework Token** | `X-Framework-Token` | 游戏账号绑定凭证，用于查询游戏角色数据 | 扫码/手机/Cred 登录后获取 |
| **JWT Access Token** | `Authorization: Bearer <token>` | Web 平台用户认证，用于用户相关操作 | 注册/登录/OAuth 后获取 |
| **API Key** | `X-API-Key` | 第三方客户端认证，用于机器人等调用 | 开发者申请创建 |

**重要说明**：
- `Anonymous Token` 用于未登录用户，绑定浏览器设备指纹，有效期 2 小时，防止接口滥用
- `Framework Token` **仅用于**查询森空岛游戏数据（体力、角色、签到等），与 Web 平台用户体系**完全独立**
- `JWT Token` 用于 Web 平台的用户登录状态，管理用户账号、授权、开发者功能等
- 所有公开接口受 **IP 级别速率限制**（100 请求/分钟）保护

## 通用响应格式

```json
{
  "code": 0,
  "message": "成功",
  "data": { ... }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| code | int | 状态码，0 表示成功 |
| message | string | 状态消息 |
| data | object | 响应数据 |

---

## 匿名访问凭证

未登录用户需要先获取匿名访问凭证（Anonymous Token），用于访问公开接口。

### 获取匿名 Token

```http
POST /api/v1/auth/anonymous-token
Content-Type: application/json

{
  "fingerprint": "浏览器设备指纹（至少32字符）"
}
```

**请求参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fingerprint | string | 是 | 设备指纹（由前端生成，至少 32 字符） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "token": "anon_a1b2c3d4e5f6...",
    "expires_at": "2026-01-27T16:00:00+08:00",
    "expires_in": 7200,
    "token_type": "Anonymous"
  }
}
```

**使用方式**：

方式一：使用专用 Header
```http
GET /some-api
X-Anonymous-Token: anon_a1b2c3d4e5f6...
```

方式二：使用 Authorization Header
```http
GET /some-api
Authorization: Bearer anon_a1b2c3d4e5f6...
```

**Token 特性**：
| 特性 | 值 |
|------|-----|
| 有效期 | 2 小时 |
| 请求限制 | 200 次/Token |
| 指纹绑定 | 同一指纹会复用 Token |
| 自动刷新 | 剩余时间 < 1 小时时自动刷新 |

**前端设备指纹生成示例**：

```javascript
// 推荐使用 FingerprintJS 库
import FingerprintJS from '@fingerprintjs/fingerprintjs';

const fp = await FingerprintJS.load();
const result = await fp.get();
const fingerprint = result.visitorId; // 设备指纹

// 或者简单实现（不推荐生产使用）
const simpleFingerprint = () => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('fingerprint', 2, 2);
  return btoa(canvas.toDataURL() + navigator.userAgent + screen.width);
};
```

---

## 健康检查

### 基础健康检查

```http
GET /health
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "status": "healthy",
    "timestamp": "2026-01-26T14:00:00+08:00",
    "uptime": 123.45,
    "memory": {
      "alloc_mb": 5,
      "total_alloc_mb": 10,
      "sys_mb": 15
    },
    "runtime": {
      "version": "go1.21.0",
      "goroutines": 10,
      "os": "windows",
      "arch": "amd64"
    }
  }
}
```

### 详细健康检查

```http
GET /health/detailed
```

**响应示例**:
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "healthy",
    "timestamp": "2026-01-26T14:00:00+08:00",
    "uptime": 123.45,
    "system": {
      "memory": {
        "alloc_mb": 5,
        "total_alloc_mb": 10,
        "sys_mb": 15,
        "heap_alloc_mb": 4,
        "heap_sys_mb": 12
      },
      "runtime": {
        "version": "go1.21.0",
        "goroutines": 10,
        "cpus": 8,
        "os": "windows",
        "arch": "amd64"
      }
    },
    "dependencies": {
      "mongodb": {
        "status": "connected",
        "latency": 5,
        "database": "endfield"
      },
      "redis": {
        "status": "connected"
      }
    }
  }
}
```

---

## 登录认证

### 扫码登录

#### 获取二维码

```http
GET /login/endfield/qr
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "framework_token": "uuid-xxx-xxx",
    "scan_id": "xxx",
    "qrcode": "data:image/png;base64,xxx...",
    "expire": 1234567890
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| framework_token | string | 会话令牌，后续请求使用 |
| scan_id | string | 扫码ID |
| qrcode | string | Base64 编码的二维码图片 |
| expire | int64 | 过期时间戳(毫秒) |

#### 轮询扫码状态

```http
GET /login/endfield/qr/status?framework_token=xxx
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| framework_token | string | 是 | 会话令牌 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "code": 1,
    "msg": "等待扫码",
    "status": "pending",
    "expire": 1234567890,
    "remaining_ms": 178000,
    "framework_token": "xxx"
  }
}
```

**响应字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| code | int | 状态码 |
| msg | string | 状态消息 |
| status | string | 状态标识 |
| expire | int64 | 过期时间戳（毫秒） |
| remaining_ms | int64 | 剩余有效时间（毫秒），用于前端倒计时 |
| framework_token | string | 会话令牌 |

**状态码说明**:
| code | status | 说明 |
|------|--------|------|
| 1 | pending | 等待扫码 |
| 2 | scanned | 已扫码待确认 |
| 3 | authed | 已授权，正在获取凭证 |
| 0 | done | 登录成功 |
| -2 | expired | 已过期（3分钟未扫码） |
| -3 | failed | 获取凭证失败 |

**二维码有效期**: 3 分钟。超时后需重新获取二维码。

#### 确认登录

```http
POST /login/endfield/qr/confirm
Content-Type: application/json

{
  "framework_token": "xxx",
  "user_identifier": "可选，用户标识",
  "platform": "可选，平台标识"
}
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "登录成功",
    "framework_token": "uuid-xxx-xxx"
  }
}
```

---

### 手机验证码登录

#### 发送验证码

```http
POST /login/endfield/phone/send
Content-Type: application/json

{
  "phone": "13800138000"
}
```

**响应示例**:
```json
{
  "code": 0,
  "message": "验证码发送成功"
}
```

#### 验证码登录

```http
POST /login/endfield/phone/verify
Content-Type: application/json

{
  "phone": "13800138000",
  "code": "123456"
}
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "登录成功",
    "framework_token": "uuid-xxx-xxx"
  }
}
```

---

### Cred 绑定

#### 使用 Cred 直接绑定

```http
POST /login/endfield/cred
Content-Type: application/json

{
  "cred": "your-cred-here"
}
```

#### 验证 Cred 有效性

```http
GET /login/endfield/cred/verify?cred=xxx
```

---

## 统一绑定 API

> 支持 **Web 用户**（JWT）和**第三方客户端**（API Key + user_identifier）两种认证方式
>
> 凭证数据存储在凭证库（`endfield_login_sessions`），绑定关系存储在绑定库（`endfield_users`）

### 认证方式

| 客户端类型 | 认证方式 | 说明 |
|-----------|---------|------|
| Web 用户 | `Authorization: Bearer <jwt>` | 从 JWT 自动获取用户 ID |
| 第三方客户端 | `X-API-Key` + `user_identifier` | **必须提供 API Key**，否则返回 401 |

### 数据隔离（安全机制）

> ⚠️ **重要**: 绑定数据按 API Key 所有者完全隔离，防止跨客户端数据泄露

| 场景 | 数据可见性 |
|------|-----------|
| Web 用户（JWT） | 只能看到自己创建的绑定（`api_key_user_id` 为空） |
| 第三方客户端（API Key） | 只能看到该 API Key 创建的绑定 |
| 不同 API Key 使用相同 `user_identifier` | **互相不可见**，数据完全隔离 |

**示例说明**:
- 客户端 A（API Key A）为用户 `QQ12345` 创建绑定
- 客户端 B（API Key B）也为用户 `QQ12345` 创建绑定
- 客户端 A **无法**看到或操作客户端 B 的绑定数据，反之亦然

### 获取绑定列表

**Web 用户**:
```http
GET /api/v1/bindings
Authorization: Bearer your-access-token
```

**第三方客户端**（必须携带 API Key）:
```http
GET /api/v1/bindings?user_identifier=QQ12345&client_type=bot
X-API-Key: your-api-key
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| user_identifier | string | 条件必填 | 用户标识（无 JWT 时必填） |
| client_type | string | 否 | 过滤客户端类型：web/bot/third_party |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "bindings": [
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "role_id": "123456",
        "nickname": "玩家昵称#1234",
        "server_id": 1,
        "client_type": "bot",
        "is_primary": true,
        "is_valid": true,
        "framework_token": "uuid-xxx-xxx",
        "created_at": "2026-01-26T14:00:00+08:00"
      }
    ],
    "count": 1
  }
}
```

**错误响应**（第三方客户端未提供 API Key）:
```json
{
  "code": 401,
  "message": "第三方客户端必须提供有效的 API Key（X-API-Key header）"
}
```

### 创建绑定

**Web 用户**:
```http
POST /api/v1/bindings
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "framework_token": "uuid-xxx-xxx",
  "is_primary": true
}
```

**第三方客户端**（必须携带 API Key）:
```http
POST /api/v1/bindings
X-API-Key: your-api-key
Content-Type: application/json

{
  "framework_token": "uuid-xxx-xxx",
  "user_identifier": "QQ12345",
  "client_type": "bot",
  "client_id": "my-bot-001",
  "is_primary": true
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| framework_token | string | 是 | 登录后获取的统一凭证 |
| user_identifier | string | 条件必填 | 用户标识（无 JWT 时必填） |
| client_type | string | 否 | 客户端类型：web/bot/third_party |
| client_id | string | 否 | 客户端标识 |
| is_primary | bool | 否 | 是否设为主绑定 |

**响应示例**:
```json
{
  "code": 0,
  "message": "绑定成功",
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "role_id": "123456",
    "nickname": "玩家昵称#1234",
    "framework_token": "uuid-xxx-xxx"
  }
}
```

### 删除绑定

**Web 用户**:
```http
DELETE /api/v1/bindings/:id
Authorization: Bearer your-access-token
```

**第三方客户端**:
```http
DELETE /api/v1/bindings/:id
X-API-Key: your-api-key
```

> 注意：只能删除自己创建的绑定（按 API Key 所有者隔离）

### 设置主绑定

```http
POST /api/v1/bindings/:id/primary
Authorization: Bearer your-access-token  # 或 X-API-Key
```

### 刷新绑定凭证

手动刷新凭证库中的 Token（通常自动刷新，无需手动调用）。

```http
POST /api/v1/bindings/:id/refresh
Authorization: Bearer your-access-token  # 或 X-API-Key
```

---

### 兼容旧 API

> 以下接口为兼容保留，建议使用新的 `/api/v1/bindings` 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/user/binding` | 获取绑定列表 |
| POST | `/user/binding` | 添加绑定 |
| DELETE | `/user/binding/:id` | 删除绑定 |

---

## 终末地数据 API（游戏数据查询）

> ⚠️ 以下接口需要**双重凭证**：
>
> 1. **接口认证**（三选一）：
>    - `X-API-Key: sk_xxx` - 第三方开发者
>    - `Authorization: Bearer <jwt>` - 网站登录用户
>    - `X-Anonymous-Token: anon_xxx` - 匿名用户
>
> 2. **游戏数据凭证**：
>    - `X-Framework-Token: uuid-xxx` - 用于查询特定用户的游戏数据
>
> **Framework Token** 是游戏账号绑定后获得的凭证，**仅用于**指定查询哪个用户的数据。
> 没有它可以调用接口（认证通过），但无法获取游戏数据。

### 获取终末地绑定信息

```http
GET /api/endfield/binding
X-Framework-Token: your-framework-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "appCode": "endfield",
    "appName": "明日方舟：终末地",
    "bindingList": [
      {
        "uid": "123456",
        "nickName": "玩家昵称",
        "channelName": "官服",
        "isDefault": true
      }
    ]
  }
}
```

### 获取森空岛用户信息

```http
GET /api/endfield/user
X-Framework-Token: your-framework-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "user": {
      "id": "123456",
      "nickname": "用户昵称",
      "avatar": "https://...",
      "gender": 0
    },
    "gameStatus": {
      "ap": {
        "current": 77,
        "max": 82
      },
      "level": 1,
      "name": "玩家名#1234"
    }
  }
}
```

### 获取角色详情卡片

```http
GET /api/endfield/card/detail
X-Framework-Token: your-framework-token
```

**Query 参数**（全部可选，不提供则从凭证库自动获取）:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId | string | 否 | 游戏角色 ID，不提供则使用凭证库存储的 |
| serverId | int | 否 | 服务器 ID，不提供则使用凭证库存储的，默认 1 |

> `roleId`、`serverId`、`userId` 都由后端自动从凭证库获取，前端可以完全不传参数。

### 获取干员详情

```http
GET /api/endfield/card/char?instId=xxx
X-Framework-Token: your-framework-token
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| instId | string | **是** | 干员实例 ID（对应 `/note` 接口返回的 `chars[].id`） |
| roleId | string | 否 | 游戏角色 ID，不提供则使用凭证库存储的 |
| serverId | int | 否 | 服务器 ID，不提供则使用凭证库存储的，默认 1 |

> `roleId`、`serverId`、`userId` 由后端自动从凭证库获取，前端只需传 `instId`。

### 终末地签到

```http
POST /api/endfield/attendance
X-Framework-Token: your-framework-token
```

> ⚠️ 签到接口会自动获取默认角色进行签到，无需手动传递 roleId。
> 后端会自动处理签到所需的特殊请求头配置。

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "awardIds": [
      { "id": "item_001", "count": 100 }
    ],
    "resourceInfoMap": {
      "item_001": {
        "id": "item_001",
        "name": "物品名",
        "count": 100
      }
    }
  }
}
```

**已签到响应**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "already_signed": true,
    "message": "今日已签到"
  }
}
```

### 搜索干员列表

```http
GET /api/endfield/search/chars
X-Framework-Token: your-framework-token
```

### 搜索武器列表

```http
GET /api/endfield/search/weapons
X-Framework-Token: your-framework-token
```

### 搜索装备列表

```http
GET /api/endfield/search/equipments
X-Framework-Token: your-framework-token
```

### 搜索战术道具列表

```http
GET /api/endfield/search/tactical-items
X-Framework-Token: your-framework-token
```

---

## Wiki 百科 API

> **接口认证**: 需要 API Key / Web JWT / Anonymous Token 三选一
> **数据来源**: 从森空岛同步的终末地百科数据
> **缓存策略**: 使用 Redis 缓存，提升查询性能

### 接口概览

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/wiki/categories` | 获取主分类列表 |
| GET | `/api/wiki/categories/:main_type_id/sub` | 获取子分类列表 |
| GET | `/api/wiki/items` | 获取条目列表（支持筛选） |
| GET | `/api/wiki/items/:id` | 获取条目详情 |
| GET | `/api/wiki/search` | 全文搜索 |
| GET | `/api/wiki/char-pools` | 获取角色卡池 |
| GET | `/api/wiki/activities` | 获取活动列表 |
| GET | `/api/wiki/stickers` | 获取表情包列表 |
| GET | `/api/wiki/stats` | 获取统计信息 |
| POST | `/api/wiki/admin/sync` | 手动触发同步 |
| GET | `/api/wiki/admin/sync/status` | 获取同步状态 |

### 分类结构

#### 主分类 (typeMainId)

| ID | 名称 | 说明 |
|----|------|------|
| 1 | 游戏百科 | 游戏内容百科（干员、武器、威胁等） |
| 2 | 游戏攻略辑 | 攻略相关内容 |
| 3 | 情报档案库 | 情报、视频、壁纸等 |

#### 子分类 (typeSubId)

**游戏百科 (typeMainId=1)**
| ID | 名称 | 说明 |
|----|------|------|
| 1 | 干员 | 可操作角色 |
| 2 | 武器 | 武器装备 |
| 3 | 威胁 | 敌方/威胁单位 |
| 4 | 装备 | 角色装备 |
| 5 | 设备 | 设备类物品 |
| 6 | 物品 | 普通物品 |
| 7 | 武器基质 | 武器强化素材 |
| 8 | 任务 | 任务条目 |
| 9 | 活动 | 活动相关 |

**游戏攻略辑 (typeMainId=2)**
| ID | 名称 | 说明 |
|----|------|------|
| 10 | 新手入门 | 新手攻略 |
| 11 | 干员攻略 | 干员使用攻略 |
| 16 | 贵重物品库 | 收藏品 |
| 18 | 系统蓝图 | 蓝图/配方 |

**情报档案库 (typeMainId=3)**
| ID | 名称 | 说明 |
|----|------|------|
| 12 | 情报快讯 | 游戏情报 |
| 13 | 游戏视频 | 视频内容 |
| 14 | 游戏壁纸 | 壁纸资源 |

---

### 获取主分类列表

```http
GET /api/wiki/categories
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": [
    {
      "type_id": "1",
      "name": "游戏百科",
      "status": 1,
      "position": 1,
      "created_at": "2026-01-31T12:00:00Z",
      "updated_at": "2026-01-31T12:00:00Z"
    },
    {
      "type_id": "2",
      "name": "游戏攻略辑",
      "status": 1,
      "position": 2
    },
    {
      "type_id": "3",
      "name": "情报档案库",
      "status": 1,
      "position": 3
    }
  ]
}
```

---

### 获取子分类列表

```http
GET /api/wiki/categories/:main_type_id/sub
X-API-Key: your-api-key
```

**路径参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| main_type_id | string | 是 | 主分类 ID（1/2/3） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": [
    {
      "sub_id": "1",
      "main_type_id": "1",
      "name": "干员",
      "icon": "https://...",
      "style": 1,
      "status": 1,
      "position": 1,
      "item_count": 24
    },
    {
      "sub_id": "2",
      "main_type_id": "1",
      "name": "武器",
      "item_count": 62
    }
  ]
}
```

---

### 获取条目列表

```http
GET /api/wiki/items?main_type_id=1&sub_type_id=1&page=1&page_size=20
X-API-Key: your-api-key
```

**查询参数**：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| main_type_id | string | 否 | - | 主分类 ID |
| sub_type_id | string | 否 | - | 子分类 ID |
| page | int | 否 | 1 | 页码 |
| page_size | int | 否 | 20 | 每页数量（最大 100） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "items": [
      {
        "item_id": "7",
        "main_type_id": "1",
        "sub_type_id": "1",
        "name": "莱万汀",
        "lang": "zh_Hans",
        "status": 2,
        "published_at": "2026-01-11T12:00:00Z",
        "cover": "https://bbs.hycdn.cn/image/...",
        "associate": {
          "id": "0b199a0eaae5a9b37a5d3c990b6c8bca",
          "name": "莱万汀",
          "type": "char",
          "dot_type": "label_type_up"
        },
        "sub_type_list": [
          { "sub_type_id": "10000", "value": "10006" },
          { "sub_type_id": "10200", "value": "10203" }
        ],
        "caption": [
          { "kind": "text", "text": { "text": ""火焰，照亮黄昏！"" } }
        ],
        "tag_ids": ["10203", "10006", "10101"]
      }
    ],
    "total": 24,
    "page": 1,
    "page_size": 20,
    "total_pages": 2
  }
}
```

---

### 获取条目详情

```http
GET /api/wiki/items/:id
X-API-Key: your-api-key
```

**路径参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 条目 ID（item_id） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "item_id": "7",
    "name": "莱万汀",
    "main_type_id": "1",
    "sub_type_id": "1",
    "cover": "https://bbs.hycdn.cn/image/...",
    "caption": [
      { "kind": "text", "text": ""火焰，照亮黄昏！"" }
    ],
    "content": {
      "document_map": {
        "doc_id_1": {
          "id": "document-id",
          "block_ids": ["block1", "block2"],
          "block_map": {
            "block1": {
              "id": "block1",
              "parent_id": "document-id",
              "kind": "text",
              "align": "left",
              "text": {
                "inline_elements": [
                  { "kind": "text", "text": "代号：", "bold": true },
                  { "kind": "text", "text": "莱万汀" }
                ],
                "kind": "body"
              }
            },
            "block2": {
              "id": "block2",
              "parent_id": "document-id",
              "kind": "table",
              "table": {
                "id": "block2",
                "row_ids": ["r1", "r2"],
                "column_ids": ["c1", "c2"],
                "row_map": { "r1": {"id": "r1"}, "r2": {"id": "r2"} },
                "column_map": { "c1": {"id": "c1", "width": 200}, "c2": {"id": "c2", "width": 200} },
                "cell_map": { "r1_c1": {"id": "r1_c1", "child_ids": ["text_block"]} }
              }
            }
          }
        }
      }
    },
    "associate": {...},
    "sub_type_list": [...],
    "tag_ids": [...]
  }
}
```

**content 文档结构**：

| 层级 | 字段 | 说明 |
|------|------|------|
| 根 | `document_map` | 文档映射，key 为文档 ID |
| 根 | `chapter_group` | 章节组（攻略内容分章节） |
| 根 | `widget_common_map` | 通用组件映射（攻略 tab 切换） |
| 根 | `extra_info` | 额外信息（展示类型等） |
| 文档 | `block_ids` | 顶级块 ID 列表（渲染顺序） |
| 文档 | `block_map` | 所有块的映射 |

**块类型 (kind)**：
| kind | 说明 | 特有字段 |
|------|------|----------|
| `text` | 文本块 | `text.inline_elements[]`, `text.kind` (body/heading3) |
| `table` | 表格 | `table.row_ids`, `table.column_ids`, `table.cell_map` |
| `horizontalLine` | 分割线 | `horizontal_line.kind` (2/3/5) |
| `list` | 列表 | `list.item_ids`, `list.item_map`, `list.kind` |
| `image` | 图片 | `image.src`, `image.width`, `image.height` |
| `video` | 视频 | `video.src`, `video.cover`, `video.duration` |

**行内元素 (inline_elements)**：
| kind | 说明 | 额外字段 |
|------|------|----------|
| `text` | 文本 | `text`, `bold`, `color` |
| `entry` | 条目引用 | `entry.id`, `entry.show_type`, `entry.count` |
| `link` | 链接 | `link.url`, `link.text` |

**攻略数据特殊结构**（typeMainId=2，如干员攻略）：

攻略条目包含多个作者的内容，通过 `widget_common_map` 中的 tab 切换展示：

```json
{
  "content": {
    "document_map": {
      "doc_key_1": { "block_ids": [...], "block_map": {...} },
      "doc_key_2": { "block_ids": [...], "block_map": {...} }
    },
    "chapter_group": [
      {
        "title": "攻略",
        "widgets": [
          { "id": "widget_id", "title": "", "size": "large" }
        ]
      }
    ],
    "widget_common_map": {
      "widget_id": {
        "type": "common",
        "tab_list": [
          { "tab_id": "tab_1", "title": "作者1", "icon": "" },
          { "tab_id": "tab_2", "title": "作者2", "icon": "" }
        ],
        "tab_data_map": {
          "tab_1": { "content": "doc_key_1", "audio_list": [] },
          "tab_2": { "content": "doc_key_2", "audio_list": [] }
        }
      }
    },
    "extra_info": {
      "show_type": "",
      "illustration": "",
      "composite": ""
    }
  }
}
```

| 字段 | 说明 |
|------|------|
| `chapter_group[].widgets[].id` | 引用 `widget_common_map` 中的组件 |
| `widget_common_map.*.tab_list` | tab 列表，`title` 为作者名 |
| `widget_common_map.*.tab_data_map.*.content` | 指向 `document_map` 中的 key |

---

### 全文搜索

```http
GET /api/wiki/search?q=莱万汀&main_type_id=1&page=1&page_size=20
X-API-Key: your-api-key
```

**查询参数**：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| q | string | **是** | - | 搜索关键词（或使用 `keyword`） |
| keyword | string | 否 | - | 搜索关键词（`q` 的别名） |
| main_type_id | string | 否 | - | 主分类 ID 筛选 |
| sub_type_id | string | 否 | - | 子分类 ID 筛选 |
| page | int | 否 | 1 | 页码 |
| page_size | int | 否 | 20 | 每页数量（最大 100） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "items": [...],
    "total": 5,
    "page": 1,
    "page_size": 20,
    "total_pages": 1
  }
}
```

---

### 获取角色卡池

```http
GET /api/wiki/char-pools
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": [
    {
      "pool_id": "2",
      "name": "熔火灼痕",
      "chars": [
        {
          "id": "0b199a0eaae5a9b37a5d3c990b6c8bca",
          "name": "莱万汀",
          "pic": "https://bbs.hycdn.cn/image/2025/11/12/xxx.png",
          "pc_link": "https://wiki.skland.com/endfield/detail?...",
          "rarity": "rarity_6",
          "dot_type": "label_type_up"
        }
      ],
      "pool_start_at_ts": "1769050800",
      "pool_end_at_ts": "1770436799",
      "start_at_ts": "1768536000",
      "end_at_ts": "1770436799",
      "europe_pool_start_at_ts": "1769004000",
      "europe_pool_end_at_ts": "1770389999",
      "sort_id": 2
    }
  ]
}
```

**字段说明**：
| 字段 | 说明 |
|------|------|
| `pool_id` | 卡池ID |
| `name` | 卡池名称 |
| `chars[].id` | 角色ID（associate.id） |
| `chars[].name` | 角色名称（自动从 Wiki 条目补充） |
| `chars[].dot_type` | 标签类型（`label_type_up` 表示 UP 角色） |
| `pool_start_at_ts` | 卡池开始时间戳 |
| `pool_end_at_ts` | 卡池结束时间戳 |

> **说明**：原始 API 返回的角色名字为空，系统在同步时会自动通过 `associate.id` 查询 Wiki 条目补充角色名字。

---

### 获取活动列表

```http
GET /api/wiki/activities
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": [
    {
      "activity_id": "act_001",
      "name": "开服活动",
      "type": 1,
      "start_time": "2026-01-15T00:00:00Z",
      "end_time": "2026-02-15T23:59:59Z",
      "description": "开服限时活动",
      "cover": "https://..."
    }
  ]
}
```

---

### 获取表情包列表

```http
GET /api/wiki/stickers
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": [
    {
      "category_name": "终末地表情包",
      "title": "终末地官方表情",
      "version": 1,
      "position": 1,
      "cover": "https://...",
      "images": [
        {
          "id": "sticker_001",
          "title": "点赞",
          "path": "https://...",
          "name": "thumbs_up"
        }
      ]
    }
  ]
}
```

---

### 获取统计信息

```http
GET /api/wiki/stats
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "main_categories_count": 3,
    "sub_categories_count": 16,
    "items_count": 1027,
    "char_pools_count": 1,
    "activities_count": 8,
    "stickers_count": 11,
    "last_sync": {
      "status": "completed",
      "started_at": "2026-01-31T12:00:00Z",
      "completed_at": "2026-01-31T12:00:30Z",
      "main_categories_synced": 3,
      "sub_categories_synced": 16,
      "items_synced": 1027,
      "char_pools_synced": 1,
      "activities_synced": 8,
      "stickers_synced": 11
    }
  }
}
```

---

### 手动触发同步

```http
POST /api/wiki/admin/sync
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "同步任务已启动",
    "status": "running"
  }
}
```

**错误响应**（同步进行中）：
```json
{
  "code": 409,
  "message": "同步任务已在运行中"
}
```

---

### 获取同步状态

```http
GET /api/wiki/admin/sync/status
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "is_running": false,
    "last_task": {
      "id": "65f1a2b3c4d5e6f7...",
      "status": "completed",
      "started_at": "2026-01-31T12:00:00Z",
      "completed_at": "2026-01-31T12:00:30Z",
      "main_categories_synced": 3,
      "sub_categories_synced": 16,
      "items_synced": 1027,
      "char_pools_synced": 1,
      "activities_synced": 8,
      "stickers_synced": 11
    }
  }
}
```

---

### 子类型标签说明

#### 星级 (subTypeId: 10000)
| 值 | 说明 |
|-----|------|
| 10001 | 1星 |
| 10002 | 2星 |
| 10003 | 3星 |
| 10004 | 4星 |
| 10005 | 5星 |
| 10006 | 6星 |

#### 干员职业 (subTypeId: 10200)
| 值 | 说明 |
|-----|------|
| 10201 | 近卫 |
| 10202 | 术师 |
| 10203 | 突击 |
| 10204 | 先锋 |
| 10205 | 重装 |
| 10206 | 辅助 |

### 缓存策略

| 数据类型 | 缓存时间 | 说明 |
|----------|----------|------|
| 主分类列表 | 1 小时 | 分类变化不频繁 |
| 子分类列表 | 1 小时 | 分类变化不频繁 |
| 条目列表 | 30 分钟 | 条目列表 |
| 条目详情 | 30 分钟 | 详情数据 |
| 角色卡池 | 1 小时 | 卡池变化不频繁 |
| 活动列表 | 30 分钟 | 活动可能更新 |
| 表情包 | 1 小时 | 表情包变化不频繁 |
| 搜索结果 | 10 分钟 | 搜索缓存较短 |
| 统计信息 | 5 分钟 | 实时性要求较高 |

### 数据同步

- **同步间隔**：每 6 小时自动同步
- **首次启动**：服务启动 30 秒后自动执行首次同步
- **同步方式**：全量同步（使用公共账号池，复用同一客户端保持时间戳同步）
- **优雅关闭**：支持 context 取消信号，关闭时有 5 秒超时保护
- **数据来源**：森空岛 Wiki 接口
  - `/web/v1/wiki/item/catalog` - 百科目录和条目（基本信息）
  - `/web/v1/wiki/item/info?id=` - 条目详情（完整内容，每条目单独请求）
  - `/web/v1/wiki/char-pool` - 角色卡池
  - `/web/v1/wiki/activity` - 活动列表
  - `/web/v1/sticker-categories` - 表情包列表

**角色卡池名字补充**：
- 原始 char-pool API 返回的角色 `name` 字段为空
- 同步时自动通过 `chars[].id` 查询 Wiki 条目的 `brief.associate.id`
- 补充角色名字后保存到数据库

**与抽卡统计联动**：
- 抽卡统计的 "当前卡池信息" 自动从 Wiki 角色卡池数据获取
- 根据卡池有效期判断当前活跃卡池，获取 UP 角色信息

---

## B站 Wiki API

> **接口认证**: 需要 API Key / Web JWT / Anonymous Token 三选一
> **数据来源**: 从哔哩哔哩终末地 Wiki（wiki.biligame.com/zmd）抓取的数据
> **同步机制**: 每 6 小时自动同步，首次启动 60 秒后执行

### 接口概览

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/bili-wiki/operators` | 获取干员列表 |
| GET | `/api/bili-wiki/operators/:name` | 获取干员详情 |
| GET | `/api/bili-wiki/weapons` | 获取武器列表 |
| GET | `/api/bili-wiki/weapons/:name` | 获取武器详情 |
| GET | `/api/bili-wiki/equipments` | 获取装备列表 |
| GET | `/api/bili-wiki/equipments/:name` | 获取装备详情 |
| GET | `/api/bili-wiki/devices` | 获取设备列表 |
| GET | `/api/bili-wiki/devices/:name` | 获取设备详情 |
| GET | `/api/bili-wiki/items` | 获取物品列表 |
| GET | `/api/bili-wiki/items/:name` | 获取物品详情 |
| GET | `/api/bili-wiki/enemies` | 获取敌对单位列表 |
| GET | `/api/bili-wiki/enemies/:name` | 获取敌对单位详情 |
| GET | `/api/bili-wiki/activities` | 获取活动列表（特许寻访/武库申领） |
| GET | `/api/bili-wiki/search` | 全文搜索 |
| GET | `/api/bili-wiki/stats` | 获取统计信息 |
| POST | `/api/bili-wiki/admin/sync` | 手动触发同步 |
| GET | `/api/bili-wiki/admin/sync/status` | 获取同步状态 |

---

### 获取干员列表

```http
GET /api/bili-wiki/operators?rarity=6&profession=突击&page=1&page_size=20
X-API-Key: your-api-key
```

**查询参数**：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| rarity | string | 否 | - | 稀有度筛选（如 `6` 或 `橙色`） |
| profession | string | 否 | - | 职业筛选（近卫/术师/突击/先锋/重装/辅助） |
| page | int | 否 | 1 | 页码 |
| page_size | int | 否 | 20 | 每页数量（最大 100） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "items": [
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "name": "莱万汀",
        "rarity": "橙色",
        "profession": "突击",
        "tags": "近战, 攻击型",
        "icon_url": "https://patchwiki.biligame.com/images/...",
        "detail_url": "https://wiki.biligame.com/zmd/莱万汀",
        "created_at": "2026-02-04T12:00:00Z",
        "updated_at": "2026-02-04T12:00:00Z"
      }
    ],
    "total": 23,
    "page": 1,
    "page_size": 20,
    "total_pages": 2
  }
}
```

---

### 获取干员详情

```http
GET /api/bili-wiki/operators/莱万汀
X-API-Key: your-api-key
```

**路径参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 干员名称（URL 编码） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "name": "莱万汀",
    "rarity": "橙色",
    "profession": "突击",
    "tags": "近战, 攻击型",
    "icon_url": "https://patchwiki.biligame.com/images/...",
    "detail_url": "https://wiki.biligame.com/zmd/莱万汀",
    "detail": {
      "description": "干员描述...",
      "skills": [...],
      "stats": {...}
    }
  }
}
```

---

### 获取武器列表

```http
GET /api/bili-wiki/weapons?rarity=5&type=步枪&page=1&page_size=20
X-API-Key: your-api-key
```

**查询参数**：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| rarity | string | 否 | - | 稀有度筛选 |
| type | string | 否 | - | 武器类型筛选 |
| page | int | 否 | 1 | 页码 |
| page_size | int | 否 | 20 | 每页数量 |

---

### 获取物品列表

```http
GET /api/bili-wiki/items?rarity=5&type=采集材料&page=1&page_size=20
X-API-Key: your-api-key
```

**查询参数**：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| rarity | string | 否 | - | 稀有度筛选（如 `5星`） |
| type | string | 否 | - | 物品类型筛选（采集材料、矿物、植物等） |
| page | int | 否 | 1 | 页码 |
| page_size | int | 否 | 20 | 每页数量 |

---

### 获取敌对单位列表

```http
GET /api/bili-wiki/enemies?type=野外生物&level=普通敌人&page=1&page_size=20
X-API-Key: your-api-key
```

**查询参数**：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| type | string | 否 | - | 敌对类型（野外生物、机械单位等） |
| level | string | 否 | - | 等级（普通敌人、进阶敌人、精英敌人、BOSS） |
| page | int | 否 | 1 | 页码 |
| page_size | int | 否 | 20 | 每页数量 |

---

### 获取活动列表

获取首页的特许寻访和武库申领活动。

```http
GET /api/bili-wiki/activities?type=特许寻访&active_only=true
X-API-Key: your-api-key
```

**查询参数**：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| type | string | 否 | - | 活动类型（特许寻访/武库申领） |
| active_only | bool | 否 | false | 是否只返回进行中的活动 |

**响应字段说明**：
| 字段 | 类型 | 说明 |
|------|------|------|
| name | string | 活动名称 |
| type | string | 活动类型（特许寻访/武库申领） |
| start_time | string | 开始时间 |
| end_time | string | 结束时间 |
| description | string | 描述（特许寻访为其他关联活动；武库申领为 UP 武器名） |
| up | string | 所属卡池的 UP 角色或武器名（如熔铸火焰、莱万汀） |
| image_url | string | 图片 URL |
| detail_url | string | 详情页 URL |
| is_active | bool | 是否进行中 |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "items": [
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "name": "特许寻访·熔火灼痕",
        "type": "特许寻访",
        "start_time": "2026/1/22 11:00",
        "end_time": "2026/2/7 11:59",
        "is_active": true,
        "image_url": "https://patchwiki.biligame.com/images/...",
        "detail_url": "https://wiki.biligame.com/zmd/莱万汀",
        "description": "限时签到·行火留烬 / 作战演练·莱万汀",
        "up": "莱万汀"
      },
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d2",
        "name": "武库申领·熔铸申领",
        "type": "武库申领",
        "start_time": "2026/1/22 11:00",
        "end_time": "2026/3/12",
        "is_active": true,
        "image_url": "https://patchwiki.biligame.com/images/...",
        "detail_url": "https://wiki.biligame.com/zmd/熔铸火焰",
        "description": "熔铸火焰",
        "up": "熔铸火焰"
      }
    ],
    "total": 6
  }
}
```

---

### 全文搜索

```http
GET /api/bili-wiki/search?q=莱万汀&type=operator&page=1&page_size=20
X-API-Key: your-api-key
```

**查询参数**：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| q | string | **是** | - | 搜索关键词 |
| type | string | 否 | all | 搜索类型：`all`/`operator`/`weapon`/`equipment`/`device`/`item`/`enemy` |
| page | int | 否 | 1 | 页码 |
| page_size | int | 否 | 20 | 每页数量 |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "results": {
      "operators": [...],
      "weapons": [...],
      "items": [...]
    },
    "total": 5
  }
}
```

---

### 获取统计信息

```http
GET /api/bili-wiki/stats
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "operators_count": 23,
    "weapons_count": 62,
    "equipments_count": 161,
    "devices_count": 63,
    "items_count": 246,
    "enemies_count": 85,
    "activities_count": 6,
    "last_sync": {
      "status": "completed",
      "started_at": "2026-02-04T12:00:00Z",
      "completed_at": "2026-02-04T12:01:52Z",
      "operators_synced": 23,
      "weapons_synced": 62,
      "equipments_synced": 161,
      "devices_synced": 63,
      "items_synced": 246,
      "enemies_synced": 85,
      "activities_synced": 6
    }
  }
}
```

---

### 手动触发同步

```http
POST /api/bili-wiki/admin/sync
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "同步任务已启动",
    "status": "running"
  }
}
```

**错误响应**（同步进行中）：
```json
{
  "code": 409,
  "message": "同步任务已在运行中"
}
```

---

### 获取同步状态

```http
GET /api/bili-wiki/admin/sync/status
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "is_running": false,
    "last_task": {
      "id": "65f1a2b3c4d5e6f7...",
      "status": "completed",
      "started_at": "2026-02-04T12:00:00Z",
      "completed_at": "2026-02-04T12:01:52Z",
      "operators_synced": 23,
      "weapons_synced": 62,
      "equipments_synced": 161,
      "devices_synced": 63,
      "items_synced": 246,
      "enemies_synced": 85,
      "activities_synced": 6,
      "error_message": ""
    }
  }
}
```

---

### 数据同步机制

- **同步间隔**：每 6 小时自动同步
- **首次启动**：服务启动 60 秒后执行首次同步
- **同步方式**：HTML 页面抓取 + goquery 解析
- **请求间隔**：200ms（防止 IP 被封）
- **优雅关闭**：支持 context 取消信号
- **数据来源**：哔哩哔哩终末地 Wiki
  - `/zmd/干员图鉴` - 干员列表
  - `/zmd/武器图鉴` - 武器列表
  - `/zmd/装备图鉴` - 装备列表
  - `/zmd/设备图鉴` - 设备列表
  - `/zmd/物品图鉴` - 物品列表
  - `/zmd/敌对图鉴` - 敌对单位列表
  - `/zmd/首页` - 特许寻访和武库申领活动

### 与森空岛 Wiki 的区别

| 特性 | 森空岛 Wiki | B站 Wiki |
|------|------------|---------|
| 数据来源 | 官方 API | HTML 页面抓取 |
| 数据结构 | 结构化 JSON | 从 HTML 解析 |
| 更新频率 | 较快 | 取决于社区编辑 |
| 内容范围 | 官方数据 | 社区补充（攻略等） |
| 同步方式 | API 调用 | HTTP + goquery |

---

## 公告 API

> **接口认证**: 需要 API Key / Web JWT / Anonymous Token 三选一
> **数据来源**: 从森空岛终末地官方账号（3737967211133）同步的公告数据
> **同步机制**: 每 2 分钟自动检查并同步新公告

### 认证方式

所有公告接口都需要认证，支持以下三种方式（任选其一）：

| 认证方式 | Header | 说明 |
|----------|--------|------|
| API Key | `X-API-Key: your-api-key` | 第三方开发者使用 |
| Web JWT | `Authorization: Bearer <access_token>` | 网站登录用户 |
| Anonymous Token | `X-Anonymous-Token: anon_xxx` | 匿名用户（需先获取） |

### 接口概览

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/announcements` | 获取公告列表（支持分页和筛选） |
| GET | `/api/announcements/latest` | 获取最新公告 |
| GET | `/api/announcements/:id` | 获取公告详情 |
| POST | `/api/announcements/admin/sync` | 手动触发同步 |
| GET | `/api/announcements/admin/sync/status` | 获取同步状态 |
| POST | `/api/announcements/admin/resync-details` | 重新同步公告详情（补全缺失数据） |

---

### 获取公告列表

```http
GET /api/announcements?page=1&page_size=20
X-API-Key: your-api-key
```

**查询参数**：
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| page | int | 否 | 1 | 页码 |
| page_size | int | 否 | 20 | 每页数量（最大 100） |
| game_id | int | 否 | - | 按游戏 ID 筛选 |
| cate_id | int | 否 | - | 按分类 ID 筛选 |
| view_kind | int | 否 | - | 按类型筛选（1=视频, 3=图文） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "list": [
      {
        "id": "65f1a2b3c4d5e6f7a8b9c0d1",
        "item_id": "4023334",
        "view_kind": 3,
        "game_id": 105,
        "cate_id": 8,
        "title": "「悬赏通缉」玩法已开启",
        "subtitle": "全新活动上线",
        "published_at": "2026-02-02T12:00:00Z",
        "published_at_ts": 1738483200,
        "images": ["https://bbs.hycdn.cn/..."],
        "user": {
          "id": "3737967211133",
          "nickname": "终末地官方",
          "avatar": "https://..."
        },
        "stats": {
          "like_count": 1234,
          "comment_count": 56,
          "view_count": 10000,
          "bookmark_count": 89
        }
      }
    ],
    "total": 100,
    "page": 1,
    "page_size": 20,
    "has_more": true
  }
}
```

**字段说明**：
| 字段 | 类型 | 说明 |
|------|------|------|
| item_id | string | 公告唯一 ID（来自森空岛） |
| view_kind | int | 内容类型（1=视频, 3=图文） |
| game_id | int | 游戏 ID（105=终末地） |
| cate_id | int | 分类 ID（8=公告） |
| published_at_ts | int64 | 发布时间戳（秒），用于判断新公告 |
| images | array | 内容中的图片列表 |
| content | object | 富文本内容（blocks 结构） |
| format | string | 完整内容格式（JSON 字符串，保留原格式） |

---

### 获取公告详情

```http
GET /api/announcements/:id
X-API-Key: your-api-key
```

**路径参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| id | string | 是 | 公告 item_id |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "id": "65f1a2b3c4d5e6f7a8b9c0d1",
    "item_id": "4023334",
    "title": "「悬赏通缉」玩法已开启",
    "texts": [
      { "id": "t1", "content": "亲爱的管理员：\n\n活动内容详情..." }
    ],
    "images": [
      {
        "id": "i1",
        "url": "https://bbs.hycdn.cn/...",
        "width": 1920,
        "height": 1080
      }
    ],
    "links": [
      { "id": "l1", "url": "https://example.com/activity" }
    ],
    "videos": [],
    "caption": [
      { "type": "text", "id": "t1" },
      { "type": "image", "id": "i1" }
    ],
    "format": "{\"blocks\":[...]}",
    "thumbnail": "https://bbs.hycdn.cn/thumb/...",
    "published_at_ts": 1738483200,
    "user": {
      "id": "3737967211133",
      "nickname": "终末地官方",
      "avatar": "https://..."
    },
    "stats": {
      "liked": 1234,
      "collected": 89,
      "reposted": 12,
      "commented": 56
    },
    "tags": [
      { "id": "tag_1", "name": "活动" }
    ],
    "detail_synced": true,
    "detail_synced_at": "2026-02-05T12:00:00Z",
    "raw_data": "{...完整的森空岛原始响应 JSON...}"
  }
}
```

**字段说明**：
| 字段 | 类型 | 说明 |
|------|------|------|
| texts | array | 文本内容列表，每项包含 `id` 和 `content` |
| images | array | 图片列表，包含尺寸信息 |
| links | array | 链接列表，每项包含 `id` 和 `url` |
| videos | array | 视频列表（如有） |
| caption | array | 内容排版顺序，指定各元素的显示顺序 |
| format | string | 详细排版格式（JSON 字符串，描述复杂布局） |
| thumbnail | string | 缩略图 URL |
| detail_synced | boolean | 详情是否已同步（true 表示有完整数据） |
| detail_synced_at | string | 详情同步时间 |
| raw_data | string | 森空岛接口返回的完整原始 JSON（用于调试或获取未解析字段） |

> **注意**：`raw_data` 字段包含完整的森空岛原始响应，确保不会遗漏任何字段。
> 如果 `detail_synced` 为 `false`，表示公告只有列表数据，可能缺少完整文本内容。

---

### 获取最新公告

获取最新的一条公告，用于客户端轮询检查是否有新公告。

```http
GET /api/announcements/latest
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "item_id": "4023334",
    "title": "「悬赏通缉」玩法已开启",
    "published_at_ts": 1738483200,
    "published_at": "2026-02-02T12:00:00Z"
  }
}
```

**客户端轮询示例**：
```javascript
let lastKnownTimestamp = 0;

const checkNewAnnouncement = async () => {
  const res = await fetch('/api/announcements/latest', {
    headers: { 'X-API-Key': API_KEY }
  });
  const { data } = await res.json();
  
  if (data.published_at_ts > lastKnownTimestamp) {
    // 有新公告
    showNotification(data.title);
    lastKnownTimestamp = data.published_at_ts;
  }
};

// 建议每 2-5 分钟轮询一次
setInterval(checkNewAnnouncement, 2 * 60 * 1000);
```

---

### 手动触发同步

```http
POST /api/announcements/admin/sync
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "同步任务已启动"
  }
}
```

**错误响应**（同步进行中）：
```json
{
  "code": 400,
  "message": "同步任务正在执行中"
}
```

---

### 获取同步状态

```http
GET /api/announcements/admin/sync/status
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "is_running": false,
    "total_announcements": 100,
    "need_detail_resync_count": 5,
    "last_sync": {
      "status": "completed",
      "started_at": "2026-02-02T12:00:00Z",
      "completed_at": "2026-02-02T12:00:05Z",
      "items_synced": 10,
      "new_items_found": 2,
      "error_message": ""
    }
  }
}
```

**字段说明**：
| 字段 | 类型 | 说明 |
|------|------|------|
| is_running | boolean | 是否正在同步 |
| total_announcements | int | 公告总数 |
| need_detail_resync_count | int | 需要重新同步详情的公告数量（`detail_synced=false` 或 `raw_data` 为空） |
| last_sync | object | 最近一次同步任务信息 |

**同步状态说明**：
| status | 说明 |
|--------|------|
| running | 同步中 |
| completed | 同步完成 |
| failed | 同步失败 |

---

### 重新同步公告详情

对于 `detail_synced=false` 或 `raw_data` 为空的公告，重新从森空岛获取完整详情数据。

```http
POST /api/announcements/admin/resync-details
X-API-Key: your-api-key
```

**响应示例（成功）**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "公告详情重新同步任务已启动"
  }
}
```

**响应示例（任务进行中）**：
```json
{
  "code": 400,
  "message": "同步任务正在执行中"
}
```

**使用场景**：
- 服务升级后需要补全历史公告的完整数据
- `detail_synced=false` 的公告缺少完整文本、链接等信息
- 需要重新获取 `raw_data` 原始数据

> **注意**：此接口异步执行，每条公告请求间隔 200ms 以避免频繁请求。
> 可通过 `/api/announcements/admin/sync/status` 的 `need_detail_resync_count` 字段查看剩余数量。

---

### 数据同步机制

- **同步间隔**：每 2 分钟自动检查新公告
- **首次同步**：服务启动 15 秒后执行
- **同步方式**：增量同步（只同步比数据库中最新公告更新的内容）
- **数据来源**：森空岛终末地官方账号（`userId=3737967211133`）
- **详情获取**：发现新公告后，自动调用详情接口获取完整数据
- **原始数据**：完整保存森空岛返回的原始 JSON 到 `raw_data` 字段

**同步流程**：
```
1. 调用森空岛列表接口获取最新公告
2. 对比数据库中最新公告的时间戳，找出新公告
3. 对每条新公告，调用详情接口获取完整数据
4. 保存完整数据（包括原始 JSON）到数据库
5. 请求间隔 100ms 避免频繁请求
```

**公共账号池**：
- 使用公共账号池进行 API 调用，无需用户凭证
- 自动处理时间戳同步和签名
- 每次同步前强制刷新 Token 获取最新时间戳

---

## 抽卡记录 API

> ⚠️ 以下接口需要**双重凭证**（同终末地数据 API）
>
> 抽卡记录获取需要执行四层认证链，使用登录时保存的 `HypergryphToken` 自动完成。
> 如果登录凭证中没有 `HypergryphToken`（旧用户），需要重新登录。

### 认证链流程

```
HypergryphToken (登录时自动保存)
    ↓ Grant API (换取 appToken)
app_token
    ↓ Bindings API (获取绑定账号)
hgUid (鹰角账号标识)
    ↓ U8Token API (获取访问凭证)
u8_token
    ↓ Records API (获取抽卡记录)
抽卡记录数据
```

### 卡池类型

| 类型 | 值 | 说明 |
|------|-----|------|
| 限定池 | `E_CharacterGachaPoolType_Special` | 特许寻访 |
| 常驻池 | `E_CharacterGachaPoolType_Standard` | 基础寻访 |
| 新手池 | `E_CharacterGachaPoolType_Beginner` | 启程寻访 |
| 武器池 | `weapon` | 武器寻访 |

### 数据模型说明

抽卡记录采用**用户文档模型**，每个游戏账号（`game_uid`）的所有抽卡记录存储在一个文档中，按卡池类型分类。
同一个游戏账号的记录会自动合并，即使通过不同的登录凭证同步也会归入同一份数据。

```json
{
  "game_uid": "1320645122",
  "framework_token": "uuid-xxx",
  "skland_uid": "205594538",
  "nick_name": "玩家昵称",
  "channel_name": "官服",
  "is_official": true,
  "records": {
    "limited_char": [...],   // 限定角色池
    "standard_char": [...],  // 常驻角色池
    "beginner_char": [...],  // 新手池
    "weapon": [...]          // 武器池
  },
  "stats": {
    "total_count": 200,
    "limited_char_count": 100,
    "standard_char_count": 60,
    "beginner_char_count": 20,
    "weapon_count": 20,
    "star6_count": 5,
    "star5_count": 20,
    "star4_count": 175
  },
  "last_fetch_at": "2026-01-30T12:00:00Z"
}
```

### 获取抽卡记录

获取已保存的抽卡记录，支持分页和多卡池筛选，按 `seq_id` 降序排列（最新的在前）。

```http
GET /api/endfield/gacha/records?pools=limited,standard&page=1&limit=500
X-Framework-Token: your-framework-token
```

**Query 参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| pools | string | 否 | 全部 | 卡池类型，逗号分隔（`limited`/`standard`/`beginner`/`weapon`） |
| page | int | 否 | 1 | 页码，从 1 开始 |
| limit | int | 否 | 500 | 每页数量，最大 500 |

**卡池类型说明**:
| 参数值 | 说明 |
|--------|------|
| `limited` | 限定角色池 |
| `standard` | 常驻角色池 |
| `beginner` | 新手池 |
| `weapon` | 武器池 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "records": [
      {
        "char_id": "char_001",
        "char_name": "阿米娅",
        "rarity": 6,
        "gacha_ts": "1704067200",
        "pool_id": "pool_001",
        "pool_name": "特许寻访·xxx",
        "is_new": true,
        "is_free": false,
        "seq_id": "1704067200001"
      },
      {
        "char_id": "char_002",
        "char_name": "能天使",
        "rarity": 6,
        "gacha_ts": "1704067100",
        "pool_id": "pool_001",
        "pool_name": "特许寻访·xxx",
        "is_new": false,
        "is_free": false,
        "seq_id": "1704067100001"
      }
    ],
    "total": 200,
    "page": 1,
    "limit": 500,
    "pages": 1,
    "pools": ["limited_char", "standard_char", "beginner_char", "weapon"],
    "stats": {
      "total_count": 200,
      "limited_char_count": 100,
      "standard_char_count": 60,
      "beginner_char_count": 20,
      "weapon_count": 20,
      "star6_count": 5,
      "star5_count": 20,
      "star4_count": 175
    },
    "user_info": {
      "nickname": "玩家昵称",
      "game_uid": "1320645122",
      "skland_uid": "205594538",
      "channel_name": "官服",
      "is_official": true,
      "last_fetch": "2026-01-30T12:00:00Z"
    }
  }
}
```

**筛选特定卡池示例**:
```http
GET /api/endfield/gacha/records?pools=limited,weapon&page=1&limit=100
```

**分页说明**:
- `total`: 符合筛选条件的总记录数
- `page`: 当前页码
- `limit`: 每页数量
- `pages`: 总页数
- 记录按 `seq_id` 降序排列，即最新抽取的记录在最前面

### 获取可用账号列表

获取当前用户可用于抽卡记录同步的游戏账号列表。用户可能绑定了多个账号（如官服 + B服），同步前需要选择账号。

> **注意**: 只返回有角色绑定的账号，没有角色的账号无法获取抽卡记录会被自动过滤。

```http
GET /api/endfield/gacha/accounts
X-Framework-Token: your-framework-token
```

**响应示例（单账号）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "accounts": [
      {
        "uid": "081587252",
        "game_uid": "1966952704",
        "nick_name": "菅田将晖",
        "channel_name": "bilibili服",
        "channel_master_id": 2,
        "is_official": false,
        "server_id": "1",
        "level": 48
      }
    ],
    "count": 1,
    "need_select": false
  }
}
```

**响应示例（多账号）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "accounts": [
      {
        "uid": "513127610",
        "game_uid": "1234567890",
        "nick_name": "官服昵称",
        "channel_name": "官服",
        "channel_master_id": 1,
        "is_official": true,
        "server_id": "1",
        "level": 50
      },
      {
        "uid": "081587252",
        "game_uid": "1966952704",
        "nick_name": "B服昵称",
        "channel_name": "bilibili服",
        "channel_master_id": 2,
        "is_official": false,
        "server_id": "1",
        "level": 48
      }
    ],
    "count": 2,
    "need_select": true
  }
}
```

**响应字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| accounts | array | 可用账号列表 |
| accounts[].uid | string | 账号 UID（同步时需要指定） |
| accounts[].game_uid | string | 游戏角色 UID |
| accounts[].nick_name | string | 游戏昵称 |
| accounts[].channel_name | string | 渠道名称（官服/bilibili服） |
| accounts[].channel_master_id | int | 渠道 ID（1=官服，2=B服） |
| accounts[].is_official | bool | 是否官服 |
| accounts[].server_id | string | 服务器 ID |
| accounts[].level | int | 角色等级 |
| count | int | 账号数量 |
| need_select | bool | 是否需要用户选择账号 |

---

### 从官方 API 获取抽卡记录（异步）

从鹰角官方 API 获取抽卡记录并保存。该接口为**异步执行**，立即返回，实际同步在后台进行。

> **使用流程**:
> 1. 调用 `GET /api/endfield/gacha/accounts` 获取可用账号列表
> 2. 如果 `need_select=true`（多账号），让用户选择账号
> 3. 调用此接口启动同步任务（多账号时需传 `account_uid`）
> 4. 轮询 `GET /api/endfield/gacha/sync/status` 获取进度
> 5. 当状态为 `completed` 或 `failed` 时停止轮询

```http
POST /api/endfield/gacha/fetch
X-Framework-Token: your-framework-token
Content-Type: application/json

{
  "server_id": "1",
  "account_uid": "081587252"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| server_id | string | 否 | 服务器 ID，不传则使用凭证库中的值，默认 "1" |
| account_uid | string | 否* | 账号 UID，通过 `/accounts` 获取。**多账号时必填** |

> *当用户只有一个可用账号时可不传，系统自动使用该账号；多账号时必须指定。

**响应示例（任务已启动）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "同步任务已启动",
    "status": "syncing"
  }
}
```

**前端示例代码**:
```javascript
// 1. 先获取账号列表
const accountsRes = await fetch('/api/endfield/gacha/accounts', {
  headers: { 'X-Framework-Token': token }
})
const { data: accountsData } = await accountsRes.json()

// 2. 检查是否需要用户选择
let selectedUid = null
if (accountsData.need_select) {
  // 让用户选择账号（弹出选择框）
  selectedUid = await showAccountSelector(accountsData.accounts)
} else if (accountsData.count === 1) {
  selectedUid = accountsData.accounts[0].uid
}

// 3. 启动同步
const startRes = await fetch('/api/endfield/gacha/fetch', {
  method: 'POST',
  headers: { 
    'X-Framework-Token': token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({ account_uid: selectedUid })
})

// 4. 轮询进度
const pollStatus = async () => {
  const res = await fetch('/api/endfield/gacha/sync/status', {
    headers: { 'X-Framework-Token': token }
  })
  const { data } = await res.json()
  
  updateProgressBar(data.progress, data.message)
  
  if (data.status === 'completed') {
    showSuccess(`同步完成，共 ${data.records_found} 条记录`)
  } else if (data.status === 'failed') {
    showError(data.error)
  } else {
    setTimeout(pollStatus, 1000) // 1秒后继续轮询
  }
}
pollStatus()
```

**错误响应**:

凭证不完整（旧用户需重新登录）:
```json
{
  "code": 400,
  "message": "登录凭证不完整，请重新登录以获取抽卡记录权限"
}
```

正在同步中:
```json
{
  "code": 409,
  "message": "正在同步中，请稍后再试"
}
```

### 获取抽卡统计

获取抽卡数据的详细统计信息。

```http
GET /api/endfield/gacha/stats
X-Framework-Token: your-framework-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "stats": {
      "total_count": 200,
      "limited_char_count": 100,
      "standard_char_count": 60,
      "beginner_char_count": 20,
      "weapon_count": 20,
      "star6_count": 5,
      "star5_count": 20,
      "star4_count": 175
    },
    "pool_stats": {
      "limited_char": {"total": 100, "star6": 3, "star5": 10},
      "standard_char": {"total": 60, "star6": 1, "star5": 5},
      "beginner_char": {"total": 20, "star6": 1, "star5": 2},
      "weapon": {"total": 20, "star6": 0, "star5": 3}
    },
    "last_fetch": "2026-01-30T12:00:00Z",
    "has_records": true,
    "user_info": {
      "nickname": "玩家昵称",
      "game_uid": "1320645122",
      "channel_name": "官服"
    }
  }
}
```

### 获取同步状态

查询抽卡记录同步的实时状态，用于前端显示进度。

```http
GET /api/endfield/gacha/sync/status
X-Framework-Token: your-framework-token
```

**同步状态值**:
| 状态 | 说明 |
|------|------|
| `idle` | 空闲（未开始同步） |
| `syncing` | 同步中 |
| `completed` | 同步完成 |
| `failed` | 同步失败 |

**同步阶段**:
| 阶段 | 说明 |
|------|------|
| `grant` | 验证 Token |
| `bindings` | 获取绑定账号 |
| `u8token` | 获取访问凭证 |
| `records` | 获取抽卡记录 |
| `saving` | 保存数据 |

**响应示例（同步中）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "status": "syncing",
    "stage": "records",
    "progress": 65,
    "message": "正在获取 常驻角色池...",
    "current_pool": "常驻角色池",
    "total_pools": 4,
    "completed_pools": 1,
    "records_found": 85,
    "new_records": 0,
    "started_at": "2026-01-30T12:00:00Z",
    "updated_at": "2026-01-30T12:00:15Z",
    "elapsed_seconds": 15.5,
    "error": ""
  }
}
```

**响应示例（同步完成）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "status": "completed",
    "stage": "saving",
    "progress": 100,
    "message": "同步完成，共 200 条记录，新增 50 条",
    "total_pools": 4,
    "completed_pools": 4,
    "records_found": 200,
    "new_records": 50,
    "elapsed_seconds": 35.2
  }
}
```

**响应示例（空闲）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "status": "idle",
    "message": "暂无同步任务",
    "progress": 0
  }
}
```

### 全服统计（公开接口）

获取全服抽卡统计数据，用于展示全服玩家的抽卡情况。

> **注意**：此接口为公开接口，不需要认证。数据会缓存 5 分钟。

```http
GET /api/endfield/gacha/global-stats
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "cached": false,
    "last_update": "2026-01-30T15:00:00Z",
    "stats": {
      "total_pulls": 125000,
      "total_users": 500,
      "star6_total": 1250,
      "star5_total": 12500,
      "star4_total": 111250,
      "avg_pity": 62.5,
      "current_pool": {
        "pool_name": "熔火灼痕",
        "up_char_name": "莱万汀",
        "up_char_id": "0b199a0eaae5a9b37a5d3c990b6c8bca"
      },
      "by_type": {
        "limited": {
          "total": 50000,
          "star6": 500,
          "star5": 5000,
          "star4": 44500,
          "avg_pity": 62.3,
          "distribution": [
            {"range": "1-10", "count": 50},
            {"range": "11-20", "count": 45},
            {"range": "21-30", "count": 40},
            {"range": "31-40", "count": 38},
            {"range": "41-50", "count": 42},
            {"range": "51-60", "count": 55},
            {"range": "61-70", "count": 80},
            {"range": "71-80", "count": 150}
          ]
        },
        "standard": { "...": "..." },
        "beginner": { "...": "..." },
        "weapon": { "...": "..." },
        "character": { "...": "..." }
      },
      "by_channel": {
        "official": {
          "total_users": 200,
          "total_pulls": 50000,
          "star6_total": 500,
          "star5_total": 5000,
          "star4_total": 44500,
          "avg_pity": 62.8
        },
        "bilibili": {
          "total_users": 300,
          "total_pulls": 75000,
          "star6_total": 750,
          "star5_total": 7500,
          "star4_total": 66750,
          "avg_pity": 62.3
        }
      },
      "ranking": {
        "limited": {
          "six_star": [
            {"char_id": "0b199a0eaae5a9b37a5d3c990b6c8bca", "char_name": "莱万汀", "count": 120, "percent": 24.0},
            {"char_id": "abc123", "char_name": "伊冯", "count": 100, "percent": 20.0},
            {"char_id": "def456", "char_name": "安洁莉娜", "count": 80, "percent": 16.0}
          ],
          "five_star": [
            {"char_id": "5star1", "char_name": "5星角色A", "count": 500, "percent": 10.0},
            {"char_id": "5star2", "char_name": "5星角色B", "count": 450, "percent": 9.0}
          ]
        },
        "standard": {
          "six_star": [...],
          "five_star": [...]
        },
        "weapon": {
          "six_star": [...],
          "five_star": [...]
        }
      }
    }
  }
}
```

**统计字段说明**:
| 字段 | 说明 |
|------|------|
| `total_pulls` | 全服总抽数（**不含免费抽卡**） |
| `total_users` | 已同步记录的用户数 |
| `star6_total` | 6星总数（不含免费抽卡获得的） |
| `avg_pity` | 全服平均出货（抽数/6星） |
| `current_pool` | 当前UP卡池信息（用于判断歪不歪） |
| `by_type` | 按卡池类型分类的统计 |
| `by_channel` | 按渠道/服务器分类的统计（官服/B服） |
| `ranking` | 出货排名（各角色/武器获取数量排名） |
| `distribution` | 6星出货分布（按抽数区间） |

> **统计口径说明**：所有统计数据均**完全排除免费抽卡**（`is_free=true`），包括抽数统计、稀有度统计、出货分布和平均出货。这样可以准确反映玩家实际消耗资源的出货情况。

**当前卡池信息**（用于判断是否歪了）:
| 字段 | 说明 |
|------|------|
| `pool_name` | 当前卡池名称 |
| `up_char_name` | UP角色名称 |
| `up_char_id` | UP角色ID（可用于匹配抽卡记录） |

> **数据来源**：当前卡池信息自动从 Wiki 同步的角色卡池数据获取，根据卡池有效期（`pool_start_at_ts` ~ `pool_end_at_ts`）判断当前活跃的卡池，并获取 `dotType=label_type_up` 的 UP 角色信息。

**出货排名**:
| 字段 | 说明 |
|------|------|
| `ranking.limited` | 限定池排名 |
| `ranking.standard` | 常驻池排名 |
| `ranking.weapon` | 武器池排名 |
| `six_star` | 6星出货排名 |
| `five_star` | 5星出货排名 |
| `char_id` | 角色/武器ID |
| `char_name` | 角色/武器名称 |
| `count` | 全服获取数量 |
| `percent` | 占该星级总数的百分比 |

**渠道/服务器类型**:
| 类型 | 说明 |
|------|------|
| `official` | 官服 |
| `bilibili` | B服（bilibili服） |

**卡池类型**:
| 类型 | 说明 |
|------|------|
| `limited` | 限定角色池 |
| `standard` | 常驻角色池 |
| `beginner` | 新手池 |
| `weapon` | 武器池 |
| `character` | 角色池合计（限定+常驻） |

---

## 模拟抽卡 API

> 公开接口，无需认证。用于模拟游戏中的抽卡逻辑，支持三种卡池类型。

### 卡池规则说明

| 卡池类型 | 6星保底 | 软保底起始 | 基础概率 | 硬保底 | UP概率 |
|----------|---------|-----------|---------|--------|--------|
| 限定角色池 | 80抽 | 65抽后+5%/抽 | 0.8% | 120抽必出UP | 50% |
| 武器池 | 40抽 | 无软保底 | 4% | 80抽必出UP | 25% |
| 常驻池 | 80抽 | 65抽后+5%/抽 | 0.8% | 无 | 无 |

### 获取卡池规则

```http
GET /api/endfield/gacha/simulate/rules?pool_type=limited
```

**Query 参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| pool_type | string | 否 | limited | 卡池类型：`limited`/`weapon`/`standard` |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "pool_type": "limited",
    "rules": {
      "six_star_pity": 80,
      "six_star_base_probability": 0.008,
      "six_star_soft_pity_start": 65,
      "six_star_soft_pity_increase": 0.05,
      "has_soft_pity": true,
      "five_star_pity": 10,
      "five_star_base_probability": 0.08,
      "guaranteed_limited_pity": 120,
      "up_probability": 0.5,
      "gift_interval": 240,
      "free_ten_pull_interval": 30,
      "info_book_threshold": 60
    },
    "all_rules": {
      "limited": { ... },
      "weapon": { ... },
      "standard": { ... }
    }
  }
}
```

### 模拟单抽

```http
POST /api/endfield/gacha/simulate/single
Content-Type: application/json

{
  "pool_type": "limited",
  "state": {
    "six_star_pity": 50,
    "five_star_pity": 3,
    "total_pulls": 100,
    "guaranteed_limited_pity": 50,
    "has_received_guaranteed_limited": false
  }
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pool_type | string | 否 | 卡池类型，默认 `limited` |
| state | object | 否 | 模拟器状态，不传则从头开始 |

**状态对象 (state)**:
| 字段 | 类型 | 说明 |
|------|------|------|
| six_star_pity | int | 当前6星保底计数（80抽小保底） |
| five_star_pity | int | 当前5星保底计数 |
| total_pulls | int | 总抽数 |
| guaranteed_limited_pity | int | 硬保底计数（限定池120抽/武器池80抽） |
| has_received_guaranteed_limited | bool | 是否已触发硬保底（仅触发1次） |
| is_guaranteed_up | bool | 是否大保底（上次歪了，下次必出UP） |
| six_star_count | int | 已获得6星数量 |
| five_star_count | int | 已获得5星数量 |
| up_six_star_count | int | 已获得UP 6星数量 |
| free_ten_pulls_received | int | 已使用免费十连次数 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "result": {
      "pull_number": 101,
      "rarity": 6,
      "is_up": true,
      "is_limited": true,
      "pity_when_pulled": 51
    },
    "state": {
      "pool_type": "limited",
      "six_star_pity": 0,
      "five_star_pity": 0,
      "total_pulls": 101,
      "guaranteed_limited_pity": 0,
      "has_received_guaranteed_limited": false,
      "is_guaranteed_up": false,
      "six_star_count": 1,
      "five_star_count": 0,
      "four_star_count": 0,
      "up_six_star_count": 1
    },
    "stats": {
      "total_pulls": 101,
      "six_star_count": 1,
      "six_star_rate": 0.99,
      "up_rate": 100,
      "avg_pulls_per_six_star": 101,
      "current_pity": 0,
      "expected_pulls": 62,
      "is_guaranteed_up": false
    },
    "gifts": {
      "gift_count": 0,
      "free_ten_count": 1,
      "free_ten_available": 0,
      "has_info_book": true,
      "next_gift_at": 240,
      "next_free_ten_at": 30
    }
  }
}
```

### 模拟十连

```http
POST /api/endfield/gacha/simulate/ten
Content-Type: application/json

{
  "pool_type": "limited",
  "state": { ... }
}
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "results": [
      { "pull_number": 101, "rarity": 4, "is_up": false },
      { "pull_number": 102, "rarity": 4, "is_up": false },
      { "pull_number": 103, "rarity": 5, "is_up": false },
      { "pull_number": 104, "rarity": 4, "is_up": false },
      { "pull_number": 105, "rarity": 4, "is_up": false },
      { "pull_number": 106, "rarity": 4, "is_up": false },
      { "pull_number": 107, "rarity": 4, "is_up": false },
      { "pull_number": 108, "rarity": 6, "is_up": true, "is_limited": true, "pity_when_pulled": 58 },
      { "pull_number": 109, "rarity": 4, "is_up": false },
      { "pull_number": 110, "rarity": 4, "is_up": false }
    ],
    "state": { ... },
    "stats": { ... },
    "gifts": { ... }
  }
}
```

### 模拟免费十连

> 仅限定角色池支持。每期卡池**仅限1次**（30抽后获得）。免费十连**不计入保底**，抽完后保底状态恢复到抽之前。

```http
POST /api/endfield/gacha/simulate/free-ten
Content-Type: application/json

{
  "pool_type": "limited",
  "state": {
    "total_pulls": 60,
    "free_ten_pulls_received": 1
  }
}
```

**限制条件**:
- 仅限定角色池（`limited`）可用
- 必须先达到免费十连门槛（每30抽送1次）
- `free_ten_pulls_received` 必须小于已获得的免费十连次数

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "results": [
      { "pull_number": 61, "rarity": 4, "is_free_pull": true },
      ...
    ],
    "state": {
      "total_pulls": 60,
      "free_ten_pulls_received": 2,
      "six_star_pity": 60
    },
    "is_free": true,
    "message": "免费十连不计入保底"
  }
}
```

### 批量模拟（统计分析）

用于大规模模拟统计，分析出货概率分布。

```http
POST /api/endfield/gacha/simulate/batch
Content-Type: application/json

{
  "pool_type": "limited",
  "iterations": 1000,
  "pulls_per_iteration": 80
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 默认值 | 最大值 | 说明 |
|------|------|------|--------|--------|------|
| pool_type | string | 否 | limited | - | 卡池类型 |
| iterations | int | 否 | 1000 | 10000 | 模拟次数 |
| pulls_per_iteration | int | 否 | 80 | 1000 | 每次模拟抽数 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "config": {
      "pool_type": "limited",
      "iterations": 1000,
      "pulls_per_iteration": 80
    },
    "results": {
      "avg_six_star_count": 1.23,
      "avg_five_star_count": 6.45,
      "avg_six_star_pity": 62.5,
      "min_six_star_pity": 1,
      "max_six_star_pity": 80,
      "total_six_stars": 1230,
      "total_five_stars": 6450
    },
    "distribution": [
      { "pity": 1, "count": 8, "percent": 0.65 },
      { "pity": 2, "count": 7, "percent": 0.57 },
      ...
      { "pity": 65, "count": 45, "percent": 3.66 },
      { "pity": 66, "count": 62, "percent": 5.04 },
      { "pity": 67, "count": 85, "percent": 6.91 },
      ...
      { "pity": 80, "count": 12, "percent": 0.98 }
    ]
  }
}
```

### 赠送机制说明

**限定角色池**:
| 抽数 | 赠送 |
|------|------|
| 每30抽 | 免费十连（不计入保底） |
| 60抽 | 寻访情报书（下个池可用） |
| 每240抽 | 限定角色信物 |

**武器池**:
| 抽数 | 赠送 |
|------|------|
| 100抽 | 补充武库箱（常驻自选） |
| 180抽 | 限定UP武器 |
| 之后每80抽 | 交替赠送常驻/限定 |

**常驻池**:
| 抽数 | 赠送 |
|------|------|
| 300抽 | 自选6星角色（仅1次） |

### 获取卡池角色分布

> 获取各卡池中可获得的角色/武器列表，用于模拟抽卡时显示具体角色。数据从玩家抽卡记录聚合，封面图来自 Wiki。

```http
GET /api/endfield/gacha/pool-chars
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pool_id | string | 否 | 卡池ID，如 `special_1_0_1` |
| pool_type | string | 否 | 卡池类型：`limited`/`standard`/`beginner`/`weapon` |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "pools": [
      {
        "pool_id": "special_1_0_1",
        "pool_name": "熔火灼痕",
        "pool_type": "limited",
        "star6_chars": [
          {
            "char_id": "caster_25",
            "name": "安卡",
            "cover": "http://localhost:15618/api/proxy/image?url=https%3A%2F%2Fbbs.hycdn.cn%2F...",
            "rarity": 6,
            "is_up": true
          },
          {
            "char_id": "vanguard_1",
            "name": "常驻角色",
            "cover": "http://localhost:15618/api/proxy/image?url=...",
            "rarity": 6,
            "is_up": false
          }
        ],
        "star5_chars": [...],
        "star4_chars": [...],
        "up_chars": [
          {
            "id": "caster_25",
            "name": "安卡",
            "pic": "http://localhost:15618/api/proxy/image?url=...",
            "rarity": "rarity_6",
            "dot_type": "label_type_up"
          }
        ]
      }
    ],
    "total": 5
  }
}
```

**字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| pool_id | string | 卡池ID |
| pool_name | string | 卡池名称 |
| pool_type | string | 卡池类型 |
| star6_chars | array | 6星角色/武器列表 |
| star5_chars | array | 5星角色/武器列表 |
| star4_chars | array | 4星角色/武器列表 |
| up_chars | array | 原始UP角色信息（来自森空岛Wiki） |

**角色信息 (PoolCharInfo)**:
| 字段 | 类型 | 说明 |
|------|------|------|
| char_id | string | 角色/武器ID |
| name | string | 名称 |
| cover | string | 封面图（代理URL） |
| rarity | int | 稀有度 4/5/6 |
| is_up | bool | 是否为UP角色 |

> **注意**: 封面图 URL 已转换为代理地址，可直接使用。数据每 24 小时自动聚合更新。

---

## 便捷端点

> 以下端点从 `card/detail` 接口提取特定数据，简化前端调用

### 获取体力信息

```http
GET /api/endfield/stamina
X-Framework-Token: your-framework-token
```

**Query 参数**（可选，不提供则自动从绑定信息获取）:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId | string | 否 | 游戏角色 ID |
| serverId | int | 否 | 服务器 ID，默认 1 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "role": {
      "name": "玩家名#1234",
      "roleId": "123456",
      "level": 30,
      "serverId": 1
    },
    "stamina": {
      "current": "78",
      "max": "328",
      "maxTs": "1769899685"
    },
    "dailyMission": {
      "activation": 100,
      "maxActivation": 100
    }
  }
}
```

### 获取帝江号建设信息

```http
GET /api/endfield/spaceship
X-Framework-Token: your-framework-token
```

**Query 参数**（可选，不提供则自动从绑定信息获取）:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId | string | 否 | 游戏角色 ID |
| serverId | int | 否 | 服务器 ID，默认 1 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "role": {
      "name": "玩家名#1234",
      "roleId": "123456",
      "level": 30,
      "serverId": 1
    },
    "spaceShip": {
      "rooms": [
        {
          "id": "room_001",
          "level": 3,
          "chars": [
            {
              "charId": "char_001",
              "physicalStrength": 100,
              "favorability": 50
            }
          ]
        }
      ]
    },
    "charNameMap": {
      "char_001": "黎风",
      "char_002": "管理员"
    }
  }
}
```

### 获取便签信息

```http
GET /api/endfield/note
X-Framework-Token: your-framework-token
```

**Query 参数**（可选，不提供则自动从绑定信息获取）:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId | string | 否 | 游戏角色 ID |
| serverId | int | 否 | 服务器 ID，默认 1 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "base": {
      "name": "玩家名#1234",
      "roleId": "123456",
      "level": 30,
      "exp": 12345,
      "worldLevel": 3,
      "serverName": "官服",
      "avatarUrl": "https://bbs.hycdn.cn/image/xxx.png",
      "createTime": "1706200000",
      "lastLoginTime": "1706280000",
      "mainMission": {
        "description": "主线任务描述"
      },
      "charNum": 15,
      "weaponNum": 20,
      "docNum": 100
    },
    "stamina": {
      "current": 77,
      "max": 82,
      "maxTs": 1706284800
    },
    "dailyMission": {
      "activation": 100,
      "maxActivation": 100
    },
    "chars": [
      {
        "id": "char_001",
        "name": "黎风",
        "level": 50,
        "rarity": { "value": "6" },
        "profession": { "value": "先锋" },
        "avatarSqUrl": "https://bbs.hycdn.cn/image/xxx.png",
        "avatarRtUrl": "https://bbs.hycdn.cn/image/xxx.png"
      }
    ],
    "charCount": 15
  }
}
```

### 获取地区建设信息

```http
GET /api/endfield/domain
X-Framework-Token: your-framework-token
```

> 从 `/card/detail` 提取 `detail.domain` 数据，与插件实现一致。

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "role": {
      "name": "玩家名#1234",
      "roleId": "123456",
      "level": 30,
      "serverId": 1
    },
    "domain": [
      {
        "domainId": "domain_001",
        "name": "荒原驻站",
        "level": 5,
        "moneyMgr": 1000,
        "settlements": [
          {
            "id": "settlement_001",
            "name": "聚落名称",
            "level": 3,
            "officerCharIds": "char_001"
          }
        ],
        "collections": [
          {
            "levelId": "level_001",
            "trchestCount": 10,
            "puzzleCount": 5,
            "blackboxCount": 2
          }
        ]
      }
    ],
    "charNameMap": {
      "char_001": "黎风",
      "char_002": "管理员"
    }
  }
}
```

---

## 图片代理

用于绕过森空岛 CDN 图片的防盗链限制。

### 代理图片

```http
GET /api/proxy/image?url={encoded_image_url}
```

> ⚠️ 此接口为**公开接口**，无需认证。仅允许代理白名单域名的图片。

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | URL 编码后的原始图片地址 |

**白名单域名**:
- `bbs.hycdn.cn`
- `ak.hycdn.cn`
- `web.hycdn.cn`
- `static.skland.com`

**使用示例**:
```javascript
// 原始图片 URL（来自 /api/endfield/note 接口）
const originalUrl = "https://bbs.hycdn.cn/image/2026/01/20/xxx.png";

// 通过代理访问
const proxyUrl = `http://localhost:15618/api/proxy/image?url=${encodeURIComponent(originalUrl)}`;

// 在 img 标签中使用
<img src={proxyUrl} alt="avatar" />
```

**响应**:
- 成功：返回图片二进制数据，`Content-Type` 为原图片类型
- 失败：返回 JSON 错误信息

**响应头**:
| Header | 值 |
|--------|-----|
| Content-Type | 原图片的 Content-Type |
| Cache-Control | `public, max-age=86400`（缓存 1 天） |
| Access-Control-Allow-Origin | `*` |

**错误响应**:
| 状态码 | 说明 |
|--------|------|
| 400 | 缺少 url 参数或无效的 URL |
| 403 | 不允许代理该域名的图片 |
| 500 | 请求图片失败 |

---

## 鹰角游戏列表

获取鹰角所有游戏及其服务器列表，用于前端显示服务器名称等信息。

### 获取游戏列表

```http
GET /api/hypergryph/app-list
```

> ⚠️ 此接口为**公开接口**，无需认证。数据来源于鹰角官方 API。

**响应示例**:
```json
{
  "data": {
    "appList": [
      {
        "appCode": "arknights",
        "appName": "明日方舟",
        "channel": [
          {"channelMasterId": 1, "channelName": "官服", "isOfficial": true},
          {"channelMasterId": 2, "channelName": "bilibili服", "isOfficial": false}
        ],
        "supportServer": false,
        "serverList": []
      },
      {
        "appCode": "endfield",
        "appName": "明日方舟：终末地",
        "channel": [
          {"channelMasterId": 1, "channelName": "官服", "isOfficial": true},
          {"channelMasterId": 2, "channelName": "bilibili服", "isOfficial": false}
        ],
        "supportServer": true,
        "serverList": [
          {"serverId": "1", "serverName": "China"},
          {"serverId": "57", "serverName": "China-tmp"}
        ]
      }
    ]
  },
  "msg": "OK",
  "status": 0
}
```

**字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| appCode | string | 游戏代码（如 `endfield`） |
| appName | string | 游戏名称 |
| channel | array | 渠道列表（官服/B服等） |
| supportServer | boolean | 是否支持多服务器 |
| serverList | array | 服务器列表（仅 supportServer=true 时有效） |
| serverId | string | 服务器ID |
| serverName | string | 服务器名称 |

**响应头**:
| Header | 值 |
|--------|-----|
| Content-Type | `application/json` |
| Cache-Control | `public, max-age=3600`（缓存 1 小时） |
| Access-Control-Allow-Origin | `*` |

---

## 凭证管理（管理员接口）

> ⚠️ 以下接口为管理员功能，用于监控和维护 Framework Token 凭证状态。

### 凭证自动清理机制

系统内置凭证清理插件，定期清理失效的凭证（`is_valid=false`）：

| 配置项 | 值 | 说明 |
|--------|-----|------|
| 清理间隔 | 6 小时 | 定时清理失效凭证 |
| 保留天数 | 7 天 | 失效后保留 7 天再删除 |
| 启动清理 | 10 秒后 | 服务启动后自动执行一次清理 |

**凭证失效时机**：
- 登录时，同一 `SklandUid` 的旧凭证会被标记为 `is_valid=false`
- 凭证 Token 刷新失败时，也会被标记为失效

### 获取凭证状态统计

```http
GET /api/endfield/admin/credential-status
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "login_sessions": {
      "valid_count": 50,
      "invalid_count": 15,
      "total_count": 65,
      "pending_cleanup": 5
    },
    "user_bindings": {
      "valid_count": 48,
      "invalid_count": 10,
      "total_count": 58,
      "pending_cleanup": 3
    },
    "config": {
      "cleanup_interval": "6h0m0s",
      "retention_days": 7
    }
  }
}
```

### 手动触发凭证清理

```http
POST /api/endfield/admin/cleanup-credentials
Content-Type: application/json

{
  "cleanup_type": "all"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| cleanup_type | string | 否 | 清理类型：`expired`（过期）/ `duplicate`（重复）/ `all`（全部），默认 `all` |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "清理任务已启动",
    "cleanup_type": "all"
  }
}
```

> 注意：清理任务在后台异步执行，返回后并不表示清理完成。

---

## Web 平台认证（用户账号系统）

> Web 平台认证使用 **JWT 令牌机制**（`Authorization: Bearer <access_token>`）
>
> 这套认证系统用于：用户账号管理、数据授权、开发者功能等。
> 与游戏数据查询使用的 Framework Token **完全独立**。

Web 平台支持两种登录方式：
1. **账号密码登录** - 使用邮箱注册，支持密码登录
2. **OAuth 登录** - QQ / GitHub 第三方登录

两种方式的用户可以互相绑定，统一使用 JWT 令牌机制。

**令牌有效期**：
| 令牌类型 | 有效期 | 用途 |
|----------|--------|------|
| Access Token | 15 分钟 | 访问受保护接口 |
| Refresh Token | 7 天 | 刷新 Access Token |

---

### 账号注册

```http
POST /api/v1/auth/register
Content-Type: application/json

{
  "username": "testuser",
  "email": "test@example.com",
  "password": "Password123",
  "code": "123456",
  "nickname": "可选昵称"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名（3-20位，字母数字下划线） |
| email | string | 是 | 邮箱地址 |
| password | string | 是 | 密码（8-128位，需含大小写字母和数字） |
| code | string | 是 | 邮箱验证码 |
| nickname | string | 否 | 昵称，默认与用户名相同 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "username": "testuser",
      "nickname": "testuser",
      "avatar": "",
      "email": "test@example.com",
      "email_verified": true,
      "is_developer": false,
      "has_password": true,
      "linked_oauth": []
    },
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "abc123...",
    "expires_in": 900,
    "token_type": "Bearer"
  }
}
```

---

### 账号密码登录

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "account": "testuser",
  "password": "Password123"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| account | string | 是 | 用户名或邮箱 |
| password | string | 是 | 密码 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "user": { ... },
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "abc123...",
    "expires_in": 900,
    "token_type": "Bearer"
  }
}
```

**错误响应**:
| 错误码 | 说明 |
|--------|------|
| 401 | 用户名或密码错误 |
| 429 | 账号已被锁定（登录失败次数过多） |

> ⚠️ **安全机制**: 同一账号 5 次登录失败后锁定 15 分钟

---

### 发送邮箱验证码

```http
POST /api/v1/auth/send-code
Content-Type: application/json

{
  "email": "test@example.com",
  "type": "register"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱地址 |
| type | string | 是 | 验证码类型 |

**验证码类型**:
| type | 说明 |
|------|------|
| register | 注册 |
| reset_password | 重置密码 |
| bind_email | 绑定邮箱 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "验证码已发送"
  }
}
```

> ⚠️ **速率限制**: 同一邮箱 60 秒内只能发送一次

---

### 重置密码

```http
POST /api/v1/auth/reset-password
Content-Type: application/json

{
  "email": "test@example.com",
  "code": "123456",
  "new_password": "NewPassword123"
}
```

---

### 修改密码

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

```http
POST /api/v1/auth/change-password
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "old_password": "OldPassword123",
  "new_password": "NewPassword123"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| old_password | string | 条件必填 | 当前密码（已设置密码时必填） |
| new_password | string | 是 | 新密码 |

---

### 检查用户名是否可用

```http
GET /api/v1/auth/check-username?username=testuser
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "available": true,
    "message": "用户名可用"
  }
}
```

---

### 检查邮箱是否可用

```http
GET /api/v1/auth/check-email?email=test@example.com
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "available": true,
    "message": "邮箱可用"
  }
}
```

---

### 获取 OAuth 登录 URL

```http
GET /api/v1/auth/oauth/:provider
```

**路径参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| provider | string | OAuth 提供商：`qq` 或 `github` |

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| redirect_uri | string | 否 | 自定义回调地址 |
| action | string | 否 | `bind` 表示绑定操作（已登录用户绑定 OAuth），不传则为登录/注册 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "auth_url": "https://graph.qq.com/oauth2.0/authorize?...",
    "state": "random-state-string"
  }
}
```

> **绑定操作说明**：当 `action=bind` 时，返回的 `state` 会带有 `bind:` 前缀。
> OAuth 回调时后端检测到此前缀，会将 `code` 直接传递给前端（而非消费它），
> 前端再用当前用户的 JWT + code 调用 `/api/v1/auth/link-oauth` 完成绑定。

### OAuth 回调

```http
GET /api/v1/auth/callback/:provider?code=xxx&state=xxx
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "access_token": "eyJhbGciOiJIUzI1NiIs...",
    "refresh_token": "abc123...",
    "expires_in": 900,
    "token_type": "Bearer",
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "nickname": "用户昵称",
      "avatar": "https://...",
      "is_developer": false
    },
    "is_new_user": false
  }
}
```

### 刷新令牌

```http
POST /api/v1/auth/refresh
Content-Type: application/json

{
  "refresh_token": "your-refresh-token"
}
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "access_token": "new-access-token",
    "refresh_token": "new-refresh-token",
    "expires_in": 900,
    "token_type": "Bearer"
  }
}
```

### 登出

```http
POST /api/v1/auth/logout
Content-Type: application/json

{
  "refresh_token": "optional-refresh-token"
}
```

### 获取当前用户信息

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

```http
GET /api/v1/user/profile
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "username": "testuser",
    "nickname": "用户昵称",
    "avatar": "https://...",
    "email": "user@example.com",
    "email_verified": true,
    "is_developer": false,
    "has_password": true,
    "linked_oauth": [
      {
        "provider": "qq",
        "oauth_id": "123456789",
        "nickname": "QQ昵称",
        "avatar": "https://q.qlogo.cn/...",
        "linked_at": "2024-01-15T10:30:00Z"
      },
      {
        "provider": "github",
        "oauth_id": "12345678",
        "nickname": "GitHub用户名",
        "avatar": "https://avatars.githubusercontent.com/...",
        "linked_at": "2024-02-20T14:20:00Z"
      }
    ]
  }
}
```

**响应字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| username | string | 用户名（OAuth 用户可能为空，需调用设置用户名接口） |
| nickname | string | 昵称（显示名称） |
| email | string | 绑定的邮箱（可能为空） |
| email_verified | bool | 邮箱是否已验证 |
| has_password | bool | 是否设置了密码（OAuth 用户可能为 false） |
| linked_oauth | array | **所有绑定的第三方账号**（包括首次登录时使用的 OAuth） |

> **说明**：`linked_oauth` 字段包含所有绑定的第三方账号，包括：
> - 首次通过 OAuth 登录时创建账号使用的主 OAuth
> - 后续手动绑定的其他 OAuth 账号

---

### 修改用户信息

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

修改当前用户的昵称或头像。

```http
PUT /api/v1/user/profile
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "nickname": "新昵称",
  "avatar": "https://example.com/avatar.png"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| nickname | string | 否 | 新昵称（1-30 字符，不允许特殊字符） |
| avatar | string | 否 | 新头像 URL（必须 HTTPS，域名白名单限制） |

> **安全说明**：
> - 昵称会过滤 `< > & " ' \`` 等危险字符，防止 XSS 攻击
> - 头像 URL 必须是 HTTPS，且域名必须在白名单中（包括：bbs.hycdn.cn、q.qlogo.cn、avatars.githubusercontent.com、gravatar.com 等）

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "用户信息更新成功",
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "username": "testuser",
      "nickname": "新昵称",
      "avatar": "https://example.com/avatar.png",
      "email": "user@example.com",
      "email_verified": true,
      "is_developer": false,
      "has_password": true
    }
  }
}
```

**错误情况**:
| 错误码 | 说明 |
|--------|------|
| 400 | 昵称不能超过 30 个字符 |
| 400 | 昵称包含非法字符 |
| 400 | 头像 URL 必须使用 HTTPS |
| 400 | 头像 URL 域名不在允许列表中 |

---

### 绑定邮箱

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

为当前账号绑定或更换邮箱。需要先调用发送验证码接口获取验证码。

```http
POST /api/v1/auth/bind-email
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "email": "new@example.com",
  "code": "123456"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 要绑定的邮箱 |
| code | string | 是 | 邮箱验证码（需先调用 `/api/v1/auth/send-code` 获取，type 为 `bind_email`） |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "邮箱绑定成功",
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "username": "testuser",
      "nickname": "用户昵称",
      "email": "new@example.com",
      "email_verified": true,
      "has_password": true
    }
  }
}
```

**错误情况**:
| 错误码 | 说明 |
|--------|------|
| 400 | 验证码不正确或已使用 |
| 400 | 验证码已过期 |
| 400 | 该邮箱已被其他用户绑定 |

---

### 设置用户名

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

为 OAuth 用户设置用户名。**只能设置一次，设置后不可更改**。

> 适用于通过 QQ/GitHub 登录的用户，这些用户首次登录时没有用户名。

```http
POST /api/v1/auth/set-username
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "username": "myusername"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| username | string | 是 | 用户名（3-20 字符，仅支持字母、数字、下划线） |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "用户名设置成功",
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "username": "myusername",
      "nickname": "QQ昵称",
      "email": "",
      "email_verified": false,
      "has_password": false,
      "linked_oauth": [
        { "provider": "qq", "oauth_id": "123456", "nickname": "QQ昵称" }
      ]
    }
  }
}
```

**错误情况**:
| 错误码 | 说明 |
|--------|------|
| 400 | 用户名已设置，不可更改 |
| 400 | 用户名已被使用 |
| 400 | 用户名格式不正确 |

---

### 设置密码

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

为 OAuth 用户首次设置密码。设置密码后，用户可以使用邮箱+密码登录。

> 适用于通过 QQ/GitHub 登录且尚未设置密码的用户。已设置密码的用户请使用"修改密码"接口。

```http
POST /api/v1/auth/set-password
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "password": "MySecurePassword123"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| password | string | 是 | 密码（至少 8 位，包含字母和数字） |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "密码设置成功",
    "user": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d1",
      "username": "myusername",
      "nickname": "QQ昵称",
      "email": "user@example.com",
      "email_verified": true,
      "has_password": true
    }
  }
}
```

**错误情况**:
| 错误码 | 说明 |
|--------|------|
| 400 | 已设置密码，请使用修改密码功能 |
| 400 | 密码强度不足 |

---

### 绑定 OAuth 账号

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

将已登录的账号绑定到第三方 OAuth（QQ/GitHub）。绑定后，用户可以使用 OAuth 登录同一个账号。

#### 完整绑定流程

```
1. 前端调用 GET /api/v1/auth/oauth/:provider?action=bind 获取授权 URL
   - 返回的 state 带有 "bind:" 前缀
2. 打开弹窗跳转到 OAuth 授权页面（QQ/GitHub）
3. 用户授权后，OAuth 提供商回调到后端 /api/v1/auth/callback/:provider
4. 后端检测到 state 以 "bind:" 开头：
   - 不消费 code，不创建新用户
   - 重定向到前端 /oauth/callback，携带 code、provider、action=bind
5. 前端检测到 action=bind，用当前用户的 JWT + code 调用本接口
6. 后端检查 OAuth 账号状态：
   - 情况 A：OAuth 未被使用 → 直接绑定成功
   - 情况 B：OAuth 已是独立账号（无邮箱密码）→ 返回 need_confirm_merge
   - 情况 C：OAuth 已被其他用户绑定（有邮箱密码）→ 返回错误
7. 如果需要确认合并，前端显示确认对话框，用户确认后调用 confirm_merge
```

> **重要**：绑定流程与登录流程的区别在于 `action=bind` 参数。
> 如果不传此参数，后端会将 OAuth 账号作为独立用户处理（登录或创建新用户）。

```http
POST /api/v1/auth/link-oauth
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "provider": "github",
  "code": "oauth-authorization-code"
}
```

**请求参数（首次绑定）**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| provider | string | 是 | OAuth 提供商：`qq` 或 `github` |
| code | string | 是 | OAuth 授权码（从回调 URL 获取） |

**请求参数（确认合并）**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| provider | string | 是 | OAuth 提供商：`qq` 或 `github` |
| confirm_merge | boolean | 是 | 设为 `true` 确认合并账号 |
| oauth_id | string | 是 | 要合并的 OAuth ID（从 need_confirm_merge 响应获取） |

**响应示例（绑定成功）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "绑定成功",
    "provider": "github",
    "nickname": "用户昵称"
  }
}
```

**响应示例（需要确认合并）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "need_confirm_merge": true,
    "message": "该QQ账号已有独立用户，是否将其合并到当前账号？合并后原账号将被删除。",
    "provider": "qq",
    "oauth_id": "ABCDEF123456",
    "oauth_nickname": "QQ用户昵称",
    "existing_user_info": {
      "username": "原用户名",
      "created_at": "2026-01-01T00:00:00Z",
      "has_api_key": true
    }
  }
}
```

**响应示例（合并成功）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "账号合并成功",
    "provider": "qq",
    "nickname": "QQ用户昵称",
    "merged_api_keys": 2,
    "deleted_user_id": "60d5ec9af682fbd39a1b8c23"
  }
}
```

#### 账号合并说明

当要绑定的 OAuth 账号已是独立用户（纯 OAuth 登录，无邮箱密码）时，支持账号合并：

| 合并条件 | 说明 |
|----------|------|
| 原账号无邮箱 | ✅ 可合并 |
| 原账号无密码 | ✅ 可合并 |
| 原账号有邮箱或密码 | ❌ 无法合并，需联系管理员 |

**合并操作迁移的数据**:
- API Keys（普通 + 开发者）
- MaaEnd 设备绑定
- MaaEnd 任务记录
- 原用户绑定的其他 OAuth 账号

**错误情况**:
| 错误码 | 说明 |
|--------|------|
| 400 | 该 OAuth 账号已关联其他用户（有邮箱或密码），无法自动合并 |
| 400 | 已绑定该 OAuth 账号 |
| 400 | 授权码已被使用，请重新授权 |

---

### 解绑 OAuth 账号

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

```http
POST /api/v1/auth/unlink-oauth
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "provider": "github"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| provider | string | 是 | 要解绑的 OAuth 提供商：`qq` 或 `github` |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "解绑成功"
  }
}
```

**错误情况**:
| 错误码 | 说明 |
|--------|------|
| 400 | 未绑定该 OAuth |
| 400 | 无法解绑唯一的登录方式（无密码且只有一个 OAuth） |

---

## 数据授权（Framework Token 共享）

数据授权让第三方客户端可以获取 Web 用户的 **Framework Token**，从而调用终末地数据 API 查询用户的游戏数据。

**授权流程**：
1. 客户端申请授权码（需要 API Key） → 2. Web 用户确认授权 → 3. 客户端获取 Framework Token（同一 API Key） → 4. 使用 Token 调用数据 API

**关键特性**：
- 授权的是 **Framework Token**（游戏数据凭证），不是用户账号
- **需要 API Key 认证**：创建请求、轮询状态、获取数据都需要同一个 API Key
- 只有创建授权请求的 API Key 用户才能获取授权结果
- Web 用户撤销授权时，系统会**刷新 Framework Token**，使授权给客户端的旧 Token 失效
- 刷新后，Web 用户和自有客户端会自动使用新 Token，不受影响

### 创建授权请求（客户端调用）

> ⚠️ 需要认证：`X-API-Key: <your-api-key>`

```http
POST /api/v1/authorization/requests
X-API-Key: your-api-key
Content-Type: application/json

{
  "client_id": "my-bot-001",
  "client_name": "我的机器人",
  "client_type": "bot",
  "scopes": ["user_info", "binding_info", "game_data"]
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | string | 是 | 客户端唯一标识 |
| client_name | string | 是 | 客户端显示名称 |
| client_type | string | 是 | 类型：`bot`/`app`/`web` |
| scopes | array | 是 | 请求的权限范围 |
| callback_url | string | 否 | 回调地址（预留字段，当前未使用） |

**可用的 Scopes**:
| Scope | 说明 |
|-------|------|
| user_info | 用户基本信息 |
| binding_info | 绑定信息 |
| game_data | 游戏数据 |
| attendance | 签到权限 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "request_id": "req_abc123...",
    "auth_url": "/authorize?request_id=req_abc123...",
    "expires_at": "2026-01-26T15:05:00+08:00"
  }
}
```

### 获取授权请求状态（客户端轮询）

> ⚠️ 需要认证：`X-API-Key: <your-api-key>`（必须是创建请求时使用的同一 API Key）

客户端轮询此接口获取授权状态。**当授权成功时，直接返回授权数据**，无需调用其他接口。

```http
GET /api/v1/authorization/requests/:request_id/status
X-API-Key: your-api-key
```

**等待中响应**（status: pending）:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "request_id": "req_abc123...",
    "status": "pending",
    "expires_at": "2026-01-26T15:05:00+08:00"
  }
}
```

**授权成功响应**（status: used，首次获取时自动从 approved 变为 used）:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "request_id": "req_abc123...",
    "status": "used",
    "expires_at": "2026-01-26T15:05:00+08:00",
    "framework_token": "d07de9a9-48e8-4233-b49b-6933efe3b86f",
    "user_info": {
      "nickname": "用户昵称",
      "avatar": "https://..."
    },
    "binding_info": {
      "role_id": "123456",
      "nickname": "游戏昵称#1234",
      "level": 30,
      "server_id": "1"
    }
  }
}
```

**状态说明**:
| status | 说明 | 响应内容 |
|--------|------|---------|
| pending | 等待用户确认 | 基础状态 |
| approved | 已批准（首次获取时自动变为 used） | 包含授权数据 |
| rejected | 已拒绝 | 基础状态 |
| expired | 已过期 | 基础状态 |
| used | 已使用 | 包含授权数据 |

**授权成功返回的字段**：
| 字段 | 类型 | 说明 |
|------|------|------|
| framework_token | string | **关键**：用于调用 `/api/endfield/*` 数据接口的凭证 |
| user_info | object | Web 用户信息（仅 nickname、avatar，不含 ID） |
| binding_info | object | 绑定的游戏角色信息 |

**使用获取到的 Framework Token**：
```bash
curl -H "X-API-Key: your-api-key" \
     -H "X-Framework-Token: d07de9a9-48e8-4233-b49b-6933efe3b86f" \
     http://localhost:15618/api/endfield/stamina
```

### 获取授权请求详情（用户页面使用）

```http
GET /api/v1/authorization/requests/:request_id
```

### 用户批准授权

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

```http
POST /api/v1/authorization/requests/:request_id/approve
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "binding_id": "64f1a2b3c4d5e6f7a8b9c0d2"
}
```

### 用户拒绝授权

```http
POST /api/v1/authorization/requests/:request_id/reject
```

### 获取已授权客户端列表

> ⚠️ 需要认证

```http
GET /api/v1/authorization/clients
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "clients": [
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d3",
        "client_id": "my-bot-001",
        "client_name": "我的机器人",
        "client_type": "bot",
        "scopes": ["user_info", "binding_info"],
        "is_active": true,
        "last_access_at": "2026-01-26T14:30:00+08:00",
        "created_at": "2026-01-20T10:00:00+08:00"
      }
    ]
  }
}
```

### 撤销客户端授权

> ⚠️ 需要认证

```http
DELETE /api/v1/authorization/clients/:client_id
Authorization: Bearer your-access-token
```

**撤销授权机制**：
1. 撤销授权时，系统会**刷新 Framework Token**，生成新的 Token
2. 授权给客户端的旧 Framework Token 立即失效，客户端无法再查询数据
3. Web 用户和自有客户端的绑定记录会自动更新为新 Token，不受影响
4. 如果用户有其他活跃授权（同一 Framework Token 授权给多个客户端），这些授权也会更新为新 Token

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "已撤销授权"
  }
}
```

### 检查客户端授权状态（客户端调用）

> ⚠️ 需要 API Key 认证

客户端可以通过此接口检查自己的授权是否仍然有效。当用户在网页上撤销授权后，客户端应及时清理本地保存的凭证。

**建议**：客户端应定期（如每次启动时、或每隔一段时间）调用此接口检查授权状态，如果返回 `is_active: false`，应清理本地保存的 `framework_token` 

```http
GET /api/v1/authorization/clients/:client_id/status
X-API-Key: your-api-key
```

**路径参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | string | 是 | 客户端标识（创建授权请求时使用的） |

**响应示例（授权有效）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "client_id": "my-bot-001",
    "client_name": "我的机器人",
    "is_active": true,
    "framework_token": "abc123def456...",
    "message": "授权有效"
  }
}
```

**响应示例（授权已撤销）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "client_id": "my-bot-001",
    "client_name": "我的机器人",
    "is_active": false,
    "revoked_at": "2026-01-30T10:30:00+08:00",
    "message": "授权已被用户撤销，请重新申请授权"
  }
}
```

**响应字段说明**：
| 字段 | 类型 | 说明 |
|------|------|------|
| client_id | string | 客户端标识 |
| client_name | string | 客户端名称 |
| is_active | bool | **核心字段**：授权是否有效 |
| framework_token | string | 当前有效的 Framework Token（仅 `is_active=true` 时返回） |
| revoked_at | string | 撤销时间（仅 `is_active=false` 时返回） |
| message | string | 状态说明 |

**错误响应**：
```json
{
  "code": 404,
  "message": "未找到该客户端的授权记录"
}
```

**客户端使用示例**：
```javascript
// 检查授权状态
const checkAuthStatus = async (clientId) => {
  const res = await fetch(`/api/v1/authorization/clients/${clientId}/status`, {
    headers: { 'X-API-Key': API_KEY }
  });
  const { data } = await res.json();
  
  if (!data.is_active) {
    // 授权已被撤销，清理本地凭证
    localStorage.removeItem('framework_token');
    console.log('授权已被撤销，请重新授权');
    return null;
  }
  
  // 授权有效，更新本地 framework_token（可能已刷新）
  localStorage.setItem('framework_token', data.framework_token);
  return data.framework_token;
};

// 建议：启动时检查、定期检查（如每小时）
checkAuthStatus('my-bot-001');
setInterval(() => checkAuthStatus('my-bot-001'), 3600000);
```

---

## 开发者 API

> ⚠️ 以下接口用于**管理 API Key**，需要 Web 平台 JWT 认证：`Authorization: Bearer <access_token>`
>
> **API Key** 是给第三方客户端（如 QQ 机器人）使用的凭证，用于调用公开 API。
> API Key 使用 `X-API-Key` 请求头传递，与 JWT 认证独立。

### 获取 API Key 列表

```http
GET /api/v1/developer/api-keys
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "keys": [
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d4",
        "name": "我的 API Key",
        "key_prefix": "ef_abc123...xyz",
        "purpose": "用于我的机器人项目",
        "status": "active",
        "rate_limit": 60,
        "total_calls": 1234,
        "last_used_at": "2026-01-26T14:30:00+08:00",
        "created_at": "2026-01-20T10:00:00+08:00"
      }
    ]
  }
}
```

### 创建 API Key

```http
POST /api/v1/developer/api-keys
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "name": "我的 API Key",
  "purpose": "用于我的机器人项目，提供终末地数据查询服务",
  "contact": "email@example.com"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | Key 名称（1-50 字符） |
| purpose | string | 是 | 用途说明（10-500 字符） |
| contact | string | 是 | 联系方式（1-100 字符） |

**响应示例**:
```json
{
  "code": 0,
  "message": "创建成功",
  "data": {
    "key": "ef_abc123def456ghi789...",
    "details": {
      "id": "64f1a2b3c4d5e6f7a8b9c0d4",
      "name": "我的 API Key",
      "key_prefix": "ef_abc123...xyz",
      "purpose": "用于我的机器人项目",
      "status": "active",
      "rate_limit": 60,
      "total_calls": 0,
      "created_at": "2026-01-26T15:00:00+08:00"
    },
    "message": "API Key 创建成功，请妥善保管，此密钥仅显示一次"
  }
}
```

### 查看完整 API Key

```http
GET /api/v1/developer/api-keys/:id/reveal
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "key": "ef_abc123def456ghi789..."
  }
}
```

### 删除 API Key

```http
DELETE /api/v1/developer/api-keys/:id
Authorization: Bearer your-access-token
```

### 重新生成 API Key

```http
POST /api/v1/developer/api-keys/:id/regenerate
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "key": "ef_new123key456...",
    "details": { ... },
    "message": "API Key 已重新生成，请妥善保管"
  }
}
```

### 获取使用统计

```http
GET /api/v1/developer/stats?key_id=xxx&start_date=2026-01-01&end_date=2026-01-31
Authorization: Bearer your-access-token
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key_id | string | 是 | API Key ID |
| start_date | string | 否 | 开始日期 (YYYY-MM-DD) |
| end_date | string | 否 | 结束日期 (YYYY-MM-DD) |
| granularity | string | 否 | 粒度：`hour`/`day`，默认 `day` |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "total_calls": 1234,
    "total_errors": 56,
    "timeline": [
      { "date": "2026-01-25", "calls": 500, "errors": 20 },
      { "date": "2026-01-26", "calls": 734, "errors": 36 }
    ],
    "by_endpoint": [
      { "endpoint": "/api/endfield/user", "calls": 800 },
      { "endpoint": "/api/endfield/stamina", "calls": 434 }
    ]
  }
}
```

---

## 速率限制

为防止接口滥用，所有接口均有速率限制：

| 限制类型 | 限制规则 | 适用范围 |
|----------|----------|----------|
| **全局 IP 限制** | 100 请求/分钟 | 所有接口 |
| **匿名 Token** | 200 请求/Token（2 小时内） | 匿名访问 |
| **指纹获取 Token** | 10 次/分钟（同一指纹） | 获取匿名 Token |
| **登录失败锁定** | 5 次失败锁定 15 分钟 | 账号密码登录 |
| **验证码发送** | 60 秒/次（同一邮箱） | 邮箱验证码 |
| **OAuth Code** | 一次性使用 | OAuth 授权码 |

超出限制时返回 HTTP 429 状态码。

---

## 错误码说明

| 错误码 | HTTP 状态码 | 说明 |
|--------|-------------|------|
| 0 | 200 | 成功 |
| 400 | 400 | 请求参数错误 |
| 401 | 401 | 未授权，Token 无效或过期 |
| 403 | 403 | 禁止访问，权限不足 |
| 404 | 404 | 资源不存在 |
| 429 | 429 | 请求频率超限 |
| 500 | 500 | 服务器内部错误 |

---

## 使用示例

### cURL

```bash
# ============ 游戏数据 API ============

# 1. 获取登录二维码
curl http://localhost:15618/login/endfield/qr

# 2. 轮询扫码状态
curl "http://localhost:15618/login/endfield/qr/status?framework_token=xxx"

# 3. 确认登录
curl -X POST http://localhost:15618/login/endfield/qr/confirm \
  -H "Content-Type: application/json" \
  -d '{"framework_token": "xxx"}'

# 4. 调用数据 API
curl -H "X-Framework-Token: xxx" \
  http://localhost:15618/api/endfield/user

# 5. 签到
curl -X POST -H "X-Framework-Token: xxx" \
  http://localhost:15618/api/endfield/attendance

# ============ Web 平台认证（账号密码） ============

# 发送注册验证码
curl -X POST http://localhost:15618/api/v1/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"email": "test@example.com", "type": "register"}'

# 注册账号
curl -X POST http://localhost:15618/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "Password123",
    "code": "123456"
  }'

# 账号密码登录
curl -X POST http://localhost:15618/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"account": "testuser", "password": "Password123"}'

# 检查用户名是否可用
curl "http://localhost:15618/api/v1/auth/check-username?username=testuser"

# ============ Web 平台认证（OAuth） ============

# 获取 OAuth 登录 URL
curl http://localhost:15618/api/v1/auth/oauth/github

# 绑定 OAuth 到现有账号
curl -X POST http://localhost:15618/api/v1/auth/link-oauth \
  -H "Authorization: Bearer your-access-token" \
  -H "Content-Type: application/json" \
  -d '{"provider": "github", "code": "xxx", "redirect_uri": "https://yoursite.com/callback"}'

# 解绑 OAuth
curl -X POST http://localhost:15618/api/v1/auth/unlink-oauth \
  -H "Authorization: Bearer your-access-token" \
  -H "Content-Type: application/json" \
  -d '{"provider": "github"}'

# 刷新令牌
curl -X POST http://localhost:15618/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refresh_token": "xxx"}'

# 获取用户信息
curl -H "Authorization: Bearer your-access-token" \
  http://localhost:15618/api/v1/user/profile

# ============ 数据授权（需要 API Key） ============

# 创建授权请求
curl -X POST http://localhost:15618/api/v1/authorization/requests \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "my-bot",
    "client_name": "我的机器人",
    "client_type": "bot",
    "scopes": ["user_info", "binding_info"]
  }'

# 轮询授权状态（需要同一个 API Key，授权成功时直接返回 framework_token、user_info、binding_info）
curl -H "X-API-Key: your-api-key" \
  http://localhost:15618/api/v1/authorization/requests/req_xxx/status

# ============ 开发者 API ============

# 获取 API Key 列表
curl -H "Authorization: Bearer your-access-token" \
  http://localhost:15618/api/v1/developer/api-keys

# 创建 API Key
curl -X POST http://localhost:15618/api/v1/developer/api-keys \
  -H "Authorization: Bearer your-access-token" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "我的 API Key",
    "purpose": "用于机器人项目",
    "contact": "email@example.com"
  }'

# 获取使用统计
curl -H "Authorization: Bearer your-access-token" \
  "http://localhost:15618/api/v1/developer/stats?key_id=xxx"
```

### JavaScript

```javascript
// ============ 匿名访问凭证 ============

// 获取设备指纹（使用 FingerprintJS）
import FingerprintJS from '@fingerprintjs/fingerprintjs';

const getFingerprint = async () => {
  const fp = await FingerprintJS.load();
  const result = await fp.get();
  return result.visitorId;
};

// 获取匿名 Token
const getAnonymousToken = async () => {
  const fingerprint = await getFingerprint();
  const res = await fetch('http://localhost:15618/api/v1/auth/anonymous-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fingerprint })
  });
  const { data } = await res.json();
  localStorage.setItem('anonymous_token', data.token);
  return data.token;
};

// 带匿名凭证的请求
const fetchWithAuth = async (url, options = {}) => {
  let token = localStorage.getItem('anonymous_token');
  if (!token) {
    token = await getAnonymousToken();
  }
  
  return fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      'X-Anonymous-Token': token
    }
  });
};

// ============ 游戏数据 API ============

// 获取二维码
const qrRes = await fetch('http://localhost:15618/login/endfield/qr');
const { data: { framework_token, qrcode } } = await qrRes.json();

// 显示二维码
document.getElementById('qr').src = qrcode;

// 轮询状态
const pollStatus = async () => {
  const res = await fetch(`http://localhost:15618/login/endfield/qr/status?framework_token=${framework_token}`);
  const { data } = await res.json();
  
  if (data.status === 'done') {
    console.log('登录成功！');
    return framework_token;
  }
  
  setTimeout(pollStatus, 2000);
};

// 调用 API
const getUserInfo = async (token) => {
  const res = await fetch('http://localhost:15618/api/endfield/user', {
    headers: { 'X-Framework-Token': token }
  });
  return res.json();
};
```

### 账号密码认证示例

```javascript
// 1. 发送注册验证码
const sendVerificationCode = async (email, type = 'register') => {
  const res = await fetch('http://localhost:15618/api/v1/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, type })
  });
  return res.json();
};

// 2. 注册账号
const register = async (username, email, password, code) => {
  const res = await fetch('http://localhost:15618/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, email, password, code })
  });
  const { data } = await res.json();
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  return data.user;
};

// 3. 账号密码登录
const login = async (account, password) => {
  const res = await fetch('http://localhost:15618/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ account, password })
  });
  const { data } = await res.json();
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
  return data.user;
};

// 4. 绑定 OAuth（登录后）
const linkOAuth = async (provider, code, redirectUri) => {
  const res = await fetch('http://localhost:15618/api/v1/auth/link-oauth', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ provider, code, redirect_uri: redirectUri })
  });
  return res.json();
};

// 5. 解绑 OAuth
const unlinkOAuth = async (provider) => {
  const res = await fetch('http://localhost:15618/api/v1/auth/unlink-oauth', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('access_token')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ provider })
  });
  return res.json();
};
```

### OAuth 认证示例

```javascript
// 1. 获取 OAuth 登录 URL
const getOAuthURL = async (provider) => {
  const res = await fetch(`http://localhost:15618/api/v1/auth/oauth/${provider}`);
  const { data } = await res.json();
  return data.auth_url;
};

// 2. 跳转到登录页面
window.location.href = await getOAuthURL('github');

// 3. OAuth 回调后获取到 access_token，存储到 localStorage
const { access_token, refresh_token } = await handleOAuthCallback();
localStorage.setItem('access_token', access_token);
localStorage.setItem('refresh_token', refresh_token);

// 4. 调用需要认证的 API
const getProfile = async () => {
  const res = await fetch('http://localhost:15618/api/v1/user/profile', {
    headers: { 'Authorization': `Bearer ${localStorage.getItem('access_token')}` }
  });
  return res.json();
};

// 5. 刷新令牌
const refreshToken = async () => {
  const res = await fetch('http://localhost:15618/api/v1/auth/refresh', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: localStorage.getItem('refresh_token') })
  });
  const { data } = await res.json();
  localStorage.setItem('access_token', data.access_token);
  localStorage.setItem('refresh_token', data.refresh_token);
};
```

### 数据授权示例（客户端，需要 API Key）

```javascript
const API_KEY = 'your-api-key'; // 开发者 API Key

// 1. 创建授权请求（需要 API Key）
const createAuthRequest = async () => {
  const res = await fetch('http://localhost:15618/api/v1/authorization/requests', {
    method: 'POST',
    headers: {
      'X-API-Key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      client_id: 'my-bot-001',
      client_name: '我的机器人',
      client_type: 'bot',
      scopes: ['user_info', 'binding_info', 'game_data']
    })
  });
  return res.json();
};

// 2. 引导用户到授权页面
const { data } = await createAuthRequest();
console.log(`请访问授权页面: https://your-web.com${data.auth_url}`);

// 3. 轮询授权状态（需要同一个 API Key）
const pollAuthStatus = async (requestId) => {
  while (true) {
    const res = await fetch(`http://localhost:15618/api/v1/authorization/requests/${requestId}/status`, {
      headers: { 'X-API-Key': API_KEY }
    });
    const { data } = await res.json();
    
    // 授权成功时，data 中已包含 framework_token、user_info、binding_info
    if (data.status === 'approved' || data.status === 'used') {
      console.log('授权成功！');
      console.log('Framework Token:', data.framework_token);
      console.log('用户信息:', data.user_info);
      console.log('绑定信息:', data.binding_info);
      return data;
    } else if (data.status === 'rejected' || data.status === 'expired') {
      throw new Error(`授权${data.status === 'rejected' ? '被拒绝' : '已过期'}`);
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
};

// 4. 使用获取到的 Framework Token 调用数据 API（仍需 API Key 进行接口认证）
const getGameData = async (frameworkToken) => {
  const res = await fetch('http://localhost:15618/api/endfield/stamina', {
    headers: {
      'X-API-Key': API_KEY,
      'X-Framework-Token': frameworkToken
    }
  });
  return res.json();
};
```

### 开发者 API 示例

```javascript
// 创建 API Key
const createAPIKey = async (accessToken) => {
  const res = await fetch('http://localhost:15618/api/v1/developer/api-keys', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: '我的机器人 Key',
      purpose: '用于我的 QQ 机器人，提供终末地数据查询服务',
      contact: 'example@email.com'
    })
  });
  const { data } = await res.json();
  console.log('请保存您的 API Key:', data.key);
  return data;
};

// 使用 API Key 调用接口
const callWithAPIKey = async (apiKey, endpoint) => {
  const res = await fetch(`http://localhost:15618${endpoint}`, {
    headers: { 'X-API-Key': apiKey }
  });
  return res.json();
};
```

---

## 更新日志

### v2.1.0 (2026-02-05)

- ✅ **OAuth 账号合并功能**
  - 绑定 OAuth 时，如果该 OAuth 已是独立账号（无邮箱密码），支持账号合并
  - 合并流程：检测 → 返回 `need_confirm_merge` → 用户确认 → 执行合并
  - 合并时迁移的数据：API Keys、MaaEnd 设备绑定、MaaEnd 任务记录、其他已绑定的 OAuth
  - 新增请求参数：`confirm_merge`、`oauth_id`
  - 新增响应字段：`need_confirm_merge`、`oauth_id`、`existing_user_info`、`merged_api_keys`

- ✅ **公告同步完整数据**
  - 新增 `raw_data` 字段存储森空岛接口返回的完整原始 JSON
  - 修复 `downloadEnable` 字段类型不一致问题（列表接口返回 bool，详情接口返回 int）
  - 新增 `POST /api/announcements/admin/resync-details` 接口重新同步公告详情
  - `GET /api/announcements/admin/sync/status` 新增 `need_detail_resync_count` 字段

### v2.0.0 (2026-02-04)

- ✅ **OAuth 绑定流程修复**
  - **问题**：已登录用户在设置页绑定 OAuth（QQ/GitHub）时，会创建新用户而非绑定到当前账号
  - **原因**：OAuth 回调统一走 `FindOrCreateUser`，未区分登录和绑定场景
  - **修复**：
    - `GET /api/v1/auth/oauth/:provider` 新增 `action=bind` 参数
    - 绑定操作时 state 带 `bind:` 前缀
    - OAuth 回调检测到 `bind:` 前缀时，不消费 code，直接重定向给前端
    - 前端用 JWT + code 调用 `/api/v1/auth/link-oauth` 完成绑定
  - **结果**：绑定后 QQ 登录和账号密码登录是同一个用户，用户 ID 相同

- ✅ **文档更新**
  - 更新 `获取 OAuth 登录 URL` 接口文档，新增 `action` 参数说明
  - 更新 `绑定 OAuth 账号` 接口文档，详细描述完整绑定流程
  - 更新 `ARCHITECTURE.md` 中的 OAuth 绑定流程说明

### v1.9.9 (2026-02-04)

- ✅ **新增 B站 Wiki 数据抓取 API**
  - 数据来源：哔哩哔哩终末地 Wiki（wiki.biligame.com/zmd）
  - 使用 goquery 解析 HTML 页面，无需官方 API
  - 支持 7 种图鉴数据：干员、武器、装备、设备、物品、敌对单位、活动

- ✅ **B站 Wiki 接口**
  - `GET /api/bili-wiki/operators` - 获取干员列表（支持稀有度、职业筛选）
  - `GET /api/bili-wiki/operators/:name` - 获取干员详情
  - `GET /api/bili-wiki/weapons` - 获取武器列表
  - `GET /api/bili-wiki/equipments` - 获取装备列表
  - `GET /api/bili-wiki/devices` - 获取设备列表
  - `GET /api/bili-wiki/items` - 获取物品列表（支持稀有度、类型筛选）
  - `GET /api/bili-wiki/enemies` - 获取敌对单位列表（支持类型、等级筛选）
  - `GET /api/bili-wiki/activities` - 获取活动列表（特许寻访/武库申领）
  - `GET /api/bili-wiki/search` - 全文搜索
  - `GET /api/bili-wiki/stats` - 获取统计信息
  - `POST /api/bili-wiki/admin/sync` - 手动触发同步
  - `GET /api/bili-wiki/admin/sync/status` - 获取同步状态

- ✅ **同步机制**
  - 每 6 小时自动同步
  - 首次启动 60 秒后执行首次同步
  - 请求间隔 200ms（防止 IP 被封）
  - 支持 context 取消信号，优雅关闭

- ✅ **活动日历解析**
  - 从首页解析特许寻访和武库申领活动
  - 自动解析活动时间（data-start/data-end）
  - 自动判断活动是否进行中

- ✅ **依赖更新**
  - 新增 `github.com/PuerkitoBio/goquery v1.8.1`

### v1.9.7 (2026-02-02)

- ✅ **新增公告同步 API**
  - `GET /api/announcements` - 获取公告列表（支持分页和筛选）
  - `GET /api/announcements/:id` - 获取公告详情
  - `GET /api/announcements/latest` - 获取最新公告（用于客户端轮询）
  - `POST /api/announcements/admin/sync` - 手动触发同步
  - `GET /api/announcements/admin/sync/status` - 获取同步状态

- ✅ **公告同步机制**
  - 每 2 分钟自动检查并同步新公告
  - 数据来源：森空岛终末地官方账号（`userId=3737967211133`）
  - 增量同步：只同步比数据库中最新的更新的公告
  - 完整保留原始格式（`format` 字段保存完整 JSON）
  - 使用公共账号池，无需用户凭证

- ✅ **查询功能**
  - 支持分页查询（page、page_size）
  - 支持按游戏 ID 筛选（game_id）
  - 支持按分类 ID 筛选（cate_id）
  - 支持按内容类型筛选（view_kind：1=视频, 3=图文）
  - 按发布时间倒序排列

- ✅ **时间戳同步问题修复**
  - **问题**：公告同步频繁失败，返回 10003 错误（请勿修改设备本地时间）
  - **原因**：多个 client 共享同一个 account，但只有 refresh 会更新时间戳。
    Wiki 同步复用同一 client 内部时间戳持续更新；公告同步每次创建新 client 使用旧时间戳。
  - **解决**：新增 `GetClientWithForceRefresh` 方法，公告同步强制刷新 Token 获取最新时间戳

### v1.9.6 (2026-02-01)

- ✅ **模拟抽卡大保底机制**
  - 新增 `is_guaranteed_up` 状态字段
  - 50/50 歪了后，下次6星必出UP（大保底）
  - 状态在 `state` 和 `stats` 中均返回

- ✅ **免费十连规则修正**
  - 每期卡池仅限1次（30抽后获得）
  - 60抽获得的情报书用于**下一期**卡池
  - `gifts` 新增 `free_ten_available` 字段表示可用次数

- ✅ **个人抽卡统计修正**
  - 免费抽卡（`is_free=true`）不计入保底计数
  - 免费抽卡仍计入稀有度统计
  - 前端历史记录显示"免费"标签

### v1.9.5 (2026-02-01)

- ✅ **新增卡池角色分布 API**
  - `GET /api/endfield/gacha/pool-chars` - 获取卡池可获得角色列表
  - 数据从玩家抽卡记录自动聚合（服务启动时 + 每 24 小时）
  - 角色封面图从 Wiki 数据关联，自动转换为代理 URL
  - 支持干员和武器两种类型
  - 前端模拟抽卡可显示具体角色图片和名称

- ✅ **数据模型扩展**
  - `WikiCharPool` 新增 `pool_type`、`star6_chars`、`star5_chars`、`star4_chars` 字段
  - 新增 `PoolCharInfo` 结构体（char_id、name、cover、rarity、is_up）

### v1.9.4 (2026-02-01)

- ✅ **Wiki 攻略数据结构支持**
  - 支持 typeMainId=2（游戏攻略辑）的完整数据结构
  - 新增 `chapter_group` 字段：章节组定义
  - 新增 `widget_common_map` 字段：攻略 tab 切换组件
    - `tab_list`：多个作者的攻略列表
    - `tab_data_map`：每个 tab 对应的文档内容（引用 `document_map`）
  - 新增 `extra_info` 字段：额外展示信息
  - 干员攻略（typeSubId=11）支持多作者内容切换

### v1.9.3 (2026-02-01)

- ✅ **新增模拟抽卡 API**
  - `GET /api/endfield/gacha/simulate/rules` - 获取卡池规则
  - `POST /api/endfield/gacha/simulate/single` - 模拟单抽
  - `POST /api/endfield/gacha/simulate/ten` - 模拟十连
  - `POST /api/endfield/gacha/simulate/free-ten` - 模拟免费十连（不计入保底）
  - `POST /api/endfield/gacha/simulate/batch` - 批量模拟（统计分析）
  - 支持三种卡池类型：限定角色池、武器池、常驻池
  - 完整实现软保底、硬保底、50/50机制
  - 支持赠送机制检测（信物、情报书、自选等）

### v1.9.2 (2026-01-31)

- ✅ **Wiki 条目详情同步**
  - 新增 `/web/v1/wiki/item/info?id=` 接口调用
  - 同步时获取每个条目的完整详情内容（content 字段）
  - 支持图片、表格、视频、嵌套内容等富文本结构
  - 速率限制：每个请求间隔 100ms，避免请求过快

### v1.9.1 (2026-01-31)

- ✅ **Wiki 角色卡池名字补充**
  - 原始 API 返回的角色名字为空
  - 同步时自动通过 `associate.id` 查询 Wiki 条目补充名字
  - 数据库中保存完整的角色信息

- ✅ **抽卡统计当前卡池信息动态获取**
  - 移除硬编码的卡池信息
  - 自动从 Wiki 角色卡池数据获取当前活跃卡池
  - 根据卡池有效期和 `dot_type=label_type_up` 判断 UP 角色

- ✅ **Wiki 插件优雅关闭优化**
  - 使用可取消的 context 传递给同步任务
  - 每个同步阶段检查取消信号，快速响应关闭请求
  - 关闭时有 5 秒超时保护，避免无限等待

### v1.9.0 (2026-01-31)

- ✅ **新增 Wiki 百科 API**
  - 提供终末地百科数据查询功能
  - 数据来源：森空岛 Wiki 接口（4 个数据源）
  - 支持主/子分类结构、条目列表、条目详情、全文搜索
  - 3 个主分类，16 个子分类，约 1027 条百科条目
  - 额外数据：角色卡池、活动列表、表情包

- ✅ **Wiki 数据同步机制**
  - 每 6 小时自动从森空岛同步数据
  - 服务启动 30 秒后执行首次同步
  - 使用公共账号池（复用同一客户端保持时间戳同步）
  - 支持手动触发同步

- ✅ **Wiki 缓存策略**
  - 分类列表缓存 1 小时
  - 条目列表/详情缓存 30 分钟
  - 角色卡池/表情包缓存 1 小时
  - 搜索结果缓存 10 分钟

- ✅ **新增接口**
  - `GET /api/wiki/categories` - 获取主分类列表
  - `GET /api/wiki/categories/:main_type_id/sub` - 获取子分类列表
  - `GET /api/wiki/items` - 获取条目列表（支持分类筛选）
  - `GET /api/wiki/items/:id` - 获取条目详情
  - `GET /api/wiki/search` - 全文搜索（支持 `q` 和 `keyword` 参数）
  - `GET /api/wiki/char-pools` - 获取角色卡池
  - `GET /api/wiki/activities` - 获取活动列表
  - `GET /api/wiki/stickers` - 获取表情包列表
  - `GET /api/wiki/stats` - 获取统计信息
  - `POST /api/wiki/admin/sync` - 手动触发同步
  - `GET /api/wiki/admin/sync/status` - 获取同步状态

### v1.6.4 (2026-01-29)

- ✅ **移除无效的 `/cultivate/zone` 接口**
  - 森空岛实际上没有 `/api/v1/game/endfield/cultivate/zone` 接口（返回 404）
  - 地区建设数据应从 `/card/detail` 的 `detail.domain` 获取

- ✅ **新增 `/api/endfield/domain` 便捷端点**
  - 从 `/card/detail` 提取 `detail.domain` 数据
  - 返回地区列表、聚落信息、收集统计等
  - 与插件端 `area.js` 实现方式一致

- ✅ **便捷端点优化**
  - `/stamina`、`/spaceship`、`/note`、`/domain` 优先使用凭证库中存储的角色信息
  - 减少不必要的 API 调用（原先每次都会额外查询绑定信息和用户信息）
  - 只有凭证库没有 `RoleID` 时才会动态获取

### v1.6.3 (2026-01-29)

- ✅ **游戏数据接口参数简化**
  - `roleId` 和 `serverId` 参数现在**全部可选**
  - 不提供时自动从凭证库（Framework Token 关联）获取
  - 影响接口：`/card/detail`、`/card/char`
  - 便捷端点（`/stamina`、`/spaceship`、`/note`）保持不变（本来就是可选）

- ✅ **森空岛 API userId 参数修复（关键！）**
  - 森空岛 API 的 `userId` 参数需要使用**森空岛用户 ID**（如 `6012976`），**不是**游戏角色 ID（如 `1320645122`）
  - 新增 `SklandUserId` 字段（来自 `/api/v1/user` 的 `user.id`）
  - 登录时自动获取并存储到凭证库
  - `GetCardDetail`、`GetCardChar`、`GetCultivateZone` 等接口自动使用正确的 `userId`
  - **前端无需传递任何用户标识参数**，后端全部自动处理

- ✅ **干员详情接口参数修复**
  - 森空岛 API 需要 `operatorId` 和 `charId` 两个参数（值必须相同）
  - 后端接收 `instId` 参数，自动映射到上游 API 的 `operatorId` 和 `charId`

- ⚠️ **重要提示**
  - 旧用户需要**重新登录**才能获取 `SklandUserId`
  - 旧凭证如果没有 `SklandUserId`，接口调用可能返回 `10001: 操作失败，请稍后重试`

### v1.6.2 (2026-01-29)

- ✅ **数据授权接口安全增强**
  - 创建授权请求 (`POST /api/v1/authorization/requests`) 需要 API Key
  - 轮询授权状态 (`GET /api/v1/authorization/requests/:id/status`) 需要同一 API Key
  - 获取授权数据 (`GET /api/v1/authorization/requests/:id/data`) 需要同一 API Key
  - 只有创建请求的 API Key 用户才能获取授权结果
  - `callback_url` 改为可选参数

- ✅ **安全性增强：登录接口不再暴露敏感凭证**
  - 手机验证码登录 (`/login/endfield/phone/verify`) 只返回 `framework_token`
  - 扫码确认登录 (`/login/endfield/qr/confirm`) 只返回 `framework_token`
  - 移除响应中的 `cred` 和 `token` 字段
  - 敏感凭证仅存储在后端数据库，不对外暴露

- ✅ **新增图片代理接口**
  - `GET /api/proxy/image?url=xxx` - 代理白名单域名的图片
  - 用于绕过森空岛 CDN（bbs.hycdn.cn 等）的防盗链限制
  - 公开接口，无需认证

- ✅ **新增鹰角游戏列表接口**
  - `GET /api/hypergryph/app-list` - 获取鹰角所有游戏及服务器列表
  - 返回完整的游戏代码、名称、渠道、服务器信息
  - 用于前端正确显示服务器名称（如 serverId=1 对应 "China"）
  - 公开接口，无需认证，缓存 1 小时

- ✅ **签到接口优化**
  - 重复签到不再返回 500 错误
  - 正确返回 `already_signed: true` 和原始提示信息
  - 支持缓存（1 天）

- ✅ **便签接口响应增强**
  - `base.avatarUrl` - 玩家头像 URL
  - `chars[].avatarSqUrl` - 干员方形头像
  - `chars[].avatarRtUrl` - 干员矩形头像

- ✅ **Dashboard 访问控制优化**
  - 支持匿名用户访问（有 Framework Token 即可）
  - 未登录用户可查看公开数据

### v1.6.1 (2026-01-29)

- ✅ **Framework Token 授权共享**
  - 第三方客户端可通过授权获取 Web 用户的 Framework Token
  - **轮询状态接口合并授权数据**：授权成功后直接返回 `framework_token`、`user_info`、`binding_info`
  - 不返回敏感信息：`user_info` 只含 `nickname`/`avatar`，不返回 `id`；不返回 `game_data`
  - 撤销授权时自动刷新 Framework Token，使旧 Token 失效
  - 刷新后自动更新 Web 用户和自有客户端的绑定记录

### v1.6.0 (2026-01-29)

- ✅ **统一认证中间件**
  - 新增 `UnifiedAuth` 中间件，支持三种认证方式：API Key / Web JWT / Anonymous Token
  - 终末地数据 API (`/api/endfield/*`) 全部接入统一认证
  - Framework Token 定位变更：从"认证凭证"变为"游戏数据查询凭证"
  
- ✅ **凭证库增强**
  - 新增 `SklandUid` 字段用于登录去重（区分森空岛用户 UID 和游戏角色 ID）
  - 新增 `ServerID` 字段
  - 登录时自动使同一 `SklandUid` 的旧凭证失效

- ✅ **凭证清理插件（取代刷新插件）**
  - 每 6 小时自动清理失效凭证（`is_valid=false` 且超过 7 天）
  - 支持按类型清理（过期/重复/全部）
  - 清理日志包含详细统计

- ✅ **管理接口变更**
  - `POST /api/endfield/admin/cleanup-credentials` - 手动触发清理（原 `refresh-credentials`）
  - `GET /api/endfield/admin/credential-status` - 凭证状态统计（响应格式更新）

### v1.5.1 (2026-01-28)

- ✅ 扫码登录状态优化
  - 新增 `authed` 状态（已授权，正在获取凭证）
  - 新增 `remaining_ms` 返回字段（剩余有效时间，毫秒）
  - 二维码 3 分钟有效期检测
  - 过期后返回 `expired` 状态而非 404 错误
- ✅ 绑定 API 认证优化
  - 修复 GET 请求认证逻辑
  - 支持 `X-User-Identifier` Header 认证

### v1.5.0 (2026-01-28)

- ✅ 统一绑定系统重构
  - 凭证库与绑定库分离设计
  - 凭证库（`endfield_login_sessions`）：存储 frameworkToken + cred + token
  - 绑定库（`endfield_users`）：存储用户绑定关系，通过 frameworkToken 关联凭证
  - 支持 Web 用户（JWT）和第三方客户端（user_identifier）两种认证方式
- ✅ 新增统一绑定 API
  - `GET /api/v1/bindings` - 获取绑定列表
  - `POST /api/v1/bindings` - 创建绑定
  - `DELETE /api/v1/bindings/:id` - 删除绑定
  - `POST /api/v1/bindings/:id/primary` - 设为主绑定
  - `POST /api/v1/bindings/:id/refresh` - 刷新凭证
- ✅ 新增 `client_type` 字段区分客户端类型：web/bot/third_party
- ✅ 保留旧 API 兼容（`/user/binding`）

### v1.4.1 (2026-01-27)

- ✅ 修复终末地签到接口
  - 修正签到请求头配置（platform: 3, vName: 1.0.0）
  - 新增 `sk-game-role` 请求头支持
  - 自动获取角色绑定信息进行签到
- ✅ 新增凭证自动刷新插件
  - 每 30 分钟自动检查并刷新所有 Framework Token
  - 自动标记失效凭证
  - 支持手动触发刷新（管理员接口）
- ✅ 完善绑定数据结构
  - 新增 `GameRole` 类型支持 `roles` 数组

### v1.4.0 (2026-01-27)

- ✅ 新增匿名访问凭证系统
  - 设备指纹绑定
  - 匿名 Token 生成/验证
  - Token 自动刷新机制
  - 请求计数限制（200 次/Token）

### v1.3.0 (2026-01-27)

- ✅ 新增账号密码认证系统
  - 邮箱注册（需验证码）
  - 账号密码登录
  - 密码重置/修改
  - 用户名/邮箱可用性检查
- ✅ 新增 OAuth 绑定管理
  - 绑定 OAuth 到现有账号
  - 解绑 OAuth 账号
- ✅ 安全增强
  - 登录失败锁定（5 次失败锁定 15 分钟）
  - 验证码发送速率限制（60 秒/次）
  - IP 级别暴力破解防护

### v1.2.0 (2026-01-26)

- ✅ 新增 Web 平台认证系统
  - OAuth 登录（QQ、GitHub）
  - JWT 令牌管理（Access Token + Refresh Token）
  - 用户信息接口
- ✅ 新增数据授权服务
  - 客户端发起授权请求
  - 用户确认/拒绝授权
  - 授权数据获取
  - 已授权客户端管理
- ✅ 新增开发者 API 服务
  - API Key 创建/删除/重新生成
  - 使用统计查询
  - 速率限制

### v1.1.0 (2026-01-26)

- ✅ 新增便捷端点：`/api/endfield/stamina` 体力查询
- ✅ 新增便捷端点：`/api/endfield/spaceship` 帝江号建设
- ✅ 新增便捷端点：`/api/endfield/note` 便签信息
- ✅ 便捷端点支持自动获取角色上下文（无需手动传 roleId）

### v1.0.0 (2026-01-26)

- ✅ 扫码登录功能
- ✅ 手机验证码登录
- ✅ Cred 直接绑定
- ✅ 用户信息查询
- ✅ 角色详情查询
- ✅ 终末地签到
- ✅ Wiki 搜索接口
