# 📱 小屋伴侣（Android）

自动把「你正在使用的手机 App」实时同步到“我们的小屋”网页端，让对方看到你在用微信 / 抖音 / 音乐播放器……

## 原理

- 通过系统 **`UsageStatsManager`**（使用情况访问权限）读取最近一次使用的前台应用；
- 前台服务每 12 秒读取一次，POST 到服务器 `/api/status`；
- 网页端通过 SSE 实时收到并展示。

## 构建安装

1. 安装 [Android Studio](https://developer.android.com/studio)（含 Android SDK）；
2. 用 Android Studio 打开本目录 `android/`，等待 Gradle 同步（首次会自动下载依赖）；
3. 连接手机（开启 USB 调试）或直接 `Build → Build APK` 生成安装包；
4. 安装到手机（Android 7.0+ / API 24+）。

> 未附带 Gradle Wrapper，Android Studio 会自动使用自带 Gradle；也可用命令行：
> `gradle :app:assembleDebug`

## 使用步骤

1. 在网页端“我们的小屋”→“我的”页面：
   - 复制 **服务器地址**（`https://你的域名` 或局域网 `http://电脑IP:3000`）；
   - 复制 **Pair ID** 和 **Member ID**（两个 ID 一起复制，`复制令牌`按钮）；
2. 打开手机上的“小屋伴侣”App：
   - 填入服务器地址、Pair ID、Member ID → 保存；
3. 点「授权“使用情况访问”权限」，在系统设置里把本 App 打开；
4. 点「开始分享」→ 状态栏出现常驻通知即生效；
5. 网页端首页即可看到对方“正在使用 微信 📱”等实时状态。

## 注意事项

- 服务器地址必须手机能访问到（公网 HTTPS 域名最佳；局域网请确认同一 WiFi + 防火墙放行）；
- 系统可能会省电限制后台服务：在系统设置里把本 App 设为“不受电池优化限制”；
- 卸载/换机后，重新填令牌即可；
- 上报的是应用名 + 包名，对方只看到应用名（如“微信”），看不到内容。

## iOS 说明

iOS 不允许第三方读取当前前台应用，因此无法实现自动上报；iOS 用户可在网页端使用“我在用…”手动分享。

## 目录

```
android/
├── settings.gradle.kts / build.gradle.kts / gradle.properties
└── app/
    ├── build.gradle.kts
    └── src/main/
        ├── AndroidManifest.xml
        ├── java/com/couple/companion/
        │   ├── MainActivity.kt          界面：填服务器+令牌、授权、启停
        │   └── ForegroundAppService.kt  前台服务：读取前台应用并上报
        └── res/values/strings.xml
```
