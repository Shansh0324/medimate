import * as Notifications from "expo-notifications";
import * as Speech from "expo-speech"; // <--- (Added for voice reminder)
import Constants from "expo-constants"; // <--- (For projectId)
import { Platform } from "react-native";
import { Medication } from "./storage";

// Notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

// Register for push notifications
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

// Speak reminder
function speakReminder(medicineName: string, dosage: string) {
  const message = `It's time to take your medicine: ${medicineName}, ${dosage}`;
  Speech.speak(message);
}

// Schedule medication reminders
export async function scheduleMedicationReminder(medication: Medication): Promise<void> {
  if (!medication.reminderEnabled) return;

  try {
    for (const time of medication.times) {
      const [hours, minutes] = time.split(":").map(Number);
      const now = new Date();
      const triggerTime = new Date();

      triggerTime.setHours(hours, minutes, 0, 0);

      if (triggerTime <= now) {
        triggerTime.setDate(triggerTime.getDate() + 1); // Schedule for tomorrow
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
          channelId: "default", // Important for Android 13+ for scheduled notifications
        },        
      });

      // 📣 Speak the reminder when notification triggers
      setTimeout(() => {
        speakReminder(medication.name, medication.dosage);
      }, triggerTime.getTime() - now.getTime());
    }
  } catch (error) {
    console.error("Error scheduling medication reminder:", error);
  }
}

// Schedule refill reminder
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
        trigger: null, // Show immediately
      });
    }
  } catch (error) {
    console.error("Error scheduling refill reminder:", error);
  }
}

// Cancel all reminders for a medication
export async function cancelMedicationReminders(medicationId: string): Promise<void> {
  try {
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
    for (const notification of scheduledNotifications) {
      const data = notification.content.data as { medicationId?: string } | null;
      if (data?.medicationId === medicationId) {
        await Notifications.cancelScheduledNotificationAsync(notification.identifier);
      }
    }
  } catch (error) {
    console.error("Error canceling medication reminders:", error);
  }
}

// Update reminders when medication changes
export async function updateMedicationReminders(medication: Medication): Promise<void> {
  try {
    await cancelMedicationReminders(medication.id);
    await scheduleMedicationReminder(medication);
    await scheduleRefillReminder(medication);
  } catch (error) {
    console.error("Error updating medication reminders:", error);
  }
}
