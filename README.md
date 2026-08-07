# 🏠 我们的小屋

情侣专属的实时互动小软件（PWA，可安装到手机桌面）。只有你们两个人，用邀请码配对，数据不公开。

> 由 **杨皓翔 & 韩诗妮** 发起开发 ❤

---

## ✨ 功能

| 功能 | 说明 |
| --- | --- |
| 📱 实时状态共享 | 对方当前正在用什么（网页端手动分享“我在用…”） |
| 😊 今日心情 | 文字 + 表情，按时间线展示 |
| 🍜 今天吃了啥 | 文字 / 图片，双方可见 |
| 💬 时间线评论 | 可对对方的动态评论（文字 + 图片），实时同步 |
| ✅ 共享清单 | 待办事项，可勾选完成，实时同步 |
| 💌 每日小便签 | 每人每天一句“最想对对方说的话”，对方首页实时预览 |
| 🖼 个人形象 | 双方各自设置头像；**背景仅女方可更换** |
| ⏱ 在一起天数 | 右上角常驻“X天X小时”计时器，点一下即可修改起始日期 |
| 🎊 纪念日 | 可添加多个重要日子，自动显示“已 X 天 / 还有 X 天”，双方可见 |
| 🎵 双人音乐播放器 | 任一方选歌，**双方进软件都能听到**；内置 4 首纯合成音乐（无版权）、**16 首在线音乐库（联网播放）**，也可上传自己的歌 |
| 🎁 彩蛋 | 设置页连点开发者名字 10 次 → 可选跳转邦多利官网 / 输入密码进入 gbcnina 暴君模式（满屏像素爱心 + 烟花炸弹刷屏） |
| 🔐 配对与隐私 | 邀请码 8 位，一个小屋最多 2 人；数据仅双方可见 |

---

## 🚀 快速开始（本机）

需要 Node.js ≥ 18（**无需 npm install，零第三方依赖**）。

```bash
node server.js
```

打开浏览器访问 **http://localhost:3000**：

1. 男方点「创建小屋」，输入昵称 → 得到 8 位邀请码；
2. 女方在另一台设备打开同一地址，点「加入小屋」，输入邀请码和昵称；
3. 双方即可实时同步（SSE 推送）。

> 手机与电脑同一局域网时，手机访问 `http://<电脑IP>:3000` 即可（Windows 防火墙需放行 3000 端口）。
> 建议用 Chrome/Edge 打开并「添加到主屏幕」安装为 App。

### 演示数据

```bash
node scripts/seed-demo.js   # 创建一个带示例数据的演示小屋并打印邀请码
```

### 冒烟测试

```bash
node scripts/smoke.js       # 20 项接口测试（需先启动 server）
```

---

## ☁️ 部署（两人异地使用）

任意一台有公网 IP 的服务器 / 云主机（或 Render、Railway、Fly.io 等平台）：

**方式一：直接运行**
```bash
node server.js        # 监听 0.0.0.0:3000
```

**方式二：Docker**
```bash
docker build -t couple-home .
docker run -d -p 3000:3000 -v couple-data:/app/data --name couple-home couple-home
```

之后：
- 用域名 + HTTPS 反向代理（Caddy / Nginx / 平台自带 TLS）——HTTPS 才能让 PWA 完整可用；
- 数据存于服务器 `data/db.json`，记得定期备份（或挂载持久卷）。

### 可选：换成 Firebase 实时数据库
当前后端是零依赖自托管方案（数据在服务器）。如果更希望用 Firebase：
- `firebase/database` 实时数据库按 `pairId` 存一份状态，两个客户端监听 `on('value')` 即可；
- 前端 `api.js` 里的 `connectEvents` 换成 Firebase 监听即可，其他页面逻辑不变。

---

## 🎵 音乐播放器说明

