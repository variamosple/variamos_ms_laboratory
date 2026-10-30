import { ChangeNotification, NotificationGateway, RunNotification } from "../../Domain/Notifications/NotificationGateway";

const KEPT = 1000;

/** Keeps the last notifications in memory and logs them, until the notification service is connected. */
export default class MockNotificationGateway implements NotificationGateway {
  readonly sent: RunNotification[] = [];
  readonly changes: ChangeNotification[] = [];

  async notifyExperimentChanged(notification: ChangeNotification): Promise<void> {
    this.changes.push(notification);
    if (this.changes.length > KEPT) this.changes.shift();
  }

  async notifyRunFinished(notification: RunNotification): Promise<void> {
    this.sent.push(notification);
    if (this.sent.length > KEPT) this.sent.shift();
    if (process.env.NODE_ENV !== "test") {
      console.log(`Notification to ${notification.userId}: ${notification.message}`);
    }
  }
}
