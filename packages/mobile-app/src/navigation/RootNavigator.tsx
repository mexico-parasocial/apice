import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { useBreakpoint, useTheme } from "@apice/mobile";

import { HomeScreen } from "@/screens/HomeScreen";
import { CoursesScreen } from "@/screens/CoursesScreen";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { CoursePreviewScreen } from "@/screens/CoursePreviewScreen";
import { CourseDetailScreen } from "@/screens/CourseDetailScreen";
import { LessonPlayerScreen } from "@/screens/LessonPlayerScreen";
import { QuizScreen } from "@/screens/QuizScreen";

export type RootStackParamList = {
  Tabs: undefined;
  CoursePreview: { courseId: string; courseName: string };
  CourseDetail: { courseId: string; courseName: string };
  LessonPlayer: {
    courseId: string;
    lessonId: string;
    lessonTitle: string;
    courseName: string;
  };
  Quiz: { lessonId: string; courseId: string };
};

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator<RootStackParamList>();

function TabNavigator() {
  // A bottom tab bar is a thumb affordance. On a wide pointer-driven screen
  // it reads as a phone app in a browser, so the same routes move to a
  // persistent left rail instead (tabBarPosition is built into bottom-tabs v7).
  const { isDesktopWeb } = useBreakpoint();
  const theme = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarPosition: isDesktopWeb ? "left" : "bottom",
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: keyof typeof Ionicons.glyphMap = "home";
          if (route.name === "Home") iconName = focused ? "home" : "home-outline";
          else if (route.name === "Courses") iconName = focused ? "book" : "book-outline";
          else if (route.name === "Profile") iconName = focused ? "person" : "person-outline";
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.palette.primary_800,
        tabBarInactiveTintColor: theme.palette.contrast_500,
        // Default active pill is a stock blue; tint it with the brand ramp.
        tabBarActiveBackgroundColor: isDesktopWeb
          ? theme.palette.primary_50
          : "transparent",
        // On the rail, labels sit beside icons and can afford more room.
        tabBarLabelStyle: isDesktopWeb
          ? { fontFamily: "Nunito_600SemiBold", fontSize: 14, lineHeight: 18 }
          : {
              fontFamily: "Nunito_600SemiBold",
              fontSize: 11,
              // Nunito's descenders clip inside the default label box.
              lineHeight: 14,
            },
        // The rail is nav chrome, so it has to track the theme like every
        // other surface — a white sidebar beside a dark page is the tell.
        tabBarStyle: isDesktopWeb
          ? {
              width: 232,
              paddingTop: 12,
              paddingHorizontal: 8,
              backgroundColor: theme.atoms.bg.backgroundColor,
              borderRightWidth: 1,
              borderRightColor: theme.palette.contrast_100,
            }
          : {
              height: 62,
              paddingTop: 6,
              paddingBottom: 8,
              backgroundColor: theme.atoms.bg.backgroundColor,
              borderTopColor: theme.palette.contrast_100,
            },
        tabBarItemStyle: isDesktopWeb
          ? { borderRadius: 10, marginBottom: 4, paddingVertical: 10 }
          : undefined,
        headerShown: false,
      })}
    >
      {/* Route names stay in English (they key navigation + deep links);
          only the visible labels are localised. */}
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: "Inicio" }}
      />
      <Tab.Screen
        name="Courses"
        component={CoursesScreen}
        options={{ tabBarLabel: "Programas" }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{ tabBarLabel: "Perfil" }}
      />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="CoursePreview"
        component={CoursePreviewScreen}
        options={({ route }) => ({
          title: route.params.courseName,
          headerShown: true,
          headerTintColor: "#4A1052",
          headerTitleStyle: { fontFamily: "Raleway_700Bold" },
        })}
      />
      <Stack.Screen
        name="CourseDetail"
        component={CourseDetailScreen}
        options={({ route }) => ({
          title: route.params.courseName,
          headerShown: true,
          headerTintColor: "#4A1052",
          headerTitleStyle: { fontFamily: "Raleway_700Bold" },
        })}
      />
      <Stack.Screen
        name="LessonPlayer"
        component={LessonPlayerScreen}
        options={({ route }) => ({
          title: route.params.lessonTitle,
          headerShown: true,
          headerTintColor: "#4A1052",
          headerTitleStyle: { fontFamily: "Raleway_700Bold" },
        })}
      />
      <Stack.Screen
        name="Quiz"
        component={QuizScreen}
        options={{ title: "Cuestionario", headerShown: true, headerTintColor: "#4A1052" }}
      />
    </Stack.Navigator>
  );
}
