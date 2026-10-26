import { useEffect, useMemo, useRef } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { MapboxOverlay } from "@deck.gl/mapbox";
import { ArcLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { Arc, DayType, Station } from "../data/types";
import { tokenRgb } from "./tokens";

interface Props {
  stations: Station[];
  arcs: Arc[];
  dayType: DayType;
  hour: number;
  selected: number | null;
  onSelect: (index: number) => void;
}

// 底圖暫用純色背景（不依賴圖磚服務）；正式底圖在 hallmark 設計階段決定。
const BLANK_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {},
  layers: [{ id: "bg", type: "background", paint: { "background-color": "rgba(0,0,0,0)" } }],
};

export function CityMap({ stations, arcs, dayType, hour, selected, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const overlay = useRef<MapboxOverlay | null>(null);

  useEffect(() => {
    if (!box.current) return;
    const map = new maplibregl.Map({
      container: box.current,
      style: BLANK_STYLE,
      center: [121.53, 25.05],
      zoom: 10.6,
      attributionControl: false,
    });
    overlay.current = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay.current);
    return () => {
      overlay.current = null;
      map.remove();
    };
  }, []);

  const layers = useMemo(() => {
    const inflow = tokenRgb("--flow-in");
    const outflow = tokenRgb("--flow-out");
    const arc = tokenRgb("--flow-arc");
    const ring = tokenRgb("--station-selected");
    return [
      new ArcLayer<Arc>({
        id: "arcs",
        data: arcs,
        getSourcePosition: (a) => [stations[a[0]].lon, stations[a[0]].lat],
        getTargetPosition: (a) => [stations[a[1]].lon, stations[a[1]].lat],
        getSourceColor: [...arc, 40],
        getTargetColor: [...arc, 160],
        getWidth: (a) => Math.max(0.5, Math.sqrt(a[2]) / 6),
        widthUnits: "pixels",
        updateTriggers: { getWidth: [hour, dayType] },
      }),
      new ScatterplotLayer<Station>({
        id: "stations",
        data: stations,
        pickable: true,
        getPosition: (s) => [s.lon, s.lat],
        getRadius: (s) => {
          const p = s[dayType];
          return 40 + Math.sqrt((p.entries[hour] ?? 0) + (p.exits[hour] ?? 0)) * 6;
        },
        getFillColor: (s) => {
          const p = s[dayType];
          const net = (p.exits[hour] ?? 0) - (p.entries[hour] ?? 0); // >0 吸人
          return [...(net >= 0 ? inflow : outflow), 200];
        },
        getLineColor: [...ring, 255],
        getLineWidth: (_s, { index }) => (index === selected ? 2 : 0),
        lineWidthUnits: "pixels",
        stroked: true,
        radiusUnits: "meters",
        onClick: ({ index }) => onSelect(index),
        transitions: { getRadius: 400 },
        updateTriggers: { getRadius: [hour, dayType], getFillColor: [hour, dayType], getLineWidth: [selected] },
      }),
    ];
  }, [stations, arcs, dayType, hour, selected, onSelect]);

  useEffect(() => {
    overlay.current?.setProps({ layers });
  }, [layers]);

  return <div ref={box} className="city-map" role="img" aria-label="北捷各站人流地圖" />;
}
