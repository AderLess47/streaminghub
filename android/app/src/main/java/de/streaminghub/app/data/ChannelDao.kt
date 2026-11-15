package de.streaminghub.app.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

@Dao
abstract class ChannelDao {

    @Query("SELECT * FROM channels ORDER BY position ASC")
    abstract suspend fun loadAll(): List<ChannelEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertAll(channels: List<ChannelEntity>)

    @Query("DELETE FROM channels")
    abstract suspend fun clear()

    @Transaction
    open suspend fun replaceAll(channels: List<ChannelEntity>) {
        clear()
        insertAll(channels)
    }
}
