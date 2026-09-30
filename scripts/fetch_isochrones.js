const https = require('https');
const fs = require('fs');
const path = require('path');

const HUB_COORDINATES = [151.5847, -33.0428]; // [lng, lat]

function fetchJson(url, options = {}) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'RathminesExplorerApp/1.0', ...options.headers } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function main() {
  console.log('Fetching road-network isochrones for Rathmines [151.5847, -33.0428]...');
  
  // Try Valhalla public demo instance
  const valhallaPayload = JSON.stringify({
    locations: [{ lat: HUB_COORDINATES[1], lon: HUB_COORDINATES[0] }],
    costing: "auto",
    contours: [
      { time: 10, color: "00d2ff" },
      { time: 20, color: "3b82f6" },
      { time: 35, color: "a855f7" },
      { time: 55, color: "fb7185" }
    ],
    polygons: true,
    denoise: 0.15,
    generalize: 80
  });

  try {
    const valhallaUrl = `https://valhalla1.openstreetmap.de/isochrone?json=${encodeURIComponent(valhallaPayload)}`;
    console.log('Querying OSM Valhalla isochrone service...');
    const result = await fetchJson(valhallaUrl);
    console.log('Successfully received isochrone GeoJSON! Feature count:', result.features?.length);
    
    // Add metadata properties to each feature for our map layer
    const zoneConfig = {
      10: {
        zone: 'zone_1',
        time_minutes: 10,
        label: '~10 Mins Drive',
        sublabel: 'Rathmines, Wangi Wangi, Toronto south',
        fillColor: 'rgba(0, 210, 255, 0.22)',
        strokeColor: '#00d2ff'
      },
      20: {
        zone: 'zone_2',
        time_minutes: 20,
        label: '~20 Mins Drive',
        sublabel: 'Toronto, Wangi Peninsula, Morisset, Fassifern',
        fillColor: 'rgba(59, 130, 246, 0.16)',
        strokeColor: '#3b82f6'
      },
      35: {
        zone: 'zone_3',
        time_minutes: 35,
        label: '~35 Mins Drive',
        sublabel: 'Warners Bay, Speers Point, Belmont, Cooranbong',
        fillColor: 'rgba(168, 85, 247, 0.12)',
        strokeColor: '#a855f7'
      },
      55: {
        zone: 'zone_4',
        time_minutes: 55,
        label: '~55 Mins Drive',
        sublabel: 'Newcastle, Hunter Valley Vines, Caves Beach, Catho',
        fillColor: 'rgba(251, 113, 133, 0.08)',
        strokeColor: '#fb7185'
      }
    };

    const processedFeatures = result.features.map(f => {
      const timeVal = f.properties.contour || 10;
      const conf = zoneConfig[timeVal] || {
        zone: 'zone_1',
        time_minutes: timeVal,
        label: `~${timeVal} Mins Drive`,
        sublabel: 'Lake Macquarie Surrounds',
        fillColor: 'rgba(0, 210, 255, 0.15)',
        strokeColor: '#00d2ff'
      };

      return {
        ...f,
        properties: {
          ...f.properties,
          time_minutes: conf.time_minutes,
          zone: conf.zone,
          label: conf.label,
          sublabel: conf.sublabel,
          fillColor: conf.fillColor,
          strokeColor: conf.strokeColor
        }
      };
    });

    const isochroneGeoJSON = {
      type: "FeatureCollection",
      name: "Rathmines_Drive_Isochrones_RoadNetwork",
      metadata: {
        center: HUB_COORDINATES,
        address: "21 Bournville Road, Rathmines NSW 2283",
        routing_engine: "OpenStreetMap Valhalla Road Network Routing",
        profile: "automobile (actual road routes)",
        contours_minutes: [10, 20, 35, 55],
        generated_at: new Date().toISOString()
      },
      features: processedFeatures
    };

    const outPath = path.join(__dirname, '..', 'data', 'isochrones.json');
    fs.writeFileSync(outPath, JSON.stringify(isochroneGeoJSON, null, 2));
    console.log('Saved road-network isochrone GeoJSON to:', outPath);
    return;
  } catch (err) {
    console.warn('Valhalla query failed or throttled:', err.message);
  }
}

main();
