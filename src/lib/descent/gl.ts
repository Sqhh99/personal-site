/**
 * The print: one WebGL1 fragment shader that turns a greyscale plate into two
 * inks by ordered dither. The canvas is exactly one pixel per dither cell and
 * is scaled up by CSS, so the shader runs over a few hundred thousand pixels
 * and costs next to nothing.
 *
 * Everything that moves is a change of exposure ahead of the threshold, so the
 * motion stays in the same grain as the still picture:
 *
 *  - the descent: the old plate gutters out and the new one catches, each
 *    cell changing over in its own turn, a little later toward the bottom;
 *  - the candle: a slow noise field breathes across the plate;
 *  - the lantern: under the pointer the black point drops and the shadows
 *    give up what is cut into them;
 *  - the motes: single cells of dust drifting up through the dark.
 */

import { BAYER8 } from './plates';

export const MOTES = 24;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;

uniform vec2 uGrid;
uniform sampler2D uBayer;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec4 uFromXf;
uniform vec4 uToXf;
uniform vec3 uFromTone;
uniform vec3 uToTone;
uniform float uMix;
uniform float uTime;
uniform float uLive;
uniform vec4 uLamp;
uniform vec3 uInk;
uniform vec3 uDark;
uniform vec3 uMotes[${MOTES}];

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}

float bayer(vec2 cell) {
  return texture2D(uBayer, (mod(cell, 8.0) + 0.5) / 8.0).r;
}

// The plate's brightness at p (0..1 across the screen, y down), with its edge
// fading into the dark wherever the plate does not reach.
float plate(sampler2D tex, vec4 xf, vec3 tone, vec2 p, float lift) {
  vec2 uv = p * xf.xy + xf.zw;
  vec2 edge = smoothstep(0.0, 0.04, uv) * smoothstep(1.0, 0.96, uv);
  float l = texture2D(tex, clamp(uv, 0.0, 1.0)).r * edge.x * edge.y;
  float lo = tone.x - 0.24 * lift;
  return pow(clamp((l - lo) / (tone.y - lo), 0.0, 1.0), tone.z);
}

