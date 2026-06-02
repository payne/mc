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

// Menu elements
const menuBtn = document.getElementById('menu-btn');
const menu = document.getElementById('menu');
const menuReset = document.getElementById('menu-reset');
const menuDownload = document.getElementById('menu-download');
const menuImport = document.getElementById('menu-import');
const menuAbout = document.getElementById('menu-about');
const aboutModal = document.getElementById('about-modal');
const aboutClose = document.getElementById('about-close');

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

// Menu helpers
function showMenu() {
  menu.classList.remove('hidden');
  menu.style.display = 'block';
}

function hideMenu() {
  hideMenu();
  menu.style.display = 'none';
}

// Menu event listeners
menuBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (menu.classList.contains('hidden')) {
    showMenu();
  } else {
    hideMenu();
  }
});

document.addEventListener('click', () => {
  hideMenu();
});

menu.addEventListener('click', (e) => {
  e.stopPropagation();
});

menuReset.addEventListener('click', handleReset);
menuDownload.addEventListener('click', handleDownloadCSV);
menuImport.addEventListener('change', handleImportCSV);
menuAbout.addEventListener('click', () => {
  aboutModal.classList.remove('hidden');
  hideMenu();
});

aboutClose.addEventListener('click', () => {
  aboutModal.classList.add('hidden');
});

aboutModal.addEventListener('click', (e) => {
  if (e.target === aboutModal) {
    aboutModal.classList.add('hidden');
  }
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

// Reset - clear all data
function handleReset() {
  if (!confirm('This will clear all callsign data and cache. Continue?')) {
    return;
  }
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(RESULTS_KEY);
  results = [];
  renderTable();
  updateMapMarkers();
  showStatus('All data cleared', 'success');
  hideMenu();
}

// Download CSV
function handleDownloadCSV() {
  if (results.length === 0) {
    showStatus('No data to download', 'error');
    hideMenu();
    return;
  }

  const headers = ['Callsign', 'Name', 'Address', 'Latitude', 'Longitude'];
  const rows = results.map(r => [
    r.callsign,
    r.name,
    r.address,
    r.lat || '',
    r.lon || ''
  ]);

  const csvContent = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `callsigns-${new Date().toISOString().split('T')[0]}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);

  showStatus(`Downloaded ${results.length} callsigns`, 'success');
  hideMenu();
}

// Import CSV
function handleImportCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const text = e.target.result;
      const lines = text.split('\n').filter(line => line.trim());

      if (lines.length < 2) {
        showStatus('CSV file is empty or invalid', 'error');
        return;
      }

      // Parse header to find column indices
      const header = parseCSVLine(lines[0]).map(h => h.toLowerCase().trim());
      const callsignIdx = header.findIndex(h => h === 'callsign' || h === 'call');
      const nameIdx = header.findIndex(h => h === 'name');
      const addressIdx = header.findIndex(h => h === 'address');
      const latIdx = header.findIndex(h => h === 'latitude' || h === 'lat');
      const lonIdx = header.findIndex(h => h === 'longitude' || h === 'lon' || h === 'lng');

      if (callsignIdx === -1) {
        showStatus('CSV must have a Callsign column', 'error');
        return;
      }

      let importCount = 0;
      let skipCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const callsign = (values[callsignIdx] || '').toUpperCase().trim();

        if (!callsign) continue;

        // Skip if already exists
        if (results.some(r => r.callsign === callsign)) {
          skipCount++;
          continue;
        }

        const entry = {
          callsign: callsign,
          name: nameIdx >= 0 ? (values[nameIdx] || '') : '',
          address: addressIdx >= 0 ? (values[addressIdx] || '') : '',
          lat: latIdx >= 0 && values[latIdx] ? parseFloat(values[latIdx]) : null,
          lon: lonIdx >= 0 && values[lonIdx] ? parseFloat(values[lonIdx]) : null
        };

        results.unshift(entry);
        importCount++;
      }

      saveResults();
      renderTable();
      updateMapMarkers();

      const parts = [];
      if (importCount > 0) parts.push(`${importCount} imported`);
      if (skipCount > 0) parts.push(`${skipCount} skipped (duplicates)`);
      showStatus(parts.join(', ') || 'No new callsigns imported', importCount > 0 ? 'success' : '');
    } catch (err) {
      showStatus('Failed to parse CSV: ' + err.message, 'error');
    }
  };

  reader.readAsText(file);
  event.target.value = ''; // Reset file input
  hideMenu();
}

// Parse a CSV line handling quoted fields
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }

  result.push(current);
  return result;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
