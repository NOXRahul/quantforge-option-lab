import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RotateCcw, Move, Layers3, Grid2X2 } from "lucide-react";
import { bs, greeks, type Market, type Greek } from "./engine";

interface Props {
  market: Market;
  metric?: Greek | "price";
  axes?: "spot-vol" | "strike-time";
  compact?: boolean;
}
export default function Surface({
  market,
  metric = "price",
  axes = "spot-vol",
  compact = false,
}: Props) {
  const host = useRef<HTMLDivElement>(null),
    reset = useRef<() => void>(() => {});
  const [flat, setFlat] = useState(false),
    [failed, setFailed] = useState(false);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    value: number;
  } | null>(null);
  const rangeX =
    axes === "spot-vol"
      ? [market.spot * 0.55, market.spot * 1.45]
      : [market.strike * 0.55, market.strike * 1.45];
  const rangeY =
    axes === "spot-vol"
      ? [0.01, Math.min(3, Math.max(0.65, market.volatility * 1.5))]
      : [0.01, Math.min(30, Math.max(2, market.maturity * 1.5))];
  const evaluate = (x: number, y: number) => {
    const m =
      axes === "spot-vol"
        ? { ...market, spot: x, volatility: y }
        : { ...market, strike: x, maturity: y };
    return metric === "price" ? bs(m) : greeks(m)[metric];
  };

  useEffect(() => {
    if (flat || failed || !host.current) return;
    const el = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "low-power",
      });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0d0c10, 0);
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(-8, 7.3, 9.7);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1.2, 0);
    controls.enableDamping = false;
    controls.enablePan = false;
    controls.minDistance = 7;
    controls.maxDistance = 23;
    controls.minPolarAngle = 0.2;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    controls.update();
    const grid = new THREE.GridHelper(10, 20, 0x453039, 0x24212a);
    grid.position.y = -0.08;
    scene.add(grid);
    const n = 44,
      positions: number[] = [],
      colors: number[] = [],
      indices: number[] = [],
      raw: number[] = [];
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++)
        raw.push(
          evaluate(
            rangeX[0] + (i / n) * (rangeX[1] - rangeX[0]),
            rangeY[0] + (j / n) * (rangeY[1] - rangeY[0]),
          ),
        );
    const min = Math.min(0, ...raw.filter(Number.isFinite)),
      max = Math.max(...raw.filter(Number.isFinite)),
      extent = Math.max(max - min, 1e-10);
    const low = new THREE.Color("#38101e"),
      mid = new THREE.Color("#b52d48"),
      high = new THREE.Color("#ff9b9e");
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const v = raw[j * (n + 1) + i],
          h = Number.isFinite(v) ? (v - min) / extent : 0;
        positions.push((i / n - 0.5) * 8, 0.16 + h * 3.8, (j / n - 0.5) * 7);
        const color =
          h < 0.55
            ? low.clone().lerp(mid, h / 0.55)
            : mid.clone().lerp(high, (h - 0.55) / 0.45);
        colors.push(color.r, color.g, color.b);
        if (i < n && j < n) {
          const a = j * (n + 1) + i,
            b = a + 1,
            c = a + n + 1,
            d = c + 1;
          indices.push(a, c, b, b, c, d);
        }
      }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3),
    );
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    const lines: number[] = [];
    for (let j = 0; j <= n; j++)
      for (let i = 0; i <= n; i++) {
        const a = (j * (n + 1) + i) * 3;
        for (const b of [i < n ? a + 3 : -1, j < n ? a + 3 * (n + 1) : -1])
          if (b >= 0)
            lines.push(
              positions[a],
              positions[a + 1] + 0.004,
              positions[a + 2],
              positions[b],
              positions[b + 1] + 0.004,
              positions[b + 2],
            );
      }
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(lines, 3),
    );
    const lineMat = new THREE.LineBasicMaterial({
      color: 0xff8c9b,
      transparent: true,
      opacity: 0.28,
    });
    scene.add(new THREE.LineSegments(lineGeo, lineMat));
    const spriteTextures: THREE.CanvasTexture[] = [],
      spriteMaterials: THREE.SpriteMaterial[] = [];
    const label = (
      text: string,
      x: number,
      y: number,
      z: number,
      width = 2,
    ) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d")!;
      ctx.font = "24px monospace";
      ctx.fillStyle = "#c7b3c5";
      ctx.textAlign = "center";
      ctx.fillText(text, 128, 39);
      const texture = new THREE.CanvasTexture(canvas),
        mat = new THREE.SpriteMaterial({
          map: texture,
          transparent: true,
          depthTest: false,
        });
      spriteTextures.push(texture);
      spriteMaterials.push(mat);
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(x, y, z);
      sprite.scale.set(width, width / 4, 1);
      scene.add(sprite);
    };
    for (let i = 0; i <= 4; i++) {
      const f = i / 4;
      label(
        "$" + (rangeX[0] + f * (rangeX[1] - rangeX[0])).toFixed(0),
        (f - 0.5) * 8,
        -0.12,
        4.15,
        1.65,
      );
      label(
        axes === "spot-vol"
          ? ((rangeY[0] + f * (rangeY[1] - rangeY[0])) * 100).toFixed(0) + "%"
          : (rangeY[0] + f * (rangeY[1] - rangeY[0])).toFixed(1) + "y",
        -4.7,
        -0.05,
        (f - 0.5) * 7,
        1.5,
      );
      label(
        (min + f * extent).toFixed(metric === "price" ? 0 : 2),
        4.5,
        0.16 + f * 3.8,
        -3.7,
        1.4,
      );
    }
    label(
      axes === "spot-vol" ? "SPOT PRICE ($)" : "STRIKE ($)",
      0,
      -0.25,
      5,
      2.7,
    );
    label(
      axes === "spot-vol" ? "VOLATILITY" : "EXPIRY (YEARS)",
      -5.4,
      -0.1,
      0,
      2.5,
    );
    label(
      metric === "price" ? "OPTION VALUE ($)" : metric.toUpperCase(),
      4.5,
      4.6,
      -3.6,
      2.7,
    );
    const render = () => renderer.render(scene, camera);
    controls.addEventListener("change", render);
    reset.current = () => {
      camera.position.set(-8, 7.3, 9.7);
      controls.target.set(0, 1.2, 0);
      controls.update();
      render();
    };
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth,
        h = el.clientHeight;
      if (w && h) {
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.fov = w / h < 1.35 ? 58 : 38;
        camera.updateProjectionMatrix();
        render();
      }
    });
    resize.observe(el);
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let dragging = false;
    const move = (e: PointerEvent) => {
      if (dragging) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(mesh)[0];
      if (hit) {
        const x = rangeX[0] + (hit.point.x / 8 + 0.5) * (rangeX[1] - rangeX[0]),
          y = rangeY[0] + (hit.point.z / 7 + 0.5) * (rangeY[1] - rangeY[0]);
        setHover({ x, y, value: evaluate(x, y) });
      } else setHover(null);
    };
    const down = () => {
        dragging = true;
        setHover(null);
      },
      up = () => {
        dragging = false;
      },
      leave = () => setHover(null);
    const lost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    renderer.domElement.addEventListener("pointermove", move);
    renderer.domElement.addEventListener("pointerdown", down);
    window.addEventListener("pointerup", up);
    renderer.domElement.addEventListener("pointerleave", leave);
    renderer.domElement.addEventListener("webglcontextlost", lost);
    render();
    return () => {
      resize.disconnect();
      controls.dispose();
      window.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("pointermove", move);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerleave", leave);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      geometry.dispose();
      material.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      grid.geometry.dispose();
      (grid.material as THREE.Material).dispose();
      spriteTextures.forEach((t) => t.dispose());
      spriteMaterials.forEach((m) => m.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [market, metric, axes, flat, failed]);

  const cells = Array.from({ length: 25 }, (_, j) =>
    Array.from({ length: 32 }, (_, i) =>
      evaluate(
        rangeX[0] + (i / 31) * (rangeX[1] - rangeX[0]),
        rangeY[0] + (j / 24) * (rangeY[1] - rangeY[0]),
      ),
    ),
  );
  const values = cells.flat().filter(Number.isFinite),
    min = Math.min(...values),
    max = Math.max(...values);
  return (
    <div className={`surface ${compact ? "compact" : ""}`}>
      <div className="surface-tools">
        <span className="surface-mode">
          <span className="tiny-dot" />
          {flat || failed ? "2D HEATMAP" : "INTERACTIVE 3D"}
        </span>
        <div>
          <button
            className="icon-button"
            title="Reset camera"
            aria-label="Reset camera"
            onClick={() => reset.current()}
            disabled={flat || failed}
          >
            <RotateCcw size={14} />
          </button>
          <button
            className={`icon-button ${flat ? "selected" : ""}`}
            title="Switch between 2D and 3D"
            aria-label="Switch between 2D and 3D"
            onClick={() => setFlat(!flat)}
          >
            {flat ? <Layers3 size={15} /> : <Grid2X2 size={15} />}
          </button>
        </div>
      </div>
      {flat || failed ? (
        <div className="flat-surface">
          <div className="heat-y">
            {axes === "spot-vol" ? "Volatility →" : "Expiry →"}
          </div>
          <div className="heat-grid">
            {[...cells]
              .reverse()
              .map((row, j) =>
                row.map((v, i) => (
                  <button
                    key={`${j}-${i}`}
                    aria-label={`${axes === "spot-vol" ? "Spot" : "Strike"} ${rangeX[0] + (i / 31) * (rangeX[1] - rangeX[0])}, value ${v}`}
                    style={{
                      background: `hsl(${346 + ((v - min) / (max - min || 1)) * 12} 60% ${12 + ((v - min) / (max - min || 1)) * 56}%)`,
                    }}
                    onMouseEnter={() =>
                      setHover({
                        x: rangeX[0] + (i / 31) * (rangeX[1] - rangeX[0]),
                        y:
                          rangeY[0] + ((24 - j) / 24) * (rangeY[1] - rangeY[0]),
                        value: v,
                      })
                    }
                    onFocus={() =>
                      setHover({
                        x: rangeX[0] + (i / 31) * (rangeX[1] - rangeX[0]),
                        y:
                          rangeY[0] + ((24 - j) / 24) * (rangeY[1] - rangeY[0]),
                        value: v,
                      })
                    }
                  />
                )),
              )}
          </div>
          <div className="heat-x">
            ${rangeX[0].toFixed(0)}{" "}
            <span>{axes === "spot-vol" ? "Spot price" : "Strike price"}</span> $
            {rangeX[1].toFixed(0)}
          </div>
          {failed && (
            <small>WebGL unavailable. Showing the same data in 2D.</small>
          )}
        </div>
      ) : (
        <div
          ref={host}
          className="surface-canvas"
          aria-label={`Interactive ${metric} surface across ${axes === "spot-vol" ? "spot and volatility" : "strike and expiry"}. Drag to rotate or use the 2D switch.`}
          role="img"
        />
      )}
      {hover && (
        <div className="surface-tooltip">
          ${hover.x.toFixed(2)} <span> / </span>
          {axes === "spot-vol"
            ? `${(hover.y * 100).toFixed(1)}%`
            : `${hover.y.toFixed(2)}y`}
          <strong>
            {metric === "price" ? "$" : ""}
            {hover.value.toFixed(4)}
          </strong>
        </div>
      )}
      <div className="surface-legend">
        <span>
          <Move size={12} />
          {flat || failed
            ? "Hover to inspect"
            : "Drag to rotate · Scroll to zoom"}
        </span>
        <span>
          <i className="gradient-key" />
          {metric === "price" ? "Low → High value" : "Low → High sensitivity"}
        </span>
      </div>
    </div>
  );
}
