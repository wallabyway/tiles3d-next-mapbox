import { B3DM, PNTS, GLTF } from "./tileLoader.mjs";
import { CameraSync, ThreeboxConstants } from "./cameraSync.mjs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from './meshopt_decoder.module.js';

let loader = new GLTFLoader();
loader.setMeshoptDecoder(MeshoptDecoder);
window.ptmat = null;

export default class Mapbox3DTiles {

	static projectedUnitsPerMeter(latitude) {
		let c = ThreeboxConstants;
		return Math.abs(c.WORLD_SIZE / Math.cos(c.DEG2RAD * latitude) / c.EARTH_CIRCUMFERENCE);
	}
	static projectToWorld(coords) {
		// Spherical mercator forward projection, re-scaling to WORLD_SIZE
		let c = ThreeboxConstants;
		var projected = [
			c.MERCATOR_A * c.DEG2RAD * coords[0] * c.PROJECTION_WORLD_SIZE,
			c.MERCATOR_A * Math.log(Math.tan((Math.PI * 0.25) + (0.5 * c.DEG2RAD * coords[1]))) * c.PROJECTION_WORLD_SIZE
		];

		//z dimension, defaulting to 0 if not provided
		if (!coords[2]) {
			projected.push(0)
		} else {
			var pixelsPerMeter = projectedUnitsPerMeter(coords[1]);
			projected.push(coords[2] * pixelsPerMeter);
		}

		var result = new THREE.Vector3(projected[0], projected[1], projected[2]);

		return result;
	}
}


export class TileSet {
	constructor(updateCallback) {
		if (!updateCallback) {
			updateCallback = () => { };
		}
		this.updateCallback = updateCallback;
		this.url = null;
		this.version = null;
		this.gltfUpAxis = 'Z';
		this.geometricError = null;
		this.root = null;
	}
	// TileSet.load
	async load(url, styleParams) {
		this.url = url;
		let resourcePath = THREE.LoaderUtils.extractUrlBase(url);

		let response = await fetch(this.url);
		if (!response.ok) {
			throw new Error(`HTTP ${response.status} - ${response.statusText}`);
		}
		let json = await response.json();
		this.version = json.asset.version;
		this.geometricError = json.geometricError * (styleParams.geomScale || 1.0);
		console.log(this.geometricError)
		this.refine = json.root.refine ? json.root.refine.toUpperCase() : 'ADD';
		this.root = new ThreeDeeTile(json.root, resourcePath, styleParams, this.updateCallback, this.refine);
		return;
	}
}

