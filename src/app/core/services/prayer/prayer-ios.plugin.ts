/**
 * PRAYER — iOS IMPLEMENTATION
 * The RafeeqPrayer plugin, in JavaScript, for iOS.
 *
 * Android computes natively because its home-screen widget and exact alarms
 * run without a WebView. iOS has neither yet, so the page is the only
 * consumer and the calculation can live here. It mirrors PrayerTimesEngine.kt
 * and QiblaEngine.kt — same library (adhan, the JS port of adhan-java), same
 * defaults, same Duha offset — so a user switching phones sees the same
 * timetable.
 *
 * Android-only surfaces (widget, reminders, exact alarms, settings shortcuts)
 * answer with their honest "unsupported" values, which the page already
 * renders by hiding the control.
 */

import { WebPlugin } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import {
  CalculationMethod,
  Coordinates,
  HighLatitudeRule,
  Madhab,
  PrayerTimes,
  Qibla,
  SunnahTimes,
} from "adhan";
import type { CalculationParameters } from "adhan";
import * as geomagnetism from "geomagnetism";
import type { RafeeqPrayerPlugin } from "./rafeeq-prayer.plugin";
import type { PrayerKey, PrayerMadhab, PrayerMethod, RawPrayerDay } from "./prayer-times.types";
import { PRAYERS_ONLY } from "./prayer-times.types";

/** Same as PrayerTimesEngine.DUHA_AFTER_SUNRISE_MINUTES. */
const DUHA_AFTER_SUNRISE_MINUTES = 24;

const KEY_COORDS = "prayer.coords";
const KEY_METHOD = "prayer.method";
const KEY_MADHAB = "prayer.madhab";
const KEY_USE_24_HOUR = "prayer.use24Hour";
const KEY_VISIBLE = "prayer.visibleTimes";

/** Same as PrayerConfig.DEFAULT_VISIBLE_TIMES: the five prayers plus sunrise. */
const DEFAULT_VISIBLE: PrayerKey[] = [...PRAYERS_ONLY, "sunrise"];

async function read<T>(key: string, fallback: T): Promise<T> {
  const { value } = await Preferences.get({ key });
  if (value === null) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): Promise<void> {
  return Preferences.set({ key, value: JSON.stringify(value) });
}

type Coords = { lat: number; lng: number };

function parametersFor(method: PrayerMethod, madhab: PrayerMadhab): CalculationParameters {
  const make: Record<PrayerMethod, () => CalculationParameters> = {
    egyptian: CalculationMethod.Egyptian,
    umm_al_qura: CalculationMethod.UmmAlQura,
    muslim_world_league: CalculationMethod.MuslimWorldLeague,
    karachi: CalculationMethod.Karachi,
    north_america: CalculationMethod.NorthAmerica,
    dubai: CalculationMethod.Dubai,
    qatar: CalculationMethod.Qatar,
    kuwait: CalculationMethod.Kuwait,
    singapore: CalculationMethod.Singapore,
    moon_sighting_committee: CalculationMethod.MoonsightingCommittee,
  };
  const params = (make[method] ?? CalculationMethod.Egyptian)();
  params.madhab = madhab === "hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = HighLatitudeRule.MiddleOfTheNight;
  return params;
}

/** adhan-js reports the midnight-sun window as Invalid Date rather than null. */
const valid = (d: Date | undefined): Date | null =>
  d && !Number.isNaN(d.getTime()) ? d : null;

function timesFor(c: Coords, date: Date, params: CalculationParameters) {
  const p = new PrayerTimes(new Coordinates(c.lat, c.lng), date, params);
  const fajr = valid(p.fajr);
  const sunrise = valid(p.sunrise);
  const maghrib = valid(p.maghrib);

  // As in the Kotlin engine: the night is only divided when it exists.
  let sunnah: SunnahTimes | null = null;
  if (fajr && maghrib) {
    try {
      sunnah = new SunnahTimes(p);
    } catch {
      sunnah = null;
    }
  }

  const times: Partial<Record<PrayerKey, Date | null>> = {
    fajr,
    sunrise,
    duha: sunrise ? new Date(sunrise.getTime() + DUHA_AFTER_SUNRISE_MINUTES * 60_000) : null,
    dhuhr: valid(p.dhuhr),
    asr: valid(p.asr),
    maghrib,
    isha: valid(p.isha),
    midnight: valid(sunnah?.middleOfTheNight),
    last_third: valid(sunnah?.lastThirdOfTheNight),
  };
  return times;
}

