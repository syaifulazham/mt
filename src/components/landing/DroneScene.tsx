"use client";

import { useEffect, useRef } from "react";
import type * as THREE_TYPES from "three";

export function DroneScene() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let animId: number;
    let renderer: THREE_TYPES.WebGLRenderer;

    (async () => {
      const THREE = await import("three");
      const canvas = canvasRef.current;
      if (!canvas) return;

      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x020812, 1);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
      camera.position.set(0, 0, 38);

      scene.fog = new THREE.FogExp2(0x020812, 0.022);
      scene.add(new THREE.AmbientLight(0x0a1535, 3));

      const dirLight = new THREE.DirectionalLight(0x00f5ff, 2.5);
      dirLight.position.set(10, 20, 15);
      scene.add(dirLight);

      const redLight = new THREE.PointLight(0xcc0001, 6, 40);
      redLight.position.set(-15, 5, 8);
      scene.add(redLight);

      const goldLight = new THREE.PointLight(0xffd700, 4, 35);
      goldLight.position.set(15, -5, 6);
      scene.add(goldLight);

      // ── Materials ──────────────────────────────────────────────────────────
      const bodyMat  = new THREE.MeshStandardMaterial({ color: 0x0d1f3c, metalness: 0.85, roughness: 0.25 });
      const armMat   = new THREE.MeshStandardMaterial({ color: 0x111c30, metalness: 0.9,  roughness: 0.2  });
      const propMat  = new THREE.MeshStandardMaterial({ color: 0x00f5ff, metalness: 0.6,  roughness: 0.3, transparent: true, opacity: 0.55 });
      const ledRedM  = new THREE.MeshStandardMaterial({ color: 0xff2233, emissive: 0xff1122 as unknown as THREE_TYPES.Color, emissiveIntensity: 4 });
      const ledCyanM = new THREE.MeshStandardMaterial({ color: 0x00f5ff, emissive: 0x00e5ee as unknown as THREE_TYPES.Color, emissiveIntensity: 5 });
      const ledGoldM = new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffc000 as unknown as THREE_TYPES.Color, emissiveIntensity: 4 });

      // ── Glow sprite texture builder ────────────────────────────────────────
      function makeGlowTexture(hexColor: string, size = 256): THREE_TYPES.CanvasTexture {
        const cv = document.createElement("canvas");
        cv.width = cv.height = size;
        const ctx = cv.getContext("2d")!;
        const half = size / 2;
        const grad = ctx.createRadialGradient(half, half, 0, half, half, half);
        grad.addColorStop(0,    hexColor.replace(")", ",0.9)").replace("rgb(", "rgba("));
        grad.addColorStop(0.25, hexColor.replace(")", ",0.45)").replace("rgb(", "rgba("));
        grad.addColorStop(0.6,  hexColor.replace(")", ",0.12)").replace("rgb(", "rgba("));
        grad.addColorStop(1,    "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, size, size);
        return new THREE.CanvasTexture(cv);
      }

      // Pre-bake one texture per LED theme color
      const glowTexCyan = makeGlowTexture("rgb(0,245,255)");
      const glowTexRed  = makeGlowTexture("rgb(255,34,51)");
      const glowTexGold = makeGlowTexture("rgb(255,215,0)");

      const glowDefs: { ledMat: THREE_TYPES.Material; lightColor: number; glowTex: THREE_TYPES.CanvasTexture; engineTex: THREE_TYPES.CanvasTexture }[] = [
        { ledMat: ledCyanM, lightColor: 0x00f5ff, glowTex: glowTexCyan, engineTex: makeGlowTexture("rgb(0,245,255)", 64) },
        { ledMat: ledRedM,  lightColor: 0xff2233, glowTex: glowTexRed,  engineTex: makeGlowTexture("rgb(255,34,51)",  64) },
        { ledMat: ledGoldM, lightColor: 0xffd700, glowTex: glowTexGold, engineTex: makeGlowTexture("rgb(255,215,0)",  64) },
      ];

      // ── Build drone with glow ──────────────────────────────────────────────
      function buildDrone(def: typeof glowDefs[0]) {
        const { ledMat, lightColor, glowTex, engineTex } = def;
        const g = new THREE.Group();

        // Body
        g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.45, 0.22, 16), bodyMat));
        const dome = new THREE.Mesh(new THREE.SphereGeometry(0.38, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x162040, metalness: 0.9, roughness: 0.15 }));
        dome.position.y = 0.11; g.add(dome);
        const cam = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.14, 8), new THREE.MeshStandardMaterial({ color: 0x050d1f, metalness: 0.95, roughness: 0.1 }));
        cam.position.set(0, -0.16, 0.34); cam.rotation.x = Math.PI / 2 * 0.4; g.add(cam);

        // Arms + motors + props
        [45, 135, 225, 315].forEach((deg, i) => {
          const rad = deg * Math.PI / 180;
          const arm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.14), armMat);
          arm.rotation.y = rad; arm.position.set(Math.cos(rad) * 0.55, 0, Math.sin(rad) * 0.55); g.add(arm);
          const mx = Math.cos(rad) * 1.35, mz = Math.sin(rad) * 1.35;
          const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.18, 0.22, 12), armMat);
          motor.position.set(mx, 0.06, mz); g.add(motor);
          const prop = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.04, 4, 24), (propMat as THREE_TYPES.MeshStandardMaterial).clone());
          prop.position.set(mx, 0.2, mz); prop.rotation.x = Math.PI / 2;
          prop.userData.spinSpeed = 0.18 + (i * 0.02); prop.userData.spinDir = i % 2 === 0 ? 1 : -1;
          g.add(prop);
          const led = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), ledMat);
          led.position.set(mx, -0.06, mz); g.add(led);

          // Engine glow sprite at each motor
          const engSprite = new THREE.Sprite(new THREE.SpriteMaterial({
            map: engineTex,
            blending: THREE.AdditiveBlending,
            transparent: true,
            depthWrite: false,
            opacity: 0.7,
          }));
          engSprite.position.set(mx, 0.22, mz);
          engSprite.scale.set(1.2, 1.2, 1);
          engSprite.userData.isEngineGlow = true;
          g.add(engSprite);
        });

        // Top LED
        const topLed = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), ledMat);
        topLed.position.y = 0.36; g.add(topLed);

        // Body halo sprite (large soft glow around the whole drone)
        const haloSprite = new THREE.Sprite(new THREE.SpriteMaterial({
          map: glowTex,
          blending: THREE.AdditiveBlending,
          transparent: true,
          depthWrite: false,
          opacity: 0.55,
        }));
        haloSprite.scale.set(6, 6, 1);
        haloSprite.userData.isHalo = true;
        g.add(haloSprite);

        // Per-drone point light — child so it moves with the drone
        const dLight = new THREE.PointLight(lightColor, 2.5, 12);
        dLight.userData.isDroneLight = true;
        g.add(dLight);

        return g;
      }

      // ── Spawn drones ──────────────────────────────────────────────────────
      const DRONE_COUNT = 14;
      const drones: THREE_TYPES.Group[] = [];
      const spread = 30, depth = 20;

      for (let i = 0; i < DRONE_COUNT; i++) {
        const def = glowDefs[i % glowDefs.length];
        const drone = buildDrone(def);
        const angle = (i / DRONE_COUNT) * Math.PI * 2;
        const r = 8 + (i % 3) * 4;
        drone.position.set(
          Math.cos(angle) * r * (spread / 20),
          Math.sin(angle * 1.3) * 9,
          (i % 5 - 2) * (depth / 5) - 5
        );
        drone.scale.setScalar(0.5 + (i % 4) * 0.2);
        drone.userData = {
          floatAmp:    0.3 + (i % 5) * 0.1,
          floatFreq:   0.3 + (i % 4) * 0.1,
          floatOffset: (i / DRONE_COUNT) * Math.PI * 2,
          rotSpd:      ((i % 2 === 0 ? 1 : -1) * 0.006) + (i % 3) * 0.001,
          pitchAmp:    0.06 + (i % 4) * 0.02,
          rollAmp:     0.05 + (i % 3) * 0.02,
          basePos:     drone.position.clone(),
          formTarget:  null as THREE_TYPES.Vector3 | null,
          glowPhase:   (i / DRONE_COUNT) * Math.PI * 2,
        };
        scene.add(drone); drones.push(drone);
      }

      // ── Particles ─────────────────────────────────────────────────────────
      const pCount = 600;
      const pGeo = new THREE.BufferGeometry();
      const pPos = new Float32Array(pCount * 3);
      for (let i = 0; i < pCount * 3; i++) pPos[i] = ((i * 7919) % 120) - 60;
      pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3));
      scene.add(new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x00f5ff, size: 0.12, transparent: true, opacity: 0.35 })));

      const gridHelper = new THREE.GridHelper(80, 40, 0x003366, 0x001133);
      gridHelper.position.set(0, -14, -10); scene.add(gridHelper);

      // ── Formations ────────────────────────────────────────────────────────
      const formations = [
        () => drones.map((_, i) => { const a = (i / DRONE_COUNT) * Math.PI * 2, r = 11; return { x: Math.cos(a) * r, y: Math.sin(a) * r * 0.55, z: -3 }; }),
        () => drones.map((_, i) => { const col = i % 4, row = Math.floor(i / 4); return { x: (col - 1.5) * 5.5, y: (1 - row) * 4.5, z: -2 }; }),
        () => drones.map((_, i) => { const t = (i / DRONE_COUNT) * Math.PI * 4; return { x: Math.cos(t) * 9, y: (i / DRONE_COUNT) * 16 - 8, z: Math.sin(t) * 4 }; }),
        () => { const pts = [{x:0,y:8,z:0},{x:6,y:4,z:0},{x:-6,y:4,z:0},{x:10,y:0,z:0},{x:-10,y:0,z:0},{x:6,y:-4,z:0},{x:-6,y:-4,z:0},{x:0,y:-8,z:0},{x:3,y:0,z:-4},{x:-3,y:0,z:-4},{x:0,y:4,z:-5},{x:0,y:-4,z:-5},{x:5,y:0,z:4},{x:-5,y:0,z:4}]; return drones.map((_, i) => pts[i] || {x:0,y:0,z:0}); },
      ];

      let formationActive = false;
      let formationTimer: ReturnType<typeof setTimeout> | null = null;
      let formIdx = 0;

      function pickFormation() {
        formIdx = (formIdx + 1) % formations.length;
        const pos = formations[formIdx]();
        drones.forEach((d, i) => { d.userData.formTarget = new THREE.Vector3(pos[i].x, pos[i].y, pos[i].z); });
      }

      function activateFormation() {
        if (!formationActive) { formationActive = true; pickFormation(); }
        if (formationTimer) clearTimeout(formationTimer);
        formationTimer = setTimeout(() => {
          formationActive = false;
          drones.forEach(d => { d.userData.formTarget = null; });
        }, 2800);
      }

      // ── Raycaster ─────────────────────────────────────────────────────────
      const raycaster = new THREE.Raycaster();
      const pointer = new THREE.Vector2();
      const droneObjects: THREE_TYPES.Object3D[] = [];
      drones.forEach(d => d.traverse(c => { if ((c as THREE_TYPES.Mesh).isMesh) droneObjects.push(c); }));
      let mouseX = 0, mouseY = 0;

      const onMove = (e: MouseEvent) => {
        mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        pointer.set(mouseX, -mouseY);
        raycaster.setFromCamera(pointer, camera);
        if (raycaster.intersectObjects(droneObjects, false).length > 0) activateFormation();
      };
      window.addEventListener("mousemove", onMove);

      // ── Animation loop ────────────────────────────────────────────────────
      const clock = new THREE.Clock();
      const _tmp = new THREE.Vector3();

      function animate() {
        animId = requestAnimationFrame(animate);
        const t = clock.getElapsedTime();

        drones.forEach(d => {
          const ud = d.userData;

          // Position / rotation
          if (formationActive && ud.formTarget) {
            d.position.lerp(ud.formTarget, 0.045);
            _tmp.copy(ud.formTarget).sub(d.position);
            d.rotation.x += (Math.atan2(_tmp.y, _tmp.z) * 0.3 - d.rotation.x) * 0.08;
            d.rotation.z += (-Math.atan2(_tmp.x, _tmp.z) * 0.3 - d.rotation.z) * 0.08;
            d.rotation.y += ud.rotSpd * 3;
          } else {
            d.position.y = ud.basePos.y + Math.sin(t * ud.floatFreq + ud.floatOffset) * ud.floatAmp;
            d.position.x = ud.basePos.x + Math.sin(t * 0.15 + ud.floatOffset) * 2;
            d.position.z = ud.basePos.z + Math.cos(t * 0.12 + ud.floatOffset) * 1.5;
            d.rotation.y += ud.rotSpd;
            d.rotation.x = Math.sin(t * 0.4 + ud.floatOffset) * ud.pitchAmp;
            d.rotation.z = Math.cos(t * 0.35 + ud.floatOffset) * ud.rollAmp;
          }

          // Pulse value: 0.6–1.0 range, slow sinusoidal
          const pulse = 0.8 + 0.2 * Math.sin(t * 1.8 + ud.glowPhase);
          const formBoost = formationActive ? 1.5 : 1;

          const boost = formationActive ? 2.8 : 1;
          d.children.forEach(child => {
            // Propeller spin
            if (child.userData.spinSpeed) {
              child.rotation.z += child.userData.spinSpeed * child.userData.spinDir * boost;
            }
            // Halo sprite — pulsing scale & opacity
            if (child.userData.isHalo) {
              const sprite = child as THREE_TYPES.Sprite;
              const s = (5.5 + pulse * 1.5) * formBoost;
              sprite.scale.set(s, s, 1);
              (sprite.material as THREE_TYPES.SpriteMaterial).opacity = 0.35 * pulse * formBoost;
            }
            // Engine glow sprites — tighter pulse
            if (child.userData.isEngineGlow) {
              const sprite = child as THREE_TYPES.Sprite;
              const es = 1.0 + pulse * 0.5 * formBoost;
              sprite.scale.set(es, es, 1);
              (sprite.material as THREE_TYPES.SpriteMaterial).opacity = 0.55 * pulse * formBoost;
            }
            // Per-drone point light — pulse intensity
            if (child.userData.isDroneLight) {
              const pl = child as THREE_TYPES.PointLight;
              pl.intensity = 2.0 * pulse * formBoost;
              pl.distance  = 10 * formBoost;
            }
          });
        });

        const camRange = formationActive ? 1.5 : 3;
        const camLag   = formationActive ? 0.015 : 0.04;
        camera.position.x += (mouseX * camRange - camera.position.x) * camLag;
        camera.position.y += (-mouseY * camRange * 0.65 - camera.position.y) * camLag;
        camera.lookAt(0, 0, 0);
        gridHelper.position.z = -10 + (t * 0.4) % 4;
        renderer.render(scene, camera);
      }
      animate();

      const onResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      };
      window.addEventListener("resize", onResize);

      return () => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("resize", onResize);
        if (formationTimer) clearTimeout(formationTimer);
      };
    })();

    return () => {
      if (animId) cancelAnimationFrame(animId);
      renderer?.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 w-full h-full"
      style={{ zIndex: 0 }}
    />
  );
}
