import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
// @ts-ignore
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
// @ts-ignore
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
// @ts-ignore
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
// @ts-ignore
import { AfterimagePass } from 'three/examples/jsm/postprocessing/AfterimagePass';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { BiomeConfig, FaceState, WeatherData } from '../types';

// --- CUSTOM GEOMETRY GENERATOR ---

function createNeedleGeometry(): THREE.BufferGeometry {
  // "The Abyssal Needle"
  // Long, thin, worm-like tube that tapers to a point.
  // RadiusTop: 0.04 (Head), RadiusBottom: 0.0 (Tail point), Height: 3.5
  // RadialSegments: 5 (Pentagon), HeightSegments: 20 (Smooth undulation)
  const geometry = new THREE.CylinderGeometry(0.04, 0.0, 3.5, 5, 20);
  
  // Align with Z-axis (Swimming direction)
  // Standard Cylinder is Y-up. Rotate X 90deg -> +Y becomes +Z.
  // Result: Head (thick end) is at +Z, Tail (point) is at -Z.
  geometry.rotateX(Math.PI / 2);

  return geometry;
}

// --- ADVANCED BIO-MIMICRY SHADERS ---

const vertexShader = `
  precision highp float;

  attribute vec3 instancePos;
  attribute float aScale;
  attribute float aPhase;
  attribute float aSpeed;

  uniform float uTime;
  uniform float uWind;      
  uniform float uEntropy;   // Acts as "Cohesion" factor (0 = loose, 1 = tight school)
  uniform vec3 uHeadPos;    // "Predator"
  uniform float uJaw;       // "Scatter" force

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos; // For procedural texture
  varying float vDist;      // Stress level
  varying float vSpeed;
  varying vec2 vUv;

  // --- Simplex Noise 3D ---
  vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) { 
      const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
      const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
      vec3 i  = floor(v + dot(v, C.yyy) );
      vec3 x0 = v - i + dot(i, C.xxx) ;
      vec3 g = step(x0.yzx, x0.xyz);
      vec3 l = 1.0 - g;
      vec3 i1 = min( g.xyz, l.zxy );
      vec3 i2 = max( g.xyz, l.zxy );
      vec3 x1 = x0 - i1 + C.xxx;
      vec3 x2 = x0 - i2 + C.yyy;
      vec3 x3 = x0 - D.yyy;
      i = mod289(i); 
      vec4 p = permute( permute( permute( 
                  i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
      float n_ = 0.142857142857;
      vec3  ns = n_ * D.wyz - D.xzx;
      vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
      vec4 x_ = floor(j * ns.z);
      vec4 y_ = floor(j - 7.0 * x_ );
      vec4 x = x_ *ns.x + ns.yyyy;
      vec4 y = y_ *ns.x + ns.yyyy;
      vec4 h = 1.0 - abs(x) - abs(y);
      vec4 b0 = vec4( x.xy, y.xy );
      vec4 b1 = vec4( x.zw, y.zw );
      vec4 s0 = floor(b0)*2.0 + 1.0;
      vec4 s1 = floor(b1)*2.0 + 1.0;
      vec4 sh = -step(h, vec4(0.0));
      vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
      vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
      vec3 p0 = vec3(a0.xy,h.x);
      vec3 p1 = vec3(a0.zw,h.y);
      vec3 p2 = vec3(a1.xy,h.z);
      vec3 p3 = vec3(a1.zw,h.w);
      vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
      p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
      vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
      m = m * m;
      return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
  }

  vec3 snoiseVec3( vec3 x ){
    float s  = snoise(vec3( x ));
    float s1 = snoise(vec3( x.y - 19.1 , x.z + 33.4 , x.x + 47.2 ));
    float s2 = snoise(vec3( x.z + 74.2 , x.x - 124.5 , x.y + 99.4 ));
    return vec3( s , s1 , s2 );
  }

  // Curl noise for divergence-free fluid movement
  vec3 curlNoise( vec3 p ){
    const float e = 0.1;
    vec3 dx = vec3( e   , 0.0 , 0.0 );
    vec3 dy = vec3( 0.0 , e   , 0.0 );
    vec3 dz = vec3( 0.0 , 0.0 , e   );

    vec3 p_x0 = snoiseVec3( p - dx );
    vec3 p_x1 = snoiseVec3( p + dx );
    vec3 p_y0 = snoiseVec3( p - dy );
    vec3 p_y1 = snoiseVec3( p + dy );
    vec3 p_z0 = snoiseVec3( p - dz );
    vec3 p_z1 = snoiseVec3( p + dz );

    float x = p_y1.z - p_y0.z - p_z1.y + p_z0.y;
    float y = p_z1.x - p_z0.x - p_x1.z + p_x0.z;
    float z = p_x1.y - p_x0.y - p_y1.x + p_y0.x;

    const float divisor = 1.0 / ( 2.0 * e );
    return normalize( vec3( x , y , z ) * divisor );
  }

  mat4 rotationMatrix(vec3 axis, float angle) {
      axis = normalize(axis);
      float s = sin(angle); float c = cos(angle); float oc = 1.0 - c;
      return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                  oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                  oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                  0.0,                                0.0,                                0.0,                                1.0);
  }

  void main() {
      vUv = uv;
      vec3 pos = instancePos;
      
      // --- FLOCKING & SCHOOLING LOGIC ---

      // 1. Calculate Base Speed
      float speed = 0.5 + aSpeed * 0.4 + uWind * 0.2;
      speed += uJaw * 3.0;

      // 2. Infinite Scroll Z-Axis
      float zRange = 160.0;
      pos.z = mod(pos.z + uTime * 4.0 * speed, zRange) - (zRange * 0.5);

      // 3. Flow Field (Curl Noise)
      float flowScale = 0.02 - (uEntropy * 0.012); 
      vec3 flow = curlNoise(vec3(pos.x * flowScale, pos.y * flowScale, uTime * 0.15));
      pos += flow * (12.0 + uEntropy * 8.0);

      // 4. Center Bias
      vec3 centerBias = -vec3(pos.x, pos.y * 0.8, 0.0) * 0.015 * (0.5 + uEntropy);
      pos += centerBias;

      // 5. Predator Avoidance
      vec3 predator = vec3(uHeadPos.x * 70.0, uHeadPos.y * 50.0, 0.0);
      float distToPred = distance(pos, predator);
      float fearRadius = 35.0;
      float fear = smoothstep(fearRadius, 0.0, distToPred);
      
      vec3 fleeDir = normalize(pos - predator);
      fleeDir += normalize(pos) * uJaw * 2.5; 
      pos += fleeDir * (fear * 25.0 + uJaw * 15.0);
      pos.y -= fear * 12.0;

      // --- ANIMATION & ORIENTATION ---

      vec3 localPos = position;
      
      // Calculate Heading
      // Forward direction for geometry is now +Z.
      vec3 velocity = flow + vec3(0.0, 0.0, 1.2 * speed); 
      velocity += fleeDir * (fear * 2.0);
      vec3 heading = normalize(velocity);

      // Snake/Worm Undulation
      // Geometry is Z-aligned. Head at +1.75, Tail at -1.75 (approx, for Height 3.5)
      float swimFreq = 8.0 + speed * 6.0; // Deliberate slither
      
      // Wave spatial frequency: Higher than before to create S-curves along long body
      float wave = sin(uTime * swimFreq + aPhase + localPos.z * 3.0);
      
      // Mask wiggle: Head (+Z) is stabilized, Tail (-Z) whips more
      float flexibility = smoothstep(1.5, -2.0, localPos.z); 
      
      localPos.x += wave * 0.25 * aScale * flexibility;

      // Banking
      vec3 up = vec3(0.0, 1.0, 0.0);
      float turn = cross(heading, vec3(0.0, 0.0, 1.0)).y;
      vec3 bankedUp = (rotationMatrix(heading, -turn * 1.5) * vec4(up, 0.0)).xyz;
      
      // Construct Basis Matrix (LookAt)
      // Geometry Nose is +Z
      vec3 zAxis = heading; 
      vec3 xAxis = normalize(cross(bankedUp, zAxis));
      vec3 yAxis = cross(zAxis, xAxis);
      
      // Re-orthogonalize
      xAxis = cross(yAxis, zAxis);

      mat4 orient = mat4(
        xAxis.x, xAxis.y, xAxis.z, 0,
        yAxis.x, yAxis.y, yAxis.z, 0,
        zAxis.x, zAxis.y, zAxis.z, 0,
        0, 0, 0, 1
      );

      // Scale
      float dynamicScale = aScale * (1.0 + fear * 0.3);
      localPos *= dynamicScale;

      // Final Transform
      vec3 finalPos = (orient * vec4(localPos, 1.0)).xyz + pos;
      vec4 mvPosition = modelViewMatrix * vec4(finalPos, 1.0);
      
      gl_Position = projectionMatrix * mvPosition;

      // Varyings
      vWorldPos = finalPos;
      vLocalPos = localPos;
      vViewPosition = -mvPosition.xyz;
      // Transform normal
      vNormal = normalMatrix * (orient * vec4(normal, 0.0)).xyz;
      vDist = fear;
      vSpeed = speed;
  }
`;

