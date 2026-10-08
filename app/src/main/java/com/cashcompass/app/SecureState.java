package com.cashcompass.app;

import android.content.Context;
import androidx.security.crypto.EncryptedFile;
import androidx.security.crypto.MasterKeys;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * At-rest encryption for the live plan data (roadmap #8 remainder).
 *
 * The plan JSON and the automatic-backup slots are stored in EncryptedFile
 * vaults (AES-256-GCM), with the master key held by the Android Keystore
 * (hardware/TEE-backed where the device supports it). No passphrase or user
 * secret is involved — the OS guards the key, so a file-level read of the
 * app's data directory (lost/stolen phone, rooted backup tool) yields only
 * ciphertext. App-private external update backups and WebView localStorage
 * leftovers are NOT covered; the JS side migrates those into the vault.
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
        return new EncryptedFile.Builder(ctx, f, masterKeyAlias(ctx),
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
