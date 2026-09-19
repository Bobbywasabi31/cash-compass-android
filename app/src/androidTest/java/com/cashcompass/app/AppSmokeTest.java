package com.cashcompass.app;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.rule.ActivityTestRule;
import org.junit.Rule;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class AppSmokeTest {
    @Rule public ActivityTestRule<MainActivity> activity = new ActivityTestRule<>(MainActivity.class);
    private String js(String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        activity.getActivity().runOnUiThread(() -> activity.getActivity().getAppWebView().evaluateJavascript(script, result -> { value.set(result); done.countDown(); }));
        assertTrue("JavaScript did not respond", done.await(10, TimeUnit.SECONDS));
        return value.get();
    }
    @Test public void launchNavigateSaveReloadAndBack() throws Exception {
        boolean ready = false;
        for (int i = 0; i < 60; i++) {
            if ("true".equals(js("!!document.querySelector('[data-tab=profile]')"))) { ready = true; break; }
            Thread.sleep(500);
        }
        assertTrue("Offline app did not render", ready);
        assertEquals("true", js("document.body.textContent.includes('Add payday')"));
        assertEquals("true", js("document.querySelector('[data-tab=profile]').click(); !!document.querySelector('#profileForm')"));
        assertEquals("true", js("document.querySelector('[name=name]').value='Android test'; document.querySelector('[name=balance]').value='250.50'; document.querySelector('#profileForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); JSON.parse(localStorage.getItem('cash-compass-v2')).profile.balance===250.5"));
        for (String tab : new String[]{"plan", "transactions", "budgets", "profile", "goals", "profile", "coach", "home"}) {
            assertEquals("true", js("document.querySelector('[data-tab=" + tab + "]').click(); !!document.querySelector('h1')"));
        }
        assertEquals("true", js("document.querySelector('[data-action=add][data-kind=incomes]').click(); !!document.querySelector('[role=dialog]')"));
        assertEquals("true", js("cashCompassBack(); !document.querySelector('[role=dialog]')"));
        assertEquals("true", js("document.querySelector('[data-tab=profile]').click(); document.querySelector('[name=name]').value==='Android test'"));
        assertEquals("true", js("document.querySelector('[data-tab=transactions]').click(); document.querySelector('[data-action=add]').click(); document.querySelector('[name=label]').value='Groceries test'; document.querySelector('[name=amount]').value='10'; document.querySelector('[name=category]').value='Groceries'; document.querySelector('#transactionForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); JSON.parse(localStorage.getItem('cash-compass-v2')).profile.balance===240.5"));
        assertEquals("true", js("document.querySelector('[data-tab=budgets]').click(); document.querySelector('[data-action=add]').click(); document.querySelector('[name=amount]').value='100'; document.querySelector('#budgetForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); document.body.textContent.includes('$90.00 remaining')"));
        assertEquals("true", js("document.querySelector('[data-tab=plan]').click(); document.querySelector('[data-action=add][data-kind=bills]').click(); document.querySelector('[name=label]').value='Monthly phone'; document.querySelector('[name=amount]').value='20'; document.querySelector('[name=repeat]').value='monthly'; document.querySelector('#entryForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); document.querySelector('[data-settle][data-kind=bills]').click(); document.querySelector('[data-confirm=adjust]').click(); JSON.parse(localStorage.getItem('cash-compass-v2')).transactions.length===2 && JSON.parse(localStorage.getItem('cash-compass-v2')).profile.balance===220.5"));
        // Reload the actual bundled HTTPS origin and check persisted state rehydrates.
        activity.getActivity().runOnUiThread(() -> activity.getActivity().getAppWebView().reload());
        boolean restored = false;
        for (int i = 0; i < 60; i++) {
            if ("true".equals(js("document.body && document.body.textContent.includes('Hey, Android test.')"))) { restored = true; break; }
            Thread.sleep(500);
        }
        assertTrue("Saved profile did not survive reload", restored);
        assertEquals("true", js("document.querySelector('[data-tab=transactions]').click(); document.body.textContent.includes('Groceries test') && document.body.textContent.includes('Monthly phone')"));
    }
}
