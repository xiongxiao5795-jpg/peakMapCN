plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val webDist = rootProject.projectDir.resolve("../dist")
val generatedWebAssets = layout.buildDirectory.dir("generated/peakmapAssets")
val copyWebAssets by tasks.registering(Sync::class) {
    doFirst {
        require(webDist.resolve("index.html").isFile) {
            "Web assets are missing. Run npm ci and npm run build in the project root first."
        }
    }
    from(webDist)
    into(generatedWebAssets.map { it.dir("www") })
}
val signingPath = System.getenv("ANDROID_KEYSTORE_PATH")
val storePass = System.getenv("ANDROID_STORE_PASSWORD")
val keyAliasValue = System.getenv("ANDROID_KEY_ALIAS")
val keyPass = System.getenv("ANDROID_KEY_PASSWORD")
val signingAvailable = listOf(signingPath, storePass, keyAliasValue, keyPass).all { !it.isNullOrBlank() }

android {
    namespace = "cn.peakmap.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "cn.peakmap.app"
        minSdk = 26
        targetSdk = 35
        versionCode = 4
        versionName = "0.2.2"
    }
    signingConfigs {
        if (signingAvailable) {
            create("fixedRelease") {
                storeFile = file(signingPath!!)
                storePassword = storePass
                keyAlias = keyAliasValue
                keyPassword = keyPass
            }
        }
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            if (signingAvailable) signingConfig = signingConfigs.getByName("fixedRelease")
        }
    }
    sourceSets.getByName("main").assets.srcDir(generatedWebAssets)
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

tasks.named("preBuild") { dependsOn(copyWebAssets) }
val validateReleaseSigning by tasks.registering {
    doLast {
        require(signingAvailable && file(signingPath!!).isFile) {
            "Release signing requires ANDROID_KEYSTORE_PATH, ANDROID_STORE_PASSWORD, ANDROID_KEY_ALIAS and ANDROID_KEY_PASSWORD."
        }
    }
}
tasks.configureEach { if (name == "preReleaseBuild") dependsOn(validateReleaseSigning) }

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
