"use client";

// Minimal, diagrammatic SVG-DOM plan view for 2340-echo-body.
//
// Top-down "observation room" plan: the listener's head at center, a solid
// "now-you" glyph at the live centroid/expansion, a trailing ribbon of past
// positions, and the hollow ECHO-SELF glyph riding that ribbon at the current
// temporal offset — so you SEE the echo lagging behind you, then crossing to
// lead. No canvas / WebGL: SVG attributes are mutated directly in the RAF loop.

import { forwardRef, useImperativeHandle, useRef } from "react";
import type { EchoSnapshot } from "./audio";

// Bone / silver on cool charcoal — art hex allowed in the SVG art layer.
const BONE = "#e8e8ea";
const SILVER = "#9a9aa2";
const DIM = "#5a5c66";

const CX = 200;
const CY = 208;
const BASE_R = 34;
const SPREAD_R = 118;

/** Map a body state to plan-view x/y. Forward (away from camera) is UP. */
export function planXY(centroid: number, expansion: number): [number, number] {
  const az = (centroid - 0.5) * 2 * (Math.PI * 80) / 180; // +-80deg
  const r = BASE_R + Math.max(0, Math.min(1, expansion)) * SPREAD_R;
  return [CX + r * Math.sin(az), CY - r * Math.cos(az)];
}

export interface TrailPoint {
  c: number;
  e: number;
}

export interface PlanHandle {
  draw(snap: EchoSnapshot, trail: TrailPoint[]): void;
}

