// RN 0.83 liefert den JSX-Runtime im React-Native-Preset mit; das alte
// metro-react-native-babel-preset kennt diese RN-Version nicht mehr.
module.exports = {
  presets: ["module:@react-native/babel-preset"],
};
