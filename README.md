<<<<<<< HEAD
# Kavach_SOS1
Women safety device
=======
# KAVACH – Women Safety Smart Torch + Companion Web App

KAVACH is a smart safety ecosystem designed for women. It combines a hardware safety torch (ESP32 + GPS) with a modern web application to provide live tracking, SOS emergency alerts, and a comprehensive safety dashboard.

## Features

- **🛡️ 24/7 Live Monitoring**: Real-time tracking of GPS coordinates (Latitude, Longitude) on an interactive Leaflet map.
- **🚨 Priority SOS Alerts**: One-tap emergency alert sent to all trusted contacts with live location links.
- **📱 SMS Simulator**: A built-in mobile-style interface to monitor simulated emergency messages.
- **🛰️ Automated GPS Simulation**: If hardware is disconnected, the system automatically simulates movement (Starting at 21.1702, 72.8311).
- **📋 Emergency Contact Management**: Add and manage trusted contacts for instant notifications.
- **🏥 Safety Help Centre**: Quick access to national helpline numbers (112, 100, 181, 108).
- **⚡ Hardware Controls**: Simulation for flashlight and high-decibel siren.
- **📖 Location History**: Track previous coordinates and timestamps.

## Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (No React/Vite/JSX for Render compatibility).
- **Backend**: Node.js, Express.
- **Database**: SQLite3 (Local file-based persistence for prototype).
- **Maps**: Leaflet JS + OpenStreetMap API.
- **Hardware Integration**: ESP32 + TinyGPS++.

## Getting Started

### 1. Installation
Run the following command in the project root:
```bash
npm install
```

### 2. Run the Application (Locally)
```bash
npm run dev
```
Open your browser and navigate to: [http://localhost:3000](http://localhost:3000)

### 3. Hardware Integration (Optional)
Upload the code provided in `backend/esp32_code.ino` to your ESP32 device. Ensure the `serverUrl` matches your deployed URL or local IP address on the same network.

## Project Structure

- `/frontend`: All client-side code (HTML, CSS, script.js).
- `/backend`: Express server, GPS simulator, and authorization logic.
- `/backend/esp32_code.ino`: Example ESP32 sketch for GPS integration.
- `database.db`: SQLite database file (generated on first run).
- `package.json`: Main project configuration and dependencies.

## Deployment

This application is ready for deployment on **Render** or **Heroku**.
1. Connect your GitHub repository.
2. Select **Web Service**.
3. Use `npm start` as the build command.
4. Set Node.js as the runtime.

## Demo Video / Screenshots
*Note: Use the SOS button to see the mobile frame update with simulated SMS alerts.*

---
© 2026 KAVACH Safety. Built for Hackathon Prototype Presentation.
>>>>>>> 1287599 (Initial commit - Kavach safety app)
