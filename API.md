# Endfield-API 接口文档

版本号：3.5.0

## 概述

Endfield-API 是一个基于 Go + Gin 的终末地 API 服务，提供森空岛账号登录、游戏数据查询、Web 平台认证、数据授权、开发者 API、蓝图库社区等功能。

- **Base URL**: `http://localhost:15618`

---

### 认证凭证说明

本系统使用三种不同的凭证，各有不同用途：

| 凭证类型 | Header | 用途 | 获取方式 |
|----------|--------|------|----------|
| **Anonymous Token** | `X-Anonymous-Token` | 未登录用户访问凭证，绑定设备标识（建议持久化 UUID） | 提交设备标识获取 |
| **Framework Token** | `X-Framework-Token` | 游戏账号绑定凭证，用于查询游戏角色数据 | 扫码/手机/Cred/skport 账号密码登录后获取 |
| **JWT Access Token** | `Authorization: Bearer <token>` | Web 平台用户认证，用于用户相关操作 | 注册/登录/OAuth 后获取 |
| **API Key** | `X-API-Key` | 第三方客户端认证，用于机器人等调用 | 开发者申请创建 |

**重要说明**：
- `Anonymous Token` 用于未登录用户，绑定设备标识（建议持久化 UUID），有效期 2 小时，防止接口滥用
- `Framework Token` **仅用于**查询森空岛游戏数据（体力、角色、签到等），与 Web 平台用户体系**完全独立**
- `JWT Token` 用于 Web 平台的用户登录状态，管理用户账号、授权、开发者功能等
- 所有公开接口受 **IP 级别速率限制**（600 请求/分钟）保护

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
  "fingerprint": "设备标识（建议 UUID，至少32字符）"
}
```

**请求参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| fingerprint | string | 是 | 设备标识（建议 UUID，至少 32 字符） |

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
| 指纹绑定 | 同一设备标识会复用 Token |
| 自动刷新 | 剩余时间 < 1 小时时自动刷新 |
| 获取频率限制 | 10 次/分钟（同一设备标识 + IP） |

**前端设备标识生成示例（推荐）**：

```javascript
const DEVICE_ID_KEY = 'endfield_device_uuid';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

const fingerprint = getOrCreateDeviceId();
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

> **多角色支持**：一个鹰角账号下可能绑定多个终末地游戏角色（如官服、B站服）。所有登录接口（扫码/手机/Cred）在登录成功时都会返回 `available_roles` 字段，列出该账号下所有可用角色。
>
> **典型使用流程**：
> 1. 调用登录接口获取 `framework_token` 和 `available_roles`
> 2. 展示角色列表供用户选择
> 3. 对每个要绑定的角色调用 `POST /api/v1/bindings`，传入 `role_id` 等信息
> 4. 查询数据时，便捷端点支持 `?roleId=xxx` 指定角色；不传则使用主绑定角色

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
| 0 | done | 登录成功（返回 `available_roles`） |
| -2 | expired | 已过期（3分钟未扫码） |
| -3 | failed | 获取凭证失败 |

**二维码有效期**: 3 分钟。超时后需重新获取二维码。

**登录成功时的响应（status=done）**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "code": 0,
    "msg": "已登录",
    "status": "done",
    "framework_token": "uuid-xxx-xxx",
    "available_roles": [
      {
        "skland_uid": "205594538",
        "channel_name": "官服",
        "role_id": "1282470074",
        "server_id": "1",
        "server_name": "China",
        "nickname": "清",
        "level": 53,
        "is_default": true
      },
      {
        "skland_uid": "298512137",
        "channel_name": "bilibili服",
        "role_id": "1028880050",
        "server_id": "1",
        "server_name": "China",
        "nickname": "清影",
        "level": 2,
        "is_default": false
      }
    ]
  }
}
```

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
    "framework_token": "uuid-xxx-xxx",
    "available_roles": [...]
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
  "message": "成功",
  "data": {
    "message": "验证码已发送",
    "framework_token": "uuid-xxx-xxx",
    "expire": 300
  }
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
    "framework_token": "uuid-xxx-xxx",
    "available_roles": [
      {
        "skland_uid": "205594538",
        "channel_name": "官服",
        "role_id": "1282470074",
        "server_id": "1",
        "server_name": "China",
        "nickname": "清",
        "level": 53,
        "is_default": true
      }
    ]
  }
}
```

**触发验证码时响应示例**：
```json
{
  "code": 401,
  "message": "登录需要人机验证",
  "data": {
    "requires_captcha": true,
    "provider": "skland",
    "captcha": {
      "geetestId": "0bb913d19ed86b8e64a46ecd57cce147",
      "challenge": "ad283fdc71545395705fae91961cd70b"
    }
  }
}
```

#### 第三方客户端验证码桥接（Device-Flow）

用于第三方客户端（Bot/桌面端/移动端）在触发极验时「打开网页验证后继续登录」。

1) `POST /login/endfield/phone/verify/start`
- 入参：`phone/code`，可选 `device_id/device_secret/callback_url/state`
- 成功：直接返回 `framework_token`
- 触发验证码：返回 `requires_captcha=true` + `captcha_ticket` + `poll_token` + `verification_url`

2) `POST /login/endfield/phone/captcha/complete`
- 由网页验证码页调用，提交 geetest 结果
- 入参：`captcha_ticket` + `captcha`（`geetest_challenge/geetest_validate/geetest_seccode`）
- 成功后 flow 进入 `verified`

3) `GET /login/endfield/phone/captcha/status?poll_token=...`
- 第三方客户端轮询状态
- 返回 `pending / verified / failed / cancelled / completed`

4) `POST /login/endfield/phone/captcha/exchange`
- 入参：`poll_token`，可选 `device_secret`
- 成功返回 `framework_token`
- 一次性兑换，重复调用返回冲突错误

5) `POST /login/endfield/phone/captcha/cancel`
- 客户端主动取消会话

6) `POST /login/endfield/phone/captcha/refresh`
- 当网页侧出现 `old challenge`（或后端返回 `SKLAND_CAPTCHA_RETRY_REQUIRED`）时调用
- 入参：`captcha_ticket`
- 返回最新 `captcha.geetestId/challenge` 与 `verification_url`，用于刷新页面挑战参数

**安全与约束**：
- `captcha_ticket` 用于网页侧提交验证码，`poll_token` 仅用于客户端轮询与兑换。
- `exchange` 仅允许成功一次；重复调用返回冲突错误。
- 若 `start` 时提供 `device_secret`，则 `exchange` 时必须匹配。
- 使用 API Key 场景下，`status/exchange/cancel` 仅允许会话所属 API Key 用户访问。

**错误码（新增）**：
- `SKLAND_CAPTCHA_REQUIRED`：触发验证码
- `SKLAND_CAPTCHA_RETRY_REQUIRED`：验证码挑战更新，需要重新验证
- `SKLAND_CAPTCHA_FLOW_NOT_FOUND`：会话不存在
- `SKLAND_CAPTCHA_FLOW_EXPIRED`：会话过期
- `SKLAND_CAPTCHA_FLOW_INTERNAL_ERROR`：会话处理失败

---

### skport 国际服账号密码登录

#### 账号密码登录

```http
POST /login/skport/password
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "your-password",
  "captcha": {
    "captcha_id": "e61c70262f5150dd21b22b06efd2c8cc",
    "lot_number": "d45622f13ccd4af698ca4610ada6ccee",
    "pass_token": "49367e...",
    "gen_time": "1772887188",
    "captcha_output": "Kpxop0X...",
    "challenge": "c43abe8221a3c1b5608199b21a683087"
  }
}
```

> `captcha` 为可选字段：首次登录一般不传；当接口返回 `requires_captcha=true` 时，前端完成 geetest 校验后，将校验结果按上述结构回传并重试登录。

**请求参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | skport 账号邮箱 |
| password | string | 是 | skport 账号密码 |
| captcha | object | 否 | 人机验证结果（仅在触发验证后重试时传入） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "登录成功",
    "framework_token": "uuid-xxx-xxx",
    "provider": "skport",
    "available_roles": [
      {
        "skport_uid": "205594538",
        "channel_name": "official",
        "role_id": "1282470074",
        "server_id": "1",
        "server_name": "Global",
        "nickname": "PlayerName",
        "level": 53,
        "is_default": true
      }
    ]
  }
}
```

**触发验证码时响应示例**：
```json
{
  "code": 401,
  "message": "登录需要人机验证",
  "data": {
    "requires_captcha": true,
    "provider": "skport",
    "captcha": {
      "geetestId": "e61c70262f5150dd21b22b06efd2c8cc",
      "challenge": "c43abe8221a3c1b5608199b21a683087",
      "riskType": "icon|1772887188|c43abe8221a3c1b5608199b21a683087|..."
    }
  }
}
```

**错误说明**：
- 当上游返回人机验证要求时，接口返回 401：`登录需要人机验证`（并返回 `captcha` 挑战参数）
- 当账号密码错误时，接口返回 401：`账号或密码错误`

#### 第三方客户端验证码桥接（Device-Flow）

用于第三方客户端（Bot/桌面端/移动端）在触发极验时「打开网页验证后继续登录」。

1) `POST /login/skport/password/start`
- 入参：`email/password`，可选 `device_id/device_secret/callback_url/state`
- 成功：直接返回 `framework_token`
- 触发验证码：返回 `requires_captcha=true` + `captcha_ticket` + `poll_token` + `verification_url`

请求示例：
```http
POST /login/skport/password/start
Content-Type: application/json
X-API-Key: sk_xxx

{
  "email": "user@example.com",
  "password": "your-password",
  "device_id": "discord-bot-01",
  "device_secret": "local-random-secret",
  "callback_url": "myapp://skport-captcha-callback",
  "state": "trace-123"
}
```

触发验证码响应示例：
```json
{
  "code": 401,
  "message": "登录需要人机验证",
  "data": {
    "error_code": "SKPORT_CAPTCHA_REQUIRED",
    "provider": "skport",
    "requires_captcha": true,
    "captcha_ticket": "8f8f4f7c-...",
    "poll_token": "f0d7bc57-...",
    "verification_url": "/captcha/skport?captcha_ticket=...&captcha_id=...&challenge=...",
    "status_endpoint": "/login/skport/password/captcha/status",
    "exchange_endpoint": "/login/skport/password/captcha/exchange",
    "cancel_endpoint": "/login/skport/password/captcha/cancel",
    "expires_in": 300,
    "captcha": {
      "geetestId": "e61c70262f5150dd21b22b06efd2c8cc",
      "challenge": "c43abe...",
      "riskType": "icon|..."
    }
  }
}
```

2) `POST /login/skport/password/captcha/complete`
- 由网页验证码页调用，提交 geetest 结果
- 入参：`captcha_ticket` + `captcha`
- 成功后 flow 进入 `verified`

3) `GET /login/skport/password/captcha/status?poll_token=...`
- 第三方客户端轮询状态
- 返回 `pending / verified / failed / cancelled / completed`

4) `POST /login/skport/password/captcha/exchange`
- 入参：`poll_token`，可选 `device_secret`
- 成功返回 `framework_token`
- 一次性兑换，重复调用返回冲突错误

5) `POST /login/skport/password/captcha/cancel`
- 客户端主动取消会话

**安全与约束**：
- `captcha_ticket` 用于网页侧提交验证码，`poll_token` 仅用于客户端轮询与兑换。
- `exchange` 仅允许成功一次；重复调用返回冲突错误。
- 若 `start` 时提供 `device_secret`，则 `exchange` 时必须匹配。
- 使用 API Key 场景下，`status/exchange/cancel` 仅允许会话所属 API Key 用户访问。

**错误码（新增）**：
- `SKPORT_CAPTCHA_REQUIRED`：触发验证码
- `SKPORT_CAPTCHA_RETRY_REQUIRED`：验证码挑战更新，需要重新验证
- `SKPORT_CAPTCHA_FLOW_NOT_FOUND`：会话不存在
- `SKPORT_CAPTCHA_FLOW_EXPIRED`：会话过期
- `SKPORT_CAPTCHA_FLOW_INTERNAL_ERROR`：会话处理失败

**限流说明**：
- `start`：按 `apiKey + IP + email` 做细粒度限流（分钟级）
- `status`：按 `apiKey + IP + poll_token` 做轮询限流（秒级）

#### Google 第三方登录桥接（Browser-Bridge）

用于 Google OAuth 回调无法直达业务域名时的桥接方案（由浏览器插件捕获回调参数后回传后端）。

前端负责调用 `POST /login/skport/google/start` 创建 flow 并拉起授权页；插件仅负责监听回调并自动调用 `complete`。

1) `POST /login/skport/google/start`
- 作用：由前端创建 Google 登录 flow，返回 `flow_id` 与 `auth_url`
- 可选入参：`callback_url`，但必须是白名单地址（当前固定 `https://www.skport.com/?tpa_action=login`）
- 建议：前端缓存 `flow_id`，并拉起授权页

请求示例：
```http
POST /login/skport/google/start
Content-Type: application/json
X-API-Key: sk_xxx

{
  "callback_url": "https://www.skport.com/?tpa_action=login"
}
```

响应示例：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "provider": "skport",
    "flow_id": "2d8f5f7c-7d7e-4a80-9aa3-0f3f6f0c9e20",
    "status": "pending",
    "auth_url": "https://accounts.google.com/o/oauth2/v2/auth?...",
    "callback_url": "https://www.skport.com/?tpa_action=login",
    "expires_in": 300,
    "status_endpoint": "/login/skport/google/status",
    "complete_endpoint": "/login/skport/google/complete",
    "cancel_endpoint": "/login/skport/google/cancel"
  }
}
```

2) `POST /login/skport/google/complete`
- 作用：提交插件捕获到的 `channel_token` 完成登录兑换
- 入参：`channel_token`，可选 `channel_id`（默认 2），`flow_id`（可选）
- 自动化模式：`flow_id` 为空时，后端按当前 API Key（或匿名）自动匹配最近未完成 flow
- 处理：后端执行 `token_by_third_party_token -> oauth grant -> generate_cred_by_code`，最终写入 `framework_token`

请求示例：
```http
POST /login/skport/google/complete
Content-Type: application/json
X-API-Key: sk_xxx

{
  "channel_id": 2,
  "channel_token": "eyJ0b2tlbiI6Ii4uLiIsInR5cGUiOjJ9"
}
```

3) `GET /login/skport/google/status?flow_id=...`
- 作用：轮询 flow 状态
- 支持：`flow_id` 可选；为空时自动查询当前 API Key（或匿名）最近 flow
- 状态：`pending / completed / failed / cancelled`
- 当 `completed` 时返回 `framework_token` 与 `available_roles`

4) `POST /login/skport/google/cancel`
- 作用：取消未完成 flow

**安全与约束**：
- `flow_id` 默认 TTL 5 分钟，过期后不可继续兑换。
- `complete` 为一次性完成语义；重复完成会返回冲突错误。
- API Key 场景下，`status/complete/cancel` 必须与创建 flow 的 API Key 用户一致。
- 服务端仅存储 `channel_token` 的哈希（`channel_token_hash`），避免明文落库。
- 自动化模式下，插件仅提交 `channel_token`，后端自动匹配“当前调用方最近未完成 flow”。

**错误码（新增）**：
- `SKPORT_GOOGLE_FLOW_NOT_FOUND`：flow 不存在
- `SKPORT_GOOGLE_FLOW_EXPIRED`：flow 已过期
- `SKPORT_GOOGLE_FLOW_INVALID_STATUS`：flow 状态不允许该操作
- `SKPORT_GOOGLE_FLOW_ALREADY_COMPLETED`：flow 已完成
- `SKPORT_GOOGLE_FLOW_INTERNAL_ERROR`：flow 处理失败

#### Facebook 第三方登录桥接（Browser-Bridge）

用于 Facebook OAuth 回调无法直达业务域名时的桥接方案（由浏览器插件捕获回调参数后回传后端）。

前端负责调用 `POST /login/skport/facebook/start` 创建 flow 并拉起授权页；插件仅负责监听回调并自动调用 `complete`。

1) `POST /login/skport/facebook/start`
- 作用：由前端创建 Facebook 登录 flow，返回 `flow_id` 与 `auth_url`
- 可选入参：`callback_url`，但必须是白名单地址（当前固定 `https://www.skport.com/?tpa_action=login`）
- 建议：前端缓存 `flow_id`，并拉起授权页

请求示例：
```http
POST /login/skport/facebook/start
Content-Type: application/json
X-API-Key: sk_xxx

{
  "callback_url": "https://www.skport.com/?tpa_action=login"
}
```

响应示例：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "provider": "skport",
    "flow_id": "2d8f5f7c-7d7e-4a80-9aa3-0f3f6f0c9e21",
    "status": "pending",
    "auth_url": "https://www.facebook.com/v13.0/dialog/oauth?...",
    "callback_url": "https://www.skport.com/?tpa_action=login",
    "expires_in": 300,
    "status_endpoint": "/login/skport/facebook/status",
    "complete_endpoint": "/login/skport/facebook/complete",
    "cancel_endpoint": "/login/skport/facebook/cancel"
  }
}
```

2) `POST /login/skport/facebook/complete`
- 作用：提交插件捕获到的 `channel_token` 完成登录兑换
- 入参：`channel_token`，可选 `channel_id`（默认 3），`flow_id`（可选）
- 自动化模式：`flow_id` 为空时，后端按当前 API Key（或匿名）自动匹配最近未完成 flow
- 处理：后端执行 `token_by_third_party_token -> oauth grant -> generate_cred_by_code`，最终写入 `framework_token`

请求示例：
```http
POST /login/skport/facebook/complete
Content-Type: application/json
X-API-Key: sk_xxx

{
  "channel_id": 3,
  "channel_token": "eyJ0b2tlbiI6Ii4uLiIsInR5cGUiOjJ9"
}
```

3) `GET /login/skport/facebook/status?flow_id=...`
- 作用：轮询 flow 状态
- 支持：`flow_id` 可选；为空时自动查询当前 API Key（或匿名）最近 flow
- 状态：`pending / completed / failed / cancelled`
- 当 `completed` 时返回 `framework_token` 与 `available_roles`

4) `POST /login/skport/facebook/cancel`
- 作用：取消未完成 flow

**安全与约束**：
- `flow_id` 默认 TTL 5 分钟，过期后不可继续兑换。
- `complete` 为一次性完成语义；重复完成会返回冲突错误。
- API Key 场景下，`status/complete/cancel` 必须与创建 flow 的 API Key 用户一致。
- 服务端仅存储 `channel_token` 的哈希（`channel_token_hash`），避免明文落库。
- 自动化模式下，插件仅提交 `channel_token`，后端自动匹配“当前调用方最近未完成 flow”。

**错误码（新增）**：
- `SKPORT_FACEBOOK_FLOW_NOT_FOUND`：flow 不存在
- `SKPORT_FACEBOOK_FLOW_EXPIRED`：flow 已过期
- `SKPORT_FACEBOOK_FLOW_INVALID_STATUS`：flow 状态不允许该操作
- `SKPORT_FACEBOOK_FLOW_ALREADY_COMPLETED`：flow 已完成
- `SKPORT_FACEBOOK_FLOW_INTERNAL_ERROR`：flow 处理失败

#### Apple 第三方登录桥接（Browser-Bridge）

用于 Apple OAuth 回调无法直达业务域名时的桥接方案（由浏览器插件捕获回调参数后回传后端）。

前端负责调用 `POST /login/skport/apple/start` 创建 flow 并拉起授权页；插件仅负责监听回调并自动调用 `complete`。

1) `POST /login/skport/apple/start`
- 作用：由前端创建 Apple 登录 flow，返回 `flow_id` 与 `auth_url`
- 可选入参：`callback_url`，但必须是白名单地址（当前固定 `https://www.skport.com/?tpa_action=login`）
- 建议：前端缓存 `flow_id`，并拉起授权页

请求示例：
```http
POST /login/skport/apple/start
Content-Type: application/json
X-API-Key: sk_xxx

{
  "callback_url": "https://www.skport.com/?tpa_action=login"
}
```

响应示例：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "provider": "skport",
    "flow_id": "2d8f5f7c-7d7e-4a80-9aa3-0f3f6f0c9e21",
    "status": "pending",
    "auth_url": "https://appleid.apple.com/auth/authorize?...",
    "callback_url": "https://www.skport.com/?tpa_action=login",
    "expires_in": 300,
    "status_endpoint": "/login/skport/apple/status",
    "complete_endpoint": "/login/skport/apple/complete",
    "cancel_endpoint": "/login/skport/apple/cancel"
  }
}
```

2) `POST /login/skport/apple/complete`
- 作用：提交插件捕获到的 `channel_token` 完成登录兑换
- 入参：`channel_token`，可选 `channel_id`（默认 4），`flow_id`（可选）
- 自动化模式：`flow_id` 为空时，后端按当前 API Key（或匿名）自动匹配最近未完成 flow
- 处理：后端执行 `token_by_third_party_token -> oauth grant -> generate_cred_by_code`，最终写入 `framework_token`

请求示例：
```http
POST /login/skport/apple/complete
Content-Type: application/json
X-API-Key: sk_xxx

{
  "channel_id": 4,
  "channel_token": "eyJjb2RlIjoiLi4uIiwidHlwZSI6Mn0="
}
```

3) `GET /login/skport/apple/status?flow_id=...`
- 作用：轮询 flow 状态
- 支持：`flow_id` 可选；为空时自动查询当前 API Key（或匿名）最近 flow
- 状态：`pending / completed / failed / cancelled`
- 当 `completed` 时返回 `framework_token` 与 `available_roles`

4) `POST /login/skport/apple/cancel`
- 作用：取消未完成 flow

**安全与约束**：
- `flow_id` 默认 TTL 5 分钟，过期后不可继续兑换。
- `complete` 为一次性完成语义；重复完成会返回冲突错误。
- API Key 场景下，`status/complete/cancel` 必须与创建 flow 的 API Key 用户一致。
- 服务端仅存储 `channel_token` 的哈希（`channel_token_hash`），避免明文落库。
- 自动化模式下，插件仅提交 `channel_token`，后端自动匹配“当前调用方最近未完成 flow”。

**错误码（新增）**：
- `SKPORT_APPLE_FLOW_NOT_FOUND`：flow 不存在
- `SKPORT_APPLE_FLOW_EXPIRED`：flow 已过期
- `SKPORT_APPLE_FLOW_INVALID_STATUS`：flow 状态不允许该操作
- `SKPORT_APPLE_FLOW_ALREADY_COMPLETED`：flow 已完成
- `SKPORT_APPLE_FLOW_INTERNAL_ERROR`：flow 处理失败

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

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "成功",
    "framework_token": "uuid-xxx-xxx",
    "user_info": { ... },
    "endfield_binding": { ... },
    "available_roles": [
      {
        "skland_uid": "205594538",
        "channel_name": "官服",
        "role_id": "1282470074",
        "server_id": "1",
        "server_name": "China",
        "nickname": "清",
        "level": 53,
        "is_default": true
      },
      {
        "skland_uid": "298512137",
        "channel_name": "bilibili服",
        "role_id": "1028880050",
        "server_id": "1",
        "server_name": "China",
        "nickname": "清影",
        "level": 2,
        "is_default": false
      }
    ]
  }
}
```

> **多角色说明**：`available_roles` 列出该 Cred 下所有终末地角色。客户端拿到后，对每个需要绑定的角色调用 `POST /api/v1/bindings` 并传入对应的 `role_id`。

#### 验证 Cred 有效性

```http
GET /login/endfield/cred/verify?cred=xxx
```

---

## 统一绑定 API

