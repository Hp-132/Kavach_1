#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h> // Required for HTTPS (Render)
#include <TinyGPS++.h>
#include <HardwareSerial.h>

/*
  KAVACH - ESP32 Hardware Integration Snippet
  Reads GPS Data (TinyGPS++) and sends to Backend API via HTTP POST.
*/

// WiFi Configuration
const char* ssid = "YOUR_WIFI_SSID";
const char* password = "YOUR_WIFI_PASSWORD";

// Backend Server (Render URL or Local IP if on same network)
const char* serverUrl = "https://your-kavach-render-app.onrender.com/api/location";

// Pins (Adjust if using different pins)
const int RX_PIN = 16;
const int TX_PIN = 17;
const int BUZZER_PIN = 8;
const int LED_PIN = 13;

TinyGPSPlus gps;
HardwareSerial gpsSerial(2);

void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600, SERIAL_8N1, RX_PIN, TX_PIN);
  
  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(LED_PIN, OUTPUT);

  // Connect to WiFi
  Serial.print("Connecting to WiFi");
  WiFi.begin(ssid, password);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
}

void loop() {
  // Read GPS data
  while (gpsSerial.available() > 0) {
    if (gps.encode(gpsSerial.read())) {
      if (gps.location.isValid()) {
        sendLocation(gps.location.lat(), gps.location.lng());
      }
    }
  }

  // Poll update every 5 seconds
  delay(5000); 
}

void sendLocation(double lat, double lng) {
  if (WiFi.status() == WL_CONNECTED) {
    WiFiClientSecure client;
    client.setInsecure(); // Essential for Render HTTPS (avoids CA certificate management)
    
    HTTPClient http;
    
    // Initialize connection with SSL support
    if (http.begin(client, serverUrl)) { 
      http.addHeader("Content-Type", "application/json");

      String jsonPayload = "{\"deviceId\":\"kavach-device-01\",\"latitude\":" + String(lat, 6) + ",\"longitude\":" + String(lng, 6) + "}";

      int httpResponseCode = http.POST(jsonPayload);

      if (httpResponseCode > 0) {
        Serial.print("HTTP Success: ");
        Serial.println(httpResponseCode);
      } else {
        Serial.print("HTTP Error: ");
        Serial.println(http.errorToString(httpResponseCode).c_str());
      }
      http.end();
    } else {
      Serial.println("Connection Failed.");
    }
  }
}
