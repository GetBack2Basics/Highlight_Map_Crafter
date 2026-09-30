/**
 * Rathmines & Lake Macquarie Explorer - Application Logic
 * Powered by MapLibre GL JS / GeoLibre & SpatialCourse_Crafter
 * Open-Source Routing via OpenStreetMap & Waze
 */

// Core Constants
const HUB_COORDINATES = [151.5847, -33.0428]; // [lng, lat] for 21 Bournville Road, Rathmines NSW
const DEFAULT_ZOOM = 12.5;
const CARTO_API_KEY = 'cb1_42iq_1_31ec03187623b42c014a792b';

// State Management
let map = null;
let poiData = [];
let coursesData = [];
let activeTab = 'poi'; // 'poi' | 'courses'
let activeZoneFilter = 'all';
let activeCategoryFilter = 'all';
let searchQuery = '';
let selectedPoi = null;
let activeCourse = null;
let showDistanceRings = true;
let markersMap = new Map();
let isAdminDragEnabled = false;
let isRelocatingActivePoi = false;

// Toast Notification Helper
function showToast(message, duration = 3200) {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `<span>${message}</span>`;
  toast.classList.add('show');

  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}

// Category Icon Mapping
const CATEGORY_ICONS = {
  hub: '📍',
  heritage: '🏛️',
  dining: '🍽️',
  essentials: '🥖',
  boating: '⛵',
  shopping: '🛍️',
  leisure: '⛳',
  nature: '🌳',
  beach: '🏄',
  wine: '🍷'
};

// Distance Rings Radii in Km (~10m, ~20m, ~45m, ~75m driving approximate circles)
const DISTANCE_RINGS_KM = [
  { radiusKm: 6.0, label: '~10–15 mins', color: 'rgba(0, 210, 255, 0.25)', borderColor: 'rgba(0, 210, 255, 0.6)' },
  { radiusKm: 14.0, label: '~20–30 mins', color: 'rgba(59, 130, 246, 0.15)', borderColor: 'rgba(59, 130, 246, 0.5)' },
  { radiusKm: 28.0, label: '~40–50 mins', color: 'rgba(168, 85, 247, 0.10)', borderColor: 'rgba(168, 85, 247, 0.4)' },
  { radiusKm: 55.0, label: '~60–75 mins', color: 'rgba(251, 113, 133, 0.08)', borderColor: 'rgba(251, 113, 133, 0.35)' }
];

// Basemap Configurations
const BASEMAP_STYLES = {
  'osm-standard': {
    source: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }
  },
  'osm-terrain': {
    source: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ, TomTom, Intermap, iPC, USGS, FAO, NPS, NRCAN, GeoBase, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community'
    }
  },
  'esri-imagery': {
    source: {
      type: 'raster',
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      tileSize: 256,
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    }
  },
  'carto-voyager': {
    source: {
      type: 'raster',
      tiles: [
        `https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?api_key=${CARTO_API_KEY}`,
        `https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?api_key=${CARTO_API_KEY}`,
        `https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?api_key=${CARTO_API_KEY}`
      ],
      tileSize: 256,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }
  }
};

let currentBasemap = 'osm-standard';

let is3DEnabled = true;

// Initialize Application
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await loadDatasets();
  setupEventListeners();
  renderCards();
});