- **内置音乐**：4 首由 Web Audio 实时合成的轻音乐（晨光/星夜/心动/软绵绵），不需要音频文件、无版权风险，双方听到的完全一致；
- **在线音乐库**：16 首 SoundHelix 免费示例曲目（晨光漫步/星夜低语/晚安宝贝…），直接联网流式播放，无需上传；双方选同一首即“同步”听到同一首歌（加载快慢取决于网络环境）；
- **上传音乐**：任一方上传 mp3/m4a/ogg（≤ 8MB），存到服务器，双方共享；
- **同步机制**：选歌写入 `pair.music.nowPlaying`，SSE 推给双方；对方换歌，你这边自动切换；
- **暂停修复**：手动暂停后，对方只勾待办/写便签等无关同步不会把歌又播起来；只有对方**真的换了歌**才会自动切换；
- 浏览器自动播放策略：首次进入若未自动出声，点一下屏幕上的提示即可开始。

---

## 🛠 技术架构

```
public/                 PWA 前端（原生 JS + ES Modules，无构建步骤）
  index.html            单页应用
  css/style.css         暖甜粉色主题，移动优先
  js/app.js             主控制器：配对/状态/计时/音乐/彩蛋
  js/views.js           五个页面渲染
  js/api.js             REST + SSE 客户端
  js/music.js           WebAudio 内置音乐引擎
  js/ui.js              工具函数
  manifest.webmanifest  PWA 清单（可安装）
  sw.js                 离线缓存 Service Worker
server.js               零依赖 Node 服务端（http + SSE + JSON 持久化）
data/db.json            运行时数据（自动生成，勿提交）
scripts/smoke.js        端到端接口测试
scripts/seed-demo.js    演示数据
Dockerfile              一键部署
```

- **实时推送**：SSE（`GET /api/events/:pairId/:memberId`），断线自动重连；`?poll=1` 可切换为轮询（兼容不支持 SSE 的反代）。
- **持久化**：`data/db.json` 原子写入，重启不丢数据。
- **API 一览**：`/api/pair/create`、`/api/pair/join`、`/api/profile`、`/api/background`（仅女方）、`/api/status`、`/api/note`、`/api/entry`、`/api/entry/comment`、`/api/entry/comment/delete`、`/api/todo`、`/api/anniversary|add|remove`、`/api/tyrant`、`/api/music/pick|add|remove`、`/api/sync`、`/health`。

---

## 🔐 隐私与安全说明

- 配对码 8 位随机（去易混淆字符），一个小屋固定 2 人，第三人无法加入；
- 每次请求校验 `pairId + memberId`；
- 所有接口仅对已配对成员开放；数据不公开、不上第三方平台；
- 生产环境建议：加 HTTPS、邀请码有效期/一次性、上传内容走对象存储（当前 base64 内联存储，适合原型，数据量大后可迁移）。

---

## 📁 目录

```
.
├── server.js / package.json / Dockerfile
├── public/       前端
├── scripts/      测试与演示
├── data/         运行时数据（git 忽略）
```

## 🧩 工作量评估（参考）

| 阶段 | 内容 | 工作量 | 建议周期 |
| --- | --- | --- | --- |
| MVP（本项目） | PWA + 自托管实时后端 + 内置音乐 + 配对 | 约 2–3 人天 | 3–5 天 |
| V1 打磨 | 上线部署、HTTPS、推送通知 | 约 3–5 人天 | +1 周 |
| V2 生产化 | Firebase/对象存储、推送通知、iOS 版、账号找回 | 约 2–4 人周 | +2–4 周 |

报价区间因地区/交付方式差异较大，MVP 参考区间见对话结论。

## 在线访问（Suga 免费托管）

- 网址：https://dnlkuyfydrrq-production-3cxuxq9p.australia-southeast1.suga.run
- 平台：Suga（Free Plan，免信用卡）；自动休眠，访问时自动唤醒。
- 说明：免费平台会休眠且存储有限，正式长期使用建议迁移到国内云服务器（阿里云/腾讯云轻量，约 ¥50-100/年）。

> Railway 部署：修复 railway.json BOM 后重新部署验证。

> 💡 **更新后看不到新功能？** 因为 PWA 会缓存旧代码，请把网页关掉重新打开一次（或「设置 → 清除网站数据」）；已把缓存版本升级到 v2，之后每次更新都会自动换新缓存。

> 自动部署已启用验证。

> 持久化卷挂载验证。
