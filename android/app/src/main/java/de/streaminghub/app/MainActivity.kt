package de.streaminghub.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.core.view.WindowCompat
import de.streaminghub.app.ui.StreamingHubRoot
import de.streaminghub.app.ui.theme.StreamingHubTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        WindowCompat.setDecorFitsSystemWindows(window, false)

        setContent {
            StreamingHubTheme {
                StreamingHubRoot()
            }
        }
    }
}
