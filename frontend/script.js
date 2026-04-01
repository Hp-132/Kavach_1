// Global Variables
let map, marker, circle;
let currentUser = null;
let flashlightOn = false;
let sirenOn = false;
const UPDATE_INTERVAL = 3000; // 3 seconds

// On Load
document.addEventListener('DOMContentLoaded', () => {
    checkSession();
    initForms();

    // Start polling location regardless to keep the simulation "alive" for the demo
    setInterval(updateLocation, UPDATE_INTERVAL);
});

async function checkSession() {
    try {
        const response = await fetch('/api/auth/session');
        const data = await response.json();
        if (data.user) {
            currentUser = data.user;
            document.getElementById('user-display-name').innerText = `Hello, ${currentUser.name}`;
            showScreen('dashboard');
            document.getElementById('main-nav').classList.remove('hidden');
            initMap();
        } else {
            showScreen('login');
        }
    } catch (e) {
        showScreen('login');
    }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${screenId}-screen`).classList.remove('hidden');

    // Update nav active state
    document.querySelectorAll('.nav-links a').forEach(a => a.classList.remove('active'));
    const navEl = document.getElementById(`nav-${screenId}`);
    if (navEl) navEl.classList.add('active');

    // Trigger specific screen updates
    if (screenId === 'contacts') loadContacts();
    if (screenId === 'history') loadHistory();
    if (screenId === 'dashboard' && map) setTimeout(() => map.invalidateSize(), 100);
}

// Map Functions
function initMap() {
    if (map) return;

    // Default location (Surat)
    const initialPos = [21.1702, 72.8311];
    map = L.map('map').setView(initialPos, 15);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    marker = L.marker(initialPos).addTo(map).bindPopup("Current Location").openPopup();
    circle = L.circle(initialPos, { radius: 100, color: 'red', fillColor: '#f03', fillOpacity: 0.1 }).addTo(map);
}

async function updateLocation() {
    try {
        const response = await fetch('/api/location');
        const data = await response.json();

        const { latitude, longitude, timestamp, isReal } = data;

        // Update UI
        document.getElementById('lat-val').innerText = latitude;
        document.getElementById('lng-val').innerText = longitude;
        document.getElementById('time-val').innerText = new Date(timestamp).toLocaleString();
        document.getElementById('gmaps-link').href = `https://maps.google.com/?q=${latitude},${longitude}`;

        // Update GPS Status Badge
        const statusBadge = document.getElementById('gps-status-badge');
        if (isReal) {
            statusBadge.innerHTML = '<span style="background: #2a9d8f; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;"><i class="fas fa-check-circle"></i> Live Hardware Active</span>';
        } else {
            statusBadge.innerHTML = '<span style="background: #e67e22; padding: 4px 8px; border-radius: 4px; font-size: 0.8rem;"><i class="fas fa-satellite"></i> Simulation Mode Active</span>';
        }

        // Update Map
        if (map && marker) {
            const newPos = [latitude, longitude];
            marker.setLatLng(newPos);
            circle.setLatLng(newPos);
        }
    } catch (e) {
        console.error("Location update failed", e);
    }
}

function centerMap() {
    const lat = parseFloat(document.getElementById('lat-val').innerText);
    const lng = parseFloat(document.getElementById('lng-val').innerText);
    if (map && !isNaN(lat)) {
        map.setView([lat, lng], 16, { animate: true });
    }
}

// Authentication
function initForms() {
    document.getElementById('login-form').onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-password').value;

        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        const data = await res.json();
        if (res.ok) {
            window.location.reload();
        } else {
            showAlert('Login Failed', data.error);
        }
    };

    document.getElementById('register-form').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;

        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });

        if (res.ok) {
            showAlert('Success', 'Account created! Please login.');
            showScreen('login');
        } else {
            const data = await res.json();
            showAlert('Registration Error', data.error);
        }
    };

    document.getElementById('contact-form').onsubmit = async (e) => {
        e.preventDefault();
        const name = document.getElementById('contact-name').value;
        const phone = document.getElementById('contact-phone').value;
        const smsEnabled = document.getElementById('contact-sms').checked;
        const callEnabled = document.getElementById('contact-call').checked;

        const res = await fetch('/api/contacts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, phone, smsEnabled, callEnabled })
        });

        if (res.ok) {
            const contactData = await res.json();
            document.getElementById('contact-form').reset();
            loadContacts();

            // Add to SMS Simulation (as a system note)
            addSMSBubble(`SYSTEM: Trusted contact '${contactData.name}' added with services: ${smsEnabled ? 'SMS ' : ''}${callEnabled ? '[PRIMARY CALLER]' : ''}`, 'received');
        }
    };

    document.getElementById('sos-btn').onclick = triggerSOS;
}

async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.reload();
}

