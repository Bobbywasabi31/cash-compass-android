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
        assertEquals("true", js("document.querySelector('[name=name]').value='Android test'; document.querySelector('#profileForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); JSON.parse(readRaw()).profile.name==='Android test'"));
        assertEquals("true", js("document.querySelector('[data-tab=accounts]').click(); document.querySelector('[data-edit]').click(); document.querySelector('[name=balance]').value='250.50'; document.querySelector('#accountForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); JSON.parse(readRaw()).profile.balance===250.5"));
        assertEquals("true", js("typeof NativeBridge.notificationsAllowed()==='boolean'"));
        java.text.SimpleDateFormat df = new java.text.SimpleDateFormat("yyyy-MM-dd", java.util.Locale.US);
        java.util.Calendar cc = java.util.Calendar.getInstance();
        String today = df.format(cc.getTime());
        cc.add(java.util.Calendar.DAY_OF_YEAR, 5); String in5 = df.format(cc.getTime());
        assertEquals(1, BillReminder.dueCount("[{\"date\":\"" + today + "\",\"days\":0},{\"date\":\"" + in5 + "\",\"days\":0}]"));
        assertEquals(2, BillReminder.dueCount("[{\"date\":\"" + today + "\",\"days\":0},{\"date\":\"" + in5 + "\",\"days\":7}]"));
        assertEquals(1, BillReminder.dueCount("[\"" + today + "\",\"" + in5 + "\"]"));
        for (String tab : new String[]{"investments", "forecasting", "cashflow", "profile", "reports", "plan", "transactions", "budgets", "profile", "goals", "profile", "coach", "home"}) {
            assertEquals("true", js("document.querySelector('[data-tab=" + tab + "]').click(); !!document.querySelector('h1')"));
        }
        assertEquals("true", js("document.querySelector('[data-action=add][data-kind=incomes]').click(); !!document.querySelector('[role=dialog]')"));
        assertEquals("true", js("cashCompassBack(); !document.querySelector('[role=dialog]')"));
        assertEquals("true", js("document.querySelector('[data-tab=profile]').click(); document.querySelector('[name=name]').value==='Android test'"));
        assertEquals("true", js("document.querySelector('[data-tab=transactions]').click(); document.querySelector('[data-action=add]').click(); document.querySelector('[name=label]').value='Groceries test'; document.querySelector('[name=amount]').value='10'; document.querySelector('[name=category]').value='Groceries'; document.querySelector('#transactionForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); JSON.parse(readRaw()).profile.balance===240.5"));
        assertEquals("true", js("document.querySelector('[data-tab=budgets]').click(); document.querySelector('[data-action=add]').click(); document.querySelector('[name=amount]').value='100'; document.querySelector('#budgetForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); document.body.textContent.includes('$90.00 remaining')"));
        assertEquals("true", js("document.querySelector('[data-tab=plan]').click(); document.querySelector('[data-action=add][data-kind=bills]').click(); document.querySelector('[name=date]').value=CashCore.localDate(); document.querySelector('[name=label]').value='Monthly phone'; document.querySelector('[name=amount]').value='20'; document.querySelector('[name=repeat]').value='monthly'; document.querySelector('#entryForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); document.querySelector('[data-settle][data-kind=bills]').click(); document.querySelector('[data-confirm=adjust]').click(); JSON.parse(readRaw()).transactions.length===2 && JSON.parse(readRaw()).profile.balance===220.5"));
        assertEquals("true", js("document.querySelector('[data-tab=investments]').click(); document.querySelector('[data-action=add]').click(); document.querySelector('[name=symbol]').value='EXAMPLE'; document.querySelector('[name=label]').value='Example holding'; document.querySelector('[name=quantity]').value='2'; document.querySelector('[name=price]').value='10'; document.querySelector('[name=cost]').value='8'; document.querySelector('#holdingForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); JSON.parse(readRaw()).holdings.length===1 && JSON.parse(readRaw()).profile.balance===220.5"));
        assertEquals("true", js("document.querySelector('[data-tab=profile]').click(); document.querySelector('[data-tab=wallet]').click(); document.querySelector('#walletSettingsForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); JSON.parse(NativeBridge.walletStatus()).enabled"));
        long purchaseTime = System.currentTimeMillis() + 100;
        android.app.Notification purchase = new android.app.Notification.Builder(activity.getActivity(), "wallet-smoke")
            .setSmallIcon(android.R.drawable.ic_dialog_info).setContentTitle("123 CORNER MARKET")
            .setContentText("$12.34 with Example Consumer\nDebit Card ••0000").setWhen(purchaseTime).build();
        WalletNotifications.capture(activity.getActivity(), new android.service.notification.StatusBarNotification(
            "com.google.android.apps.walletnfcrel", "com.google.android.apps.walletnfcrel", 42, "smoke", 1000, 0, 0,
            purchase, android.os.Process.myUserHandle(), purchaseTime + 1));
        // Synthetic capture exercises the native queue and review bridge without granting real notification access.
        assertEquals("true", js("document.querySelector('[data-action=wallet-refresh]').click(); JSON.parse(readRaw()).wallet.inbox.length===1 && JSON.parse(NativeBridge.walletStatus()).queue.length===0"));
        assertEquals("true", js("document.querySelector('[data-wallet-review]').click(); document.querySelector('#walletReviewForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); JSON.parse(readRaw()).transactions.some(t=>t.walletId && t.label==='123 CORNER MARKET') && JSON.parse(readRaw()).profile.balance===208.16"));
        assertEquals("true", js("document.querySelector('[data-action=wallet-pause]').click(); !JSON.parse(NativeBridge.walletStatus()).enabled"));
        // Reload the actual bundled HTTPS origin and check persisted state rehydrates.
        activity.getActivity().runOnUiThread(() -> activity.getActivity().getAppWebView().reload());
        boolean restored = false;
        for (int i = 0; i < 60; i++) {
            if ("true".equals(js("document.body && document.body.textContent.includes('Android test.')"))) { restored = true; break; }
            Thread.sleep(500);
        }
        assertTrue("Saved profile did not survive reload", restored);
        assertEquals("true", js("document.querySelector('[data-tab=transactions]').click(); document.body.textContent.includes('Groceries test') && document.body.textContent.includes('Monthly phone')"));
        // The complete sample is opt-in and populates the installed app's main views.
        assertEquals("true", js("document.querySelector('[data-tab=profile]').click(); document.querySelector('[data-action=demo]').click();" +
            "!!document.querySelector('[role=dialog]') && !JSON.parse(readRaw()).demo"));
        assertEquals("true", js("document.querySelector('[data-confirm=yes]').click();" +
            "JSON.parse(readRaw()).demo && !JSON.parse(NativeBridge.walletStatus()).enabled && !state.reminders && state.profile.balance===1500"));
        for (String section : new String[]{"home", "accounts", "transactions", "budgets", "plan", "goals", "investments", "forecasting", "cashflow", "reports", "coach", "profile"}) {
            assertEquals("true", js("document.querySelector('[data-tab=" + section + "]').click(); !!document.querySelector('h1') && document.body.textContent.includes('Sample plan')"));
        }
        assertEquals("true", js("document.querySelector('[data-tab=cashflow]').click(); !!document.querySelector('.sankey .flow-chart')"));
        assertEquals("true", js("document.querySelector('[data-tab=goals]').click(); document.querySelector('[data-goal-view=debt]').click(); document.body.textContent.includes('Example Credit Card')"));
        assertEquals("true", js("document.querySelector('[data-tab=profile]').click(); document.querySelector('[data-tab=wallet]').click();" +
            "document.querySelectorAll('[data-wallet-review]').length===2 && !document.querySelector('#walletSettingsForm')"));
        assertEquals("true", js("document.querySelector('[data-wallet-review]').click(); document.querySelector('#walletReviewForm [name=category]').value='Dining';" +
            "document.querySelector('#walletReviewForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})); state.wallet.inbox.length===1 && state.demo && !JSON.parse(NativeBridge.walletStatus()).enabled"));
        assertEquals("true", js("CashCore.normalize(JSON.parse(readRaw())).holdings.length===3 && state.balanceHistory.length===12 && state.lifeEvents.length===3"));
        // Quick-add and receipt attachments (roadmap #10, #35).
        assertEquals("true", js("document.querySelector('[data-tab=home]').click(); document.querySelector('[data-action=quick-add]').click(); !!document.querySelector('#quickAddForm')"));
        assertEquals("true", js("document.querySelector('#quickAddForm [name=amount]').value='12.50'; document.querySelector('.quick-cat[data-cat=Food]').click(); state.transactions.some(t=>t.category==='Food' && t.amount===12.50)"));
        assertEquals("true", js("const tx=CashCore.transaction({id:'rt1',label:'Receipt test',amount:9.99,date:CashCore.localDate(),type:'expense',category:'Food',receipt:'data:image/png;base64,iVBORw0KGgo='}); tx.receipt==='data:image/png;base64,iVBORw0KGgo=' && CashCore.transaction({id:'rt2',label:'Too big',amount:1,date:CashCore.localDate(),type:'expense',category:'Food',receipt:'x'.repeat(3000000)}).receipt===''"));
    }
}
