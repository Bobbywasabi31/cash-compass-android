package com.cashcompass.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Home-screen widget (roadmap #12): safe-to-spend and days until payday. */
public class SafeToSpendWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        HomeWidgets.renderSafe(context, manager, ids);
    }
    @Override public void onEnabled(Context context) {
        HomeWidgets.schedule(context);
    }
}
