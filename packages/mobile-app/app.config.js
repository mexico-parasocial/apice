module.exports = {
  expo: {
    name: "Ápice",
    slug: "apice-mobile",
    version: "0.1.0",
    scheme: "apice",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#4A1052",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      supportsTablet: false,
      bundleIdentifier: "com.apice.mobile",
      infoPlist: {
        NSAllowsLocalNetworking: true,
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#4A1052",
      },
      package: "com.apice.mobile",
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      "expo-font",
      [
        "expo-splash-screen",
        {
          image: "./assets/splash.png",
          resizeMode: "contain",
          backgroundColor: "#4A1052",
        },
      ],
      [
        "expo-build-properties",
        {
          ios: {
            // 16.4 was required by expo-video's podspec (since removed);
            // BlueskyVideo only needs 13.4 — lower after device testing
            deploymentTarget: "16.4",
          },
        },
      ],
    ],
  },
};
