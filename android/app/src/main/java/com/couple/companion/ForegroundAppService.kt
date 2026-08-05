package com.couple.companion

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.app.usage.UsageStatsManager
import android.content.Context
import android.content.Intent
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * 小屋伴侣 · 前台服务
 * 每 12 秒读取一次当前前台应用，POST 到我们的小屋服务器 /api/status。
 * 需要用户在系统设置里授予“使用情况访问权限”（Usage Access）。
 */
class ForegroundAppService : Service() {

    private val scope = CoroutineScope(Dispatchers.IO + Job())
    private var job: Job? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ServiceCompat.startForeground(this, 1, buildNotification("正在分享我的实时状态…"))
        job?.cancel()
        job = scope.launch {
            while (isActive) {
                try {
                    val prefs = getSharedPreferences("couple", Context.MODE_PRIVATE)
                    val server = prefs.getString("server", "") ?: ""
                    val pairId = prefs.getString("pairId", "") ?: ""
                    val memberId = prefs.getString("memberId", "") ?: ""
                    if (server.isNotBlank() && pairId.isNotBlank() && memberId.isNotBlank()) {
                        val pkg = foregroundPackage()
                        if (pkg != null && pkg != packageName) {
                            postStatus(server, pairId, memberId, appLabel(pkg), pkg)
                        }
                    }
                } catch (e: Exception) {
                    // 忽略异常，下一轮重试
                }
                delay(12_000)
            }
        }
        return START_STICKY
    }

    override fun onDestroy() {
        job?.cancel()
        super.onDestroy()
    }

    // 最近一次使用的应用 ≈ 当前前台应用
    private fun foregroundPackage(): String? {
        val usm = getSystemService(Context.USAGE_STATS_SERVICE) as UsageStatsManager
        val end = System.currentTimeMillis()
        val begin = end - 24 * 60 * 60 * 1000L
        val stats = usm.queryUsageStats(UsageStatsManager.INTERVAL_DAILY, begin, end)
        var best: String? = null
        var maxTime = 0L
        for (s in stats) {
            if (s.lastTimeUsed > maxTime && s.lastTimeUsed <= end) {
                maxTime = s.lastTimeUsed
                best = s.packageName
            }
        }
        return best
    }

    private fun appLabel(pkg: String): String {
        return try {
            val pm: PackageManager = packageManager
            val info = pm.getApplicationInfo(pkg, 0)
            pm.getApplicationLabel(info).toString()
        } catch (e: Exception) {
            pkg
        }
    }

    private fun postStatus(server: String, pairId: String, memberId: String, appName: String, packageName: String) {
        val url = URL(server.trimEnd('/') + "/api/status")
        val conn = url.openConnection() as HttpURLConnection
        try {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            val body = JSONObject()
                .put("pairId", pairId)
                .put("memberId", memberId)
                .put("appName", appName)
                .put("packageName", packageName)
                .toString()
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            conn.responseCode // 触发请求
        } finally {
            conn.disconnect()
        }
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ch = NotificationChannel(
                "couple_status",
                "实时状态",
                NotificationManager.IMPORTANCE_LOW
            )
            getSystemService(NotificationManager::class.java).createNotificationChannel(ch)
        }
    }

    private fun buildNotification(text: String) =
        NotificationCompat.Builder(this, "couple_status")
            .setContentTitle("小屋伴侣运行中")
            .setContentText(text)
            .setSmallIcon(android.R.drawable.ic_menu_compass)
            .setOngoing(true)
            .build()

    companion object {
        fun prefs(context: Context): SharedPreferences =
            context.getSharedPreferences("couple", Context.MODE_PRIVATE)
    }
}
