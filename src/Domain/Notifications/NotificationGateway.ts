import MockNotificationGateway from "../../DataProviders/notifications/MockNotificationGateway";
import { Config } from "../../Config";

/** LAB-RUN-03: the researcher is told when a run ends. */
export interface RunNotification {
  userId: string;
  experimentId: string;
  experimentName: string;
  runId: string;
  runNumber: number;
  status: "completed" | "failed";
  message: string;
}

/**
 * How the Laboratory notifies users. The VariaMos notification service is not
 * called yet: the mock keeps the notifications, and the interface also shows
 * the end of a run it is following.
 */
/** LAB-COL-02: the other collaborators are told when someone saves a change. */
export interface ChangeNotification {
  userIds: string[];
  experimentId: string;
  experimentName: string;
  version: number;
  changedBy: string;
  changes: string[];
}

export interface NotificationGateway {
  notifyRunFinished(notification: RunNotification): Promise<void>;
  notifyExperimentChanged(notification: ChangeNotification): Promise<void>;
}

/** The gateway named by LAB_NOTIFICATION_GATEWAY. */
function configured(name: typeof Config.GATEWAYS.NOTIFICATIONS): NotificationGateway {
  switch (name) {
    case "mock":
      return new MockNotificationGateway();
  }
}

let gateway: NotificationGateway = configured(Config.GATEWAYS.NOTIFICATIONS);

export const getNotificationGateway = (): NotificationGateway => gateway;

/** Replaces the gateway, for tests or once the notification service is connected. */
export const setNotificationGateway = (next: NotificationGateway) => {
  gateway = next;
};
