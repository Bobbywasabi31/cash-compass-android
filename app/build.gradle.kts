plugins {
    id("com.android.application")
}

android {
    namespace = "com.cashcompass.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.cashcompass.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 65
        versionName = "1.60.1"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        debug {
            applicationIdSuffix = ".preview"
            versionNameSuffix = "-preview"
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

dependencies {
    // On-device receipt OCR (thin client; model via Play Services, keeps APK small)
    implementation("com.google.android.gms:play-services-mlkit-text-recognition:19.0.1")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test:rules:1.6.1")
    testImplementation("junit:junit:4.13.2")
}
