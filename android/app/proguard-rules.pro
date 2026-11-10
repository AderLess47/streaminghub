# Media3 and Compose are consumed as libraries. These rules keep the app models
# stable if minification is enabled in a later release.
-keep class de.streaminghub.app.model.** { *; }
-dontwarn org.checkerframework.**