class ThreeDeeTile {
	constructor(json, resourcePath, styleParams, updateCallback, parentRefine, parentTransform) {
		this.loaded = false;
		this.styleParams = styleParams;
		this.updateCallback = updateCallback;
		this.resourcePath = resourcePath;
		this.totalContent = new THREE.Group();  // Three JS Object3D Group for this tile and all its children
		this.tileContent = new THREE.Group();    // Three JS Object3D Group for this tile's content
		this.childContent = new THREE.Group();    // Three JS Object3D Group for this tile's children
		this.totalContent.add(this.tileContent);
		this.totalContent.add(this.childContent);
		this.boundingVolume = json.boundingVolume;
		if (this.boundingVolume && this.boundingVolume.box) {
			let b = this.boundingVolume.box;
			let extent = [b[0] - b[3], b[1] - b[7], b[0] + b[3], b[1] + b[7]];
			let sw = new THREE.Vector3(extent[0], extent[1], b[2] - b[11]);
			let ne = new THREE.Vector3(extent[2], extent[3], b[2] + b[11]);
			this.box = new THREE.Box3(sw, ne);
			if (Mapbox3DTiles.DEBUG) {
				let geom = new THREE.BoxGeometry(b[3] * 2, b[7] * 2, b[11] * 2);
				let edges = new THREE.EdgesGeometry(geom);
				this.debugColor = new THREE.Color(0xffffff);
				this.debugColor.setHex(Math.random() * 0xffffff);
				let line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: this.debugColor }));
				let trans = new THREE.Matrix4().makeTranslation(b[0], b[1], b[2]);
				line.applyMatrix4(trans);
				this.debugLine = line;
			}
		} else {
			this.extent = null;
			this.sw = null;
			this.ne = null;
			this.box = null;
			this.center = null;
		}
		this.refine = json.refine ? json.refine.toUpperCase() : parentRefine;
		this.geometricError = json.geometricError * (styleParams.geomScale || 1.0);
		this.worldTransform = parentTransform ? parentTransform.clone() : new THREE.Matrix4();
		this.transform = json.transform;
		if (this.transform) {
			let tileMatrix = new THREE.Matrix4().fromArray(this.transform);
			this.totalContent.applyMatrix4(tileMatrix);
			this.worldTransform.multiply(tileMatrix);
		}
		this.content = json.content;
		this.children = [];
		if (json.children) {
			for (let i = 0; i < json.children.length; i++) {
				let child = new ThreeDeeTile(json.children[i], resourcePath, styleParams, updateCallback, this.refine, this.worldTransform);
				this.childContent.add(child.totalContent);
				this.children.push(child);
			}
		}
	}
	//ThreeDeeTile.load
	async load() {
		if (this.unloadedTileContent) {
			this.totalContent.add(this.tileContent);
			this.unloadedTileContent = false;
		}
		if (this.unloadedChildContent) {
			this.totalContent.add(this.childContent);
			this.unloadedChildContent = false;
		}
		if (this.unloadedDebugContent) {
			this.totalContent.add(this.debugLine);
			this.unloadedDebugContent = false;
		}
		if (this.loaded) {
			this.updateCallback();
			return;
		}
		this.loaded = true;
		if (this.debugLine) {
			this.totalContent.add(this.debugLine);
		}
		if (this.content) {
			let url = this.content.uri ? this.content.uri : this.content.url;
			if (!url) return;
			if (url.substr(0, 4) != 'http')
				url = this.resourcePath + url;
			let type = url.slice(-4);
			switch (type) {
				case 'json':
					// child is a tileset json
					try {
						let subTileset = new TileSet(() => this.updateCallback());
						await subTileset.load(url, this.styleParams);
						if (subTileset.root) {
							this.box.applyMatrix4(this.worldTransform);
							let inverseMatrix = new THREE.Matrix4().getInverse(this.worldTransform);
							this.totalContent.applyMatrix4(inverseMatrix);
							this.totalContent.updateMatrixWorld();
							this.worldTransform = new THREE.Matrix4();

							this.children.push(subTileset.root);
							this.childContent.add(subTileset.root.totalContent);
							subTileset.root.totalContent.updateMatrixWorld();
							subTileset.root.checkLoad(this.frustum, this.cameraPosition);
						}
					} catch (error) {
						// load failed (wrong url? connection issues?)
						// log error, do not break program flow
						console.error(error);
					}
					break;
				case 'b3dm':
					try {
						let b3dm = new B3DM(url);
						let rotateX = new THREE.Matrix4().makeRotationAxis(new THREE.Vector3(1, 0, 0), Math.PI / 2);
						this.tileContent.applyMatrix4(rotateX); // convert from GLTF Y-up to Z-up
						let b3dmData = await b3dm.load();
						loader.parse(b3dmData.glbData, this.resourcePath, (gltf) => {

							gltf.scene.traverse(child => {
								if (child instanceof THREE.Mesh) {
									// some gltf has wrong bounding data, recompute here
									child.geometry.computeBoundingBox();
									child.geometry.computeBoundingSphere();
									child.material.depthWrite = true; // necessary for Velsen dataset?
									//Add the batchtable to the userData since gltLoader doesn't deal with it
									child.userData = b3dmData.batchTableJson;
								}
							});
							if (this.styleParams.color != null || this.styleParams.opacity != null) {
								let color = new THREE.Color(this.styleParams.color);
								gltf.scene.traverse(child => {
									if (child instanceof THREE.Mesh) {
										if (this.styleParams.color != null)
											child.material.color = color;
										if (this.styleParams.opacity != null) {
											child.material.opacity = this.styleParams.opacity;
											child.material.transparent = this.styleParams.opacity < 1.0 ? true : false;
										}
									}
								});
							}
							if (this.debugColor) {
								gltf.scene.traverse(child => {
									if (child instanceof THREE.Mesh) {
										child.material.color = this.debugColor;
									}
								})
							}
							this.tileContent.add(gltf.scene);
						}, (error) => {
							throw new Error('error parsing gltf: ' + error);
						}
						);
					} catch (error) {
						console.error(error);
					}
					break;
				case 'pnts':
					let pnts = new PNTS(url);
					let geometry = await pnts.load();
					let material = new THREE.PointsMaterial({ size: this.styleParams.pointsize, sizeAttenuation: false, vertexColors: true });
					this.points = new THREE.Points(geometry, material);
					this.tileContent.add(new THREE.Points(geometry, material));
					break;

				case 'gltf':
				case '.glb':
					loader.load(url, (gltfMesh) => {
						gltfMesh.scene.rotation.set(3.14/2,0,0);
						if (!window.ptmat) {
							window.ptmat = gltfMesh.scene.children[0].material;
							if (window.ptmat) {
								window.ptmat.size = 10;
								window.ptmat.sizeAttenuation = true;
							}
						}
						gltfMesh.scene.children[0].material = window.ptmat;
						this.tileContent.add(gltfMesh.scene);
					})
					break;
				case 'cmpt':
					throw new Error('cmpt tiles not yet implemented');
					break;
				default:
					throw new Error('invalid tile type: ' + type);
			}
		}
		this.updateCallback();
	}
	unload(includeChildren) {
		this.unloadedTileContent = true;
		this.totalContent.remove(this.tileContent);

		//this.tileContent.visible = false;
		if (includeChildren) {
			this.unloadedChildContent = true;
			this.totalContent.remove(this.childContent);
			//this.childContent.visible = false;
		} else {
			if (this.unloadedChildContent) {
				this.unloadedChildContent = false;
				this.totalContent.add(this.childContent);
			}
		}
		if (this.debugLine) {
			this.totalContent.remove(this.debugLine);
			this.unloadedDebugContent = true;
		}
		this.updateCallback();
		// TODO: should we also free up memory?
	}
	checkLoad(frustum, cameraPosition) {

		this.frustum = frustum;
		this.cameraPosition = cameraPosition;
		/*this.load();
		for (let i=0; i<this.children.length;i++) {
		  this.children[i].checkLoad(frustum, cameraPosition);
		}
		return;
		*/

		/*if (this.totalContent.parent.name === "world") {
		  this.totalContent.parent.updateMatrixWorld();
		}*/
		let transformedBox = this.box.clone();
		transformedBox.applyMatrix4(this.totalContent.matrixWorld);

		// is this tile visible?
		if (!frustum.intersectsBox(transformedBox)) {
			this.unload(true);
			return;
		}

		let worldBox = this.box.clone().applyMatrix4(this.worldTransform);
		let dist = worldBox.distanceToPoint(cameraPosition);


		//console.log(`dist: ${dist}, geometricError: ${this.geometricError}`);
		// are we too far to render this tile?
		if (this.geometricError > 0.0 && dist > this.geometricError * 50.0) {
			this.unload(true);
			return;
		}
		//console.log(`camPos: ${cameraPosition.z}, dist: ${dist}, geometricError: ${this.geometricError}`);

		// should we load this tile?
		if (this.refine == 'REPLACE' && dist < this.geometricError * 20.0) {
			this.unload(false);
		} else {
			this.load();
		}


		// should we load its children?
		for (let i = 0; i < this.children.length; i++) {
			if (dist < this.geometricError * 20.0) {
				this.children[i].checkLoad(frustum, cameraPosition);
			} else {
				this.children[i].unload(true);
			}
		}

		/*
		// below code loads tiles based on screenspace instead of geometricError,
		// not sure yet which algorith is better so i'm leaving this code here for now
		let sw = this.box.min.clone().project(camera);
		let ne = this.box.max.clone().project(camera);      
		let x1 = sw.x, x2 = ne.x;
		let y1 = sw.y, y2 = ne.y;
		let tilespace = Math.sqrt((x2 - x1)*(x2 - x1) + (y2 - y1)*(y2 - y1)); // distance in screen space
	    
		if (tilespace < 0.2) {
		  this.unload();
		}
		// do nothing between 0.2 and 0.25 to avoid excessive tile loading/unloading
		else if (tilespace > 0.25) {
		  this.load();
		  this.children.forEach(child => {
			child.checkLoad(camera);
		  });
		}*/

	}
}


