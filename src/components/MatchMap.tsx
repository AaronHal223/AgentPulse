"use client";
import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export type MapHome = {
  id: string;
  lat: number;
  lng: number;
  score: number;
  title: string;
  detail: string;
  /** Drawn faded: outside the commute limit. */
  dimmed: boolean;
};
export type MapPlace = { label: string; lat: number; lng: number };

type Props = { homes: MapHome[]; places: MapPlace[]; selectedId: string | null; onSelect: (id: string) => void };

// Same thresholds and colours as the score badge.
const pinColor = (score: number) => (score >= 8 ? "#0f7a55" : score >= 6 ? "#a66a00" : "#8a3b2c");

function homeIcon(home: MapHome, selected: boolean) {
  const size = selected ? 38 : 30;
  const style = [
    `width:${size}px`, `height:${size}px`, `background:${pinColor(home.score)}`, `opacity:${home.dimmed ? 0.35 : 1}`,
    "border-radius:9999px", "border:2px solid #fff", "box-shadow:0 1px 4px rgba(22,48,43,.45)", "color:#fff",
    "font:700 13px/1 system-ui,sans-serif", "display:flex", "align-items:center", "justify-content:center",
  ].join(";");
  // The only dynamic text in this markup is the numeric score.
  return L.divIcon({ html: `<div style="${style}">${Math.round(home.score)}</div>`, className: "", iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

const placeIcon = L.divIcon({
  html: '<div style="width:22px;height:22px;background:#16302b;border:2px solid #fff;border-radius:6px;transform:rotate(45deg);box-shadow:0 1px 4px rgba(22,48,43,.45)"></div>',
  className: "",
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

/** Listing text comes from the web, so it's added as text nodes, never as HTML. */
function label(title: string, detail: string) {
  const box = document.createElement("div");
  const heading = document.createElement("strong");
  heading.textContent = title;
  const line = document.createElement("div");
  line.textContent = detail;
  box.append(heading, line);
  return box;
}

/** OpenStreetMap map of a client's homes (pins coloured by score) and their important places. */
export default function MatchMap({ homes, places, selectedId, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const select = useRef(onSelect);
  select.current = onSelect;

  useEffect(() => {
    if (!container.current) return;
    const m = L.map(container.current, { scrollWheelZoom: false }).setView([39.5, -98.35], 4);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    map.current = m;
    layer.current = L.layerGroup().addTo(m);
    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // Fit the view when the set of pins changes, not when one is merely selected or faded.
  const outline = [...homes.map((h) => `${h.lat},${h.lng}`), ...places.map((p) => `${p.lat},${p.lng}`)].join("|");
  useEffect(() => {
    const points = outline ? outline.split("|").map((p) => p.split(",").map(Number) as [number, number]) : [];
    if (map.current && points.length) map.current.fitBounds(L.latLngBounds(points), { padding: [36, 36], maxZoom: 15 });
  }, [outline]);

  useEffect(() => {
    const group = layer.current;
    if (!group) return;
    group.clearLayers();
    for (const p of places) L.marker([p.lat, p.lng], { icon: placeIcon, keyboard: false }).bindTooltip(p.label).addTo(group);
    for (const h of homes) {
      const selected = h.id === selectedId;
      L.marker([h.lat, h.lng], { icon: homeIcon(h, selected), zIndexOffset: selected ? 1000 : h.score * 10, title: h.title })
        .bindTooltip(label(h.title, h.detail))
        .on("click", () => select.current(h.id))
        .addTo(group);
    }
  }, [homes, places, selectedId]);

  return <div ref={container} className="z-0 h-[60vh] min-h-80 w-full overflow-hidden rounded-2xl border border-line" role="application" aria-label="Map of homes" />;
}
