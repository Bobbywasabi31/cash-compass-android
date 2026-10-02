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
public class CashFlowSankeyTest {
    @Rule public ActivityTestRule<MainActivity> activity = new ActivityTestRule<>(MainActivity.class);

    private String js(String script) throws Exception {
        CountDownLatch done = new CountDownLatch(1);
        AtomicReference<String> value = new AtomicReference<>();
        activity.getActivity().runOnUiThread(() -> activity.getActivity().getAppWebView().evaluateJavascript(script, result -> {
            value.set(result); done.countDown();
        }));
        assertTrue("JavaScript did not respond", done.await(10, TimeUnit.SECONDS));
        return value.get();
    }

    @Test public void sankeyFiltersAndDetailsRenderInWebView() throws Exception {
        boolean ready = false;
        for (int i = 0; i < 60; i++) {
            if ("true".equals(js("!!document.querySelector('[data-tab=cashflow]')"))) { ready = true; break; }
            Thread.sleep(500);
        }
        assertTrue("Offline app did not render", ready);
        // A read-only chart fixture; restore the in-memory plan and never replace stored data.
        String backup = js("JSON.stringify(state)");
        try {
            assertEquals("true", js("state=CashCore.blank(); CashCore.ensureAccounts(state); state.accounts.push({id:'card',label:'Card',type:'credit',balance:0});" +
                "state.transactions=[{type:'income',amount:100,category:'Pay',label:'Work',accountId:'cash',date:'2026-01-01'}," +
                "{type:'expense',amount:90,category:'Housing',label:'Home',accountId:'cash',date:'2026-01-31'}," +
                "{type:'expense',amount:1,category:'Coffee',label:'Cafe',accountId:'cash',date:'2026-01-15'}," +
                "{type:'expense',amount:20,category:'Food',label:'Shop',accountId:'card',date:'2026-01-15'}," +
                "{type:'transfer',amount:999,accountId:'cash',toAccountId:'card',date:'2026-01-15'}];" +
                "document.querySelector('[data-tab=cashflow]').click();" +
                "document.querySelector('#cashFlowForm [name=month]').value='2026-01';" +
                "document.querySelector('#cashFlowForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));" +
                "document.querySelector('.sankey').textContent.includes('$11.00 gap') && !!document.querySelector('.flow-band[data-kind=gap]')"));
            assertEquals("true", js("document.querySelector('#cashFlowForm [name=account]').value='cash';" +
                "document.querySelector('#cashFlowForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));" +
                "document.querySelector('.sankey').textContent.includes('$9.00 saved') && !document.querySelector('.flow-band[data-kind=gap]')"));
            assertEquals("true", js("document.querySelector('.flow-data>summary').click();" +
                "document.querySelector('.flow-members>summary').click();" +
                "document.querySelector('.flow-data').open && document.querySelector('.flow-members').open && document.querySelector('.flow-members').textContent.includes('Coffee')"));
            assertEquals("true", js("document.querySelector('[data-tab=reports]').click();" +
                "document.querySelector('#detailReportForm [name=start]').value='2026-01-01';" +
                "document.querySelector('#detailReportForm [name=end]').value='2026-01-31';" +
                "document.querySelector('#detailReportForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));" +
                "!!document.querySelector('svg.flow-chart[role=img]') && !/NaN|Infinity/.test(document.querySelector('.flow-chart').outerHTML)"));
            assertEquals("true", js("document.querySelector('#detailReportForm [name=start]').value='2026-02-01';" +
                "document.querySelector('#detailReportForm [name=end]').value='2026-02-28';" +
                "document.querySelector('#detailReportForm').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));" +
                "!!document.querySelector('.flow-empty') && !document.querySelector('.flow-chart')"));
        } finally {
            js("state=JSON.parse(" + backup + "); tab='home'; render();");
        }
    }
}
