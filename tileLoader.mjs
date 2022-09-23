import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";

class TileLoader {
	// BASECLASS: This class contains the common code to load tile content, such as b3dm and pnts files.
	// It is not to be used directly. Instead, subclasses are used to implement specific 
	// content loaders for different tile types.
	constructor(url) {
		this.url = url;
		this.type = url.slice(-4);
		this.version = null;
		this.byteLength = null;
		this.featureTableJSON = null;
		this.featureTableBinary = null;
		this.batchTableJson = null;
		this.batchTableBinary = null;
		this.binaryData = null;
	}


	async load() {
		let response = await fetch(this.url)
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} - ${response.statusText}`);
		}
		let buffer = await response.arrayBuffer();
		let res = await this.parseResponse(buffer);
		return res;
	}

	async parseResponse(buffer) {
		let header = new Uint32Array(buffer.slice(0, 28));
		let decoder = new TextDecoder();
		let magic = decoder.decode(new Uint8Array(buffer.slice(0, 4)));
		if (magic != this.type) {
			throw new Error(`Invalid magic string, expected '${this.type}', got '${this.magic}'`);
		}
		this.version = header[1];
		this.byteLength = header[2];
		let featureTableJSONByteLength = header[3];
		let featureTableBinaryByteLength = header[4];
		let batchTableJsonByteLength = header[5];
		let batchTableBinaryByteLength = header[6];

		let pos = 28; // header length
		if (featureTableJSONByteLength > 0) {
			this.featureTableJSON = JSON.parse(decoder.decode(new Uint8Array(buffer.slice(pos, pos + featureTableJSONByteLength))));
			pos += featureTableJSONByteLength;
		} else {
			this.featureTableJSON = {};
		}
		this.featureTableBinary = buffer.slice(pos, pos + featureTableBinaryByteLength);
		pos += featureTableBinaryByteLength;
		if (batchTableJsonByteLength > 0) {
			this.batchTableJson = JSON.parse(decoder.decode(new Uint8Array(buffer.slice(pos, pos + batchTableJsonByteLength))));
			pos += batchTableJsonByteLength;
		} else {
			this.batchTableJson = {};
		}
		this.batchTableBinary = buffer.slice(pos, pos + batchTableBinaryByteLength);
		pos += batchTableBinaryByteLength;
		this.binaryData = buffer.slice(pos);
		return this;
	}
}


////////////////////////////////
export class B3DM extends TileLoader {
	constructor(url) {
		super(url);
		this.glbData = null;
	}
	parseResponse(buffer) {
		super.parseResponse(buffer);
		this.glbData = this.binaryData;
		return this;
	}
}

////////////////////////////////
export class GLTF extends TileLoader {
	constructor(url) {
		super(url);
		this.glbData = null;
	}
	parseResponse(buffer) {
		return new Promise((resolve) => {
			gltfLoader.parse(buffer,url, (gltf) => { 
				resolve( gltf ) } )
		});
	}
}


////////////////////////////////
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.4.3/');

export class PNTS extends TileLoader {
	constructor(url) {
		super(url);
		this.rgba = null;
		this.rgb = null;
	}
	async parseResponse(buffer) {
		return new Promise((resolve) => {
			super.parseResponse(buffer);
			if (this.featureTableJSON.POINTS_LENGTH && this.featureTableJSON.POSITION) {
				let len = this.featureTableJSON.POINTS_LENGTH;
				let pos = this.featureTableJSON.POSITION.byteOffset;
				this.rtc_center = this.featureTableJSON.RTC_CENTER;
				const buffer = this.featureTableBinary.slice(pos, pos + len * Float32Array.BYTES_PER_ELEMENT * 3);
				dracoLoader.decodeDracoFile(buffer, geometry => {
					const col = geometry.attributes.color.array;
					col.forEach((a, i) => { col[i] /= 255 });
					resolve(geometry);
				})
			}
		})
	}
}




////////////////////////////////
export class PNTS2 extends TileLoader {
	constructor(url) {
		super(url);
		this.points = new Float32Array();
		this.rgba = null;
		this.rgb = null;
	}
	parseResponse(buffer) {
		super.parseResponse(buffer);
		if (this.featureTableJSON.POINTS_LENGTH && this.featureTableJSON.POSITION) {
			let len = this.featureTableJSON.POINTS_LENGTH;
			let pos = this.featureTableJSON.POSITION.byteOffset;
			this.points = new Float32Array(this.featureTableBinary.slice(pos, pos + len * Float32Array.BYTES_PER_ELEMENT * 3));
			this.rtc_center = this.featureTableJSON.RTC_CENTER;
			if (this.featureTableJSON.RGBA) {
				pos = this.featureTableJSON.RGBA.byteOffset;
				let colorInts = new Uint8Array(this.featureTableBinary.slice(pos, pos + len * Uint8Array.BYTES_PER_ELEMENT * 4));
				let rgba = new Float32Array(colorInts.length);
				for (let i = 0; i < colorInts.length; i++) {
					rgba[i] = colorInts[i] / 255.0;
				}
				this.rgba = rgba;
			} else if (this.featureTableJSON.RGB) {
				pos = this.featureTableJSON.RGB.byteOffset;
				let colorInts = new Uint8Array(this.featureTableBinary.slice(pos, pos + len * Uint8Array.BYTES_PER_ELEMENT * 3));
				let rgb = new Float32Array(colorInts.length);
				for (let i = 0; i < colorInts.length; i++) {
					rgb[i] = colorInts[i] / 255.0;
				}
				this.rgb = rgb;
			} else if (this.featureTableJSON.RGB565) {
				console.error('RGB565 is currently not supported in pointcloud tiles.')
			}
		}
		return this;
	}
}
