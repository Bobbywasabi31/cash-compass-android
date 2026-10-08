package com.cashcompass.app;

import android.app.Notification;
import android.content.Context;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.service.notification.NotificationListenerService;
import android.service.notification.StatusBarNotification;
import org.json.JSONArray;
import org.json.JSONObject;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.LinkedHashSet;

/** Local, opt-in capture. No notification is dismissed, modified, or sent elsewhere. */
public class WalletNotifications extends NotificationListenerService {
    static final String PREFS = "wallet-import";
    static final int LIMIT = 200;
    static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }
    static String text(Bundle extras, String key) {
        CharSequence value = extras.getCharSequence(key);
        return value == null ? "" : value.toString().substring(0, Math.min(2000, value.length()));
    }
    static boolean accepts(String source, String attribution) {
        return "com.google.android.apps.walletnfcrel".equals(source)
            || ("com.google.android.gms".equals(source)
                && ("Google Wallet".equalsIgnoreCase(attribution.trim()) || "Google Pay".equalsIgnoreCase(attribution.trim())));
    }
    /**
     * Bank-app allowlist for roadmap #40. Package names verified against Google Play
     * 2026-10-07; only these exact packages are eligible, and only when the user
     * turns bank alerts on separately from Wallet capture.
     */
    static final java.util.Set<String> BANK_SOURCES = java.util.Collections.unmodifiableSet(new java.util.LinkedHashSet<>(java.util.Arrays.asList(
        "com.chase.sig.android",              // Chase Mobile
        "com.infonow.bofa",                   // Bank of America Mobile Banking
        "com.wf.wellsfargomobile",            // Wells Fargo Mobile
        "com.citi.citimobile",                // Citi Mobile
        "com.konylabs.capitalone",            // Capital One Mobile
        "com.usbank.mobilebanking",            // U.S. Bank Mobile Banking
        "com.discoverfinancial.mobile",       // Discover Mobile
        "com.pnc.ecommerce.mobile",           // PNC Mobile
        "com.navyfederal.android",            // Navy Federal Credit Union
        "com.americanexpress.android.acctsvcs.us" // Amex (US)
    )));
    static boolean isBankSource(String source) { return source != null && BANK_SOURCES.contains(source); }
    static String hash(String value) throws Exception {
        byte[] bytes = MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        StringBuilder out = new StringBuilder();
        for (byte b : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
        return out.toString();
    }
    @Override public void onNotificationPosted(StatusBarNotification sbn) { capture(this, sbn); }
    // Deliberately do not replay all active notifications when access is first enabled.
    static synchronized void capture(Context c, StatusBarNotification sbn) {
        SharedPreferences p = prefs(c);
        if (sbn == null) return;
        String source = sbn.getPackageName();
        String kind;
        if (isBankSource(source)) {
            if (!p.getBoolean("bankEnabled", false)) return; // separate opt-in, off by default
            kind = "bank";
        } else if ("com.google.android.apps.walletnfcrel".equals(source) || "com.google.android.gms".equals(source)) {
            if (!p.getBoolean("enabled", false)) return;
            kind = "wallet";
        } else return;
        Notification n = sbn.getNotification();
        if (n == null || n.extras == null || (n.flags & Notification.FLAG_GROUP_SUMMARY) != 0) return;
        try {
            if ("wallet".equals(kind) && !accepts(source, text(n.extras, Notification.EXTRA_SUB_TEXT))) return;
            if (sbn.getPostTime() < p.getLong("since", Long.MAX_VALUE)) return;
            String title = text(n.extras, Notification.EXTRA_TITLE);
            String body = text(n.extras, Notification.EXTRA_BIG_TEXT);
            if (body.isEmpty()) body = text(n.extras, Notification.EXTRA_TEXT);
            if (body.isEmpty()) {
                CharSequence[] lines = n.extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES);
                if (lines != null) {
                    StringBuilder b = new StringBuilder();
                    for (CharSequence line : lines) if (line != null && b.length() < 2000) b.append(line).append('\n');
                    body = b.substring(0, Math.min(2000, b.length()));
                }
            }
            if (title.isEmpty() && body.isEmpty()) return;
            long stamp = n.when > 0 && n.when <= sbn.getPostTime() + 60000 ? n.when : sbn.getPostTime();
            String id = hash(source + "|" + sbn.getKey() + "|" + stamp);
            String revision = hash(title + "\n" + body);
            String receipt = id + ":" + revision;
            JSONArray seen = new JSONArray(p.getString("seen", "[]"));
            for (int i = 0; i < seen.length(); i++) if (receipt.equals(seen.getString(i))) return;
            JSONArray queue = new JSONArray(p.getString("queue", "[]")), next = new JSONArray();
            int dropped = p.getInt("dropped", 0);
            for (int i = 0; i < queue.length(); i++) {
                JSONObject item = queue.getJSONObject(i);
                if (id.equals(item.getString("id"))) {
                    if (revision.equals(item.getString("revision"))) return;
                    continue;
                }
                if (System.currentTimeMillis() - item.getLong("postedAt") > 30L * 86400000) { dropped++; continue; }
                next.put(item);
            }
            if (next.length() >= LIMIT) {
                p.edit().putInt("dropped", dropped + 1).commit();
                return; // Never overwrite an unreviewed purchase when the inbox is full.
            }
            next.put(new JSONObject().put("id", id).put("revision", revision).put("kind", kind).put("source", source)
                .put("title", title).put("text", body).put("postedAt", stamp));
            p.edit().putString("queue", next.toString()).putInt("dropped", dropped).putBoolean("error", false).commit();
        } catch (Exception ignored) {
            p.edit().putBoolean("error", true).commit(); // No purchase text in logs.
        }
    }
    static synchronized String status(Context c, boolean granted) {
        SharedPreferences p = prefs(c);
        try {
            return new JSONObject().put("enabled", p.getBoolean("enabled", false)).put("granted", granted)
                .put("bankEnabled", p.getBoolean("bankEnabled", false))
                .put("dropped", p.getInt("dropped", 0)).put("error", p.getBoolean("error", false))
                .put("queue", new JSONArray(p.getString("queue", "[]"))).toString();
        } catch (Exception e) { return "{\"enabled\":false,\"error\":true,\"queue\":[]}"; }
    }
    static synchronized boolean enable(Context c, boolean enabled) {
        SharedPreferences p = prefs(c);
        SharedPreferences.Editor e = p.edit().putBoolean("enabled", enabled);
        if (enabled && !p.getBoolean("enabled", false)) e.putLong("since", System.currentTimeMillis());
        return e.commit();
    }
    /** Bank alerts are a separate opt-in so enabling Wallet capture never silently widens it. */
    static synchronized boolean bankEnable(Context c, boolean enabled) {
        SharedPreferences p = prefs(c);
        SharedPreferences.Editor e = p.edit().putBoolean("bankEnabled", enabled);
        if (enabled && !p.getBoolean("bankEnabled", false) && !p.contains("since")) e.putLong("since", System.currentTimeMillis());
        return e.commit();
    }
    static synchronized boolean acknowledge(Context c, String json) {
        if (json == null || json.length() > 60000) return false;
        try {
            SharedPreferences p = prefs(c);
            JSONArray ack = new JSONArray(json), queue = new JSONArray(p.getString("queue", "[]"));
            LinkedHashSet<String> keys = new LinkedHashSet<>(), seen = new LinkedHashSet<>();
            if (ack.length() > LIMIT) return false;
            for (int i = 0; i < ack.length(); i++) {
                JSONObject x = ack.getJSONObject(i);
                keys.add(x.getString("id") + ":" + x.getString("revision"));
            }
            JSONArray old = new JSONArray(p.getString("seen", "[]"));
            for (int i = 0; i < old.length(); i++) seen.add(old.getString(i));
            JSONArray next = new JSONArray();
            for (int i = 0; i < queue.length(); i++) {
                JSONObject x = queue.getJSONObject(i);
                String key = x.getString("id") + ":" + x.getString("revision");
                if (keys.contains(key)) seen.add(key); else next.put(x);
            }
            while (seen.size() > 2000) seen.remove(seen.iterator().next());
            return p.edit().putString("queue", next.toString()).putString("seen", new JSONArray(seen).toString()).commit();
        } catch (Exception e) { return false; }
    }
    static synchronized boolean reset(Context c) { return prefs(c).edit().clear().commit(); }
}