> 支持 **Web 用户**（JWT）和**第三方客户端**（API Key + user_identifier）两种认证方式
>
> 凭证数据按 provider 分库存储：国服在凭证库（`endfield_login_sessions`）+ 绑定库（`endfield_users`），国际服在凭证库（`skport_login_sessions`）+ 绑定库（`skport_users`）。

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
| provider | string | 否 | 绑定提供方：`skland`/`skport`，默认 `skland` |
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
        "skland_uid": "205594538",
        "channel_name": "官服",
        "role_id": "1282470074",
        "server_id": "1",
        "server_name": "China",
        "nickname": "清",
        "level": 53,
        "client_type": "web",
        "is_primary": true,
        "is_valid": true,
        "framework_token": "uuid-xxx-xxx",
        "created_at": "2026-01-26T14:00:00+08:00"
      },
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d2",
        "skland_uid": "298512137",
        "channel_name": "bilibili服",
        "role_id": "1028880050",
        "server_id": "1",
        "server_name": "China",
        "nickname": "清影",
        "level": 2,
        "client_type": "web",
        "is_primary": false,
        "is_valid": true,
        "framework_token": "uuid-xxx-xxx",
        "created_at": "2026-01-26T14:00:00+08:00"
      }
    ],
    "count": 2
  }
}
```

> **向下兼容**：旧用户的绑定记录可能缺少 `channel_name`、`server_name`、`level` 等字段。首次获取绑定列表时，后端会异步从凭证库补充这些字段。
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
  "provider": "skland",
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
  "provider": "skland",
  "user_identifier": "QQ12345",
  "client_type": "bot",
  "client_id": "my-bot-001",
  "is_primary": true,
  "role_id": "1282470074",
  "server_id": "1",
  "server_name": "China",
  "nickname": "清",
  "skland_uid": "205594538",
  "channel_name": "官服",
  "level": 53
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| framework_token | string | 是 | 登录后获取的统一凭证 |
| provider | string | 否 | 绑定提供方：`skland`/`skport`，默认 `skland` |
| user_identifier | string | 条件必填 | 用户标识（无 JWT 时必填） |
| client_type | string | 否 | 客户端类型：web/bot/third_party |
| client_id | string | 否 | 客户端标识 |
| is_primary | bool | 否 | 是否设为主绑定 |
| role_id / roleId | string | 否 | 指定绑定的角色 ID（不传则使用凭证库默认角色） |
| server_id / serverId | string | 否 | 服务器 ID |
| server_name | string | 否 | 服务器名称 |
| nickname | string | 否 | 角色昵称 |
| skland_uid | string | 否 | 国服角色 UID（provider=skland） |
| skport_uid | string | 否 | 国际服角色 UID（provider=skport） |
| channel_name | string | 否 | 渠道名（如官服/bilibili/official） |
| level | int | 否 | 角色等级 |

> **多角色绑定**：通过指定不同的 `role_id`，可以为同一个 `framework_token` 创建多条绑定记录。`role_id` 等字段建议从登录响应的 `available_roles` 中取值。

**响应示例**:
```json
{
  "code": 0,
  "message": "绑定成功",
  "data": {
    "id": "64f1a2b3c4d5e6f7a8b9c0d1",
    "role_id": "1282470074",
    "nickname": "清",
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
DELETE /api/v1/bindings/:id?provider=skland
X-API-Key: your-api-key
```

> 注意：只能删除自己创建的绑定（按 API Key 所有者隔离）
> 
> `provider` 可选：`skland`/`skport`，默认 `skland`。

### 设置主绑定

```http
POST /api/v1/bindings/:id/primary?provider=skland
Authorization: Bearer your-access-token  # 或 X-API-Key
```

> `provider` 可选：`skland`/`skport`，默认 `skland`。

### 刷新绑定凭证

手动刷新凭证库中的 Token（通常自动刷新，无需手动调用）。

```http
POST /api/v1/bindings/:id/refresh?provider=skland
Authorization: Bearer your-access-token  # 或 X-API-Key
```

> `provider` 可选：`skland`/`skport`，默认 `skland`。

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

### 获取终末地枚举数据

```http
GET /api/endfield/enums
X-Framework-Token: your-framework-token
```

**说明**:
- 转发森空岛 `/web/v1/game/endfield/enums`，返回稀有度、职业、属性、武器类型、技能类型、装备类型、词条、成就分类等枚举数据。
- `skport` 暂时不支持该接口；后续国际服补齐上游能力后，将取消 provider 限制，国服/国际服均可使用。

### 获取角色详情卡片

```http
GET /api/endfield/card/detail
X-Framework-Token: your-framework-token
```

**Query 参数**（全部可选，不提供则按 provider 对应绑定库解析目标角色）:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId / role_id | string | 否 | 指定游戏角色 ID |
| serverId / server_id | int | 否 | 指定服务器 ID，建议与 roleId 一起传 |

> 角色选择优先级：`roleId`/`role_id` 显式指定 > `framework_token` 对应主绑定（`is_primary=true`）> 任意有效绑定（兜底）> 登录会话默认角色。

### 获取干员详情

```http
GET /api/endfield/card/char?instId=xxx
X-Framework-Token: your-framework-token
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| instId | string | **是** | 干员实例 ID（对应 `/note` 接口返回的 `chars[].id`） |
| roleId / role_id | string | 否 | 指定游戏角色 ID |
| serverId / server_id | int | 否 | 指定服务器 ID，建议与 roleId 一起传 |

> 角色选择优先级：`roleId`/`role_id` 显式指定 > `framework_token` 对应主绑定（`is_primary=true`）> 任意有效绑定（兜底）> 登录会话默认角色。

- 2026-03-13 版本后，后端会尝试自动修补 `tacticalItem.iconUrl`：先用缓存补全，仍缺失时回源 `search/tactical-items` 建立目录映射后再补全。
- 兼容两类结构：`tacticalItem` 直接对象，以及 `tacticalItem.tacticalItemData` 包装结构（`iconUrl`/`icon_url` 均支持）。
- 若上游目录接口本身也缺失对应图标，最终仍可能为空。

### 获取影拓丰碑数据

```http
GET /api/endfield/card/indie-hard
X-Framework-Token: your-framework-token
```

**Query 参数**（全部可选，不提供则按 provider 对应绑定库解析目标角色）:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId / role_id | string | 否 | 指定游戏角色 ID |
| serverId / server_id | int | 否 | 指定服务器 ID，建议与 roleId 一起传 |

> 角色选择优先级：`roleId`/`role_id` 显式指定 > `framework_token` 对应主绑定（`is_primary=true`）> 任意有效绑定（兜底）> 登录会话默认角色。
> 转发森空岛 `/api/v1/game/endfield/card/indie-hard`。`skport` 暂时不支持该接口；后续国际服补齐上游能力后，将取消 provider 限制，国服/国际服均可使用。

### 终末地签到

```http
POST /api/endfield/attendance
X-Framework-Token: your-framework-token
```

**Query 参数**（全部可选，不提供则按 provider 对应绑定库解析目标角色）:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId / role_id | string | 否 | 指定游戏角色 ID |
| serverId / server_id | int | 否 | 指定服务器 ID，建议与 roleId 一起传 |

> 角色选择优先级：`roleId`/`role_id` 显式指定 > `framework_token` 对应主绑定（`is_primary=true`）> 任意有效绑定（兜底）> 登录会话默认角色。
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
| GET | `/api/wiki/facilities` | 获取设备列表（含功耗/等级） |
| GET | `/api/wiki/facilities/:item_id` | 获取单个设备详情 |
| PUT | `/api/wiki/facilities/:item_id` | 更新设备功耗/等级（人工维护） |
| POST | `/api/wiki/facilities/batch` | 批量导入/更新设备数据 |
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
  "data": {
    "categories": [
      {
        "sub_id": "1",
        "main_type_id": "1",
        "name": "干员",
        "icon": "https://...",
        "style": 1,
        "status": 1,
        "position": 1,
        "item_count": 24,
        "filter_tag_tree": [
          {
            "tag_id": "10200",
            "name": "干员职业",
            "type": 4,
            "children": [
              { "tag_id": "10201", "name": "近卫", "type": 4, "value": "profession_guard" },
              { "tag_id": "10203", "name": "突击", "type": 4, "value": "profession_assault" },
              { "tag_id": "10204", "name": "先锋", "type": 4, "value": "profession_vanguard" }
            ]
          },
          {
            "tag_id": "10000",
            "name": "星级",
            "type": 2,
            "children": [
              { "tag_id": "10001", "name": "1星", "type": 2, "value": "rarity_1" },
              { "tag_id": "10006", "name": "6星", "type": 2, "value": "rarity_6" }
            ]
          },
          {
            "tag_id": "10100",
            "name": "属性",
            "type": 3,
            "children": [
              { "tag_id": "10101", "name": "灼热", "type": 3, "value": "char_property_fire" },
              { "tag_id": "10102", "name": "电磁", "type": 3, "value": "char_property_pulse" }
            ]
          }
        ]
      }
    ],
    "total": 9,
    "main_type_id": "1"
  }
}
```

**`filter_tag_tree` 字段说明**：

筛选标签树，用于构建前端分类筛选 UI。每个子分类可包含多组筛选标签。

| 字段 | 类型 | 说明 |
|------|------|------|
| tag_id | string | 标签 ID |
| name | string | 标签名称（如"干员职业"、"星级"、"属性"） |
| type | int | 标签类型 |
| value | string | 标签值（叶子节点有值，如 `profession_guard`、`rarity_6`） |
| children | array | 子标签列表（递归结构） |

> 条目的 `tag_ids` 数组中的 ID 对应 `filter_tag_tree` 中叶子节点的 `tag_id`，可用于筛选匹配。

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

**与抽卡统计联动（双数据源 UP 判定）**：
- 角色池 UP 判定采用**官方 Wiki 优先、B站 Wiki 补充**的双数据源合并策略
- **官方 Wiki**（`wiki_char_pools`）：从 `chars[dot_type="label_type_up"]` 提取 UP 角色名，数据结构化准确但可能延迟更新
- **B站 Wiki**（`bili_activities`，`type="特许寻访"`）：从活动的 `up` 字段获取 UP 角色名，更新及时
- 当前卡池检测优先使用官方 Wiki 的时间戳判断，若无活跃卡池或 UP 信息为空则自动降级到 B站 Wiki（动态解析 `start_time`/`end_time` 判断是否进行中，不依赖 `is_active` 静态字段）
- 武器池 UP 从 `bili_activities`（`type="武库申领"`）获取，同样使用动态时间判断

### 设备管理 API

> **用途**: 人工维护设备功耗和等级，Wiki 同步时仅自动补充名称和图标
> **集合**: `wiki_facilities`

#### 获取设备列表

```http
GET /api/wiki/facilities
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "facilities": [
      {
        "item_id": "53",
        "name": "精炼炉",
        "power_consumption": 5,
        "tier": 1,
        "icon_url": "https://bbs.hycdn.cn/image/..."
      }
    ],
    "total": 13
  }
}
```

#### 更新设备功耗/等级

```http
PUT /api/wiki/facilities/53
X-API-Key: your-api-key
Content-Type: application/json

{
  "power_consumption": 5,
  "tier": 1
}
```

#### 批量导入设备数据

```http
POST /api/wiki/facilities/batch
X-API-Key: your-api-key
Content-Type: application/json

[
  { "item_id": "53", "name": "精炼炉", "power_consumption": 5, "tier": 1 },
  { "item_id": "xxx", "name": "粉碎机", "power_consumption": 5, "tier": 1 }
]
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "upserted": 13,
    "total": 13
  }
}
```

---

## 产线计算器 API

> **接口认证**: 需要 API Key / Web JWT / Anonymous Token 三选一
> **数据来源**: Wiki 同步时自动解析设备/物品文档中的配方表格 + 人工维护的设备功耗/等级
> **ID 体系**: 使用 Wiki 条目 ID（数字字符串，如 `"193"`）作为统一标识
> **数据智能过滤**: 只返回有效的产线配方及其关联物品/设备，非产线数据自动排除

### 接口概览

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/calc/items` | 统一认证 | 获取参与产线的物品 |
| GET | `/api/calc/recipes` | 统一认证 | 获取有效配方（有设备关联+有输入输出） |
| GET | `/api/calc/facilities` | 统一认证 | 获取所有设备（含功耗/等级） |
| GET | `/api/calc/all` | 统一认证 | 一次性获取全部数据（推荐，只含配方引用的设备） |
| GET | `/api/calc/production-list` | Web JWT | 获取当前用户的生产列表 |
| POST | `/api/calc/production-list` | Web JWT | 保存生产列表（整体覆盖） |
| POST | `/api/wiki/admin/parse-recipes` | 统一认证 | 手动触发配方解析（不需等 Wiki 同步） |

### 获取产线计算物品

> 只返回实际参与有效配方的物品（从配方的 inputs/outputs 反向收集），非产线物品自动排除。

```http
GET /api/calc/items
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "items": [
      {
        "item_id": "193",
        "name": "紫晶纤维",
        "tier": 2,
        "icon_url": "https://bbs.hycdn.cn/image/...",
        "as_target": true
      }
    ],
    "total": 102
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| item_id | string | Wiki 条目 ID（唯一标识） |
| name | string | 物品名称 |
| tier | int | 等级（从 Wiki tagIDs 星级标签提取：10001=1星...10006=6星） |
| icon_url | string | 物品图标（Wiki brief.cover） |
| as_target | bool | 是否可作为生产目标（配方输出且非中间灌装产物） |

### 获取产线计算配方

> **过滤规则**: 只返回 `facility_item_id` 非空且有输入输出的有效配方。
> **crafting_time 修复**: Wiki 解析为 0 时自动推断默认值（基础加工 2s，高级加工 10s）。
> **ID 稳定性**: 优先使用 `recipe_hash`（MD5），不随数据库重建变化。

```http
GET /api/calc/recipes
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "recipes": [
      {
        "id": "a3f5c7d9e1b2...",
        "facility_item_id": "53",
        "facility_name": "精炼炉",
        "inputs": [
          { "item_id": "205", "name": "蓝铁矿", "amount": 1 }
        ],
        "outputs": [
          { "item_id": "194", "name": "蓝铁块", "amount": 1 }
        ],
        "crafting_time": 2
      }
    ],
    "total": 120
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 配方唯一标识（优先 recipe_hash，回退 ObjectId） |
| facility_item_id | string | 设备的 Wiki 条目 ID |
| facility_name | string | 设备名称（冗余，方便展示） |
| inputs | array | 输入物品列表 `[{item_id, name, amount}]` |
| outputs | array | 输出物品列表 `[{item_id, name, amount}]` |
| crafting_time | int | 制作时间（秒），0 时自动推断默认值 |

**crafting_time 默认值推断**：

| 设备类型 | 默认值 | 说明 |
|---------|--------|------|
| 封装机、配件机、装备原件机 | 10 秒 | 高级加工配方 |
| 其他设备 | 2 秒 | 基础加工配方 |

### 获取产线计算设备

> 独立接口返回所有设备；`/api/calc/all` 只返回被配方引用的设备。

```http
GET /api/calc/facilities
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "facilities": [
      {
        "item_id": "53",
        "name": "精炼炉",
        "power_consumption": 5,
        "tier": 1,
        "icon_url": "https://bbs.hycdn.cn/image/..."
      }
    ],
    "total": 13
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| item_id | string | 设备的 Wiki 条目 ID |
| name | string | 设备名称 |
| power_consumption | int | 功耗（W），通过导入脚本或手动维护 |
| tier | int | 等级（1-4），通过导入脚本或手动维护 |
| icon_url | string | 设备图标（Wiki brief.cover） |

### 一次性获取全部数据

> 推荐前端初始化时使用。与独立接口的区别：**只返回被有效配方引用的设备**（非产线设备如传送带、塔防等自动排除）。

```http
GET /api/calc/all
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "items": [...],
    "recipes": [...],
    "facilities": [...]
  }
}
```

### 手动触发配方解析

> 从数据库已有的 wiki_items 数据解析配方，**不需要等待 Wiki 全量同步完成**。
> 适用于：删除配方数据后重建、修改解析逻辑后刷新等场景。

```http
POST /api/wiki/admin/parse-recipes
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "配方解析任务已启动（后台执行中）"
}
```

### 生产列表云端同步

> **接口认证**: 需要 Web JWT（`Authorization: Bearer <jwt>`），仅登录用户可用
> **数据模型**: 一个用户一条文档，整体覆盖保存
> **安全措施**: 所有字符串字段经过 HTML 清洗 + XSS 检测 + MongoDB 注入防护

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/calc/production-list` | 获取当前用户的生产列表 |
| POST | `/api/calc/production-list` | 保存生产列表（整体覆盖） |

#### 获取生产列表

```http
GET /api/calc/production-list
Authorization: Bearer <jwt>
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "entries": [
      {
        "id": "m1abc23def",
        "name": "蓝铁块产线",
        "targets": [
          { "item_id": "194", "rate": 5 }
        ],
        "recipe_overrides": [
          { "item_id": "194", "recipe_id": "a3f5c7d9..." }
        ],
        "manual_raw_materials": ["205"],
        "ceil_mode": true,
        "created_at": 1707300000000,
        "updated_at": 1707300000000
      }
    ],
    "updated_at": 1707300000000
  }
}
```

> 无数据时返回 `{ "entries": [], "updated_at": 0 }`

#### 保存生产列表

```http
POST /api/calc/production-list
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "entries": [
    {
      "id": "m1abc23def",
      "name": "蓝铁块产线",
      "targets": [
        { "item_id": "194", "rate": 5 }
      ],
      "recipe_overrides": [
        { "item_id": "194", "recipe_id": "a3f5c7d9..." }
      ],
      "manual_raw_materials": ["205"],
      "ceil_mode": true,
      "created_at": 1707300000000,
      "updated_at": 1707300000000
    }
  ],
  "updated_at": 1707300000000
}
```

**输入验证规则**：

| 限制项 | 规则 |
|--------|------|
| entries 数量 | <= 100 |
| 每条 entry 的 targets 数量 | <= 50 |
| entry.id 长度 | 1-50 字符 |
| entry.name 长度 | <= 100 字符（自动截断） |
| item_id / recipe_id 长度 | 1-50 字符 |
| target.rate | > 0 且 <= 999999 |
| recipe_overrides 数量 | <= 200 |
| manual_raw_materials 数量 | <= 200 |

**安全清洗**：所有字符串字段经过 `SanitizeInput`（移除 HTML 标签、转义特殊字符）+ `SanitizeForMongoDB`（移除 `$` 操作符）处理。`name` 字段额外通过 `ValidateSafeString` 检测脚本注入模式。

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "保存成功",
    "entries": 3
  }
}
```

#### 条目字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 条目唯一标识（前端生成） |
| name | string | 用户命名（默认为目标产物名拼接） |
| targets | array | 目标产物 `[{item_id, rate}]` |
| recipe_overrides | array | 配方覆盖 `[{item_id, recipe_id}]` |
| manual_raw_materials | array | 手动标记为原料的物品 ID 列表 |
| ceil_mode | bool | 是否对设备数量取整 |
| created_at | int64 | 创建时间戳（毫秒） |
| updated_at | int64 | 更新时间戳（毫秒） |

---

### 设备功耗/等级导入

设备的 `power_consumption` 和 `tier` 需要人工维护（Wiki 中无此数据）。

**导入脚本**（`scripts/import-facilities.mjs`）：
```bash
# 预览
node scripts/import-facilities.mjs --api-key your-api-key --dry-run

# 正式导入
node scripts/import-facilities.mjs --api-key your-api-key

# 指定数据文件
node scripts/import-facilities.mjs --api-key your-api-key --file path/to/data.json
```

**数据文件格式**（`endfield-api/docs/facility_init_data.json`）：
```json
[
  { "name": "精炼炉", "power_consumption": 5, "tier": 1, "item_id": "53" },
  { "name": "粉碎机", "power_consumption": 5, "tier": 1 }
]
```

脚本按名称匹配后端设备列表，调用 `POST /api/wiki/facilities/batch` 批量更新。

### 配方数据来源说明

配方数据**仅从设备 Wiki** 自动解析（设备页是唯一权威来源，包含正确的输入输出数量和制作时间）：

- **设备 Wiki**（`sub_type_id=5`）：从"使用方式 → 相关配方"表格中解析
  - 表格统一 3 列结构：`原料需求 | 制作产物 | 消耗时长`
  - 列角色通过表头关键字自动检测（Time > Output > Input 优先级）
  - 设备 ID 来自当前条目本身
  - 支持多表格（如种植机的"基础模式"+"液体模式"）和合并标题行

**配方同步机制**：每次配方解析完成后，会自动清理数据库中不在本次解析结果中的旧配方（基于 `recipe_hash` 集合比对），确保数据始终与最新 Wiki 数据一致。

> 详细的解析流程与技术实现参见 [配方解析系统文档](recipe-parser.md)。

**触发方式**：
- 自动：Wiki 全量同步时（每 6 小时）
- 手动：`POST /api/wiki/admin/parse-recipes`（独立触发，不需等同步）

**存储集合**：
- 配方: `wiki_recipes`（自动解析，随 Wiki 同步更新）
- 设备: `wiki_facilities`（name/icon_url 自动同步，power_consumption/tier 通过导入脚本维护）

---

## V2 产线计算器 API (基于解包数据)

> **接口认证**: 需要 API Key / Web JWT / Anonymous Token 三选一
> **数据来源**: 游戏解包数据（`game_data` 集合），而非 Wiki 解析
> **ID 体系**: 使用游戏内部 ID（如 `furnance_1`、`item_quartz_glass`），与游戏数据一致
> **与 V1 的区别**: V1 基于 Wiki 解析数据（可能不完整），V2 基于游戏解包数据（配方完整、ID 准确）

### 接口概览

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/calc/v2/recipes` | 统一认证 | 获取所有解包配方 |
| GET | `/api/calc/v2/facilities` | 统一认证 | 获取所有解包设备 |
| GET | `/api/calc/v2/all` | 统一认证 | 一次性获取全部数据（配方 + 物品 + 设备） |

### 获取 V2 配方

```http
GET /api/calc/v2/recipes
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "recipes": [
      {
        "id": "furnance_quartz_glass_1",
        "name_cn": "紫晶纤维生产",
        "name_en": "Quartz Glass Production",
        "machine_id": "furnance_1",
        "inputs": [
          { "item_id": "item_quartz_sand", "count": 1 }
        ],
        "outputs": [
          { "item_id": "item_quartz_glass", "count": 1 }
        ],
        "crafting_time": 6.0,
        "group_id": "group_furnance_normal"
      }
    ],
    "total": 150
  }
}
```

### 获取 V2 设备

```http
GET /api/calc/v2/facilities
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "facilities": [
      {
        "id": "furnance_1",
        "name_cn": "精炼炉",
        "name_en": "Refining Unit",
        "power_consume": 5,
        "need_power": true
      }
    ],
    "total": 25
  }
}
```

### 获取 V2 全部数据

> 推荐前端初始化时使用，一次请求返回配方、物品、设备全部数据。

```http
GET /api/calc/v2/all
X-API-Key: your-api-key
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "recipes": [...],
    "items": [
      {
        "id": "item_quartz_glass",
        "name_cn": "紫晶纤维",
        "name_en": "Quartz Glass"
      }
    ],
    "facilities": [...],
    "total_recipes": 150,
    "total_items": 80,
    "total_facilities": 25
  }
}
```

---

## 游戏数据同步 API

> **认证**: `X-Admin-Secret` 请求头（密钥配置在 `config/admin.yaml`）
> **用途**: 同步游戏数据（设备/物品/配方等）到 `game_data` 集合，供蓝图自动填充和产线计算使用
> **集合**: `game_data`（统一存储，按 `table_name` 区分）

### 接口概览

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| POST | `/api/admin/game-data/sync` | Admin Secret | 同步游戏数据 |
| GET | `/api/admin/game-data` | Admin Secret | 查询游戏数据 |
| GET | `/api/admin/game-data/tables` | Admin Secret | 获取已同步表名列表及统计 |

### 同步游戏数据

```http
POST /api/admin/game-data/sync
X-Admin-Secret: your-admin-secret
Content-Type: application/json

{
  "table_name": "factory_buildings",
  "version": "1.0.0",
  "data": {
    "furnance_1": {
      "id": "furnance_1",
      "name": { "cn": "精炼炉", "en": "Refining Unit" },
      "needPower": true,
      "powerConsume": "5",
      ...
    },
    "grinder_1": { ... }
  }
}
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| table_name | string | 是 | 表名（见下方支持列表） |
| version | string | 否 | 版本号（用于追踪数据版本） |
| data | object | 是 | 原始 JSON 数据，key 为条目 ID，value 为完整条目数据 |

**支持的 table_name**（共 33 种）：

| 分类 | table_name | 对应解包文件 | 说明 |
|------|------------|-------------|------|
| 核心工厂 | `factory_buildings` | `FactoryBuildingTable.json` | 工厂建筑（含功耗） |
| | `items` | `ItemTable.json` | 物品表 |
| | `factory_recipes` | `FactoryMachineCraftTable.json` | 配方表 |
| | `factory_recipe_groups` | `FactoryMachineCraftGroupTable.json` | 配方分组 |
| | `factory_machine_crafters` | `FactoryMachineCrafterTable.json` | 机器制造模式 |
| | `factory_items` | `FactoryItemTable.json` | 工厂物品 |
| 物流设施 | `factory_grid_belts` | `FactoryGridBeltTable.json` | 传送带 |
| | `factory_grid_routers` | `FactoryGridRouterTable.json` | 分流器/汇流器 |
| | `factory_grid_connecters` | `FactoryGridConnecterTable.json` | 物流桥 |
| | `factory_box_valves` | `FactoryBoxValveTable.json` | 物品准入口 |
| | `factory_liquid_pipes` | `FactoryLiquidPipeTable.json` | 管道 |
| | `factory_liquid_routers` | `FactoryLiquidRouterTable.json` | 管道分流/汇流 |
| | `factory_liquid_connecters` | `FactoryLiquidConnecterTable.json` | 管道桥 |
| 蓝图相关 | `factory_blueprint_tags` | `FactoryBlueprintTagTable.json` | 蓝图标签 |
| | `factory_system_blueprint_meta` | `FactorySystemBlueprintMetaTable.json` | 系统蓝图元数据 |
| | `factory_blueprint_machine_icons` | `FactoryBlueprintMachineIconTable.json` | 蓝图机器图标 |
| 生产/配方 | `factory_miners` | `FactoryMinerTable.json` | 采矿机 |
| | `factory_manual_crafts` | `FactoryManualCraftTable.json` | 手动制作 |
| | `factory_hub_crafts` | `FactoryHubCraftTable.json` | 中枢制作 |
| | `factory_machine_craft_modes` | `FactoryMachineCraftModeTable.json` | 机器制作模式 |
| | `factory_seed_items` | `FactorySeedItemTable.json` | 种子物品 |
| | `factory_ingredient_tags` | `FactoryIngredientTagTable.json` | 原料标签 |
| 电力/燃料 | `factory_fuel_items` | `FactoryFuelItemTable.json` | 燃料物品 |
| | `factory_power_poles` | `FactoryPowerPoleTable.json` | 电网电线杆 |
| | `factory_special_power_poles` | `FactorySpecialPowerPoleTable.json` | 特殊电网电线杆 |
| | `factory_battery_items` | `FactoryBatteryItemTable.json` | 电池物品 |
| 建筑↔物品 | `factory_building_items` | `FactoryBuildingItemTable.json` | 建筑到物品映射 |
| | `factory_building_items_reverse` | `FactoryBuildingItemReverseTable.json` | 物品到建筑映射 |
| 流体/仓储 | `factory_fluid_valves` | `FactoryFluidValveTable.json` | 流体阀门 |
| | `factory_fluid_containers` | `FactoryFluidContainerTable.json` | 流体容器 |
| | `factory_fluid_pump_in` | `FactoryFluidPumpInTable.json` | 流体输入泵 |
| | `factory_fluid_pump_out` | `FactoryFluidPumpOutTable.json` | 流体输出泵 |
| | `factory_storagers` | `FactoryStoragerTable.json` | 仓储设施 |

> **数值优化**: 导入时自动将数值字符串（如 `"100"`、`"3.14"`）转为真实数值类型（`int64`/`float64`），无需前端额外处理。

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "table_name": "factory_buildings",
    "inserted": 10,
    "updated": 55,
    "total": 65,
    "version": "1.0.0"
  }
}
```

