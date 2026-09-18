package com.cashcompass.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Bundle;
import android.view.Window;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    @SuppressLint("SetJavaScriptEnabled")
    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("#F8F7F4"));
        window.setNavigationBarColor(Color.parseColor("#F8F7F4"));

        WebView app = new WebView(this);
        WebSettings settings = app.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setTextZoom(100);
        app.setWebViewClient(new WebViewClient());
        app.setWebChromeClient(new WebChromeClient());
        app.setBackgroundColor(Color.parseColor("#F8F7F4"));
        app.loadUrl("file:///android_asset/index.html");
        setContentView(app);
    }
}
