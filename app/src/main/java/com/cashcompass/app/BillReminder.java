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
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;

/** One inexact daily check; stores dates only, never merchant names or amounts. */
public class BillReminder extends BroadcastReceiver {
    private static final String CHECK = "com.cashcompass.app.CHECK_BILLS";
    private static final String CHANNEL = "bill-reminders";
    private static PendingIntent alarm(Context context) {
        return PendingIntent.getBroadcast(context, 17, new Intent(context, BillReminder.class).setAction(CHECK),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    public static void schedule(Context context) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        manager.cancel(alarm(context));
        SharedPreferences prefs = context.getSharedPreferences("reminders", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) {
            context.getSystemService(NotificationManager.class).cancel(17); return;
        }
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, 9); next.set(Calendar.MINUTE, 0); next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), alarm(context));
    }
    static int dueCount(String json, String through) {
        try {
            JSONArray dates = new JSONArray(json); int count = 0;
            for (int i = 0; i < dates.length(); i++) if (dates.getString(i).compareTo(through) <= 0) count++;
            return count;
        } catch (org.json.JSONException e) { return 0; }
    }
    @Override public void onReceive(Context context, Intent intent) {
        schedule(context);
        if (!CHECK.equals(intent.getAction())) return;
        SharedPreferences prefs = context.getSharedPreferences("reminders", Context.MODE_PRIVATE);
        if (!prefs.getBoolean("enabled", false)) return;
        Calendar through = Calendar.getInstance(); through.add(Calendar.DAY_OF_YEAR, 3);
        int count = dueCount(prefs.getString("dates", "[]"), new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(through.getTime()));
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (count == 0) { manager.cancel(17); return; }
        if (!manager.areNotificationsEnabled()) return;
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)
            != android.content.pm.PackageManager.PERMISSION_GRANTED) return;
        if (Build.VERSION.SDK_INT >= 26) manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Bill reminders", NotificationManager.IMPORTANCE_DEFAULT));
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL) : new Notification.Builder(context);
        PendingIntent open = PendingIntent.getActivity(context, 17, new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        manager.notify(17, builder.setSmallIcon(com.cashcompass.app.R.drawable.ic_compass).setContentTitle("Review your upcoming bills")
            .setContentText("You have bills due soon or overdue. Open Cash Compass to review.")
            .setVisibility(Notification.VISIBILITY_PRIVATE).setContentIntent(open).setAutoCancel(true).build());
    }
}
