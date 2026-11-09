# --- kotlinx.serialization ---
# La librería trae sus reglas, pero las dejamos explícitas por seguridad con R8 en modo completo.
-keepattributes *Annotation*, InnerClasses, Signature, Exceptions
-dontnote kotlinx.serialization.**
-dontwarn kotlinx.serialization.**

# Mantener los serializadores generados de nuestras clases @Serializable
-keepclassmembers @kotlinx.serialization.Serializable class com.jujuypass.turista.** {
    *** Companion;
    static ** INSTANCE;
    kotlinx.serialization.KSerializer serializer(...);
}
-keepclasseswithmembers class com.jujuypass.turista.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.jujuypass.turista.**$$serializer { *; }
-if @kotlinx.serialization.Serializable class com.jujuypass.turista.**
-keepclassmembers class <1>$Companion {
    kotlinx.serialization.KSerializer serializer(...);
}

# --- OkHttp ---
-dontwarn okhttp3.internal.platform.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**

# --- osmdroid ---
-dontwarn org.osmdroid.**
-keep class org.osmdroid.tileprovider.** { *; }

# --- ZXing (solo se usa el generador de QR) ---
-dontwarn com.google.zxing.**