/** "yyyy-MM-dd" as a local date; anything unparseable means today. */
function parseDay(raw?: string): Date {
  const m = raw && /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date();
}

function normalise(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

export class PrayerIos extends WebPlugin implements RafeeqPrayerPlugin {
  private async params() {
    const method = await read<PrayerMethod>(KEY_METHOD, "egyptian");
    const madhab = await read<PrayerMadhab>(KEY_MADHAB, "shafi");
    return parametersFor(method, madhab);
  }

  async getTimes(options?: { date?: string }): Promise<RawPrayerDay> {
    const coords = await read<Coords | null>(KEY_COORDS, null);
    if (!coords) return { hasLocation: false };

    const params = await this.params();
    const day = timesFor(coords, parseDay(options?.date), params);
    const times: Partial<Record<PrayerKey, string>> = {};
    (Object.keys(day) as PrayerKey[]).forEach((k) => {
      const at = day[k];
      if (at) times[k] = at.toISOString();
    });

    // The next of the five after now, rolling to tomorrow's Fajr after Isha.
    const now = new Date();
    const today = timesFor(coords, now, params);
    let next: RawPrayerDay["next"];
    for (const key of PRAYERS_ONLY) {
      const at = today[key];
      if (at && at > now) {
        next = { name: key, at: at.toISOString() };
        break;
      }
    }
    if (!next) {
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const fajr = timesFor(coords, tomorrow, params).fajr;
      if (fajr) next = { name: "fajr", at: fajr.toISOString() };
    }

    return { hasLocation: true, times, next };
  }

  async setLocation(options: { lat: number; lng: number }): Promise<void> {
    await write(KEY_COORDS, { lat: options.lat, lng: options.lng });
  }

  async getConfig() {
    return {
      method: await read<PrayerMethod>(KEY_METHOD, "egyptian"),
      madhab: await read<PrayerMadhab>(KEY_MADHAB, "shafi"),
      use24Hour: await read<boolean>(KEY_USE_24_HOUR, false),
      hasLocation: (await read<Coords | null>(KEY_COORDS, null)) !== null,
    };
  }

  async setConfig(options: {
    method?: PrayerMethod;
    madhab?: PrayerMadhab;
    use24Hour?: boolean;
  }): Promise<void> {
    // appNight and appLang only feed Android's widget; nothing reads them here.
    if (options.method) await write(KEY_METHOD, options.method);
    if (options.madhab) await write(KEY_MADHAB, options.madhab);
    if (options.use24Hour !== undefined) await write(KEY_USE_24_HOUR, options.use24Hour);
  }

  async getQibla() {
    const coords = await read<Coords | null>(KEY_COORDS, null);
    if (!coords) return { hasLocation: false };

    const bearing = normalise(Qibla(new Coordinates(coords.lat, coords.lng)));
    // iOS's webkitCompassHeading counts from magnetic north, so the needle
    // needs the local declination, as GeomagneticField supplies on Android.
    let declination = 0;
    try {
      declination = geomagnetism
        .model(new Date(), { allowOutOfBoundsModel: true })
        .point([coords.lat, coords.lng]).decl;
    } catch {
      declination = 0;
    }
    return {
      hasLocation: true,
      bearing,
      magneticBearing: normalise(bearing - declination),
      declination,
    };
  }

  async getVisibleTimes() {
    return { times: await read<string[]>(KEY_VISIBLE, DEFAULT_VISIBLE) };
  }

  async setVisibleTimes(options: { times: string[] }): Promise<void> {
    await write(KEY_VISIBLE, options.times);
  }

  // Location services: iOS has no in-app switch to offer, and a fix that fails
  // because they are off surfaces as a failed getCurrentPosition instead.
  async locationServicesEnabled() {
    return { enabled: true };
  }

  async promptEnableLocation() {
    return { enabled: true };
  }

  // No reverse geocoder without a native plugin; the page shows its title.
  async getPlace() {
    return { name: null };
  }

  // Android-only surfaces.
  async getReminders() {
    return { enabled: false, prayers: [...PRAYERS_ONLY] };
  }

  async setReminders(): Promise<void> {}

  async requestNotificationPermission() {
    return { granted: false };
  }

  async requestExactAlarm() {
    return { granted: false };
  }

  async getWidgetInfo() {
    return { supported: false, placed: 0 };
  }

  async requestPinWidget() {
    return { requested: false, alreadyPlaced: false };
  }

  async openAppSettings() {
    return { opened: false };
  }

  async openHomeScreen() {
    return { opened: false };
  }

  async openWidgetSettings() {
    return { opened: false };
  }
}
