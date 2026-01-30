# Endfield-API 接口文档

版本号：1.8.0

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

抽卡记录采用**用户文档模型**，每个用户的所有抽卡记录存储在一个文档中，按卡池类型分类：

```json
{
  "framework_token": "uuid-xxx",
  "skland_uid": "205594538",
  "game_uid": "1320645122",
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
| `total_pulls` | 全服总抽数 |
| `total_users` | 已同步记录的用户数 |
| `star6_total` | 6星总数 |
| `avg_pity` | 全服平均出货（抽数/6星） |
| `current_pool` | 当前UP卡池信息（用于判断歪不歪） |
| `by_type` | 按卡池类型分类的统计 |
| `by_channel` | 按渠道/服务器分类的统计（官服/B服） |
| `ranking` | 出货排名（各角色/武器获取数量排名） |
| `distribution` | 6星出货分布（按抽数区间） |

**当前卡池信息**（用于判断是否歪了）:
| 字段 | 说明 |
|------|------|
| `pool_name` | 当前卡池名称 |
| `up_char_name` | UP角色名称 |
| `up_char_id` | UP角色ID（可用于匹配抽卡记录） |

> **注意**：当前卡池信息为临时硬编码，后续会通过独立接口动态获取。

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
      "current": 77,
      "max": 82,
      "recover": 360,
      "maxTs": 1706284800,
      "updateTs": 1706280000
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
      { "provider": "qq", "oauth_id": "123456" },
      { "provider": "github", "oauth_id": "789012" }
    ]
  }
}
```

---

### 绑定 OAuth 账号

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

将已登录的账号绑定到第三方 OAuth（QQ/GitHub）。

```http
POST /api/v1/auth/link-oauth
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "provider": "github",
  "code": "oauth-authorization-code",
  "redirect_uri": "https://yoursite.com/oauth/callback"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| provider | string | 是 | OAuth 提供商：`qq` 或 `github` |
| code | string | 是 | OAuth 授权码 |
| redirect_uri | string | 是 | 回调地址（需与获取 code 时一致） |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "绑定成功",
    "linked_oauth": [
      { "provider": "github", "oauth_id": "789012" }
    ]
  }
}
```

**错误情况**:
| 错误码 | 说明 |
|--------|------|
| 400 | 该 OAuth 账号已被其他用户绑定 |
| 400 | 该 OAuth 已绑定此账号 |

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
