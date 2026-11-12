package de.streaminghub.app.data

/**
 * Where playback starts: the later of the position stored on this device and the
 * one the server keeps for the premium account. A device that watched offline
 * therefore never loses its own progress to an older synced value.
 */
fun resumeStart(localMs: Long, remoteMs: Long): Long {
    val local = if (localMs > 0L) localMs else 0L
    val remote = if (remoteMs > 0L) remoteMs else 0L
    return maxOf(local, remote)
}