void main() {
  vec2 cell = vec2(floor(gl_FragCoord.x), uGrid.y - 1.0 - floor(gl_FragCoord.y));
  vec2 p = (cell + 0.5) / uGrid;
  float threshold = bayer(cell);

  // The lantern: x, y in cells, radius in cells, strength.
  float d = distance(cell, uLamp.xy) / uLamp.z;
  float lift = uLamp.w * exp(-d * d * 2.4);

  // The descent: each cell changes plate when its turn in a second, offset
  // Bayer order comes up, the top of the screen a little before the bottom.
  float turn = bayer(cell + vec2(3.0, 5.0));
  float k = clamp(uMix * 1.4 - p.y * 0.4, 0.0, 1.0);
  float v = turn < k
    ? plate(uTo, uToXf, uToTone, p, lift)
    : plate(uFrom, uFromXf, uFromTone, p, lift);

  // The light gutters through the change, and the candle never quite settles.
  float exposure = 1.0 - sin(3.14159265 * uMix) * 0.8;
  float aspect = uGrid.x / uGrid.y;
  float breath = noise(vec2(p.x * aspect, p.y) * 2.6 + vec2(uTime * 0.07, -uTime * 0.05));
  float flutter = sin(uTime * 7.3) * sin(uTime * 3.1 + 1.0);
  exposure *= 1.0 + uLive * ((breath - 0.5) * 0.16 + flutter * 0.025);
  exposure *= 1.0 + 0.55 * lift;

  // The corners sink into the dark, and the foot darkens under the sigils —
  // still in the two inks, by lowering exposure rather than laying a tint.
  vec2 off = (p - vec2(0.5, 0.45)) * vec2(1.0, 1.15);
  exposure *= 1.0 - 0.45 * smoothstep(0.35, 0.85, length(off));
  exposure *= 1.0 - 0.55 * smoothstep(0.84, 1.0, p.y);

  // A whisper of grain on the threshold, so edges shimmer like cut line.
  // Never below the lowest Bayer step, or true black would catch dots.
  threshold = max(0.008, threshold + uLive * (hash(cell + floor(uTime * 10.0)) - 0.5) * 0.035);

  float lit = step(threshold, v * exposure);

  for (int i = 0; i < ${MOTES}; i++) {
    vec3 m = uMotes[i];
    if (m.z > 0.0 && floor(m.xy) == cell && m.z > threshold * 0.8) lit = 1.0;
  }

  gl_FragColor = vec4(mix(uDark, uInk, lit), 1.0);
}
`;

export interface FrameState {
  from: WebGLTexture;
  to: WebGLTexture;
  /** Screen to plate: uv = p · [sx, sy] + [ox, oy]. */
  fromXf: readonly number[];
  toXf: readonly number[];
  fromTone: readonly number[];
  toTone: readonly number[];
  mix: number;
  time: number;
  live: number;
  /** x, y and radius in cells, and strength 0..1. */
  lamp: readonly [number, number, number, number];
  motes: Float32Array;
}

export interface Printer {
  resize: (cols: number, rows: number) => void;
  upload: (img: TexImageSource) => WebGLTexture;
  /** A 1×1 black plate, to light the first one from. */
  black: WebGLTexture;
  draw: (s: FrameState) => void;
  lost: () => boolean;
}

const rgb = (hex: string): [number, number, number] => {
  const h = hex.trim().replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, '$&$&') : h, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export function createPrinter(canvas: HTMLCanvasElement, inks: { ink: string; dark: string }): Printer | null {
  const gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
  if (!gl) return null;

  const shader = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
    return s;
  };
  const prog = gl.createProgram()!;
  try {
    gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
  } catch (err) {
    console.warn('descent: falling back to a still print', err);
    return null;
  }
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const u = (name: string) => gl.getUniformLocation(prog, name);
  const loc = {
    grid: u('uGrid'),
    bayer: u('uBayer'),
    from: u('uFrom'),
    to: u('uTo'),
    fromXf: u('uFromXf'),
    toXf: u('uToXf'),
    fromTone: u('uFromTone'),
    toTone: u('uToTone'),
    mix: u('uMix'),
    time: u('uTime'),
    live: u('uLive'),
    lamp: u('uLamp'),
    ink: u('uInk'),
    dark: u('uDark'),
    motes: u('uMotes'),
  };

  const texture = (unit: number) => {
    const t = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  };

  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  texture(0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 8, 8, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, Uint8Array.from(BAYER8, (v) => Math.round(v * 255)));

  const black = texture(3);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, 1, 1, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, new Uint8Array([0]));

  gl.uniform1i(loc.bayer, 0);
  gl.uniform1i(loc.from, 1);
  gl.uniform1i(loc.to, 2);
  gl.uniform3fv(loc.ink, rgb(inks.ink));
  gl.uniform3fv(loc.dark, rgb(inks.dark));

  return {
    black,
    resize(cols, rows) {
      canvas.width = cols;
      canvas.height = rows;
      gl.viewport(0, 0, cols, rows);
      gl.uniform2f(loc.grid, cols, rows);
    },
    upload(img) {
      const t = texture(3);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, gl.LUMINANCE, gl.UNSIGNED_BYTE, img);
      return t;
    },
    draw(s) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, s.from);
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, s.to);
      gl.uniform4fv(loc.fromXf, s.fromXf);
      gl.uniform4fv(loc.toXf, s.toXf);
      gl.uniform3fv(loc.fromTone, s.fromTone);
      gl.uniform3fv(loc.toTone, s.toTone);
      gl.uniform1f(loc.mix, s.mix);
      gl.uniform1f(loc.time, s.time);
      gl.uniform1f(loc.live, s.live);
      gl.uniform4fv(loc.lamp, s.lamp);
      gl.uniform3fv(loc.motes, s.motes);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    lost: () => gl.isContextLost(),
  };
}
