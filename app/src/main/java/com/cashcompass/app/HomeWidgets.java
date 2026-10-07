package com.cashcompass.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.BroadcastReceiver;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Shared scaffolding for the home-screen widgets (roadmap #12 safe-to-spend,
 * #85 upcoming bills). The web app pushes a compact JSON payload through
 * NativeBridge.syncWidgets() on every save; it is validated here, stored in
 * SharedPreferences, and rendered into both widgets. A daily alarm re-renders
 * so "days until payday" and overdue counts stay fresh without opening the
 * app. Stored data is local-only and never leaves the device; note that
 * widget contents are visible on the home screen without unlocking the app.
 */
public class HomeWidgets extends BroadcastReceiver {
    private static final String PREFS = "widgets";
    private static final String KEY = "payload";
    private static final String DAILY = "com.cashcompass.app.WIDGETS_DAILY";
    private static final int MAX_BILLS = 3;
    private static final int MAX_JSON = 8000;

    /** Validates the web payload, stores it, and renders both widgets. */
    public static void store(Context context, String json) {
        if (json == null || json.length() > MAX_JSON) return;
        try {
            JSONObject in = new JSONObject(json);
            JSONObject out = new JSONObject();
            out.put("safe", in.isNull("safe") ? JSONObject.NULL : in.getDouble("safe"));
            String payday = in.isNull("paydayDate") ? null : in.getString("paydayDate");
            if (payday != null && !payday.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return;
            out.put("paydayDate", payday == null ? JSONObject.NULL : payday);
            out.put("daysUntilPayday", in.isNull("daysUntilPayday") ? JSONObject.NULL : in.getInt("daysUntilPayday"));
            JSONArray bills = in.optJSONArray("bills");
            if (bills == null || bills.length() > MAX_BILLS) return;
            JSONArray clean = new JSONArray();
            for (int i = 0; i < bills.length(); i++) {
                JSONObject b = bills.getJSONObject(i);
                String date = b.getString("date");
                if (!date.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}")) return;
                String label = b.optString("label", "Bill");
                clean.put(new JSONObject()
                    .put("label", label.substring(0, Math.min(40, label.length())))
                    .put("date", date)
                    .put("amount", b.getDouble("amount"))
                    .put("daysOut", b.getInt("daysOut")));
            }
            out.put("bills", clean);
            out.put("overdue", Math.max(0, in.optInt("overdue", 0)));
            out.put("storedOn", dateString(Calendar.getInstance()));
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, out.toString()).apply();
            schedule(context);
            updateAll(context);
        } catch (Exception e) { /* keep the last good payload */ }
    }

    /** Renders both widgets from the stored payload (no-op when none exist). */
    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        renderSafe(context, manager, manager.getAppWidgetIds(new ComponentName(context, SafeToSpendWidget.class)));
        renderBills(context, manager, manager.getAppWidgetIds(new ComponentName(context, BillsWidget.class)));
    }

    static void renderSafe(Context context, AppWidgetManager manager, int[] ids) {
        if (ids == null || ids.length == 0) return;
        JSONObject p = payload(context);
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_safe_to_spend);
            if (p == null) {
                views.setTextViewText(R.id.widget_safe_amount, "—");
                views.setTextViewText(R.id.widget_safe_sub, "Open OddDough to set up");
            } else {
                double safe = p.isNull("safe") ? Double.NaN : p.optDouble("safe", Double.NaN);
                views.setTextViewText(R.id.widget_safe_amount,
                    Double.isNaN(safe) ? "Add payday" : money(safe));
                int days = p.isNull("daysUntilPayday") ? -1
                    : Math.max(0, p.optInt("daysUntilPayday", 0) - daysPassed(p));
                String sub = days < 0 ? "Add payday in the app"
                    : days == 0 ? "Payday is today"
                    : days == 1 ? "1 day until payday" : days + " days until payday";
                views.setTextViewText(R.id.widget_safe_sub, sub);
            }
            views.setOnClickPendingIntent(R.id.widget_safe_root, openApp(context));
            manager.updateAppWidget(id, views);
        }
    }

    static void renderBills(Context context, AppWidgetManager manager, int[] ids) {
        if (ids == null || ids.length == 0) return;
        JSONObject p = payload(context);
        int[] rows = { R.id.widget_bill_1, R.id.widget_bill_2, R.id.widget_bill_3 };
        for (int id : ids) {
            RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_bills);
            if (p == null) {
                views.setTextViewText(R.id.widget_bill_1, "Open OddDough to set up");
                for (int i = 1; i < rows.length; i++) views.setViewVisibility(rows[i], android.view.View.GONE);
            } else {
                int passed = daysPassed(p);
                JSONArray bills = p.optJSONArray("bills");
                int shown = bills == null ? 0 : bills.length();
                // Shown bills all had date >= today when stored, so any now with
                // daysOut - passed < 0 became overdue since storing; the stored
                // overdue count covers the rest.
                int newlyOverdue = 0;
                for (int i = 0; i < rows.length; i++) {
                    if (i >= shown) { views.setViewVisibility(rows[i], android.view.View.GONE); continue; }
                    views.setViewVisibility(rows[i], android.view.View.VISIBLE);
                    try {
                        JSONObject b = bills.getJSONObject(i);
                        int left = b.getInt("daysOut") - passed;
                        String when = left < 0 ? "overdue" : left == 0 ? "today" : "in " + left + "d";
                        if (left < 0) newlyOverdue++;
                        views.setTextViewText(rows[i],
                            b.getString("label") + " · " + money(b.getDouble("amount")) + " · " + when);
                    } catch (Exception e) { views.setViewVisibility(rows[i], android.view.View.GONE); }
                }
                int overdueNow = p.optInt("overdue", 0) + newlyOverdue;
                views.setTextViewText(R.id.widget_bills_sub,
                    overdueNow > 0 ? overdueNow + " overdue" : shown == 0 ? "Nothing due soon" : "");
            }
            views.setOnClickPendingIntent(R.id.widget_bills_root, openApp(context));
            manager.updateAppWidget(id, views);
        }
    }

    /** Daily re-render so day-relative labels stay correct. Reschedules itself. */
    public static void schedule(Context context) {
        AlarmManager manager = context.getSystemService(AlarmManager.class);
        manager.cancel(alarm(context));
        Calendar next = Calendar.getInstance();
        next.set(Calendar.HOUR_OF_DAY, 6); next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 0); next.set(Calendar.MILLISECOND, 0);
        if (next.getTimeInMillis() <= System.currentTimeMillis()) next.add(Calendar.DAY_OF_YEAR, 1);
        manager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next.getTimeInMillis(), alarm(context));
    }

    private static PendingIntent alarm(Context context) {
        return PendingIntent.getBroadcast(context, 18, new Intent(context, HomeWidgets.class).setAction(DAILY),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static PendingIntent openApp(Context context) {
        return PendingIntent.getActivity(context, 71, new Intent(context, MainActivity.class),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    @Override public void onReceive(Context context, Intent intent) {
        schedule(context);
        updateAll(context);
    }

    private static JSONObject payload(Context context) {
        SharedPreferences prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String stored = prefs.getString(KEY, null);
        if (stored == null) return null;
        try { return new JSONObject(stored); } catch (Exception e) { return null; }
    }

    /** Whole days between the stored date and today, for day-rollover correction. */
    private static int daysPassed(JSONObject p) {
        try {
            SimpleDateFormat fmt = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
            long stored = fmt.parse(p.getString("storedOn")).getTime();
            long today = fmt.parse(dateString(Calendar.getInstance())).getTime();
            return (int) Math.max(0, (today - stored) / 86400000L);
        } catch (Exception e) { return 0; }
    }

    private static String dateString(Calendar cal) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(cal.getTime());
    }

    private static String money(double dollars) {
        return NumberFormat.getCurrencyInstance(Locale.US).format(dollars);
    }
}
