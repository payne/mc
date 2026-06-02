// Ham Radio Callsign Lookup App

const STORAGE_KEY = 'qrz_callsign_cache';
const RESULTS_KEY = 'qrz_results';

// State
let results = [];
let map = null;
let markers = {};

// DOM Elements
const callsignInput = document.getElementById('callsign-input');
const lookupBtn = document.getElementById('lookup-btn');
const statusMessage = document.getElementById('status-message');
const resultsTable = document.getElementById('results-table');
const resultsBody = document.getElementById('results-body');
const emptyMessage = document.getElementById('empty-message');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  initMap();
  loadResults();
  renderTable();
  updateMapMarkers();
});

// Event Listeners
lookupBtn.addEventListener('click', handleLookup);
callsignInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleLookup();
});

// Initialize Leaflet Map
function initMap() {
  map = L.map('map').setView([39.8283, -98.5795], 4); // Center of USA

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);
}

// Load results from localStorage
function loadResults() {
  try {
    const saved = localStorage.getItem(RESULTS_KEY);
    if (saved) {
      results = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to load results:', e);
    results = [];
  }
}

// Save results to localStorage
function saveResults() {
  try {
    localStorage.setItem(RESULTS_KEY, JSON.stringify(results));
  } catch (e) {
    console.error('Failed to save results:', e);
  }
}

// Get cached callsign data
function getCachedCallsign(callsign) {
  try {
    const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    const key = callsign.toUpperCase();
    const entry = cache[key];

    if (entry) {
      // Cache entries expire after 7 days
      const weekMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - entry.timestamp < weekMs) {
        return entry.data;
      }
    }
  } catch (e) {
    console.error('Cache read error:', e);
  }
  return null;
}

// Cache callsign data
function cacheCallsign(callsign, data) {
  try {
    const cache = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    cache[callsign.toUpperCase()] = {
      data: data,
      timestamp: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error('Cache write error:', e);
  }
}

// Parse callsigns from input (comma or whitespace separated)
function parseCallsigns(input) {
  return input
    .toUpperCase()
    .split(/[\s,]+/)
    .map(c => c.trim())
    .filter(c => c.length > 0);
}

// Handle callsign lookup
async function handleLookup() {
  const callsigns = parseCallsigns(callsignInput.value);

  if (callsigns.length === 0) {
    showStatus('Please enter at least one callsign', 'error');
    return;
  }

  lookupBtn.disabled = true;

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;
  const errors = [];

  for (let i = 0; i < callsigns.length; i++) {
    const callsign = callsigns[i];
    showStatus(`Looking up ${callsign}... (${i + 1}/${callsigns.length})`, '');

    // Check if already in results
    if (results.some(r => r.callsign === callsign)) {
      skipCount++;
      continue;
    }

    // Check cache first
    const cached = getCachedCallsign(callsign);
    if (cached) {
      addResult(cached);
      successCount++;
      continue;
    }

    // Lookup via API
    try {
      const response = await fetch('/api/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callsign })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Lookup failed');
      }

      cacheCallsign(callsign, data);
      addResult(data);
      successCount++;
    } catch (error) {
      errorCount++;
      errors.push(`${callsign}: ${error.message}`);
    }
  }

  // Build status message
  const parts = [];
  if (successCount > 0) parts.push(`${successCount} found`);
  if (skipCount > 0) parts.push(`${skipCount} skipped (already in table)`);
  if (errorCount > 0) parts.push(`${errorCount} failed`);

  const statusType = errorCount > 0 ? (successCount > 0 ? '' : 'error') : 'success';
  let message = parts.join(', ');
  if (errors.length > 0 && errors.length <= 3) {
    message += ': ' + errors.join('; ');
  }

  showStatus(message, statusType);
  callsignInput.value = '';
  lookupBtn.disabled = false;
}

// Add result to table (at top)
function addResult(data) {
  results.unshift(data);
  saveResults();
  renderTable();
  updateMapMarkers();
}

// Remove result
function removeResult(callsign) {
  results = results.filter(r => r.callsign !== callsign);
  saveResults();
  renderTable();
  updateMapMarkers();
}

// Render the results table
function renderTable() {
  resultsBody.innerHTML = '';

  if (results.length === 0) {
    resultsTable.classList.remove('has-data');
    emptyMessage.classList.remove('hidden');
    return;
  }

  resultsTable.classList.add('has-data');
  emptyMessage.classList.add('hidden');

  results.forEach((result, index) => {
    const row = document.createElement('tr');
    row.dataset.callsign = result.callsign;

    row.innerHTML = `
      <td class="callsign-cell">${escapeHtml(result.callsign)}</td>
      <td contenteditable="true" data-field="name">${escapeHtml(result.name)}</td>
      <td contenteditable="true" data-field="address">${escapeHtml(result.address)}</td>
      <td><button class="delete-btn" data-callsign="${escapeHtml(result.callsign)}">Delete</button></td>
    `;

    // Handle edits
    row.querySelectorAll('[contenteditable="true"]').forEach(cell => {
      cell.addEventListener('blur', () => handleCellEdit(result.callsign, cell));
      cell.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          cell.blur();
        }
      });
    });

    // Handle delete
    row.querySelector('.delete-btn').addEventListener('click', () => {
      removeResult(result.callsign);
    });

    resultsBody.appendChild(row);
  });
}

// Handle cell edit
async function handleCellEdit(callsign, cell) {
  const field = cell.dataset.field;
  const newValue = cell.textContent.trim();

  const result = results.find(r => r.callsign === callsign);
  if (!result) return;

  const oldValue = result[field];
  if (newValue === oldValue) return;

  result[field] = newValue;

  // If address changed, geocode it
  if (field === 'address') {
    showStatus(`Updating location for ${callsign}...`, '');
    try {
      const coords = await geocodeAddress(newValue);
      if (coords) {
        result.lat = coords.lat;
        result.lon = coords.lon;
        showStatus(`Location updated for ${callsign}`, 'success');
      } else {
        showStatus(`Could not geocode address for ${callsign}`, 'error');
      }
    } catch (e) {
      showStatus(`Geocoding failed: ${e.message}`, 'error');
    }
    updateMapMarkers();
  }

  saveResults();
}

// Geocode address using Nominatim
async function geocodeAddress(address) {
  if (!address) return null;

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`;

  const response = await fetch(url, {
    headers: { 'User-Agent': 'QRZ-Callsign-Lookup/1.0' }
  });

  const data = await response.json();

  if (data && data.length > 0) {
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon)
    };
  }

  return null;
}

// Update map markers
function updateMapMarkers() {
  // Remove existing markers
  Object.values(markers).forEach(marker => map.removeLayer(marker));
  markers = {};

  // Add markers for results with coordinates
  const bounds = [];

  results.forEach(result => {
    if (result.lat && result.lon) {
      const marker = L.marker([result.lat, result.lon])
        .addTo(map)
        .bindPopup(`<strong>${escapeHtml(result.callsign)}</strong><br>${escapeHtml(result.name)}<br>${escapeHtml(result.address)}`);

      markers[result.callsign] = marker;
      bounds.push([result.lat, result.lon]);
    }
  });

  // Fit map to bounds if we have markers
  if (bounds.length > 0) {
    if (bounds.length === 1) {
      map.setView(bounds[0], 10);
    } else {
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }
}

// Show status message
function showStatus(message, type) {
  statusMessage.textContent = message;
  statusMessage.className = type || '';
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
