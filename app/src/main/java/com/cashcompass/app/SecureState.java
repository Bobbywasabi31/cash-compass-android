package com.cashcompass.app;

import android.content.Context;
import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedFile;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKeys;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/**
 * At-rest encryption for the live plan data (roadmap #8 remainder).
 *
 * The plan JSON and the automatic-backup slots are stored in EncryptedFile
 * vaults (AES-256-GCM), with the master key held by the Android Keystore
 * (hardware/TEE-backed where the device supports it). No passphrase or user
 * secret is involved — the OS guards the key, so a file-level read of the
 * app's data directory (lost/stolen phone, rooted backup tool) yields only
 * ciphertext. Small secrets (home-widget payload, connected-coach API key)
 * live in EncryptedSharedPreferences, and pre-update backup files are each
 * their own EncryptedFile; first access migrates the legacy plaintext copies
 * and wipes the originals.
 */
final class SecureState {
    private static final String STATE_FILE = "odddough-state.enc";
    private static final String AUTO_FILE = "odddough-autobackups.enc";
    private static final long MAX_BYTES = 16L * 1024 * 1024;

    private SecureState() {}

    // security-crypto 1.0.0 (stable): MasterKeys mints an AES-256-GCM key in the
    // Android Keystore; EncryptedFile takes the key alias. (The singular
    // MasterKey builder only exists in 1.1.0-alpha.)
    private static String masterKeyAlias(Context ctx) throws Exception {
        return MasterKeys.getOrCreate(MasterKeys.AES256_GCM_SPEC);
    }

    private static EncryptedFile encryptedFile(Context ctx, String name) throws Exception {
        File f = new File(ctx.getFilesDir(), name);
        return new EncryptedFile.Builder(f, ctx, masterKeyAlias(ctx),
                EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB).build();
    }

    private static synchronized String load(Context ctx, String name) {
        try {
            File f = new File(ctx.getFilesDir(), name);
            if (!f.exists()) return null;
            try (InputStream in = encryptedFile(ctx, name).openFileInput();
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int n;
                long total = 0;
                while ((n = in.read(buf)) != -1) {
                    total += n;
                    if (total > MAX_BYTES) return null;
                    out.write(buf, 0, n);
                }
                return out.toString(StandardCharsets.UTF_8.name());
            }
        } catch (Exception e) {
            return null;
        }
    }

