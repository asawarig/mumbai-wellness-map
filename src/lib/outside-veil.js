/* Beyond the city limits: less colour.
 *
 * A custom layer that sits after the greens and the water (and before the
 * roads) and finishes everything drawn so far outside the city's edge: its
 * saturation is taken down to SATURATION. Inside the city nothing is touched.
 *
 * MapLibre cannot filter part of its own drawing, and a CSS backdrop filter
 * over the canvas cannot be cut to a shape with a hole in it (the browser
 * clips it to the shape's bounding box), so this is done on the GPU, the way
 * road-fillets.js does its roads: the screen so far is copied to a texture,
 * the city's outline is drawn into a stencil to make an inside/outside mask,
 * and a full-screen pass redraws only the outside, desaturated.
 */

import { CITY_RINGS, OCEAN_FILL } from './basemap.js';

export const OUTSIDE_VEIL = 'outside-veil';

/* How much colour is left beyond the city: 1 is untouched, 0 is grey. */
const SATURATION = 0.45;
const SEA = [1, 3, 5].map((i) => parseInt(OCEAN_FILL.slice(i, i + 2), 16) / 255);
/* Outline vertices are stored relative to the city's middle, in thousandths of
   the mercator square, so float32 keeps its precision at street zoom. */
const UNIT = 1e-3;

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
out vec4 o;
void main() {
  o = vec4(1.0);
}`;

/* Outside the city only: the colour pulled towards its own grey. Inside,
   the pixel is left as it was. */
const FINISH = `#version 300 es
precision highp float;
uniform sampler2D u_screen;
uniform sampler2D u_outside;
uniform float u_saturation;
uniform vec3 u_sea;
in vec2 v_uv;
out vec4 o;
void main() {
  if (texture(u_outside, v_uv).r < 0.5) discard;
  vec3 c = texture(u_screen, v_uv).rgb;
  /* The sea lies outside the city all along a coast, but it is the city's
     sea: its own colour (OCEAN_FILL, used nowhere else) is left as it is. */
  if (distance(c, u_sea) < 0.02) discard;
  float grey = dot(c, vec3(0.299, 0.587, 0.114));
  o = vec4(mix(vec3(grey), c, u_saturation), 1.0);
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

function texture(gl) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/* The city's rings as triangle fans from their first points, in UNITs about
   the city's middle. Drawn with an inverting stencil, the fans leave odd
   coverage exactly inside the city. */
function outlineGeometry() {
  const merc = ([lng, lat]) => [
    (lng + 180) / 360,
    (180 - (180 / Math.PI) * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360))) / 360,
  ];
  const rings = CITY_RINGS.map((ring) => ring.map(merc));
  const points = rings.flat();
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const data = new Float32Array(points.length * 2);
  points.forEach(([x, y], i) => {
    data[i * 2] = (x - cx) / UNIT;
    data[i * 2 + 1] = (y - cy) / UNIT;
  });
  let first = 0;
  const fans = rings.map((ring) => {
    const fan = { first, count: ring.length };
    first += ring.length;
    return fan;
  });
  return { data, fans, cx, cy };
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

