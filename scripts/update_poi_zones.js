const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'rathmines_poi.geojson');
const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

data.features.forEach(feat => {
  const props = feat.properties;
  const time = props.travel_time_min !== undefined ? props.travel_time_min : 15;

  if (props.id === 'hub_bournville' || props.category === 'hub' || time === 0) {
    props.zone = 'zone_5m';
    props.zone_label = 'Home (0 mins)';
  } else if (time <= 6) {
    props.zone = 'zone_5m';
    props.zone_label = '5 mins';
  } else if (time <= 18) {
    props.zone = 'zone_15m';
    props.zone_label = '15 mins';
  } else if (time <= 35) {
    props.zone = 'zone_30m';
    props.zone_label = '30 mins';
  } else if (time <= 65) {
    props.zone = 'zone_1h';
    props.zone_label = '1 hour';
  } else {
    props.zone = 'zone_2h';
    props.zone_label = '2 hours';
  }
});

fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
console.log('Successfully updated POI zones to 5m, 15m, 30m, 1h, 2h!');
