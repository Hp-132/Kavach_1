let latitude = 21.1702;
let longitude = 72.8311;
let isHardwareEnabled = false;
let lastUpdateTime = new Date().toISOString();

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

function getLatestLocation() {
    return {
        latitude: parseFloat(latitude.toFixed(6)),
        longitude: parseFloat(longitude.toFixed(6)),
        timestamp: lastUpdateTime,
        isReal: isHardwareEnabled
    };
}

function updateRealLocation(newLat, newLng) {
    latitude = parseFloat(newLat);
    longitude = parseFloat(newLng);
    lastUpdateTime = new Date().toISOString();
    
    if (!isHardwareEnabled) {
        isHardwareEnabled = true;
        console.log("Hardware GPS data received. Stopping simulator.");
        // We could clearInterval here, but let's just keep the flag check 
        // to handle cases where hardware might drop out later
    }
}

module.exports = {
    getLatestLocation,
    updateRealLocation
};
