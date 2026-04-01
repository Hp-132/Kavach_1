#include <Adafruit_NeoPixel.h>
#include <HTTPClient.h>
#include <HardwareSerial.h>
#include <Preferences.h>
#include <TinyGPSPlus.h>
#include <WebServer.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

// ---------------- CLOUD CONNECTION ----------------
// Your deployed Render Backend URL
const char *cloudServerUrl = "https://kavach-1-jdzy.onrender.com/api/location";
const char *deviceID = "Kavach-Pro-Hardware";
unsigned long lastCloudSync = 0;
const unsigned long cloudSyncInterval = 10000; // Send location every 10 seconds

// ---------------- Objects ----------------
WebServer server(80);
Preferences preferences;
TinyGPSPlus gps;
HardwareSerial gpsSerial(2);
HardwareSerial simSerial(1);

// ---------------- WS2812 LED RING ----------------
#define RING_PIN 4
#define RING_COUNT 8
Adafruit_NeoPixel ring(RING_COUNT, RING_PIN, NEO_GRB + NEO_KHZ800);

// ---------------- Buzzer & Button ----------------
const int buzzerPin = 33;
const int emergencyButtonPin = 25; // Button to GND

// ---------------- AP Setup (For first time config) ----------------
const char *apSSID = "Kavach-ESP32-Setup";
const char *apPassword = "password123";

// ---------------- WiFi Status ----------------
String savedSSID = "";
String savedPASS = "";
bool wifiConnected = false;
bool internetOK = false;
String wifiIP = "";
String wifiSSIDNow = "";

// ---------------- Debug ----------------
String lastDebugMessage = "System started";
String lastSmsStatus = "No SMS sent yet";
String lastCallStatus = "No call made yet";

// ---------------- GPS Data ----------------
String gpsFix = "No Fix";
String gpsLat = "-";
String gpsLng = "-";
String gpsAlt = "-";
String gpsSpeed = "-";
String gpsSats = "0";
String gpsTime = "-";
String gpsDate = "-";

// ---------------- SIM Data ----------------
bool simReady = false;
bool simRegistered = false;
int simSignal = -1;
String simSignalText = "Unknown";
String simNetworkStatus = "Unknown";
String simOperator = "-";

// ---------------- Emergency ----------------
bool emergencyActive = false;
unsigned long emergencyStartTime = 0;
const unsigned long emergencyDuration = 60000;
bool smsSentForCurrentEmergency = false;
bool callDoneForCurrentEmergency = false;

// ---------------- Settings ----------------
int callDurationSeconds = 20;
int emergencyCallRepeat = 1;
bool ledEnabled = true;
int ledRunSeconds = 15;
int ledPattern = 1;
bool buzzerEnabled = true;
int buzzerRunSeconds = 15;
int buzzerPattern = 1;

// runtime effects
bool ledEffectActive = false;
bool buzzerEffectActive = false;
unsigned long ledEffectStart = 0;
unsigned long buzzerEffectStart = 0;
unsigned long lastLedAnim = 0;
unsigned long lastBuzzAnim = 0;

// Button debounce
bool lastButtonReading = HIGH;
bool stableButtonState = HIGH;
unsigned long lastDebounceTime = 0;
const unsigned long debounceDelay = 50;

// Contacts
struct Contact {
  String name;
  String number;
  bool smsEnabled;
  bool callEnabled;
};
Contact contacts[5];

// Timers
unsigned long lastWiFiCheck = 0;
unsigned long lastGPSCheck = 0;
unsigned long lastSimSignalCheck = 0;
unsigned long lastSimRegisterCheck = 0;

// ---------------- Prototypes ----------------
void syncToRenderCloud();
void triggerEmergency(const String &source);
void updateGPSData();
void updateLedPattern();
void updateBuzzerPattern();
void handleRoot();
void handleStatus();
void handleGPS();
void handleConnect();
void handleScan();
void handleSaveContacts();
void handleGetContacts();
void handleSaveSettings();
void handleGetSettings();
void loadCredentials();
void saveCredentials(const String &ssid, const String &pass);
void loadContacts();
void saveContacts();
void loadSettings();
void saveSettings();
bool connectToRouter(const String &ssid, const String &pass,
                     unsigned long timeoutMs = 15000);
String sendAT(String cmd, unsigned long timeout = 1200);
bool initSIM800L();
bool sendSMS(String number, String message);
bool makeCall(String number, unsigned long callDurationMs = 20000);

