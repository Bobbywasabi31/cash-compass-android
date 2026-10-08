package com.cashcompass.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import java.io.ByteArrayInputStream;
import java.io.IOException;

public class MainActivity extends Activity {
    private static final String ORIGIN = "https://appassets.androidplatform.net/";
    private WebView app;
    private String pendingCSV;
    private String pendingShortcut;
    private boolean pageReady;
    private android.widget.FrameLayout rootView;
    private android.view.View lockOverlay;
    private boolean unlocked; // false at process start: app lock re-arms on every cold start
    private boolean authInProgress;
    private boolean cancelCooldown; // after a cancel, wait for the Unlock button instead of re-prompting
    private static final int OPEN_CSV = 41, SAVE_CSV = 42, NOTIFICATIONS = 43;
    private ValueCallback<android.net.Uri[]> receiptCallback;
    private static final int PICK_RECEIPT = 44;

    @SuppressLint("SetJavaScriptEnabled")
    @Override public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.parseColor("#F8F7F4"));
        getWindow().setNavigationBarColor(Color.parseColor("#F8F7F4"));
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.parseColor("#F8F7F4"));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        app = new WebView(this);
        app.setId(android.R.id.content);
        WebSettings settings = app.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        app.setBackgroundColor(Color.parseColor("#F8F7F4"));
        app.addJavascriptInterface(new Bridge(), "NativeBridge");
        app.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<android.net.Uri[]> callback,
                    FileChooserParams params) {
                if (receiptCallback != null) { receiptCallback.onReceiveValue(null); receiptCallback = null; }
                receiptCallback = callback;
                String[] accept = params.getAcceptTypes();
                String type = (accept != null && accept.length > 0 && accept[0] != null && !accept[0].isEmpty())
                        ? accept[0] : "image/*";
                try {
                    startActivityForResult(new android.content.Intent(android.content.Intent.ACTION_GET_CONTENT)
                            .addCategory(android.content.Intent.CATEGORY_OPENABLE).setType(type), PICK_RECEIPT);
                } catch (android.content.ActivityNotFoundException e) {
                    receiptCallback = null;
                    callback.onReceiveValue(null);
                    return false;
                }
                return true;
            }
        });
        app.setWebViewClient(new WebViewClient() {
            @Override public void onPageFinished(WebView view, String url) {
                pageReady = true;
                if (pendingShortcut != null) {
                    String kind = pendingShortcut;
                    pendingShortcut = null;
                    openShortcut(kind);
                }
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().equals(ORIGIN + "index.html");
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
                return !url.equals(ORIGIN + "index.html");
            }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (url.startsWith(ORIGIN)) {
                    String name = url.substring(ORIGIN.length());
                    String mime = name.equals("index.html") ? "text/html" : name.equals("app.css") ? "text/css" : "application/javascript";
                    if (name.equals("index.html") || name.equals("app.css") || name.equals("core.js") || name.equals("app.js") || name.equals("vendor/pdf.min.js") || name.equals("vendor/pdf.worker.min.js")) {
                        try { return new WebResourceResponse(mime, "UTF-8", getAssets().open(name)); }
                        catch (IOException ignored) { /* Deny missing assets, with no network fallback. */ }
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
            }
        });
        root.addView(app, new FrameLayout.LayoutParams(-1, -1));
        rootView = root;
        setContentView(root);
        root.requestApplyInsets();
        applySecureFlag();
        app.loadUrl(ORIGIN + "index.html");
        handleShortcut(getIntent());
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    @Override protected void onNewIntent(android.content.Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShortcut(intent);
    }

    /** Launcher shortcuts (roadmap #86). Queued until the page is ready. */
    private void handleShortcut(android.content.Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String kind = null;
        if ("com.cashcompass.app.ADD_EXPENSE".equals(intent.getAction())) kind = "expense";
        else if ("com.cashcompass.app.ADD_INCOME".equals(intent.getAction())) kind = "income";
        if (kind == null) return;
        intent.setAction(null); // don't re-trigger on rotation
        if (pageReady) openShortcut(kind);
        else pendingShortcut = kind;
    }

    private void openShortcut(String kind) {
        if (app == null) return;
        final String quoted = org.json.JSONObject.quote(kind);
        runOnUiThread(() -> {
            if (!isFinishing() && !isDestroyed())
                app.evaluateJavascript("window.cashCompassShortcut && window.cashCompassShortcut(" + quoted + ")", null);
        });
    }

    private void handleBack() {
        app.evaluateJavascript("typeof window.cashCompassBack === 'function' && window.cashCompassBack()", handled -> {
            if (!"true".equals(handled)) finish();
        });
    }

    @Override public void onBackPressed() { handleBack(); }
    public WebView getAppWebView() { return app; }

    private void callback(String function, String text) {
        runOnUiThread(() -> {
            if (!isFinishing() && !isDestroyed())
                app.evaluateJavascript("window." + function + " && window." + function + "(" + org.json.JSONObject.quote(text) + ")", null);
        });
    }

    private boolean walletAccess() {
        android.content.ComponentName component = new android.content.ComponentName(this, WalletNotifications.class);
        if (Build.VERSION.SDK_INT >= 27) return getSystemService(android.app.NotificationManager.class).isNotificationListenerAccessGranted(component);
        String enabled = android.provider.Settings.Secure.getString(getContentResolver(), "enabled_notification_listeners");
        if (enabled != null) for (String name : enabled.split(":")) if (component.equals(android.content.ComponentName.unflattenFromString(name))) return true;
        return false;
    }
    @Override protected void onResume() {
        super.onResume();
        if (app != null) callback("cashCompassWalletRefresh", "");
        maybeLock();
    }

    @Override protected void onPause() {
        super.onPause();
        // Re-lock when leaving the app. Skipped while the system unlock UI is
        // up (API 24-28 device-credential intent pauses us), so a successful
        // unlock isn't immediately undone.
        if (!authInProgress) unlocked = false;
    }

    /** Hides the app preview in the recent-apps screen while app lock is on. */
    private void applySecureFlag() {
        if (AppLock.isEnabled(this)) getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
        else getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_SECURE);
    }

    /** Shows the lock overlay and prompts for unlock when app lock is armed. */
    private void maybeLock() {
        if (!AppLock.isEnabled(this) || unlocked || authInProgress) return;
        String mode;
        try { mode = AppLock.mode(this); } catch (Exception e) { mode = "none"; }
        if ("none".equals(mode)) {
            // No screen lock on the phone: nothing to unlock with, and leaving
            // the app permanently locked would brick it. Disarm instead.
            AppLock.setEnabled(this, false);
            applySecureFlag();
            callback("cashCompassNotice", "App lock turned off: this phone has no screen lock set.");
            return;
        }
        showLockOverlay();
        if (cancelCooldown) return; // user cancelled: wait for an explicit Unlock tap
        startPrompt();
    }

    private void startPrompt() {
        if (!AppLock.isEnabled(this) || unlocked || authInProgress) return;
        cancelCooldown = false;
        authInProgress = true;
        AppLock.prompt(this, ok -> {
            authInProgress = false;
            runOnUiThread(() -> {
                if (ok) {
                    unlocked = true;
                    hideLockOverlay();
                } else {
                    cancelCooldown = true; // stays covered; the Unlock button retries
                    showLockOverlay();
                }
            });
        });
    }

    private void showLockOverlay() {
        runOnUiThread(() -> {
            if (isFinishing() || isDestroyed() || rootView == null) return;
            if (lockOverlay != null) {
                lockOverlay.setVisibility(android.view.View.VISIBLE);
                return;
            }
            android.widget.LinearLayout box = new android.widget.LinearLayout(this);
            box.setOrientation(android.widget.LinearLayout.VERTICAL);
            box.setGravity(android.view.Gravity.CENTER);
            box.setBackgroundColor(Color.parseColor("#F8F7F4"));
            android.widget.TextView icon = new android.widget.TextView(this);
            icon.setText("\uD83D\uDD12");
            icon.setTextSize(48);
            icon.setGravity(android.view.Gravity.CENTER);
            android.widget.TextView label = new android.widget.TextView(this);
            label.setText("OddDough is locked");
            label.setTextSize(20);
            label.setGravity(android.view.Gravity.CENTER);
            label.setPadding(0, 24, 0, 32);
            android.widget.Button unlock = new android.widget.Button(this);
            unlock.setText("Unlock");
            unlock.setOnClickListener(v -> startPrompt());
            int pad = (int) (32 * getResources().getDisplayMetrics().density);
            box.setPadding(pad, pad, pad, pad);
            box.addView(icon);
            box.addView(label);
            box.addView(unlock);
            lockOverlay = box;
            rootView.addView(box, new FrameLayout.LayoutParams(-1, -1));
        });
    }

    private void hideLockOverlay() {
        runOnUiThread(() -> {
            if (lockOverlay != null) lockOverlay.setVisibility(android.view.View.GONE);
        });
    }
    public final class Bridge {
        @android.webkit.JavascriptInterface public String walletStatus() { return WalletNotifications.status(MainActivity.this, walletAccess()); }
        @android.webkit.JavascriptInterface public boolean walletEnable(boolean enabled) { return WalletNotifications.enable(MainActivity.this, enabled); }
        @android.webkit.JavascriptInterface public boolean walletBankEnable(boolean enabled) { return WalletNotifications.bankEnable(MainActivity.this, enabled); }
        @android.webkit.JavascriptInterface public boolean walletAck(String json) { return WalletNotifications.acknowledge(MainActivity.this, json); }
        @android.webkit.JavascriptInterface public boolean walletReset() { return WalletNotifications.reset(MainActivity.this); }
        @android.webkit.JavascriptInterface public void walletSettings() {
            runOnUiThread(() -> {
                try { startActivity(new android.content.Intent(android.provider.Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)); }
                catch (android.content.ActivityNotFoundException e) { callback("cashCompassNotice", "Open Android Settings and search for Notification access."); }
            });
        }
        @android.webkit.JavascriptInterface public boolean notificationsAllowed() {
            return getSystemService(android.app.NotificationManager.class).areNotificationsEnabled();
        }
        @android.webkit.JavascriptInterface public void requestNotifications() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                    requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS}, NOTIFICATIONS);
                } else if (!notificationsAllowed()) {
                    startActivity(new android.content.Intent(android.provider.Settings.ACTION_APP_NOTIFICATION_SETTINGS)
                        .putExtra(android.provider.Settings.EXTRA_APP_PACKAGE, getPackageName()));
                }
            });
        }
        @android.webkit.JavascriptInterface public void syncBills(String json) {
            try {
                org.json.JSONObject input = new org.json.JSONObject(json);
                org.json.JSONArray bills = input.getJSONArray("bills"), out = new org.json.JSONArray();
                if (bills.length() > 10000) throw new IllegalArgumentException();
                for (int i = 0; i < bills.length(); i++) {
                    org.json.JSONObject b = bills.getJSONObject(i);
                    String date = b.getString("date");
                    if (!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) throw new IllegalArgumentException();
                    int days = b.optInt("reminderDays", 3);
                    if (days < 0 || days > 60) days = 3;
                    out.put(new org.json.JSONObject().put("date", date).put("days", days));
                }
                getSharedPreferences("reminders", MODE_PRIVATE).edit().putBoolean("enabled", input.optBoolean("enabled"))
                    .putString("bills", out.toString()).remove("dates").apply();
                BillReminder.schedule(MainActivity.this);
            } catch (Exception e) { callback("cashCompassNotice", "Could not update bill reminders."); }
        }
        @android.webkit.JavascriptInterface public void syncWeeklySummary(String json) {
            try {
                org.json.JSONObject input = new org.json.JSONObject(json);
                String title = input.optString("title", "Weekly money recap");
                String text = input.optString("text", "");
                if (title.length() > 80) title = title.substring(0, 80);
                if (text.length() > 500) text = text.substring(0, 500);
                getSharedPreferences("weekly", MODE_PRIVATE).edit().putBoolean("enabled", input.optBoolean("enabled"))
                    .putString("title", title).putString("text", text).apply();
                WeeklySummary.schedule(MainActivity.this);
            } catch (Exception e) { callback("cashCompassNotice", "Could not update weekly recap."); }
        }
        @android.webkit.JavascriptInterface public String appLockStatus() {
            String mode;
            try { mode = AppLock.mode(MainActivity.this); } catch (Exception e) { mode = "none"; }
            return "{\"enabled\":" + AppLock.isEnabled(MainActivity.this)
                    + ",\"mode\":" + org.json.JSONObject.quote(mode) + "}";
        }
        @android.webkit.JavascriptInterface public boolean setAppLock(boolean enabled) {
            if (enabled) {
                String mode;
                try { mode = AppLock.mode(MainActivity.this); } catch (Exception e) { mode = "none"; }
                if ("none".equals(mode)) return false; // nothing to unlock with
            }
            AppLock.setEnabled(MainActivity.this, enabled);
            runOnUiThread(() -> {
                applySecureFlag();
                if (enabled) {
                    unlocked = false;
                    cancelCooldown = false;
                    maybeLock(); // prompt right away so the user verifies it works
                } else {
                    unlocked = true;
                    hideLockOverlay();
                }
            });
            return true;
        }
        @android.webkit.JavascriptInterface public void syncWidgets(String json) {
            // Home-screen widgets (roadmap #12, #85): validated, stored, and
            // rendered by HomeWidgets. Silent on failure — the widgets keep
            // their last good payload instead of nagging on every save.
            try { HomeWidgets.store(MainActivity.this, json); }
            catch (Exception e) { /* keep last good payload */ }
        }
        @android.webkit.JavascriptInterface public void openCSV() {
            runOnUiThread(() -> {
                try { startActivityForResult(new android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT)
                    .addCategory(android.content.Intent.CATEGORY_OPENABLE).setType("*/*"), OPEN_CSV); }
                catch (android.content.ActivityNotFoundException e) { callback("cashCompassNotice", "No file picker available. Paste CSV text instead."); }
            });
        }
        @android.webkit.JavascriptInterface public void saveCSV(String text) {
            if (text == null || text.length() > 8000000) { callback("cashCompassNotice", "Export is too large."); return; }
            runOnUiThread(() -> {
                if (pendingCSV != null) { callback("cashCompassNotice", "Finish the current export first."); return; }
                pendingCSV = text;
                try { startActivityForResult(new android.content.Intent(android.content.Intent.ACTION_CREATE_DOCUMENT)
                    .addCategory(android.content.Intent.CATEGORY_OPENABLE).setType("text/csv")
                    .putExtra(android.content.Intent.EXTRA_TITLE, "Cash-Compass-transactions.csv"), SAVE_CSV); }
                catch (android.content.ActivityNotFoundException e) { pendingCSV = null; callback("cashCompassNotice", "No file picker available."); }
            });
        }
        // ---- In-app updater ----
        // The WebView blocks outside URLs, so the update check, download, and
        // install steps run natively here. All user data stays on the device.
        @android.webkit.JavascriptInterface public String appVersion() {
            try {
                android.content.pm.PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
                long code = Build.VERSION.SDK_INT >= 28 ? pi.getLongVersionCode() : pi.versionCode;
                return "{\"versionName\":" + org.json.JSONObject.quote(pi.versionName)
                    + ",\"versionCode\":" + code + "}";
            } catch (Exception e) { return "{\"versionName\":\"?\",\"versionCode\":0}"; }
        }
        @android.webkit.JavascriptInterface public void checkForUpdate() {
            // GitHub API on a worker thread. On-demand only (unauthenticated
            // limit is 60/hr/IP) — no background polling. Result arrives via
            // window.cashCompassUpdateCheck(json).
            new Thread(() -> {
                String result;
                try {
                    javax.net.ssl.HttpsURLConnection conn = (javax.net.ssl.HttpsURLConnection)
                        new java.net.URL("https://api.github.com/Bobbywasabi31/odddough-android/releases/latest").openConnection();
                    conn.setRequestProperty("User-Agent", "OddDough-Updater");
                    conn.setRequestProperty("Accept", "application/vnd.github+json");
                    conn.setConnectTimeout(10000);
                    conn.setReadTimeout(10000);
                    int code = conn.getResponseCode();
                    if (code == 403 || code == 429) {
                        result = "{\"ok\":false,\"error\":\"GitHub rate limit reached. Try again in a little while.\"}";
                    } else if (code != 200) {
                        result = "{\"ok\":false,\"error\":\"GitHub returned HTTP " + code + ".\"}";
                    } else {
                        String body;
                        try (java.io.InputStream in = conn.getInputStream();
                             java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
                            byte[] buf = new byte[8192]; int n;
                            while ((n = in.read(buf)) != -1) {
                                if (out.size() + n > 262144) throw new IOException("Release payload too large.");
                                out.write(buf, 0, n);
                            }
                            body = out.toString("UTF-8");
                        }
                        org.json.JSONObject rel = new org.json.JSONObject(body);
                        String apkUrl = null;
                        org.json.JSONArray assets = rel.optJSONArray("assets");
                        if (assets != null) for (int i = 0; i < assets.length(); i++) {
                            org.json.JSONObject a = assets.optJSONObject(i);
                            if (a != null && a.optString("name", "").endsWith(".apk")) {
                                apkUrl = a.optString("browser_download_url", "");
                                break;
                            }
                        }
                        String notes = rel.optString("body", "");
                        if (notes.length() > 2000) notes = notes.substring(0, 2000);
                        org.json.JSONObject out = new org.json.JSONObject();
                        out.put("ok", true);
                        out.put("tag", rel.optString("tag_name", ""));
                        out.put("name", rel.optString("name", ""));
                        out.put("notes", notes);
                        out.put("apkUrl", apkUrl == null ? org.json.JSONObject.NULL : apkUrl);
                        result = out.toString();
                    }
                } catch (java.net.UnknownHostException e) {
                    result = "{\"ok\":false,\"error\":\"No internet connection.\"}";
                } catch (Exception e) {
                    result = "{\"ok\":false,\"error\":\"Could not check for updates.\"}";
                }
                callback("cashCompassUpdateCheck", result);
            }, "odddough-update-check").start();
        }
        @android.webkit.JavascriptInterface public String writeUpdateBackup(String json, String tag) {
            // Pre-update backup — Alex's no-data-loss requirement. Writes the
            // current plan to app-specific external storage, which survives app
            // updates (removed only on uninstall), and records a pending-update
            // marker so the next launch can verify and offer a one-tap restore.
            try {
                if (json == null || json.length() > 16000000)
                    return "{\"ok\":false,\"error\":\"Backup data too large.\"}";
                java.io.File dir = new java.io.File(getExternalFilesDir(null), "updates");
                if (!dir.exists() && !dir.mkdirs())
                    return "{\"ok\":false,\"error\":\"Could not create the backup folder.\"}";
                String stamp = new java.text.SimpleDateFormat("yyyyMMdd-HHmmss",
                    java.util.Locale.US).format(new java.util.Date());
                java.io.File f = new java.io.File(dir, "odddough-backup-" + stamp + ".json");
                try (java.io.OutputStream out = new java.io.FileOutputStream(f)) {
                    out.write(json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                }
                getSharedPreferences("updater", MODE_PRIVATE).edit()
                    .putString("pending", new org.json.JSONObject()
                        .put("tag", tag == null ? "" : tag)
                        .put("backupPath", f.getAbsolutePath())
                        .put("when", System.currentTimeMillis()).toString())
                    .apply();
                return "{\"ok\":true,\"path\":" + org.json.JSONObject.quote(f.getAbsolutePath()) + "}";
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"Could not save the pre-update backup.\"}";
            }
        }
        @android.webkit.JavascriptInterface public String pendingUpdate() {
            String s = getSharedPreferences("updater", MODE_PRIVATE).getString("pending", null);
            return s == null ? "null" : s;
        }
        @android.webkit.JavascriptInterface public void clearPendingUpdate() {
            getSharedPreferences("updater", MODE_PRIVATE).edit().remove("pending").apply();
        }
        @android.webkit.JavascriptInterface public String readBackupFile(String path) {
            // Reads only files inside our own updates dir — never an arbitrary path.
            try {
                java.io.File dir = new java.io.File(getExternalFilesDir(null), "updates");
                java.io.File f = new java.io.File(path == null ? "" : path);
                if (!f.getCanonicalPath().startsWith(dir.getCanonicalPath() + java.io.File.separator))
                    return "{\"ok\":false,\"error\":\"Invalid backup path.\"}";
                if (!f.isFile() || f.length() > 16000000)
                    return "{\"ok\":false,\"error\":\"Backup file not found.\"}";
                byte[] bytes;
                try (java.io.InputStream in = new java.io.FileInputStream(f);
                     java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
                    byte[] buf = new byte[8192]; int n;
                    while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                    bytes = out.toByteArray();
                }
                return "{\"ok\":true,\"json\":" + org.json.JSONObject.quote(
                    new String(bytes, java.nio.charset.StandardCharsets.UTF_8)) + "}";
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"Could not read the backup file.\"}";
            }
        }
        @android.webkit.JavascriptInterface public String startUpdateDownload(String apkUrl) {
            try {
                if (apkUrl == null || !(apkUrl.startsWith("https://github.com/")
                        || apkUrl.startsWith("https://objects.githubusercontent.com/")
                        || apkUrl.startsWith("https://release-assets.githubusercontent.com/")))
                    return "{\"ok\":false,\"error\":\"Unexpected download URL.\"}";
                android.app.DownloadManager dm =
                    (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                android.app.DownloadManager.Request req =
                    new android.app.DownloadManager.Request(android.net.Uri.parse(apkUrl));
                req.setTitle("OddDough update");
                req.setDescription("Downloading the latest OddDough release.");
                req.setNotificationVisibility(
                    android.app.DownloadManager.Request.VISIBILITY_VISIBLE);
                req.setDestinationInExternalFilesDir(MainActivity.this,
                    android.os.Environment.DIRECTORY_DOWNLOADS, "odddough-update.apk");
                long id = dm.enqueue(req);
                getSharedPreferences("updater", MODE_PRIVATE).edit().putLong("downloadId", id).apply();
                return "{\"ok\":true}";
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"Could not start the download.\"}";
            }
        }
        @android.webkit.JavascriptInterface public String updateDownloadProgress() {
            try {
                long id = getSharedPreferences("updater", MODE_PRIVATE).getLong("downloadId", -1);
                if (id < 0) return "{\"status\":\"none\"}";
                android.app.DownloadManager dm =
                    (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                try (android.database.Cursor c = dm.query(
                        new android.app.DownloadManager.Query().setFilterById(id))) {
                    if (c == null || !c.moveToFirst()) return "{\"status\":\"none\"}";
                    int st = c.getInt(c.getColumnIndexOrThrow(
                        android.app.DownloadManager.COLUMN_STATUS));
                    long soFar = c.getLong(c.getColumnIndexOrThrow(
                        android.app.DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                    long total = c.getLong(c.getColumnIndexOrThrow(
                        android.app.DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                    String s = st == android.app.DownloadManager.STATUS_SUCCESSFUL ? "complete"
                        : st == android.app.DownloadManager.STATUS_FAILED ? "failed"
                        : st == android.app.DownloadManager.STATUS_PAUSED ? "paused" : "downloading";
                    return "{\"status\":\"" + s + "\",\"downloaded\":" + soFar
                        + ",\"total\":" + total + "}";
                }
            } catch (Exception e) { return "{\"status\":\"error\"}"; }
        }
        @android.webkit.JavascriptInterface public String canRequestInstalls() {
            if (Build.VERSION.SDK_INT < 26) return "{\"ok\":true}";
            return "{\"ok\":" + getPackageManager().canRequestPackageInstalls() + "}";
        }
        @android.webkit.JavascriptInterface public void openInstallSettings() {
            runOnUiThread(() -> {
                try {
                    startActivity(new android.content.Intent(
                        android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                        android.net.Uri.parse("package:" + getPackageName())));
                } catch (android.content.ActivityNotFoundException e) {
                    callback("cashCompassNotice",
                        "Open Android Settings and allow \"Install unknown apps\" for OddDough.");
                }
            });
        }
        @android.webkit.JavascriptInterface public String installUpdate() {
            // SIGNING GATE: Android installs an update only when the new APK is
            // signed with the SAME key as the installed app. CI currently signs
            // every build with a fresh ephemeral debug key, so until Alex
            // configures one stable signing key the system installer will
            // reject the update (INSTALL_FAILED_UPDATE_INCOMPATIBLE). This
            // flow is complete and correct — it is gated on that signing-key
            // decision, not on code.
            try {
                long id = getSharedPreferences("updater", MODE_PRIVATE).getLong("downloadId", -1);
                if (id < 0) return "{\"ok\":false,\"error\":\"No downloaded update found.\"}";
                android.app.DownloadManager dm =
                    (android.app.DownloadManager) getSystemService(DOWNLOAD_SERVICE);
                final android.net.Uri uri = dm.getUriForDownloadedFile(id);
                if (uri == null)
                    return "{\"ok\":false,\"error\":\"The downloaded file is gone. Download again.\"}";
                runOnUiThread(() -> {
                    try {
                        android.content.Intent intent =
                            new android.content.Intent(android.content.Intent.ACTION_VIEW);
                        intent.setDataAndType(uri, "application/vnd.android.package-archive");
                        intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK
                            | android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(intent);
                    } catch (Exception e) {
                        callback("cashCompassNotice", "Could not start the installer.");
                    }
                });
                return "{\"ok\":true}";
            } catch (Exception e) {
                return "{\"ok\":false,\"error\":\"Could not start the installer.\"}";
            }
        }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == NOTIFICATIONS) callback("cashCompassNotice", new Bridge().notificationsAllowed()
            ? "Bill reminders enabled." : "Notifications are blocked. Enable them in Android settings to receive reminders.");
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, android.content.Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (AppLock.onActivityResult(requestCode, resultCode)) return; // API 24-28 unlock flow
        if (requestCode == PICK_RECEIPT) {
            ValueCallback<android.net.Uri[]> cb = receiptCallback;
            receiptCallback = null;
            android.net.Uri[] uris = (resultCode == RESULT_OK && data != null && data.getData() != null)
                    ? new android.net.Uri[]{ data.getData() } : null;
            if (cb != null) cb.onReceiveValue(uris);
            // Receipt OCR: scan the picked image on-device and send text to the web form.
            if (uris != null) {
                final android.net.Uri imageUri = uris[0];
                new Thread(() -> {
                    try {
                        com.google.mlkit.vision.common.InputImage image =
                                com.google.mlkit.vision.common.InputImage.fromFilePath(MainActivity.this, imageUri);
                        com.google.mlkit.vision.text.TextRecognition
                                .getClient(new com.google.mlkit.vision.text.latin.TextRecognizerOptions.Builder().build())
                                .process(image)
                                .addOnSuccessListener(visionText -> {
                                    // Structured payload: full text plus blocks with size/position,
                                    // so the web form can tell the store name (big, top) from
                                    // payment artifacts like "VERIFIED BY PIN".
                                    StringBuilder sb = new StringBuilder();
                                    sb.append("{\"text\":").append(org.json.JSONObject.quote(visionText.getText()));
                                    sb.append(",\"blocks\":[");
                                    boolean first = true;
                                    for (com.google.mlkit.vision.text.Text.TextBlock b : visionText.getTextBlocks()) {
                                        if (!first) sb.append(",");
                                        first = false;
                                        android.graphics.Rect box = b.getBoundingBox();
                                        int h = box != null ? box.height() : 0;
                                        int y = box != null ? box.top : 0;
                                        sb.append("{\"t\":").append(org.json.JSONObject.quote(b.getText()));
                                        sb.append(",\"h\":").append(h).append(",\"y\":").append(y).append("}");
                                    }
                                    sb.append("]}");
                                    callback("cashCompassReceiptOCR", sb.toString());
                                })
                                .addOnFailureListener(e -> { /* OCR unavailable; manual entry still works */ });
                    } catch (Exception ignored) { /* unreadable image; manual entry still works */ }
                }, "cash-compass-ocr").start();
            }
            return;
        }
        if (requestCode != OPEN_CSV && requestCode != SAVE_CSV) return;
        final String export = pendingCSV;
        if (requestCode == SAVE_CSV) pendingCSV = null;
        if (resultCode != RESULT_OK || data == null || data.getData() == null) return;
        final android.net.Uri uri = data.getData();
        new Thread(() -> {
            try {
                if (requestCode == OPEN_CSV) {
                    try (java.io.InputStream in = getContentResolver().openInputStream(uri);
                         java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream()) {
                        if (in == null) throw new IOException();
                        byte[] buffer = new byte[8192]; int count;
                        while ((count = in.read(buffer)) != -1) {
                            if (out.size() + count > 2000000) throw new IOException("Choose a CSV smaller than 2 MB.");
                            out.write(buffer, 0, count);
                        }
                        callback("cashCompassCSV", out.toString("UTF-8"));
                    }
                } else {
                    if (export == null) throw new IOException("Export was interrupted. Please export again.");
                    try (java.io.OutputStream out = getContentResolver().openOutputStream(uri, "wt")) {
                        if (out == null) throw new IOException();
                        out.write(export.getBytes(java.nio.charset.StandardCharsets.UTF_8));
                    }
                    callback("cashCompassNotice", "CSV saved.");
                }
            } catch (Exception e) { callback("cashCompassNotice", e.getMessage() == null ? "Could not read or save this file." : e.getMessage()); }
        }, "cash-compass-files").start();
    }

    @Override protected void onDestroy() {
        if (app != null) {
            ((android.view.ViewGroup) app.getParent()).removeView(app);
            app.destroy();
        }
        super.onDestroy();
    }
}
