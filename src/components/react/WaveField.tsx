import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  varying float vElevation;

  void main() {
    vec3 pos = position;

    float elevation =
        sin(pos.x * 0.55 + uTime * 0.32) * 0.38
      + sin(pos.y * 0.78 - uTime * 0.24) * 0.30
      + sin((pos.x + pos.y) * 0.34 + uTime * 0.45) * 0.20;

    pos.z += elevation;
    vElevation = elevation;

    vec4 viewPosition = modelViewMatrix * vec4(pos, 1.0);
    // Scale points with distance so the far edge of the field reads as smaller.
    gl_PointSize = uSize * (1.0 / -viewPosition.z);
    gl_Position = projectionMatrix * viewPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorLow;
  uniform vec3 uColorHigh;
  uniform float uOpacity;
  varying float vElevation;

  void main() {
    // Round the square point sprite off into a soft dot.
    float d = distance(gl_PointCoord, vec2(0.5));
    if (d > 0.5) discard;

    vec3 color = mix(uColorLow, uColorHigh, smoothstep(-0.7, 0.7, vElevation));
    gl_FragColor = vec4(color, uOpacity * smoothstep(0.5, 0.1, d));
  }
`;

function Field({ animate }: { animate: boolean }) {
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      // gl_PointSize is in physical pixels, so this is divided down by distance
      // in the shader; ~55 lands around 4–5 CSS px at the camera distance below.
      uSize: { value: 55 },
      uColorLow: { value: new THREE.Color('#d4a27f') },
      uColorHigh: { value: new THREE.Color('#cc785c') },
      uOpacity: { value: 0.85 },
    }),
    [],
  );

  useFrame(({ clock }) => {
    if (!animate) return;
    uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <points rotation={[-Math.PI / 2.55, 0, Math.PI / 7]} position={[0, -0.4, 0]}>
      <planeGeometry args={[16, 16, 128, 128]} />
      <shaderMaterial
        uniforms={uniforms}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        transparent
        depthWrite={false}
        blending={THREE.NormalBlending}
      />
    </points>
  );
}

export default function WaveField() {
  // Never render on the server: WebGL needs a real canvas, and the static
  // gradient underneath this island is what shows until the chunk arrives.
  const [mounted, setMounted] = useState(false);
  const [animate, setAnimate] = useState(true);

  useEffect(() => {
    setAnimate(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <Canvas
      // Set inline rather than via a class: R3F writes `position: relative` onto
      // this container as an inline style, which no ordinary class can override.
      style={{ position: 'absolute', inset: 0 }}
      dpr={[1, 2]}
      // With reduced motion the scene renders once and then stops.
      frameloop={animate ? 'always' : 'demand'}
      gl={{ alpha: true, antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, 1.4, 6], fov: 42 }}
    >
      <Field animate={animate} />
    </Canvas>
  );
}
