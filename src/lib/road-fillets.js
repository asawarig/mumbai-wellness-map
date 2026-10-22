/* Road colours and rounded corners.
 *
 * The basemap draws every road in one cream (basemap.js). This custom layer sits
 * straight after the roads and finishes them on the GPU.
 *
 * Colour. Roads inside the city are one violet, ROAD_COLOUR, whichever ground
 * they cross. The five corporation outlines are drawn into a mask, each in its
 * road colour, with a stencil (no triangulation needed), so a road changes colour
 * exactly where it crosses the city's edge or a corporation's, and roads outside
 * stay cream. A road's antialiased edge is un-mixed against the ground beside
 * it, so no cream fringe survives the recolouring.
 *
 * Corners. MapLibre gives every road round ends and joins, but where two roads
 * meet the block between them keeps a sharp corner. A blurred morphological
 * closing fills those: the road mask is blurred and cut low, which grows every
 * road and fills the corners between them, then blurred and cut high, which
 * shrinks the roads back but leaves the corners as curves. The blur follows the
 * zoom, so corners round a little from afar and more up close.
 *
 * A pixel counts as road when its darkest channel is brighter than any ground's;
 * the names and the city edge are drawn after this layer.
 */

import corporations from '../data/corporations.json';
import corporationAreas from '../data/corporation-areas.json';
import { LABEL_LAYERS, ROAD, onStyle } from './basemap.js';

export const ROAD_FILLETS = 'road-fillets';

/* The blur by MapLibre zoom, in CSS pixels. A corner comes out with a radius
   of about 1.3 times the blur, and a block narrower than about 2.5 times it
   fills in, so it tracks the width of the roads on screen. */
const SIGMA = [[10, 0.5], [12, 0.8], [14, 1], [15, 1.3], [16, 1.7], [17, 2.1], [18, 2.5]];
const GROW = 0.1;
const SHRINK = 0.9;
const MAX_TAPS = 24;
/* Outline vertices are stored relative to the city's middle, in thousandths of
   the mercator square, so float32 keeps its precision at street zoom. */
const UNIT = 1e-3;

const hexRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

/* Every road in the city, on every ground: a violet a step deeper than the
   lilac, so the roads read as part of the map rather than over it. It was an
   ochre made from each ground's lightness. */
const ROAD_COLOUR = hexRgb('#BB99F0');
const CORP_ROADS = Object.fromEntries(corporations.map((c) => [c.k, ROAD_COLOUR]));
const CITY_ROAD = ROAD_COLOUR;
let regions = false;

/* Corporation colours on: each corporation's roads from its own ground. Off:
   one road colour for the whole city. */
export function setRoadRegions(glMap, on) {
  regions = !!on;
  glMap?.triggerRepaint();
}

function sigmaAt(z) {
  if (z <= SIGMA[0][0]) return SIGMA[0][1];
  for (let i = 1; i < SIGMA.length; i++) {
    const [z1, s1] = SIGMA[i];
    if (z <= z1) {
      const [z0, s0] = SIGMA[i - 1];
      return s0 + (s1 - s0) * (z - z0) / (z1 - z0);
    }
  }
  return SIGMA[SIGMA.length - 1][1];
}

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const OUTLINE_VERT = `#version 300 es
in vec2 a_pos;
uniform mat4 u_matrix;
void main() {
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`;

const SOLID = `#version 300 es
precision highp float;
uniform vec3 u_color;
out vec4 o;
void main() {
  o = vec4(u_color, 1.0);
}`;

/* Road pixels to 1, ground to 0, antialiased edges in between. */
const MASK = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  o = vec4(smoothstep(0.865, 0.945, min(c.r, min(c.g, c.b))), 0.0, 0.0, 1.0);
}`;

/* One direction of a separable Gaussian. */
const BLUR = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform vec2 u_step;
uniform float u_sigma;
uniform int u_taps;
in vec2 v_uv;
out vec4 o;
void main() {
  float k = -0.5 / (u_sigma * u_sigma);
  float sum = texture(u_tex, v_uv).r, total = 1.0;
  for (int i = 1; i <= ${MAX_TAPS}; i++) {
    if (i > u_taps) break;
    float w = exp(float(i * i) * k);
    vec2 d = u_step * float(i);
    sum += (texture(u_tex, v_uv + d).r + texture(u_tex, v_uv - d).r) * w;
    total += 2.0 * w;
  }
  o = vec4(sum / total, 0.0, 0.0, 1.0);
}`;

