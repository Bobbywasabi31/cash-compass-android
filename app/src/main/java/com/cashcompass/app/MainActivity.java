package com.cashcompass.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
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
        app.setWebViewClient(new WebViewClient() {
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
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
    }

    private void handleBack() {
        app.evaluateJavascript("typeof window.cashCompassBack === 'function' && window.cashCompassBack()", handled -> {
            if (!"true".equals(handled)) finish();
        });
    }

    @Override public void onBackPressed() { handleBack(); }
    public WebView getAppWebView() { return app; }

    @Override protected void onDestroy() {
        if (app != null) {
            ((android.view.ViewGroup) app.getParent()).removeView(app);
            app.destroy();
        }
        super.onDestroy();
    }
}
