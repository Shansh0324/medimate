import React from "react";
import { Stack } from "expo-router";

export default function MediMateCalendarLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { 
          backgroundColor: "#FFFFFF",
          padding: 16
        },
        animation: "slide_from_right",
        transitionSpec: {
          open: { animation: "timing", config: { duration: 300 } },
          close: { animation: "timing", config: { duration: 300 } }
        }
      }}
    />
  );
}