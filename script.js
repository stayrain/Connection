import * as THREE from 'three';
import {
	PointLight,
	Bone,
	Color,
	CylinderGeometry,
	DoubleSide,
	Float32BufferAttribute,
	MeshPhongMaterial,
	PerspectiveCamera,
	Scene,
	SkinnedMesh,
	Skeleton,
	SkeletonHelper,
	Vector3,
	Uint16BufferAttribute,
	WebGLRenderer,
    Data3DTexture,
    RawShaderMaterial
} from 'three';
import { CCDIKSolver, CCDIKHelper } from 'three/addons/animation/CCDIKSolver.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ImprovedNoise } from 'three/addons/math/ImprovedNoise.js';
//import { pointer } from './raycaster.js';
let gui, scene, camera,lights, renderer, orbit, mesh, mesh1, bones, skeletonHelper, meshtest, m, geometry, geometry1, sphereInter;
let ikSolver, ikHelper;
let ikSolvers = [], ikHelpers = [];
var raycaster = new THREE.Raycaster() ;
let bgDarkness = 1;
const pointer = new THREE.Vector2();
let parentTransform;
let theta = 0, radius = 80;
let dir = -1;
//let targetPos;
const targetBone = new Bone();
const bone = new Bone();
const state = {
	switch: true
};
initScene();
render();

function initScene() {
	scene = new Scene();
	scene.background = new Color( "rgb(230, 230, 216)" );
	camera = new PerspectiveCamera( 50, window.innerWidth / window.innerHeight );
	camera.position.set( 0, 0, 200 );
	renderer = new WebGLRenderer( { antialias: false } );
	renderer.setPixelRatio( window.devicePixelRatio );
	renderer.setSize( window.innerWidth, window.innerHeight );
	document.body.appendChild( renderer.domElement );
	orbit = new OrbitControls( camera, renderer.domElement );
	orbit.enableZoom = false;
	window.addEventListener( 'resize', function () {
		camera.aspect = window.innerWidth / window.innerHeight;
		camera.updateProjectionMatrix();
		renderer.setSize( window.innerWidth, window.innerHeight );
	}, false );
	initBones();
	bg();
	createLights();
	setupRaycaster();
}


function createLights(){
	lights = [];
	lights[ 0 ] = new PointLight( 0xFAD2E6, 1, 0 );
	lights[ 1 ] = new PointLight( 0x4D628D7, 10, 0 );
	lights[ 2 ] = new PointLight( 0x4D628D7, 1, 0 );
	lights[ 0 ].position.set( 0, 50, 0 );
	lights[ 1 ].position.set( 0, 0, -50 );
	lights[ 2 ].position.set( 0, 0, 50);
	scene.add( lights[ 0 ] );
	scene.add( lights[ 1 ] );
	scene.add( lights[ 2 ] );
}