/* A soft cut of the blurred mask. */
const CUT = `#version 300 es
precision highp float;
uniform sampler2D u_tex;
uniform float u_lo;
uniform float u_hi;
in vec2 v_uv;
out vec4 o;
void main() {
  o = vec4(smoothstep(u_lo, u_hi, texture(u_tex, v_uv).r), 0.0, 0.0, 1.0);
}`;

/* The finished screen. Each road pixel's cream share is found against the ground
   beside it and swapped for the road colour under it; the closed mask adds the
   rounded corners in that colour. */
const FINISH = `#version 300 es
precision highp float;
uniform sampler2D u_screen;
uniform sampler2D u_closed;
uniform sampler2D u_zone;
uniform vec3 u_cream;
uniform vec2 u_px;
uniform float u_lo;
uniform float u_hi;
in vec2 v_uv;
out vec4 o;
void main() {
  vec3 p = texture(u_screen, v_uv).rgb;
  float field = texture(u_closed, v_uv).r;
  vec4 zone = texture(u_zone, v_uv);
  vec3 road = mix(u_cream, zone.rgb, zone.a);

  vec3 ground = vec3(0.0);
  float weight = 0.0;
  for (int i = 0; i < 8; i++) {
    float t = float(i) * 0.7853982;
    vec3 q = texture(u_screen, v_uv + vec2(cos(t), sin(t)) * u_px * 2.5).rgb;
    float w = 1.0 - smoothstep(0.84, 0.925, min(q.r, min(q.g, q.b)));
    ground += q * w;
    weight += w;
  }
  float share = smoothstep(0.865, 0.945, min(p.r, min(p.g, p.b)));
  if (weight > 0.05) {
    ground /= weight;
    vec3 kg = u_cream - ground;
    share = clamp(dot(p - ground, kg) / max(dot(kg, kg), 0.0004), 0.0, 1.0);
  }
  share *= smoothstep(0.1, 0.35, share) * smoothstep(0.02, 0.25, field);

  vec3 colour = p + share * (road - u_cream);
  o = vec4(mix(colour, road, smoothstep(u_lo, u_hi, field)), 1.0);
}`;

function program(gl, frag, vert = VERT) {
  const p = gl.createProgram();
  [[gl.VERTEX_SHADER, vert], [gl.FRAGMENT_SHADER, frag]].forEach(([type, source]) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
    gl.deleteShader(s);
  });
  gl.bindAttribLocation(p, 0, 'a_pos');
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {};
  for (let i = 0; i < gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); i++) {
    const { name } = gl.getActiveUniform(p, i);
    u[name] = gl.getUniformLocation(p, name);
  }
  return { p, u };
}

function target(gl, { drawable = false, stencil = false } = {}) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return {
    tex,
    fb: drawable ? gl.createFramebuffer() : null,
    stencil: stencil ? gl.createRenderbuffer() : null,
    w: 0,
    h: 0,
  };
}

/* The copy of the screen is RGB, which can be copied from a canvas with or
   without alpha; the working targets are RGBA so they can be drawn into, and
   the outline mask carries a stencil. */
function resize(gl, t, w, h) {
  if (t.w === w && t.h === h) return;
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  if (t.fb) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t.tex, 0);
    if (t.stencil) {
      gl.bindRenderbuffer(gl.RENDERBUFFER, t.stencil);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, t.stencil);
    }
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, w, h, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
  }
  t.w = w;
  t.h = h;
}

function draw(gl, prog, out, tex, set) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb);
  gl.viewport(0, 0, out.w, out.h);
  gl.useProgram(prog.p);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(prog.u.u_tex, 0);
  set?.(prog.u);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/* Every outline ring as a triangle fan from its first point, in UNITs about the
   city's middle. Drawn with an inverting stencil, the fans leave odd coverage
   exactly inside the outline, holes included. */