> **自动匹配**: 同步 `factory_buildings` 后自动按中文名匹配 `wiki_facilities`，更新 `game_template_id` 和 `power_consumption`，替代原来的人工维护功耗流程。

### 查询游戏数据

```http
GET /api/admin/game-data?table_name=factory_buildings&name_cn=精炼炉
X-Admin-Secret: your-admin-secret
```

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| table_name | string | 是 | 表名 |
| game_id | string | 否 | 精确匹配游戏内部 ID |
| name_cn | string | 否 | 中文名模糊搜索 |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "table_name": "factory_buildings",
    "count": 1,
    "items": [
      {
        "id": "65f1a2b3...",
        "table_name": "factory_buildings",
        "game_id": "furnance_1",
        "name_cn": "精炼炉",
        "name_en": "Refining Unit",
        "data": { ... },
        "sync_version": "1.0.0",
        "created_at": "2026-02-16T15:00:00Z",
        "updated_at": "2026-02-16T15:00:00Z"
      }
    ]
  }
}
```

### 获取已同步表名列表

```http
GET /api/admin/game-data/tables
X-Admin-Secret: your-admin-secret
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "tables": [
      {
        "table_name": "factory_buildings",
        "count": 65,
        "sync_version": "1.0.0",
        "updated_at": "2026-02-16T15:00:00Z"
      },
      {
        "table_name": "items",
        "count": 1200,
        "sync_version": "1.0.0",
        "updated_at": "2026-02-16T15:00:00Z"
      }
    ]
  }
}
```

---

## 蓝图库 API

> **功能**: 玩家蓝图分享社区，支持发布、浏览、点赞、收藏、评论
> **公开读接口认证**: 需要 API Key / Web JWT / Anonymous Token 三选一
> **写接口认证**: 需要 Web JWT 登录
> **图片存储**: S3/OSS 对象存储（需配置 `config/storage.yaml`）

### 获取蓝图元数据

获取基地选项、输入原料、服务器区域等枚举数据，供前端表单使用。

```http
GET /api/blueprints/meta
Authorization: Bearer <jwt> 或 X-API-Key 或 X-Anonymous-Token
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "input_materials": ["源矿", "紫晶矿", "清水", "蓝铁矿"],
    "base_options": [
      { "region": "通用", "locations": [] },
      { "region": "四号谷地", "locations": ["四号谷地主基地", "难民暂居处", "基建前站", "重建指挥部"] },
      { "region": "武陵", "locations": ["武陵城主基地", "天王坪"] }
    ],
    "server_regions": ["cn", "global"],
    "statuses": ["draft", "published", "archived"],
    "sort_fields": ["created_at", "-created_at", "updated_at", "-updated_at", "likes_count", "-likes_count", "views_count", "-views_count", "copies_count", "-copies_count", "favorites_count", "-favorites_count"]
  }
}
```

### 蓝图自动填充

从蓝图解析数据中自动提取设备、产出物、原材料、功耗等信息，用于预填充蓝图上传表单。

> **前置条件**: 蓝图码需要先被解析（通过 `GET /api/blueprint/get?code=xxx` 触发获取并缓存），且需要先同步游戏解包数据（通过 `/api/admin/game-data/sync`）。
>
> **推荐调用流程**: 前端应先调用 `GET /api/blueprint/get?code=xxx` 确保解析数据已缓存，然后再调用本接口进行自动填充。

```http
POST /api/blueprints/autofill
Authorization: Bearer <jwt> 或 X-API-Key 或 X-Anonymous-Token
Content-Type: application/json

{
  "code": "EF01A67ua9OI6E119ieO"
}
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 蓝图码 |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "required_facilities": [
      {
        "game_id": "furnance_1",
        "name": "精炼炉",
        "item_id": "53",
        "icon_url": "https://bbs.hycdn.cn/image/...",
        "quantity": 4
      },
      {
        "game_id": "grid_belt_01",
        "name": "传送带",
        "item_id": "",
        "quantity": 28
      }
    ],
    "output_items": [
      {
        "game_id": "item_iron_nugget",
        "name": "蓝铁块",
        "item_id": "194",
        "icon_url": "https://bbs.hycdn.cn/image/...",
        "quantity": 1
      }
    ],
    "input_materials": [
      {
        "game_id": "item_xiranite_powder",
        "name": "紫晶粉",
        "item_id": "205",
        "icon_url": "https://bbs.hycdn.cn/image/...",
        "quantity": 1
      }
    ],
    "power_requirement": 20,
    "width": 34,
    "height": 24,
    "blueprint_name": "武陵毕业2号图",
    "blueprint_desc": "超库存运输25蓝铁版",
    "unmapped": {
      "templates": [],
      "items": []
    }
  }
}
```

**字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| required_facilities | array | 所需设备列表（含物流设备），每项包含 game_id/name/item_id/icon_url/quantity |
| output_items | array | 最终产出物品（生产机器产出且不被蓝图内其他配方消耗，排除中间产物和 log_conditioner）；同一物品会按 `item_id/name` 合并并累加 `quantity` |
| input_materials | array | 外部输入原材料（被配方消耗但不由蓝图内生产机器产出 + log_conditioner 的外部输入）；同一物品会按 `item_id/name` 合并并累加 `quantity` |
| power_requirement | int | 总功耗（W），累加 needPower=true 设备的 powerConsume × 数量 |
| width | int | 蓝图宽度（`bpSize.xLen`） |
| height | int | 蓝图高度（`bpSize.zLen`） |
| blueprint_name | string | 蓝图原始名称 |
| blueprint_desc | string | 蓝图原始描述 |
| unmapped.templates | array | 无法在游戏数据中找到的 templateId 列表 |
| unmapped.items | array | 无法在游戏数据中找到的物品 ID 列表 |

**提取逻辑**：
- **设备**: 遍历 `nodes[].templateId` 统计数量 → 查 `game_data` 获取中文名 → 匹配 `wiki_facilities` 获取 item_id
- **最终产物**: 生产机器的 `productIcon`（排除 `log_conditioner` 物品准入口）→ 通过 `game_data(factory_recipes)` 匹配配方 → 排除被其他配方消耗的中间产物
- **原材料**: 配方匹配（`machineId` + `outcome`）收集所有 ingredients → 排除蓝图内生产机器自产的物品 + 补充 `log_conditioner` 的外部输入
- **功耗**: 仅累加 `needPower=true` 的设备，功耗值来自 `powerConsume` × 设备数量

---

### 蓝图列表

```http
GET /api/blueprints
Authorization: Bearer <jwt> 或 X-API-Key 或 X-Anonymous-Token
```

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| output_item | string | 否 | 产出物 item_id（逗号分隔多个） |
| input_material | string | 否 | 输入原料名（逗号分隔，如 `源矿,清水`） |
| base_region | string | 否 | 基地区域（通用/四号谷地/武陵） |
| base_location | string | 否 | 子基地 |
| power_min | int | 否 | 最低功率（W） |
| power_max | int | 否 | 最高功率（W） |
| server_region | string | 否 | 服务器区域（cn/global） |
| facility | string | 否 | 设备 item_id（逗号分隔） |
| creator_id | string | 否 | 创作者用户 ID |
| keyword | string | 否 | 标题/描述关键词搜索 |
| sort | string | 否 | 排序字段，默认 `-created_at`。支持：`created_at`, `-created_at`, `updated_at`, `-updated_at`, `likes_count`, `-likes_count`, `views_count`, `-views_count`, `copies_count`, `-copies_count`, `favorites_count`, `-favorites_count` |
| page | int | 否 | 页码，默认 1 |
| page_size | int | 否 | 每页数量，默认 20，最大 50 |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "blueprints": [
      {
        "id": "...",
        "creator_id": "...",
        "creator_nickname": "玩家A",
        "creator_avatar": "https://...",
        "title": "高效铁制零件产线",
        "description": "适用于四号谷地主基地的铁制零件自动化产线...",
        "code": "ABC123",
        "cover_image": "https://cdn.example.com/blueprints/2026/02/xxx.jpg",
        "output_items": [{ "item_id": "541", "name": "钢制零件", "amount": 2, "icon_url": "https://bbs.hycdn.cn/image/..." }],
        "input_materials": ["源矿"],
        "power_requirement": 1200,
        "base_region": "四号谷地",
        "base_location": "四号谷地主基地",
        "server_region": "cn",
        "is_original": true,
        "views_count": 156,
        "likes_count": 42,
        "favorites_count": 18,
        "copies_count": 89,
        "comments_count": 7,
        "created_at": "2026-02-07T10:00:00Z",
        "is_liked": false,
        "is_favorited": false
      }
    ],
    "total": 128,
    "page": 1,
    "page_size": 20
  }
}
```

> `is_liked` 和 `is_favorited` 仅在 Web JWT 登录时返回。

### 蓝图推荐

> 根据产出物 item_id 列表推荐匹配蓝图。优先推荐所有产出物均在目标列表中的蓝图（完全匹配），其次推荐部分匹配的蓝图。

```http
POST /api/blueprints/recommend
Authorization: Bearer <jwt> 或 X-API-Key 或 X-Anonymous-Token
Content-Type: application/json
```

**请求体**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| item_ids | string[] | 是 | 产出物 item_id 列表，最多 50 个 |
| server_region | string | 否 | 服务器区域筛选（cn/global） |
| base_region | string | 否 | 基地区域筛选（通用/四号谷地/武陵） |
| page | int | 否 | 页码，默认 1 |
| page_size | int | 否 | 每页数量，默认 20，最大 50 |

**排序逻辑**：
1. `is_full_match DESC` — 蓝图所有产出物均在请求列表中的优先
2. `match_count DESC` — 匹配产出物数量多的优先
3. `likes_count DESC` — 点赞数多的优先

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "blueprints": [
      {
        "id": "...",
        "title": "高效铁制零件产线",
        "cover_image": "https://cdn.example.com/blueprints/2026/02/xxx.jpg",
        "output_items": [{ "item_id": "541", "name": "钢制零件", "amount": 2, "icon_url": "https://..." }],
        "match_count": 2,
        "is_full_match": true,
        "creator_nickname": "玩家A",
        "likes_count": 42,
        "views_count": 156,
        "is_liked": false,
        "is_favorited": false
      }
    ],
    "total": 15,
    "page": 1,
    "page_size": 20
  }
}
```

**响应字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| match_count | int | 蓝图产出物中匹配请求 item_ids 的数量 |
| is_full_match | bool | 蓝图所有产出物是否都在请求的 item_ids 列表中 |

> 其他字段与蓝图列表接口一致。`is_liked` 和 `is_favorited` 仅在 Web JWT 登录时返回。

### 蓝图详情

```http
GET /api/blueprints/:id
Authorization: Bearer <jwt> 或 X-API-Key 或 X-Anonymous-Token
```

返回完整蓝图信息（含完整 `description`、`images` 数组、`required_facilities` 等）。每次访问自动记录浏览量（同一 IP 24 小时内不重复计）。

**详情额外字段**（列表接口不返回）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `images` | []string | 所有图片的签名 URL 列表（私有空间 key 自动签名） |
| `required_facilities` | []object | 要求设备（含 `icon_url`） |
| `input_material_icons` | map[string]string | 原料名 → 图标 URL 映射（如 `{"源矿": "https://..."}`) |
| `output_items[].icon_url` | string | 产出物图标 URL（从 `wiki_items` 自动填充） |
| `is_liked` | *bool | 当前用户是否点赞（登录时返回） |
| `is_favorited` | *bool | 当前用户是否收藏（登录时返回） |

> **创作者信息**：`creator_nickname` 和 `creator_avatar` 在蓝图创建/更新时冗余存储到蓝图文档中，避免每次联查。历史数据无冗余字段时自动 fallback 到 WebUser 联查。
> **设备图标**：`required_facilities[].icon_url` 在蓝图创建/更新时从 `wiki_facilities` 自动填充。详情查看时也会补充缺失的图标（兼容旧数据）。
> **图片签名**：蓝图 `images` 和 `cover_image` 字段存储的是 object key，返回时自动签名为临时访问 URL。

> **审核状态（`review_status`）说明**：
> - `pending`：已提交，等待 AI 审核中
> - `manual_pending`：AI 审核调用失败，转人工审核队列
> - `approved`：审核通过
> - `rejected`：审核拒绝
>
> **内容存储策略**：审核拒绝时后端不改写数据库原文；仅在对外响应层按策略脱敏展示。

### 发布蓝图

```http
POST /api/blueprints
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "title": "高效铁制零件产线",
  "description": "适用于四号谷地...",
  "code": "ABC123DEF456",
  "images": ["https://cdn.example.com/xxx.jpg"],
  "cover_image": "https://cdn.example.com/xxx.jpg",
  "output_items": [
    { "item_id": "541", "name": "钢制零件", "amount": 2 }
  ],
  "input_materials": ["源矿"],
  "power_requirement": 1200,
  "width": 6,
  "height": 4,
  "base_region": "四号谷地",
  "base_location": "四号谷地主基地",
  "required_facilities": [
    { "item_id": "177", "name": "封装机", "quantity": 2, "icon_url": "https://bbs.hycdn.cn/image/..." }
  ],
  "server_region": "cn",
  "is_original": true,
  "status": "published"
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| title | string | 是 | 标题（2-100 字） |
| description | string | 否 | 描述（最多 5000 字） |
| code | string | 是 | 蓝图码（仅字母+数字，最多 2000 字符） |
| images | []string | 否 | 图片 URL 列表（最多 9 张，先通过上传接口获取） |
| cover_image | string | 否 | 封面图 URL（不填则用第一张图片） |
| output_items | []object | 否 | 产出物（`item_id` 引用 `wiki_items`） |
| input_materials | []string | 否 | 输入原料（枚举：源矿/紫晶矿/清水/蓝铁矿） |
| power_requirement | int | 否 | 功率要求（瓦特） |
| width | int | 否 | 蓝图宽度（可选） |
| height | int | 否 | 蓝图高度（可选） |
| base_region | string | 是 | 基地区域（通用/四号谷地/武陵） |
| base_location | string | 否 | 子基地（可选，留空表示该区域通用） |
| required_facilities | []object | 否 | 要求设备（`item_id` 引用 `wiki_facilities`），后端自动填充 `icon_url` |
| server_region | string | 是 | 服务器区域（cn/global） |
| is_original | bool | 否 | 是否原创，默认 false |
| original_author | string | 否 | 非原创时填写原作者 |
| original_source | string | 否 | 非原创时填写来源链接 |
| status | string | 否 | 状态（draft/published），默认 draft |

### 编辑蓝图

```http
PUT /api/blueprints/:id
Authorization: Bearer <jwt>
Content-Type: application/json
```

仅创建者可编辑。请求体同创建，但所有字段可选（只传需要更新的字段）。

### 删除蓝图

```http
DELETE /api/blueprints/:id
Authorization: Bearer <jwt>
```

仅创建者可删除。删除后自动异步清理关联的点赞、评论、收藏、浏览、复制记录。

### 触发蓝图复审

```http
POST /api/blueprints/:id/review
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "cap_token": "optional-cap-token"
}
```

用于手动重试蓝图文字审核（例如 `manual_pending` 或 `rejected` 状态）。

**行为规则**：
- `pending`：禁止重复提审（返回错误）
- `manual_pending`：允许提审
- `rejected`：允许提审
- 其他状态：拒绝提审
- 启用 Cap 时需提供有效 `cap_token`（API 代理用户可跳过）
- 后端使用 Redis 锁防重复提交：`blueprint:review:retry:lock:{blueprint_id}`

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "已触发复审",
    "review_status": "pending"
  }
}
```

### 上传蓝图图片

```http
POST /api/blueprints/upload/image
Authorization: Bearer <jwt>
Content-Type: multipart/form-data

file: (图片文件)
```

**限制**：
- 最大 10MB
- 仅支持 jpg/png/webp（通过文件魔数严格校验真实类型，不信任 Content-Type）
- 返回 S3/OSS 的 object key 和签名临时 URL

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "key": "blueprints/2026/02/abc-def-123.jpg",
    "url": "https://cdn.example.com/blueprints/2026/02/abc-def-123.jpg?token=xxx&e=1707300000"
  }
}
```

> **图片存储模式**：图片存储在私有空间，`key` 是对象存储中的 key，`url` 是带签名的临时访问 URL（有效期由存储配置决定）。前端创建/编辑蓝图时提交 `key` 或签名 URL 均可（后端会自动提取 key 存储）。展示时后端自动将 key 签名为临时 URL 返回。

### 获取图片签名 URL

为私有空间的图片 key 生成带签名的临时访问 URL。

```http
GET /api/blueprints/image/sign?key=blueprints/2026/02/abc-def-123.jpg
Authorization: Bearer <jwt> 或 X-API-Key 或 X-Anonymous-Token
```

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key | string | 是 | 图片的 object key（上传接口返回的 `key` 字段） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "url": "https://cdn.example.com/blueprints/2026/02/abc-def-123.jpg?token=xxx&e=1707300000"
  }
}
```

### 点赞/取消点赞

```http
POST /api/blueprints/:id/like
Authorization: Bearer <jwt>
```

Toggle 操作：已点赞则取消，未点赞则点赞。

**响应示例**：
```json
{ "code": 0, "message": "成功", "data": { "liked": true } }
```

### 记录复制

```http
POST /api/blueprints/:id/copy
Authorization: Bearer <jwt>
```

记录蓝图码复制事件。同一用户/IP 对同一蓝图每小时只计一次。

### 收藏到收藏夹

```http
POST /api/blueprints/:id/favorite
Authorization: Bearer <jwt>
Content-Type: application/json

{ "collection_id": "收藏夹ID" }
```

### 取消收藏

```http
DELETE /api/blueprints/:id/favorite?collection_id=xxx
Authorization: Bearer <jwt>
```

### 发表评论

```http
POST /api/blueprints/:id/comments
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "content": "这个蓝图效率很高！",
  "parent_id": "回复的评论ID（可选）",
  "quoted_blueprint_id": "引用的蓝图ID（可选）"
}
```

**字段说明**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| content | string | 是 | 评论内容（1-1000 字） |
| parent_id | string | 否 | 回复的评论 ID |
| quoted_blueprint_id | string | 否 | 引用的蓝图 ID（评论中引用其他蓝图） |

### 获取评论列表

```http
GET /api/blueprints/:id/comments?page=1&page_size=20
Authorization: Bearer <jwt> 或 X-API-Key 或 X-Anonymous-Token
```

支持两种查询模式：

- **顶层评论**（默认）：不传 `parent_id`，返回顶层评论（`parent_id` 为空），每条评论包含 `reply_count`（回复数）、`user_nickname`、`user_avatar`，以及引用蓝图的 `quoted_blueprint_title`。按创建时间倒序。
- **回复列表**：传 `parent_id=<评论ID>`，返回该评论的所有回复。按创建时间正序。

**查询参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| parent_id | string | 否 | 父评论 ID，传则返回该评论的回复列表 |
| page | int | 否 | 页码，默认 1 |
| page_size | int | 否 | 每页数量，默认 20，最大 50 |

### 编辑评论

```http
PUT /api/blueprints/comments/:comment_id
Authorization: Bearer <jwt>
Content-Type: application/json

{ "content": "修改后的评论内容" }
```

仅评论作者可编辑。编辑后 `is_edited` 字段标记为 `true`。

### 删除评论

```http
DELETE /api/blueprints/comments/:comment_id
Authorization: Bearer <jwt>
```

仅评论作者可删除。采用软删除（`status` 标记为 `deleted`），同时将蓝图的 `comments_count` 减 1。

### 收藏夹管理

```http
# 我的收藏夹列表（自动确保默认收藏夹存在）
GET /api/blueprints/my/collections
Authorization: Bearer <jwt>

# 创建收藏夹
POST /api/blueprints/my/collections
Authorization: Bearer <jwt>
Content-Type: application/json
{ "title": "高效产线", "description": "收集高效产线蓝图", "is_public": true }

# 编辑收藏夹（支持修改 title/description/is_public）
PUT /api/blueprints/my/collections/:id
Authorization: Bearer <jwt>

# 删除收藏夹（默认收藏夹不可删除）
DELETE /api/blueprints/my/collections/:id
Authorization: Bearer <jwt>
```

每人最多 50 个收藏夹。收藏夹标题 1-50 字，描述最多 500 字。

> **默认收藏夹**：每个用户首次查询收藏夹列表时自动创建一个默认收藏夹（`is_default: true`），默认私有，不可删除。
> **删除行为**：删除收藏夹时，会同时清除该收藏夹下所有收藏关系，并减少相关蓝图的 `favorites_count`。

**收藏夹字段说明**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `is_default` | bool | 是否为默认收藏夹（不可删除） |
| `is_public` | bool | 是否公开（私有收藏夹仅所有者可查看） |
| `views_count` | int | 浏览量 |
| `likes_count` | int | 点赞数 |

### 查看收藏夹详情

```http
GET /api/blueprints/collections/public/:id?page=1&page_size=20
Authorization: Bearer <jwt> 或 X-API-Key 或 X-Anonymous-Token
```

公开收藏夹所有人可查看；私有收藏夹仅所有者（通过 JWT 识别）可查看。每次访问自动记录浏览量（同一 IP 24h 去重）。

**响应额外字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `is_liked` | *bool | 当前用户是否点赞了该收藏夹（登录时返回） |

### 收藏夹点赞/取消点赞

```http
POST /api/blueprints/collections/:id/like
Authorization: Bearer <jwt>
```

Toggle 操作：已点赞则取消，未点赞则点赞。

**响应示例**：
```json
{ "code": 0, "message": "成功", "data": { "liked": true } }
```

### 创作者主页

```http
GET /api/blueprints/creators/:user_id?page=1&page_size=20&sort=-created_at
Authorization: Bearer <jwt> 或 X-API-Key 或 X-Anonymous-Token
```

返回指定用户已发布的蓝图列表，以及创作者基本信息（昵称、头像）。

### 我的蓝图

```http
# 我的蓝图（含草稿，可按状态和审核状态筛选）
GET /api/blueprints/my/list?status=published&review_status=approved&page=1
Authorization: Bearer <jwt>

# 我点赞的蓝图
GET /api/blueprints/my/liked?page=1
Authorization: Bearer <jwt>
```

**`/api/blueprints/my/list` 查询参数**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `page` | `int` | 否 | 页码，默认 1 |
| `page_size` | `int` | 否 | 每页数量，默认 20 |
| `status` | `string` | 否 | 发布状态筛选：`published` / `draft` / `archived` |
| `review_status` | `string` | 否 | 审核状态筛选：`pending` / `manual_pending` / `approved` / `rejected` |

说明：
- `status` 和 `review_status` 可同时使用，会取交集
- 不传则返回所有状态的蓝图
- `review_status` 各值含义：`pending`=AI 审核中、`manual_pending`=待人工审核、`approved`=审核通过、`rejected`=审核不通过

### 蓝图审核状态查询

```http
# 查询单个蓝图的审核状态（轻量接口，适用于前端轮询）
GET /api/blueprints/:id/review-status
Authorization: Bearer <jwt>
```

**响应示例**

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "id": "6647a1b2c3d4e5f6a7b8c9d0",
    "review_status": "approved",
    "review_reason": "",
    "reviewed_at": "2025-05-16T12:30:00Z"
  }
}
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | `string` | 蓝图 ID |
| `review_status` | `string` | 审核状态：`pending` / `manual_pending` / `approved` / `rejected` |
| `review_reason` | `string` | 拒绝原因（仅 `rejected` 时有值） |
| `reviewed_at` | `string?` | 审核完成时间（ISO 8601，审核完成前不返回） |

说明：
- 仅允许查询自己的蓝图
- 相比详情接口 `GET /api/blueprints/:id`，本接口只返回审核相关字段，响应更轻量
- 推荐轮询间隔：3~5 秒，最大轮询时长 2 分钟

### 数据集合

| 集合 | 说明 | TTL |
|------|------|-----|
| `blueprints` | 蓝图主表 | — |
| `blueprint_likes` | 蓝图点赞记录 | — |
| `blueprint_comments` | 评论记录 | — |
| `blueprint_collections` | 收藏夹 | — |
| `blueprint_favorites` | 收藏关联（蓝图 ↔ 收藏夹） | — |
| `blueprint_views` | 浏览记录（蓝图 + 收藏夹共用） | 30 天 |
| `blueprint_copies` | 复制记录 | 90 天 |
| `blueprint_image_audits` | 图片审核记录（独立于蓝图，解决回调时序问题） | — |
| `collection_likes` | 收藏夹点赞记录 | — |

---

## 好友查询 API

> **功能**: 查询玩家公开信息、角色展示面板数据
> **接口认证**: 需要 API Key / Web JWT / Anonymous Token 三选一
> **订阅保护**: 所有接口需通过 `SubscriptionGuardAuto` 订阅验证
> **游戏数据凭证**: `detail`/`char` 接口支持通过 `X-Framework-Token` 请求头自动解析 `role_id`（凭证库 `endfield_login_sessions` 中的 `game_role_id`，首次访问时自动通过平台 uid 搜索获取并保存）
> **数据转发**: `search`/`detail`/`char` 接口返回的 `data` 字段保持外部 Friend API 原始结构（不做字段重组）

### 接口概览

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| GET | `/api/friend/health` | UnifiedAuth + SubscriptionGuard | 服务健康检查 |
| GET | `/api/friend/search` | UnifiedAuth + SubscriptionGuard | 搜索玩家 |
| GET | `/api/friend/detail` | UnifiedAuth + SubscriptionGuard | 查询玩家详情（角色展示列表） |
| GET | `/api/friend/char` | UnifiedAuth + SubscriptionGuard | 查询单个角色面板数据（支持 `char_id` 透传） |

### 搜索玩家

```http
GET /api/friend/search?uid=1320645122
```

或

```http
GET /api/friend/search?keyword=浅巷墨黎
```

**请求参数**（二选一）：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| uid | string | 否 | 按平台 uid 精确搜索 |
| keyword | string | 否 | 按昵称关键词搜索（支持 `名字#短ID` 格式） |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "uid": "1320645122",
    "count": 1,
    "items": [
      {
        "role_id": 1006405431,
        "name": "浅巷墨黎",
        "short_id": "3847",
        "last_login_time": 1770737409,
        "online": false,
        "adventure_level": 49
      }
    ],
    "deleted_role_ids": [],
    "profile_filled_count": 1,
    "total_count": 1,
    "truncated": false,
    "max_results": 1,
    "fast_mode": "uid_platform_role_id_direct",
    "query_mode": "uid_platform_role_id"
  }
}
```

### 查询玩家详情

```http
GET /api/friend/detail?role_id=1006405431
```

或通过 Framework Token 自动解析：

```http
GET /api/friend/detail
X-Framework-Token: <token>
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| role_id | int64 | 否 | 游戏 role_id（不传则自动解析） |

