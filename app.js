import mapboxgl from 'https://cdn.skypack.dev/mapbox-gl';
import Mapbox3DTiles from "./mapbox3DTiles.mjs";

Mapbox3DTiles.DEBUG = debug;

// change this token to your own mapbox token.  This is currently restricted to my demo URL
mapboxgl.accessToken = "pk.eyJ1Ijoid2FsbGFieXdheSIsImEiOiJjbDV1MHF1MzkwZXAyM2tveXZjaDVlaXJpIn0.wyOgHkuGJ37Xrx1x_49gIw";


// Load the mapbox map
var map = new mapboxgl.Map({
	container: 'map',
	style: `mapbox://styles/mapbox/${light ? 'light' : 'dark'}-v10?optimize=true`,
	center: [4.94442925, 52.31300579],
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
		url: './oaklandtrainstation/draco/tileset.json',
		opacity: 1.0,
		pointsize: 10.0
	});
	map.addLayer(oak, 'rotterdam');

});

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