function outlineGeometry() {
  const merc = ([lng, lat]) => [
    (lng + 180) / 360,
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360,
  ];
  const rings = corporationAreas.features.flatMap((f) => {
    const polygons = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
    return polygons.flatMap((polygon) => polygon.map((ring) => ({ rg: f.properties.rg, points: ring.map(merc) })));
  });
  const points = rings.flatMap((ring) => ring.points);
  const cx = points.reduce((sum, p) => sum + p[0], 0) / points.length;
  const cy = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  const data = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => {
    data[i * 2] = (x - cx) / UNIT;
    data[i * 2 + 1] = (y - cy) / UNIT;
  });
  let first = 0;
  const fans = rings.map((ring) => {
    const fan = { rg: ring.rg, first, count: ring.points.length };
    first += ring.points.length;
    return fan;
  });
  return { data, fans, cx, cy, corps: [...new Set(rings.map((ring) => ring.rg))] };
}

/* MapLibre's matrix for mercator 0..1, moved to the city's middle and scaled to
   UNITs. Worked in float64, so only the small result is rounded to float32. */
function outlineMatrix(m, cx, cy) {
  const out = new Float32Array(16);
  for (let i = 0; i < 4; i++) {
    out[i] = m[i] * UNIT;
    out[4 + i] = m[4 + i] * UNIT;
    out[8 + i] = m[8 + i];
    out[12 + i] = m[i] * cx + m[4 + i] * cy + m[12 + i];
  }
  return out;
}