**role_id 自动解析优先级**：
1. 请求参数 `role_id`（直接使用，无需凭证）
2. `X-Framework-Token` → 凭证库会话中的 `game_role_id`（若未缓存，自动通过 `role_id`/平台 uid 调用外部搜索接口获取并**保存到凭证库**）
3. Web JWT 用户绑定 → 绑定库关联的 Framework Token → 凭证库会话（同上自动获取）

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "query": {
      "role_id": 1006405431
    },
    "role_profile": {
      "role_id": 1006405431,
      "name": "浅巷墨黎",
      "short_id": "3847",
      "adventure_level": 49,
      "signature": "",
      "gender": 2,
      "char_data": [
        {
          "template_id": "chr_0004_pelica",
          "template": {
            "id": "chr_0004_pelica",
            "name": "Perlica",
            "name_cn": "佩丽卡"
          },
          "level": 60,
          "potential_level": 4
        }
      ]
    },
    "deleted_role_ids": []
  }
}
```

### 查询角色面板

```http
GET /api/friend/char?role_id=1006405431&template_id=chr_0012_avywen&char_id=chr_0012_avywen
```

或通过 Framework Token 自动解析：

```http
GET /api/friend/char?template_id=chr_0012_avywen
X-Framework-Token: <token>
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| role_id | int64 | 否 | 游戏 role_id（不传则通过 Framework Token 或 JWT 绑定自动获取） |
| template_id | string | **是** | 角色模板 ID（如 `chr_0012_avywen`） |
| char_id | string | 否 | 角色标识参数（透传给外部 Friend API）；不传时默认等于 `template_id` |

**响应示例**（部分字段）：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "query": {
      "role_id": 1006405431,
      "template_id": "chr_0012_avywen"
    },
    "role_id": 1006405431,
    "char_count": 1,
    "available_template_ids": [
      "chr_0012_avywen"
    ],
    "found": true,
    "char": {
      "template_id": "chr_0012_avywen",
      "template": {
        "id": "chr_0012_avywen",
        "name": "Avywenna",
        "name_cn": "艾维文娜"
      },
      "level": 60,
      "potential_level": 5,
      "weapon": { "..." : "..." },
      "equip": [ "..." ]
    }
  }
}
```

> `data` 字段为外部 Friend API 原样透传，字段可能随外部版本扩展；当前常见字段包括 `query`、`role_id`、`char_count`、`available_template_ids`、`found`、`char`。

---

## 角色面板同步 API

> **功能**: 将玩家展示角色面板数据同步到后端，支持离线查看和分享
> **接口认证**: 需要 API Key / Web JWT / Anonymous Token 三选一
> **订阅保护**: 所有接口需通过 `SubscriptionGuardAuto` 订阅验证
> **游戏数据凭证**: 所有接口**必须**提供 `X-Framework-Token` 请求头（从凭证库 `endfield_login_sessions` 解析用户身份，不依赖绑定库，因为不是所有用户都有 Web 账号）
> **限制**: 每用户每分钟最多 2 次同步请求（`/api/panel/sync`）
> **数据一致性**: 同步会将外部 `/friend/detail` 与 `/friend/char` 的原始 `data` 结构落库；后端查询时优先返回原始结构，保证与外部接口字段一致

### 接口概览

| 方法 | 路径 | 认证 | 描述 |
|------|------|------|------|
| POST | `/api/panel/sync` | UnifiedAuth + SubscriptionGuard + Framework Token | 触发全量面板同步 |
| GET | `/api/panel/sync/status` | UnifiedAuth + SubscriptionGuard + Framework Token | 查询同步进度 |
| GET | `/api/panel/chars` | UnifiedAuth + SubscriptionGuard + Framework Token | 获取已同步角色列表（分页） |
| GET | `/api/panel/char/:template_id` | UnifiedAuth + SubscriptionGuard + Framework Token | 获取指定角色完整面板数据 |
| GET | `/api/panel/chars/all` | UnifiedAuth + SubscriptionGuard + Framework Token | 获取所有已同步角色完整数据（分页） |

### 触发面板同步

```http
POST /api/panel/sync
X-API-Key: <api_key>
X-Framework-Token: <token>
```

> 接口认证支持 API Key / Web JWT / Anonymous Token 三选一，`X-Framework-Token` **必须**提供（游戏数据凭证）。

> 同步为异步操作。后端会获取当前用户展示的所有角色面板数据并保存。
> 同一用户同时只允许一个同步任务。

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "message": "同步任务已提交",
    "game_role_id": 1006405431
  }
}
```

### 查询同步进度

```http
GET /api/panel/sync/status
X-API-Key: <api_key>
X-Framework-Token: <token>
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "status": "syncing",
    "total": 4,
    "completed": 2,
    "failed_ids": [],
    "started_at": 1770807369
  }
}
```

**status 枚举**：

| 值 | 说明 |
|------|------|
| `idle` | 没有同步任务 |
| `pending` | 等待执行 |
| `syncing` | 同步中 |
| `completed` | 已完成（可能包含部分角色失败，详见 `failed_ids` 与 `error`） |
| `failed` | 失败 |

### 获取已同步角色列表

```http
GET /api/panel/chars?page=1&page_size=20
X-API-Key: <api_key>
X-Framework-Token: <token>
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认 1 |
| page_size | int | 否 | 每页数量，默认 20，最大 50 |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "synced_chars": [
      {
        "template_id": "chr_0004_pelica",
        "name": "Perlica",
        "name_cn": "佩丽卡",
        "level": 60,
        "rarity": 0,
        "synced_at": "2026-02-11T19:30:00+08:00"
      }
    ],
    "total": 4,
    "page": 1,
    "page_size": 20,
    "role_profile": { "..." : "..." },
    "game_role_id": 1006405431,
    "last_synced_at": "2026-02-11T19:30:00+08:00"
  }
}
```

### 获取指定角色面板

```http
GET /api/panel/char/chr_0012_avywen
X-API-Key: <api_key>
X-Framework-Token: <token>
```

> 返回的 `data` 字段格式与 `GET /api/friend/char` 的 `data` 完全一致。

### 获取所有已同步角色（分页）

```http
GET /api/panel/chars/all?page=1&page_size=20
X-API-Key: <api_key>
X-Framework-Token: <token>
```

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "chars": [
      {
        "template_id": "chr_0012_avywen",
        "synced_at": "2026-02-11T19:30:00+08:00",
        "char_data": { "..." : "..." }
      }
    ],
    "total": 4,
    "page": 1,
    "page_size": 20
  }
}
```

---

## 蓝图数据解析 API

> **功能**: 根据蓝图码查询蓝图的完整解析数据（节点、布局等）
> **认证**: 需要 API Key / Web JWT / Anonymous Token 三选一
> **缓存**: 查询过的蓝图数据会自动缓存，后续请求直接返回
> **蓝图库联动**: 上传蓝图时如果填写了蓝图码，后端会自动解析并缓存数据

### 查询蓝图解析数据

```http
GET /api/blueprint/get?code=EF013Eou4O6EoaiE0579
```

> 兼容旧路径：`GET /api/blueprint/data?code=...`（建议逐步迁移到 `/api/blueprint/get`）。
> 本地接口会在响应顶层新增 `cache` 字段，值由外部蓝图解析服务返回（表示是否命中外部缓存）。

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | **是** | 蓝图码 |

**响应示例**（部分字段）：
```json
{
  "code": 0,
  "message": "成功",
  "cache": true,
  "data": {
    "query": {
      "code": "EF013Eou4O6EoaiE0579"
    },
    "bluePrintData": {
      "name": "6.1智能热能池",
      "desc": "20*电池功率/功率缺口+5个砂粉",
      "xSize": 28,
      "zSize": 8,
      "nodes": [
        {
          "templateId": "log_converger",
          "nodeId": 1,
          "transform": { "...": "..." }
        }
      ]
    }
  }
}
```

> 说明：后端保持 `data` 为外部业务数据透传，同时在顶层增加 `cache` 字段（来自外部 API）。

### 搜索蓝图码

```http
GET /api/blueprint/search?text=热能
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| text | string | **是** | 搜索关键词 |

**响应示例**：
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "query": "热能",
    "data": [
      "EF01U9eaaaa39OOO71a8",
      "EF01o5u22o4956EIieO",
      "EF01o5u88515863iI2eO",
      "EF01U9eA0a4iUOEO7Oa8",
      "EF01A67u3IooaE39ieO",
      "EF01i1UIuiI4a2272U4",
      "EF013Eou4O6EoaiE0579",
      "EF014AE691aae35Ea1A",
      "EF01I43AUieeO9u5o08"
    ]
  }
}
```

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
| 联合池 | `E_CharacterGachaPoolType_Joint` | 辉光庆典（联合寻访，独立卡池） |
| 常驻池 | `E_CharacterGachaPoolType_Standard` | 基础寻访 |
| 新手池 | `E_CharacterGachaPoolType_Beginner` | 启程寻访 |
| 武器池 | `weapon` | 武器寻访 |

> **联合池说明（2026-05 更新）**：`E_CharacterGachaPoolType_Joint`（辉光庆典）是多UP角色的联合寻访池。
> 自 v3.5.0 起，联合池作为**独立卡池类型** `joint_char` 存储和统计，不再归入限定池。
> 联合池与限定池共享角色 seqId 命名空间（`/api/record/char`），但在数据模型、统计计数和全服排名中完全独立。

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
    "joint_char": [...],     // 联合角色池
    "standard_char": [...],  // 常驻角色池
    "beginner_char": [...],  // 新手池
    "weapon": [...]          // 武器池
  },
  "stats": {
    "total_count": 200,
    "limited_char_count": 80,
    "joint_char_count": 20,
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

> 角色选择规则（统一与绑定体系一致）：
> 1. 传 `role_id`（可选配 `server_id`）时，按指定角色查询
> 2. 未传时，使用当前 `framework_token` 对应的 primary 绑定
> 3. 若无 primary，后端会回退到可用绑定

```http
GET /api/endfield/gacha/records?pools=limited,standard&page=1&limit=500
X-Framework-Token: your-framework-token
```

**Query 参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| pools | string | 否 | 全部 | 卡池类型，逗号分隔（`limited`/`joint`/`standard`/`beginner`/`weapon`） |
| page | int | 否 | 1 | 页码，从 1 开始 |
| limit | int | 否 | 500 | 每页数量，最大 500 |
| role_id | string | 否 | - | 指定角色 UID（绑定中的 `role_id`） |
| server_id | string | 否 | - | 指定服务器 ID（建议与 `role_id` 一起传） |

**卡池类型说明**:
| 参数值 | 说明 |
|--------|------|
| `limited` | 限定角色池 |
| `joint` | 联合角色池 |
| `standard` | 常驻角色池 |
| `beginner` | 新手池 |
| `weapon` | 武器池 |

> **武器池结构兼容说明（2026-03）**：
> - 新结构上游返回 `weaponId` / `weaponName` / `weaponType`
> - 本项目继续统一对外返回 `char_id` / `char_name`（兼容既有调用方）
> - 武器记录额外返回 `weapon_type` 字段（有值时表示武器类型）
> - 历史库旧字段（`weapon_id` / `weapon_name` / `charId` / `charName` / `isFree`）会在读取时自动归一化

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
      },
      {
        "char_id": "wpn_pistol_0011",
        "char_name": "落草",
        "weapon_type": "E_WeaponType_Pistol",
        "rarity": 6,
        "gacha_ts": "1773396496670",
        "pool_id": "weponbox_1_1_1",
        "pool_name": "新芽申领",
        "is_new": true,
        "is_free": false,
        "seq_id": "206"
      }
    ],
    "total": 200,
    "page": 1,
    "limit": 500,
    "pages": 1,
    "pools": ["limited_char", "joint_char", "standard_char", "beginner_char", "weapon"],
    "stats": {
      "total_count": 200,
      "limited_char_count": 80,
      "joint_char_count": 20,
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
      "role_id": "1320645122",
      "server_id": "1",
      "server_name": "China",
      "skland_uid": "205594538",
      "channel_name": "官服",
      "is_official": true,
      "framework_token": "uuid-xxx",
      "last_fetch": "2026-01-30T12:00:00Z"
    }
  }
}
```

**筛选特定卡池示例**:
```http
GET /api/endfield/gacha/records?pools=limited,joint,weapon&page=1&limit=100
```

**分页说明**:
- `total`: 符合筛选条件的总记录数
- `page`: 当前页码
- `limit`: 每页数量
- `pages`: 总页数
- 记录按 `seq_id` 降序排列，即最新抽取的记录在最前面

**records[] 字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| `char_id` | string | 统一物品ID（角色池为角色ID，武器池为武器ID） |
| `char_name` | string | 统一物品名称（角色池为角色名，武器池为武器名） |
| `weapon_type` | string | 武器类型（仅武器池有值，如 `E_WeaponType_Pistol`） |
| `rarity` | int | 稀有度 |
| `gacha_ts` | string | 抽卡时间戳 |
| `pool_id` | string | 卡池ID |
| `pool_name` | string | 卡池名称 |
| `is_new` | bool | 是否首次获得 |
| `is_free` | bool | 是否免费抽 |
| `seq_id` | string | 记录序列ID（用于时间排序/去重） |

> 兼容约定：上游武器池新结构中的 `weaponId` / `weaponName` 会映射为 `char_id` / `char_name` 返回，保证历史调用方无需改动。

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

> 角色选择规则（与 records/stats 一致）：
> 1. 传 `role_id`（可选配 `server_id`）时，按指定角色同步
> 2. 未传时，使用当前 `framework_token` 对应的 primary 绑定
> 3. 若无 primary，后端会回退到可用绑定
> 4. `account_uid` 为历史兼容参数，建议不再使用

```http
POST /api/endfield/gacha/fetch
X-Framework-Token: your-framework-token
Content-Type: application/json

{
  "role_id": "1320645122",
  "server_id": "1"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| role_id | string | 否 | 指定角色 UID（绑定中的 `role_id`） |
| server_id | string | 否 | 指定服务器 ID（建议与 `role_id` 一起传） |
| account_uid | string | 否 | 旧版账号 UID，兼容保留，不建议新接入使用 |

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
// 1. 启动同步（未指定 role_id 时，后端使用 primary）
await fetch('/api/endfield/gacha/fetch', {
  method: 'POST',
  headers: {
    'X-Framework-Token': token,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    role_id: selectedRoleId,    // 可选
    server_id: selectedServerId // 可选
  })
})

// 2. 轮询进度（建议带上相同 role_id/server_id 查询对应账号状态）
const statusQuery = new URLSearchParams({
  role_id: selectedRoleId,
  server_id: selectedServerId
}).toString()

const pollStatus = async () => {
  const res = await fetch(`/api/endfield/gacha/sync/status?${statusQuery}`, {
    headers: { 'X-Framework-Token': token }
  })
  const { data } = await res.json()

  updateProgressBar(data.progress, data.message)

  if (data.status === 'completed') {
    showSuccess(`同步完成，共 ${data.records_found} 条记录`)
  } else if (data.status === 'failed') {
    showError(data.error)
  } else {
    setTimeout(pollStatus, 1000)
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

正在同步中（同一角色）:
```json
{
  "code": 409,
  "message": "该角色正在同步中，请稍后再试"
}
```

### 获取抽卡统计

获取抽卡数据的详细统计信息。

> 角色选择规则与 `GET /api/endfield/gacha/records` 一致：
> - 传 `role_id`（可选配 `server_id`）按指定角色统计
> - 未传则使用当前 `framework_token` 的 primary 绑定

```http
GET /api/endfield/gacha/stats
X-Framework-Token: your-framework-token
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| role_id | string | 否 | 指定角色 UID（绑定中的 `role_id`） |
| server_id | string | 否 | 指定服务器 ID（建议与 `role_id` 一起传） |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "stats": {
      "total_count": 200,
      "limited_char_count": 80,
      "joint_char_count": 20,
      "standard_char_count": 60,
      "beginner_char_count": 20,
      "weapon_count": 20,
      "star6_count": 5,
      "star5_count": 20,
      "star4_count": 175
    },
    "pool_stats": {
      "limited_char": {"total": 80, "star6": 2, "star5": 8},
      "joint_char": {"total": 20, "star6": 1, "star5": 2},
      "standard_char": {"total": 60, "star6": 1, "star5": 5},
      "beginner_char": {"total": 20, "star6": 1, "star5": 2},
      "weapon": {"total": 20, "star6": 0, "star5": 3}
    },
    "last_fetch": "2026-01-30T12:00:00Z",
    "has_records": true,
    "user_info": {
      "nickname": "玩家昵称",
      "game_uid": "1320645122",
      "role_id": "1320645122",
      "server_id": "1",
      "server_name": "China",
      "channel_name": "官服"
    }
  }
}
```

### 获取同步状态

查询抽卡记录同步的实时状态，用于前端显示进度。

> 支持多账号（多角色）独立状态：状态键按 `framework_token + role_id + server_id` 隔离。
> - 传 `role_id`（可选配 `server_id`）时，查询指定角色状态
> - 不传时，后端按绑定库解析（primary -> 任意有效绑定）后返回对应角色状态

```http
GET /api/endfield/gacha/sync/status
GET /api/endfield/gacha/sync/status?role_id=1320645122&server_id=1
X-Framework-Token: your-framework-token
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| role_id | string | 否 | 指定角色 UID（绑定中的 `role_id`） |
| server_id | string | 否 | 指定服务器 ID（建议与 `role_id` 一起传） |

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
    "error": "",
    "role_id": "1320645122",
    "server_id": "1"
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
    "new_records": 50,
    "elapsed_seconds": 35.2,
    "role_id": "1320645122",
    "server_id": "1"
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
    "progress": 0,
    "role_id": "1320645122",
    "server_id": "1"
  }
}
```

### 获取同步状态列表（多角色总览）

一次返回当前 `framework_token` 下所有角色最近同步任务状态，适合前端做全局同步面板（无需停留在寻访页）。

```http
GET /api/endfield/gacha/sync/status/all
X-Framework-Token: your-framework-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "framework_token": "6d506c5d-723a-4712-a5c4-58950c3dfb22",
    "count": 2,
    "syncing_count": 1,
    "items": [
      {
        "status": "syncing",
        "stage": "records",
        "progress": 47,
        "message": "正在获取 限定角色池...",
        "current_pool": "限定角色池",
        "total_pools": 4,
        "completed_pools": 1,
        "records_found": 63,
        "new_records": 0,
        "started_at": "2026-03-04T12:00:00Z",
        "updated_at": "2026-03-04T12:00:12Z",
        "elapsed_seconds": 12.3,
        "error": "",
        "framework_token": "6d506c5d-723a-4712-a5c4-58950c3dfb22",
        "role_id": "1320645122",
        "server_id": "1",
        "nickname": "浅巷墨黎",
        "server_name": "China",
        "channel_name": "官服",
        "is_primary": true
      },
      {
        "status": "completed",
        "stage": "saving",
        "progress": 100,
        "message": "同步完成，共 188 条记录，新增 0 条",
        "total_pools": 4,
        "completed_pools": 4,
        "records_found": 188,
        "new_records": 0,
        "started_at": "2026-03-04T11:40:00Z",
        "updated_at": "2026-03-04T11:40:31Z",
        "elapsed_seconds": 31.0,
        "framework_token": "6d506c5d-723a-4712-a5c4-58950c3dfb22",
        "role_id": "1028880050",
        "server_id": "1",
        "nickname": "清影",
        "server_name": "China",
        "channel_name": "bilibili服",
        "is_primary": false
      }
    ]
  }
}
```

### 全服统计（公开接口）

获取全服抽卡统计数据，用于展示全服玩家的抽卡情况。支持按平台（国服/国际服）和按限定池、联合池或武器池分期过滤。

> **注意**：此接口为公开接口，不需要认证。数据会缓存 5 分钟（不同 provider + 分期参数组合独立缓存）。

```http
GET /api/endfield/gacha/global-stats
GET /api/endfield/gacha/global-stats?provider=skland
GET /api/endfield/gacha/global-stats?provider=skport
GET /api/endfield/gacha/global-stats?pool_period=熔火灼痕
GET /api/endfield/gacha/global-stats?weapon_pool_period=讯行申领
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| provider | string | 否 | 平台过滤：`skland`（国服）/`skport`（国际服）；不传为全量（国服+国际服） |
| pool_period | string | 否 | 限定/联合池分期过滤（传入卡池名称），只统计该期限定池或联合池的数据 |
| weapon_pool_period | string | 否 | 武器池分期过滤（传入卡池名称），只统计该期武器池的数据 |
| refresh | string | 否 | 传 `true` 强制刷新缓存 |

**分期过滤行为**：
- 当传入 `pool_period` 时：
  - `by_type.limited` 只包含匹配 `pool_name` 的限定池记录
  - `by_type.joint` 只包含匹配 `pool_name` 的联合池记录
  - `ranking.limited` 和 `ranking.joint` 只包含该期的数据
  - `current_pool` 返回该期卡池的 UP 角色信息
  - 其他卡池类型（常驻/新手/武器）不受影响
- 当传入 `weapon_pool_period` 时：
  - `by_type.weapon` 只包含匹配 `pool_name` 的武器池记录
  - `ranking.weapon` 只包含该期的数据
  - 限定/常驻/新手池不受影响
- `pool_periods`、`joint_pool_periods` 与 `weapon_pool_periods` 始终返回所有期数的汇总（不受 filter 影响）