export const EchoPlan = forwardRef<PlanHandle>(function EchoPlan(_props, ref) {
  const ribbon = useRef<SVGPolylineElement>(null);
  const nowGlyph = useRef<SVGCircleElement>(null);
  const nowHalo = useRef<SVGCircleElement>(null);
  const echoGlyph = useRef<SVGGElement>(null);
  const link = useRef<SVGLineElement>(null);
  const cMark = useRef<SVGLineElement>(null); // live centroid meter marker
  const cEchoMark = useRef<SVGLineElement>(null); // echo centroid meter marker
  const eMark = useRef<SVGRectElement>(null); // live expansion meter fill
  const eEchoMark = useRef<SVGLineElement>(null); // echo expansion meter marker
  const delayText = useRef<SVGTextElement>(null);
  const modeText = useRef<SVGTSpanElement>(null);

  useImperativeHandle(ref, () => ({
    draw(snap: EchoSnapshot, trail: TrailPoint[]) {
      const [nx, ny] = planXY(snap.live.centroid, snap.live.expansion);
      const [ex, ey] = planXY(snap.echo.centroid, snap.echo.expansion);

      if (ribbon.current) {
        ribbon.current.setAttribute(
          "points",
          trail.map((p) => planXY(p.c, p.e).join(",")).join(" "),
        );
      }
      if (nowGlyph.current) {
        nowGlyph.current.setAttribute("cx", nx.toFixed(1));
        nowGlyph.current.setAttribute("cy", ny.toFixed(1));
        nowGlyph.current.setAttribute("r", (4 + snap.live.expansion * 6).toFixed(1));
      }
      if (nowHalo.current) {
        nowHalo.current.setAttribute("cx", nx.toFixed(1));
        nowHalo.current.setAttribute("cy", ny.toFixed(1));
        nowHalo.current.setAttribute("r", (10 + snap.live.energy * 14).toFixed(1));
      }
      if (echoGlyph.current) {
        echoGlyph.current.setAttribute("transform", `translate(${ex.toFixed(1)},${ey.toFixed(1)})`);
      }
      if (link.current) {
        link.current.setAttribute("x1", nx.toFixed(1));
        link.current.setAttribute("y1", ny.toFixed(1));
        link.current.setAttribute("x2", ex.toFixed(1));
        link.current.setAttribute("y2", ey.toFixed(1));
      }

      // Meters. Centroid strip: x 60..340 at y 372. Expansion strip: y 60..356 at x 372.
      const cx = 60 + snap.live.centroid * 280;
      const cex = 60 + snap.echo.centroid * 280;
      if (cMark.current) {
        cMark.current.setAttribute("x1", cx.toFixed(1));
        cMark.current.setAttribute("x2", cx.toFixed(1));
      }
      if (cEchoMark.current) {
        cEchoMark.current.setAttribute("x1", cex.toFixed(1));
        cEchoMark.current.setAttribute("x2", cex.toFixed(1));
      }
      const eTop = 356 - snap.live.expansion * 296;
      if (eMark.current) {
        eMark.current.setAttribute("y", eTop.toFixed(1));
        eMark.current.setAttribute("height", (356 - eTop).toFixed(1));
      }
      const eey = 356 - snap.echo.expansion * 296;
      if (eEchoMark.current) {
        eEchoMark.current.setAttribute("y1", eey.toFixed(1));
        eEchoMark.current.setAttribute("y2", eey.toFixed(1));
      }

      if (delayText.current) {
        const d = snap.delaySec;
        const word = d >= 0 ? "lag" : "lead";
        delayText.current.textContent = `echo ${d >= 0 ? "+" : "−"}${Math.abs(d).toFixed(2)}s ${word}`;
      }
      if (modeText.current) {
        const m = Math.floor(snap.elapsedSec / 60);
        const s = Math.floor(snap.elapsedSec % 60);
        modeText.current.textContent = `t ${m}:${s.toString().padStart(2, "0")}`;
      }
    },
  }));

  return (
    <svg
      viewBox="0 0 400 400"
      className="h-full w-full"
      style={{ background: "#16171b" }}
      role="img"
      aria-label="Top-down plan of your body and its spatial echo-self around the listening head"
    >
      {/* range rings */}
      {[BASE_R, BASE_R + SPREAD_R * 0.4, BASE_R + SPREAD_R * 0.72, BASE_R + SPREAD_R].map(
        (r, i) => (
          <circle
            key={i}
            cx={CX}
            cy={CY}
            r={r}
            fill="none"
            stroke="#2a2c33"
            strokeWidth={1}
            strokeDasharray={i === 0 ? "none" : "2 5"}
          />
        ),
      )}
      {/* forward axis hint */}
      <line x1={CX} y1={CY} x2={CX} y2={CY - BASE_R - SPREAD_R} stroke="#23252b" strokeWidth={1} />

      {/* trailing ribbon of past positions */}
      <polyline
        ref={ribbon}
        points=""
        fill="none"
        stroke={DIM}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.75}
      />

      {/* line linking now-you to echo-self (the felt gap) */}
      <line ref={link} x1={CX} y1={CY} x2={CX} y2={CY} stroke={SILVER} strokeWidth={0.75} strokeDasharray="1 4" opacity={0.6} />

      {/* listener head at center */}
      <g>
        <circle cx={CX} cy={CY} r={9} fill="none" stroke={SILVER} strokeWidth={1.4} />
        <path d={`M ${CX - 4} ${CY - 8} L ${CX} ${CY - 13} L ${CX + 4} ${CY - 8}`} fill="none" stroke={SILVER} strokeWidth={1.4} />
        <circle cx={CX} cy={CY} r={1.6} fill={SILVER} />
      </g>

      {/* now-you glyph (solid bone) */}
      <circle ref={nowHalo} cx={CX} cy={CY} r={12} fill={BONE} opacity={0.08} />
      <circle ref={nowGlyph} cx={CX} cy={CY} r={6} fill={BONE} />

      {/* echo-self glyph (hollow, crosshaired) */}
      <g ref={echoGlyph} transform={`translate(${CX},${CY})`}>
        <circle r={8} fill="none" stroke={BONE} strokeWidth={1.4} />
        <line x1={-11} y1={0} x2={-4} y2={0} stroke={BONE} strokeWidth={1.1} />
        <line x1={4} y1={0} x2={11} y2={0} stroke={BONE} strokeWidth={1.1} />
        <line x1={0} y1={-11} x2={0} y2={-4} stroke={BONE} strokeWidth={1.1} />
        <line x1={0} y1={4} x2={0} y2={11} stroke={BONE} strokeWidth={1.1} />
      </g>

      {/* centroid meter (horizontal, bottom) */}
      <line x1={60} y1={372} x2={340} y2={372} stroke="#2a2c33" strokeWidth={2} strokeLinecap="round" />
      <line ref={cEchoMark} x1={200} y1={366} x2={200} y2={378} stroke={SILVER} strokeWidth={1.4} />
      <line ref={cMark} x1={200} y1={365} x2={200} y2={379} stroke={BONE} strokeWidth={2} />

      {/* expansion meter (vertical, right) */}
      <line x1={372} y1={60} x2={372} y2={356} stroke="#2a2c33" strokeWidth={2} strokeLinecap="round" />
      <rect ref={eMark} x={369} y={356} width={6} height={0} rx={3} fill={BONE} opacity={0.85} />
      <line ref={eEchoMark} x1={366} y1={356} x2={378} y2={356} stroke={SILVER} strokeWidth={1.4} />

      {/* labels */}
      <text x={60} y={392} fill={DIM} fontSize={9} letterSpacing={2} style={{ fontFamily: "monospace" }}>
        LEFT
      </text>
      <text x={340} y={392} fill={DIM} fontSize={9} letterSpacing={2} textAnchor="end" style={{ fontFamily: "monospace" }}>
        RIGHT
      </text>
      <text x={388} y={62} fill={DIM} fontSize={9} letterSpacing={2} textAnchor="end" style={{ fontFamily: "monospace" }}>
        WIDE
      </text>
      <text ref={delayText} x={16} y={26} fill={BONE} fontSize={11} letterSpacing={1} style={{ fontFamily: "monospace" }}>
        echo +2.25s lag
      </text>
      <text x={16} y={42} fill={DIM} fontSize={9} letterSpacing={1.5} style={{ fontFamily: "monospace" }}>
        <tspan ref={modeText}>t 0:00</tspan>
      </text>
    </svg>
  );
});
