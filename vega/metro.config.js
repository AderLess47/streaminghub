const { getDefaultConfig, mergeConfig } = require("@react-native/metro-config");

/** Metro-Konfiguration für die Vega-App (RN 0.83). */
const config = {};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