const fragShader = `
  precision highp float;

  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uTime;
  uniform float uJaw;
  uniform vec3 uSunDir;

  varying vec3 vNormal;
  varying vec3 vViewPosition;
  varying vec3 vWorldPos;
  varying vec3 vLocalPos;
  varying float vDist; // Fear/Stress
  varying float vSpeed;

  // Simple pseudo-random function
  float rand(vec2 co){
      return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
  }

  // Procedural Caustics Pattern (Sharpened)
  float getCaustics(vec2 uv) {
    float t = uTime * 1.2;
    vec2 p = uv * 0.18;
    // Intersecting sine waves to mimic water light patterns
    float a = sin(p.x * 12.0 + t) + sin(p.y * 12.0 + t * 0.9);
    float b = sin(p.x * 20.0 - t * 0.6) + sin(p.y * 15.0 + t);
    float val = (a + b) * 0.5;
    return pow(max(0.0, val + 0.5), 8.0); // High contrast
  }

  void main() {
      // Vectors
      vec3 N = normalize(vNormal);
      vec3 V = normalize(vViewPosition);
      vec3 L = normalize(uSunDir); // Sun Direction
      vec3 H = normalize(L + V);   // Half vector

      // --- 0. Procedural Scales Pattern ---
      // Create a grid-like pattern based on local position
      float scaleFreq = 40.0;
      float scalePattern = sin(vLocalPos.z * scaleFreq) * sin(vLocalPos.x * (scaleFreq * 0.5));
      scalePattern = smoothstep(-0.5, 0.5, scalePattern); // Contrast/Sharpen

      // --- 1. Material Properties ---
      
      // Base Color - Mix based on speed (Energy)
      vec3 baseColor = mix(uColorA, uColorB, smoothstep(0.4, 2.0, vSpeed));
      
      // Iridescence (Fresnel-based color shift modulated by scales)
      float NdotV = max(dot(N, V), 0.0);
      // Cosine palette shift
      vec3 iridShift = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + (NdotV * 6.0) + (scalePattern * 2.0));
      float iridIntensity = pow(1.0 - NdotV, 2.0) * 0.6; // Stronger at edges
      
      vec3 albedo = mix(baseColor, iridShift, iridIntensity);

      // Panic Flash
      albedo = mix(albedo, uColorC, vDist * 0.8 + uJaw);

      // --- 2. Lighting Calculation (Wet PBR) ---
      
      // Specular - Wet & Sharp
      // Low roughness for wet look, modulated slightly by scales for surface variation
      float roughness = 0.15 + 0.1 * (1.0 - scalePattern); 
      float specPower = 256.0 * (1.0 - roughness);
      
      float NdotH = max(dot(N, H), 0.0);
      float specular = pow(NdotH, specPower) * 2.5; // High intensity for wetness
      
      // Glitter effect: Scale noise breaks up the highlight
      specular *= (0.8 + 0.5 * scalePattern); 
      
      // Diffuse (Wrapped Lambert for organic softness)
      float NdotL = dot(N, L);
      float diffuseTerm = max(0.0, NdotL * 0.6 + 0.4); 

      // --- 3. Bio-Effects ---

      // Subsurface Scattering (SSS)
      // Simulate light passing through fish body when backlit
      float sss = pow(max(dot(V, -L), 0.0), 3.0) * 0.5;
      // Rim effect
      float rim = pow(1.0 - NdotV, 4.0) * 0.4;
      
      vec3 innerGlow = mix(albedo, uColorC, 0.5) * (sss + rim);

      // Caustics Projection (Top-down)
      float causticsIntensity = getCaustics(vWorldPos.xz + vWorldPos.y * 0.1);
      float upFacing = smoothstep(-0.2, 1.0, N.y); // Only on top of fish
      vec3 caustics = uColorC * causticsIntensity * 1.5 * upFacing;

      // Anisotropic Highlight (Wet scales - flow direction)
      // Use Local Z as tangent for flow
      vec3 T = normalize(cross(N, vec3(0.0, 0.0, 1.0))); 
      float TdotH = dot(T, H);
      float aniso = sqrt(1.0 - TdotH * TdotH);
      aniso = pow(aniso, 60.0) * 0.3;

      // --- 4. Composition ---

      vec3 lighting = albedo * diffuseTerm;
      lighting += vec3(1.0) * (specular + aniso); // White specular
      lighting += innerGlow;
      lighting += caustics;

      // Deep Ocean Fog (Cinematic Distance)
      float dist = length(vViewPosition);
      vec3 deepColor = uColorA * 0.01; // Very dark fog
      float fogFactor = smoothstep(15.0, 140.0, dist);
      
      // Tone Mapping / Color Grading in Shader
      vec3 finalColor = mix(lighting, deepColor, fogFactor);
      
      // Cinematic Contrast (S-Curve approximation)
      finalColor = pow(finalColor, vec3(1.2)); 
      
      gl_FragColor = vec4(finalColor, 1.0);
  }
`;