// ---------------- CLOUD SYNC ENGINE ----------------
void syncToRenderCloud() {
  if (WiFi.status() == WL_CONNECTED && gps.location.isValid()) {
    WiFiClientSecure client;
    client.setInsecure(); // Important: Render uses HTTPS, this bypasses SSL
                          // cert headache

    HTTPClient http;
    if (http.begin(client, cloudServerUrl)) {
      http.addHeader("Content-Type", "application/json");

      // JSON payload matches backend expectations
      String json = "{";
      json += "\"deviceId\":\"" + String(deviceID) + "\",";
      json += "\"latitude\":" + String(gps.location.lat(), 6) + ",";
      json += "\"longitude\":" + String(gps.location.lng(), 6) + ",";
      json += "\"isEmergency\":" + String(emergencyActive ? "true" : "false");
      json += "}";

      int httpCode = http.POST(json);
      if (httpCode > 0) {
        Serial.printf("[CloudSync] Success: %d\n", httpCode);
      } else {
        Serial.printf("[CloudSync] Failed: %s\n",
                      http.errorToString(httpCode).c_str());
      }
      http.end();
    }
  }
}

// ---------------- UTILITY ----------------
void setDebug(String msg) {
  lastDebugMessage = msg;
  Serial.println(msg);
}

String normalizePhoneNumber(String num) {
  num.trim();
  num.replace(" ", "");
  num.replace("-", "");
  if (num.startsWith("+"))
    return num;
  if (num.length() == 10)
    return "+91" + num;
  return num;
}

// ---------------- PREFERENCES (EEPROM) ----------------
void loadCredentials() {
  preferences.begin("wifiCreds", true);
  savedSSID = preferences.getString("ssid", "");
  savedPASS = preferences.getString("pass", "");
  preferences.end();
}
void saveCredentials(const String &ssid, const String &pass) {
  preferences.begin("wifiCreds", false);
  preferences.putString("ssid", ssid);
  preferences.putString("pass", pass);
  preferences.end();
  savedSSID = ssid;
  savedPASS = pass;
}
void loadContacts() {
  preferences.begin("contacts", true);
  for (int i = 0; i < 5; i++) {
    contacts[i].name = preferences.getString(("name" + String(i)).c_str(), "");
    contacts[i].number = preferences.getString(("num" + String(i)).c_str(), "");
    contacts[i].smsEnabled =
        preferences.getBool(("sms" + String(i)).c_str(), false);
    contacts[i].callEnabled =
        preferences.getBool(("call" + String(i)).c_str(), false);
  }
  preferences.end();
}
void saveContacts() {
  preferences.begin("contacts", false);
  for (int i = 0; i < 5; i++) {
    preferences.putString(("name" + String(i)).c_str(), contacts[i].name);
    preferences.putString(("num" + String(i)).c_str(), contacts[i].number);
    preferences.putBool(("sms" + String(i)).c_str(), contacts[i].smsEnabled);
    preferences.putBool(("call" + String(i)).c_str(), contacts[i].callEnabled);
  }
  preferences.end();
}
void loadSettings() {
  preferences.begin("settings", true);
  callDurationSeconds = preferences.getInt("callDur", 20);
  emergencyCallRepeat = preferences.getInt("callRep", 1);
  ledEnabled = preferences.getBool("ledEn", true);
  ledRunSeconds = preferences.getInt("ledSec", 15);
  ledPattern = preferences.getInt("ledPat", 1);
  buzzerEnabled = preferences.getBool("buzEn", true);
  buzzerRunSeconds = preferences.getInt("buzSec", 15);
  buzzerPattern = preferences.getInt("buzPat", 1);
  preferences.end();
}
void saveSettings() {
  preferences.begin("settings", false);
  preferences.putInt("callDur", callDurationSeconds);
  preferences.putInt("callRep", emergencyCallRepeat);
  preferences.putBool("ledEn", ledEnabled);
  preferences.putInt("ledSec", ledRunSeconds);
  preferences.putInt("ledPat", ledPattern);
  preferences.putBool("buzEn", buzzerEnabled);
  preferences.putInt("buzSec", buzzerRunSeconds);
  preferences.putInt("buzPat", buzzerPattern);
  preferences.end();
}

