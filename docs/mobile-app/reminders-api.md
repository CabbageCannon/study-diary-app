# 每日提醒 Web Push 契约

前端已按 PWA Web Push 接入以下接口。定时发送由后端负责，前端不会依赖页面常驻或浏览器计时器。

## 获取 VAPID 公钥

`GET /api/reminders/public-key`

```json
{ "public_key": "base64url-vapid-public-key" }
```

## 创建订阅

`POST /api/reminders/subscriptions`

```json
{
  "endpoint": "https://push-service.example/subscription-id",
  "p256dh": "base64url-key",
  "auth": "base64url-auth-secret",
  "enabled": true,
  "reminder_time": "21:30",
  "timezone": "Asia/Shanghai",
  "interview_goal": 3,
  "algorithm_goal": 3,
  "include_diary": true,
  "include_review": true
}
```

返回订阅记录，至少包含 `id`。

## 更新设置

`PATCH /api/reminders/subscriptions/{id}`

```json
{
  "enabled": true,
  "reminder_time": "21:30",
  "timezone": "Asia/Shanghai",
  "interview_goal": 3,
  "algorithm_goal": 3,
  "include_diary": true,
  "include_review": true
}
```

## 删除订阅

`DELETE /api/reminders/subscriptions/{id}`