interface Scene3DProps {
  biome: BiomeConfig;
  weather: WeatherData;
  onSyncUpdate: (val: number) => void;
  onLoaded: () => void;
}

interface AudioEngine {
  ctx: AudioContext;
  gain: GainNode;
  filter: BiquadFilterNode;
}

const Scene3D: React.FC<Scene3DProps> = ({ biome, weather, onSyncUpdate, onLoaded }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  
  const engineRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    composer: EffectComposer;
    mesh: THREE.InstancedMesh | null;
    material: THREE.ShaderMaterial | null;
    bloomPass: UnrealBloomPass;
    afterimagePass: AfterimagePass;
    landmarker: FaceLandmarker | null;
    faceState: FaceState;
    lastVideoTime: number;
    requestID: number;
    audio: AudioEngine | null;
  } | null>(null);

  // Initialize Engine
  useEffect(() => {
    if (!containerRef.current || engineRef.current) return;

    // 1. Setup THREE
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.02);

    const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 500);
    camera.position.set(0, 0, 40);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ 
        antialias: false, 
        powerPreference: "high-performance",
        stencil: false,
        depth: true
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9; // Slightly moody exposure
    containerRef.current.appendChild(renderer.domElement);

    // 2. Post Processing
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    // Underwater Glow
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.strength = 0.5; 
    bloomPass.radius = 0.8;
    bloomPass.threshold = 0.1;
    composer.addPass(bloomPass);

    const afterimagePass = new AfterimagePass();
    afterimagePass.uniforms.damp.value = 0.6; // Subtle trails for swimming
    composer.addPass(afterimagePass);

    // 3. Audio Engine
    const setupAudio = () => {
      try {
        const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioContext) return null;
        
        const ctx = new AudioContext();
        
        const bufferSize = ctx.sampleRate * 2; 
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 300;

        const gain = ctx.createGain();
        gain.gain.value = 0; 

        source.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);
        source.start();

        return { ctx, gain, filter };
      } catch (e) {
        console.error("Audio init failed", e);
        return null;
      }
    };

    engineRef.current = {
      scene,
      camera,
      renderer,
      composer,
      mesh: null,
      material: null,
      bloomPass,
      afterimagePass,
      landmarker: null,
      faceState: { detected: false, jaw: 0, headX: 0, headY: 0, presence: 0 },
      lastVideoTime: -1,
      requestID: 0,
      audio: setupAudio()
    };

    const resumeAudio = () => {
      const audio = engineRef.current?.audio;
      if (audio && audio.ctx.state === 'suspended') {
        audio.ctx.resume();
      }
    };
    document.addEventListener('click', resumeAudio);
    document.addEventListener('mousemove', resumeAudio);
    document.addEventListener('keydown', resumeAudio);

    // 4. Initialize Vision
    const initVision = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`, delegate: "GPU" },
          outputFaceBlendshapes: true, runningMode: "VIDEO", numFaces: 1
        });
        
        if (engineRef.current) {
          engineRef.current.landmarker = landmarker;
          startCamera();
        }
      } catch (e) {
        console.error("Failed to load vision:", e);
      }
    };

    const startCamera = async () => {
      try {
        if (!videoRef.current) return;
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        videoRef.current.addEventListener("loadeddata", () => {
            onLoaded();
        });
      } catch (e) {
        console.error("Camera access denied or missing", e);
        onLoaded();
      }
    };

    initVision();

    const handleResize = () => {
      if (!engineRef.current) return;
      const { camera, renderer, composer } = engineRef.current;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
      composer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      document.removeEventListener('click', resumeAudio);
      document.removeEventListener('mousemove', resumeAudio);
      document.removeEventListener('keydown', resumeAudio);
      
      if (engineRef.current) {
        cancelAnimationFrame(engineRef.current.requestID);
        engineRef.current.renderer.dispose();
        engineRef.current.composer.dispose();
        engineRef.current.audio?.ctx.close();
      }
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // Update Biome & Weather
  useEffect(() => {
    if (!engineRef.current) return;
    const { scene, bloomPass } = engineRef.current;
    
    if (engineRef.current.mesh) {
      scene.remove(engineRef.current.mesh);
      engineRef.current.mesh.geometry.dispose();
      if (Array.isArray(engineRef.current.mesh.material)) {
        engineRef.current.mesh.material.forEach(m => m.dispose());
      } else {
        engineRef.current.mesh.material.dispose();
      }
      engineRef.current.mesh = null;
    }

    scene.background = new THREE.Color(biome.bgColor);
    scene.fog = new THREE.FogExp2(biome.bgColor, 0.015);
    bloomPass.strength = biome.bloom;

    // --- GEOMETRY GENERATION ---
    const baseGeo = createNeedleGeometry();
    
    // Create Material
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: weather.wind },
        uEntropy: { value: 0 },
        uHeadPos: { value: new THREE.Vector3() },
        uJaw: { value: 0 },
        uSunDir: { value: new THREE.Vector3(0.5, 1.0, 0.5).normalize() },
        uColorA: { value: new THREE.Color(biome.palette[0]) },
        uColorB: { value: new THREE.Color(biome.palette[1]) },
        uColorC: { value: new THREE.Color(biome.palette[2]) }
      },
      vertexShader: vertexShader,
      fragmentShader: fragShader,
      side: THREE.DoubleSide,
    });
    engineRef.current.material = material;

    // Huge School
    const count = 10000;
    const mesh = new THREE.InstancedMesh(baseGeo, material, count);
    
    const dummy = new THREE.Object3D();
    const positions = [];
    const scales = [];
    const phases = [];
    const speeds = [];

    for (let i = 0; i < count; i++) {
        // Distribute in a large volume
        const x = (Math.random() - 0.5) * 150;
        const z = (Math.random() - 0.5) * 150;
        const y = (Math.random() - 0.5) * 60;

        dummy.position.set(x, y, z);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);

        positions.push(x, y, z);
        scales.push(0.5 + Math.random() * 1.5);
        phases.push(Math.random() * Math.PI * 2);
        
        // --- Erratic Speed Generation ---
        const r = Math.random();
        let s = 1.0;
        if (r > 0.9) {
            // Fast "hunters" or burst swimmers (10%)
            s = 2.0 + Math.random(); 
        } else if (r < 0.2) {
            // Slow drifters (20%)
            s = 0.2 + Math.random() * 0.3;
        } else {
            // Normal swimmers (70%)
            s = 0.6 + Math.random() * 0.8;
        }
        speeds.push(s); 
    }

    mesh.geometry.setAttribute('instancePos', new THREE.InstancedBufferAttribute(new Float32Array(positions), 3));
    mesh.geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(new Float32Array(scales), 1));
    mesh.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(new Float32Array(phases), 1));
    mesh.geometry.setAttribute('aSpeed', new THREE.InstancedBufferAttribute(new Float32Array(speeds), 1));

    engineRef.current.mesh = mesh;
    scene.add(mesh);

  }, [biome, weather]);

  // Animation Loop
  useEffect(() => {
    if (!engineRef.current) return;

    const loop = () => {
      const engine = engineRef.current;
      if (!engine) return;

      const { camera, composer, landmarker, faceState, mesh, material, audio } = engine;
      
      // Vision Logic
      if (landmarker && videoRef.current) {
         const video = videoRef.current;
         if (video.videoWidth > 0 && video.videoHeight > 0 && video.currentTime !== engine.lastVideoTime) {
           engine.lastVideoTime = video.currentTime;
           try {
              const res = landmarker.detectForVideo(video, performance.now());
              if (res.faceBlendshapes.length > 0 && res.faceLandmarks.length > 0) {
                faceState.detected = true;
                const jawCat = res.faceBlendshapes[0].categories.find(c => c.categoryName === 'jawOpen');
                faceState.jaw = jawCat ? jawCat.score : 0;
                const nose = res.faceLandmarks[0][1]; 
                faceState.headX = (nose.x - 0.5) * -2;
                faceState.headY = (nose.y - 0.5) * -2;
              } else {
                faceState.detected = false;
                faceState.jaw *= 0.9; // Decay
              }
           } catch(e) { /* ignore */ }
         }
      }

      // Physics/Logic
      const t = performance.now() * 0.001;
      const targetPresence = faceState.detected ? 1.0 : 0.0;
      faceState.presence += (targetPresence - faceState.presence) * 0.05; 
      
      onSyncUpdate(faceState.presence);

      if (mesh && material) {
         material.uniforms.uTime.value = t;
         material.uniforms.uEntropy.value = faceState.presence;
         
         // Smoothly update head position for the "Predator"
         material.uniforms.uHeadPos.value.lerp(new THREE.Vector3(faceState.headX, faceState.headY, 0), 0.1);
         
         // Jaw causes a "Startle"
         material.uniforms.uJaw.value += (faceState.jaw - material.uniforms.uJaw.value) * 0.1;
      }

      // Audio Updates (Bubbling/Murmur)
      if (audio) {
          // Volume swells with activity (wind + face presence)
          const activity = weather.wind * 0.01 + faceState.presence * 0.5 + faceState.jaw;
          const targetGain = 0.05 + Math.min(activity, 0.4); 
          audio.gain.gain.setTargetAtTime(targetGain, audio.ctx.currentTime, 0.1);
          
          // Filter opens up with jaw (Splashing sound simulation)
          const targetFreq = 200 + (faceState.jaw * 800); 
          audio.filter.frequency.setTargetAtTime(targetFreq, audio.ctx.currentTime, 0.1);
      }

      // Camera: Slowly drift with the current
      camera.position.x = Math.sin(t * 0.1) * 5.0;
      camera.position.y = Math.cos(t * 0.15) * 5.0;
      camera.rotation.z = Math.sin(t * 0.05) * 0.05; // Slight roll

      composer.render();
      engine.requestID = requestAnimationFrame(loop);
    };

    engineRef.current.requestID = requestAnimationFrame(loop);

    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps
      cancelAnimationFrame(engineRef.current?.requestID || 0);
    };
  }, [onSyncUpdate]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0" />
      <video ref={videoRef} className="absolute top-0 left-0 opacity-0 pointer-events-none" playsInline muted autoPlay />
    </>
  );
};

export default Scene3D;