class Layer {
	constructor(params) {
		if (!params) throw new Error('parameters missing for mapbox 3D tiles layer');
		if (!params.id) throw new Error('id parameter missing for mapbox 3D tiles layer');
		//if (!params.url) throw new Error('url parameter missing for mapbox 3D tiles layer');

		this.id = params.id,
			this.url = params.url;
		this.styleParams = {};
		if ('color' in params) this.styleParams.color = params.color;
		if ('opacity' in params) this.styleParams.opacity = params.opacity;
		if ('pointsize' in params) this.styleParams.pointsize = params.pointsize;
		if ('geomScale' in params) this.styleParams.geomScale = params.geomScale;

		this.loadStatus = 0;
		this.viewProjectionMatrix = null;

		this.type = 'custom';
		this.renderingMode = '3d';
	}
	LightsArray() {
		const arr = [];
		let directionalLight1 = new THREE.DirectionalLight(0xffffff, 0.9);
		directionalLight1.position.set(0.5, 1, 0.5).normalize();
		let target = directionalLight1.target.position.set(100000000, 1000000000, 0).normalize();
		arr.push(directionalLight1);

		let directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.9);
		//directionalLight2.position.set(0, 70, 100).normalize();
		directionalLight2.position.set(0.3, 0.3, 1).normalize();
		arr.push(directionalLight2);