**平台分组行为**：
- `provider=skland`：仅统计国服数据；`by_channel` 返回官服/B服分组，`by_region` 为空
- `provider=skport`：仅统计国际服数据；`by_region` 返回区域分组，`by_channel` 为全 0（不参与国际服分组）
- 不传 `provider`：统计国服+国际服总和

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "cached": false,
    "provider": "all",
    "last_update": "2026-02-07T15:00:00Z",
    "stats": {
      "total_pulls": 125000,
      "total_users": 500,
      "operator_total_pulls": 98000,
      "operator_star6_total": 1050,
      "operator_avg_pity": 93.3,
      "weapon_total_pulls": 27000,
      "weapon_star6_total": 200,
      "weapon_avg_pity": 135.0,
      "star6_total": 1250,
      "star5_total": 12500,
      "star4_total": 111250,
      "avg_pity": 100.0,
      "limited_up_avg_pity": 200.0,
      "current_pool": {
        "pool_name": "熔火灼痕",
        "up_char_names": ["莱万汀"],
        "up_char_name": "莱万汀",
        "up_char_id": "0b199a0eaae5a9b37a5d3c990b6c8bca"
      },
      "pool_periods": [
        {
          "pool_name": "熔火灼痕",
          "up_char_names": ["莱万汀"],
          "total_pulls": 50000,
          "star6_count": 500,
          "up_count": 250,
          "up_avg_pity": 200.0,
          "star6_avg_pity": 100.0
        },
        {
          "pool_name": "轻飘飘的信使",
          "up_char_names": ["洁尔佩塔"],
          "total_pulls": 30000,
          "star6_count": 300,
          "up_count": 150,
          "up_avg_pity": 200.0,
          "star6_avg_pity": 100.0
        }
      ],
      "joint_pool_periods": [
        {
          "pool_name": "辉光庆典",
          "up_char_names": ["莱万汀", "洁尔佩塔", "伊薛", "芥蔚"],
          "total_pulls": 20000,
          "star6_count": 200,
          "up_count": 100,
          "up_avg_pity": 200.0,
          "star6_avg_pity": 100.0
        }
      ],
      "weapon_pool_periods": [
        {
          "pool_name": "讯行申领",
          "up_weapon_names": ["使命必达"],
          "total_pulls": 18000,
          "star6_count": 120,
          "up_count": 30,
          "up_avg_pity": 600.0,
          "star6_avg_pity": 150.0
        },
        {
          "pool_name": "熔铸申领",
          "up_weapon_names": ["熔铸火焰"],
          "total_pulls": 9000,
          "star6_count": 80,
          "up_count": 20,
          "up_avg_pity": 450.0,
          "star6_avg_pity": 112.5
        }
      ],
        "limited": {
          "total": 50000,
          "star6": 500,
          "star6_limited": 250,
          "star6_standard": 250,
          "star5": 5000,
          "star4": 44500,
          "avg_pity": 62.3,
          "up_avg_pity": 200.0,
          "distribution": [
            {"range": "1-10", "count": 50},
            {"range": "11-20", "count": 45},
            {"range": "61-70", "count": 80},
            {"range": "71-80", "count": 150}
          ]
        },
        "joint": { "...same structure as limited..." },
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
          "avg_pity": 62.8,
          "operator_total_pulls": 39000,
          "operator_star6_total": 410,
          "operator_avg_pity": 95.1,
          "weapon_total_pulls": 11000,
          "weapon_star6_total": 90,
          "weapon_avg_pity": 122.2
        },
        "bilibili": { "...": "..." }
      },
      "by_provider": {
        "skland": {
          "total_users": 320,
          "total_pulls": 86000,
          "star6_total": 880,
          "star5_total": 8600,
          "star4_total": 76520,
          "avg_pity": 97.7,
          "operator_total_pulls": 72000,
          "operator_star6_total": 760,
          "operator_avg_pity": 94.7,
          "weapon_total_pulls": 14000,
          "weapon_star6_total": 120,
          "weapon_avg_pity": 116.6
        },
        "skport": { "...": "..." }
      },
      "by_region": {
        "en-us": {
          "total_users": 80,
          "total_pulls": 24000,
          "star6_total": 210,
          "star5_total": 2600,
          "star4_total": 21190,
          "avg_pity": 114.2,
          "operator_total_pulls": 16000,
          "operator_star6_total": 140,
          "operator_avg_pity": 114.2,
          "weapon_total_pulls": 8000,
          "weapon_star6_total": 70,
          "weapon_avg_pity": 114.2
        },
        "jp-jp": { "...": "..." }
      },
      "ranking": {
        "limited": {
          "six_star": [
            {"char_id": "abc", "char_name": "莱万汀", "count": 120, "percent": 24.0},
            {"char_id": "def", "char_name": "伊冯", "count": 100, "percent": 20.0}
          ],
          "five_star": [...]
        },
        "joint": {
          "six_star": [
            {"char_id": "ghi", "char_name": "莱万汀", "count": 50, "percent": 25.0},
            {"char_id": "jkl", "char_name": "洁尔佩塔", "count": 45, "percent": 22.5}
          ],
          "five_star": [...]
        },
        "standard": { "...": "..." },
        "weapon": { "...": "..." }
      }
    }
  }
}
```

**统计字段说明**:
| 字段 | 说明 |
|------|------|
| `provider` | 当前统计口径：`all`/`skland`/`skport` |
| `total_pulls` | 全服总抽数（**不含免费抽卡**） |
| `total_users` | 已同步记录的用户数 |
| `operator_total_pulls` | 全服干员池总抽数（限定+常驻+新手，不含免费） |
| `operator_star6_total` | 全服干员池6星总数 |
| `operator_avg_pity` | 全服干员池平均6星出货（干员池抽数/干员池6星） |
| `weapon_total_pulls` | 全服武器池总抽数（不含免费） |
| `weapon_star6_total` | 全服武器池6星总数 |
| `weapon_avg_pity` | 全服武器池平均6星出货（武器池抽数/武器池6星） |
| `star6_total` | 6星总数（不含免费抽卡获得的） |
| `avg_pity` | 全服平均6星出货（全池抽数/全池6星） |
| `limited_up_avg_pity` | 限定角色池平均UP出货（限定池抽数/限定UP数） |
| `current_pool` | 当前/选中卡池 UP 信息 |
| `pool_periods` | 限定池分期列表（各期抽数、6星数、UP出货数、平均UP出货） |
| `joint_pool_periods` | 联合池分期列表（各期抽数、6星数、UP出货数、平均UP出货），结构与 `pool_periods` 相同 |
| `weapon_pool_periods` | 武器池分期列表（各期抽数、6星数、UP出货数、平均UP出货） |
| `by_type` | 按卡池类型分类的统计 |
| `by_channel` | 按渠道统计（兼容历史口径：仅统计国服 `skland` 的官服/B服） |
| `by_provider` | 按平台统计（`skland`=国服，`skport`=国际服） |
| `by_region` | 国际服按区域统计（仅统计 `skport` 数据；优先使用 region 字段，缺失时按 `server_name` 归类为 `Asia` / `Americas / Europe`，仍无法识别时为 `unknown`） |
| `ranking` | 出货排名（各角色/武器获取数量排名） |

> **统计口径说明**：所有统计数据均**完全排除免费抽卡**（`is_free=true`），包括抽数统计、稀有度统计、出货分布和平均出货。这样可以准确反映玩家实际消耗资源的出货情况。

**当前卡池信息**:
| 字段 | 说明 |
|------|------|
| `pool_name` | 卡池名称 |
| `up_char_names` | UP角色名列表（支持多UP） |
| `up_char_name` | UP角色名称（向后兼容，取第一个） |
| `up_char_id` | UP角色ID（向后兼容） |

> **UP 角色判定**：每条限定池/联合池抽卡记录根据其 `pool_name` 匹配 `wiki_char_pools` 中对应卡池的 UP 角色列表。优先使用 `dot_type=label_type_up` 标记，若无标记则降级使用 `rarity=rarity_6` 推断（适用于多UP庆典池），确保不同期数的 UP 角色正确分类。

**分期统计 (`pool_periods`)**:
| 字段 | 说明 |
|------|------|
| `pool_name` | 卡池名称 |
| `up_char_names` | 该期 UP 角色名列表 |
| `total_pulls` | 该期总抽数（不含免费） |
| `star6_count` | 该期 6 星出货数 |
| `up_count` | 该期 UP 出货数 |
| `up_avg_pity` | 该期平均UP出货（总抽数/UP出货数） |
| `star6_avg_pity` | 该期平均6星出货（总抽数/6星出货数） |

**联合池分期统计 (`joint_pool_periods`)**:
| 字段 | 说明 |
|------|------|
| `pool_name` | 联合池名称 |
| `up_char_names` | 该期 UP 角色名列表 |
| `total_pulls` | 该期总抽数（不含免费） |
| `star6_count` | 该期 6 星出货数 |
| `up_count` | 该期 UP 出货数 |
| `up_avg_pity` | 该期平均UP出货（总抽数/UP出货数） |
| `star6_avg_pity` | 该期平均6星出货（总抽数/6星出货数） |

**武器池分期统计 (`weapon_pool_periods`)**:
| 字段 | 说明 |
|------|------|
| `pool_name` | 武器池名称 |
| `up_weapon_names` | 该期 UP 武器名列表 |
| `total_pulls` | 该期总抽数（不含免费） |
| `star6_count` | 该期 6 星出货数 |
| `up_count` | 该期 UP 出货数 |
| `up_avg_pity` | 该期平均UP出货（总抽数/UP出货数） |
| `star6_avg_pity` | 该期平均6星出货（总抽数/6星出货数） |

**按渠道统计 (`by_channel.*`)**:
| 字段 | 说明 |
|------|------|
| `total_users` | 该渠道已同步用户数 |
| `total_pulls` | 该渠道全池总抽数（不含免费） |
| `star6_total` | 该渠道全池 6 星总数 |
| `avg_pity` | 该渠道全池平均6星出货 |
| `operator_total_pulls` | 该渠道干员池总抽数 |
| `operator_star6_total` | 该渠道干员池6星总数 |
| `operator_avg_pity` | 该渠道干员池平均6星出货 |
| `weapon_total_pulls` | 该渠道武器池总抽数 |
| `weapon_star6_total` | 该渠道武器池6星总数 |
| `weapon_avg_pity` | 该渠道武器池平均6星出货 |

**按平台统计 (`by_provider.*`)**:
| 字段 | 说明 |
|------|------|
| `skland` | 国服平台聚合统计 |
| `skport` | 国际服平台聚合统计 |
| 其余字段 | 与 `by_channel.*` 统计口径一致 |

**国际服按区域统计 (`by_region.<region>`)**:
| 字段 | 说明 |
|------|------|
| `<region>` | 国际服 region（如 `en-us`、`jp-jp`），缺失时归入 `unknown` |
| 其余字段 | 与 `by_channel.*` 统计口径一致 |

**出货排名**:
| 字段 | 说明 |
|------|------|
| `ranking.limited` | 限定池排名（受 `pool_period` 过滤影响） |
| `ranking.joint` | 联合池排名（受 `pool_period` 过滤影响） |
| `ranking.standard` | 常驻池排名 |
| `ranking.weapon` | 武器池排名 |
| `char_name` | 角色/武器名称 |
| `count` | 全服获取数量 |
| `percent` | 占该星级总数的百分比 |

**卡池类型**:
| 类型 | 说明 |
|------|------|
| `limited` | 限定角色池 |
| `joint` | 联合角色池 |
| `standard` | 常驻角色池 |
| `beginner` | 新手池 |
| `weapon` | 武器池 |
| `character` | 角色池合计（限定+联合+常驻） |

---

## 模拟抽卡 API

> 公开接口，无需认证。用于模拟游戏中的抽卡逻辑，支持三种卡池类型。

### 卡池规则说明

| 卡池类型 | 6星保底 | 软保底起始 | 基础概率 | 硬保底 | UP概率 |
|----------|---------|-----------|---------|--------|--------|
| 限定角色池 | 80抽 | 65抽后+5%/抽 | 0.8% | 120抽必出UP | 50% |
| 武器池 | 40抽 | 无软保底 | 4% | 80抽必出UP | 25% |
| 常驻池 | 80抽 | 65抽后+5%/抽 | 0.8% | 无 | 无 |

### 获取可选卡池列表

获取可供模拟的卡池列表，包含各期限定池、武器池和常驻池的 UP 信息。

```http
GET /api/endfield/gacha/simulate/pools
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "pools": [
      {
        "pool_type": "limited",
        "pool_name": "轻飘飘的信使",
        "up_char_names": ["洁尔佩塔"],
        "up_char_name": "洁尔佩塔",
        "is_active": true,
        "is_current": true
      },
      {
        "pool_type": "joint",
        "pool_name": "辉光庆典",
        "up_char_names": ["莱万汀", "洁尔佩塔", "伊薛", "芥蔚"],
        "up_char_name": "莱万汀",
        "is_active": true,
        "is_current": false
      },
      {
        "pool_type": "limited",
        "pool_name": "熔火灼痕",
        "up_char_names": ["莱万汀"],
        "up_char_name": "莱万汀",
        "is_active": false,
        "is_current": false
      },
      {
        "pool_type": "weapon",
        "pool_name": "讯行申领",
        "up_char_names": ["使命必达"],
        "up_char_name": "使命必达",
        "is_active": true,
        "is_current": true
      },
      {
        "pool_type": "standard",
        "pool_name": "基础寻访",
        "up_char_names": [],
        "is_active": true,
        "is_current": true
      }
    ],
    "total": 7
  }
}
```

**字段说明**:
| 字段 | 说明 |
|------|------|
| `pool_type` | 卡池类型：`limited`（限定角色）/ `joint`（联合角色）/ `weapon`（武器）/ `standard`（常驻） |
| `pool_name` | 卡池名称 |
| `up_char_names` | UP 角色/武器名列表（支持多UP，常驻池为空数组） |
| `up_char_name` | UP 角色/武器名（向后兼容，取第一个；常驻池为空或省略） |
| `is_active` | 是否当前活跃（在有效期内） |
| `is_current` | 是否当前期（前端默认选中） |

> **多UP池**：如"辉光庆典"等庆典池，`up_char_names` 包含所有 UP 角色。前端应优先使用 `up_char_names` 数组展示，`up_char_name` 仅用于向后兼容。

**数据来源**：
- 角色限定池：从 `wiki_char_pools`（森空岛官方 Wiki 数据），优先 `chars[dot_type="label_type_up"]`，降级使用 `chars[rarity="rarity_6"]` 获取 UP 角色名
- 武器池：从 `bili_activities`（B站 Wiki 活动数据），`type="武库申领"` 的 `up` 字段获取 UP 武器名
- 常驻池：固定返回一个"基础寻访"

---

### 获取卡池规则

```http
GET /api/endfield/gacha/simulate/rules?pool_type=limited
```

**Query 参数**:
| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| pool_type | string | 否 | limited | 卡池类型：`limited`/`joint`/`weapon`/`standard`（联合池使用限定池规则） |

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
| pool_type | string | 否 | 卡池类型：`limited`/`joint`/`standard`/`beginner`/`weapon` |

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

> **注意**: 封面图 URL 已转换为代理地址，可直接使用。数据每 12 小时自动聚合更新。

---

## 卡池信息管理 API（Pool Admin Secret 鉴权）

> 卡池管理接口用于手动维护角色池和武器池元数据，使用独立的卡池管理员密钥鉴权。
>
> 所有接口需在 `X-Admin-Secret` 请求头中携带 `pool_admin.secret`（与通用 `admin.secret` 不同）。

### 接口概览

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/endfield/gacha/admin/char-pools` | 列出角色池 |
| GET | `/api/endfield/gacha/admin/char-pools/:id` | 获取角色池详情 |
| POST | `/api/endfield/gacha/admin/char-pools` | 创建角色池 |
| PUT | `/api/endfield/gacha/admin/char-pools/:id` | 更新角色池 |
| DELETE | `/api/endfield/gacha/admin/char-pools/:id` | 删除角色池 |
| GET | `/api/endfield/gacha/admin/weapon-pools` | 列出武器池 |
| GET | `/api/endfield/gacha/admin/weapon-pools/:id` | 获取武器池详情 |
| POST | `/api/endfield/gacha/admin/weapon-pools` | 创建武器池 |
| PUT | `/api/endfield/gacha/admin/weapon-pools/:id` | 更新武器池 |
| DELETE | `/api/endfield/gacha/admin/weapon-pools/:id` | 删除武器池 |
| GET | `/api/endfield/gacha/admin/activities` | 列出活动 |
| GET | `/api/endfield/gacha/admin/activities/:id` | 获取活动详情 |
| POST | `/api/endfield/gacha/admin/activities` | 创建活动 |
| PUT | `/api/endfield/gacha/admin/activities/:id` | 更新活动 |
| DELETE | `/api/endfield/gacha/admin/activities/:id` | 删除活动 |

### 列出角色池

```http
GET /api/endfield/gacha/admin/char-pools
X-Admin-Secret: <pool_admin_secret>
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| source | string | 否 | 按来源过滤：`manual` / `skland_wiki` |
| pool_type | string | 否 | 按类型过滤：`limited` / `standard` / `beginner` |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "list": [
      {
        "id": "...",
        "pool_id": "special_1_0_1",
        "name": "熔火灼痕",
        "pool_type": "limited",
        "chars": [...],
        "pool_start_at_ts": "1706198400",
        "pool_end_at_ts": "1707408000",
        "sort_id": 100,
        "source": "manual",
        "created_at": "2026-03-12T10:00:00Z",
        "updated_at": "2026-03-12T10:00:00Z"
      }
    ],
    "total": 1
  }
}
```

### 创建角色池

```http
POST /api/endfield/gacha/admin/char-pools
X-Admin-Secret: <pool_admin_secret>
Content-Type: application/json

{
  "pool_id": "special_2_0_1",
  "name": "新卡池名称",
  "pool_type": "limited",
  "pool_start_at_ts": "1706198400",
  "pool_end_at_ts": "1707408000",
  "start_at_ts": "1706198400",
  "end_at_ts": "1707408000",
  "sort_id": 200,
  "chars": [
    {
      "id": "char_id",
      "name": "角色名",
      "pic": "https://...",
      "rarity": "rarity_6",
      "dot_type": "label_type_up"
    }
  ]
}
```

**请求体字段**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pool_id | string | 是 | 卡池唯一标识（如 `special_1_0_1`） |
| name | string | 是 | 卡池名称 |
| pool_type | string | 是 | 卡池类型：`limited` / `standard` / `beginner` / `weapon` |
| pool_start_at_ts | string | 是 | 国服开始时间（Unix 秒级时间戳字符串） |
| pool_end_at_ts | string | 是 | 国服结束时间（Unix 秒级时间戳字符串） |
| start_at_ts | string | 否 | 通用开始时间戳 |
| end_at_ts | string | 否 | 通用结束时间戳 |
| europe_pool_start_at_ts | string | 否 | 欧服开始时间戳 |
| europe_pool_end_at_ts | string | 否 | 欧服结束时间戳 |
| sort_id | int | 否 | 排序权重 |
| chars | array | 否 | UP 角色列表（WikiCharPoolChar 结构） |

> 创建时自动设置 `source: "manual"`。`star6/5/4_chars` 不可通过此接口写入，由聚合定时任务自动填充。

### 更新角色池

```http
PUT /api/endfield/gacha/admin/char-pools/:id
X-Admin-Secret: <pool_admin_secret>
Content-Type: application/json

{
  "name": "修改后的名称",
  "pool_end_at_ts": "1707500000"
}
```

> 支持部分更新，只提交需要修改的字段。

### 删除角色池

```http
DELETE /api/endfield/gacha/admin/char-pools/:id
X-Admin-Secret: <pool_admin_secret>
```

### 创建武器池

```http
POST /api/endfield/gacha/admin/weapon-pools
X-Admin-Secret: <pool_admin_secret>
Content-Type: application/json

{
  "name": "武库申领·莱万汀",
  "up": "莱万汀",
  "start_time": "2025/6/1 10:00",
  "end_time": "2025/6/15 03:59",
  "image_url": "https://...",
  "detail_url": "https://..."
}
```

**请求体字段**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 武器池名称 |
| up | string | 是 | UP 武器名 |
| start_time | string | 是 | 开始时间 |
| end_time | string | 否 | 结束时间 |
| description | string | 否 | 描述 |
| image_url | string | 否 | 图片 URL |
| detail_url | string | 否 | 详情页 URL |

> 创建时自动设置 `type: "武库申领"`、`source: "manual"`。

### 创建活动

```http
POST /api/endfield/gacha/admin/activities
X-Admin-Secret: <pool_admin_secret>
Content-Type: application/json

{
  "name": "特许寻访·熔火灼痕",
  "type": "特许寻访",
  "up": "安卡",
  "start_time": "2025/6/1 10:00",
  "end_time": "2025/6/15 03:59"
}
```

**请求体字段**:
| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 活动名称 |
| type | string | 是 | 活动类型：`特许寻访` / `武库申领` |
| up | string | 否 | UP 角色/武器名 |
| start_time | string | 是 | 开始时间 |
| end_time | string | 否 | 结束时间 |
| description | string | 否 | 描述 |
| image_url | string | 否 | 图片 URL |
| detail_url | string | 否 | 详情页 URL |

### 数据来源标记

所有数据均带 `source` 字段标记来源，支持手动与自动同步共存：

| source 值 | 含义 | 说明 |
|-----------|------|------|
| `manual` | 管理员手动创建 | 不会被自动同步覆盖 |
| `skland_wiki` | 森空岛 Wiki 同步 | 由 wiki sync 自动写入 |
| `bilibili_wiki` | B站 Wiki 同步 | 由 bilibili sync 自动写入 |

---

## 便捷端点

> 以下端点从 `card/detail` 接口提取特定数据，简化前端调用。
>
> **多角色支持**：所有便捷端点均支持可选的 `roleId` 和 `serverId` query 参数，用于查询指定角色的数据。不传则使用凭证库中的默认角色（`is_primary=true` 的绑定）。

### 获取体力信息

```http
GET /api/endfield/stamina
X-Framework-Token: your-framework-token
```

查询指定角色：
```http
GET /api/endfield/stamina?roleId=1028880050&serverId=1
X-Framework-Token: your-framework-token
```

**Query 参数**（可选，不提供则按 provider 对应绑定库解析目标角色）:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId / role_id | string | 否 | 游戏角色 ID（从 `available_roles` 或绑定列表获取） |
| serverId / server_id | int | 否 | 服务器 ID，默认 1 |

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
    },
    "weeklyMission": {
      "score": 40,
      "total": 100
    }
  }
}
```

### 获取帝江号建设信息

```http
GET /api/endfield/spaceship
X-Framework-Token: your-framework-token
```

**Query 参数**（可选，不提供则按 provider 对应绑定库解析目标角色）:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId | string | 否 | 游戏角色 ID |
| serverId | int | 否 | 服务器 ID，默认 1 |

**响应说明**:

后端会自动计算心情百分比、信赖百分比、信赖等级等展示数据，前端无需自行计算。空房间（无角色驻守）会被自动过滤。

| 字段 | 类型 | 说明 |
|------|------|------|
| `role` | object | 角色基础信息（name / roleId / level / serverId） |
| `constants` | object | 游戏常量（最大体力、最大信赖值、恢复/消耗速率等） |
| `relationLevels` | array | 信赖等级表（友好/亲近/信任的阈值和升级所需值） |
| `rooms` | array | 房间列表（含计算后的角色数据，空房间已过滤） |
| `characterCards` | array | 扁平化角色卡片列表（便于前端直接渲染列表） |
| `charNameMap` | object | 角色 ID → 名称映射 |
| `spaceShip` | object | 原始 spaceShip 数据（向下兼容） |

> 说明：`rooms[].chars[]` 与 `characterCards[]` 均包含 `avatarUrl` 字段，便于前端直接展示头像。

**rooms 中每个房间**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 房间 ID（如 `control_center`、`room_a_1`） |
| `type` | int | 房间类型（0=总控中枢, 1=制造舱, 2=培养舱, 3=会客室, 5=会客室） |
| `roomName` | string | 房间中文名（总控中枢/制造舱/培养舱/会客室） |
| `level` | int | 房间等级 |
| `lastReportTs` | int\|null | 最新报告时间戳（秒），无报告时为 null |
| `chars` | array | 房间内角色列表（见下方） |

**chars / characterCards 中每个角色**:

| 字段 | 类型 | 说明 |
|------|------|------|
| `charId` | string | 角色 ID |
| `name` | string | 角色名称 |
| `avatarUrl` | string | 角色头像 URL（如果上游返回） |
| `physicalStrength` | float | 体力原始值（0~10000） |
| `favorability` | float | 信赖原始值（0~1500） |
| `moodPercent` | int | 心情百分比（0~100），= physicalStrength / 10000 × 100 |
| `trustPercent` | int | 信赖百分比（0~200），分段公式计算 |
| `trustLevelName` | string | 信赖等级名称（友好/亲近/信任） |

> characterCards 额外包含 `roomId`、`roomName`、`moodDisplay`（如 `"58%"`）、`trustDisplay`（如 `"166%"`）字段。

**信赖百分比分段公式**:
- 友好 [0, 300): `trustPercent = floor(fav / 300 × 100)`
- 亲近 [300, 1500): `trustPercent = 100 + floor((fav - 300) / 1200 × 100)`
- 信任 [1500, ∞): `trustPercent = 200`

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "role": {
      "name": "浅巷墨黎",
      "roleId": "1320645122",
      "level": 50,
      "serverId": 1
    },
    "constants": {
      "maxPhysicalStrength": 10000,
      "maxFavorability": 1500,
      "recoveryPerMinute": 20,
      "costPerMinute": 12,
      "recoveryDisplayPerHour": "12%",
      "costDisplayPerHour": "7.2%"
    },
    "relationLevels": [
      { "level": 1, "name": "友好", "threshold": 0, "need": 300 },
      { "level": 2, "name": "亲近", "threshold": 300, "need": 1200 },
      { "level": 3, "name": "信任", "threshold": 1500, "need": 0 }
    ],
    "rooms": [
      {
        "id": "control_center",
        "type": 0,
        "roomName": "总控中枢",
        "level": 3,
        "lastReportTs": 1772223020,
        "chars": [
          {
            "charId": "50515754ef6085bb6a8ddc21ab18a825",
            "name": "埃特拉",
            "physicalStrength": 6610.129,
            "favorability": 1064,
            "moodPercent": 66,
            "trustPercent": 163,
            "trustLevelName": "亲近"
          },
          {
            "charId": "c4cf7541c23c93f991e2e464ee18bb18",
            "name": "佩丽卡",
            "physicalStrength": 4355.929,
            "favorability": 1099,
            "moodPercent": 44,
            "trustPercent": 166,
            "trustLevelName": "亲近"
          }
        ]
      },
      {
        "id": "room_a_1",
        "type": 1,
        "roomName": "制造舱",
        "level": 2,
        "lastReportTs": 1772223020,
        "chars": [
          {
            "charId": "06ba43ff26befc881fd106eaa5ef1b81",
            "name": "昼雪",
            "physicalStrength": 5315.512,
            "favorability": 0,
            "moodPercent": 53,
            "trustPercent": 0,
            "trustLevelName": "友好"
          }
        ]
      }
    ],
    "characterCards": [
      {
        "name": "埃特拉",
        "charId": "50515754ef6085bb6a8ddc21ab18a825",
        "roomId": "control_center",
        "roomName": "总控中枢",
        "moodDisplay": "66%",
        "trustDisplay": "163%",
        "trustLevelName": "亲近",
        "physicalStrength": 6610.129,
        "favorability": 1064,
        "moodPercent": 66,
        "trustPercent": 163
      }
    ],
    "charNameMap": {
      "50515754ef6085bb6a8ddc21ab18a825": "埃特拉",
      "c4cf7541c23c93f991e2e464ee18bb18": "佩丽卡",
      "06ba43ff26befc881fd106eaa5ef1b81": "昼雪"
    },
    "spaceShip": {
      "rooms": [ "..." ]
    }
  }
}
```

### 获取帝江号实时外推数据

```http
GET /api/endfield/spaceship/realtime
X-Framework-Token: your-framework-token
```

> **前置条件**：需先调用过 `/api/endfield/spaceship` 至少一次，以生成数据快照。

**Query 参数**（可选）:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| roleId | string | 否 | 游戏角色 ID |
| serverId | int | 否 | 服务器 ID，默认 1 |

**功能说明**:

基于上次从森空岛获取的帝江号数据快照，根据经过时间实时外推每个角色的当前心情值。解决帝江号数据仅在玩家登录游戏后才更新的问题。

- **工作房间**（总控中枢=0 / 制造舱=1 / 培养舱=2）：心情按 **12/分钟** 消耗
- **休息房间**（会客室=3 / 会客室线索=5）：心情按 **20/分钟** 恢复
- 心情值钳制在 `[0, 10000]`
- **信赖值暂不外推**（游戏内增长速率未公开），保持快照原始值

**响应说明**:

与 `/api/endfield/spaceship` 返回结构基本一致（`constants`、`relationLevels`、`rooms`、`characterCards`、`charNameMap`、`role`），额外包含：

| 字段 | 类型 | 说明 |
|------|------|------|
| `snapshotTime` | string (ISO 8601) | 快照获取时间（上次调用 `/spaceship` 的时间） |
| `calculatedAt` | string (ISO 8601) | 本次计算执行时间 |
| `elapsedMinutes` | float | 距快照经过的分钟数 |

