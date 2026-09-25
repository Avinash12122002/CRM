import { CountryTimezoneInfo } from "./types";

/**
 * Standard mapping of candidate phone dial codes to their primary country & IANA timezone.
 * Longest dial codes are matched first.
 */
export const COUNTRY_TIMEZONE_MAP: CountryTimezoneInfo[] = [
  {
    countryCode: "NG",
    countryName: "Nigeria",
    dialCode: "234",
    timeZone: "Africa/Lagos",
    label: "Nigeria Time (WAT)",
  },
  {
    countryCode: "IN",
    countryName: "India",
    dialCode: "91",
    timeZone: "Asia/Kolkata",
    label: "India Time (IST)",
  },
  {
    countryCode: "AE",
    countryName: "United Arab Emirates",
    dialCode: "971",
    timeZone: "Asia/Dubai",
    label: "UAE Time (GST)",
  },
  {
    countryCode: "GB",
    countryName: "United Kingdom",
    dialCode: "44",
    timeZone: "Europe/London",
    label: "UK Time (GMT/BST)",
  },
  {
    countryCode: "AU",
    countryName: "Australia",
    dialCode: "61",
    timeZone: "Australia/Sydney",
    label: "Australia Time (AEST/AEDT)",
  },
  {
    countryCode: "IE",
    countryName: "Ireland",
    dialCode: "353",
    timeZone: "Europe/Dublin",
    label: "Ireland Time (IST/GMT)",
  },
  {
    countryCode: "KE",
    countryName: "Kenya",
    dialCode: "254",
    timeZone: "Africa/Nairobi",
    label: "East Africa Time (EAT)",
  },
  {
    countryCode: "ZA",
    countryName: "South Africa",
    dialCode: "27",
    timeZone: "Africa/Johannesburg",
    label: "South Africa Time (SAST)",
  },
  {
    countryCode: "GH",
    countryName: "Ghana",
    dialCode: "233",
    timeZone: "Africa/Accra",
    label: "Ghana Time (GMT)",
  },
  {
    countryCode: "NP",
    countryName: "Nepal",
    dialCode: "977",
    timeZone: "Asia/Kathmandu",
    label: "Nepal Time (NPT)",
  },
  {
    countryCode: "PH",
    countryName: "Philippines",
    dialCode: "63",
    timeZone: "Asia/Manila",
    label: "Philippines Time (PHT)",
  },
  {
    countryCode: "PK",
    countryName: "Pakistan",
    dialCode: "92",
    timeZone: "Asia/Karachi",
    label: "Pakistan Time (PKT)",
  },
  {
    countryCode: "BD",
    countryName: "Bangladesh",
    dialCode: "880",
    timeZone: "Asia/Dhaka",
    label: "Bangladesh Time (BST)",
  },
  {
    countryCode: "LK",
    countryName: "Sri Lanka",
    dialCode: "94",
    timeZone: "Asia/Colombo",
    label: "Sri Lanka Time (IST)",
  },
  {
    countryCode: "US",
    countryName: "United States / Canada",
    dialCode: "1",
    timeZone: "America/New_York",
    label: "Eastern Time (ET)",
  },
];

/** Default fallback when phone country code is not found in the list */
export const DEFAULT_TIMEZONE: CountryTimezoneInfo = {
  countryCode: "NG",
  countryName: "International",
  dialCode: "234",
  timeZone: "Africa/Lagos",
  label: "West Africa Time (WAT)",
};

/**
 * Clean phone string and extract digits
 */
export function cleanPhoneNumber(phone: string): string {
  return phone.replace(/[^\d]/g, "").replace(/^00/, "");
}

/**
 * Automatically detects country and timezone from the candidate's phone number
 */
export function detectCountryFromPhone(phone: string): CountryTimezoneInfo {
  const clean = cleanPhoneNumber(phone);
  if (!clean) return DEFAULT_TIMEZONE;

  // Sort by dialCode length descending so 3-digit dial codes (e.g. 971, 234) match before 1-digit (1)
  const sorted = [...COUNTRY_TIMEZONE_MAP].sort(
    (a, b) => b.dialCode.length - a.dialCode.length,
  );

  for (const item of sorted) {
    if (clean.startsWith(item.dialCode)) {
      return item;
    }
  }

  return DEFAULT_TIMEZONE;
}

/**
 * Format a Date object in a specific IANA timezone using Intl.DateTimeFormat
 */
export function formatTimeInZone(
  date: Date,
  timeZone: string,
  hour12: boolean = true,
): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour: "2-digit",
      minute: "2-digit",
      hour12,
    }).format(date);
  }
}

/**
 * Format date (YYYY-MM-DD) in a specific IANA timezone
 */
export function formatDateInZone(date: Date, timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const year = parts.find((p) => p.type === "year")?.value || "";
    const month = parts.find((p) => p.type === "month")?.value || "";
    const day = parts.find((p) => p.type === "day")?.value || "";
    return `${year}-${month}-${day}`;
  } catch {
    return date.toISOString().split("T")[0];
  }
}

/**
 * Converts an IST slot (e.g. Date: 2026-09-27, Time: 16:30 IST) to candidate local time
 */
export function convertIstSlotToCandidateTime(
  meetingDate: string,
  istTime: string,
  candidateTimeZone: string,
): {
  candidateDate: string;
  candidateTime: string;
  display12h: string;
} {
  // IST is fixed at UTC+05:30
  const istDateString = `${meetingDate}T${istTime}:00+05:30`;
  const dateObj = new Date(istDateString);

  const candidateDate = formatDateInZone(dateObj, candidateTimeZone);
  const candidateTime = formatTimeInZone(dateObj, candidateTimeZone, false); // 24h e.g. "12:00"
  const display12h = formatTimeInZone(dateObj, candidateTimeZone, true); // 12h e.g. "12:00 PM"

  return {
    candidateDate,
    candidateTime,
    display12h,
  };
}

/**
 * Extracts short timezone code like "WAT", "GST", "IST", "EAT", "GMT" from label e.g. "Nigeria Time (WAT)"
 */
export function extractShortTimezone(label: string): string {
  if (!label) return "Local Time";
  const match = label.match(/\(([^)]+)\)/);
  if (match) {
    const inside = match[1];
    if (inside.includes("/")) {
      return inside.split("/")[0].trim();
    }
    return inside.trim();
  }
  return label;
}

/**
 * Match a country name or ISO code against COUNTRY_TIMEZONE_MAP
 */
export function findCountryByNameOrCode(nameOrCode: string): CountryTimezoneInfo | null {
  if (!nameOrCode) return null;
  const norm = nameOrCode.toLowerCase().trim();
  return (
    COUNTRY_TIMEZONE_MAP.find(
      (c) =>
        c.countryCode.toLowerCase() === norm ||
        c.countryName.toLowerCase() === norm ||
        c.countryName.toLowerCase().includes(norm) ||
        norm.includes(c.countryName.toLowerCase())
    ) || null
  );
}
