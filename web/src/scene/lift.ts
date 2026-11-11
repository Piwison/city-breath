// 選區時行政區的抬起（diorama-game-juice「沙盤」「回饋的強度」中級）：選中的區彈起、其他區微沉。
// 這是畫面動畫，不是畫面狀態（選了哪一區在 state/view.ts，AD-16）；DistrictLift 用 gsap 推 now，
// 每格把 now 寫到 Terrain 的 `district-<id>` group。軌道、區名、流向端點、站珠讀這裡跟著動；
// 3.13 的建築與樹讀 lifts.ref（Blocks 的 lift prop）。

/** 選中的區抬起多少、其他區沉多少（場景單位，原型 liftDistricts）。 */
export const LIFT_UP = 1.8;
export const LIFT_DOWN = -0.3;
/** 按壓時地塊壓扁到幾成（原型 press 0.86）。 */
export const PRESS_SCALE = 0.86;

/** 某區在「選了 selected」時的目標高度：選中 LIFT_UP、其他 LIFT_DOWN、沒選任何區 0。 */
export function liftTarget(selected: string | null, id: string): number {
  if (selected === null) return 0;
  return id === selected ? LIFT_UP : LIFT_DOWN;
}

/** 每區目前的抬起高度與按壓比例（gsap 改 now／press；frame 在任何一區真的動了時加一）。 */
export const lifts = {
  now: new Map<string, number>(),
  /** 同一份高度的 ref 形狀（3.13 Blocks 的 lift prop：建築與樹跟著抬） */
  ref: { current: {} as Record<string, number> },
  press: new Map<string, number>(),
  /** 有區的高度或按壓在這一格變了就加一；讀的人比對自己記的值決定要不要重算 */
  frame: 0,
};

/** 目前（動畫中）的抬起高度。 */
export function liftOf(id: string): number {
  return lifts.now.get(id) ?? 0;
}