    private static synchronized boolean save(Context ctx, String name, String json) {
        try {
            if (json == null) return false;
            byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_BYTES) return false;
            try (OutputStream out = encryptedFile(ctx, name).openFileOutput()) {
                out.write(bytes);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static String loadState(Context ctx) { return load(ctx, STATE_FILE); }
    static boolean saveState(Context ctx, String json) { return save(ctx, STATE_FILE, json); }
    static String loadAutoBackups(Context ctx) { return load(ctx, AUTO_FILE); }
    static boolean saveAutoBackups(Context ctx, String json) { return save(ctx, AUTO_FILE, json); }

    // ---- Encrypted preferences (widget payload, AI key) ----
    // Small secrets/settings live in AES-256-GCM EncryptedSharedPreferences,
    // keyed by the same Android Keystore master key as the vault above. The
    // first encrypted access migrates matching keys from the legacy plaintext
    // prefs of the same base name and wipes the plaintext originals. When the
    // vault is unavailable (no keystore), callers get ordinary private prefs —
    // today's behavior, never a crash or data loss.
    private static final Set<String> prefsMigrated = new HashSet<>();

    static SharedPreferences securePrefs(Context ctx, String baseName) {
        try {
            SharedPreferences enc = EncryptedSharedPreferences.create(baseName + ".enc",
                    masterKeyAlias(ctx), ctx,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
            migratePrefsOnce(ctx, baseName, enc);
            return enc;
        } catch (Exception e) {
            return ctx.getSharedPreferences(baseName, Context.MODE_PRIVATE);
        }
    }

    private static synchronized void migratePrefsOnce(Context ctx, String baseName, SharedPreferences enc) {
        if (!prefsMigrated.add(baseName)) return;
        try {
            SharedPreferences legacy = ctx.getSharedPreferences(baseName, Context.MODE_PRIVATE);
            Map<String, ?> all = legacy.getAll();
            if (all.isEmpty()) return;
            SharedPreferences.Editor e = enc.edit();
            for (Map.Entry<String, ?> kv : all.entrySet()) {
                Object v = kv.getValue();
                if (v instanceof String) e.putString(kv.getKey(), (String) v);
                else if (v instanceof Boolean) e.putBoolean(kv.getKey(), (Boolean) v);
                else if (v instanceof Integer) e.putInt(kv.getKey(), (Integer) v);
                else if (v instanceof Long) e.putLong(kv.getKey(), (Long) v);
                else if (v instanceof Float) e.putFloat(kv.getKey(), (Float) v);
                else if (v instanceof Set) {
                    @SuppressWarnings("unchecked") Set<String> s = (Set<String>) v;
                    e.putStringSet(kv.getKey(), new HashSet<>(s));
                }
            }
            if (e.commit()) legacy.edit().clear().commit(); // wipe plaintext originals
        } catch (Exception ignored) { /* keep plaintext; no data loss */ }
    }

    // ---- Connected-coach API key ----
    // Stored in EncryptedSharedPreferences; it never touches WebView storage.
    // saveAiKey returns false when the vault is unavailable so the JS side can
    // keep its localStorage fallback instead of silently storing the secret
    // in plaintext.
    private static final String AI_KEY_PREFS = "ai-key";
    private static final String AI_KEY = "key";

    static boolean saveAiKey(Context ctx, String key) {
        try {
            SharedPreferences p = EncryptedSharedPreferences.create(AI_KEY_PREFS + ".enc",
                    masterKeyAlias(ctx), ctx,
                    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM);
            SharedPreferences.Editor e = p.edit();
            if (key == null || key.isEmpty()) e.remove(AI_KEY);
            else e.putString(AI_KEY, key);
            return e.commit();
        } catch (Exception ex) {
            return false;
        }
    }

    static String loadAiKey(Context ctx) {
        try {
            return securePrefs(ctx, AI_KEY_PREFS).getString(AI_KEY, null);
        } catch (Exception e) {
            return null;
        }
    }

    // ---- Encrypted pre-update backup files ----
    // Each pre-update backup is its own EncryptedFile (AES-256-GCM, Keystore
    // master key), so a pending backup survives the APK update — the master
    // key is per-app and survives updates. Backups do NOT survive an
    // uninstall; the manual passphrase-encrypted backup is the off-device path.
    static boolean writeEncryptedFile(Context ctx, File file, String text) {
        try {
            if (text == null) return false;
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            if (bytes.length > MAX_BYTES) return false;
            EncryptedFile ef = new EncryptedFile.Builder(file, ctx, masterKeyAlias(ctx),
                    EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB).build();
            try (OutputStream out = ef.openFileOutput()) {
                out.write(bytes);
            }
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    static String readEncryptedFile(Context ctx, File file) {
        try {
            if (file == null || !file.isFile() || file.length() > MAX_BYTES) return null;
            EncryptedFile ef = new EncryptedFile.Builder(file, ctx, masterKeyAlias(ctx),
                    EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB).build();
            try (InputStream in = ef.openFileInput();
                 ByteArrayOutputStream out = new ByteArrayOutputStream()) {
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
                return out.toString(StandardCharsets.UTF_8.name());
            }
        } catch (Exception e) {
            return null;
        }
    }

    /** Reports whether the vault is usable; the JS side falls back to WebView storage when not. */
    static String status(Context ctx) {
        try {
            masterKeyAlias(ctx);
            boolean sealed = new File(ctx.getFilesDir(), STATE_FILE).exists();
            return "{\"ok\":true,\"encrypted\":true,\"sealed\":" + sealed + "}";
        } catch (Exception e) {
            return "{\"ok\":false,\"encrypted\":false}";
        }
    }
}
