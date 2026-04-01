// ==========================================
// 1. INITIAL GPS COORDINATES (Edit here!)
// ==========================================
// Change these to your starting point (e.g., your city)
let latitude = 21.1702;
let longitude = 72.8311;

// ==========================================
// 2. HARDWARE OVERRIDE FLAG
// ==========================================
// When hardware sends data, this becomes true automatically
let isHardwareEnabled = false; 
let lastUpdateTime = new Date().toISOString();

/**
 * SIMULATOR LOGIC: 
 * This function adds a tiny random movement to the marker 
 * so it looks "live" on the map during the demo.
 */
function updateSimulatedLocation() {
    if (!isHardwareEnabled) {
        // Apply a small random offset to simulate movement
        latitude += (Math.random() - 0.5) * 0.0005;
        longitude += (Math.random() - 0.5) * 0.0005;
        lastUpdateTime = new Date().toISOString();
        // console.log(`Simulated GPS: LAT: ${latitude}, LNG: ${longitude}`);
    }
}

// Update simulation every 5 seconds
let simulationInterval = setInterval(updateSimulatedLocation, 5000);

/**
 * Returns current location to the Backend API
 */
function getLatestLocation() {
    return {
        latitude: parseFloat(latitude.toFixed(6)),
        longitude: parseFloat(longitude.toFixed(6)),
        timestamp: lastUpdateTime,
        isReal: isHardwareEnabled
    };
}

/**
 * This function is called by server.js when real 
 * hardware data arrives at the /api/location endpoint.
 */
function updateRealLocation(newLat, newLng) {
    latitude = parseFloat(newLat);
    longitude = parseFloat(newLng);
    lastUpdateTime = new Date().toISOString();
    
    if (!isHardwareEnabled) {
        isHardwareEnabled = true;
        console.log(">>> [ALERT] Real Hardware GPS data detected! Stopping simulation.");
        // Note: The simulator loop above (line 30) stops moving the marker 
        // because of the check on line 18.
    }
}

module.exports = {
    getLatestLocation,
    updateRealLocation
};
