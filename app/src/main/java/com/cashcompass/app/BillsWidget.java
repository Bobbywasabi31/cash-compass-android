package com.cashcompass.app;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;

/** Home-screen widget (roadmap #85): next bills due. */
public class BillsWidget extends AppWidgetProvider {
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        HomeWidgets.renderBills(context, manager, ids);
    }
    @Override public void onEnabled(Context context) {
        HomeWidgets.schedule(context);
    }
}
