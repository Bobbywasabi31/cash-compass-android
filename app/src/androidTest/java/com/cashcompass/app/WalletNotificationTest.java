package com.cashcompass.app;

import android.app.Notification;
import android.content.Context;
import android.os.UserHandle;
import android.service.notification.StatusBarNotification;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONArray;
import org.json.JSONObject;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class WalletNotificationTest {
    private final Context c = InstrumentationRegistry.getInstrumentation().getTargetContext();
    private StatusBarNotification event(String source, String text, long when, boolean summary) {
        Notification n = new Notification.Builder(c, "wallet-test").setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("Google Wallet").setContentText(text).setWhen(when).setGroupSummary(summary).build();
        return new StatusBarNotification(source, source, 7, "purchase", 1000, 0, 0, n, android.os.Process.myUserHandle(), when + 1);
    }
    private JSONArray queue() throws Exception { return new JSONObject(WalletNotifications.status(c, true)).getJSONArray("queue"); }
    @Test public void filtersSourcesAndPersistsIdempotentQueue() throws Exception {
        WalletNotifications.reset(c);
        long now = System.currentTimeMillis() + 100;
        StatusBarNotification purchase = event("com.google.android.apps.walletnfcrel", "You paid $12.34 at Example Market", now, false);
        WalletNotifications.capture(c, purchase); assertEquals(0, queue().length());
        assertTrue(WalletNotifications.enable(c, true));
        WalletNotifications.capture(c, event("example.other.app", "You paid $12.34 at Example Market", now, false));
        WalletNotifications.capture(c, event("com.google.android.gms", "You paid $12.34 at Example Market", now, false));
        WalletNotifications.capture(c, event("com.google.android.apps.walletnfcrel", "Two purchases", now, true));
        assertEquals(0, queue().length());
        WalletNotifications.capture(c, purchase); WalletNotifications.capture(c, purchase); assertEquals(1, queue().length());
        JSONArray first = queue();
        WalletNotifications.capture(c, event("com.google.android.apps.walletnfcrel", "You paid $15.34 at Example Market", now, false));
        assertEquals(1, queue().length());
        // An acknowledgment of the old revision must not erase a concurrent update.
        assertTrue(WalletNotifications.acknowledge(c, first.toString())); assertEquals(1, queue().length());
        JSONArray revised = queue(); assertTrue(WalletNotifications.acknowledge(c, revised.toString())); assertEquals(0, queue().length());
        WalletNotifications.capture(c, event("com.google.android.apps.walletnfcrel", "You paid $15.34 at Example Market", now, false));
        assertEquals(0, queue().length());
        WalletNotifications.enable(c, false); WalletNotifications.capture(c, event("com.google.android.apps.walletnfcrel", "You paid $3 at Other Market", now + 1000, false));
        assertEquals(0, queue().length());
        assertTrue(WalletNotifications.accepts("com.google.android.gms", "Google Wallet"));
        assertFalse(WalletNotifications.accepts("com.google.android.gms", "Security"));
        WalletNotifications.reset(c);
    }
}