export function roadFillets() {
  let map = null, gpu = null, failed = false;
  const cream = hexRgb(ROAD);
  const cityRoad = CITY_ROAD;

  /* Built on the first frame rather than in onAdd: MapLibre re-syncs its GL
     state after render, not after onAdd. */
  function init(gl) {
    try {
      const quadVao = gl.createVertexArray();
      gl.bindVertexArray(quadVao);
      const quad = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      const outline = outlineGeometry();
      const outlineVao = gl.createVertexArray();
      gl.bindVertexArray(outlineVao);
      const outlineBuf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, outlineBuf);
      gl.bufferData(gl.ARRAY_BUFFER, outline.data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

      gpu = {
        quadVao, quad, outlineVao, outlineBuf, outline,
        mask: program(gl, MASK), blur: program(gl, BLUR), cut: program(gl, CUT),
        finish: program(gl, FINISH), solid: program(gl, SOLID), fan: program(gl, SOLID, OUTLINE_VERT),
        screen: target(gl), a: target(gl, { drawable: true }), b: target(gl, { drawable: true }),
        zone: target(gl, { drawable: true, stencil: true }),
      };
    } catch (err) {
      failed = true;
      console.warn('Road colours and corners are off:', err.message);
    }
    return !failed;
  }

  /* Each corporation's outline, filled with its road colour, into the zone mask. */
  function drawZones(gl, args) {
    const { zone, outline, outlineVao, quadVao, fan, solid } = gpu;
    gl.bindFramebuffer(gl.FRAMEBUFFER, zone.fb);
    gl.viewport(0, 0, zone.w, zone.h);
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0xff);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(1);
    const matrix = outlineMatrix(args.defaultProjectionData.mainMatrix, outline.cx, outline.cy);
    outline.corps.forEach((rg) => {
      gl.colorMask(false, false, false, false);
      gl.stencilFunc(gl.ALWAYS, 0, 1);
      gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
      gl.bindVertexArray(outlineVao);
      gl.useProgram(fan.p);
      gl.uniformMatrix4fv(fan.u.u_matrix, false, matrix);
      outline.fans.forEach((f) => { if (f.rg === rg) gl.drawArrays(gl.TRIANGLE_FAN, f.first, f.count); });

      gl.colorMask(true, true, true, true);
      gl.stencilFunc(gl.EQUAL, 1, 1);
      gl.stencilOp(gl.ZERO, gl.ZERO, gl.ZERO);
      gl.bindVertexArray(quadVao);
      gl.useProgram(solid.p);
      gl.uniform3f(solid.u.u_color, ...((regions && CORP_ROADS[rg]) || cityRoad));
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    });
    gl.disable(gl.STENCIL_TEST);
  }

  return {
    id: ROAD_FILLETS,
    type: 'custom',
    renderingMode: '2d',
    onAdd(m) { map = m; },
    render(gl, args) {
      if (failed || (!gpu && !init(gl))) return;
      const { quadVao, mask, blur, cut, finish, screen, a, b, zone } = gpu;
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const sigma = sigmaAt(map.getZoom()) * map.getPixelRatio();
      /* A wide blur loses nothing at a lower resolution, and costs far less. */
      const f = sigma < 3 ? 1 : sigma < 8 ? 2 : 4;
      const w = Math.ceil(W / f), h = Math.ceil(H / f), s = sigma / f;
      const taps = Math.min(MAX_TAPS, Math.ceil(s * 3));
      const out = gl.getParameter(gl.FRAMEBUFFER_BINDING);
      const blurInto = (to, from, dx, dy) => draw(gl, blur, to, from.tex, (u) => {
        gl.uniform2f(u.u_step, dx, dy);
        gl.uniform1f(u.u_sigma, s);
        gl.uniform1i(u.u_taps, taps);
      });

      [gl.DEPTH_TEST, gl.STENCIL_TEST, gl.CULL_FACE, gl.SCISSOR_TEST, gl.BLEND].forEach((cap) => gl.disable(cap));
      gl.bindVertexArray(quadVao);
      gl.activeTexture(gl.TEXTURE0);

      resize(gl, screen, W, H);
      gl.bindTexture(gl.TEXTURE_2D, screen.tex);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);
      resize(gl, a, w, h);
      resize(gl, b, w, h);
      resize(gl, zone, W, H);

      draw(gl, mask, a, screen.tex);
      /* Grow. */
      blurInto(b, a, 1 / w, 0);
      blurInto(a, b, 0, 1 / h);
      draw(gl, cut, b, a.tex, (u) => { gl.uniform1f(u.u_lo, GROW - 0.05); gl.uniform1f(u.u_hi, GROW + 0.05); });
      /* Shrink back. */
      blurInto(a, b, 1 / w, 0);
      blurInto(b, a, 0, 1 / h);

      drawZones(gl, args);

      gl.bindFramebuffer(gl.FRAMEBUFFER, out);
      gl.viewport(0, 0, W, H);
      gl.bindVertexArray(quadVao);
      gl.useProgram(finish.p);
      [[screen.tex, 'u_screen'], [b.tex, 'u_closed'], [zone.tex, 'u_zone']].forEach(([tex, name], unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(finish.u[name], unit);
      });
      const edge = Math.min(0.08, Math.max(0.01, 0.12 / sigma));
      gl.uniform3f(finish.u.u_cream, ...cream);
      gl.uniform2f(finish.u.u_px, 1 / W, 1 / H);
      gl.uniform1f(finish.u.u_lo, SHRINK - edge);
      gl.uniform1f(finish.u.u_hi, SHRINK + edge);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      [2, 1, 0].forEach((unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, null);
      });
      gl.bindVertexArray(null);
    },
    onRemove(m, gl) {
      if (!gpu) return;
      [gpu.mask, gpu.blur, gpu.cut, gpu.finish, gpu.solid, gpu.fan].forEach(({ p }) => gl.deleteProgram(p));
      [gpu.screen, gpu.a, gpu.b, gpu.zone].forEach(({ tex, fb, stencil }) => {
        gl.deleteTexture(tex);
        if (fb) gl.deleteFramebuffer(fb);
        if (stencil) gl.deleteRenderbuffer(stencil);
      });
      [gpu.quad, gpu.outlineBuf].forEach((buf) => gl.deleteBuffer(buf));
      [gpu.quadVao, gpu.outlineVao].forEach((vao) => gl.deleteVertexArray(vao));
      gpu = null;
    },
  };
}

/* Between the roads and the first names, once the style has loaded. */
export function addRoadFillets(glMap) {
  onStyle(glMap, (m) => { if (!m.getLayer(ROAD_FILLETS)) m.addLayer(roadFillets(), LABEL_LAYERS[0]); });
}
