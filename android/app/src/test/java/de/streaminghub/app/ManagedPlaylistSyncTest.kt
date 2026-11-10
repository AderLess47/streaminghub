package de.streaminghub.app

import de.streaminghub.app.data.ManagedPlaylist
import org.junit.Assert.assertEquals
import org.junit.Test

class ManagedPlaylistSyncTest {

    @Test
    fun clearsCachedManagedPlaylistWhenServerBlocksIt() {
        val action = managedPlaylistSyncAction(
            currentSourceUrl = "https://provider.example/managed.m3u",
            currentManaged = true,
            remote = null,
        )

        assertEquals(ManagedPlaylistSyncAction.CLEAR, action)
    }

    @Test
    fun keepsLocalPlaylistWhenServerHasNoManagedPlaylist() {
        val action = managedPlaylistSyncAction(
            currentSourceUrl = "https://provider.example/my-list.m3u",
            currentManaged = false,
            remote = null,
        )

        assertEquals(ManagedPlaylistSyncAction.KEEP, action)
    }

    @Test
    fun loadsNewManagedPlaylistFromServer() {
        val action = managedPlaylistSyncAction(
            currentSourceUrl = "https://provider.example/my-list.m3u",
            currentManaged = false,
            remote = ManagedPlaylist("https://provider.example/managed.m3u", null),
        )

        assertEquals(ManagedPlaylistSyncAction.LOAD, action)
    }

    @Test
    fun marksExistingLocalSourceAsManagedWhenUrlMatches() {
        val action = managedPlaylistSyncAction(
            currentSourceUrl = "https://provider.example/managed.m3u",
            currentManaged = false,
            remote = ManagedPlaylist("https://provider.example/managed.m3u", null),
        )

        assertEquals(ManagedPlaylistSyncAction.MARK_MANAGED, action)
    }

    @Test
    fun ignoresInvalidRemoteUrl() {
        val action = managedPlaylistSyncAction(
            currentSourceUrl = null,
            currentManaged = false,
            remote = ManagedPlaylist("javascript:alert(1)", null),
        )

        assertEquals(ManagedPlaylistSyncAction.KEEP, action)
    }

    @Test
    fun keepsPlaylistWhileAssignedThenClearsItAfterDeviceSwitch() {
        val url = "https://provider.example/managed.m3u"
        val whileAssigned = managedPlaylistSyncAction(
            currentSourceUrl = url,
            currentManaged = true,
            remote = ManagedPlaylist(url, null),
        )
        assertEquals(ManagedPlaylistSyncAction.KEEP, whileAssigned)

        // The admin moved the playlist to another device; this device now
        // receives playlist = null and must remove its local managed copy.
        val afterDeviceSwitch = managedPlaylistSyncAction(
            currentSourceUrl = url,
            currentManaged = true,
            remote = null,
        )
        assertEquals(ManagedPlaylistSyncAction.CLEAR, afterDeviceSwitch)
    }
}
