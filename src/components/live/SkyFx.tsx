"use client";

import { useEffect, useRef } from "react";
import { animate, stagger, utils } from "animejs";

// Animated backdrop for the live scoreboard: a slowly drifting gradient,
// light beams sweeping across, twinkling specks and shooting stars (anime.js).
// Purely decorative: no pointer events, and still when the viewer asks for
// reduced motion.

const BEAMS = 6;
/** Aurora ribbons: soft, blurred colour bands that sway and breathe. */
const AURORA = [
  { c: "rgba(45,212,191,.85)",  c2: "rgba(56,189,248,.55)",  top: "4%",  left: "-10%", w: "70vw", h: "26vh", rot: -12 },
  { c: "rgba(167,139,250,.8)",  c2: "rgba(236,72,153,.5)",  top: "18%", left: "35%",  w: "65vw", h: "24vh", rot: 9 },
  { c: "rgba(74,222,128,.7)",  c2: "rgba(45,212,191,.5)",   top: "48%", left: "-5%",  w: "60vw", h: "22vh", rot: 6 },
  { c: "rgba(96,165,250,.8)",   c2: "rgba(167,139,250,.5)", top: "62%", left: "45%",  w: "62vw", h: "26vh", rot: -8 },
];
const SPECKS = 36;

export function SkyFx() {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const anims: { pause: () => unknown }[] = [];

    // Aurora: each ribbon drifts, sways, stretches and pulses on its own slow cycle.
    el.querySelectorAll<HTMLElement>("[data-aurora]").forEach((a, i) => {
      anims.push(animate(a, {
        translateX: [`${utils.random(-8, -2)}vw`, `${utils.random(4, 12)}vw`],
        translateY: [`${utils.random(-4, 0)}vh`, `${utils.random(2, 7)}vh`],
        rotate: [`${AURORA[i].rot - 6}deg`, `${AURORA[i].rot + 6}deg`],
        scaleX: [0.9, 1.25],
        scaleY: [1, 0.75],
        opacity: [0.55, 1],
        duration: utils.random(9000, 15000),
        delay: i * 900,
        alternate: true,
        loop: true,
        ease: "inOutSine",
      }));
    });

    // Light beams: thin streaks gliding across at different heights, angles and speeds.
    el.querySelectorAll<HTMLElement>("[data-beam]").forEach((b, i) => {
      anims.push(animate(b, {
        translateX: ["-40vw", "140vw"],
        opacity: [{ to: 0.9, duration: 1200 }, { to: 0.9, duration: 4000 }, { to: 0, duration: 1600 }],
        duration: utils.random(7000, 12000),
        delay: i * 1300,
        loop: true,
        loopDelay: utils.random(800, 4000),
        ease: "inOutSine",
      }));
    });

    // Specks twinkle out of step.
    anims.push(animate(el.querySelectorAll("[data-speck]"), {
      opacity: [0.15, 0.9],
      scale: [0.6, 1.25],
      duration: () => utils.random(1400, 3200),
      delay: stagger(140, { from: "random" }),
      alternate: true,
      loop: true,
      ease: "inOutQuad",
    }));

    // Shooting stars: one every couple of seconds, top-right → bottom-left, removed when done.
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const shoot = () => {
      if (!alive) return;
      const star = document.createElement("span");
      const len = utils.random(120, 260);
      star.className = "lb-star";
      star.style.width = `${len}px`;
      star.style.left = `${utils.random(30, 105)}vw`;
      star.style.top = `${utils.random(-10, 45)}vh`;
      el.appendChild(star);
      const dist = utils.random(45, 80);
      animate(star, {
        translateX: [0, `-${dist}vw`],
        translateY: [0, `${dist * 0.55}vw`],
        opacity: [{ to: 1, duration: 250 }, { to: 1, duration: 500 }, { to: 0, duration: 550 }],
        duration: utils.random(1100, 1700),
        ease: "inQuad",
        onComplete: () => star.remove(),
      });
      timer = setTimeout(shoot, utils.random(900, 2600));
    };
    timer = setTimeout(shoot, 600);

    return () => { alive = false; clearTimeout(timer); anims.forEach((a) => a.pause()); };
  }, []);

  return (
    <div ref={root} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <style>{`
@keyframes lbHue{0%{filter:hue-rotate(0deg) blur(48px)}50%{filter:hue-rotate(40deg) blur(56px)}100%{filter:hue-rotate(0deg) blur(48px)}}
@keyframes lbDrift{0%{background-position:0% 0%}50%{background-position:100% 60%}100%{background-position:0% 0%}}
@keyframes lbGrid{from{background-position:0 0}to{background-position:0 120px}}
.lb-star{position:absolute;height:2px;border-radius:999px;opacity:0;transform-origin:left center;rotate:-29deg;
  background:linear-gradient(90deg,#fff 0%,rgba(191,219,254,.9) 18%,rgba(147,197,253,0) 100%);
  box-shadow:0 0 8px 1px rgba(255,255,255,.95),0 0 18px 2px rgba(96,165,250,.55)}
`}</style>
      {/* Drifting colour wash */}
      <div className="absolute -inset-[20%] opacity-70"
        style={{ backgroundImage: "radial-gradient(40% 35% at 20% 25%, rgba(59,130,246,.28), transparent 70%), radial-gradient(35% 30% at 80% 70%, rgba(139,92,246,.24), transparent 70%), radial-gradient(30% 25% at 60% 15%, rgba(56,189,248,.18), transparent 70%)",
          backgroundSize: "160% 160%", animation: "lbDrift 26s ease-in-out infinite" }} />
      {/* Aurora — colours slowly shift hue as the ribbons sway (anime.js) */}
      <div className="absolute inset-0" style={{ animation: "lbHue 18s ease-in-out infinite", mixBlendMode: "screen" }}>
        {AURORA.map((a, i) => (
          <span key={i} data-aurora className="absolute rounded-[50%]"
            style={{ top: a.top, left: a.left, width: a.w, height: a.h, rotate: `${a.rot}deg`, opacity: 0.7,
              background: `radial-gradient(60% 55% at 50% 50%, ${a.c}, ${a.c2} 55%, transparent 75%)` }} />
        ))}
      </div>
      {/* Faint perspective grid sliding down */}
      <div className="absolute inset-x-0 bottom-0 h-[45%] opacity-40"
        style={{ backgroundImage: "linear-gradient(rgba(125,211,252,.35) 1px, transparent 1px), linear-gradient(90deg, rgba(125,211,252,.28) 1px, transparent 1px)",
          backgroundSize: "120px 120px", transform: "perspective(600px) rotateX(58deg)", transformOrigin: "bottom",
          maskImage: "linear-gradient(to top, black, transparent)", WebkitMaskImage: "linear-gradient(to top, black, transparent)",
          animation: "lbGrid 6s linear infinite" }} />
      {/* Light beams */}
      {Array.from({ length: BEAMS }, (_, i) => (
        <span key={i} data-beam className="absolute left-0 h-px opacity-0"
          style={{ top: `${8 + i * 15}%`, width: `${28 + (i % 3) * 12}vw`, rotate: `${i % 2 ? -6 : 4}deg`,
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,.95), rgba(147,197,253,.8), transparent)",
            boxShadow: "0 0 10px rgba(255,255,255,.8)" }} />
      ))}
      {/* Twinkling specks */}
      {Array.from({ length: SPECKS }, (_, i) => (
        <span key={i} data-speck className="absolute rounded-full bg-white"
          style={{ left: `${(i * 37) % 100}%`, top: `${(i * 53) % 100}%`, width: i % 5 ? 3 : 5, height: i % 5 ? 3 : 5,
            opacity: 0.3, boxShadow: "0 0 6px rgba(255,255,255,.9)" }} />
      ))}
    </div>
  );
}
