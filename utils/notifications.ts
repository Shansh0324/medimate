import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech"; 
import Constants from "expo-constants"; 
import { Platform } from "react-native";
import { Medication } from "./storage";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});


class ReminderManager {
  private timers: Map<string, NodeJS.Timeout> = new Map();
  
  private readonly reminderMessages = [
    (name: string, dosage: string) => `It's time to take your medicine: ${name}, ${dosage}`,
    (name: string) => `Gentle reminder - please take your ${name}`,
    () => "Your medication is still pending",
    () => "Please don't forget your medicine",
    () => "Final reminder for your medication"
  ];

  scheduleEscalatingReminders(medicationId: string, medicineName: string, dosage: string) {
    let reminderCount = 0;
    
    const scheduleNextReminder = () => {
      if (reminderCount < this.reminderMessages.length) {
        const message = this.reminderMessages[reminderCount](medicineName, dosage);
        Speech.speak(message);
        reminderCount++;
        
        const nextTimer = setTimeout(() => {
          scheduleNextReminder();
        }, (reminderCount * 5) * 60 * 1000);
        
        this.timers.set(medicationId, nextTimer);
      }
    };

    scheduleNextReminder();
  }

  cancelReminder(medicationId: string) {
    const timer = this.timers.get(medicationId);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(medicationId);
    }
  }
}

const reminderManager = new ReminderManager();

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  let token: string | null = null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    return null;
  }

  try {
    const projectId = Constants.expoConfig?.extra?.eas?.projectId 
                    || Constants.easConfig?.projectId;
                    
    if (!projectId) {
      console.error("No projectId found! Add it in app.json or app.config.js");
      return null;
    }

    const response = await Notifications.getExpoPushTokenAsync({ projectId });
    token = response.data;

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#1a8e2d",
      });
    }

    return token;
  } catch (error) {
    console.error("Error getting push token:", error);
    return null;
  }
}

export async function scheduleMedicationReminder(medication: Medication): Promise<void> {
  if (!medication.reminderEnabled) return;

  try {
    for (const time of medication.times) {
      const [hours, minutes] = time.split(":").map(Number);
      const now = new Date();
      const triggerTime = new Date();

      triggerTime.setHours(hours, minutes, 0, 0);

      if (triggerTime <= now) {
        triggerTime.setDate(triggerTime.getDate() + 1); 
      }

      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Medication Reminder",
          body: `Time to take ${medication.name} (${medication.dosage})`,
          data: { medicationId: medication.id },
        },
        trigger: {
          hour: hours,
          minute: minutes,
          repeats: true,
          channelId: "default", 
        },        
      });

      setTimeout(() => {
        reminderManager.scheduleEscalatingReminders(
          medication.id,
          medication.name,
          medication.dosage
        );
      }, triggerTime.getTime() - now.getTime());
    }
  } catch (error) {
    console.error("Error scheduling medication reminder:", error);
  }
}

export async function scheduleRefillReminder(medication: Medication): Promise<void> {
  if (!medication.refillReminder) return;

  try {
    if (medication.currentSupply <= medication.refillAt) {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: "Refill Reminder",
          body: `Your ${medication.name} supply is running low. Current supply: ${medication.currentSupply}`,
          data: { medicationId: medication.id, type: "refill" },
        },
        trigger: null, 
      });
    }
  } catch (error) {
    console.error("Error scheduling refill reminder:", error);
  }
}

export async function cancelMedicationReminders(medicationId: string): Promise<void> {
  try {
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduledNotifications) {
      const data = notification.content.data as { medicationId?: string } | null;
      if (data?.medicationId === medicationId) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
        reminderManager.cancelReminder(medicationId);
      }
    }
  } catch (error) {
    console.error("Error canceling medication reminders:", error);
  }
}

export async function updateMedicationReminders(medication: Medication): Promise<void> {
  try {
    await cancelMedicationReminders(medication.id);
    await scheduleMedicationReminder(medication);
    await scheduleRefillReminder(medication);
  } catch (error) {
    console.error("Error updating medication reminders:", error);
  }
}
