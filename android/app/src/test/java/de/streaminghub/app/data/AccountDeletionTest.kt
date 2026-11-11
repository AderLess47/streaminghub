package de.streaminghub.app.data

import java.net.URI
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AccountDeletionTest {

    @Test
    fun `path is the public account deletion route`() {
        assertEquals("/account-deletion", AccountDeletion.PATH)
    }

    @Test
    fun `default url points at the public deletion page`() {
        assertEquals("https://streaminghub.org/account-deletion", AccountDeletion.url())
    }

    @Test
    fun `trailing slash in the base url does not duplicate the separator`() {
        assertEquals(
            "https://streaminghub.org/account-deletion",
            AccountDeletion.url("https://streaminghub.org/"),
        )
    }

    @Test
    fun `url is https with host and no query or fragment`() {
        val uri = URI(AccountDeletion.url())
        assertEquals("https", uri.scheme)
        assertEquals("streaminghub.org", uri.host)
        assertEquals("/account-deletion", uri.path)
        assertEquals(null, uri.query)
        assertEquals(null, uri.fragment)
    }

    @Test
    fun `link is public and not a dashboard route`() {
        assertTrue(AccountDeletion.PATH.startsWith("/"))
        assertFalse(AccountDeletion.PATH.contains("dashboard"))
        assertFalse(AccountDeletion.PATH.contains("login"))
        assertTrue(AccountDeletion.PATH.matches(Regex("/[a-z]+(-[a-z]+)*")))
    }
}
