// 搭乘模式（8.6，平視搭乘模式第 0 期）的時鐘與動作：沿板南線一站一站走。畫面狀態（ride）在 view.ts，
// 兩站之間的連續位置在 view.ts 的 rideMotion（AD-16 的非 React 欄位）；這裡是唯一改寫它們的地方。
// 場景（scene/RideCamera.tsx）每格呼叫 advanceRide(dt) 並依 rideMotion.s 擺鏡頭；按鈕呼叫 toggleRide／nextStop／leaveRide。
//
// 節奏：停靠 DWELL 秒（開那站的車站卡）→ 出發：加速 → 等速 CRUISE → 到站前減速停住（hopAt）→ 停靠……；
// 到端點站停住並暫停，再按繼續或下一站就反向。減少動態（或靜態模式）時不連續移動：停靠時間到了直接切到下一站。
// 停靠點在站往回 STOP_BACK（沿前進方向），站珠在鏡頭前方看得到。
import type { LineId } from "../data/types";
import { getView, rideMotion as m, writeRide, type Ride } from "./view";

/** 等速前進的速度（場景單位／秒；一格街廓約 1 秒）。 */
export const CRUISE = 1.1;
/** 出站加速、到站減速各幾秒（正弦曲線；段太短時按同樣的加速度縮短）。 */
export const RAMP = 1.4;
/** 停靠幾秒（車站卡開著）；之後自動出發。 */
export const DWELL = 6;
/** 停在站前多遠（場景單位）：站珠落在前方畫面下緣。 */
export const STOP_BACK = 1.3;

export interface RideStop {
  id: string;
  /** 沿路徑的距離（場景單位） */
  s: number;
}

/** 一條可以搭的路線：停靠站依沿線距離排好（scene/ridePath.ts 由真實軌道算出）。 */
export interface RideRoute {
  line: LineId;
  len: number;
  stops: readonly RideStop[];
}

let route: RideRoute | null = null;

/** 場景資料載入後登記可搭的路線（ScenePage）；null＝沒有。 */
export function setRideRoute(r: RideRoute | null) {
  route = r;
}

export function rideRoute(): RideRoute | null {
  return route;
}

/** 這條線、這一站能不能搭（網址還原、車站卡的「搭這條線」）。 */
export function canRide(line: string, station?: string): boolean {
  if (!route || route.line !== line) return false;
  return station === undefined || route.stops.some((s) => s.id === station);
}

// ── 速度曲線（純函式） ─────────────────────────────────────────

/** 一段的加減速時間：段夠長是 RAMP；太短時同樣的加速度、時間縮短（√(L·RAMP / CRUISE)）。 */
function rampOf(L: number): number {
  return Math.min(RAMP, Math.sqrt(Math.max(0, L) * RAMP / CRUISE));
}

/** 走完一段長 L 要幾秒。 */
export function hopDuration(L: number): number {
  if (!(L > 0)) return 0;
  const r = rampOf(L);
  const vp = (CRUISE * r) / RAMP;
  return 2 * r + (L - vp * r) / vp;
}

/** 出發後 t 秒走了多遠：正弦加速 → 等速 → 正弦減速（減速段與加速段對稱），0 ≤ 結果 ≤ L、不倒退。 */
export function hopAt(L: number, t: number): number {
  if (!(L > 0) || t <= 0) return 0;
  const r = rampOf(L);
  const vp = (CRUISE * r) / RAMP;
  const T = hopDuration(L);
  if (t >= T) return L;
  const ramp = (u: number) => (vp / 2) * (u - (r / Math.PI) * Math.sin((Math.PI * u) / r));
  if (t < r) return ramp(t);
  if (t > T - r) return L - ramp(T - t);
  return ramp(r) + vp * (t - r);
}

// ── 時鐘 ───────────────────────────────────────────────────

/** 第 i 站的停靠位置（往前進方向的反方向退 STOP_BACK，夾在路徑內）。 */
function stopS(i: number, dir: 1 | -1): number {
  const r = route!;
  return Math.min(r.len, Math.max(0, r.stops[i].s - dir * STOP_BACK));
}

