// 選區時整區彈起、其他區微沉；按下時地塊微微壓扁、放開彈回（diorama-game-juice「回饋的強度」輕、中）。
// 只改 Terrain 的 `district-<id>` group（區裡的薄片、台地、河川、綠地一起動），不改 Terrain.tsx。
// 一次性動作用 gsap（AD-11）；減少動態或靜態模式時直接切換、不壓扁（AD-8）。
// 陰影圖平常只在光動了才重畫（Daylight），區在動的那幾格這裡要求重畫。
import { useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { useEffect, useMemo } from "react";
import type { Object3D } from "three";
import type { BaseView } from "../data/views";
import { useView } from "../state/view";
import { lifts, liftTarget, PRESS_SCALE } from "./lift";

/** 按壓的進出（原型 tapFeedback／release）：Canvas 外的點擊判斷呼叫。 */
export interface PressLink {
  press?: (id: string, down: boolean) => void;
}

export function DistrictLift({ view, reduced, link }: { view: BaseView; reduced: boolean; link: PressLink }) {
  const district = useView((s) => s.district);
  const still = useView((s) => s.still);
  const calm = reduced || still;
  const scene = useThree((s) => s.scene);
  const gl = useThree((s) => s.gl);
  // gsap 推的代理物件：每區一個，overwrite 讓新的目標接手（從目前的值開始，可中途打斷）
  const proxies = useMemo(() => new Map(view.districts.map((d) => [d.id, { lift: 0, press: 1 }])), [view]);
  const groups = useMemo(() => new Map<string, Object3D>(), [view]);

  useEffect(() => {
    for (const d of view.districts) {
      const p = proxies.get(d.id)!;
      const to = liftTarget(district, d.id);
      gsap.killTweensOf(p, "lift");
      if (calm) {
        p.lift = to;
        continue;
      }
      const chosen = d.id === district;
      gsap.to(p, {
        lift: to,
        duration: chosen ? 0.7 : 0.45,
        ease: chosen ? "elastic.out(1.1, 0.4)" : "power2.out",
      });
    }
  }, [district, calm, view, proxies]);

  useEffect(() => {
    link.press = (id, down) => {
      const p = proxies.get(id);
      if (!p || calm) return;
      gsap.killTweensOf(p, "press");
      if (down) gsap.to(p, { press: PRESS_SCALE, duration: 0.09, ease: "power2.out" });
      else gsap.to(p, { press: 1, duration: 0.55, ease: "elastic.out(1.2, 0.35)" });
    };
    return () => {
      link.press = undefined;
    };
  }, [link, proxies, calm]);

  useEffect(() => () => proxies.forEach((p) => gsap.killTweensOf(p)), [proxies]);

  useFrame(() => {
    let moved = false;
    for (const [id, p] of proxies) {
      // Terrain 還沒掛上的區下一格再找；group 換了（重新掛上）也重找
      let g = groups.get(id);
      if (!g || !g.parent) {
        g = scene.getObjectByName(`district-${id}`);
        if (g) groups.set(id, g);
      }
      lifts.now.set(id, p.lift);
      lifts.ref.current[id] = p.lift;
      lifts.press.set(id, p.press);
      if (!g) continue;
      if (g.position.y !== p.lift || g.scale.y !== p.press) {
        g.position.y = p.lift;
        g.scale.y = p.press;
        moved = true;
      }
    }
    if (moved) {
      lifts.frame++;
      gl.shadowMap.needsUpdate = true;
    }
  });
  return null;
}
