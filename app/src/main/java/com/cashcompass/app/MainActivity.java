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
                    if (name.equals("index.html") || name.equals("app.css") || name.equals("core.js") || name.equals("app.js")) {
                        try { return new WebResourceResponse(mime, "UTF-8", getAssets().open(name)); }
                        catch (IOException ignored) { /* Deny missing assets, with no network fallback. */ }
                    }
                }
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", null, new ByteArrayInputStream(new byte[0]));
            }
        });
        root.addView(app, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        root.requestApplyInsets();
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
    }
    public final class Bridge {
        @android.webkit.JavascriptInterface public String walletStatus() { return WalletNotifications.status(MainActivity.this, walletAccess()); }
        @android.webkit.JavascriptInterface public boolean walletEnable(boolean enabled) { return WalletNotifications.enable(MainActivity.this, enabled); }
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
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == NOTIFICATIONS) callback("cashCompassNotice", new Bridge().notificationsAllowed()
            ? "Bill reminders enabled." : "Notifications are blocked. Enable them in Android settings to receive reminders.");
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, android.content.Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
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