// SOS Logic
async function triggerSOS() {
    const btn = document.getElementById('sos-btn');
    btn.style.animation = 'none';
    btn.style.background = '#880000';
    btn.innerText = 'WAITING...';

    try {
        const response = await fetch('/api/sos/trigger', { method: 'POST' });
        const data = await response.json();

        if (response.ok) {
            showAlert('🚨 EMERGENCY TRIGGERED', 'Priority SOS messages and calls initiated.');

            // Display individually for each contact in SMS simulator
            data.logs.forEach(log => {
                const text = `TO: ${log.contact}\n${log.message}`;
                addSMSBubble(text, 'sent');
                if (log.callInitiated) {
                    addSMSBubble(`SYSTEM: Voice call successfully initiated to ${log.contact}.`, 'received');
                }
            });
        }
    } catch (e) {
        showAlert('Error', 'Could not reach server.');
    } finally {
        setTimeout(() => {
            btn.style.animation = 'pulse 2s infinite';
            btn.style.background = 'var(--primary-color)';
            btn.innerHTML = 'SOS <span>Hold for Emergency</span>';
        }, 3000);
    }
}

// SMS Simulation UI update
function addSMSBubble(text, type = 'sent') {
    const container = document.getElementById('sms-container');
    const bubble = document.createElement('div');
    bubble.className = `bubble ${type}`;

    // Safety check and URL to Link conversion
    const linkedText = text.replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" style="color: inherit; text-decoration: underline; font-weight: 700;">$1</a>');
    bubble.innerHTML = linkedText.replace(/\n/g, '<br>'); // Handle newlines with innerHTML

    container.appendChild(bubble);
    container.scrollTop = container.scrollHeight;
}

// Contacts Loader
async function loadContacts() {
    const list = document.getElementById('contact-list');
    list.innerHTML = 'Loading...';

    const res = await fetch('/api/contacts');
    const data = await res.json();

    list.innerHTML = '';
    if (data.length === 0) {
        list.innerHTML = '<p style="color: grey">No contacts added yet.</p>';
    }

    data.forEach(c => {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.innerHTML = `
            <div style="flex: 1;">
                <strong>${c.name}</strong><br>
                <small>${c.phone}</small>
                <div style="display: flex; gap: 0.5rem; margin-top: 0.3rem;">
                    ${c.smsEnabled ? '<span style="font-size: 0.65rem; background: #333; padding: 2px 6px; border-radius: 4px; color: #aaa;">SMS</span>' : ''}
                    ${c.callEnabled ? '<span style="font-size: 0.65rem; background: var(--primary-color); padding: 2px 6px; border-radius: 4px; color: white;">CALLER</span>' : ''}
                </div>
            </div>
            <button onclick="deleteContact(${c.id})" style="background: none; border: none; color: #ff6b6b; cursor: pointer; padding: 0.5rem;"><i class="fas fa-trash"></i></button>
        `;
        list.appendChild(div);
    });
}

async function deleteContact(id) {
    await fetch(`/api/contacts/${id}`, { method: 'DELETE' });
    loadContacts();
}

// History Loader
async function loadHistory() {
    const tbody = document.getElementById('history-table-body');
    tbody.innerHTML = '<tr><td colspan="4">Loading...</td></tr>';

    const res = await fetch('/api/location/history');
    const data = await res.json();

    tbody.innerHTML = '';
    data.forEach(row => {
        const tr = document.createElement('tr');
        tr.style.borderBottom = '1px solid #222';
        const link = `https://maps.google.com/?q=${row.latitude},${row.longitude}`;
        tr.innerHTML = `
            <td style="padding: 1rem;">${new Date(row.timestamp).toLocaleString()}</td>
            <td style="padding: 1rem;">${row.latitude}</td>
            <td style="padding: 1rem;">${row.longitude}</td>
            <td style="padding: 1rem;"><a href="${link}" target="_blank" style="color: var(--primary-color)">Link</a></td>
        `;
        tbody.appendChild(tr);
    });
}

// Hardware Simulation UI
function toggleFlashlight() {
    flashlightOn = !flashlightOn;
    document.getElementById('flashlight-status').className = flashlightOn ? 'flashlight-indicator flashlight-on' : 'flashlight-indicator';
    // Simulation: Log to hardware status or console
    console.log(`Hardware Flashlight: ${flashlightOn ? 'ON' : 'OFF'}`);
}

function toggleSiren() {
    sirenOn = !sirenOn;
    const icon = document.getElementById('siren-icon');
    if (sirenOn) {
        icon.className = 'fas fa-volume-up siren-active';
        console.log("Hardware Siren: ACTIVATED");
    } else {
        icon.className = 'fas fa-volume-up siren-indicator';
        console.log("Hardware Siren: DEACTIVATED");
    }
}

// Modal helper
function showAlert(title, message) {
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-message').innerText = message;
    document.getElementById('alert-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('alert-modal').classList.add('hidden');
}
