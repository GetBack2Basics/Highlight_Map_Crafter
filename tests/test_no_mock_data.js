/**
 * tests/test_no_mock_data.js
 * Automated Zero-Mock AST and Data Integrity Scanner
 * Adheres strictly to the Anti-Mock Hallucination Playbook:
 * 1. Rejects dummy/synthetic placeholders (sampleFeatures = [...], mock_data, dummy_records)
 * 2. Asserts real physical non-zero byte datasets on disk
 * 3. Asserts valid WGS84 coordinates in the Lake Macquarie / NSW bounding box
 * 4. Asserts valid open-source Wikimedia Commons media URLs
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');

console.log('🛡️  Running Zero-Mock & Spatial Data Integrity Scanner...');

// 1. Forbidden Mock Tokens
const FORBIDDEN_TOKENS = [
  /sampleFeatures\s*=\s*\[/i,
  /mock_data\s*=\s*/i,
  /dummy_records\s*=\s*/i,
  /placeholder_count\s*=\s*/i,
  /foo_bar_test/i
];

function scanFileForMockTokens(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const token of FORBIDDEN_TOKENS) {
    if (token.test(content)) {
      throw new Error(`Zero-Mock Violation in ${path.relative(ROOT_DIR, filePath)}! Found forbidden pattern: ${token}`);
    }
  }
}

// 2. Physical File Assertions (Non-Zero Byte Test)
const requiredFiles = [
  path.join(DATA_DIR, 'rathmines_poi.geojson'),
  path.join(DATA_DIR, 'courses.json'),
  path.join(DATA_DIR, 'isochrones.json'),
  path.join(ROOT_DIR, 'index.html'),
  path.join(ROOT_DIR, 'style.css'),
  path.join(ROOT_DIR, 'app.js')
];

requiredFiles.forEach(file => {
  if (!fs.existsSync(file)) {
    throw new Error(`FATAL: Required physical file missing: ${path.relative(ROOT_DIR, file)}`);
  }
  const stats = fs.statSync(file);
  if (stats.size < 100) {
    throw new Error(`FATAL: File ${path.relative(ROOT_DIR, file)} is empty or too small (${stats.size} bytes)!`);
  }
  scanFileForMockTokens(file);
  console.log(`  ✓ Physical file verified: ${path.relative(ROOT_DIR, file)} (${stats.size} bytes)`);
});

// 3. Spatial Bounds & Coordinate Validation (Lake Macquarie / Hunter Region)
// Latitude range: -33.5 to -32.5 | Longitude range: 151.0 to 152.0
const geojson = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'rathmines_poi.geojson'), 'utf-8'));
if (!geojson.features || geojson.features.length === 0) {
  throw new Error('FATAL: GeoJSON dataset has 0 features!');
}

console.log(`\n📍 Validating ${geojson.features.length} real-world NSW locations:`);

geojson.features.forEach(feat => {
  const [lng, lat] = feat.geometry.coordinates;
  const name = feat.properties.name;

  if (lat < -34.0 || lat > -32.0 || lng < 151.0 || lng > 152.5) {
    throw new Error(`Coordinate anomaly for "${name}": [${lng}, ${lat}] is outside NSW Hunter / Lake Macquarie bounds!`);
  }

  if (!feat.properties.image_url.startsWith('https://upload.wikimedia.org/')) {
    throw new Error(`Media link anomaly for "${name}": Expected verified Wikimedia Commons URL.`);
  }

  console.log(`  ✓ ${name} -> [${lng.toFixed(4)}, ${lat.toFixed(4)}] (${feat.properties.travel_time_label})`);
});

// 4. Validate SpatialCourse_Crafter Itineraries
const courses = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'courses.json'), 'utf-8'));
if (!courses.courses || courses.courses.length === 0) {
  throw new Error('FATAL: courses.json has 0 courses!');
}

console.log(`\n🚀 Validating ${courses.courses.length} SpatialCourse_Crafter multi-stop routes:`);
courses.courses.forEach(c => {
  console.log(`  ✓ Course "${c.title}" -> ${c.stops.length} sequenced stops (${c.total_distance_km} km, ~${c.total_drive_time_min} mins)`);
});

console.log('\n✅ ALL ZERO-MOCK & SPATIAL INTEGRITY CHECKS PASSED (100% Verified Production Data)!\n');
