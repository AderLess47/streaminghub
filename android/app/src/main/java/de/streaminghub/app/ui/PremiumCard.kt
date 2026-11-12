package de.streaminghub.app.ui

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.Refresh
import androidx.compose.material.icons.rounded.Restore
import androidx.compose.material.icons.rounded.ShoppingCart
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import de.streaminghub.app.billing.PremiumBillingState
import de.streaminghub.app.ui.theme.Cyan
import de.streaminghub.app.ui.theme.Foreground
import de.streaminghub.app.ui.theme.Muted
import de.streaminghub.app.ui.theme.Rose

/**
 * Premium card for the Fire TV build. It only ever shows what the server
 * confirmed – the store receipt alone unlocks nothing.
 */
@Composable
fun PremiumCard(
    state: PremiumBillingState,
    onBuy: () -> Unit,
    onRestore: () -> Unit,
) {
    SettingsCard(
        title = "Premium",
        subtitle = "Abrechnung über dein Amazon-Konto",
    ) {
        when (state) {
            PremiumBillingState.Loading -> Text(
                text = "Preis wird geladen …",
                color = Muted,
                style = MaterialTheme.typography.bodyMedium,
            )

            PremiumBillingState.Unavailable -> Text(
                text = "In-App-Käufe sind auf diesem Gerät gerade nicht verfügbar. Bitte versuche es später erneut.",
                color = Muted,
                style = MaterialTheme.typography.bodyMedium,
            )

            is PremiumBillingState.Ready -> {
                Text(
                    text = state.displayPrice?.let { "$it pro Monat" }
                        ?: "Der Preis wird im Amazon-Dialog angezeigt.",
                    color = Foreground,
                    style = MaterialTheme.typography.bodyLarge,
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Enthält Weiterschauen auf allen Geräten: deine Wiedergabeposition wird zwischen deinen Geräten synchronisiert.",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(10.dp))
                PrimaryAction(
                    text = "Premium über Amazon abschließen",
                    icon = Icons.Rounded.ShoppingCart,
                    onClick = onBuy,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(9.dp))
                SecondaryAction(
                    text = "Kauf wiederherstellen",
                    icon = Icons.Rounded.Restore,
                    onClick = onRestore,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            PremiumBillingState.Purchasing -> {
                Text(
                    text = "Kauf wird verarbeitet …",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(9.dp))
                SecondaryAction(
                    text = "Kauf wiederherstellen",
                    icon = Icons.Rounded.Restore,
                    onClick = onRestore,
                    enabled = false,
                    modifier = Modifier.fillMaxWidth(),
                )
            }

            PremiumBillingState.Pending -> Text(
                text = "Die Zahlung wird geprüft. Premium wird freigeschaltet, sobald Amazon den Kauf bestätigt.",
                color = Foreground,
                style = MaterialTheme.typography.bodyMedium,
            )

            is PremiumBillingState.Active -> {
                Text(
                    text = "Premium aktiv",
                    color = Cyan,
                    style = MaterialTheme.typography.bodyLarge,
                )
                Text(
                    text = "Weiterschauen auf allen Geräten ist aktiv.",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
                state.currentPeriodEnd?.let { end ->
                    Text(
                        text = "Nächste Verlängerung: ${end.take(10)}",
                        color = Muted,
                        style = MaterialTheme.typography.bodyMedium,
                    )
                }
                Spacer(Modifier.height(9.dp))
                SecondaryAction(
                    text = "Status aktualisieren",
                    icon = Icons.Rounded.Refresh,
                    onClick = onRestore,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(6.dp))
                Text(
                    text = "Kündigung jederzeit im Amazon-Konto unter Abonnements.",
                    color = Muted,
                    style = MaterialTheme.typography.bodyMedium,
                )
            }

            is PremiumBillingState.Error -> {
                Text(
                    text = state.message,
                    color = Rose,
                    style = MaterialTheme.typography.bodyMedium,
                )
                Spacer(Modifier.height(10.dp))
                PrimaryAction(
                    text = "Erneut versuchen",
                    icon = Icons.Rounded.ShoppingCart,
                    onClick = onBuy,
                    modifier = Modifier.fillMaxWidth(),
                )
                Spacer(Modifier.height(9.dp))
                SecondaryAction(
                    text = "Kauf wiederherstellen",
                    icon = Icons.Rounded.Restore,
                    onClick = onRestore,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
    }
}