// ---------------- WIFI ----------------
bool connectToRouter(const String &ssid, const String &pass,
                     unsigned long timeoutMs) {
  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(ssid.c_str(), pass.c_str());
  unsigned long start = millis();
  while (millis() - start < timeoutMs) {
    if (WiFi.status() == WL_CONNECTED) {
      wifiConnected = true;
      wifiIP = WiFi.localIP().toString();
      saveCredentials(ssid, pass);
      setDebug("WiFi Connected to: " + ssid);
      return true;
    }
    delay(200);
    yield();
  }
  wifiConnected = false;
  return false;
}

// ---------------- GPS ----------------
void updateGPSData() {
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }
  if (gps.location.isValid()) {
    gpsFix = "Fix Available";
    gpsLat = String(gps.location.lat(), 6);
    gpsLng = String(gps.location.lng(), 6);
  } else {
    gpsFix = "No Fix";
    gpsLat = "-";
    gpsLng = "-";
  }
  gpsSats = String(gps.satellites.value());
}

// ---------------- EMERGENCY LOGIC ----------------
void triggerEmergency(const String &source) {
  emergencyActive = true;
  emergencyStartTime = millis();
  smsSentForCurrentEmergency = false;
  callDoneForCurrentEmergency = false;

  if (ledEnabled) {
    ledEffectActive = true;
    ledEffectStart = millis();
  }
  if (buzzerEnabled) {
    buzzerEffectActive = true;
    buzzerEffectStart = millis();
  }

  setDebug("Emergency Triggered: " + source);

  // Trigger immediate cloud update
  syncToRenderCloud();
}

void trySendEmergencySMSAndCall() {
  if (!emergencyActive)
    return;
  if (!simReady || !simRegistered)
    return;

  if (!smsSentForCurrentEmergency) {
    updateGPSData();
    String msg =
        "EMERGENCY ALERT!\nLocation: https://maps.google.com/?q=" + gpsLat +
        "," + gpsLng;
    for (int i = 0; i < 5; i++) {
      if (contacts[i].smsEnabled && contacts[i].number.length() > 5) {
        sendSMS(contacts[i].number, msg);
        delay(500);
      }
    }
    smsSentForCurrentEmergency = true;
  }

  if (!callDoneForCurrentEmergency) {
    for (int i = 0; i < 5; i++) {
      if (contacts[i].callEnabled && contacts[i].number.length() > 5) {
        for (int r = 0; r < emergencyCallRepeat; r++) {
          makeCall(contacts[i].number, callDurationSeconds * 1000UL);
          delay(1000);
        }
        break;
      }
    }
    callDoneForCurrentEmergency = true;
  }
}

// ---------------- HARDWARE FEEDBACK ----------------
void ringOff() {
  ring.clear();
  ring.show();
}
void buzzerOn() {
  pinMode(buzzerPin, OUTPUT);
  digitalWrite(buzzerPin, LOW);
}
void buzzerOff() { pinMode(buzzerPin, INPUT); }

void updateLedPattern() {
  if (!ledEffectActive)
    return;
  if (millis() - ledEffectStart >= ledRunSeconds * 1000UL) {
    ledEffectActive = false;
    ringOff();
    return;
  }
  if (millis() - lastLedAnim < 100)
    return;
  lastLedAnim = millis();
  static int step = 0;
  step++;
  // Police Flash Pattern
  if ((step / 2) % 2 == 0) {
    for (int i = 0; i < RING_COUNT / 2; i++)
      ring.setPixelColor(i, ring.Color(255, 0, 0));
    for (int i = RING_COUNT / 2; i < RING_COUNT; i++)
      ring.setPixelColor(i, ring.Color(0, 0, 255));
  } else {
    for (int i = 0; i < RING_COUNT / 2; i++)
      ring.setPixelColor(i, ring.Color(0, 0, 255));
    for (int i = RING_COUNT / 2; i < RING_COUNT; i++)
      ring.setPixelColor(i, ring.Color(255, 0, 0));
  }
  ring.show();
}

void updateBuzzerPattern() {
  if (!buzzerEffectActive)
    return;
  if (millis() - buzzerEffectStart >= buzzerRunSeconds * 1000UL) {
    buzzerEffectActive = false;
    buzzerOff();
    return;
  }
  if (millis() - lastBuzzAnim < 150)
    return;
  lastBuzzAnim = millis();
  static int bStep = 0;
  bStep++;
  if (bStep % 2 == 0)
    buzzerOn();
  else
    buzzerOff();
}