> 注意：实时外推接口**不包含**原始 `spaceShip` 数据，也不包含 `lastReportTs` 字段。

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "role": {
      "name": "浅巷墨黎",
      "roleId": "1320645122",
      "level": 50,
      "serverId": 1
    },
    "snapshotTime": "2026-03-01T14:30:00+08:00",
    "calculatedAt": "2026-03-01T15:00:00+08:00",
    "elapsedMinutes": 30.0,
    "constants": {
      "maxPhysicalStrength": 10000,
      "maxFavorability": 1500,
      "recoveryPerMinute": 20,
      "costPerMinute": 12,
      "recoveryDisplayPerHour": "12%",
      "costDisplayPerHour": "7.2%"
    },
    "relationLevels": [
      { "level": 1, "name": "友好", "threshold": 0, "need": 300 },
      { "level": 2, "name": "亲近", "threshold": 300, "need": 1200 },
      { "level": 3, "name": "信任", "threshold": 1500, "need": 0 }
    ],
    "rooms": [
      {
        "id": "control_center",
        "type": 0,
        "roomName": "总控中枢",
        "level": 3,
        "chars": [
          {
            "charId": "50515754ef6085bb6a8ddc21ab18a825",
            "name": "埃特拉",
            "physicalStrength": 6250.129,
            "favorability": 1064,
            "moodPercent": 63,
            "trustPercent": 163,
            "trustLevelName": "亲近"
          }
        ]
      },
      {
        "id": "room_c_1",
        "type": 3,
        "roomName": "会客室",
        "level": 2,
        "chars": [
          {
            "charId": "c4cf7541c23c93f991e2e464ee18bb18",
            "name": "佩丽卡",
            "physicalStrength": 4955.929,
            "favorability": 1099,
            "moodPercent": 50,
            "trustPercent": 166,
            "trustLevelName": "亲近"
          }
        ]
      }
    ],
    "characterCards": [
      {
        "name": "埃特拉",
        "charId": "50515754ef6085bb6a8ddc21ab18a825",
        "roomId": "control_center",
        "roomName": "总控中枢",
        "moodDisplay": "63%",
        "trustDisplay": "163%",
        "trustLevelName": "亲近",
        "physicalStrength": 6250.129,
        "favorability": 1064,
        "moodPercent": 63,
        "trustPercent": 163
      }
    ],
    "charNameMap": {
      "50515754ef6085bb6a8ddc21ab18a825": "埃特拉",
      "c4cf7541c23c93f991e2e464ee18bb18": "佩丽卡"
    }
  }
}
```

**错误响应**:

| 状态码 | 说明 |
|--------|------|
| 403 | Framework Token 无效或会话过期 |
| 404 | 未找到快照数据（需先调用 `/api/endfield/spaceship`） |

---

### 获取便签信息

```http
GET /api/endfield/note
X-Framework-Token: your-framework-token
```

**Query 参数**（可选，不提供则按 provider 对应绑定库解析目标角色）:
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
    "weeklyMission": {
      "score": 40,
      "total": 100
    },
    "config": {
      "charSwitch": true,
      "charIds": ["chr_0007_ikut", "chr_0019_karin"]
    },
    "achieve": {
      "count": 22,
      "display": {
        "1": "a0917421d5d9e2a174ac47d10ebc7be0"
      },
      "achieveMedals": [
        {
          "achievementData": {
            "id": "a0917421d5d9e2a174ac47d10ebc7be0",
            "name": "“苏醒”"
          },
          "level": 1,
          "isPlated": false,
          "obtainTs": "1769089919"
        }
      ]
    },
    "bpSystem": {
      "curLevel": 46,
      "maxLevel": 60
    },
    "chars": [
      {
        "id": "char_001",
        "name": "黎风",
        "level": 50,
        "evolvePhase": 2,
        "potentialLevel": 3,
        "wikiItemId": "0",
        "ownTs": "1769096945",
        "gender": "CHAR_GENDER_FEMALE",
        "rarity": { "value": "6" },
        "profession": { "value": "先锋" },
        "property": { "value": "电磁" },
        "weaponType": { "value": "单手剑" },
        "tags": ["技力恢复", "电磁附着"],
        "abilityTalents": [
          { "id": "chr_0007_ikut_3", "name": "游刃" }
        ],
        "combatTalents": [
          { "id": "chr_0007_ikut_passive_skill_1_2", "name": "众生智慧" }
        ],
        "cultivationTalents": [
          { "id": "spaceship_skill_chr_0007_ikut_1_1", "name": "荒野锋刃·α" }
        ],
        "talent": {
          "latestBreakNode": "equipBreakT3",
          "latestPassiveSkillNodes": ["chr_0007_ikut_passive_skill_0_2"],
          "latestFactorySkillNodes": ["fac_chr_0007_ikut_0_1"],
          "latestSpaceshipSkillNodes": ["spaceship_skill_chr_0007_ikut_2_1"],
          "attrNodes": []
        },
        "weapon": {
          "id": "9ebcdee862c8f6293f45d4f0458c5244",
          "name": "热熔切割器",
          "iconUrl": "https://bbs.hycdn.cn/image/xxx.png",
          "rarity": { "value": "6" },
          "type": { "value": "单手剑" },
          "level": 60,
          "refineLevel": 0,
          "breakthroughLevel": 2,
          "wikiItemId": "73",
          "gem": {
            "id": "item_gem_rarity_5-093372449f6d3a59df63ee7c9d26801e",
            "gemData": {
              "termId": "093372449f6d3a59df63ee7c9d26801e",
              "name": "无瑕基质·流转",
              "icon": "https://bbs.hycdn.cn/image/xxx.png",
              "templateId": "item_gem_rarity_5"
            }
          }
        },
        "avatarSqUrl": "https://bbs.hycdn.cn/image/xxx.png",
        "avatarRtUrl": "https://bbs.hycdn.cn/image/xxx.png"
      }
    ],
    "charCount": 15
  }
}
```

**说明**:
- `chars` 为便签接口聚合后的干员摘要；新增字段与 `card/detail` 同步（包含天赋分组、talent 节点、weapon.gem 等）。
- 国际服（skport）与国服（skland）共用该返回结构；实际字段完整性取决于上游数据。

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
        "moneyMgr": {
          "total": "16000000",
          "count": "6359757"
        },
        "settlements": [
          {
            "id": "settlement_001",
            "name": "聚落名称",
            "level": 3,
            "exp": "0",
            "expToLevelUp": "0",
            "remainMoney": "2200000",
            "moneyMax": "2200000",
            "officerCharIds": "char_001",
            "officerCharAvatar": "https://bbs.hycdn.cn/image/xxx.png",
            "lastTickTime": "1773034681"
          }
        ],
        "collections": [
          {
            "levelId": "level_001",
            "trchestCount": 10,
            "puzzleCount": 5,
            "blackboxCount": 2,
            "equipTrchestCount": 0,
            "pieceCount": 1
          }
        ],
        "levels": [
          {
            "levelId": "level_001",
            "name": "枢纽区",
            "trchestCount": { "count": 10, "total": 36 },
            "puzzleCount": { "count": 5, "total": 23 },
            "blackboxCount": { "count": 2, "total": 8 },
            "equipTrchestCount": { "count": 0, "total": 0 },
            "pieceCount": { "count": 1, "total": 1 }
          }
        ]
      }
    ],
    "charNameMap": {
      "char_001": "黎风",
      "char_002": "管理员"
    },
    "officerAvatarMap": {
      "char_001": "https://bbs.hycdn.cn/image/xxx.png"
    }
  }
}
```

### 获取成就信息

```http
GET /api/endfield/achieve
X-Framework-Token: your-framework-token
```

> 从 `/card/detail` 提取 `detail.achieve` 数据，完整返回成就结构（包含 `achieveMedals` 全量字段）。

**Query 参数**（可选，不提供则按 provider 对应绑定库解析目标角色）:
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
    "achieve": {
      "count": 22,
      "display": {
        "1": "a0917421d5d9e2a174ac47d10ebc7be0"
      },
      "achieveMedals": [
        {
          "achievementData": {
            "id": "a0917421d5d9e2a174ac47d10ebc7be0",
            "name": "“苏醒”",
            "cateName": "章节奖章"
          },
          "level": 1,
          "isPlated": false,
          "obtainTs": "1769089919"
        }
      ]
    }
  }
}
```

### 获取通行证信息

```http
GET /api/endfield/bp-system
X-Framework-Token: your-framework-token
```

> 从 `/card/detail` 提取 `detail.bpSystem` 数据，返回通行证（Battle Pass）等级进度。

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
    "bpSystem": {
      "curLevel": 46,
      "maxLevel": 60
    }
  }
}
```

**字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| bpSystem.curLevel | int | 当前通行证等级 |
| bpSystem.maxLevel | int | 通行证最大等级 |

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
  "type": "register",
  "captcha_verify_param": "阿里云验证码返回参数"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 邮箱地址 |
| type | string | 是 | 验证码类型 |
| captcha_verify_param | string | 是 | 阿里云验证码验证参数 |

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

> ⚠️ **安全机制**:
> - `register` / `bind_email` 需先通过阿里云验证码
> - `reset_password` 无需阿里云验证码（发送验证码与提交重置均不要求）
> - 同一邮箱 60 秒内只能发送一次
> - `reset_password` 额外有 IP 维度限流（防止批量轰炸）

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

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| email | string | 是 | 已注册邮箱 |
| code | string | 是 | 邮箱验证码（type=`reset_password`） |
| new_password | string | 是 | 新密码（需满足密码强度规则） |

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
- **多绑定支持**：同一用户可对同一客户端授权多个游戏绑定，每个绑定独立一条授权记录
- **`client_id`** 区分不同的第三方应用（bot A / bot B），**`platform_id`**（可选）标识该平台上的具体用户（如 QQ 号）
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
  "platform_id": "123456789",
  "scopes": ["user_info", "binding_info", "game_data"]
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | string | 是 | 客户端唯一标识（区分不同 bot/app） |
| client_name | string | 是 | 客户端显示名称 |
| client_type | string | 是 | 类型：`bot`/`app`/`web` |
| platform_id | string | 否 | 第三方平台用户 ID（如 QQ 号、Discord ID），用于 bot 按平台用户查询授权 |
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
  "binding_id": "64f1a2b3c4d5e6f7a8b9c0d2",
  "provider": "skland"
}
```

**请求参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| binding_id | string | 是 | 要授权的绑定 ID（EndfieldUser 或 SkportUser 的 _id） |
| provider | string | 否 | `skland`（默认）或 `skport`，指定绑定所属 provider |

> **多 Provider 支持**：授权页同时展示国服和国际服绑定，用户选择后前端自动传递对应 `provider`。授权记录会记录 `provider`，后续 `status/data` 返回时自动从正确的 collection 查询绑定信息。

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
        "platform_id": "123456789",
        "scopes": ["user_info", "binding_info", "game_data"],
        "is_active": true,
        "last_access_at": "2026-01-26T14:30:00+08:00",
        "created_at": "2026-01-20T10:00:00+08:00",
        "binding_role_id": "1231231231",
        "binding_nickname": "Kqz",
        "binding_server": "China"
      },
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d4",
        "client_id": "my-bot-001",
        "client_name": "我的机器人",
        "client_type": "bot",
        "platform_id": "123456789",
        "scopes": ["user_info", "binding_info", "game_data"],
        "is_active": true,
        "last_access_at": "2026-01-26T14:35:00+08:00",
        "created_at": "2026-01-21T12:00:00+08:00",
        "binding_role_id": "1320613122",
        "binding_nickname": "浅巷墨黎",
        "binding_server": "China"
      }
    ]
  }
}
```

> 同一 `client_id` 可能有多条记录（对应不同的游戏绑定）。前端撤销时使用 `id`（MongoDB ObjectID）精确撤销单条记录。

### 撤销客户端授权

> ⚠️ 需要认证

```http
DELETE /api/v1/authorization/clients/:client_id
Authorization: Bearer your-access-token
```

**路径参数**：
| 参数 | 类型 | 说明 |
|------|------|------|
| client_id | string | 支持两种值：① MongoDB `_id`（精确撤销单条授权）② `client_id`（撤销该客户端所有授权） |

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
    "platform_id": "123456789",
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
    "platform_id": "123456789",
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
| platform_id | string | 第三方平台用户 ID（可能为空） |
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

### 按平台用户查询授权（客户端调用）

> ⚠️ 需要 API Key 认证

bot 可通过 `client_id` + `platform_id` 查询某平台用户授权的所有游戏账号。适用于 bot 接收到用户消息后，查找该用户已授权的所有游戏绑定。

```http
GET /api/v1/authorization/clients/:client_id/users/:platform_id
X-API-Key: your-api-key
```

**路径参数**：
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_id | string | 是 | 客户端标识 |
| platform_id | string | 是 | 第三方平台用户 ID（创建授权请求时传入的） |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "authorizations": [
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d3",
        "client_id": "my-bot-001",
        "client_name": "我的机器人",
        "platform_id": "123456789",
        "framework_token": "d07de9a9-48e8-4233-b49b-6933efe3b86f",
        "is_active": true,
        "binding_info": {
          "role_id": "1851796247",
          "nickname": "Kqz",
          "level": 50,
          "server_id": "1"
        },
        "created_at": "2026-01-20T10:00:00+08:00",
        "last_access_at": "2026-02-28T15:56:59+08:00"
      },
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d4",
        "client_id": "my-bot-001",
        "client_name": "我的机器人",
        "platform_id": "123456789",
        "framework_token": "a12bc3d4-56ef-7890-abcd-ef1234567890",
        "is_active": true,
        "binding_info": {
          "role_id": "1320645122",
          "nickname": "浅巷墨黎",
          "level": 50,
          "server_id": "1"
        },
        "created_at": "2026-01-21T12:00:00+08:00",
        "last_access_at": "2026-02-28T15:57:00+08:00"
      }
    ]
  }
}
```

**响应字段说明**：
| 字段 | 类型 | 说明 |
|------|------|------|
| id | string | 授权记录 ID（MongoDB ObjectID） |
| client_id | string | 客户端标识 |
| platform_id | string | 平台用户 ID |
| framework_token | string | 用于调用 `/api/endfield/*` 数据接口的凭证 |
| binding_info | object | 绑定的游戏角色信息（role_id、nickname、level、server_id） |
| is_active | bool | 授权是否有效 |

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
GET /api/v1/developer/stats?key_id=xxx&start_date=2026-01-01&end_date=2026-01-31&granularity=day
Authorization: Bearer your-access-token
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| key_id | string | 是 | API Key ID |
| start_date | string | 否 | 开始日期 (YYYY-MM-DD) |
| end_date | string | 否 | 结束日期 (YYYY-MM-DD) |
| granularity | string | 否 | 统计粒度：`hour` 按小时 / `day` 按天（默认） |

**响应示例（granularity=day）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "total_calls": 1234,
    "total_errors": 56,
    "avg_latency_ms": 42.5,
    "timeline": [
      { "date": "2026-01-25", "calls": 500, "errors": 20, "avg_latency_ms": 38.2 },
      { "date": "2026-01-26", "calls": 734, "errors": 36, "avg_latency_ms": 45.8 }
    ],
    "by_endpoint": [
      { "endpoint": "/api/endfield/user", "calls": 800, "errors": 12, "avg_latency_ms": 35.0 },
      { "endpoint": "/api/endfield/search/chars", "calls": 434, "errors": 5, "avg_latency_ms": 52.3 }
    ]
  }
}
```

**响应示例（granularity=hour）**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "total_calls": 200,
    "total_errors": 3,
    "avg_latency_ms": 40.0,
    "timeline": [
      { "time": "2026-01-26 08:00", "calls": 50, "errors": 0, "avg_latency_ms": 35.0 },
      { "time": "2026-01-26 09:00", "calls": 150, "errors": 3, "avg_latency_ms": 42.0 }
    ],
    "by_endpoint": [...]
  }
}
```

**统计说明**:
- `total_calls` / `total_errors` 为该 Key 的全局累计值
- `avg_latency_ms` 为查询范围内所有请求的平均响应延迟（毫秒）
- `timeline` 按时间升序排列
- `by_endpoint` 按调用量降序排列，`endpoint` 使用路由模板（如 `/api/maaend/devices/:device_id`）
- 统计覆盖所有使用该 API Key 调用的接口（包括 MaaEnd、数据查询、绑定等）

此外，响应中还包含当前用户的 **订阅信息** 和 **API Key 配额用量**：

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "total_calls": 1234,
    "total_errors": 56,
    "avg_latency_ms": 42.5,
    "timeline": [...],
    "by_endpoint": [...],
    "subscription": {
      "plan": "pro",
      "plan_name": "Pro",
      "access_level": "standard",
      "rate_limit": 60,
      "daily_quota": 5000,
      "monthly_quota": 150000,
      "daily_used": 1234,
      "daily_remaining": 3766,
      "monthly_used": 45000,
      "monthly_remaining": 105000
    },
    "api_key_usage": [
      {
        "key_id": "64f1a2b3c4d5e6f7a8b9c0d4",
        "key_name": "我的 API Key",
        "daily_used": 500,
        "monthly_used": 12000
      },
      {
        "key_id": "64f1a2b3c4d5e6f7a8b9c0d5",
        "key_name": "机器人 Key",
        "daily_used": 200,
        "monthly_used": 8000
      }
    ]
  }
}
```

**新增字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| subscription | object | 当前用户订阅信息 |
| subscription.plan | string | 计划标识：`free` / `pro` / `plus` |
| subscription.plan_name | string | 计划名称 |
| subscription.access_level | string | 访问级别：`public` / `standard` / `premium` |
| subscription.rate_limit | int | 速率限制（次/分钟），0 表示无限制 |
| subscription.daily_quota | int | 日配额上限，0 表示无限制 |
| subscription.monthly_quota | int | 月配额上限，0 表示无限制 |
| subscription.daily_used | int | 今日已用量 |
| subscription.daily_remaining | int | 今日剩余（-1 表示无限制） |
| subscription.monthly_used | int | 本月已用量 |
| subscription.monthly_remaining | int | 本月剩余（-1 表示无限制） |
| api_key_usage | array | 每个 API Key 的配额用量明细 |
| api_key_usage[].key_id | string | API Key ID |
| api_key_usage[].key_name | string | API Key 名称 |
| api_key_usage[].daily_used | int | 该 Key 今日请求数 |
| api_key_usage[].monthly_used | int | 该 Key 本月请求数 |

### API Key 权限管理

#### 获取可用权限列表

```http
GET /api/v1/developer/permissions/available
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "permissions": [
      {
        "key": "blueprint:write",
        "name": "蓝图写操作",
        "description": "发布/编辑/删除蓝图、点赞、评论、收藏等写操作",
        "requestable": true
      },
      {
        "key": "maaend:control",
        "name": "MaaEnd 远程控制",
        "description": "管理设备、下发/停止任务、获取截图、查看任务历史等 MaaEnd 全量控制操作",
        "requestable": true
      }
    ]
  }
}
```

#### 申请权限

```http
POST /api/v1/developer/api-keys/:id/permissions/request
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "permission": "blueprint:write",
  "reason": "用于我的 QQ 机器人发布蓝图和评论功能"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| permission | string | 是 | 权限标识（从可用权限列表获取） |
| reason | string | 是 | 申请理由（5-500 字符） |

**响应示例**:
```json
{
  "code": 0,
  "message": "创建成功",
  "data": {
    "request": {
      "id": "...",
      "api_key_id": "...",
      "permission": "blueprint:write",
      "reason": "用于我的 QQ 机器人发布蓝图和评论功能",
      "status": "pending",
      "created_at": "2026-02-24T15:00:00+08:00"
    },
    "message": "权限申请已提交，等待管理员审核"
  }
}
```

#### 查看 Key 当前权限和申请状态

```http
GET /api/v1/developer/api-keys/:id/permissions
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "permissions": ["blueprint:write"],
    "requests": [
      {
        "id": "...",
        "permission": "blueprint:write",
        "status": "approved",
        "reviewed_at": "2026-02-24T16:00:00+08:00",
        "created_at": "2026-02-24T15:00:00+08:00"
      }
    ]
  }
}
```

#### 管理员审核接口

> ⚠️ 以下接口需要 `X-Admin-Secret` 请求头鉴权

**获取待审核列表**:
```http
GET /api/v1/developer/admin/permissions/pending
X-Admin-Secret: your-admin-secret
```

**通过申请**:
```http
POST /api/v1/developer/admin/permissions/:id/approve
X-Admin-Secret: your-admin-secret
Content-Type: application/json

{
  "note": "审核通过备注（可选）"
}
```

**拒绝申请**:
```http
POST /api/v1/developer/admin/permissions/:id/reject
X-Admin-Secret: your-admin-secret
Content-Type: application/json

{
  "note": "拒绝理由（可选）"
}
```

### 代理用户管理（第三方用户）

> 以下接口使用 **API Key 认证**（`X-API-Key`），允许第三方客户端管理其代理用户。
>
> 代理用户是第三方客户端（如 QQ 机器人）中的终端用户映射，用于在蓝图库中代表不同用户执行操作。

#### 初始化/更新代理用户

```http
PUT /api/v1/proxy-users
X-API-Key: your-api-key
Content-Type: application/json

{
  "client_user_id": "123456789",
  "client_user_type": "bot",
  "nickname": "张三",
  "avatar": "https://example.com/avatar.png"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| client_user_id | string | 是 | 第三方平台用户标识（如 QQ 号），最长 64 字符 |
| client_user_type | string | 是 | 客户端类型：`bot` / `web` / `app` |
| nickname | string | 是 | 用户昵称（最长 50 字符） |
| avatar | string | 否 | 头像 URL |

**说明**:
- 以 `(api_key_user_id, client_user_id)` 为唯一键
- 用户不存在时创建，已存在时更新 `nickname`、`avatar`、`client_user_type`

**响应示例**（创建）:
```json
{
  "code": 0,
  "message": "创建成功",
  "data": {
    "user": {
      "id": "...",
      "api_key_user_id": "...",
      "client_user_id": "123456789",
      "client_user_type": "bot",
      "nickname": "张三",
      "avatar": "https://example.com/avatar.png",
      "created_at": "2026-02-24T15:00:00+08:00"
    },
    "created": true,
    "message": "代理用户创建成功"
  }
}
```

#### 查询代理用户

```http
GET /api/v1/proxy-users/:client_user_id
X-API-Key: your-api-key
```

#### 列出代理用户

```http
GET /api/v1/proxy-users?page=1&page_size=20
X-API-Key: your-api-key
```

#### 查看当前 Key 信息（自省接口）

```http
GET /api/v1/proxy-users/me
X-API-Key: your-api-key
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "key_id": "...",
    "name": "我的机器人 Key",
    "permissions": ["blueprint:write"],
    "rate_limit": 60,
    "status": "active",
    "total_calls": 1234,
    "created_at": "2026-01-20T10:00:00+08:00"
  }
}
```

### 第三方调用蓝图写接口

蓝图库的所有写接口（发布、点赞、评论、收藏等）现已支持 API Key + 代理用户 认证。

**调用流程**:

1. **创建 API Key**：通过 Web 平台创建 API Key
2. **申请权限**：申请 `blueprint:write` 权限并等待管理员审核通过
3. **初始化代理用户**：`PUT /api/v1/proxy-users` 注册终端用户
4. **调用写接口**：携带 `X-API-Key` + `X-Client-User-ID` + `X-Client-User-Type` 请求头

**请求示例**:
```http
POST /api/blueprints
X-API-Key: your-api-key
X-Client-User-ID: 123456789
X-Client-User-Type: bot
Content-Type: application/json