/** 從第 i 站出發往哪邊：往比較遠的那個端點（搭得比較久）；端點站往另一頭。 */
function fartherDir(i: number): 1 | -1 {
  const n = route!.stops.length;
  return i <= n - 1 - i ? 1 : -1;
}

function isEnd(i: number, dir: 1 | -1): boolean {
  const j = i + dir;
  return j < 0 || j >= route!.stops.length;
}

/** 出站：關卡片、往下一站（端點站就反向）。減少動態時直接到下一站。 */
function depart(ride: Ride, calm: boolean) {
  if (!route) return;
  if (isEnd(m.i, m.dir)) {
    m.dir = m.dir === 1 ? -1 : 1;
    // 掉頭：鏡頭轉向交給 RideCamera 平滑接回
    m.rejoin = calm ? 2 : 1;
  }
  m.from = m.i;
  m.to = m.i + m.dir;
  m.s0 = m.s;
  m.L = Math.abs(stopS(m.to, m.dir) - m.s);
  m.t = 0;
  const v = getView();
  writeRide({
    ride: { ...ride, docked: false },
    // 行進中不出卡片（先玩，再給資訊）；停靠時開的卡、或停靠中從卡上點開的別站，都收起
    ...(v.station !== null ? { station: null } : {}),
    ...(v.focus !== null ? { focus: null } : {}),
    ...(v.sheet !== "peek" ? { sheet: "peek" as const } : {}),
    // 停靠時從卡上開的通勤面板或通勤卡也收起
    ...(v.commute !== null ? { commute: null } : {}),
  });
  if (calm) arrive(m.to);
}

/** 到站：停住、開那站的車站卡（摘要高度）；端點站停住後暫停。 */
function arrive(j: number) {
  if (!route) return;
  const ride = getView().ride;
  if (!ride) return;
  m.i = j;
  m.s = stopS(j, m.dir);
  m.t = 0;
  m.L = 0;
  m.dwell = DWELL;
  const stepped = m.step;
  m.step = false;
  const id = route.stops[j].id;
  writeRide({
    ride: { line: ride.line, station: id, docked: true, playing: isEnd(j, m.dir) || stepped ? false : ride.playing },
    station: id,
    sheet: "peek",
    focus: null,
  });
}

/**
 * 每格推進搭乘（RideCamera 呼叫）。calm＝減少動態或靜態模式：不連續移動，停靠時間到了直接切到下一站。
 * 暫停時不動；鏡頭接回軌道（hold）的那一小段也不動。
 */
export function advanceRide(dt: number, calm: boolean) {
  const ride = getView().ride;
  if (!ride || !route || ride.left) return;
  const step = Math.min(Math.max(dt, 0), 0.1);
  if (m.hold > 0) {
    m.hold = Math.max(0, m.hold - step);
    return;
  }
  if (ride.docked) {
    if (!ride.playing) return;
    m.dwell -= step;
    if (m.dwell > 0) return;
    depart(ride, calm);
    return;
  }
  if (!ride.playing && !m.step) return;
  if (calm) {
    arrive(m.to);
    return;
  }
  m.t += step;
  m.s = m.s0 + Math.sign(stopS(m.to, m.dir) - m.s0) * hopAt(m.L, m.t);
  if (m.t >= hopDuration(m.L)) arrive(m.to);
}

/** 鏡頭要接回軌道時 RideCamera 讀這個（1 平滑飛回、2 直接切換），讀了就清掉。 */
export function takeRejoin(): 0 | 1 | 2 {
  const r = m.rejoin;
  m.rejoin = 0;
  return r;
}

/** 鏡頭正在飛回軌道：這段時間搭乘不前進（秒）。 */
export function holdRide(seconds: number) {
  m.hold = Math.max(m.hold, seconds);
}

// ── 動作 ───────────────────────────────────────────────────

/**
 * 上車：從首頁（沒給站＝路徑起點，板南線是頂埔）或車站卡的「搭這條線」（那一站）出發，往比較遠的端點走。
 * 收起選取、卡片與通勤，停止一天的播放（搭乘有自己的暫停）；鏡頭從目前的位置飛下來（減少動態時直接切換）後出發。
 */