// ---------------- SIM800L ----------------
String sendAT(String cmd, unsigned long timeout) {
  while (simSerial.available())
    simSerial.read();
  simSerial.println(cmd);
  unsigned long start = millis();
  String r = "";
  while (millis() - start < timeout) {
    while (simSerial.available())
      r += (char)simSerial.read();
    yield();
  }
  return r;
}

bool initSIM800L() {
  String r = sendAT("AT", 1000);
  if (r.indexOf("OK") == -1)
    return false;
  sendAT("ATE0", 500);
  sendAT("AT+CMGF=1", 500);
  simReady = true;
  return true;
}

bool sendSMS(String number, String message) {
  number = normalizePhoneNumber(number);
  setDebug("Sending SMS to " + number);
  sendAT("AT+CMGS=\"" + number + "\"", 1000);
  simSerial.print(message);
  simSerial.write(26);
  delay(3000);
  return true;
}

bool makeCall(String number, unsigned long callDurationMs) {
  number = normalizePhoneNumber(number);
  setDebug("Calling " + number);
  sendAT("ATD" + number + ";", 1000);
  delay(callDurationMs);
  sendAT("ATH", 1000);
  return true;
}

// ---------------- WEB ROUTES ----------------
void handleRoot() {
  String h = "<html><head><meta name='viewport' content='width=device-width, "
             "initial-scale=1'><title>KAVACH "
             "HARDWARE</"
             "title><style>body{font-family:sans-serif;padding:20px;background:"
             "#f0f4f8} "
             ".card{background:#fff;padding:20px;border-radius:15px;box-shadow:"
             "0 4px 10px rgba(0,0,0,0.1)} "
             "button{padding:15px;width:100%;background:#4f46e5;color:#fff;"
             "border:none;border-radius:10px;font-weight:bold;margin:10px 0} "
             ".sos{background:#dc2626}</style></head><body>";
  h += "<div class='card'><h1>KAVACH PRO</h1><p>Status: " +
       String(wifiConnected ? "Connected" : "Setup Mode") + "</p>";
  h += "<h3>Cloud Sync: Active</h3><p>Server: Render Cloud</p>";
  h += "<button class='sos' "
       "onclick=\"fetch('/emergency',{method:'POST'})\">TRIGGER SOS</button>";
  h += "</div></body></html>";
  server.send(200, "text/html", h);
}

void handleEmergency() {
  triggerEmergency("Web Dashboard Button");
  server.send(200, "application/json", "{\"status\":\"Triggered\"}");
}

// ---------------- SETUP & LOOP ----------------
void setup() {
  Serial.begin(115200);
  gpsSerial.begin(9600, SERIAL_8N1, 16, 17);
  simSerial.begin(9600, SERIAL_8N1, 27, 26);
  pinMode(emergencyButtonPin, INPUT_PULLUP);

  ring.begin();
  ring.setBrightness(100);
  ringOff();
  buzzerOff();

  loadCredentials();
  loadContacts();
  loadSettings();

  WiFi.softAP(apSSID, apPassword); // Create AP for setup
  if (savedSSID.length() > 0)
    connectToRouter(savedSSID, savedPASS, 10000);

  initSIM800L();

  server.on("/", HTTP_GET, handleRoot);
  server.on("/emergency", HTTP_POST, handleEmergency);
  server.begin();

  setDebug("Kavach Hardware Ready!");
}

void loop() {
  server.handleClient();
  updateGPSData();
  updateLedPattern();
  updateBuzzerPattern();
  trySendEmergencySMSAndCall();

  // Periodic Cloud Sync
  if (millis() - lastCloudSync >= cloudSyncInterval) {
    lastCloudSync = millis();
    syncToRenderCloud();
  }

  // Physical Button Logic
  bool reading = digitalRead(emergencyButtonPin);
  if (reading != lastButtonReading) {
    lastDebounceTime = millis();
    lastButtonReading = reading;
  }
  if ((millis() - lastDebounceTime) > debounceDelay) {
    if (reading != stableButtonState) {
      stableButtonState = reading;
      if (stableButtonState == LOW)
        triggerEmergency("Physical Button");
    }
  }

  // Periodic SIM Checks
  if (millis() - lastSimSignalCheck > 15000) {
    lastSimSignalCheck = millis();
    initSIM800L(); // Just to keep it alive
  }
}
