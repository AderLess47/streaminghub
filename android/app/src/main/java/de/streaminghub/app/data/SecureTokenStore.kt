package de.streaminghub.app.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * The activation token is a bearer credential. Keep it out of plain prefs and
 * encrypt it with an Android Keystore key that never leaves the device.
 */
class SecureTokenStore(context: Context) {

    private val preferences = context.applicationContext
        .getSharedPreferences("streaminghub_secure", Context.MODE_PRIVATE)

    private val keyStore: KeyStore by lazy {
        KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
    }

    fun saveToken(token: String): Boolean = runCatching {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey())
        val encrypted = cipher.doFinal(token.toByteArray(Charsets.UTF_8))
        preferences.edit()
            .putString(KEY_CIPHERTEXT, Base64.encodeToString(encrypted, Base64.NO_WRAP))
            .putString(KEY_IV, Base64.encodeToString(cipher.iv, Base64.NO_WRAP))
            .apply()
    }.isSuccess

    fun loadToken(): String? = runCatching {
        val encrypted = preferences.getString(KEY_CIPHERTEXT, null)
            ?.let { Base64.decode(it, Base64.NO_WRAP) }
            ?: return@runCatching null
        val iv = preferences.getString(KEY_IV, null)
            ?.let { Base64.decode(it, Base64.NO_WRAP) }
            ?: return@runCatching null

        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), GCMParameterSpec(128, iv))
        String(cipher.doFinal(encrypted), Charsets.UTF_8)
    }.getOrNull()

    fun clearToken() {
        preferences.edit().clear().apply()
    }

    private fun getOrCreateKey(): SecretKey {
        (keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry)?.secretKey?.let {
            return it
        }

        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .build(),
        )
        return generator.generateKey()
    }

    private companion object {
        const val ANDROID_KEYSTORE = "AndroidKeyStore"
        const val KEY_ALIAS = "streaminghub_activation_token"
        const val TRANSFORMATION = "AES/GCM/NoPadding"
        const val KEY_CIPHERTEXT = "token_ciphertext"
        const val KEY_IV = "token_iv"
    }
}
