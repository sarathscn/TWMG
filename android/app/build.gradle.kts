import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

// Release signing is read from a properties file kept outside the repository
// (default ~/.twmg-signing/keystore.properties, or TWMG_KEYSTORE_PROPERTIES).
val signingFile = File(System.getenv("TWMG_KEYSTORE_PROPERTIES") ?: "${System.getProperty("user.home")}/.twmg-signing/keystore.properties")
val signing = Properties().apply { if (signingFile.exists()) signingFile.inputStream().use { load(it) } }

android {
    namespace = "com.sarathscn.twmg"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.sarathscn.twmg"
        minSdk = 26
        targetSdk = 35
        versionCode = 3
        versionName = "1.2.0"
        buildConfigField("String", "APP_URL", "\"https://twmg.vercel.app\"")
    }

    signingConfigs {
        if (signingFile.exists()) {
            create("release") {
                storeFile = File(signingFile.parentFile, signing.getProperty("storeFile"))
                storePassword = signing.getProperty("storePassword")
                keyAlias = signing.getProperty("keyAlias")
                keyPassword = signing.getProperty("keyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            if (signingFile.exists()) signingConfig = signingConfigs.getByName("release")
        }
    }

    buildFeatures { buildConfig = true }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions { jvmTarget = "17" }
}

dependencies {
    implementation("androidx.core:core-ktx:1.13.1")
    implementation("androidx.activity:activity-ktx:1.9.3")
    implementation("androidx.fragment:fragment-ktx:1.8.5")
    // System biometric prompt for App lock; biometric data never reaches the app.
    implementation("androidx.biometric:biometric:1.1.0")
    // WebAuthn (passkeys) inside the WebView on supported devices.
    implementation("androidx.webkit:webkit:1.14.0")
    // Background reminder sync and delivery that survive Doze and process death.
    implementation("androidx.work:work-runtime-ktx:2.9.1")
    testImplementation("junit:junit:4.13.2")
}