export function startRide(from?: string, calm = false) {
  if (!route || route.stops.length < 2) return;
  const i = from === undefined ? 0 : route.stops.findIndex((s) => s.id === from);
  if (i < 0) return;
  m.i = i;
  m.dir = fartherDir(i);
  m.s = stopS(i, m.dir);
  m.dwell = 0;
  m.hold = 0;
  m.step = false;
  m.t = 0;
  m.L = 0;
  m.rejoin = calm ? 2 : 1;
  writeRide({
    ride: { line: route.line, station: route.stops[i].id, docked: true, playing: true },
    station: null,
    district: null,
    focus: null,
    commute: null,
    sheet: "peek",
    playing: false,
  });
}

/** 打開搭乘的分享連結（url.ts planLink 已確認線與站）：停在那一站、暫停、車站卡開著；鏡頭直接到位。 */
export function restoreRide(line: string, station: string) {
  if (!route || !canRide(line, station)) return;
  const i = route.stops.findIndex((s) => s.id === station);
  m.i = i;
  m.dir = fartherDir(i);
  m.s = stopS(i, m.dir);
  m.dwell = DWELL;
  m.hold = 0;
  m.step = false;
  m.rejoin = 2;
  writeRide({
    ride: { line: route.line, station, docked: true, playing: false },
    station,
    district: null,
    focus: null,
    commute: null,
    sheet: "peek",
    playing: false,
  });
}

/** 暫停（碰到場景或卡片、按暫停）。 */
export function pauseRide() {
  const ride = getView().ride;
  if (ride?.playing) writeRide({ ride: { ...ride, playing: false } });
}


/** 暫停／繼續。繼續時鏡頭先接回軌道（使用者暫停時可能移動過）；停靠中按繼續就直接出發。 */
export function toggleRide(calm = false) {
  const ride = getView().ride;
  if (!ride || ride.left) return;
  if (ride.playing) {
    writeRide({ ride: { ...ride, playing: false } });
    return;
  }
  m.rejoin = calm ? 2 : 1;
  if (ride.docked) m.dwell = 0;
  writeRide({ ride: { ...ride, playing: true } });
}

/**
 * 下一站：停靠中＝馬上出發（暫停中按就走完這一段、到站後維持暫停）；行進中＝直接到下一站
 * （鏡頭飛過去，減少動態時直接切換）。
 */
export function nextStop(calm = false) {
  const ride = getView().ride;
  if (!ride || !route || ride.left) return;
  if (ride.docked) {
    m.dwell = 0;
    m.step = !ride.playing;
    m.rejoin = calm ? 2 : 1;
    depart(ride, calm);
    return;
  }
  m.step = !ride.playing;
  m.rejoin = calm ? 2 : 1;
  arrive(m.to);
}

/**
 * 停在路線的端點站（3.24）：到終點停住後（暫停中）控制列多一顆分享。上車的起點站不算（往前還有站）。
 * 讀 rideMotion（非 React 欄位）；到站時 arrive() 先改 rideMotion 再寫畫面狀態，所以重繪時讀到的是新值。
 */
export function atLineEnd(ride: Ride | null = getView().ride): boolean {
  if (!ride || !route || !ride.docked || ride.left) return false;
  return route.stops[m.i]?.id === ride.station && isEnd(m.i, m.dir);
}

/**
 * 按下車（3.24）：搭乘停住（不再前進、鏡頭留在原地）、收起停靠的車站卡與通勤，控制換成「在 X 下車」小卡；
 * ride 留著（left），分享連結才是 ride＋station、打開回到這一站。按「回到首頁」才 leaveRide()。
 */
export function endRide() {
  const ride = getView().ride;
  if (!ride || ride.left) return;
  m.step = false;
  m.hold = 0;
  m.rejoin = 0;
  writeRide({ ride: { ...ride, playing: false, left: true }, station: null, focus: null, commute: null, sheet: "peek", playing: false });
}

/** 離開搭乘：回到全景由呼叫端飛鏡頭；一天的播放維持暫停（票面：下車回到全景、播放維持暫停）。 */
export function leaveRide() {
  if (!getView().ride) return;
  m.hold = 0;
  m.step = false;
  m.rejoin = 0;
  writeRide({ ride: null, station: null, focus: null, commute: null, sheet: "peek", playing: false });
}