// 1. Initialize MapLibre GL Map
function initMap() {
  map = new maplibregl.Map({
    container: 'map',
    style: {
      version: 8,
      sources: {
        'base-tile-source': BASEMAP_STYLES[currentBasemap].source
      },
      layers: [
        {
          id: 'base-tile-layer',
          type: 'raster',
          source: 'base-tile-source',
          minzoom: 0,
          maxzoom: 19
        }
      ]
    },
    center: HUB_COORDINATES,
    zoom: DEFAULT_ZOOM,
    pitch: 45,
    bearing: -10,
    maxPitch: 80
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

  map.on('load', () => {
    initElevationAndTerrain();
    addIsochronesLayer();
    addCourseRouteLayer();
    renderMarkers();
  });
}

// Initialize 3D Elevation DEM, Shaded Relief & Hillshade Layer
function initElevationAndTerrain() {
  try {
    // 1. 3D Terrain DEM Mesh (AWS Terrarium Elevation)
    if (!map.getSource('terrain-dem-source')) {
      map.addSource('terrain-dem-source', {
        type: 'raster-dem',
        tiles: ['https://elevation-tiles-prod.s3.amazonaws.com/terrarium/{z}/{x}/{y}.png'],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15
      });
    }

    if (is3DEnabled) {
      map.setTerrain({
        source: 'terrain-dem-source',
        exaggeration: 3.5
      });
    }

    // 2. High-Contrast 3D Shaded Relief Surface (Draped over basemap)
    if (!map.getSource('shaded-relief-source')) {
      map.addSource('shaded-relief-source', {
        type: 'raster',
        tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Shaded_Relief/MapServer/tile/{z}/{y}/{x}'],
        tileSize: 256,
        maxzoom: 13
      });
    }

    if (!map.getLayer('shaded-relief-layer')) {
      map.addLayer({
        id: 'shaded-relief-layer',
        type: 'raster',
        source: 'shaded-relief-source',
        layout: { visibility: is3DEnabled ? 'visible' : 'none' },
        paint: {
          'raster-opacity': 0.52,
          'raster-contrast': 0.35,
          'raster-fade-duration': 300
        }
      }, 'isochrones-glow');
    }

    // 3. Dynamic Hillshade Layer
    if (!map.getLayer('terrain-hillshade')) {
      map.addLayer({
        id: 'terrain-hillshade',
        type: 'hillshade',
        source: 'terrain-dem-source',
        layout: { visibility: is3DEnabled ? 'visible' : 'none' },
        paint: {
          'hillshade-shadow-color': '#020617',
          'hillshade-highlight-color': '#ffffff',
          'hillshade-accent-color': '#06b6d4',
          'hillshade-illumination-direction': 315,
          'hillshade-illumination-anchor': 'viewport',
          'hillshade-exaggeration': 0.95
        }
      }, 'shaded-relief-layer');
    }
  } catch (err) {
    console.warn('3D elevation setup note:', err);
  }
}

// Helper: Switch Basemap without resetting overlays
function switchBasemap(key) {
  if (!BASEMAP_STYLES[key] || key === currentBasemap) return;
  currentBasemap = key;

  if (map.getLayer('base-tile-layer')) {
    map.removeLayer('base-tile-layer');
  }
  if (map.getSource('base-tile-source')) {
    map.removeSource('base-tile-source');
  }

  map.addSource('base-tile-source', BASEMAP_STYLES[key].source);

  // Add base layer under shaded relief & isochrones
  const firstOverlayLayerId = map.getLayer('shaded-relief-layer') ? 'shaded-relief-layer' : (map.getLayer('terrain-hillshade') ? 'terrain-hillshade' : (map.getLayer('isochrones-glow') ? 'isochrones-glow' : undefined));
  map.addLayer(
    {
      id: 'base-tile-layer',
      type: 'raster',
      source: 'base-tile-source',
      minzoom: 0,
      maxzoom: 19
    },
    firstOverlayLayerId
  );
}

// LocalStorage Keys
const STORAGE_CUSTOM_POIS = 'rathmines_user_pois';
const STORAGE_HOST_TIPS = 'rathmines_host_tips';
const STORAGE_POI_COORDINATES = 'rathmines_poi_coordinates';

let isPickingLocation = false;
let pickMarker = null;

// Helper: Get Stored Relocated Coordinates Map
function getStoredCoordinates() {
  try {
    const raw = localStorage.getItem(STORAGE_POI_COORDINATES);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

// Helper: Save Relocated Coordinates
function savePoiCoordinateToStorage(poiIdOrName, coords) {
  const allCoords = getStoredCoordinates();
  allCoords[poiIdOrName] = coords;
  localStorage.setItem(STORAGE_POI_COORDINATES, JSON.stringify(allCoords));
}

// Helper: Get Stored Custom POIs
function getStoredCustomPois() {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_POIS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

// Helper: Save Custom POI
function saveCustomPoiToStorage(newFeature) {
  const existing = getStoredCustomPois();
  existing.push(newFeature);
  localStorage.setItem(STORAGE_CUSTOM_POIS, JSON.stringify(existing));
}

// Helper: Get Stored Host Tips
function getStoredHostTips() {
  try {
    const raw = localStorage.getItem(STORAGE_HOST_TIPS);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

// Helper: Save Host Tip for a POI
function saveHostTipToStorage(poiIdOrName, tipText) {
  const tips = getStoredHostTips();
  tips[poiIdOrName] = tipText;
  localStorage.setItem(STORAGE_HOST_TIPS, JSON.stringify(tips));
}

// Helper: Update Drawer Navigation Deep Links (OSM & Waze)
function updateDrawerNavigationLinks(coords) {
  const hubLng = HUB_COORDINATES[0];
  const hubLat = HUB_COORDINATES[1];
  const destLng = coords[0];
  const destLat = coords[1];

  const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${hubLat}%2C${hubLng}%3B${destLat}%2C${destLng}`;
  const wazeUrl = `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`;

  const btnOsm = document.getElementById('btn-nav-osm');
  const btnWaze = document.getElementById('btn-nav-waze');
  if (btnOsm) btnOsm.href = osmUrl;
  if (btnWaze) btnWaze.href = wazeUrl;
}

// Helper: Recalculate Travel Time & Zone when POI is relocated
function updatePoiTravelZoneFromHub(feature) {
  const [lng, lat] = feature.geometry.coordinates;
  const dLat = (lat - HUB_COORDINATES[1]) * 110.574;
  const dLng = (lng - HUB_COORDINATES[0]) * (111.32 * Math.cos(lat * Math.PI / 180));
  const distKm = Math.sqrt(dLat * dLat + dLng * dLng);

  if (feature.properties.id !== 'hub_bournville' && feature.properties.zone !== 'hub') {
    if (distKm <= 4) {
      feature.properties.zone = 'zone_5m';
      feature.properties.travel_time_label = '5 mins';
      feature.properties.zone_label = '5 mins';
    } else if (distKm <= 12) {
      feature.properties.zone = 'zone_15m';
      feature.properties.travel_time_label = '15 mins';
      feature.properties.zone_label = '15 mins';
    } else if (distKm <= 26) {
      feature.properties.zone = 'zone_30m';
      feature.properties.travel_time_label = '30 mins';
      feature.properties.zone_label = '30 mins';
    } else if (distKm <= 55) {
      feature.properties.zone = 'zone_1h';
      feature.properties.travel_time_label = '1 hour';
      feature.properties.zone_label = '1 hour';
    } else {
      feature.properties.zone = 'zone_2h';
      feature.properties.travel_time_label = '2 hours';
      feature.properties.zone_label = '2 hours';
    }
  }
}

let isochronesData = null;

// 2. Load Datasets with multi-path resolution and merge localStorage
async function loadDatasets() {
  const tryFetch = async (paths) => {
    for (const p of paths) {
      try {
        const res = await fetch(p);
        if (res.ok) return await res.json();
      } catch (e) {
        // try next
      }
    }
    throw new Error('Failed to load path from: ' + paths.join(', '));
  };

  try {
    const poiGeojson = await tryFetch(['data/rathmines_poi.geojson', './data/rathmines_poi.geojson', '../data/rathmines_poi.geojson']);
    const basePois = poiGeojson.features || [];
    const customPois = getStoredCustomPois();
    const hostTips = getStoredHostTips();
    const storedCoords = getStoredCoordinates();

    // Merge custom POIs
    poiData = [...basePois, ...customPois];

    // Apply stored host tips & relocated coordinates
    poiData.forEach(feat => {
      const idKey = feat.id || feat.properties.name;
      if (hostTips[idKey]) {
        feat.properties.personal_recommendation = hostTips[idKey];
      }
      if (storedCoords[idKey]) {
        feat.geometry.coordinates = storedCoords[idKey];
        updatePoiTravelZoneFromHub(feat);
      }
    });

    const coursesJson = await tryFetch(['data/courses.json', './data/courses.json', '../data/courses.json']);
    coursesData = coursesJson.courses || [];

    try {
      isochronesData = await tryFetch(['data/isochrones.json', './data/isochrones.json', '../data/isochrones.json']);
    } catch (isoErr) {
      console.warn('Could not load isochrones.json, falling back to dynamic generation:', isoErr);
    }
  } catch (err) {
    console.error('Error fetching datasets:', err);
  }
}

// 3. Helper: Generate Fallback GeoJSON polygon circle around hub if network fails
function createGeoJSONCircle(center, radiusInKm, points = 64) {
  const coords = {
    latitude: center[1],
    longitude: center[0]
  };
  const km = radiusInKm;
  const ret = [];
  const distanceX = km / (111.320 * Math.cos((coords.latitude * Math.PI) / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ret]
    },
    properties: { radiusKm: radiusInKm }
  };
}

// 4. Add Real Road-Network Driving Isochrones Layer (Boundary Outlines Without Color)
function addIsochronesLayer() {
  let features = [];
  if (isochronesData && isochronesData.features && isochronesData.features.length > 0) {
    features = isochronesData.features;
  }

  if (map.getSource('isochrones-source')) {
    map.getSource('isochrones-source').setData({
      type: 'FeatureCollection',
      features: features
    });
    return;
  }

  map.addSource('isochrones-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: features
    }
  });

  // Subtle boundary halo/glow for high legibility over OSM basemap
  map.addLayer({
    id: 'isochrones-glow',
    type: 'line',
    source: 'isochrones-source',
    layout: {
      visibility: showDistanceRings ? 'visible' : 'none',
      'line-cap': 'round',
      'line-join': 'round'
    },
    paint: {
      'line-color': [
        'match',
        ['get', 'time_minutes'],
        5, '#00d2ff',
        15, '#3b82f6',
        30, '#a855f7',
        60, '#fb7185',
        120, '#f59e0b',
        '#00d2ff'
      ],
      'line-width': 5,
      'line-opacity': 0.35,
      'line-blur': 2
    }
  });

  // Crisp, clean boundary outline (No fill color)
  map.addLayer({
    id: 'isochrones-line',
    type: 'line',
    source: 'isochrones-source',
    layout: {
      visibility: showDistanceRings ? 'visible' : 'none',
      'line-cap': 'round',
      'line-join': 'round'
    },
    paint: {
      'line-color': [
        'match',
        ['get', 'time_minutes'],
        5, '#00d2ff',
        15, '#3b82f6',
        30, '#a855f7',
        60, '#fb7185',
        120, '#f59e0b',
        '#00d2ff'
      ],
      'line-width': 2.2,
      'line-opacity': 0.95
    }
  });
}

// 5. Add Course Route Lines Layer (SpatialCourse_Crafter)
function addCourseRouteLayer() {
  map.addSource('course-route-source', {
    type: 'geojson',
    data: {
      type: 'FeatureCollection',
      features: []
    }
  });

  map.addLayer({
    id: 'course-route-glow',
    type: 'line',
    source: 'course-route-source',
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },
    paint: {
      'line-color': ['get', 'theme_color'],
      'line-width': 8,
      'line-opacity': 0.35,
      'line-blur': 4
    }
  });

  map.addLayer({
    id: 'course-route-line',
    type: 'line',
    source: 'course-route-source',
    layout: {
      'line-cap': 'round',
      'line-join': 'round'
    },
    paint: {
      'line-color': ['get', 'theme_color'],
      'line-width': 4,
      'line-opacity': 0.95
    }
  });
}

// 6. Render Custom Map Markers
function renderMarkers() {
  markersMap.forEach(marker => marker.remove());
  markersMap.clear();

  poiData.forEach(feature => {
    const props = feature.properties;
    const coords = feature.geometry.coordinates;
    const cat = props.category || 'nature';
    const isHub = props.id === 'hub_bournville' || props.zone === 'hub';
    const hasRec = Boolean(props.personal_recommendation);

    const el = document.createElement('div');
    el.className = `custom-map-marker marker-${isHub ? 'hub' : cat}`;
    if (isHub) {
      el.style.boxShadow = '0 0 20px #10b981, 0 4px 15px rgba(0,0,0,0.6)';
      el.style.border = '2.5px solid #34d399';
    } else if (hasRec) {
      el.style.boxShadow = '0 0 16px #ffb703, 0 4px 15px rgba(0,0,0,0.5)';
      el.style.border = '2px solid #ffb703';
    }
    el.innerHTML = `<span>${isHub ? '🏡' : (hasRec ? '⭐' : (CATEGORY_ICONS[cat] || '📍'))}</span>`;
    el.title = props.name + (hasRec ? ' (Host Recommendation)' : '');

    // Hover tooltip popup
    const popup = new maplibregl.Popup({ offset: 25, closeButton: false, closeOnClick: false })
      .setHTML(`
        <div class="popup-mini-title">${isHub ? '🏡 ' : ''}${props.name}</div>
        <div class="popup-mini-sub">${props.travel_time_label || ''} • ${props.category_label || ''}</div>
        ${hasRec && !isHub ? '<div style="font-size:0.7rem; color:#fef08a; margin-top:2px;">⭐ Host Recommended</div>' : ''}
      `);

    el.addEventListener('mouseenter', () => popup.addTo(map));
    el.addEventListener('mouseleave', () => popup.remove());

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectPoi(feature);
    });

    const isDraggable = isAdminDragEnabled;
    const marker = new maplibregl.Marker({
      element: el,
      draggable: isDraggable
    })
      .setLngLat(coords)
      .setPopup(popup)
      .addTo(map);

    marker.on('dragend', () => {
      const newLngLat = marker.getLngLat();
      const newLng = Number(newLngLat.lng.toFixed(5));
      const newLat = Number(newLngLat.lat.toFixed(5));
      const updatedCoords = [newLng, newLat];
      feature.geometry.coordinates = updatedCoords;
      const key = feature.id || feature.properties.name;
      savePoiCoordinateToStorage(key, updatedCoords);

      updatePoiTravelZoneFromHub(feature);

      if (selectedPoi && (selectedPoi.id === feature.id || selectedPoi.properties.name === feature.properties.name)) {
        selectedPoi.geometry.coordinates = updatedCoords;
        updateDrawerNavigationLinks(updatedCoords);
        document.getElementById('drawer-time-badge').textContent = feature.properties.travel_time_label || '~15 mins';
      }

      showToast(`📍 Relocated "${props.name}" to [${newLng}, ${newLat}]`);
      renderCards();
    });

    markersMap.set(feature.id || props.name, marker);
  });
}

// 7. Filter POIs based on search, zone, and category
function getFilteredPois() {
  return poiData.filter(feature => {
    const props = feature.properties;
    const matchesSearch = !searchQuery ||
      props.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      props.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (props.personal_recommendation && props.personal_recommendation.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (props.highlights && props.highlights.some(h => h.toLowerCase().includes(searchQuery.toLowerCase())));

    const matchesZone = activeZoneFilter === 'all' || props.zone === activeZoneFilter;
    const matchesCat = activeCategoryFilter === 'all' || props.category === activeCategoryFilter;

    return matchesSearch && matchesZone && matchesCat;
  });
}

// 8. Render POI / Course Cards in Left Sidebar (Simple, Compact, Ultra-Readable)
function renderCards() {
  const container = document.getElementById('cards-container');
  container.innerHTML = '';

  if (activeTab === 'poi') {
    const filtered = getFilteredPois();
    document.getElementById('poi-count-badge').textContent = `${filtered.length} Sites`;

    if (filtered.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px 10px; color: var(--text-muted);">
          <p style="font-size: 1.5rem; margin-bottom: 8px;">🔍</p>
          <p>No locations match your search or filters.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(feature => {
      const props = feature.properties;
      const isHub = props.id === 'hub_bournville' || props.zone === 'hub';
      const hasRec = Boolean(props.personal_recommendation);
      const isSelected = selectedPoi && (selectedPoi.id === feature.id || selectedPoi.properties.name === props.name);

      const card = document.createElement('div');
      card.className = `poi-card ${isSelected ? 'active' : ''} ${isHub ? 'poi-card-hub' : ''}`;

      const icon = isHub ? '🏡' : (hasRec ? '⭐' : (CATEGORY_ICONS[props.category] || '📍'));
      const snippet = props.personal_recommendation ? `💬 "${props.personal_recommendation}"` : props.description;

      card.innerHTML = `
        <div class="poi-card-icon-wrap" style="${isHub ? 'border-color: rgba(16,185,129,0.5); background: rgba(16,185,129,0.15);' : ''}">${icon}</div>
        <div class="poi-card-content">
          <div class="poi-card-header-row">
            <span class="poi-card-title">${props.name}</span>
            <span class="badge-time-pill" style="${isHub ? 'background: rgba(16,185,129,0.2); color:#6ee7b7; border-color: rgba(16,185,129,0.4);' : ''}">${props.travel_time_label || '~15 mins'}</span>
          </div>
          <div class="poi-card-snippet ${hasRec && !isHub ? 'poi-card-snippet-rec' : ''}">${snippet}</div>
        </div>
      `;

      card.addEventListener('click', () => selectPoi(feature));
      container.appendChild(card);
    });

  } else if (activeTab === 'courses') {
    coursesData.forEach(course => {
      const card = document.createElement('div');
      card.className = `course-card ${activeCourse && activeCourse.id === course.id ? 'active' : ''}`;

      card.innerHTML = `
        <div class="course-header-row">
          <span class="course-badge" style="background: ${course.theme_color}33; color: ${course.theme_color}; border: 1px solid ${course.theme_color}66;">
            ${course.badge}
          </span>
          <span style="font-size: 0.75rem; color: var(--text-secondary);">${course.stops.length} Stops</span>
        </div>
        <div class="course-title">${course.title}</div>
        <div class="course-tagline">${course.tagline}</div>
        <div class="course-stats-bar">
          <span>📏 ${course.total_distance_km} km</span>
          <span>⏱️ ~${course.total_drive_time_min} mins drive</span>
          <span>⏳ ${course.recommended_duration}</span>
        </div>
      `;

      card.addEventListener('click', () => selectCourse(course));
      container.appendChild(card);
    });
  }
}

// 9. Select & Inspect a POI
function selectPoi(feature) {
  selectedPoi = feature;
  const props = feature.properties;
  const coords = feature.geometry.coordinates;

  map.flyTo({
    center: coords,
    zoom: 14.2,
    pitch: 45,
    bearing: 15,
    speed: 1.2,
    curve: 1.4
  });

  // Populate Right Drawer
  document.getElementById('drawer-img').src = props.image_url || 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Rathmines_Park_NSW.jpg/800px-Rathmines_Park_NSW.jpg';
  document.getElementById('drawer-title').textContent = props.name;
  document.getElementById('drawer-address').textContent = props.address || '';
  document.getElementById('drawer-time-badge').textContent = props.travel_time_label || '~15 mins';
  document.getElementById('drawer-cat-badge').textContent = `${CATEGORY_ICONS[props.category] || ''} ${props.category_label || props.category}`;

  const recBadge = document.getElementById('drawer-rec-badge');
  if (props.personal_recommendation) {
    recBadge.style.display = 'inline-block';
    document.getElementById('host-tip-text').textContent = `"${props.personal_recommendation}"`;
    document.getElementById('host-tip-input').value = props.personal_recommendation;
  } else {
    recBadge.style.display = 'none';
    document.getElementById('host-tip-text').textContent = "No personal recommendation added yet. Click 'Edit Tip' to add your insider suggestions!";
    document.getElementById('host-tip-input').value = '';
  }

  document.getElementById('drawer-desc').textContent = props.description;
  document.getElementById('drawer-nsw-seed').textContent = props.nsw_seed_layer || 'NSW SEED Coastal & Heritage Zone';
  document.getElementById('drawer-credit-author').textContent = `Author: ${props.image_author || 'Community Contributor'}`;
  document.getElementById('drawer-credit-license').textContent = props.image_license || 'CC BY-SA';

  // Render Highlights
  const highlightsEl = document.getElementById('drawer-highlights');
  highlightsEl.innerHTML = '';
  (props.highlights || []).forEach(h => {
    const li = document.createElement('li');
    li.textContent = h;
    highlightsEl.appendChild(li);
  });

  // Open-Source Navigation Deep Links (OSM & Waze)
  const hubLng = HUB_COORDINATES[0];
  const hubLat = HUB_COORDINATES[1];
  const destLng = coords[0];
  const destLat = coords[1];

  // OpenStreetMap Directions Link
  const osmUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${hubLat}%2C${hubLng}%3B${destLat}%2C${destLng}`;
  document.getElementById('btn-nav-osm').href = osmUrl;

  // Waze Navigation Link
  const wazeUrl = `https://waze.com/ul?ll=${destLat},${destLng}&navigate=yes`;
  document.getElementById('btn-nav-waze').href = wazeUrl;

  document.getElementById('detail-drawer').classList.add('open');
  renderCards();
}

// 10. Select & Activate a Course (SpatialCourse_Crafter)
function selectCourse(course) {
  activeCourse = course;

  const routeFeature = {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: course.route_coordinates
    },
    properties: {
      theme_color: course.theme_color
    }
  };

  const source = map.getSource('course-route-source');
  if (source) {
    source.setData({
      type: 'FeatureCollection',
      features: [routeFeature]
    });
  }

  const bounds = new maplibregl.LngLatBounds();
  course.route_coordinates.forEach(coord => bounds.extend(coord));
  map.fitBounds(bounds, { padding: 90, maxZoom: 13, speed: 1.1 });

  const drawer = document.getElementById('detail-drawer');
  document.getElementById('drawer-img').src = 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Rathmines_Park_NSW.jpg/800px-Rathmines_Park_NSW.jpg';
  document.getElementById('drawer-title').textContent = course.title;
  document.getElementById('drawer-address').textContent = `Curated Spatial Course • ${course.stops.length} Sequenced Stops`;
  document.getElementById('drawer-time-badge').textContent = `~${course.total_drive_time_min} mins total`;
  document.getElementById('drawer-cat-badge').textContent = `🚀 ${course.badge}`;
  document.getElementById('drawer-rec-badge').style.display = 'none';
  document.getElementById('host-tip-text').textContent = `Course Highlight: ${course.ideal_for}`;
  document.getElementById('drawer-desc').textContent = `${course.tagline}. Recommended duration: ${course.recommended_duration}.`;
  document.getElementById('drawer-nsw-seed').textContent = `SpatialCourse_Crafter • Ideal for: ${course.ideal_for}`;
  document.getElementById('drawer-credit-author').textContent = 'SpatialCourse_Crafter Engine';
  document.getElementById('drawer-credit-license').textContent = 'Open Data Course';

  const highlightsEl = document.getElementById('drawer-highlights');
  highlightsEl.innerHTML = '';

  course.stops.forEach(s => {
    const li = document.createElement('li');
    li.style.cursor = 'pointer';
    li.innerHTML = `<strong>Step ${s.step}:</strong> ${s.name} <br/><span style="font-size:0.75rem; color:var(--text-secondary);">${s.instruction}</span>`;
    li.addEventListener('click', () => {
      map.flyTo({ center: s.coordinates, zoom: 14.5, pitch: 40 });
    });
    highlightsEl.appendChild(li);
  });

  const routePointsStr = course.route_coordinates.map(c => `${c[1]}%2C${c[0]}`).join('%3B');
  document.getElementById('btn-nav-osm').href = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${routePointsStr}`;
  const firstStop = course.stops[1] || course.stops[0];
  document.getElementById('btn-nav-waze').href = `https://waze.com/ul?ll=${firstStop.coordinates[1]},${firstStop.coordinates[0]}&navigate=yes`;

  drawer.classList.add('open');
  renderCards();
}

// 11. Helper: Export Updated GeoJSON File
function exportUpdatedGeoJson() {
  const exportDoc = {
    type: "FeatureCollection",
    name: "Rathmines_Surrounds_POI_Updated",
    metadata: {
      center_point: {
        address: "21 Bournville Road, Rathmines NSW 2283",
        coordinates: [151.5847, -33.0428]
      },
      exported_at: new Date().toISOString(),
      total_features: poiData.length
    },
    features: poiData
  };

  const blob = new Blob([JSON.stringify(exportDoc, null, 2)], { type: 'application/geo+json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'rathmines_poi_updated.geojson';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper: Zoom to specific Isochrone polygon boundary
function zoomToIsochrone(zoneKey) {
  if (zoneKey === 'all') {
    map.flyTo({
      center: HUB_COORDINATES,
      zoom: DEFAULT_ZOOM,
      pitch: is3DEnabled ? 45 : 0,
      bearing: is3DEnabled ? -10 : 0,
      speed: 1.2
    });
    return;
  }

  if (!isochronesData || !isochronesData.features) return;
  const feature = isochronesData.features.find(f =>
    f.properties.zone === zoneKey ||
    f.properties.contour == zoneKey ||
    f.properties.time_minutes == zoneKey
  );

  if (feature && feature.geometry) {
    const bounds = new maplibregl.LngLatBounds();
    const expand = (c) => {
      if (typeof c[0] === 'number') {
        bounds.extend(c);
      } else if (Array.isArray(c)) {
        c.forEach(expand);
      }
    };
    expand(feature.geometry.coordinates);

    map.fitBounds(bounds, {
      padding: { top: 70, bottom: 70, left: 390, right: 70 },
      pitch: is3DEnabled ? 45 : 0,
      bearing: is3DEnabled ? -10 : 0,
      maxZoom: 15.5,
      speed: 1.2
    });
  }
}

// 12. Event Listeners Setup
function setupEventListeners() {
  const basemapSelect = document.getElementById('basemap-select');
  if (basemapSelect) {
    basemapSelect.addEventListener('change', (e) => {
      switchBasemap(e.target.value);
    });
  }

  document.getElementById('tab-poi').addEventListener('click', () => {
    activeTab = 'poi';
    document.getElementById('tab-poi').classList.add('active');
    document.getElementById('tab-courses').classList.remove('active');
    document.getElementById('filter-section-poi').style.display = 'block';

    const source = map.getSource('course-route-source');
    if (source) source.setData({ type: 'FeatureCollection', features: [] });

    renderCards();
  });

  document.getElementById('tab-courses').addEventListener('click', () => {
    activeTab = 'courses';
    document.getElementById('tab-courses').classList.add('active');
    document.getElementById('tab-poi').classList.remove('active');
    document.getElementById('filter-section-poi').style.display = 'none';
    renderCards();
  });

  // Ring filter buttons in sidebar: zoom to boundary & filter
  document.querySelectorAll('.ring-filter-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.ring-filter-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeZoneFilter = e.target.dataset.zone;
      zoomToIsochrone(activeZoneFilter);
      renderCards();
    });
  });

  // Floating Isochrone Legend row click to zoom
  document.querySelectorAll('.isochrone-legend-card .legend-row').forEach(row => {
    row.addEventListener('click', () => {
      const zone = row.dataset.zone;
      if (!zone) return;

      activeZoneFilter = zone;
      document.querySelectorAll('.ring-filter-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.zone === zone);
      });

      zoomToIsochrone(zone);
      renderCards();
    });
  });

  document.querySelectorAll('.category-pill').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.category-pill').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeCategoryFilter = e.target.dataset.cat;
      renderCards();
    });
  });

  document.getElementById('poi-search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderCards();
  });

  document.getElementById('drawer-close').addEventListener('click', () => {
    document.getElementById('detail-drawer').classList.remove('open');
  });

  // 3D Elevation Terrain Toggle
  const btn3D = document.getElementById('btn-toggle-3d');
  if (btn3D) {
    btn3D.style.borderColor = is3DEnabled ? 'var(--accent-cyan)' : 'var(--border-glass)';
    btn3D.addEventListener('click', () => {
      is3DEnabled = !is3DEnabled;
      btn3D.style.borderColor = is3DEnabled ? 'var(--accent-cyan)' : 'var(--border-glass)';
      btn3D.style.boxShadow = is3DEnabled ? '0 0 10px rgba(0, 210, 255, 0.4)' : 'none';

      if (is3DEnabled) {
        if (map.getSource('terrain-dem-source')) {
          map.setTerrain({ source: 'terrain-dem-source', exaggeration: 3.5 });
        }
        map.easeTo({ pitch: 62, bearing: -22, duration: 1000 });
        if (map.getLayer('shaded-relief-layer')) {
          map.setLayoutProperty('shaded-relief-layer', 'visibility', 'visible');
        }
        if (map.getLayer('terrain-hillshade')) {
          map.setLayoutProperty('terrain-hillshade', 'visibility', 'visible');
        }
      } else {
        map.setTerrain(null);
        map.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
        if (map.getLayer('shaded-relief-layer')) {
          map.setLayoutProperty('shaded-relief-layer', 'visibility', 'none');
        }
        if (map.getLayer('terrain-hillshade')) {
          map.setLayoutProperty('terrain-hillshade', 'visibility', 'none');
        }
      }
    });
  }

  document.getElementById('btn-toggle-rings').addEventListener('click', () => {
    showDistanceRings = !showDistanceRings;
    const visibility = showDistanceRings ? 'visible' : 'none';
    if (map.getLayer('isochrones-glow')) map.setLayoutProperty('isochrones-glow', 'visibility', visibility);
    if (map.getLayer('isochrones-line')) map.setLayoutProperty('isochrones-line', 'visibility', visibility);
    document.getElementById('btn-toggle-rings').style.borderColor = showDistanceRings ? 'var(--accent-cyan)' : 'var(--border-glass)';
  });

  document.getElementById('btn-reset-view').addEventListener('click', () => {
    map.flyTo({
      center: HUB_COORDINATES,
      zoom: DEFAULT_ZOOM,
      pitch: is3DEnabled ? 45 : 0,
      bearing: is3DEnabled ? -10 : 0,
      speed: 1.2
    });
  });

  // Focus Home Hub Banner Button
  const homeBtn = document.getElementById('btn-focus-home');
  if (homeBtn) {
    homeBtn.addEventListener('click', () => {
      const hubPoi = poiData.find(p => p.properties.id === 'hub_bournville' || p.properties.zone === 'hub');
      if (hubPoi) {
        selectPoi(hubPoi);
      } else {
        map.flyTo({
          center: HUB_COORDINATES,
          zoom: 14.5,
          pitch: 35,
          bearing: 0,
          speed: 1.2
        });
      }
    });
  }

  // Modal Open / Close
  const modal = document.getElementById('add-place-modal');
  document.getElementById('btn-add-place').addEventListener('click', () => {
    modal.classList.add('active');
  });
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    modal.classList.remove('active');
  });
  document.getElementById('btn-cancel-modal').addEventListener('click', () => {
    modal.classList.remove('active');
  });

  // Admin Mode: Toggle Draggable Markers on Map
  const btnAdminDrag = document.getElementById('btn-toggle-admin-drag');
  if (btnAdminDrag) {
    btnAdminDrag.addEventListener('click', () => {
      isAdminDragEnabled = !isAdminDragEnabled;
      btnAdminDrag.classList.toggle('active', isAdminDragEnabled);
      btnAdminDrag.style.borderColor = isAdminDragEnabled ? '#f59e0b' : 'var(--border-glass)';
      btnAdminDrag.style.boxShadow = isAdminDragEnabled ? '0 0 12px rgba(245, 158, 11, 0.6)' : 'none';
      btnAdminDrag.style.background = isAdminDragEnabled ? 'rgba(245, 158, 11, 0.2)' : 'var(--bg-glass)';
      document.body.classList.toggle('admin-drag-active', isAdminDragEnabled);

      markersMap.forEach((marker) => {
        marker.setDraggable(isAdminDragEnabled);
      });

      if (isAdminDragEnabled) {
        showToast('📍 Admin Move Mode ON: Drag any pin to its correct location on the map.');
      } else {
        showToast('🔒 Admin Move Mode OFF: Pin locations locked.');
      }
    });
  }

  // Admin Mode: Relocate Active POI from Detail Drawer
  const btnRelocate = document.getElementById('btn-relocate-pin');
  if (btnRelocate) {
    btnRelocate.addEventListener('click', () => {
      if (!selectedPoi) return;
      isRelocatingActivePoi = true;
      map.getCanvas().style.cursor = 'crosshair';

      const key = selectedPoi.id || selectedPoi.properties.name;
      const marker = markersMap.get(key);
      if (marker) {
        marker.setDraggable(true);
        const el = marker.getElement();
        if (el) el.classList.add('relocating-pulse');
      }

      showToast(`📍 Click anywhere on the map to place "${selectedPoi.properties.name}", or drag its pin.`);
    });
  }

  // Pick Coordinates from Map (for Adding Place)
  const startPickMode = () => {
    isPickingLocation = true;
    modal.classList.remove('active');
    map.getCanvas().style.cursor = 'crosshair';
    showToast('📍 Click anywhere on the map to set the location for your new place.');
  };

  document.getElementById('btn-pick-coords').addEventListener('click', startPickMode);
  document.getElementById('btn-pick-map-poi').addEventListener('click', startPickMode);

  map.on('click', (e) => {
    // 1. Relocating active POI from Drawer
    if (isRelocatingActivePoi && selectedPoi) {
      isRelocatingActivePoi = false;
      map.getCanvas().style.cursor = '';

      const newLng = Number(e.lngLat.lng.toFixed(5));
      const newLat = Number(e.lngLat.lat.toFixed(5));
      const updatedCoords = [newLng, newLat];

      selectedPoi.geometry.coordinates = updatedCoords;
      const key = selectedPoi.id || selectedPoi.properties.name;
      savePoiCoordinateToStorage(key, updatedCoords);

      const marker = markersMap.get(key);
      if (marker) {
        marker.setLngLat(updatedCoords);
        const el = marker.getElement();
        if (el) el.classList.remove('relocating-pulse');
        if (!isAdminDragEnabled) {
          marker.setDraggable(false);
        }
      }

      updatePoiTravelZoneFromHub(selectedPoi);
      updateDrawerNavigationLinks(updatedCoords);
      document.getElementById('drawer-time-badge').textContent = selectedPoi.properties.travel_time_label || '~15 mins';

      renderCards();
      showToast(`📍 Successfully relocated "${selectedPoi.properties.name}" to [${newLng}, ${newLat}]`);
      return;
    }

    // 2. Setting location for New Place Modal
    if (!isPickingLocation) return;
    isPickingLocation = false;
    map.getCanvas().style.cursor = '';

    const lng = e.lngLat.lng.toFixed(5);
    const lat = e.lngLat.lat.toFixed(5);
    document.getElementById('new-poi-coords').value = `${lng}, ${lat}`;

    // Calculate approximate distance to set zone
    const dLat = (lat - HUB_COORDINATES[1]) * 110.574;
    const dLng = (lng - HUB_COORDINATES[0]) * (111.32 * Math.cos(lat * Math.PI / 180));
    const distKm = Math.sqrt(dLat * dLat + dLng * dLng);

    if (distKm <= 4) {
      document.getElementById('new-poi-zone').value = 'zone_5m';
    } else if (distKm <= 12) {
      document.getElementById('new-poi-zone').value = 'zone_15m';
    } else if (distKm <= 26) {
      document.getElementById('new-poi-zone').value = 'zone_30m';
    } else if (distKm <= 55) {
      document.getElementById('new-poi-zone').value = 'zone_1h';
    } else {
      document.getElementById('new-poi-zone').value = 'zone_2h';
    }

    modal.classList.add('active');
  });

  // Add Place Form Submit
  document.getElementById('add-place-form').addEventListener('submit', (e) => {
    e.preventDefault();

    const name = document.getElementById('new-poi-name').value.trim();
    const category = document.getElementById('new-poi-category').value;
    const coordsStr = document.getElementById('new-poi-coords').value.trim();
    const zone = document.getElementById('new-poi-zone').value;
    const address = document.getElementById('new-poi-address').value.trim();
    const desc = document.getElementById('new-poi-desc').value.trim();
    const recommendation = document.getElementById('new-poi-recommendation').value.trim();
    const highlightsStr = document.getElementById('new-poi-highlights').value.trim();
    const seed = document.getElementById('new-poi-seed').value.trim();
    const image = document.getElementById('new-poi-image').value.trim() || 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Rathmines_Park_NSW.jpg/800px-Rathmines_Park_NSW.jpg';
    const credit = document.getElementById('new-poi-credit').value.trim() || 'Personal / Community Contribution';

    const coordsParts = coordsStr.split(',').map(s => parseFloat(s.trim()));
    if (coordsParts.length !== 2 || isNaN(coordsParts[0]) || isNaN(coordsParts[1])) {
      alert('Please enter valid coordinates in format: Longitude, Latitude (e.g. 151.5847, -33.0428)');
      return;
    }

    const zoneLabels = {
      zone_5m: '5 mins',
      zone_15m: '15 mins',
      zone_30m: '30 mins',
      zone_1h: '1 hour',
      zone_2h: '2 hours'
    };

    const newFeature = {
      type: 'Feature',
      id: 'custom_' + Date.now(),
      geometry: {
        type: 'Point',
        coordinates: [coordsParts[0], coordsParts[1]]
      },
      properties: {
        name: name,
        category: category,
        category_label: category.charAt(0).toUpperCase() + category.slice(1),
        zone: zone,
        zone_label: zoneLabels[zone] || '~20 mins',
        travel_time_label: zoneLabels[zone] || '~20 mins',
        address: address || 'Lake Macquarie Region, NSW',
        description: desc || 'Locally recommended point of interest.',
        personal_recommendation: recommendation,
        highlights: highlightsStr ? highlightsStr.split(',').map(s => s.trim()) : ['Personal Recommendation', 'Local Favorite'],
        nsw_seed_layer: seed || 'Lake Macquarie Community & Environmental Zone',
        image_url: image,
        image_thumb: image,
        image_caption: name,
        image_author: credit,
        image_license: 'Personal / CC BY-SA 4.0'
      }
    };

    saveCustomPoiToStorage(newFeature);
    poiData.push(newFeature);

    renderMarkers();
    renderCards();
    selectPoi(newFeature);

    modal.classList.remove('active');
    document.getElementById('add-place-form').reset();
  });

  // Edit Host Tip in Drawer
  document.getElementById('btn-edit-host-tip').addEventListener('click', () => {
    document.getElementById('host-tip-text').style.display = 'none';
    document.getElementById('host-tip-edit-container').style.display = 'block';
  });

  document.getElementById('btn-cancel-host-tip').addEventListener('click', () => {
    document.getElementById('host-tip-text').style.display = 'block';
    document.getElementById('host-tip-edit-container').style.display = 'none';
  });

  document.getElementById('btn-save-host-tip').addEventListener('click', () => {
    if (!selectedPoi) return;
    const tipText = document.getElementById('host-tip-input').value.trim();
    const idKey = selectedPoi.id || selectedPoi.properties.name;

    saveHostTipToStorage(idKey, tipText);
    selectedPoi.properties.personal_recommendation = tipText;

    document.getElementById('host-tip-text').textContent = tipText ? `"${tipText}"` : "No personal recommendation added yet. Click 'Edit Tip' to add your insider suggestions!";
    document.getElementById('host-tip-text').style.display = 'block';
    document.getElementById('host-tip-edit-container').style.display = 'none';

    document.getElementById('drawer-rec-badge').style.display = tipText ? 'inline-block' : 'none';

    renderMarkers();
    renderCards();
  });

  // Export GeoJSON
  document.getElementById('btn-export-geojson').addEventListener('click', exportUpdatedGeoJson);

  // Lightbox Triggers
  document.getElementById('drawer-img').addEventListener('click', () => {
    if (!selectedPoi && !activeCourse) return;
    const modal = document.getElementById('lightbox-modal');
    const imgUrl = document.getElementById('drawer-img').src;
    const title = document.getElementById('drawer-title').textContent;
    const author = document.getElementById('drawer-credit-author').textContent;
    const license = document.getElementById('drawer-credit-license').textContent;

    document.getElementById('lightbox-img').src = imgUrl;
    document.getElementById('lightbox-title').textContent = title;
    document.getElementById('lightbox-caption').textContent = selectedPoi ? (selectedPoi.properties.personal_recommendation ? '⭐ Host Tip: ' + selectedPoi.properties.personal_recommendation + '\n' : '') + selectedPoi.properties.description : '';
    document.getElementById('lightbox-author').textContent = author;
    document.getElementById('lightbox-license').textContent = license;
    document.getElementById('lightbox-source-link').href = selectedPoi ? selectedPoi.properties.image_source_page || '#' : '#';

    modal.classList.add('active');
  });

  document.getElementById('lightbox-close').addEventListener('click', () => {
    document.getElementById('lightbox-modal').classList.remove('active');
  });

  document.getElementById('lightbox-modal').addEventListener('click', (e) => {
    if (e.target.id === 'lightbox-modal') {
      document.getElementById('lightbox-modal').classList.remove('active');
    }
  });
}

