package de.streaminghub.app.data

/**
 * Public account deletion page (German and English) that works without signing
 * in. Amazon requires the deletion option to be reachable from inside the app,
 * including for users who cannot sign in on this device.
 */
object AccountDeletion {

    const val BASE_URL = "https://streaminghub.org"
    const val PATH = "/account-deletion"

    fun url(baseUrl: String = BASE_URL): String = baseUrl.trimEnd('/') + PATH
}