		return arr;
	}
	loadVisibleTiles() {
		if (this.tileset && this.tileset.root) {
			//console.log(`map width: ${this.map.transform.width}, height: ${this.map.transform.height}`);
			//console.log(`Basegeometric error: ${40000000/(512*Math.pow(2,this.map.getZoom()))}`)
			this.tileset.root.checkLoad(this.cameraSync.frustum, this.cameraSync.cameraPosition);
		}
	}
	onAdd(map, gl) {
		this.map = map;
		const fov = 36.8;
		const aspect = map.getCanvas().width / map.getCanvas().height;
		const near = 0.000000000001;
		const far = Infinity;
		// create perspective camera, parameters reinitialized by CameraSync
		this.camera = new THREE.PerspectiveCamera(fov, aspect, near, far);

		this.mapQueryRenderedFeatures = map.queryRenderedFeatures.bind(this.map);
		this.map.queryRenderedFeatures = this.queryRenderedFeatures.bind(this);

		this.scene = new THREE.Scene();
		this.rootTransform = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
		let lightsarray = this.LightsArray();
		lightsarray.forEach(light => {
			this.scene.add(light);
		});
		this.world = new THREE.Group();
		this.world.name = 'flatMercatorWorld';
		this.scene.add(this.world);

		this.renderer = new THREE.WebGLRenderer({
			alpha: true,
			antialias: true,
			canvas: map.getCanvas(),
			context: gl,
		});

		this.renderer.shadowMap.enabled = true;
		this.renderer.autoClear = false;

		this.cameraSync = new CameraSync(this.map, this.camera, this.world);
		this.cameraSync.updateCallback = () => this.loadVisibleTiles();

		//raycaster for mouse events
		this.raycaster = new THREE.Raycaster();
		if (this.url) {
			this.tileset = new TileSet(() => this.map.triggerRepaint());
			this.tileset.load(this.url, this.styleParams).then(() => {
				if (this.tileset.root) {
					this.world.add(this.tileset.root.totalContent);
					this.world.updateMatrixWorld();
					this.loadStatus = 1;
					this.loadVisibleTiles();
				}
			}).catch(error => {
				console.error(`${error} (${this.url})`);
			})
		}
	}
	onRemove(map, gl) {
		// todo: (much) more cleanup?
		this.map.queryRenderedFeatures = this.mapQueryRenderedFeatures;
		this.cameraSync.detachCamera();
		this.cameraSync = null;
	}
	queryRenderedFeatures(geometry, options) {
		let result = this.mapQueryRenderedFeatures(geometry, options);
		if (!this.map || !this.map.transform) {
			return result;
		}
		if (!(options && options.layers && !options.layers.includes(this.id))) {
			if (geometry && geometry.x && geometry.y) {
				var mouse = new THREE.Vector2();

				// // scale mouse pixel position to a percentage of the screen's width and height
				mouse.x = (geometry.x / this.map.transform.width) * 2 - 1;
				mouse.y = 1 - (geometry.y / this.map.transform.height) * 2;

				this.raycaster.setFromCamera(mouse, this.camera);

				// calculate objects intersecting the picking ray
				let intersects = this.raycaster.intersectObjects(this.world.children, true);
				if (intersects.length) {
					let feature = {
						"type": "Feature",
						"properties": {},
						"geometry": {},
						"layer": { "id": this.id, "type": "custom 3d" },
						"source": this.url,
						"source-layer": null,
						"state": {}
					}
					let propertyIndex;
					let intersect = intersects[0];
					if (intersect.object && intersect.object.geometry &&
						intersect.object.geometry.attributes &&
						intersect.object.geometry.attributes._batchid) {
						let geometry = intersect.object.geometry;
						let vertexIdx = intersect.faceIndex;
						if (geometry.index) {
							// indexed BufferGeometry
							vertexIdx = geometry.index.array[intersect.faceIndex * 3];
							propertyIndex = geometry.attributes._batchid.data.array[vertexIdx * 7 + 6]
						} else {
							// un-indexed BufferGeometry
							propertyIndex = geometry.attributes._batchid.array[vertexIdx * 3];
						}
						let keys = Object.keys(intersect.object.userData);
						if (keys.length) {
							for (let propertyName of keys) {
								feature.properties[propertyName] = intersect.object.userData[propertyName][propertyIndex];
							}
						} else {
							feature.properties.batchId = propertyIndex;
						}
					} else {
						if (intersect.index != null) {
							feature.properties.index = intersect.index;
						} else {
							feature.properties.name = this.id;
						}
					}
					if (options.outline != false && (intersect.object !== this.outlinedObject ||
						(propertyIndex != null && propertyIndex !== this.outlinePropertyIndex)
						|| (propertyIndex == null && intersect.index !== this.outlineIndex))) {

						//WIP
						//this.outlinePass.selectedObjects = [intersect.object];

						// update outline
						if (this.outlineMesh) {
							let parent = this.outlineMesh.parent;
							parent.remove(this.outlineMesh);
							this.outlineMesh = null;
						}
						this.outlinePropertyIndex = propertyIndex;
						this.outlineIndex = intersect.index;
						if (intersect.object instanceof THREE.Mesh) {
							this.outlinedObject = intersect.object;
							let outlineMaterial = new THREE.MeshBasicMaterial({ color: options.outlineColor ? options.outlineColor : 0xff0000, wireframe: true });
							let outlineMesh;
							if (intersect.object &&
								intersect.object.geometry &&
								intersect.object.geometry.attributes &&
								intersect.object.geometry.attributes._batchid) {
								// create new geometry from faces that have same _batchid
								let geometry = intersect.object.geometry;
								if (geometry.index) {
									let ip1 = geometry.index.array[intersect.faceIndex * 3];
									let idx = geometry.attributes._batchid.data.array[ip1 * 7 + 6];
									let blockFaces = [];
									for (let faceIndex = 0; faceIndex < geometry.index.array.length; faceIndex += 3) {
										let p1 = geometry.index.array[faceIndex];
										if (geometry.attributes._batchid.data.array[p1 * 7 + 6] === idx) {
											let p2 = geometry.index.array[faceIndex + 1];
											if (geometry.attributes._batchid.data.array[p2 * 7 + 6] === idx) {
												let p3 = geometry.index.array[faceIndex + 2];
												if (geometry.attributes._batchid.data.array[p3 * 7 + 6] === idx) {
													blockFaces.push(faceIndex);
												}
											}
										}
									}
									let highLightGeometry = new THREE.Geometry();
									for (let vertexCount = 0, face = 0; face < blockFaces.length; face++) {
										let faceIndex = blockFaces[face];
										let p1 = geometry.index.array[faceIndex];
										let p2 = geometry.index.array[faceIndex + 1];
										let p3 = geometry.index.array[faceIndex + 2];
										let positions = geometry.attributes.position.data.array;
										highLightGeometry.vertices.push(
											new THREE.Vector3(positions[p1 * 7], positions[p1 * 7 + 1], positions[p1 * 7 + 2]),
											new THREE.Vector3(positions[p2 * 7], positions[p2 * 7 + 1], positions[p2 * 7 + 2]),
											new THREE.Vector3(positions[p3 * 7], positions[p3 * 7 + 1], positions[p3 * 7 + 2]),
										)
										highLightGeometry.faces.push(new THREE.Face3(vertexCount, vertexCount + 1, vertexCount + 2));
										vertexCount += 3;
									}
									highLightGeometry.computeBoundingSphere();
									outlineMesh = new THREE.Mesh(highLightGeometry, outlineMaterial);
								} else {
									let ip1 = intersect.faceIndex * 3;
									let idx = geometry.attributes._batchid.array[ip1];
									let blockFaces = [];
									for (let faceIndex = 0; faceIndex < geometry.attributes._batchid.array.length; faceIndex += 3) {
										let p1 = faceIndex;
										if (geometry.attributes._batchid.array[p1] === idx) {
											let p2 = faceIndex + 1;
											if (geometry.attributes._batchid.array[p2] === idx) {
												let p3 = faceIndex + 2;
												if (geometry.attributes._batchid.array[p3] === idx) {
													blockFaces.push(faceIndex);
												}
											}
										}
									}
									let highLightGeometry = new THREE.Geometry();
									for (let vertexCount = 0, face = 0; face < blockFaces.length; face++) {
										let faceIndex = blockFaces[face] * 3;
										let positions = geometry.attributes.position.array;
										highLightGeometry.vertices.push(
											new THREE.Vector3(positions[faceIndex], positions[faceIndex + 1], positions[faceIndex + 2]),
											new THREE.Vector3(positions[faceIndex + 3], positions[faceIndex + 4], positions[faceIndex + 5]),
											new THREE.Vector3(positions[faceIndex + 6], positions[faceIndex + 7], positions[faceIndex + 8]),
										)
										highLightGeometry.faces.push(new THREE.Face3(vertexCount, vertexCount + 1, vertexCount + 2));
										vertexCount += 3;
									}
									highLightGeometry.computeBoundingSphere();
									outlineMesh = new THREE.Mesh(highLightGeometry, outlineMaterial);
								}
							} else {
								outlineMesh = new THREE.Mesh(this.outlinedObject.geometry, outlineMaterial);
							}
							outlineMesh.position.x = this.outlinedObject.position.x + 0.1;
							outlineMesh.position.y = this.outlinedObject.position.y + 0.1;
							outlineMesh.position.z = this.outlinedObject.position.z + 0.1;
							outlineMesh.quaternion.copy(this.outlinedObject.quaternion);
							outlineMesh.scale.copy(this.outlinedObject.scale);
							outlineMesh.matrix.copy(this.outlinedObject.matrix);
							outlineMesh.raycast = () => { };
							outlineMesh.name = "outline";
							outlineMesh.wireframe = true;
							this.outlinedObject.parent.add(outlineMesh);
							this.outlineMesh = outlineMesh;
						}
					}
					result.unshift(feature);
					this.map.triggerRepaint();
				} else {
					this.outlinedObject = null;
					if (this.outlineMesh) {
						let parent = this.outlineMesh.parent;
						parent.remove(this.outlineMesh);
						this.outlineMesh = null;
						this.map.triggerRepaint();
					}
				}
			}
		}
		return result;
	}
	_update() {
		this.renderer.state.reset();
		this.renderer.render(this.scene, this.camera);

		/*if (this.loadStatus == 1) { // first render after root tile is loaded
		  this.loadStatus = 2;
		  let frustum = new THREE.Frustum();
		  frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
		  if (this.tileset.root) {
			this.tileset.root.checkLoad(frustum, this.getCameraPosition());
		  }
		}*/
	}
	update() {
		requestAnimationFrame(() => this._update());
	}
	render(gl, viewProjectionMatrix) {
		this._update();
	}
}

Mapbox3DTiles.Layer = Layer;

