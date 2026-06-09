// Ham Radio Callsign Lookup App

const STORAGE_KEY = 'qrz_callsign_cache';
const RESULTS_KEY = 'qrz_results';

// State
let results = [];
let map = null;
let markers = {};
let sortColumn = null;
let sortDirection = 'asc';
let filterText = '';
let distanceFromCallsign = '';
let distanceFromCoords = null;

// DOM Elements
const callsignInput = document.getElementById('callsign-input');
const lookupBtn = document.getElementById('lookup-btn');
const statusMessage = document.getElementById('status-message');
const resultsTable = document.getElementById('results-table');
const resultsBody = document.getElementById('results-body');
const emptyMessage = document.getElementById('empty-message');
const filterInput = document.getElementById('filter-input');
const distanceFromInput = document.getElementById('distance-from-input');
const distanceHeader = document.getElementById('distance-header');
const manualCallInput = document.getElementById('manual-call');
const manualNameInput = document.getElementById('manual-name');
const manualAddressInput = document.getElementById('manual-address');
const manualAddBtn = document.getElementById('manual-add-btn');

// Menu elements
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

// Sortable table headers
document.querySelectorAll('th[data-sort]').forEach(th => {
  th.addEventListener('click', () => sortResults(th.dataset.sort));
});

// Filter input
filterInput.addEventListener('input', (e) => {
  filterText = e.target.value.toLowerCase();
  renderTable();
});

// Distance from input
distanceFromInput.addEventListener('input', handleDistanceFromChange);

// Manual add button
manualAddBtn.addEventListener('click', handleManualAdd);

// Menu event listeners
menuReset.addEventListener('click', (e) => {
  e.preventDefault();
  handleReset();
});
menuDownload.addEventListener('click', (e) => {
  e.preventDefault();
  handleDownloadCSV();
});
menuImport.addEventListener('change', handleImportCSV);
menuAbout.addEventListener('click', (e) => {
  e.preventDefault();
  aboutModal.classList.remove('hidden');
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

// Handle manual add
function handleManualAdd() {
  const callsign = manualCallInput.value.trim().toUpperCase();
  if (!callsign) {
    showStatus('Please enter a callsign', 'error');
    return;
  }
  if (results.some(r => r.callsign === callsign)) {
    showStatus(`${callsign} is already in the list`, 'error');
    return;
  }
  addResult({
    callsign,
    name: manualNameInput.value.trim(),
    address: manualAddressInput.value.trim(),
    lat: null,
    lon: null,
  });
  manualCallInput.value = '';
  manualNameInput.value = '';
  manualAddressInput.value = '';
  showStatus(`Added ${callsign}`, 'success');
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

// Sort results by column
function sortResults(column) {
  if (sortColumn === column) {
    sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
  } else {
    sortColumn = column;
    sortDirection = 'asc';
  }
  renderTable();
}

// Get filtered results
function getFilteredResults() {
  if (!filterText) return results;

  return results.filter(r => {
    const callsign = (r.callsign || '').toLowerCase();
    const name = (r.name || '').toLowerCase();
    const address = (r.address || '').toLowerCase();
    return callsign.includes(filterText) ||
           name.includes(filterText) ||
           address.includes(filterText);
  });
}

// Get sorted results (applies to filtered results)
function getSortedResults() {
  const filtered = getFilteredResults();
  if (!sortColumn) return filtered;

  return [...filtered].sort((a, b) => {
    let valA, valB;

    if (sortColumn === 'distance' && distanceFromCoords) {
      valA = (a.lat && a.lon) ? haversineDistance(a.lat, a.lon, distanceFromCoords.lat, distanceFromCoords.lon) : Infinity;
      valB = (b.lat && b.lon) ? haversineDistance(b.lat, b.lon, distanceFromCoords.lat, distanceFromCoords.lon) : Infinity;
    } else {
      valA = a[sortColumn] || '';
      valB = b[sortColumn] || '';
      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();
    }

    if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
    if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });
}

// Update sort indicators in table headers
function updateSortIndicators() {
  const headers = resultsTable.querySelectorAll('th[data-sort]');
  headers.forEach(th => {
    th.classList.remove('sort-asc', 'sort-desc');
    if (th.dataset.sort === sortColumn) {
      th.classList.add(sortDirection === 'asc' ? 'sort-asc' : 'sort-desc');
    }
  });
}

// Render the results table
function renderTable() {
  resultsBody.innerHTML = '';

  distanceHeader.classList.toggle('hidden', !distanceFromCoords);

  if (results.length === 0) {
    resultsTable.classList.remove('has-data');
    emptyMessage.classList.remove('hidden');
    return;
  }

  resultsTable.classList.add('has-data');
  emptyMessage.classList.add('hidden');
  updateSortIndicators();

  const sortedResults = getSortedResults();
  sortedResults.forEach((result, index) => {
    const row = document.createElement('tr');
    row.dataset.callsign = result.callsign;

    const distanceTd = distanceFromCoords
      ? `<td class="distance-cell">${result.lat && result.lon ? haversineDistance(result.lat, result.lon, distanceFromCoords.lat, distanceFromCoords.lon).toFixed(1) + ' mi' : '—'}</td>`
      : '';

    row.innerHTML = `
      <td class="callsign-cell">${escapeHtml(result.callsign)}</td>
      <td contenteditable="true" data-field="name">${escapeHtml(result.name)}</td>
      <td contenteditable="true" data-field="address">${escapeHtml(result.address)}</td>
      ${distanceTd}
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

// Haversine distance between two lat/lon points, in miles
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3958.8;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Handle distance-from callsign input change
function handleDistanceFromChange() {
  const callsign = distanceFromInput.value.trim().toUpperCase();
  distanceFromCallsign = callsign;

  const match = callsign ? results.find(r => r.callsign === callsign && r.lat && r.lon) : null;
  distanceFromCoords = match ? { lat: match.lat, lon: match.lon } : null;

  renderTable();
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
}

// Download CSV
function handleDownloadCSV() {
  if (results.length === 0) {
    showStatus('No data to download', 'error');
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
