import mapboxgl from 'https://cdn.skypack.dev/mapbox-gl';
import Mapbox3DTiles from "./mapbox3DTiles.mjs";

Mapbox3DTiles.DEBUG = debug;

// change this token to your own mapbox token.  This is currently restricted to my demo URL
mapboxgl.accessToken = "pk.eyJ1Ijoid2FsbGFieXdheSIsImEiOiJjbDV1MHF1MzkwZXAyM2tveXZjaDVlaXJpIn0.wyOgHkuGJ37Xrx1x_49gIw";


// Load the mapbox map
var map = new mapboxgl.Map({
	container: 'map',
	style: 'mapbox://styles/mapbox/satellite-v9',
	//style: `mapbox://styles/mapbox/${light ? 'light' : 'dark'}-v10?optimize=true`,
	center: [24.94442925, 32.31300579],
	zoom: 14.3,
	bearing: 0,
	pitch: 45,
	hash: true
});


map.on('style.load', function () {

	const rotterdam = new Mapbox3DTiles.Layer({
		id: 'rotterdam',
		url: 'https://geodan.github.io/mapbox-3dtiles/rotterdam/tileset.json',
		color: 0x0033aa,
		opacity: 1
	});
	map.addLayer(rotterdam);

	const oak = new Mapbox3DTiles.Layer({
		id: 'oakland',
		url: './cad-recgolf/pnts/tileset.json',
		opacity: 1.0,
		pointsize: 3.0,
		geomScale: 0.1
	});
	map.addLayer(oak, 'rotterdam');

	const cad1 = new Mapbox3DTiles.Layer({
		id: 'audubon.rvt',
		url: './cad-recgolf/tileset.json',
		opacity: 1.0,
		geomScale: 1.0
	});
	map.addLayer(cad1, 'rotterdam');

});
/*
map.on('mousemove', (event) => {
	let infoElement = document.querySelector('#info');
	let features = map.queryRenderedFeatures(event.point, { outline: true, outlineColor: 0xff0000 });
	if (features.length) {
		infoElement.innerHTML =
			features.map(feature =>
				`Layer: ${feature.layer.id}<br>
					${Object.entries(feature.properties).map(entry => `<b>${entry[0]}:</b>${entry[1]}`).join('<br>\n')}
			`).join('<hr>\n')
	} else {
		infoElement.innerHTML = "Hover map objects for info";
	}
})
*/