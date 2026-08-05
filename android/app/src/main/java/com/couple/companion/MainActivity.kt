package com.couple.companion

import android.Manifest
import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var serverInput: EditText
    private lateinit var pairInput: EditText
    private lateinit var memberInput: EditText
    private lateinit var statusText: TextView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        buildUi()
        loadPrefs()
        if (Build.VERSION.SDK_INT >= 33) {
            requestNotificationPermission()
        }
    }

    private fun buildUi() {
        val scroll = ScrollView(this)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(28), dp(20), dp(20))
        }

        root.addView(TextView(this).apply {
            text = "🏠 小屋伴侣"
            textSize = 24f
            gravity = Gravity.CENTER
        })
        root.addView(TextView(this).apply {
            text = "自动分享你正在使用的手机应用给 TA"
            textSize = 13f
            gravity = Gravity.CENTER
            setPadding(0, 4, 0, 18)
        })

        serverInput = EditText(this).apply {
            hint = "服务器地址，如 https://xxx.com 或 http://192.168.1.5:3000"
            setSingleLine(true)
        }
        pairInput = EditText(this).apply { hint = "Pair ID（小屋“我的”页复制）"; setSingleLine(true) }
        memberInput = EditText(this).apply { hint = "Member ID（本机）"; setSingleLine(true) }

        root.addField("服务器地址", serverInput)
        root.addField("Pair ID", pairInput)
        root.addField("Member ID", memberInput)

        val saveBtn = Button(this).apply { text = "保存配置" }
        saveBtn.setOnClickListener { savePrefs(); Toast.makeText(this, "已保存", Toast.LENGTH_SHORT).show() }

        val grantBtn = Button(this).apply { text = "授权“使用情况访问”权限" }
        grantBtn.setOnClickListener {
            startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
        }

        val startBtn = Button(this).apply { text = "▶ 开始分享" }
        startBtn.setOnClickListener {
            if (!hasUsageAccess()) {
                Toast.makeText(this, "请先授予“使用情况访问”权限", Toast.LENGTH_LONG).show()
                startActivity(Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS))
                return@setOnClickListener
            }
            savePrefs()
            val s = serverInput.text.toString().trim()
            val p = pairInput.text.toString().trim()
            val m = memberInput.text.toString().trim()
            if (s.isEmpty() || p.isEmpty() || m.isEmpty()) {
                Toast.makeText(this, "请填写完整服务器地址和令牌", Toast.LENGTH_LONG).show()
                return@setOnClickListener
            }
            startServiceCompat()
            statusText.text = "分享中…（每 12 秒更新一次）"
        }

        val stopBtn = Button(this).apply { text = "■ 停止分享" }
        stopBtn.setOnClickListener {
            stopService(Intent(this, ForegroundAppService::class.java))
            statusText.text = "已停止"
        }

        statusText = TextView(this).apply {
            text = "未开始"
            textSize = 13f
            setPadding(0, 12, 0, 0)
            gravity = Gravity.CENTER
        }

        listOf(saveBtn, grantBtn, startBtn, stopBtn).forEach { b ->
            b.layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            ).apply { topMargin = dp(10) }
            root.addView(b)
        }
        root.addView(statusText)

        scroll.addView(root)
        setContentView(scroll)
    }

    private fun LinearLayout.addField(label: String, input: EditText) {
        val lp = LinearLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.WRAP_CONTENT
        ).apply { topMargin = dp(12) }
        val tv = TextView(context).apply { text = label; textSize = 13f }
        addView(tv)
        input.layoutParams = lp
        addView(input)
    }

    private fun startServiceCompat() {
        val intent = Intent(this, ForegroundAppService::class.java)
        if (Build.VERSION.SDK_INT >= 26) {
            startForegroundService(intent)
        } else {
            startService(intent)
        }
    }

    private fun hasUsageAccess(): Boolean {
        val appOps = getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
        val mode = if (Build.VERSION.SDK_INT >= 29) {
            appOps.unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), packageName)
        } else {
            @Suppress("DEPRECATION")
            appOps.checkOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, android.os.Process.myUid(), packageName)
        }
        return mode == AppOpsManager.MODE_ALLOWED
    }

    private fun requestNotificationPermission() {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), 101)
        }
    }

    private fun savePrefs() {
        ForegroundAppService.prefs(this).edit()
            .putString("server", serverInput.text.toString().trim())
            .putString("pairId", pairInput.text.toString().trim())
            .putString("memberId", memberInput.text.toString().trim())
            .apply()
    }

    private fun loadPrefs() {
        val p = ForegroundAppService.prefs(this)
        serverInput.setText(p.getString("server", ""))
        pairInput.setText(p.getString("pairId", ""))
        memberInput.setText(p.getString("memberId", ""))
    }

    private fun dp(v: Int): Int = (v * resources.displayMetrics.density).toInt()
}