export function outsideVeil() {
  let map = null, gpu = null, failed = false;

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
        finish: program(gl, FINISH), solid: program(gl, SOLID), fan: program(gl, SOLID, OUTLINE_VERT),
        screen: texture(gl), mask: texture(gl), maskFb: gl.createFramebuffer(), stencil: gl.createRenderbuffer(),
        w: 0, h: 0,
      };
    } catch (err) {
      failed = true;
      console.warn('The veil beyond the city is off:', err.message);
    }
    return !failed;
  }

  function resize(gl, W, H) {
    if (gpu.w === W && gpu.h === H) return;
    gl.bindTexture(gl.TEXTURE_2D, gpu.screen);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, W, H, 0, gl.RGB, gl.UNSIGNED_BYTE, null);
    gl.bindTexture(gl.TEXTURE_2D, gpu.mask);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, gpu.maskFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, gpu.mask, 0);
    gl.bindRenderbuffer(gl.RENDERBUFFER, gpu.stencil);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.STENCIL_INDEX8, W, H);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.STENCIL_ATTACHMENT, gl.RENDERBUFFER, gpu.stencil);
    gpu.w = W;
    gpu.h = H;
  }

  /* White wherever the city is not, black inside it. */
  function drawMask(gl, args) {
    const { maskFb, outline, outlineVao, quadVao, fan, solid, w, h } = gpu;
    gl.bindFramebuffer(gl.FRAMEBUFFER, maskFb);
    gl.viewport(0, 0, w, h);
    gl.colorMask(true, true, true, true);
    gl.stencilMask(0xff);
    gl.clearColor(0, 0, 0, 0);
    gl.clearStencil(0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
    gl.enable(gl.STENCIL_TEST);
    gl.stencilMask(1);

    gl.colorMask(false, false, false, false);
    gl.stencilFunc(gl.ALWAYS, 0, 1);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.INVERT);
    gl.bindVertexArray(outlineVao);
    gl.useProgram(fan.p);
    gl.uniformMatrix4fv(fan.u.u_matrix, false, outlineMatrix(args.defaultProjectionData.mainMatrix, outline.cx, outline.cy));
    outline.fans.forEach((f) => gl.drawArrays(gl.TRIANGLE_FAN, f.first, f.count));

    gl.colorMask(true, true, true, true);
    gl.stencilFunc(gl.EQUAL, 0, 1);
    gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
    gl.bindVertexArray(quadVao);
    gl.useProgram(solid.p);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.disable(gl.STENCIL_TEST);
  }

  return {
    id: OUTSIDE_VEIL,
    type: 'custom',
    renderingMode: '2d',
    onAdd(m) { map = m; },
    render(gl, args) {
      if (failed || (!gpu && !init(gl))) return;
      const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
      const out = gl.getParameter(gl.FRAMEBUFFER_BINDING);

      [gl.DEPTH_TEST, gl.STENCIL_TEST, gl.CULL_FACE, gl.SCISSOR_TEST, gl.BLEND].forEach((cap) => gl.disable(cap));
      gl.activeTexture(gl.TEXTURE0);
      resize(gl, W, H);
      gl.bindFramebuffer(gl.FRAMEBUFFER, out);
      gl.bindTexture(gl.TEXTURE_2D, gpu.screen);
      gl.copyTexSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 0, 0, W, H);

      drawMask(gl, args);

      const { finish, quadVao, screen, mask } = gpu;
      gl.bindFramebuffer(gl.FRAMEBUFFER, out);
      gl.viewport(0, 0, W, H);
      gl.bindVertexArray(quadVao);
      gl.useProgram(finish.p);
      [[screen, 'u_screen'], [mask, 'u_outside']].forEach(([tex, name], unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(finish.u[name], unit);
      });
      gl.uniform1f(finish.u.u_saturation, SATURATION);
      gl.uniform3fv(finish.u.u_sea, SEA);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      [1, 0].forEach((unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, null);
      });
      gl.bindVertexArray(null);
    },
    onRemove(m, gl) {
      if (!gpu) return;
      [gpu.finish, gpu.solid, gpu.fan].forEach(({ p }) => gl.deleteProgram(p));
      [gpu.screen, gpu.mask].forEach((t) => gl.deleteTexture(t));
      gl.deleteFramebuffer(gpu.maskFb);
      gl.deleteRenderbuffer(gpu.stencil);
      [gpu.quad, gpu.outlineBuf].forEach((b) => gl.deleteBuffer(b));
      [gpu.quadVao, gpu.outlineVao].forEach((v) => gl.deleteVertexArray(v));
      gpu = null;
    },
  };
}

/* After the greens and water, before the roads: under 'corp-ground', the
   first layer after them. Once per style. */
export function addOutsideVeil(glMap) {
  const add = () => {
    if (!glMap.getLayer(OUTSIDE_VEIL)) glMap.addLayer(outsideVeil(), 'corp-ground');
  };
  try { add(); } catch { glMap.once('style.load', add); }
}