{
  "title": "高效电池产线",
  "description": "...",
  "code": "ABCD1234..."
}
```

**必需请求头**:
| 请求头 | 说明 |
|--------|------|
| `X-API-Key` | API Key（需具有 `blueprint:write` 权限） |
| `X-Client-User-ID` | 第三方平台用户标识（必须已初始化） |
| `X-Client-User-Type` | 客户端类型：`bot` / `web` / `app`（必填） |

**注意事项**:
- 代理用户必须先通过 `PUT /api/v1/proxy-users` 初始化，否则返回 400
- 评论接口的 Cap PoW 人机验证对 API Key 用户自动跳过
- 蓝图和评论会自动标记 `client_source` 字段记录来源 API Key 名称

### 第三方调用 MaaEnd 接口

MaaEnd 远程控制的所有接口（设备管理、任务控制、截图、WS 推送）已支持 API Key + 代理用户认证。

**调用流程**:

1. **创建 API Key**：通过 Web 平台创建 API Key
2. **申请权限**：申请 `maaend:control` 权限并等待管理员审核通过
3. **初始化代理用户**：`PUT /api/v1/proxy-users` 注册终端用户
4. **调用接口**：携带 `X-API-Key` + `X-Client-User-ID` + `X-Client-User-Type` 请求头

**请求示例**:
```http
GET /api/maaend/devices
X-API-Key: your-api-key
X-Client-User-ID: 123456789
X-Client-User-Type: bot
```

**必需请求头**:
| 请求头 | 说明 |
|--------|------|
| `X-API-Key` | API Key（需具有 `maaend:control` 权限） |
| `X-Client-User-ID` | 第三方平台用户标识（必须已初始化） |
| `X-Client-User-Type` | 客户端类型：`bot` / `web` / `app`（必填） |

**数据隔离**:
- 每个代理用户只能看到和操作自己绑定的设备
- 每个代理用户只能查看和停止自己发起的任务
- WS 推送仅路由到发起方的代理用户连接

**错误响应**:
| 场景 | HTTP 状态码 | 响应 |
|------|------------|------|
| 缺少 `X-Client-User-ID` | 400 | `缺少 X-Client-User-ID 请求头（MaaEnd API Key 认证必须携带代理用户标识）` |
| 缺少 `maaend:control` 权限 | 403 | `API Key 权限不足，需要 maaend:control 权限` |
| 代理用户未初始化 | 400 | `代理用户未初始化，请先调用 PUT /api/v1/proxy-users 初始化用户` |
| 匿名 Token 调用 | 401 | `MaaEnd API 不支持匿名认证` |

---

## 订阅管理

> ⚠️ 以下接口（除计划列表和支付回调外）需要 Web 平台 JWT 认证：`Authorization: Bearer <access_token>`
>
> **订阅计划**控制 API 调用权限、速率限制和配额。所有用户默认为 Free 计划。
> **支付方式**：通过易支付平台支持支付宝、微信、QQ钱包、网银。

### 订阅计划

| 计划 | 名称 | 访问级别 | 速率限制 | 日配额 | 月配额 | 月付价格 | 年付价格 |
|------|------|----------|----------|--------|--------|----------|----------|
| free | Free | public | 10 次/分钟 | 100 | 3,000 | 免费 | 免费 |
| pro | Pro | standard | 60 次/分钟 | 5,000 | 150,000 | ¥19.90 | ¥199.00 |
| plus | Plus | premium | 无限制 | 无限制 | 无限制 | ¥49.90 | ¥499.00 |

**访问级别说明**:
| 级别 | 说明 | 可访问的计划 |
|------|------|-------------|
| public | 公开只读接口 | Free 及以上 |
| standard | 大部分接口 | Pro 及以上 |
| premium | 全部接口 | Plus |

**请求量包**（所有用户均可购买，持有量包即享 Pro (standard) 级别访问权限）:
| 类型 | 名称 | 请求量 | 价格 |
|------|------|--------|------|
| pack_5000 | 5000次请求包 | 5,000 | ¥9.90 |
| pack_20000 | 20000次请求包 | 20,000 | ¥29.90 |
| pack_50000 | 50000次请求包 | 50,000 | ¥59.90 |

### SubscriptionGuardAuto 中间件

所有需要认证的 API 路由均受 `SubscriptionGuardAuto` 中间件保护。该中间件自动从 `config/subscription.yaml` 的 `route_access` 配置确定每条路由的访问级别（`public` / `standard` / `premium`），并执行以下检查：

1. **路由访问级别查询** — 根据 HTTP 方法和路由路径匹配配置中的模式，确定所需的访问级别
2. **用户识别** — 从 Web JWT / API Key / Framework Token / 匿名 Token 中获取用户身份
3. **计划权限检查** — 验证用户订阅计划是否满足路由访问级别要求
4. **速率限制** — 基于计划的每分钟请求限制（内存计数器）
5. **配额消耗** — 三种路径（见下方优先级表），签到配额优先于日/月配额
6. **API Key 配额统计** — 异步记录每个 API Key 的日/月请求次数

**配额消耗优先级**：

| 场景 | 第一优先 | 第二优先 | 耗尽后 |
|------|---------|---------|--------|
| Free + public 路由 | Free 日/月配额 | 付费量包 | 429 |
| Free + standard 路由（提权） | 签到配额 | 付费量包 | 403 |
| Pro + 任意路由 | 签到配额 | Pro 日/月配额 | 429 |
| Plus + 任意路由 | 无配额限制 | — | — |

**核心规则**：
- Free 用户签到配额**只在访问 standard (pro) 路由时消耗**，访问 public 路由不动签到配额
- Pro 用户签到配额**在所有路由上优先消耗**，签到用完后才消耗 Pro 日/月配额
- Free 用户提权访问 standard 路由时，**不递增** Free 计划的日/月配额计数器
- Free 用户如果持有签到配额或付费量包（remaining > 0），允许访问 `standard` 级别接口
- API Key 用户和 JWT 用户在订阅检查中享受相同待遇（按 API Key 所属用户的订阅计划判断）

**响应头**（所有通过 SubscriptionGuard 的请求均返回）:

| Header | 说明 |
|--------|------|
| `X-Plan` | 当前订阅计划（`free` / `pro` / `plus`） |
| `X-RateLimit-Limit` | 每分钟请求限制（Plus 不返回） |
| `X-Quota-Daily-Remaining` | 日配额剩余（Plus 不返回） |
| `X-Quota-Monthly-Remaining` | 月配额剩余（Plus 不返回） |
| `X-Free-Quota-Remaining` | 签到配额剩余（当日有效） |
| `X-Paid-Quota-Remaining` | 付费量包剩余 |
| `X-Quota-Source` | 本次消耗来源：`checkin`（签到）/ `purchase`（付费量包） |
| `X-Free-Quota-Used` | `true` 表示本次请求消耗了签到配额 |
| `X-Quota-Pack-Used` | `true` 表示本次请求消耗了付费量包 |

**超限错误响应**：
```json
// 403 — Free 用户无签到/量包配额，无法访问 standard 路由
{ "code": 403, "message": "当前计划 (Free) 无法访问此接口，需要升级到更高级别的计划或购买请求量包" }

// 429 — 速率限制
{ "code": 429, "message": "请求频率超过当前计划限制，请稍后再试或升级计划" }

// 429 — 配额用尽
{ "code": 429, "message": "请求配额已用尽，请购买请求量包或升级计划" }
```

### 获取计划列表

> 公开接口，无需认证

```http
GET /api/v1/subscription/plans
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "plans": [
      {
        "plan": "free",
        "name": "Free",
        "description": "免费计划，可使用公开只读接口",
        "access_level": "public",
        "rate_limit": 10,
        "daily_quota": 100,
        "monthly_quota": 3000,
        "monthly_price": 0,
        "yearly_price": 0,
        "can_buy_quota": false
      },
      {
        "plan": "pro",
        "name": "Pro",
        "description": "专业计划，可使用大部分接口",
        "access_level": "standard",
        "rate_limit": 60,
        "daily_quota": 5000,
        "monthly_quota": 150000,
        "monthly_price": 19.90,
        "yearly_price": 199.00,
        "can_buy_quota": true
      },
      {
        "plan": "plus",
        "name": "Plus",
        "description": "高级计划，可使用全部接口，无速率和配额限制",
        "access_level": "premium",
        "rate_limit": 0,
        "daily_quota": 0,
        "monthly_quota": 0,
        "monthly_price": 49.90,
        "yearly_price": 499.00,
        "can_buy_quota": false
      }
    ],
    "quota_packs": [
      { "type": "pack_5000", "name": "5000次请求包", "amount": 5000, "price": 9.90 },
      { "type": "pack_20000", "name": "20000次请求包", "amount": 20000, "price": 29.90 },
      { "type": "pack_50000", "name": "50000次请求包", "amount": 50000, "price": 59.90 }
    ]
  }
}
```

---

### 获取订阅状态

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

```http
GET /api/v1/subscription/status
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "plan": "pro",
    "plan_info": {
      "plan": "pro",
      "name": "Pro",
      "description": "专业计划，可使用大部分接口",
      "access_level": "standard",
      "rate_limit": 60,
      "daily_quota": 5000,
      "monthly_quota": 150000,
      "monthly_price": 19.90,
      "yearly_price": 199.00,
      "can_buy_quota": true
    },
    "subscription": {
      "plan": "pro",
      "status": "active",
      "billing_cycle": "monthly",
      "auto_renew": false,
      "started_at": "2026-02-11T10:00:00Z",
      "expires_at": "2026-03-11T10:00:00Z"
    },
    "quota_pack_remaining": 4500,
    "free_quota_remaining": 200,
    "paid_quota_remaining": 4500,
    "checkin_today": true,
    "checkin_streak": 7
  }
}
```

**响应字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| plan | string | 当前计划：`free` / `pro` / `plus` |
| plan_info | object | 计划限制详情 |
| subscription | object\|null | 订阅详情（Free 用户为 null） |
| quota_pack_remaining | int | 请求量包剩余总量 |
| free_quota_remaining | int | 免费配额剩余（签到发放，当日有效） |
| paid_quota_remaining | int | 付费配额剩余（购买的量包） |
| checkin_today | bool | 今日是否已签到 |
| checkin_streak | int | 当前连续签到天数 |

---

### 获取用量统计

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

```http
GET /api/v1/subscription/usage
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "plan": "pro",
    "daily_used": 1234,
    "daily_limit": 5000,
    "daily_remaining": 3766,
    "monthly_used": 45000,
    "monthly_limit": 150000,
    "monthly_remaining": 105000,
    "rate_limit": 60,
    "quota_pack_remaining": 4500,
    "api_key_usage": [
      {
        "key_id": "64f1a2b3c4d5e6f7a8b9c0d4",
        "key_name": "我的 API Key",
        "daily_used": 500,
        "monthly_used": 12000
      },
      {
        "key_id": "64f1a2b3c4d5e6f7a8b9c0d5",
        "key_name": "机器人 Key",
        "daily_used": 200,
        "monthly_used": 8000
      }
    ]
  }
}
```

> **说明**：`daily_remaining` 和 `monthly_remaining` 为 `-1` 时表示无限制（Plus 计划）。
> `api_key_usage` 列出当前用户所有 API Key 的独立配额用量（日/月），数据来源为 Redis 计数器。

---

### 获取订单历史

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

```http
GET /api/v1/subscription/orders?page=1&page_size=20
Authorization: Bearer your-access-token
```

**Query 参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认 1 |
| page_size | int | 否 | 每页数量，默认 20，最大 50 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "orders": [
      {
        "order_id": "SUB20260211100000123456",
        "order_type": "subscription",
        "amount": 19.90,
        "subject": "Endfield API Pro计划 - 月付",
        "plan": "pro",
        "billing_cycle": "monthly",
        "payment_method": "alipay",
        "status": "success",
        "created_at": "2026-02-11T10:00:00Z",
        "paid_at": "2026-02-11T10:01:30Z"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
  }
}
```

**订单类型**:
| 类型 | 说明 |
|------|------|
| subscription | 订阅购买/续费 |
| quota_pack | 请求量包购买 |

**订单状态**:
| 状态 | 说明 |
|------|------|
| pending | 待支付 |
| success | 支付成功 |
| failed | 支付失败 |
| cancelled | 已取消 |

---

### 发起订阅

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

创建订阅支付订单，返回支付跳转 URL。

```http
POST /api/v1/subscription/subscribe
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "plan": "pro",
  "billing_cycle": "monthly",
  "payment_method": "alipay"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| plan | string | 是 | 订阅计划：`pro` 或 `plus`（不能订阅 `free`） |
| billing_cycle | string | 是 | 计费周期：`monthly` 或 `yearly` |
| payment_method | string | 是 | 支付方式：`alipay` / `wxpay` / `qqpay` / `bank` |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "order_id": "SUB20260211100000123456",
    "pay_url": "https://pay.example.com/...",
    "amount": 19.90,
    "subject": "Endfield API Pro计划 - 月付"
  }
}
```

> **支付流程**：
> 1. 前端调用此接口获取 `pay_url`
> 2. 跳转到 `pay_url` 完成支付
> 3. 支付成功后：
>    - 异步回调自动激活订阅（后端处理）
>    - 同步跳转回前端支付成功页面
> 4. 如已有活跃订阅：同级续费延长时间，升级直接生效并延长
> 5. **不允许降级**：当前有高级计划时，不能购买低级计划（需等待到期）

**错误情况**:
| 错误码 | 说明 |
|--------|------|
| 400 | 无效的订阅计划（不能订阅 free） |
| 400 | 无效的计费周期 |
| 400 | 无效的支付方式 |
| 400 | 支付服务未初始化 |
| 400 | 当前已有更高级计划，无法购买低级计划 |

---

### 购买请求量包

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`
>
> 所有已登录用户均可购买。购买量包后自动获得 **Pro 级别**（standard）接口访问权限。日/月配额超限时自动从量包扣减（免费配额优先，付费量包其次）。

```http
POST /api/v1/subscription/quota-pack
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "pack_type": "pack_5000",
  "payment_method": "alipay"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| pack_type | string | 是 | 量包类型：`pack_5000` / `pack_20000` / `pack_50000` |
| payment_method | string | 是 | 支付方式：`alipay` / `wxpay` / `qqpay` / `bank` |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "order_id": "QP20260211100000123456",
    "pay_url": "https://pay.example.com/...",
    "amount": 9.90,
    "subject": "Endfield API 5000次请求包"
  }
}
```

**错误情况**:
| 错误码 | 说明 |
|--------|------|
| 400 | 无效的请求量包类型 |
| 400 | 无效的支付方式 |
| 400 | 支付服务未初始化 |

---

### 取消自动续费

> ⚠️ 需要认证：`Authorization: Bearer <access_token>`

取消自动续费后，当前订阅在到期后失效。

```http
POST /api/v1/subscription/cancel
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "已取消自动续费，当前订阅将在到期后失效",
  "data": null
}
```

---

### 易支付回调（服务端）

以下接口由易支付平台调用，不面向前端。

#### 异步回调

```http
GET/POST /api/v1/subscription/epay/notify
```

- **IP 白名单**校验 + **签名验证**（RSA 或 MD5）
- 支付成功（`trade_status=TRADE_SUCCESS`）后自动激活订阅或请求量包
- 幂等处理：同一订单重复回调不会重复激活
- 返回 `success` 字符串确认接收

#### 同步跳转

```http
GET /api/v1/subscription/epay/return
```

支付完成后将用户重定向到前端支付成功页面（保留所有查询参数）。

---

### 签到

> ⚠️ 以下签到接口均需要 Web 平台 JWT 认证：`Authorization: Bearer <access_token>`
>
> 签到功能仅限网站访问，通过 Origin 白名单 + 人机验证防止自动化。签到成功后发放当日免费配额（当日 23:59:59 过期），免费配额支持 Pro 级别（standard）接口。

#### 获取签到挑战

```http
GET /api/v1/subscription/checkin/challenge
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "challenge_id": "uuid-string",
    "timestamp": 1707600000,
    "server_nonce": "random-hex-string",
    "sign_token": "derived-token-for-signing"
  }
}
```

> 挑战令牌有效期由服务端配置（默认 300 秒），使用后立即失效，不可重复使用。

---

#### 提交签到

```http
POST /api/v1/subscription/checkin
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "challenge_id": "获取到的challenge_id",
  "captcha_verify_param": "阿里云验证码返回的验证参数",
  "client_nonce": "前端生成的随机字符串",
  "timestamp": 1707600000,
  "sign": "HMAC-SHA256签名"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| challenge_id | string | 是 | 从 challenge 接口获取 |
| captcha_verify_param | string | 是 | 阿里云验证码验证参数 |
| client_nonce | string | 是 | 前端生成的随机字符串 |
| timestamp | int | 是 | 当前时间戳（秒） |
| sign | string | 是 | 签名（详见前端 SDK） |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "quota_awarded": 350,
    "streak_days": 7,
    "free_quota_remaining": 350
  }
}
```

**响应字段说明**:
| 字段 | 类型 | 说明 |
|------|------|------|
| quota_awarded | int | 本次签到发放的免费配额 |
| streak_days | int | 当前连续签到天数 |
| free_quota_remaining | int | 签到后的免费配额剩余 |

**错误情况**:
| 错误码 | 说明 |
|--------|------|
| 400 | 今日已签到 |
| 400 | 挑战已过期或不存在 |
| 400 | 签名验证失败 |
| 400 | 人机验证未通过 |
| 403 | 请求来源不在白名单 |

---

#### 获取签到状态

```http
GET /api/v1/subscription/checkin/status
Authorization: Bearer your-access-token
```

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "checked_in_today": true,
    "streak_days": 7,
    "today_quota_awarded": 350,
    "free_quota_remaining": 200,
    "next_reward": 500
  }
}
```

---

#### 获取签到日历

```http
GET /api/v1/subscription/checkin/calendar?year=2026&month=2
Authorization: Bearer your-access-token
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| year | int | 否 | 年份（默认当前年） |
| month | int | 否 | 月份（默认当前月） |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "year": 2026,
    "month": 2,
    "records": [
      { "date": "2026-02-01", "quota_awarded": 200, "streak_days": 1 },
      { "date": "2026-02-02", "quota_awarded": 200, "streak_days": 2 },
      { "date": "2026-02-03", "quota_awarded": 250, "streak_days": 3 }
    ],
    "total_days": 3,
    "current_streak": 3
  }
}
```

---

### 兑换码

通过兑换码可以兑换订阅计划或请求量包。兑换码分为**通用码**（多人可用）和**独享码**（仅一人可用）两种类型。

> **认证**: 兑换接口需要 Web JWT 认证 + Cap PoW 人机验证

#### 兑换兑换码

```http
POST /api/v1/subscription/redemption/redeem
Authorization: Bearer your-access-token
Content-Type: application/json

{
  "code": "ABCD-EFGH-JKLM",
  "cap_token": "cap-pow-token"
}
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| code | string | 是 | 兑换码（大小写不敏感，自动转大写） |
| cap_token | string | 否 | Cap PoW 验证 Token（启用 Cap 时必填） |

**响应示例（兑换订阅）**:
```json
{
  "code": 0,
  "message": "兑换成功",
  "data": {
    "reward_type": "subscription",
    "reward_detail": "Pro 计划 30 天（到期: 2026-03-14）",
    "plan": "pro",
    "duration": 30,
    "quota_amount": 0
  }
}
```

**响应示例（兑换量包）**:
```json
{
  "code": 0,
  "message": "兑换成功",
  "data": {
    "reward_type": "quota_pack",
    "reward_detail": "5000 次请求量包",
    "plan": "",
    "duration": 0,
    "quota_amount": 5000
  }
}
```

**错误响应**:
| 错误消息 | 说明 |
|----------|------|
| 兑换码不存在 | 输入的兑换码无效 |
| 兑换码已过期 | 兑换码已过有效期 |
| 兑换码已被禁用 | 兑换码被管理员禁用 |
| 兑换码已达使用上限 | 通用码的总使用次数已满 |
| 您已达该兑换码的使用次数上限 | 当前用户对该码的使用次数已满 |
| 当前订阅计划不符合此兑换码的使用条件 | 用户当前计划不在允许列表中 |
| 人机验证未通过 | Cap PoW 验证失败 |

**兑换码格式**: `XXXX-XXXX-XXXX`（大写字母+数字，不含 I/O/0/1 等易混淆字符）

**兑换逻辑**:
- **订阅**: 已有活跃订阅 → 在现有到期时间上延长指定天数；无订阅 → 新建
- **量包**: 创建请求量包，永不过期，可用于访问 standard 级别接口

---

#### 获取我的兑换记录

```http
GET /api/v1/subscription/redemption/records?page=1&page_size=20
Authorization: Bearer your-access-token
```

**请求参数**:
| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| page | int | 否 | 页码，默认 1 |
| page_size | int | 否 | 每页数量，默认 20，最大 50 |

**响应示例**:
```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "records": [
      {
        "code": "ABCD-EFGH-JKLM",
        "reward_type": "subscription",
        "reward_detail": "Pro 计划 30 天（到期: 2026-03-14）",
        "created_at": "2026-02-14T00:00:00+08:00"
      }
    ],
    "total": 1,
    "page": 1,
    "page_size": 20
  }
}
```

---

### 订阅方案说明

用户可通过以下四种方式获取 API 访问权限：

| 方式 | 权限级别 | 有效期 | 说明 |
|------|----------|--------|------|
| **月付/年付订阅** | 对应计划级别 | 按周期 | Pro (¥19.90/月) / Plus (¥49.90/月) |
| **请求量包** | Pro (standard) | 用完即止 | 按次计费，无需订阅即可购买 |
| **签到免费配额** | Pro (standard) | 当日有效 | 每日签到免费获得，连续签到递增 |
| **兑换码** | 对应兑换内容 | 按兑换内容 | 通过兑换码兑换订阅计划或请求量包 |

> 请求量包和签到配额均可让 Free 用户访问 standard 级别接口。配额消耗优先级：**签到免费配额 → 付费量包 → 计划日/月配额**。

---

### SubscriptionGuard 中间件

受保护的 API 接口通过 `SubscriptionGuard(accessLevel)` 中间件控制访问，检查流程：

```
1. 识别用户 → 从 Web JWT / API Key / Framework Token 获取用户 ID（匿名用户视为 Free）
2. 查询计划 → Redis 缓存（5分钟 TTL）→ MongoDB 查询
3. 访问权限 → 检查计划是否满足接口要求的 accessLevel
   └─ Free + 签到配额/付费量包 > 0 → 允许访问 standard 级别接口
4. 速率限制 → 基于计划的每分钟请求数限制（内存滑动窗口，1分钟重置）
5. 配额检查 → Redis 原子递增日/月计数器，超限时扣减配额（免费→付费→拒绝）
6. 设置响应头
```

**响应头**（所有经过 SubscriptionGuard 的请求）:
| Header | 说明 |
|--------|------|
| `X-Plan` | 当前计划名称 |
| `X-RateLimit-Limit` | 每分钟请求限制（仅有限制时返回） |
| `X-Quota-Daily-Remaining` | 日配额剩余（仅有限制时返回） |
| `X-Quota-Monthly-Remaining` | 月配额剩余（仅有限制时返回） |
| `X-Quota-Pack-Used` | 本次请求是否使用了量包（值为 `true`） |
| `X-Free-Quota-Used` | 本次请求是否使用了签到免费配额 |
| `X-Quota-Source` | 配额来源：`checkin` / `purchase` |
| `X-Free-Quota-Remaining` | 签到免费配额剩余 |
| `X-Paid-Quota-Remaining` | 付费量包剩余 |

**超限错误**:

速率限制超限（HTTP 429）:
```json
{
  "code": 429,
  "message": "请求频率超过当前计划限制，请稍后再试或升级计划"
}
```

配额用尽（HTTP 429）:
```json
{
  "code": 429,
  "message": "请求配额已用尽，请购买请求量包或升级计划"
}
```

权限不足（HTTP 403）:
```json
{
  "code": 403,
  "message": "当前计划 (Free) 无法访问此接口，需要升级到更高级别的计划"
}
```

---

### 到期提醒

用户可设置订阅到期提醒，在到期前 7天/3天/1天 通过邮件提醒续费（需绑定并验证邮箱）。

---

#### 获取到期提醒设置

```http
GET /api/v1/subscription/reminder
Authorization: Bearer <access_token>
```

**响应**:
```json
{
  "code": 0,
  "data": {
    "enabled": true,
    "days": [7, 3, 1]
  }
}
```

---

#### 更新到期提醒设置

```http
POST /api/v1/subscription/reminder
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "enabled": true,
  "days": [7, 3, 1]
}
```

**请求参数**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `enabled` | boolean | 是 | 是否启用提醒 |
| `days` | int[] | 是（启用时） | 提醒天数列表，可选值: `7`, `3`, `1` |

**响应**:
```json
{
  "code": 0,
  "message": "提醒设置已更新",
  "data": {
    "enabled": true,
    "days": [7, 3, 1]
  }
}
```

---

#### 取消到期提醒

```http
DELETE /api/v1/subscription/reminder
Authorization: Bearer <access_token>
```

**响应**:
```json
{
  "code": 0,
  "message": "已取消到期提醒"
}
```

---

### 兑换码等级转换规则

兑换订阅类兑换码时，系统会根据用户当前计划与兑换码计划的等级关系自动处理：

| 场景 | 当前计划 | 兑换码计划 | 行为 |
|------|---------|-----------|------|
| 新用户 | Free | 任意 | 创建新订阅，获得完整天数 |
| 同级 | Pro | Pro | 保持 Pro，延长完整天数 |
| 提权 | Pro | Plus | 升级到 Plus，延长完整天数 |
| 降权 | Plus | Pro | 保持 Plus，按月费比例转换天数（扣 15% 转换费） |

**降权转换示例**（Pro=9元/月，Plus=15元/月，兑换 Pro 30天码）：
- 比例转换: `30 × (9/15) = 18` 天
- 扣除中转费: `ceil(18 × 15%) = 3` 天
- 最终获得: `18 - 3 = 15` 天 Plus

---

## 前瞻兑换码 API

展示游戏官方发放的前瞻兑换码（如前瞻直播兑换码），供前端展示给用户一键复制使用。

---

### 获取可用兑换码列表

**GET** `/api/endfield/cdkey`

获取所有激活且未过期的前瞻兑换码，按排序权重和创建时间倒序排列。**无需认证**。

**响应示例**

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "list": [
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "code": "ABCD1234EFGH",
        "title": "2.0前瞻直播兑换码 #1",
        "rewards": [
          { "name": "黑键", "amount": 500 },
          { "name": "合成玉", "amount": 200, "icon": "https://example.com/icon.png" }
        ],
        "source": "2.0前瞻直播",
        "is_active": true,
        "sort_order": 10,
        "expires_at": "2026-03-15T23:59:59+08:00",
        "created_at": "2026-03-01T12:00:00+08:00",
        "updated_at": "2026-03-01T12:00:00+08:00"
      }
    ],
    "total": 1
  }
}
```

**响应字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| list | array | 兑换码列表 |
| list[].id | string | 兑换码 ID |
| list[].code | string | 兑换码（大写） |
| list[].title | string | 标题描述 |
| list[].rewards | array | 奖励列表，每项含 `name`（名称）、`amount`（数量）、`icon`（图标，可选） |
| list[].source | string | 来源说明（可选） |
| list[].is_active | bool | 是否激活 |
| list[].sort_order | int | 排序权重 |
| list[].expires_at | string | 过期时间（可选，nil 表示永不过期） |
| list[].created_at | string | 创建时间 |
| list[].updated_at | string | 更新时间 |
| total | int | 列表总数 |

---

### 管理端接口

以下接口为后台管理页面使用，需携带 `X-Admin-Secret` 请求头：

- `POST /api/endfield/cdkey/admin/create` 创建兑换码
- `GET /api/endfield/cdkey/admin/list` 查询所有兑换码（含非活跃）
- `PUT /api/endfield/cdkey/admin/update/:id` 更新兑换码
- `DELETE /api/endfield/cdkey/admin/delete/:id` 删除兑换码

> 这些接口仅用于后台运维，不建议第三方客户端直接接入。

---

## 友情链接 API

公开友链能力包含：
- 获取已收录友链列表
- 提交友链申请（**需登录**）

> 管理端审核接口仅用于项目后台运维，不作为第三方公开接入能力。

---

### 获取友链列表

**GET** `/api/endfield/links`

获取所有已审核通过的友情链接，按分类分组返回。无需认证。

**响应示例**

