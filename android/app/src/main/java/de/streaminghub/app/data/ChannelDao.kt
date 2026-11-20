package de.streaminghub.app.data

import androidx.paging.PagingSource
import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
abstract class ChannelDao {

    @Query("SELECT * FROM channels ORDER BY position ASC")
    abstract suspend fun loadAll(): List<ChannelEntity>

    @Query(
        """
        SELECT * FROM channels
        WHERE (:groupName IS NULL OR group_name = :groupName)
          AND (:kind IS NULL OR kind = :kind)
          AND (:query = '' OR name LIKE '%' || :query || '%' OR group_name LIKE '%' || :query || '%')
        ORDER BY position ASC
        """,
    )
    abstract fun pagingSource(
        groupName: String?,
        kind: String?,
        query: String,
    ): PagingSource<Int, ChannelEntity>

    @Query("SELECT DISTINCT group_name FROM channels ORDER BY group_name COLLATE NOCASE ASC")
    abstract fun observeCategories(): Flow<List<String>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    abstract suspend fun insertAll(channels: List<ChannelEntity>)

    @Query("DELETE FROM channels")
    abstract suspend fun clear()
}
