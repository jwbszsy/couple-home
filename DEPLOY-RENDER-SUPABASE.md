# Render 免费部署 + Supabase 持久数据

## 方案与限制
- 现有 Node/SSE 服务继续由 Render Free Web Service 托管，数据使用 Supabase Postgres 单行 JSON 快照。
- Render 免费 Web Service 会在空闲后休眠，首次唤醒会有冷启动延迟；Supabase Free 项目长期无活动可能暂停。两项都不是全天候 SLA。
- 现有附件以 base64 随小屋快照保存。适合当前小规模；后续用户量/附件增长时，应迁到对象存储和规范化数据库。
- 服务端是单进程内存状态，Render 仅运行一个实例。Supabase 快照写入串行化，服务端不允许 Supabase 配置缺失时回退到临时磁盘。

## Render 环境变量
- `STORAGE_BACKEND=supabase`
- `SUPABASE_URL`：Supabase 项目 URL。
- `SUPABASE_SERVICE_ROLE_KEY`：Supabase service role 密钥，仅配置在 Render 服务环境变量，不放 Git、前端、APK、截图或聊天中。
- `ADMIN_PASS`：设置全新强密码，不使用默认密码。

## Supabase 初始化
1. 在 Supabase Dashboard 新建 Free 项目。
2. SQL Editor 执行 `supabase/schema.sql` 创建 `app_state` 表并启用访问策略。
3. Render 从 GitHub 仓库部署 Blueprint，粘贴以上三个环境变量。
4. 首次部署前，在可信电脑核验本地备份：`npm run storage:preview`。此命令只读取并统计，不上传。
5. 本地 `data/` 备份来自 2026-08-19，包含加密聊天密文、激活码、统计和 VAPID 密钥，可能不含此后的记录。只有接受用该备份恢复时，设置 Supabase 环境变量并运行 `npm run storage:import`；脚本会显示统计并拒绝覆盖任何非空数据库。
6. 导入完成后部署 Render，检查 `/health`、创建/加入、聊天、管理后台、VAPID 推送和文件附件。
7. 再将新后端 URL 固化到网页版与 Android App，构建 APK 并更新用户安装包。

## 回滚
- 导入前本地 `data/` 保持原样；Supabase 首次导入只允许空库。
- 若 Render 部署失败，不删除 Supabase 项目/表和旧备份；修复环境变量后重新部署。