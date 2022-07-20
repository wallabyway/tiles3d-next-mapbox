# Tiles3D-Mapbox
This is a demo implementation of 3D-Tiles-Next using mapbox-gl/three.js and is used to compare two different point-cloud compressions.

<img src="https://user-images.githubusercontent.com/440241/180083018-5359ecef-b37e-413f-9aa8-942acd10828e.gif" width="770px">

We are comparing the streaming experience (based on decode time, file size, web-worker displatch) and implementation simplicity between two point-cloud sets:  

1. 3D Tiles v1.0 using PNTS (Draco compressed points) and 
2. 3D Tiles Next v1.1 using glTF (MeshOpt compressed points)

##### Additional Notes

- The viewer is an minimal implementation of 3D-Tiles-Next, using a version of three.js based on mapbox-gl.
- this mapbox implementation highlights the importance of `locating a glTF on the planet` and connecting a piece of geometry with external meta-data by a `Feature-ID`


## Getting Started

### To Run

1. Start any static server

```
> python3 -m http.server
Serving HTTP on :: port 8000 (http://[::]:8000/) ...
```

2. open in a browser

```
> open http://localhost:8000
```

3. Click 'Rotterdam' button and debug

Also click 'debug' to turn on AABB debug boxes.


## Generating Point Clouds

To Download & convert PNTS files (3D Tiles v1) into glTF/glB (3D Tiles Next v1.1) use the steps below

![mermaid-diagram-2022-07-20-131552](https://user-images.githubusercontent.com/440241/180074510-b72371c9-e7a7-4450-9a3a-e75bee3acfd1.svg)

#### Step1: Download PNTS point-clouds (3D-Tiles v1) from BIM 360

https://gist.github.com/wallabyway/4c7de696d96edc6b57725e21d0dea374

#### Step2: Convert PNTS to glb (3D-Tiles-Next)

https://gist.github.com/wallabyway/d022f97191599c5d9dde4827aecec1e5




### References

- glTF format for point cloud tile used by 3d-tiles-next: https://github.com/wallabyway/minimal-pointcloud-gltf/blob/main/README.md
- discuss (slack glTF geospatial): https://gltfworkspace.slack.com

### Change List

- original code: https://github.com/Geodan/mapbox-3dtiles
- changed to ES6 modules. no bundler is needed (rollup)
- added support for Draco PNTS decompression
- added support for GLB/GLTF tiles (ie. 3D Tiles Next)
- split up mapbox3DTiles.mjs
	- cameraSync.js : isolating mapbox code. make standalone threejs version (TBD) 
	- tileLoader.js : seperate loaders for B3DM, PNTS, glTF, etc
- produce alternative version of cameraSync.js to use stock three.js, instead of mapbox-gl.
- the viewer can only handle PNTS files that are draco point cloud compressed.
- glb files can be either points or triangles
