plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose.compiler)
    alias(libs.plugins.kotlin.serialization)
}

base {
    archivesName.set("JujuyPass")
}

// URL base de la API (debe terminar en /api/v1/). Se configura con -PjcpApiUrl=... o en gradle.properties.
val urlApi: String = providers.gradleProperty("jcpApiUrl")
    .orElse("https://jujuypass.example/api/v1/")
    .get()
    .let { if (it.endsWith("/")) it else "$it/" }

android {
    namespace = "com.jujuypass.turista"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.jujuypass.turista"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0"
        buildConfigField("String", "API_URL", "\"$urlApi\"")
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro",
            )
            // Sin signingConfig: se genera la APK sin firmar.
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildFeatures {
        compose = true
        buildConfig = true
    }
    androidResources {
        localeFilters += listOf("es")
    }
    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
    lint {
        // Lint de AGP 9.3 se cae analizando Kotlin 2.4 ("Unexpected owner function: null" en Errores.kt,
        // bug del analizador). El código compila bien; se desactiva solo el lintVital del release.
        checkReleaseBuilds = false
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.core)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.okhttp)
    implementation(libs.play.services.location)
    implementation(libs.osmdroid)
    implementation(libs.zxing.core)
    testImplementation(libs.junit)
}
