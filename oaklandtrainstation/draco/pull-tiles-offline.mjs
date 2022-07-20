// PURPOSE: download 3d-tiles files from BIM360, to local drive
// INSTALL: npm install node-fetch
// RUN: add your BIM360 access-token and the base url, then type >node pull-tiles-offline.mjs

import fetch from 'node-fetch';
import fs from 'fs';
import util from 'util';
import stream from 'stream';


const token = "eyJhbGciOiJSUzI1NiIsImtpZCI6IlU3c0dGRldUTzlBekNhSzBqZURRM2dQZXBURVdWN2VhIn0.eyJzY29wZSI6WyJ1c2VyLXByb2ZpbGU6cmVhZCIsImRhdGE6d3JpdGUiLCJkYXRhOnJlYWQiLCJkYXRhOmNyZWF0ZSIsImRhdGE6c2VhcmNoIiwiY29kZTphbGwiLCJhY2NvdW50OnJlYWQiLCJhY2NvdW50OndyaXRlIl0sImNsaWVudF9pZCI6IlRncGs0WTNvU1lPSnlBNnFrQzl2NFBHbEFTdDJIcU8zIiwiYXVkIjoiaHR0cHM6Ly9hdXRvZGVzay5jb20vYXVkL2Fqd3RleHA2MCIsImp0aSI6InVBVEhadTlUaFIzR01GZVUxQXRiV1JsRHQwMlZjZU53Qlp6NWRHUjNKbFFSMTl1dGtON25MTHdvYmxENHJKQXYiLCJ1c2VyaWQiOiIyMDA4MTEyMDA0MDc4MDQiLCJleHAiOjE2NDk3MDc4Mjh9.I5HyQ9jMQfo1PtW65R-AkZJ7XYeRzYAMuzJPlsrgCluw1yv-uTemszwVUheSb93YyDIO26T6Ti8MXcKjlcNFHFa7gh5_wzKwUK9dB2XmdALwXWksGrTl74wPgzvGpnV3T0Vk9vJwBJ8KzgqBrBLGMx-xFZ98pDZtwYEZcFFQwKqWPloHmQPRe9bDTPyu49gkSmuLif8XR_xOUXhEKOsaUn_5UIQvwhWjSTU_cvyetm3h2Z3QfQN4vWkH2uVgajaFvlj94HZIlT3KIAVGhPP6tS4OvnGCoyBqCbKXEJRYJ6Kp76k079-RzBhACFuXYrgT3rd_IxKrxI_neov-0aGDSw";
const url = "https://cdn.derivative.autodesk.com/derivativeservice/v2/derivatives/urn:adsk.viewing:fs.file:dXJuOmFkc2sud2lwcHJvZDpmcy5maWxlOnZmLlJlOHNXWEkyUkY2NHBvS3pWMWM1ckE_dmVyc2lvbj0x/output/"
const szTileset = await (await fetch(url + "tileset.json", { headers:{ 'Authorization':`Bearer ${token}`} })).json();
const uris = ["tileset.json"];

function recurveNode(node) {
	uris.push(node.content.uri);
	for (var n in node.children) {
		recurveNode(node.children[n]);
	};
	return node;
}
recurveNode(szTileset.root);

// download each tile
const streamPipeline = util.promisify(stream.pipeline);

async function download() {
	for (const szFile of uris) {
		const response = await fetch(url + szFile, { headers:{ 'Authorization':`Bearer ${token}`}});
		if (!response.ok) throw new Error(`unexpected response ${response.statusText}`)
		await streamPipeline(response.body, fs.createWriteStream(szFile));
		console.log(`downloading... ${szFile}`)
	}
};
await download();

console.log('done');