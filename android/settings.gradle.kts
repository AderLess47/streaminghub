// Maven Central antwortet in der CI zeitweise mit 429. Der von Google
// gespiegelte Stand derselben Artefakte steht deshalb vor der Primaeradresse;
// mavenCentral() bleibt als Rueckfall fuer alles, was im Spiegel fehlt.
pluginManagement {
    repositories {
        google()
        maven {
            name = "MavenCentralMirror"
            url = uri("https://maven-central.storage-download.googleapis.com/maven2/")
        }
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        maven {
            name = "MavenCentralMirror"
            url = uri("https://maven-central.storage-download.googleapis.com/maven2/")
        }
        mavenCentral()
    }
}

rootProject.name = "StreamingHub"
include(":app")
