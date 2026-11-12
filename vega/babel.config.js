// Der W3C-Media-Player braucht den automatischen JSX-Runtime, sonst bricht die
// App zur Laufzeit mit "ReferenceError: Property 'React' doesn't exist" ab.
module.exports = {
  presets: [["module:metro-react-native-babel-preset", { useTransformReactJSXExperimental: true }]],
  plugins: [["@babel/plugin-transform-react-jsx", { runtime: "automatic" }]],
};
