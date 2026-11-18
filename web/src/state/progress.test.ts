// 4.1 最近用過的站（AD-22）：只存站 ID 字串、最多 5 個、新的在前不重複；保留其他欄位；壞資料與封鎖時退回記憶體；
// 不進網址與分享卡。測試環境沒有 localStorage：每個測試裝一個假的。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PROGRESS_KEY, RECENT_MAX, recentStations, rememberStation, resetProgressForTest } from "./progress";
import { shareLink, shareUrl, urlStateOf } from "./url";
import { closeCard, getView } from "./view";

class FakeStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

let store: FakeStorage;
const saved = () => JSON.parse(store.getItem(PROGRESS_KEY)!) as Record<string, unknown>;

beforeEach(() => {
  store = new FakeStorage();
  vi.stubGlobal("localStorage", store);
  resetProgressForTest();
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetProgressForTest();
});

describe("最近用過的站（4.1，AD-22）", () => {
  it("新的在前、重複的移到最前、最多 5 個，選第 6 站時最舊的被擠掉", () => {
    for (const id of ["s1", "s2", "s3", "s4", "s5"]) rememberStation(id);
    expect(recentStations()).toEqual(["s5", "s4", "s3", "s2", "s1"]);
    rememberStation("s3");
    expect(recentStations()).toEqual(["s3", "s5", "s4", "s2", "s1"]);
    rememberStation("s6");
    expect(recentStations()).toEqual(["s6", "s3", "s5", "s4", "s2"]);
    expect(recentStations()).toHaveLength(RECENT_MAX);
  });

  it("存的只有站 ID 字串，不存人數、時段或起訖組合", () => {
    rememberStation("s0e91ddb9");
    rememberStation("sd821b2ec");
    const v = saved();
    expect(Object.keys(v)).toEqual(["recentStations"]);
    expect(v.recentStations).toEqual(["sd821b2ec", "s0e91ddb9"]);
    expect((v.recentStations as unknown[]).every((x) => typeof x === "string")).toBe(true);
  });

  it("重新整理（重讀儲存）後還在", () => {
    rememberStation("s1");
    rememberStation("s2");
    resetProgressForTest();
    expect(recentStations()).toEqual(["s2", "s1"]);
  });

  it("寫入時其他欄位原樣保留", () => {
    store.setItem(PROGRESS_KEY, JSON.stringify({ seenTips: ["drag", "tap"], myStation: { id: "s9", seen: ["2026-09"] }, future: 3 }));
    rememberStation("s1");
    expect(saved()).toEqual({
      seenTips: ["drag", "tap"],
      myStation: { id: "s9", seen: ["2026-09"] },
      future: 3,
      recentStations: ["s1"],
    });
  });

  it("這一欄壞了只把這一欄當空的，其他欄位留著", () => {
    store.setItem(PROGRESS_KEY, JSON.stringify({ recentStations: "s1", seenTips: ["x"] }));
    expect(recentStations()).toEqual([]);
    rememberStation("s2");
    expect(saved()).toEqual({ recentStations: ["s2"], seenTips: ["x"] });
  });

  it("陣列裡不是站 ID 字串的值、重複的值略過，超過 5 個只取前 5 個", () => {
    store.setItem(PROGRESS_KEY, JSON.stringify({ recentStations: ["s1", 42, null, "s1", "有空白 的", "s2", "s3", "s4", "s5", "s6"] }));
    expect(recentStations()).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });

  it("整個值不是 JSON：當成空的、改用記憶體，不覆寫看不懂的值", () => {
    store.setItem(PROGRESS_KEY, "{oops");
    expect(recentStations()).toEqual([]);
    rememberStation("s1");
    expect(recentStations()).toEqual(["s1"]);
    expect(store.getItem(PROGRESS_KEY)).toBe("{oops");
  });

  it("封鎖 localStorage（存取丟錯）時仍列出這次選過的站且不報錯", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    });
    resetProgressForTest();
    expect(() => rememberStation("s1")).not.toThrow();
    expect(() => rememberStation("s2")).not.toThrow();
    expect(recentStations()).toEqual(["s2", "s1"]);
  });

  it("寫入失敗（例如容量滿）時退回記憶體，這次選過的站照樣列出", () => {
    store.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    rememberStation("s1");
    rememberStation("s2");
    expect(recentStations()).toEqual(["s2", "s1"]);
  });

  it("沒有 localStorage 的環境也照常運作", () => {
    vi.stubGlobal("localStorage", undefined);
    resetProgressForTest();
    rememberStation("s1");
    expect(recentStations()).toEqual(["s1"]);
  });

  it("不進網址與分享連結", () => {
    rememberStation("s0e91ddb9");
    rememberStation("sd821b2ec");
    closeCard();
    const v = getView();
    const link = shareLink(v, "https://example.test/");
    const url = shareUrl(urlStateOf(v), "https://example.test/");
    for (const s of [link, url]) {
      expect(s).not.toContain("s0e91ddb9");
      expect(s).not.toContain("sd821b2ec");
    }
  });
});
