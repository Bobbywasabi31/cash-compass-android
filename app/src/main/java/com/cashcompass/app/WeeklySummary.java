package com.cashcompass.app;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import java.util.Calendar;

/** Weekly Sunday recap. The web app pushes precomputed summary text via the
 *  bridge on every save; this receiver only stores and posts that text, never
 *  raw transactions. Mirrors BillReminder's scheduling pattern. */
public class WeeklySummary extends BroadcastReceiver {
    private static final String CHECK = "com.cashcompass.app.WEEKLY_SUMMARY";
    private static final String CHANNEL = "weekly-summary";
    private static PendingIntent alarm(Context context) {
        return PendingIntent.getBroadcast(context, 18, new Intent(context, WeeklySummary.class).setAction(CHECK),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    /** Next Sunday 9:00 AM in millis. Pure function of now; unit-tested. */
    static long nextSunday(long nowMillis) {
        Calendar next = Calendar.getInstance();
        next.setTimeInMillis(nowMillis);
        next.set(Calendar.DAY_OF_WEEK, Calendar.SUNDAY);
        next.set(Calendar.HOUR_OF_DAY, 9); next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= nowMillis) next.add(Calendar.DAY_OF_YEAR, 7);
        return next.getTimeInMillis();
    }
    public static void schedule(Context context) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        manager.cancel(alarm(context));
        SharedPreferences prefs = context.getSharedPreferences("weekly", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) {
            context.getSystemService(NotificationManager.class).cancel(18); return;
        }
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextSunday(System.currentTimeMillis()), alarm(context));
    }
    @Override public void onReceive(Context context, Intent intent) {
        schedule(context);
        if (!CHECK.equals(intent.getAction())) return;
        SharedPreferences prefs = context.getSharedPreferences("weekly", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) return;
        String title = prefs.getString("title", "Weekly money recap");
        String text = prefs.getString("text", "");
        if (text == null || text.isEmpty()) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (!manager.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Weekly recap", NotificationManager.IMPORTANCE_DEFAULT));
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL) : new Notification.Builder(context);
        PendingIntent open = PendingIntent.getActivity(context, 18, new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        manager.notify(18, builder.setSmallIcon(com.cashcompass.app.R.drawable.ic_compass).setContentTitle(title)
            .setContentText(text).setStyle(new Notification.BigTextStyle().bigText(text))
            .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(open).setAutoCancel(true).build());
    }
}
