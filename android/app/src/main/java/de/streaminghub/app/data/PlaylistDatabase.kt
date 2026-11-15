package de.streaminghub.app.data

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase

@Database(
    entities = [ChannelEntity::class],
    version = 1,
    exportSchema = false,
)
abstract class PlaylistDatabase : RoomDatabase() {

    abstract fun channelDao(): ChannelDao

    companion object {
        @Volatile
        private var instance: PlaylistDatabase? = null

        fun get(context: Context): PlaylistDatabase =
            instance ?: synchronized(this) {
                instance ?: Room.databaseBuilder(
                    context.applicationContext,
                    PlaylistDatabase::class.java,
                    "playlists.db",
                ).build().also { instance = it }
            }
    }
}