```json
{
  "code": 0,
  "message": "成功",
  "data": {
    "links": [
      {
        "id": "64f1a2b3c4d5e6f7a8b9c0d1",
        "name": "示例工具站",
        "url": "https://example.com",
        "mirrors": [
          { "url": "https://cn.example.com", "label": "CN 镜像" }
        ],
        "github_urls": [
          { "url": "https://github.com/example/repo", "label": "前端仓库" }
        ],
        "avatar": "https://example.com/favicon.ico",
        "description": "一个很好用的工具网站",
        "category": "tool",
        "order": 0,
        "created_at": "2026-01-01T00:00:00Z"
      }
    ],
    "grouped": {
      "tool": [],
      "wiki": [],
      "project": [],
      "resource": []
    },
    "categories": ["tool", "wiki", "project", "resource"],
    "total": 1
  }
}
```

> 响应中不包含申请者用户信息，`applicant_user_id` 字段仅在后台管理接口中可见。

---

### 申请友链

**POST** `/api/endfield/links/apply`

提交友链申请。**需要 Web JWT 认证**（`Authorization: Bearer <token>`），申请者身份由服务端从 Token 中自动提取，无需在请求体中传递。

同一用户只能有一条待审核申请，同一网址不允许重复提交。

**Request Headers**

| Header | 说明 |
|--------|------|
| Authorization | `Bearer <token>`，Web JWT 登录令牌 |

**Request Body**

```json
{
  "name": "我的网站",
  "url": "https://mysite.com",
  "mirrors": [
    { "url": "https://cn.mysite.com", "label": "CN 镜像" }
  ],
  "github_urls": [
    { "url": "https://github.com/me/mysite", "label": "前端仓库" }
  ],
  "avatar": "https://mysite.com/favicon.ico",
  "description": "网站简介，最多 200 字",
  "cap_token": "验证码 token"
}
```

**字段说明**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| name | string | 是 | 网站名称，1–50 字符 |
| url | string | 是 | 网站主地址，必须为 http/https |
| mirrors | []LinkEntry | 否 | 镜像地址列表，最多 5 条 |
| github_urls | []LinkEntry | 否 | GitHub 仓库地址列表，最多 5 条 |
| avatar | string | 否 | 网站图标地址，必须为 http/https |
| description | string | 否 | 网站描述，最多 200 字符 |
| cap_token | string | 条件必填 | 启用验证码时必填 |

**LinkEntry 对象**

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| url | string | 是 | 链接地址，必须为 http/https |
| label | string | 否 | 备注说明，最多 50 字符（如"CN 镜像"、"前端仓库"） |

**错误码**

| HTTP 状态码 | 说明 |
|-------------|------|
| 401 | 未登录或 Token 无效 |
| 403 | 验证码无效或已过期 |
| 409 | 该网址已有申请记录，或当前用户已有待审核申请 |

**响应示例**

```json
{
  "code": 0,
  "message": "创建成功",
  "data": {
    "message": "申请已提交，等待管理员审核"
  }
}
```

---

### 管理端接口（后台使用）

以下接口为后台管理页面使用，需携带 `X-Admin-Secret` 请求头：

- `GET /api/endfield/links/admin/pending` 获取待审核列表（含 `applicant_user_id`）
- `POST /api/endfield/links/admin/approve/:id` 通过申请
- `DELETE /api/endfield/links/admin/reject/:id` 拒绝申请
- `POST /api/endfield/links/admin/create` 直接创建友链
- `DELETE /api/endfield/links/admin/delete/:id` 删除友链

> 这些接口仅用于后台运维，不建议第三方客户端直接接入。

---

## 速率限制

为防止接口滥用，所有接口均有速率限制：

| 限制类型 | 限制规则 | 适用范围 |
|----------|----------|----------|
| **全局 IP 限制** | 600 请求/分钟 | 所有接口 |
| **匿名 Token** | 200 请求/Token（2 小时内） | 匿名访问 |
| **获取匿名 Token** | 10 次/分钟（同一设备标识 + IP） | 获取匿名 Token |
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
  -d '{"email": "test@example.com", "type": "register", "captcha_verify_param": "aliyun_captcha_param"}'

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

# 创建授权请求（platform_id 可选，用于 bot 按平台用户查询授权）
curl -X POST http://localhost:15618/api/v1/authorization/requests \
  -H "X-API-Key: your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "client_id": "my-bot",
    "client_name": "我的机器人",
    "client_type": "bot",
    "platform_id": "123456789",
    "scopes": ["user_info", "binding_info", "game_data"]
  }'

# 轮询授权状态（需要同一个 API Key，授权成功时直接返回 framework_token、user_info、binding_info）
curl -H "X-API-Key: your-api-key" \
  http://localhost:15618/api/v1/authorization/requests/req_xxx/status

# 按平台用户查询授权（bot 查询某 QQ 用户已授权的所有游戏账号）
curl -H "X-API-Key: your-api-key" \
  http://localhost:15618/api/v1/authorization/clients/my-bot/users/123456789

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

# 获取使用统计（近 30 天，按天）
curl -H "Authorization: Bearer your-access-token" \
  "http://localhost:15618/api/v1/developer/stats?key_id=xxx&start_date=2026-01-01&end_date=2026-01-31&granularity=day"
```

### JavaScript

```javascript
// ============ 匿名访问凭证 ============

const DEVICE_ID_KEY = 'endfield_device_uuid';

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function getOrCreateDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

// 获取匿名 Token
const getAnonymousToken = async () => {
  const fingerprint = getOrCreateDeviceId();
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
const sendVerificationCode = async (email, type = 'register', captchaVerifyParam) => {
  const res = await fetch('http://localhost:15618/api/v1/auth/send-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, type, captcha_verify_param: captchaVerifyParam })
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
      platform_id: '123456789', // 可选，第三方平台用户 ID
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

### v3.5.0 (2026-05)

- ✅ **联合池独立化**（`joint_char`）
  - `E_CharacterGachaPoolType_Joint`（辉光庆典）作为独立卡池类型存储和统计，不再归入限定池
  - 数据模型：`records.joint_char` 独立存储联合池记录，`stats.joint_char_count` 独立计数
  - 全服统计：`by_type.joint` 独立统计、`ranking.joint` 独立排名、`joint_pool_periods` 分期列表
  - 卡池角色分布：`pool_type=joint` 独立分类
  - 模拟器：联合池使用限定池规则（保底机制一致）
  - 前端：新增联合池独立 Tab、独立分期选择器、独立分布图表
  - 联合池与限定池共享角色 seqId 空间（去重）但保底计数独立

### v3.4.0 (2026-03-12)

- ✅ **卡池信息管理 API**（`/api/endfield/gacha/admin/*`）
  - 15 个管理接口：角色池 CRUD + 武器池 CRUD + 通用活动 CRUD
  - 独立 `pool_admin.secret` 鉴权，与通用 `admin.secret` 分离
  - 直接写入现有 `wiki_char_pools` / `bili_activities` 集合，下游接口零影响
  - 更新接口支持部分更新，只提交变更字段

- ✅ **数据来源标记**
  - `WikiCharPool` 和 `BiliActivity` 新增 `source` 字段（`omitempty`）
  - 手动创建标记 `manual`，森空岛同步标记 `skland_wiki`，B站同步标记 `bilibili_wiki`

- ✅ **同步共存机制**
  - 自动同步不覆盖 `source=manual` 的手动数据
  - 同步数据自动补写来源标记

- ✅ **管理页面**（`admin/gacha-pools.html`）
  - 角色池/武器池/活动三 Tab 管理
  - 完整 CRUD + 来源/类型筛选 + 来源标签展示

### v3.3.0 (2026-03-01)

- ✅ **帝江号实时外推接口**（`/api/endfield/spaceship/realtime`）
  - 基于上次从森空岛获取的快照数据，根据经过时间实时外推每个角色的心情值
  - 工作房间（总控中枢/制造舱/培养舱）心情按 12/分钟 消耗
  - 休息房间（会客室）心情按 20/分钟 恢复
  - 心情值钳制在 [0, 10000]，信赖值暂不外推（游戏增长速率未公开）
  - 响应额外包含 `snapshotTime`、`calculatedAt`、`elapsedMinutes` 字段
  - 需先调用 `/api/endfield/spaceship` 至少一次以生成快照

- ✅ **帝江号快照自动保存**（`/api/endfield/spaceship`）
  - 每次调用原接口获取数据后，异步保存帝江号数据快照到 MongoDB
  - 快照按 `role_id` upsert，每个游戏角色只保留一条最新快照
  - 存储结构化房间/角色数据（房间类型、角色心情/信赖值），供实时外推计算使用

- ✅ **前瞻兑换码系统**（`/api/endfield/cdkey`）
  - 公开接口返回激活且未过期的兑换码列表，无需认证
  - 管理端 CRUD 接口通过 `X-Admin-Secret` 鉴权
  - 兑换码包含奖励列表、来源、排序权重、过期时间

### v3.2.0 (2026-02-28)

- ✅ **数据授权多绑定支持 + platform_id**
  - 修复同一用户对同一客户端授权多个游戏绑定时，后授权覆盖前授权的问题
  - 授权唯一约束改为 `user_id + client_id + binding_id`，每个绑定独立一条记录
  - 新增 `platform_id` 字段（可选）：第三方平台用户 ID（如 QQ 号、Discord ID）
  - 新增 `GET /api/v1/authorization/clients/:client_id/users/:platform_id` — bot 按平台用户查询所有授权
  - 撤销授权支持按 MongoDB `_id` 精确撤销单条，或按 `client_id` 撤销该客户端所有授权
  - 已授权客户端列表响应新增 `platform_id`、`binding_role_id`、`binding_nickname`、`binding_server` 字段

- ✅ **帝江号建设接口增强**（`/api/endfield/spaceship`）
  - 后端自动计算心情百分比（`moodPercent`）、信赖百分比（`trustPercent`）、信赖等级名称（`trustLevelName`）
  - 新增 `rooms` 字段：房间列表含计算后的角色数据，包含中文房间名（`roomName`）、最新报告时间戳（`lastReportTs`）
  - 新增 `characterCards` 字段：扁平化角色卡片列表，便于前端直接渲染
  - 新增 `constants` 字段：游戏常量（最大体力/信赖值、恢复/消耗速率及 %/小时 显示值）
  - 新增 `relationLevels` 字段：信赖等级表（友好/亲近/信任的阈值和升级所需值）
  - 自动过滤空房间（无角色驻守的房间不再返回）
  - 保留原始 `spaceShip` 数据（向下兼容）
  - 信赖百分比使用分段公式：友好 0~99%、亲近 100~199%、信任 200%（非线性除法）
  - 算法移植自 `spaceship_solver/spaceship_physical_mood_solver.js` v2

### v3.1.0 (2026-02-17)

- ✅ **解包数据表扩展**（14 → 33 种）
  - 新增蓝图相关、生产/配方、电力/燃料、建筑↔物品映射、流体/仓储等 19 种表
  - 导入时自动将数值字符串转为真实数值类型（`int64`/`float64`）
- ✅ **V2 产线计算器 API**（基于解包数据）
  - 新增 `GET /api/calc/v2/recipes` — 解包配方列表
  - 新增 `GET /api/calc/v2/facilities` — 解包设备列表
  - 新增 `GET /api/calc/v2/all` — 一次性获取全部数据
  - 使用游戏内部 ID，配方更完整，保留原有 V1 Wiki 接口
- ✅ **蓝图自动填充优化**
  - 修复产出物：排除 `log_conditioner`（物品准入口）和中间产物，只返回最终产出
  - 修复原材料：用 `game_data(factory_recipes)` 直接匹配配方，正确识别外部输入原料
  - 移除对 `wiki_recipes` 的依赖，改用解包配方数据匹配

### v2.9.0 (2026-02-11)

- ✅ **好友查询 API**
  - 新增 `GET /api/friend/search` — 按 uid 或关键词搜索玩家
  - 新增 `GET /api/friend/detail` — 查询玩家详情（角色展示列表）
  - 新增 `GET /api/friend/char` — 查询单个角色完整面板数据
  - 新增 `GET /api/friend/health` — 服务健康检查
  - 已登录用户不传 `role_id` 时自动从绑定账号解析并缓存

- ✅ **角色面板同步**
  - 新增 `POST /api/panel/sync` — 触发全量面板同步（异步队列处理）
  - 新增 `GET /api/panel/sync/status` — 查询同步进度
  - 新增 `GET /api/panel/chars` — 获取已同步角色列表（分页）
  - 新增 `GET /api/panel/char/:template_id` — 获取指定角色完整面板
  - 新增 `GET /api/panel/chars/all` — 获取所有已同步角色完整数据（分页）
  - 同步防重入：同一用户同时只允许一个同步任务
  - 增量覆盖：重复同步自动覆盖旧数据
  - 速率限制：每用户每分钟最多 2 次同步

- ✅ **蓝图数据解析**
  - 新增 `GET /api/blueprint/data?code=xxx` — 根据蓝图码查询解析数据
  - 查询过的数据自动缓存，后续请求直接返回
  - 蓝图库上传时填写蓝图码会自动触发异步解析

- ✅ **数据模型新增**
  - `EndfieldLoginSession` 新增 `game_role_id` 字段（游戏 role_id 缓存）
  - 新增面板数据存储（按用户+角色独立存储，支持增量同步）
  - 新增蓝图解析数据缓存存储

### v2.8.0 (2026-02-11)

- ✅ **签到系统**
  - 每日签到发放免费配额（当日 23:59:59 过期），连续签到阶梯奖励
  - Challenge-Response 防重放 + HMAC-SHA256 签名 + 阿里云 CAPTCHA 人机验证
  - Origin 白名单限制仅网站可签到，签到日历按月查询
  - Free 用户签到/购买量包后可访问 Pro 级别（standard）接口

- ✅ **请求量包独立购买**
  - 所有已登录用户均可购买请求量包（不再限制 Pro 计划）
  - 持有量包的用户自动获得 Pro 级别（standard）接口访问权限
  - 三种付费方式：月付订阅 / 年付订阅 / 请求量包（按次）

- ✅ **配置外部化**
  - 订阅计划和量包定义从代码迁移到 `config/subscription.yaml`
  - 阿里云验证码配置拆分到独立的 `config/captcha.yaml`
  - 验证码服务通用化，从 subscription 包迁移到 `internal/service/captcha/`

- ✅ **订阅管理系统**
  - 三级订阅计划：Free / Pro / Plus，支持月付和年付（计划参数 YAML 可配置）
  - 易支付集成：支持支付宝、微信、QQ钱包、网银，RSA/MD5 双签名模式
  - 配额优先级：签到免费配额 → 付费量包 → 计划日/月配额
  - `SubscriptionGuard` 中间件：访问权限 + 速率限制 + 配额检查 + 新增响应头
  - 配额计数：Redis 原子递增（日/月），Redis 不可用时降级到内存计数器
  - 定时任务：每小时检查过期订阅、每 30 分钟清理速率限制计数器
  - 支付回调：IP 白名单 + 签名验证，幂等处理

- ✅ **新增接口**
  - `GET /api/v1/subscription/plans` — 获取计划列表（公开）
  - `GET /api/v1/subscription/status` — 获取订阅状态（含签到/配额信息）
  - `GET /api/v1/subscription/usage` — 获取用量统计
  - `GET /api/v1/subscription/orders` — 获取订单历史
  - `POST /api/v1/subscription/subscribe` — 发起订阅
  - `POST /api/v1/subscription/quota-pack` — 购买请求量包（所有用户可购买）
  - `POST /api/v1/subscription/cancel` — 取消自动续费
  - `GET/POST /api/v1/subscription/epay/notify` — 易支付异步回调
  - `GET /api/v1/subscription/epay/return` — 易支付同步跳转
  - `GET /api/v1/subscription/checkin/challenge` — 获取签到挑战
  - `POST /api/v1/subscription/checkin` — 提交签到
  - `GET /api/v1/subscription/checkin/status` — 签到状态
  - `GET /api/v1/subscription/checkin/calendar` — 签到日历

- ✅ **新增/修改文件**
  - `internal/database/models/subscription.go` — 订阅/订单/量包/用量数据模型
  - `internal/service/subscription/service.go` — 订阅服务（创建/激活/取消/过期检查）
  - `internal/service/subscription/plans.go` — 计划定义与访问级别检查
  - `internal/service/subscription/quota.go` — 配额管理器（Redis + 内存降级）
  - `internal/service/subscription/epay.go` — 易支付客户端（RSA/MD5 签名）
  - `internal/middleware/subscription.go` — SubscriptionGuard 中间件
  - `plugins/web/subscription/subscription.go` — 插件主文件（路由注册 + 定时任务）
  - `plugins/web/subscription/handlers.go` — API 处理器
  - `plugins/web/subscription/payment.go` — 支付回调处理 + 易支付配置初始化
  - `config/subscription.yaml` — 订阅与易支付配置
  - `plugins/plugins.go` — 添加订阅插件空导入

### v2.7.0 (2026-02-08)

- ✅ **评论系统增强**
  - 评论列表接口支持 `parent_id` 查询参数，查询某评论的回复列表
  - 发表评论接口新增速率限制（每用户每分钟 10 条）
- ✅ **收藏夹功能增强**
  - 每用户自动创建默认收藏夹（`is_default: true`），不可删除
  - 收藏夹新增 `views_count`、`likes_count` 字段
  - 新增收藏夹点赞接口：`POST /api/blueprints/collections/:id/like`
  - 收藏夹详情自动记录浏览量（同一 IP 24h 去重）
  - 收藏夹详情返回 `is_liked` 字段（登录时）
  - 私有收藏夹仅所有者可查看（通过 JWT 识别）
  - 删除收藏夹时同步减少相关蓝图的 `favorites_count`
  - 收藏夹图片自动签名（与蓝图一致）
  - 新增数据集合：`collection_likes`

### v2.6.0 (2026-02-07)

- ✅ **蓝图库功能**（社区蓝图分享平台）
  - 新增蓝图 CRUD：发布/编辑/删除蓝图，支持草稿/已发布/已归档三种状态
  - 蓝图字段：标题、描述、蓝图码、截图（S3/OSS，最多 9 张）、产出物、输入原料（源矿/紫晶矿/清水/蓝铁矿）、功率要求、蓝图尺寸（宽高，可选）、基地选择（通用/四号谷地/武陵+子基地可选）、要求设备、服务器区域（cn/global）、原创标注
  - 社交互动：点赞（toggle）、复制记录（1h 去重）、浏览量（24h IP 去重）、评论（回复+引用蓝图）
  - 收藏夹：用户自定义收藏夹（最多 50 个）、收藏/取消收藏、公开收藏夹分享
  - 搜索筛选：产出物/原料/基地/功率范围/设备/服务器/关键词 多条件筛选 + 多种排序 + 分页
  - 创作者主页 + 我的蓝图（含草稿）+ 我的点赞
  - 图片上传：`POST /api/blueprints/upload/image`（S3/OSS，max 10MB，jpg/png/webp）
  - 元数据接口：`GET /api/blueprints/meta` 返回基地/原料/服务器等枚举
  - 安全措施：全字段输入清洗、蓝图码正则、枚举联合校验、关联数据校验、IP 哈希隐私保护
  - 数据集合：`blueprints`、`blueprint_likes`、`blueprint_comments`、`blueprint_collections`、`blueprint_favorites`、`blueprint_views`（30天TTL）、`blueprint_copies`（90天TTL）
  - 新增 S3/OSS 存储服务（minio-go，兼容 AWS S3/阿里云 OSS/MinIO）
  - 新增 `config/storage.yaml` 存储配置
- ✅ **蓝图库优化**
  - `base_plate_requirement` 字段替换为 `width` + `height`（蓝图尺寸，可选）
  - `base_location` 校验放宽：非"通用"区域也允许为空（表示该区域通用）
  - 图片上传前端增加严格格式/大小校验

### v2.5.0 (2026-02-07)

- ✅ **生产列表云端同步**
  - 新增 `GET /api/calc/production-list` — 获取当前用户的生产列表
  - 新增 `POST /api/calc/production-list` — 保存生产列表（整体覆盖，upsert by user_id）
  - 独立插件 `production-list`，使用 `WebAuth` 中间件（仅登录用户可用）
  - 输入安全验证：HTML 清洗（`SanitizeInput`）、XSS 脚本检测（`ValidateSafeString`）、MongoDB 注入防护（`SanitizeForMongoDB`）
  - 数量限制：entries <= 100、targets <= 50/条、字段长度限制
  - 数据模型：一个用户一条文档（`production_lists` 集合），按 `user_id` 索引
  - 前端支持：保存当前计划到列表、列表模式汇总统计、云端上传/下载

### v2.4.0 (2026-02-07)

- ✅ **全服统计分期优化**
  - UP 角色判定改为按每条记录的 `pool_name` 匹配对应卡池的 UP 角色列表（从 `wiki_char_pools` 构建全量映射）
  - 新增 `pool_periods` 响应字段：返回所有限定池分期的汇总统计（各期抽数、6星数、UP出货数）
  - 新增 `pool_period` 查询参数：支持过滤限定池统计/排名到特定期数
  - `current_pool` 新增 `up_char_names` 字段支持多 UP 角色
  - 不同分期使用独立缓存 key
  - 前端新增限定池分期选择器，支持查看各期独立数据

- ✅ **模拟抽卡卡池选择**
  - 新增 `GET /api/endfield/gacha/simulate/pools` 接口，返回可供模拟的卡池列表（含 UP 信息）
  - `SimulatorPoolInfo` 新增 `up_char_names` 字段（`[]string`），支持多UP角色展示（如辉光庆典4UP池）
  - `up_char_name` 保留向后兼容（取第一个UP角色名）
  - 角色限定池从 `wiki_char_pools` 获取 UP 角色名，优先 `dot_type`，降级 `rarity_6`
  - 武器池从 `bili_activities`（B站 Wiki 活动数据）获取 UP 武器名
  - 前端模拟器新增卡池选择器，支持选择过往限定池/武器池

- ✅ **多UP池同步与识别**
  - Wiki 同步层（`syncCharPool`）：当卡池所有角色 `dotType` 为空时，自动将 `rarity_6` 角色推断为 `label_type_up`
  - 名称解析失败时输出 WARN 日志，便于排查 Wiki 条目缺失
  - `buildPoolInfoFromWikiPool`、`buildCharPoolUpMap` 均增加 `rarity_6` 降级策略
  - 确保抽卡分析和模拟器在多UP场景（如4UP庆典池）下正确处理

- ✅ **武器池 UP 自动化**
  - 移除 `gacha.yaml` 配置文件和 `GachaConfig` 相关代码
  - 武器 UP 判定改用 B 站 Wiki 活动数据（`bili_activities` 的 `type=武库申领` + `up` 字段）按名称匹配
  - 无需人工维护武器配置

- ✅ **卡池角色聚合频率提升**
  - 聚合间隔从 24 小时缩短为 12 小时

### v2.3.0 (2026-02-06)

- ✅ **产线计算器 API 优化**
  - 配方过滤：只返回有设备关联（`facility_item_id` 非空）+ 有输入输出的有效配方
  - crafting_time 修复：Wiki 解析为 0 时根据设备类型推断默认值（基础 2s / 高级 10s）
  - 物品智能收集：从有效配方的 inputs/outputs 反向收集，不再全量查询 wiki_items
  - 新增 `as_target` 字段：后端自动判断物品是否可作为生产目标
  - 配方 ID 稳定化：优先使用 `recipe_hash`（MD5），不随数据库重建变化
  - 设备精简：`/api/calc/all` 只返回被配方引用的设备
  - 配方新增 `facility_name` 字段
- ✅ **新增独立配方解析接口** `POST /api/wiki/admin/parse-recipes`
  - 从已有 wiki_items 直接解析配方，不需等待 Wiki 全量同步
- ✅ **新增设备导入脚本** `scripts/import-facilities.mjs`
  - 从 `facility_init_data.json` 读取设备功耗/等级，按名称匹配后端设备列表批量更新
  - 支持 `--dry-run`、`--api-key`、`--file` 参数
- ✅ **修复设备批量导入 `$currentDate` 写入 bug**
  - `updated_at` 改用 `time.Now()` 直接写入，不再使用 MongoDB 操作符
- ✅ **修复设备查询反序列化失败**: 使用投影排除可能脏的时间字段

### v2.2.0 (2026-02-06)

- ✅ **新增产线计算器 API**
  - `GET /api/calc/items` - 获取产线计算物品
  - `GET /api/calc/recipes` - 获取产线计算配方
  - `GET /api/calc/facilities` - 获取产线计算设备
  - `GET /api/calc/all` - 一次性获取全部数据
- ✅ **新增设备管理 API**（人工维护功耗/等级）
  - `GET /api/wiki/facilities` - 获取设备列表
  - `GET /api/wiki/facilities/:item_id` - 获取单个设备
  - `PUT /api/wiki/facilities/:item_id` - 更新设备功耗/等级
  - `POST /api/wiki/facilities/batch` - 批量导入/更新设备数据
- ✅ **Wiki 同步新增配方自动解析**
  - 设备表格（产物/材料/时间）和物品表格（设备/原料/产物）使用独立解析函数
  - 自动识别表格列角色，支持按位置推断回退
  - 物品表格正确提取设备引用（`count=0` 为引用标记）
  - 使用 `recipe_hash` 去重
- ✅ **新增数据模型**
  - `wiki_recipes` 集合 — 存储自动解析的配方数据
  - `wiki_facilities` 集合 — 存储设备功耗/等级（人工维护）
- ✅ **ID 体系变更**: 使用 Wiki 条目 ID（数字字符串）作为统一标识
- ✅ **修复 Wiki 同步 audioList 反序列化失败**: 干员语音对象数组兼容
- ✅ **修复 Wiki 同步 401 时间戳漂移**: 遇到 10003 错误自动 RefreshToken 重试
- ✅ **优化配方解析不依赖当次目录同步**: 使用数据库历史数据，查询加 `content != nil` 过滤

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
  - 设备标识绑定（建议持久化 UUID）
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