function bgShader() {			
    // Texture
    const size = 120;
    const data = new Uint8Array( size * size * size );
    let i = 0;
    const perlin = new ImprovedNoise();
    const vector = new Vector3();
    for ( let z = 0; z < size; z ++ ) {
        for ( let y = 0; y < size; y ++ ) {
            for ( let x = 0; x < size; x ++ ) {
                vector.set( x, y, z ).divideScalar( size );
                const d = perlin.noise( vector.x * 10.5, vector.y * 10.5, vector.z * 10.5 );
                data[ i ++ ] = d * size + size;
            }
        }
    }

    const texture = new Data3DTexture( data, size, size, size );
    texture.format = THREE.RedFormat;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.unpackAlignment = 1;
    texture.needsUpdate = true;
    // Material
    const vertexShader = /* glsl */`
        in vec3 position;
        uniform mat4 modelMatrix;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        uniform vec3 cameraPos;
        out vec3 vOrigin;
        out vec3 vDirection;
        void main() {
            vec4 mvPosition = modelViewMatrix * vec4( position, 1.0 );
            vOrigin = vec3( inverse( modelMatrix ) * vec4( cameraPos, 1 ) ).xyz;
            vDirection = position - vOrigin;
            gl_Position = projectionMatrix * mvPosition;
        }
    `;
    const fragmentShader = /* glsl */`
        precision highp float;
        precision highp sampler3D;
        uniform mat4 modelViewMatrix;
        uniform mat4 projectionMatrix;
        in vec3 vOrigin;
        in vec3 vDirection;
        out vec4 color;
        uniform sampler3D map;
        uniform float threshold;
        uniform float steps;
		uniform float brightness;
        vec2 hitBox( vec3 orig, vec3 dir ) {
            const vec3 box_min = vec3( - 0.5 );
            const vec3 box_max = vec3( 0.5 );
            vec3 inv_dir = 1.0 / dir;
            vec3 tmin_tmp = ( box_min - orig ) * inv_dir;
            vec3 tmax_tmp = ( box_max - orig ) * inv_dir;
            vec3 tmin = min( tmin_tmp, tmax_tmp );
            vec3 tmax = max( tmin_tmp, tmax_tmp );
            float t0 = max( tmin.x, max( tmin.y, tmin.z ) );
            float t1 = min( tmax.x, min( tmax.y, tmax.z ) );
            return vec2( t0, t1 );
        }
        float sample1( vec3 p ) {
            return texture( map, p ).r;
        }
        #define epsilon .0001
        vec3 normal( vec3 coord ) {
            if ( coord.x < epsilon ) return vec3( 1.0, 0.0, 0.0 );
            if ( coord.y < epsilon ) return vec3( 0.0, 1.0, 0.0 );
            if ( coord.z < epsilon ) return vec3( 0.0, 0.0, 1.0 );
            if ( coord.x > 1.0 - epsilon ) return vec3( - 1.0, 0.0, 0.0 );
            if ( coord.y > 1.0 - epsilon ) return vec3( 0.0, - 1.0, 0.0 );
            if ( coord.z > 1.0 - epsilon ) return vec3( 0.0, 0.0, - 1.0 );
            float step = 0.001;
            float x = sample1( coord + vec3( - step, 0.0, 0.0 ) ) - sample1( coord + vec3( step, 0.0, 0.0 ) );
            float y = sample1( coord + vec3( 0.0, - step, 0.0 ) ) - sample1( coord + vec3( 0.0, step, 0.0 ) );
            float z = sample1( coord + vec3( 0.0, 0.0, - step ) ) - sample1( coord + vec3( 0.0, 0.0, step ) );
            return normalize( vec3( x, y, z ) );
        }
        void main(){
            vec3 rayDir = normalize( vDirection );
            vec2 bounds = hitBox( vOrigin, rayDir );
            if ( bounds.x > bounds.y ) discard;
            bounds.x = max( bounds.x, 0.0 );
            vec3 p = vOrigin + bounds.x * rayDir;
            vec3 inc = 1.0 / abs( rayDir );
            float delta = min( inc.x, min( inc.y, inc.z ) );
            delta /= steps;
            for ( float t = bounds.x; t < bounds.y; t += delta ) {
                float d = sample1( p + 0.5 );
                if ( d > threshold ) {
                    color.rgb= normal( p + 0.4) * 0.3 + ( p * 1.9 + 0.7 );
					color.rgb -= brightness;
					color.r += 0.5;
                    color.a = 1.;
                    break;
                }
                p += rayDir * delta;
            }
            if ( color.a == 0.0 ) discard;
        }
    `;
    const material = new RawShaderMaterial( {
        glslVersion: THREE.GLSL3,
        uniforms: {
            map: { value: texture },
            cameraPos: { value: new Vector3() },
            threshold: { value: 0.6 },
            steps: { value: 100 },
			brightness: { value: 1},
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
    } );
        m = material;
}


function bg(){
    bgShader();
	const geometry = new THREE.SphereGeometry(80, 80, 80);
	var positionAttribute = geometry.attributes.position;
		for ( var i = 0; i < positionAttribute.count; i ++ ) {
			// access single vertex (x,y,z)	
			var x = positionAttribute.getX( i );
			var y = positionAttribute.getY( i );
			var z = positionAttribute.getZ( i );
			// modify data (in this case just the z coordinate)
			z += Math.random() * 2;
		}
	meshtest = new THREE.Mesh( geometry, m );
	scene.add( meshtest );



}


function createGeometry( sizing ) {
	const geometry = new CylinderGeometry(
		1, // radiusTop
		1, // radiusBottom
		sizing.height, // height
		30, // radiusSegments
		sizing.segmentCount * 10, // heightSegments
		true // openEnded
	);
    
	const position = geometry.attributes.position;
	const vertex = new Vector3();
	const skinIndices = [];
	const skinWeights = [];
	for ( let i = 0; i < position.count; i ++ ) {
		vertex.fromBufferAttribute( position, i );
		const y = ( vertex.y + sizing.halfHeight );
		const skinIndex = Math.floor( y / sizing.segmentHeight );
		const skinWeight = ( y % sizing.segmentHeight ) / sizing.segmentHeight;
		skinIndices.push( skinIndex, skinIndex + 1, 0, 0 );
		skinWeights.push( 1 - skinWeight, skinWeight, 0, 0 );
	}
	geometry.setAttribute( 'skinIndex', new Uint16BufferAttribute( skinIndices, 4 ) );
	geometry.setAttribute( 'skinWeight', new Float32BufferAttribute( skinWeights, 4 ) );
	return geometry;
}


function createBones( sizing) {
	bones = [];
	// "root bone"
	const rootBone = new Bone();
	rootBone.name = 'root';
	rootBone.position.y = - sizing.halfHeight;
	bones.push( rootBone );
	// "bone0"
	let prevBone = new Bone();
	prevBone.position.y = 0;
	//prevBone.position.x = off;
	rootBone.add( prevBone );
	bones.push( prevBone );
	// "bone1", "bone2", "bone3"
	for ( let i = 1; i <= sizing.segmentCount; i ++ ) {
		const bone = new Bone();
		bone.position.y = sizing.segmentHeight;
		bone.position.x = bone.position.x + THREE.MathUtils.randFloat(-20/i,20/i);

		bones.push( bone );
		bone.name = `bone${i}`;
		prevBone.add( bone );
		prevBone = bone;
	}
	// "target"
	targetBone.name = 'target';
	targetBone.position.y = sizing.height + sizing.segmentHeight; // relative to parent: rootBone
	targetBone.position.x = rootBone.position.x + THREE.MathUtils.randFloat(-5, 5);

	rootBone.add( targetBone );
	bones.push( targetBone );
	return bones;
}


function createMesh( geometry, bones ) {
	// = new MeshPhongMaterial( {
	// 	color: 0xFAD2E6,
	// 	emissive: 0xff0000,
	// 	emissiveIntensity: 0.1,

	// } );

	const material = new THREE.MeshPhysicalMaterial( {
		color:0xb44646,
	 	emissive: 0x8abfd0,
		emissiveIntensity: 0.3,
        metalness: 1,
        roughness: 1,
        reflectivity: 1
	});
	const mesh = new SkinnedMesh( geometry, material);
	const skeleton = new Skeleton( bones );
	mesh.add( bones[ 0 ] );
	mesh.bind( skeleton );
	skeletonHelper = new SkeletonHelper( mesh );
	skeletonHelper.material.linewidth = 2;
	scene.add( skeletonHelper );
	return mesh;
}


function addIkSolver(mesh) {
	const iks = [
		{
			target: 6,
			effector: 5,
			links: [ { index: 4 }, { index: 3 }, { index: 2 }, { index: 1 } ]
		}
	];
	ikSolver = new CCDIKSolver( mesh, iks );
	ikSolvers.push(ikSolver);
	ikHelper =  new CCDIKHelper( mesh, iks );
	ikHelpers.push(ikHelper);
}


function initBones() {
	const segmentHeight = 10;
	const segmentCount = 4;
	const height = segmentHeight * segmentCount;
	const halfHeight = height * 0.5;
	const sizing = {
		segmentHeight,
		segmentCount,
		height,
		halfHeight
	};

	let meshes = [];
	for (let i =0; i<=5; i++){
	geometry = createGeometry( sizing );
	const bones = createBones( sizing);
	mesh = createMesh( geometry, bones);
	meshes.push (mesh);
	scene.add( meshes[i] );
	addIkSolver(meshes[i]);
	scene.add( ikHelpers[i] );

	}



}

function setupRaycaster() {
	const geometry = new THREE.SphereGeometry (5);
    const material = new THREE.MeshPhongMaterial( { 
		color: 0xc2f60,
		emissive: 0xf62804,
		emissiveIntensity: 0.5
	} );
    sphereInter = new THREE.Mesh( geometry, material );
    scene.add( sphereInter );
    const lineGeometry = new THREE.BufferGeometry();
    const points = [];
    const point = new THREE.Vector3();
    const direction = new THREE.Vector3();
    for ( let i = 0; i < 50; i ++ ) {
        direction.x += Math.random() - 0.5;
        direction.y += Math.random() - 0.5;
        direction.z += Math.random() - 0.5;
        direction.normalize().multiplyScalar( 2 );
        point.add( direction );
        points.push( point.x, point.y, point.z );
    }
    lineGeometry.setAttribute( 'position', new THREE.Float32BufferAttribute( points, 3 ) );
    parentTransform = new THREE.Object3D();
    parentTransform.position.x = Math.random() * 10 - 5;
    parentTransform.position.y = Math.random() * 10 - 5;
    parentTransform.position.z = Math.random() * 10 - 5;
    parentTransform.rotation.x = Math.random() * 2 * Math.PI;
    parentTransform.rotation.y = Math.random() * 2 * Math.PI;
    parentTransform.rotation.z = Math.random() * 2 * Math.PI;
    parentTransform.scale.x = Math.random() + 0.5;
    parentTransform.scale.y = Math.random() + 0.5;
    parentTransform.scale.z = Math.random() + 0.5;
    for ( let i = 0; i < 50; i ++ ) {
        let object;
        const lineMaterial = new THREE.LineBasicMaterial( { color: 0xff0000 * Math.random(255)} );
        if ( Math.random() > 0.5 ) {
            object = new THREE.Line( lineGeometry, lineMaterial );
        } else {
            object = new THREE.LineSegments( lineGeometry, lineMaterial );
        }
        object.position.x = Math.random() * 20 - 10;
        object.position.y = Math.random() * 20 - 10;
        object.position.z = Math.random() * 20 - 10;
        object.rotation.x = Math.random() * 2 * Math.PI;
        object.rotation.y = Math.random() * 2 * Math.PI;
        object.rotation.z = Math.random() * 2 * Math.PI;
        object.scale.x = Math.random() + 0.5;
        object.scale.y = Math.random() + 0.5;
        object.scale.z = Math.random() + 0.5;
        parentTransform.add( object );
    }
    scene.add( parentTransform );
    raycaster = new THREE.Raycaster();
    raycaster.params.Line.threshold = 3;``
    document.addEventListener( 'pointermove', onPointerMove );
}

function onPointerMove( event ) {
    pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
}

function reTarget() {
	theta += 0.1;
	camera.position.x = radius * Math.sin( THREE.MathUtils.degToRad( theta ) );
	camera.position.y = radius * Math.sin( THREE.MathUtils.degToRad( theta ) );
	camera.position.z = radius * Math.cos( THREE.MathUtils.degToRad( theta ) );
	camera.lookAt( new Vector3(0,0,0) );
	camera.updateMatrixWorld();
    raycaster.setFromCamera( pointer, camera );
    const intersects = raycaster.intersectObjects( parentTransform.children, true );
    if ( intersects.length > 0 ) {
        sphereInter.visible = true;
        sphereInter.position.copy( intersects[ 0 ].point );
    } else {
        sphereInter.visible = false;
    }

	mesh.skeleton.bones
	.filter( ( bone ) => bone.name === 'target' )
	.forEach( function ( bone ) {
		bone.position.copy( sphereInter.position);
	} );
}

function render() {
    requestAnimationFrame( render ); 	
	bgDarkness += dir * 0.003;
	if (bgDarkness <= 0) {
		dir = -dir;
	 }else if (bgDarkness >= 2){
		dir = -dir;
	 }
	 lights[ 0 ].rotation.set( 0, Math.PI/2*bgDarkness, 0 );
	 lights[ 1 ].rotation.set( Math.PI/2*bgDarkness, 0, 0 );
	 lights[ 2 ].rotation.set( 0, 0, Math.PI/2*bgDarkness );


	meshtest.material.uniforms.brightness.value = bgDarkness;
	for(let i=0; i<=5; i++) {
		ikSolvers[i].update();
	}
	reTarget();
	renderer.render( scene, camera );
}