package de.streaminghub.app.data

import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.net.InetAddress
import java.net.ServerSocket
import kotlin.concurrent.thread

class StreamingHubApiTest {

    private lateinit var serverSocket: ServerSocket
    private lateinit var serverThread: Thread
    @Volatile private var responseBody = ""
    @Volatile private var responseStatus = 200

    @Before
    fun setUp() {
        serverSocket = ServerSocket(0, 0, InetAddress.getByName("127.0.0.1"))
        serverThread = thread(start = true, isDaemon = true) {
            runCatching {
                serverSocket.accept().use { socket ->
                    val reader = socket.getInputStream().bufferedReader(Charsets.UTF_8)
                    while (true) {
                        val line = reader.readLine() ?: break
                        if (line.isEmpty()) break
                    }

                    val bytes = responseBody.toByteArray(Charsets.UTF_8)
                    val statusText = if (responseStatus == 200) "OK" else "Error"
                    val headers = buildString {
                        append("HTTP/1.1 $responseStatus $statusText\r\n")
                        append("Content-Type: application/json; charset=utf-8\r\n")
                        append("Content-Length: ${bytes.size}\r\n")
                        append("Connection: close\r\n")
                        append("\r\n")
                    }

                    socket.getOutputStream().use { output ->
                        output.write(headers.toByteArray(Charsets.UTF_8))
                        output.write(bytes)
                        output.flush()
                    }
                }
            }
        }
    }

    @After
    fun tearDown() {
        runCatching { serverSocket.close() }
        serverThread.join(1_000)
    }

    @Test
    fun parsesBlockedManagedPlaylistAsNull() = runBlocking {
        responseBody = """
            {
              "account": { "email": "kunde@example.com", "displayName": "Kunde" },
              "device": { "name": "Wohnzimmer TV", "platform": "androidtv" },
              "subscription": { "plan": "premium", "status": "none" },
              "playlist": null
            }
        """.trimIndent()

        val account = api().me("test-token")

        assertNull(account.playlist)
    }

    @Test
    fun parsesConfirmedManagedPlaylistUrl() = runBlocking {
        responseBody = """
            {
              "account": { "email": "kunde@example.com", "displayName": "Kunde" },
              "device": { "name": "Wohnzimmer TV", "platform": "androidtv" },
              "subscription": { "plan": "premium", "status": "none" },
              "playlist": {
                "url": "https://provider.example/managed.m3u",
                "updatedAt": "2026-11-10T12:00:00.000Z"
              }
            }
        """.trimIndent()

        val account = api().me("test-token")

        assertEquals("https://provider.example/managed.m3u", account.playlist?.url)
        assertEquals("2026-11-10T12:00:00.000Z", account.playlist?.updatedAt)
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsPlainHttpApiBaseUrl() {
        StreamingHubApi("http://streaminghub.org")
    }

    @Test(expected = IllegalArgumentException::class)
    fun rejectsUnsupportedScheme() {
        StreamingHubApi("ftp://streaminghub.org")
    }

    @Test
    fun acceptsHttpsAndLoopbackHttp() {
        StreamingHubApi("https://streaminghub.org")
        StreamingHubApi("http://127.0.0.1:8787")
        StreamingHubApi("http://localhost:8787")
    }

    @Test
    fun doesNotFollowRedirects() = runBlocking {
        responseStatus = 302

        val error = runCatching { api().me("test-token") }.exceptionOrNull()

        assertTrue("Weiterleitung muss als Fehler ankommen", error is StreamingHubApiException)
        val apiError = error as StreamingHubApiException
        assertEquals(302, apiError.httpStatus)
        assertEquals("redirect_rejected", apiError.apiCode)
    }

    private fun api() = StreamingHubApi("http://127.0.0.1:${serverSocket.localPort}")
}
