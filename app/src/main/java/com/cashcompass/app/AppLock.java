package com.cashcompass.app;

import android.app.Activity;
import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.CancellationSignal;
import java.util.concurrent.Executor;

/**
 * App lock (roadmap #7): gates opening the app behind the system biometric
 * prompt or the device lock screen (PIN/pattern/password). No new
 * dependencies, no stored secrets — authentication is delegated entirely to
 * Android, so the app never sees biometric data or the device credential.
 */
public final class AppLock {
    public static final int REQUEST_UNLOCK = 45;
    private static final String PREFS = "applock";
    private static final String KEY_ENABLED = "enabled";

    private static Listener pendingListener;

    private AppLock() {}

    public static boolean isEnabled(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getBoolean(KEY_ENABLED, false);
    }

    public static void setEnabled(Context ctx, boolean enabled) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_ENABLED, enabled).apply();
    }

    /**
     * Returns "biometric" when a strong biometric is enrolled, "device" when
     * only the device lock screen (PIN/pattern/password) is available, or
     * "none" when there is nothing to unlock with.
     */
    public static String mode(Activity activity) {
        if (Build.VERSION.SDK_INT >= 30) {
            BiometricManager bm = activity.getSystemService(BiometricManager.class);
            if (bm == null) return "none";
            int strong = BiometricManager.Authenticators.BIOMETRIC_STRONG;
            int any = strong | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
            if (bm.canAuthenticate(any) != BiometricManager.BIOMETRIC_SUCCESS) return "none";
            return bm.canAuthenticate(strong) == BiometricManager.BIOMETRIC_SUCCESS
                    ? "biometric" : "device";
        }
        if (Build.VERSION.SDK_INT == 29) {
            BiometricManager bm = activity.getSystemService(BiometricManager.class);
            if (bm != null && bm.canAuthenticate() == BiometricManager.BIOMETRIC_SUCCESS) return "biometric";
        }
        KeyguardManager km = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
        return (km != null && km.isDeviceSecure()) ? "device" : "none";
    }

    public interface Listener {
        void onResult(boolean unlocked);
    }

    /**
     * Shows the system unlock prompt. The listener is called exactly once with
     * the outcome; non-terminal biometric events (failed attempt, help text)
     * keep the prompt open without a callback.
     */
    public static void prompt(Activity activity, Listener listener) {
        if (Build.VERSION.SDK_INT >= 29) {
            BiometricPrompt prompt = new BiometricPrompt.Builder(activity)
                    .setTitle("Unlock OddDough")
                    .setSubtitle("Confirm it's you to open your budget")
                    .setDeviceCredentialAllowed(true)
                    .build();
            Executor executor = activity.getMainExecutor();
            prompt.authenticate(new CancellationSignal(), executor,
                    new BiometricPrompt.AuthenticationCallback() {
                        @Override public void onAuthenticationSucceeded(
                                BiometricPrompt.AuthenticationResult result) {
                            listener.onResult(true);
                        }
                        @Override public void onAuthenticationError(int errorCode, CharSequence errString) {
                            listener.onResult(false);
                        }
                    });
            return;
        }
        // API 24-28: confirm via the device lock screen activity.
        KeyguardManager km = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
        Intent intent = km == null ? null
                : km.createConfirmDeviceCredentialIntent("Unlock OddDough",
                        "Confirm it's you to open your budget");
        if (intent == null) {
            listener.onResult(false);
            return;
        }
        try {
            pendingListener = listener;
            activity.startActivityForResult(intent, REQUEST_UNLOCK);
        } catch (Exception e) {
            pendingListener = null;
            listener.onResult(false);
        }
    }

    /**
     * Routes the host activity's onActivityResult to the pending unlock
     * listener. Returns true when the request code was consumed.
     */
    public static boolean onActivityResult(int requestCode, int resultCode) {
        if (requestCode != REQUEST_UNLOCK) return false;
        Listener listener = pendingListener;
        pendingListener = null;
        if (listener != null) listener.onResult(resultCode == Activity.RESULT_OK);
        return true;
    }
}
