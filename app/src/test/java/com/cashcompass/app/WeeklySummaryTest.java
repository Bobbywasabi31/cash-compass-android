package com.cashcompass.app;

import org.junit.Test;
import java.util.Calendar;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

/** Unit tests for WeeklySummary.nextSunday; pure calendar math, no Android framework. */
public class WeeklySummaryTest {
    private static long at(int y, int mo, int d, int h) {
        Calendar c = Calendar.getInstance();
        c.set(y, mo - 1, d, h, 0, 0); c.set(Calendar.MILLISECOND, 0);
        return c.getTimeInMillis();
    }
    private static void assertSunday9am(long actual, int y, int mo, int d) {
        Calendar c = Calendar.getInstance();
        c.setTimeInMillis(actual);
        assertEquals(Calendar.SUNDAY, c.get(Calendar.DAY_OF_WEEK));
        assertEquals(y, c.get(Calendar.YEAR));
        assertEquals(mo - 1, c.get(Calendar.MONTH));
        assertEquals(d, c.get(Calendar.DAY_OF_MONTH));
        assertEquals(9, c.get(Calendar.HOUR_OF_DAY));
        assertEquals(0, c.get(Calendar.MINUTE));
    }
    @Test public void sundayMorningStaysSameDay() {
        // 2026-10-04 is a Sunday.
        assertSunday9am(WeeklySummary.nextSunday(at(2026, 10, 4, 8)), 2026, 10, 4);
    }
    @Test public void sundayAfternoonRollsToNextWeek() {
        assertSunday9am(WeeklySummary.nextSunday(at(2026, 10, 4, 10)), 2026, 10, 11);
    }
    @Test public void wednesdayGoesToSunday() {
        assertSunday9am(WeeklySummary.nextSunday(at(2026, 10, 7, 12)), 2026, 10, 11);
    }
    @Test public void resultIsStrictlyInFuture() {
        long now = at(2026, 10, 7, 12);
        assertTrue(WeeklySummary.nextSunday(now) > now);
    }
}
