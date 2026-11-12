// 3.1 車站的點擊與名牌規則。
import { describe, expect, it } from "vitest";
import { chooseStationLabels, GENERAL_LABELS, isZoomed, labelTier, stationPickable, ZOOM_PX, type LabelCandidate } from "./stationRules";

const area = { width: 390, height: 844, top: 100, bottom: 700 };
const cand = (id: string, x: number, y: number, tier: 0 | 1 | 2, rank = 0, front = true): LabelCandidate => ({
  id,
  x,
  y,
  w: 60,
  h: 18,
  tier,
  rank,
  front,
});

describe("isZoomed／stationPickable", () => {
  it("全景（手機約 6 px／單位）沒放大，ZOOM_PX 以上算放大", () => {
    expect(isZoomed(6)).toBe(false);
    expect(isZoomed(ZOOM_PX)).toBe(true);
  });
  const base = { layer: true, zoomed: false, district: null, station: null, stationDistrict: "A" };
  it("全城沒放大點不到站（點的是區）", () => {
    expect(stationPickable(base)).toBe(false);
  });
  it("放大、站在選中的區、或已選了一站時點得到", () => {
    expect(stationPickable({ ...base, zoomed: true })).toBe(true);
    expect(stationPickable({ ...base, district: "A" })).toBe(true);
    expect(stationPickable({ ...base, district: "B" })).toBe(false);
    expect(stationPickable({ ...base, station: "x" })).toBe(true);
  });
  it("車站圖層關掉就點不到", () => {
    expect(stationPickable({ ...base, layer: false, zoomed: true })).toBe(false);
  });
});

describe("labelTier（標哪些站名）", () => {
  const o = { id: "s", stationDistrict: "A", zoomed: false, district: null, station: null };
  it("全城沒放大：不標", () => expect(labelTier(o)).toBeNull());
  it("放大、沒選區：一般站名", () => expect(labelTier({ ...o, zoomed: true })).toBe(2));
  it("選了區：這區的站全標、別區不標（即使放大）", () => {
    expect(labelTier({ ...o, district: "A" })).toBe(1);
    expect(labelTier({ ...o, district: "B", zoomed: true })).toBeNull();
  });
  it("選中的站一定標", () => expect(labelTier({ ...o, station: "s", district: "B" })).toBe(0));
});

describe("chooseStationLabels（避開重疊、只標重要的）", () => {
  it("重疊時重要的（全日進出多）先放、另一個略過", () => {
    const out = chooseStationLabels([cand("small", 200, 300, 2, 10), cand("big", 210, 305, 2, 99)], area, []);
    expect(out.map((p) => p.id)).toEqual(["big"]);
  });
  it("選中的站壓過其他名牌也要標", () => {
    const out = chooseStationLabels([cand("big", 200, 300, 1, 99), cand("me", 205, 300, 0, 1)], area, []);
    expect(out.map((p) => p.id)).toEqual(["me"]);
  });
  it("一般站名最多 GENERAL_LABELS 個，選區的站不受此限", () => {
    const many = Array.from({ length: 30 }, (_, i) => cand(`g${i}`, 40 + (i % 5) * 70, 120 + Math.floor(i / 5) * 40, 2, i));
    expect(chooseStationLabels(many, area, [])).toHaveLength(GENERAL_LABELS);
    const district = many.map((c) => ({ ...c, tier: 1 as const }));
    expect(chooseStationLabels(district, area, [])).toHaveLength(30);
  });
  it("留給排名高的：一般站名依全日進出排序", () => {
    const many = Array.from({ length: 30 }, (_, i) => cand(`g${i}`, 40 + (i % 5) * 70, 120 + Math.floor(i / 5) * 40, 2, i));
    const ids = chooseStationLabels(many, area, []).map((p) => p.id);
    expect(ids).toEqual(Array.from({ length: GENERAL_LABELS }, (_, i) => `g${29 - i}`));
  });
  it("避開已佔用的矩形（流向標籤）", () => {
    expect(chooseStationLabels([cand("a", 200, 300, 2)], area, [[200, 291, 80, 20]])).toEqual([]);
  });
  it("不在安全區（上方 HUD、時間軸、畫面左右）或在鏡頭後面的不標", () => {
    const out = chooseStationLabels(
      [cand("hud", 200, 105, 1), cand("dock", 200, 720, 1), cand("edge", 10, 300, 1), cand("back", 200, 400, 1, 0, false), cand("ok", 200, 400, 1)],
      area,
      [],
    );
    expect(out.map((p) => p.id)).toEqual(["ok"]);
  });
  it("名牌彼此不重疊", () => {
    const many = Array.from({ length: 60 }, (_, i) => cand(`s${i}`, 100 + ((i * 37) % 200), 200 + ((i * 53) % 300), 1, i));
    const out = chooseStationLabels(many, area, []);
    for (let a = 0; a < out.length; a++)
      for (let b = a + 1; b < out.length; b++) {
        const [ax, ay, aw, ah] = out[a].rect;
        const [bx, by, bw, bh] = out[b].rect;
        expect(Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ay - by) < (ah + bh) / 2).toBe(false);
      }
  });
});
