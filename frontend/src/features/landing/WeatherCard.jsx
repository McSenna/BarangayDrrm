import { Cloud, CloudLightning, CloudRain, Sun } from "lucide-react";
import IconTile from "../../components/ui/IconTile.jsx";
import { relativeTime } from "./api.js";

function iconFor(condition = "") {
  if (/thunder|storm|typhoon/i.test(condition)) return CloudLightning;
  if (/rain|shower|drizzle/i.test(condition)) return CloudRain;
  if (/sun|clear|fair/i.test(condition)) return Sun;
  return Cloud;
}
const fmt = (v, unit) => (v === null || Number.isNaN(v) ? "—" : `${Number(v).toLocaleString("en", { maximumFractionDigits: 1, minimumFractionDigits: unit === "mm" ? 1 : 0 })} ${unit}`);

/**
 * Latest barangay weather reading (navy-deep card). Only shown as "now" when
 * it was recorded in the last 24 h; an older reading says so instead of
 * passing itself off as current conditions.
 */
export default function WeatherCard({ weather, now }) {
  const recent = weather?.isRecent;
  return (
    <article className="side-card weather-card" aria-labelledby="weather-title">
      <div className="side-card-head">
        <IconTile icon={iconFor(weather?.condition)} tone="on-navy" size="md" />
        <div>
          <p className="lp-eyebrow weather-eyebrow">Weather now</p>
          <h3 id="weather-title" className="weather-title">
            {recent ? `${weather.condition} · ${fmt(weather.tempC, "°C").replace(" °C", "°C")}` : "No recent weather reading"}
          </h3>
        </div>
      </div>
      {recent ? (
        <>
          <dl className="weather-tiles">
            <div><dt>Rainfall</dt><dd>{fmt(weather.rainfallMm, "mm")}</dd></div>
            <div><dt>Wind</dt><dd>{fmt(weather.windKph, "km/h")} {weather.windDir}</dd></div>
          </dl>
          <p className="weather-meta">Recorded <time dateTime={weather.observedAt}>{relativeTime(new Date(weather.observedAt), now)}</time> by the barangay.</p>
        </>
      ) : (
        <p className="weather-meta">
          {weather
            ? <>Last reading: <time dateTime={weather.observedAt}>{new Date(weather.observedAt).toLocaleDateString("en-PH", { month: "long", day: "numeric" })}</time>. </>
            : null}
          Follow PAGASA and barangay announcements for current conditions.
        </p>
      )}
    </article>
  );
}
