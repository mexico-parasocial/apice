const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Watchman is blocked from this Desktop workspace on some macOS setups.
// Fall back to Metro's Node crawler so `expo start` stays usable.
config.resolver.useWatchman = false;

module.exports = config;
