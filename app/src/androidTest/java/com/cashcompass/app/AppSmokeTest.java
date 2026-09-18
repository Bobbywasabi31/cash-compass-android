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
        for (String tab : new String[]{"plan", "goals", "coach", "home"}) {
            assertEquals("true", js("document.querySelector('[data-tab=" + tab + "]').click(); !!document.querySelector('h1')"));
        }
        assertEquals("true", js("document.querySelector('[data-action=add][data-kind=incomes]').click(); !!document.querySelector('[role=dialog]')"));
        assertEquals("true", js("cashCompassBack(); !document.querySelector('[role=dialog]')"));
        assertEquals("true", js("document.querySelector('[data-tab=profile]').click(); document.querySelector('[name=name]').value==='Android test'"));
        // Reload the actual bundled HTTPS origin and check persisted state rehydrates.
        activity.getActivity().runOnUiThread(() -> activity.getActivity().getAppWebView().reload());
        boolean restored = false;
        for (int i = 0; i < 60; i++) {
            if ("true".equals(js("document.body && document.body.textContent.includes('Hey, Android test.')"))) { restored = true; break; }
            Thread.sleep(500);
        }
        assertTrue("Saved profile did not survive reload", restored);
    }
}
