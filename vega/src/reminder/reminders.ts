import { loadReminders, saveReminders } from "../data/storage";
import type { EpgProgramme, Reminder } from "../model/types";

/**
 * Sendungserinnerungen.
 *
 * Wichtig für die Einordnung: Vega OS bietet Apps derzeit keinen Weg, eine
 * lokale Benachrichtigung zu einem späteren Zeitpunkt zu planen – das
 * `[tasks]`-Manifest kennt nur das Install-Ereignis. Der Android-Client nutzt
 * `AlarmManager` und zeigt danach eine Systembenachrichtigung; auf Vega ist das
 * nicht verfügbar.
 *
 * Deshalb erinnert die App **innerhalb der laufenden App**: Ein Minuten-Ticker
 * prüft fällige Erinnerungen und zeigt einen Hinweis mit Sprung zur Sendung.
 * Das ist ehrlich weniger als auf Android, aber es ist kein Versprechen, das die
 * Plattform nicht einlöst. Sobald Amazon eine Benachrichtigungs-API anbietet,
 * ersetzt ein Adapter diesen Ticker.
 */

const TICK_MS = 20_000;

export function reminderId(programme: Pick<EpgProgramme, "channelId" | "startMs">): string {
  return `${programme.channelId}:${programme.startMs}`;
}

export class ReminderService {
  private reminders: Reminder[] = [];

  async load(): Promise<Reminder[]> {
    this.reminders = (await loadReminders()).sort((a, b) => a.startMs - b.startMs);
    return this.list();
  }

  list(): Reminder[] {
    return [...this.reminders];
  }

  has(programme: Pick<EpgProgramme, "channelId" | "startMs">): boolean {
    return this.reminders.some((reminder) => reminder.id === reminderId(programme));
  }

  /** Erinnerungen in der Vergangenheit sind sinnlos und werden verworfen. */
  async add(programme: EpgProgramme, nowMs = Date.now()): Promise<Reminder[]> {
    if (programme.startMs <= nowMs) return this.list();
    const id = reminderId(programme);
    if (this.reminders.some((reminder) => reminder.id === id)) return this.list();

    this.reminders = [
      ...this.reminders,
      {
        id,
        channelId: programme.channelId,
        channelName: programme.channelName,
        title: programme.title,
        startMs: programme.startMs,
      },
    ].sort((a, b) => a.startMs - b.startMs);
    await saveReminders(this.reminders);
    return this.list();
  }

  async remove(id: string): Promise<Reminder[]> {
    this.reminders = this.reminders.filter((reminder) => reminder.id !== id);
    await saveReminders(this.reminders);
    return this.list();
  }

  async toggle(programme: EpgProgramme, nowMs = Date.now()): Promise<Reminder[]> {
    const id = reminderId(programme);
    return this.has(programme) ? this.remove(id) : this.add(programme, nowMs);
  }

  /** Fällige Erinnerungen: Startzeit erreicht, höchstens fünf Minuten her. */
  due(nowMs = Date.now()): Reminder[] {
    return this.reminders.filter(
      (reminder) => reminder.startMs <= nowMs && reminder.startMs > nowMs - 5 * 60_000,
    );
  }

  /** Ticker für die laufende App. Gibt die Abmelde-Funktion zurück. */
  startWatcher(onDue: (reminder: Reminder) => void): () => void {
    const seen = new Set<string>();
    const tick = () => {
      for (const reminder of this.due()) {
        if (seen.has(reminder.id)) continue;
        seen.add(reminder.id);
        onDue(reminder);
      }
    };
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }
}
