import { CountryTimezoneInfo } from "./types";

/**
 * Standard mapping of candidate phone dial codes to their primary country & IANA timezone.
 * Longest dial codes are matched first.
 */
export const COUNTRY_TIMEZONE_MAP: CountryTimezoneInfo[] = [
  // --- South Asia ---
  { countryCode: "IN", countryName: "India", dialCode: "91", timeZone: "Asia/Kolkata", label: "India Time (IST)" },
  { countryCode: "PK", countryName: "Pakistan", dialCode: "92", timeZone: "Asia/Karachi", label: "Pakistan Time (PKT)" },
  { countryCode: "BD", countryName: "Bangladesh", dialCode: "880", timeZone: "Asia/Dhaka", label: "Bangladesh Time (BST)" },
  { countryCode: "LK", countryName: "Sri Lanka", dialCode: "94", timeZone: "Asia/Colombo", label: "Sri Lanka Time (IST)" },
  { countryCode: "NP", countryName: "Nepal", dialCode: "977", timeZone: "Asia/Kathmandu", label: "Nepal Time (NPT)" },
  { countryCode: "BT", countryName: "Bhutan", dialCode: "975", timeZone: "Asia/Thimphu", label: "Bhutan Time (BTT)" },
  { countryCode: "MV", countryName: "Maldives", dialCode: "960", timeZone: "Indian/Maldives", label: "Maldives Time (MVT)" },
  { countryCode: "AF", countryName: "Afghanistan", dialCode: "93", timeZone: "Asia/Kabul", label: "Afghanistan Time (AFT)" },

  // --- Middle East & Gulf (GCC) ---
  { countryCode: "AE", countryName: "United Arab Emirates", dialCode: "971", timeZone: "Asia/Dubai", label: "UAE Time (GST)" },
  { countryCode: "SA", countryName: "Saudi Arabia", dialCode: "966", timeZone: "Asia/Riyadh", label: "Saudi Arabia Time (AST)" },
  { countryCode: "QA", countryName: "Qatar", dialCode: "974", timeZone: "Asia/Qatar", label: "Qatar Time (AST)" },
  { countryCode: "KW", countryName: "Kuwait", dialCode: "965", timeZone: "Asia/Kuwait", label: "Kuwait Time (AST)" },
  { countryCode: "OM", countryName: "Oman", dialCode: "968", timeZone: "Asia/Muscat", label: "Oman Time (GST)" },
  { countryCode: "BH", countryName: "Bahrain", dialCode: "973", timeZone: "Asia/Bahrain", label: "Bahrain Time (AST)" },
  { countryCode: "JO", countryName: "Jordan", dialCode: "962", timeZone: "Asia/Amman", label: "Jordan Time (AST)" },
  { countryCode: "LB", countryName: "Lebanon", dialCode: "961", timeZone: "Asia/Beirut", label: "Lebanon Time (EET)" },
  { countryCode: "IQ", countryName: "Iraq", dialCode: "964", timeZone: "Asia/Baghdad", label: "Iraq Time (AST)" },
  { countryCode: "YE", countryName: "Yemen", dialCode: "967", timeZone: "Asia/Aden", label: "Yemen Time (AST)" },
  { countryCode: "TR", countryName: "Turkey", dialCode: "90", timeZone: "Europe/Istanbul", label: "Turkey Time (TRT)" },
  { countryCode: "IL", countryName: "Israel", dialCode: "972", timeZone: "Asia/Jerusalem", label: "Israel Time (IST/IDT)" },
  { countryCode: "IR", countryName: "Iran", dialCode: "98", timeZone: "Asia/Tehran", label: "Iran Time (IRST)" },

  // --- Africa ---
  { countryCode: "NG", countryName: "Nigeria", dialCode: "234", timeZone: "Africa/Lagos", label: "Nigeria Time (WAT)" },
  { countryCode: "KE", countryName: "Kenya", dialCode: "254", timeZone: "Africa/Nairobi", label: "East Africa Time (EAT)" },
  { countryCode: "ZA", countryName: "South Africa", dialCode: "27", timeZone: "Africa/Johannesburg", label: "South Africa Time (SAST)" },
  { countryCode: "GH", countryName: "Ghana", dialCode: "233", timeZone: "Africa/Accra", label: "Ghana Time (GMT)" },
  { countryCode: "UG", countryName: "Uganda", dialCode: "256", timeZone: "Africa/Kampala", label: "Uganda Time (EAT)" },
  { countryCode: "TZ", countryName: "Tanzania", dialCode: "255", timeZone: "Africa/Dar_es_Salaam", label: "Tanzania Time (EAT)" },
  { countryCode: "ET", countryName: "Ethiopia", dialCode: "251", timeZone: "Africa/Addis_Ababa", label: "Ethiopia Time (EAT)" },
  { countryCode: "RW", countryName: "Rwanda", dialCode: "250", timeZone: "Africa/Kigali", label: "Rwanda Time (CAT)" },
  { countryCode: "ZW", countryName: "Zimbabwe", dialCode: "263", timeZone: "Africa/Harare", label: "Zimbabwe Time (CAT)" },
  { countryCode: "ZM", countryName: "Zambia", dialCode: "260", timeZone: "Africa/Lusaka", label: "Zambia Time (CAT)" },
  { countryCode: "MW", countryName: "Malawi", dialCode: "265", timeZone: "Africa/Blantyre", label: "Malawi Time (CAT)" },
  { countryCode: "BW", countryName: "Botswana", dialCode: "267", timeZone: "Africa/Gaborone", label: "Botswana Time (CAT)" },
  { countryCode: "NA", countryName: "Namibia", dialCode: "264", timeZone: "Africa/Windhoek", label: "Namibia Time (CAT)" },
  { countryCode: "MZ", countryName: "Mozambique", dialCode: "258", timeZone: "Africa/Maputo", label: "Mozambique Time (CAT)" },
  { countryCode: "CM", countryName: "Cameroon", dialCode: "237", timeZone: "Africa/Douala", label: "Cameroon Time (WAT)" },
  { countryCode: "CI", countryName: "Ivory Coast", dialCode: "225", timeZone: "Africa/Abidjan", label: "Ivory Coast Time (GMT)" },
  { countryCode: "SN", countryName: "Senegal", dialCode: "221", timeZone: "Africa/Dakar", label: "Senegal Time (GMT)" },
  { countryCode: "MU", countryName: "Mauritius", dialCode: "230", timeZone: "Indian/Mauritius", label: "Mauritius Time (MUT)" },
  { countryCode: "MG", countryName: "Madagascar", dialCode: "261", timeZone: "Indian/Antananarivo", label: "Madagascar Time (EAT)" },
  { countryCode: "AO", countryName: "Angola", dialCode: "244", timeZone: "Africa/Luanda", label: "Angola Time (WAT)" },
  { countryCode: "CD", countryName: "DR Congo", dialCode: "243", timeZone: "Africa/Kinshasa", label: "Congo Time (WAT)" },
  { countryCode: "CG", countryName: "Republic of the Congo", dialCode: "242", timeZone: "Africa/Brazzaville", label: "Congo Time (WAT)" },
  { countryCode: "SL", countryName: "Sierra Leone", dialCode: "232", timeZone: "Africa/Freetown", label: "Sierra Leone Time (GMT)" },
  { countryCode: "LR", countryName: "Liberia", dialCode: "231", timeZone: "Africa/Monrovia", label: "Liberia Time (GMT)" },
  { countryCode: "GN", countryName: "Guinea", dialCode: "224", timeZone: "Africa/Conakry", label: "Guinea Time (GMT)" },
  { countryCode: "BJ", countryName: "Benin", dialCode: "229", timeZone: "Africa/Porto-Novo", label: "Benin Time (WAT)" },
  { countryCode: "TG", countryName: "Togo", dialCode: "228", timeZone: "Africa/Lome", label: "Togo Time (GMT)" },
  { countryCode: "NE", countryName: "Niger", dialCode: "227", timeZone: "Africa/Niamey", label: "Niger Time (WAT)" },
  { countryCode: "ML", countryName: "Mali", dialCode: "223", timeZone: "Africa/Bamako", label: "Mali Time (GMT)" },
  { countryCode: "BF", countryName: "Burkina Faso", dialCode: "226", timeZone: "Africa/Ouagadougou", label: "Burkina Faso Time (GMT)" },
  { countryCode: "GA", countryName: "Gabon", dialCode: "241", timeZone: "Africa/Libreville", label: "Gabon Time (WAT)" },
  { countryCode: "GM", countryName: "Gambia", dialCode: "220", timeZone: "Africa/Banjul", label: "Gambia Time (GMT)" },
  { countryCode: "LS", countryName: "Lesotho", dialCode: "266", timeZone: "Africa/Maseru", label: "Lesotho Time (SAST)" },
  { countryCode: "SZ", countryName: "Eswatini", dialCode: "268", timeZone: "Africa/Mbabane", label: "Eswatini Time (SAST)" },
  { countryCode: "SC", countryName: "Seychelles", dialCode: "248", timeZone: "Indian/Mahe", label: "Seychelles Time (SCT)" },
  { countryCode: "SO", countryName: "Somalia", dialCode: "252", timeZone: "Africa/Mogadishu", label: "Somalia Time (EAT)" },
  { countryCode: "SS", countryName: "South Sudan", dialCode: "211", timeZone: "Africa/Juba", label: "South Sudan Time (CAT)" },
  { countryCode: "BI", countryName: "Burundi", dialCode: "257", timeZone: "Africa/Bujumbura", label: "Burundi Time (CAT)" },
  { countryCode: "EG", countryName: "Egypt", dialCode: "20", timeZone: "Africa/Cairo", label: "Egypt Time (EET)" },
  { countryCode: "MA", countryName: "Morocco", dialCode: "212", timeZone: "Africa/Casablanca", label: "Morocco Time (WET)" },
  { countryCode: "TN", countryName: "Tunisia", dialCode: "216", timeZone: "Africa/Tunis", label: "Tunisia Time (CET)" },
  { countryCode: "DZ", countryName: "Algeria", dialCode: "213", timeZone: "Africa/Algiers", label: "Algeria Time (CET)" },
  { countryCode: "LY", countryName: "Libya", dialCode: "218", timeZone: "Africa/Tripoli", label: "Libya Time (EET)" },
  { countryCode: "SD", countryName: "Sudan", dialCode: "249", timeZone: "Africa/Khartoum", label: "Sudan Time (CAT)" },

  // --- Southeast & East Asia ---
  { countryCode: "PH", countryName: "Philippines", dialCode: "63", timeZone: "Asia/Manila", label: "Philippines Time (PHT)" },
  { countryCode: "SG", countryName: "Singapore", dialCode: "65", timeZone: "Asia/Singapore", label: "Singapore Time (SGT)" },
  { countryCode: "MY", countryName: "Malaysia", dialCode: "60", timeZone: "Asia/Kuala_Lumpur", label: "Malaysia Time (MYT)" },
  { countryCode: "ID", countryName: "Indonesia", dialCode: "62", timeZone: "Asia/Jakarta", label: "Indonesia Time (WIB)" },
  { countryCode: "VN", countryName: "Vietnam", dialCode: "84", timeZone: "Asia/Ho_Chi_Minh", label: "Vietnam Time (ICT)" },
  { countryCode: "TH", countryName: "Thailand", dialCode: "66", timeZone: "Asia/Bangkok", label: "Thailand Time (ICT)" },
  { countryCode: "MM", countryName: "Myanmar", dialCode: "95", timeZone: "Asia/Yangon", label: "Myanmar Time (MMT)" },
  { countryCode: "KH", countryName: "Cambodia", dialCode: "855", timeZone: "Asia/Phnom_Penh", label: "Cambodia Time (ICT)" },
  { countryCode: "LA", countryName: "Laos", dialCode: "856", timeZone: "Asia/Vientiane", label: "Laos Time (ICT)" },
  { countryCode: "BN", countryName: "Brunei", dialCode: "673", timeZone: "Asia/Brunei", label: "Brunei Time (BNT)" },
  { countryCode: "JP", countryName: "Japan", dialCode: "81", timeZone: "Asia/Tokyo", label: "Japan Time (JST)" },
  { countryCode: "KR", countryName: "South Korea", dialCode: "82", timeZone: "Asia/Seoul", label: "South Korea Time (KST)" },
  { countryCode: "CN", countryName: "China", dialCode: "86", timeZone: "Asia/Shanghai", label: "China Time (CST)" },
  { countryCode: "HK", countryName: "Hong Kong", dialCode: "852", timeZone: "Asia/Hong_Kong", label: "Hong Kong Time (HKT)" },
  { countryCode: "TW", countryName: "Taiwan", dialCode: "886", timeZone: "Asia/Taipei", label: "Taiwan Time (CST)" },
  { countryCode: "MO", countryName: "Macau", dialCode: "853", timeZone: "Asia/Macau", label: "Macau Time (CST)" },
  { countryCode: "MN", countryName: "Mongolia", dialCode: "976", timeZone: "Asia/Ulaanbaatar", label: "Mongolia Time (ULAT)" },

  // --- Central & Western Asia ---
  { countryCode: "KZ", countryName: "Kazakhstan", dialCode: "7", timeZone: "Asia/Almaty", label: "Kazakhstan Time (ALMT)" },
  { countryCode: "UZ", countryName: "Uzbekistan", dialCode: "998", timeZone: "Asia/Tashkent", label: "Uzbekistan Time (UZT)" },
  { countryCode: "AZ", countryName: "Azerbaijan", dialCode: "994", timeZone: "Asia/Baku", label: "Azerbaijan Time (AZT)" },
  { countryCode: "GE", countryName: "Georgia", dialCode: "995", timeZone: "Asia/Tbilisi", label: "Georgia Time (GET)" },
  { countryCode: "AM", countryName: "Armenia", dialCode: "374", timeZone: "Asia/Yerevan", label: "Armenia Time (AMT)" },
  { countryCode: "KG", countryName: "Kyrgyzstan", dialCode: "996", timeZone: "Asia/Bishkek", label: "Kyrgyzstan Time (KGT)" },
  { countryCode: "TJ", countryName: "Tajikistan", dialCode: "992", timeZone: "Asia/Dushanbe", label: "Tajikistan Time (TJT)" },
  { countryCode: "TM", countryName: "Turkmenistan", dialCode: "993", timeZone: "Asia/Ashgabat", label: "Turkmenistan Time (TMT)" },

  // --- Europe ---
  { countryCode: "GB", countryName: "United Kingdom", dialCode: "44", timeZone: "Europe/London", label: "UK Time (GMT/BST)" },
  { countryCode: "IE", countryName: "Ireland", dialCode: "353", timeZone: "Europe/Dublin", label: "Ireland Time (IST/GMT)" },
  { countryCode: "DE", countryName: "Germany", dialCode: "49", timeZone: "Europe/Berlin", label: "Germany Time (CET/CEST)" },
  { countryCode: "FR", countryName: "France", dialCode: "33", timeZone: "Europe/Paris", label: "France Time (CET/CEST)" },
  { countryCode: "IT", countryName: "Italy", dialCode: "39", timeZone: "Europe/Rome", label: "Italy Time (CET/CEST)" },
  { countryCode: "ES", countryName: "Spain", dialCode: "34", timeZone: "Europe/Madrid", label: "Spain Time (CET/CEST)" },
  { countryCode: "NL", countryName: "Netherlands", dialCode: "31", timeZone: "Europe/Amsterdam", label: "Netherlands Time (CET/CEST)" },
  { countryCode: "BE", countryName: "Belgium", dialCode: "32", timeZone: "Europe/Brussels", label: "Belgium Time (CET/CEST)" },
  { countryCode: "CH", countryName: "Switzerland", dialCode: "41", timeZone: "Europe/Zurich", label: "Switzerland Time (CET/CEST)" },
  { countryCode: "AT", countryName: "Austria", dialCode: "43", timeZone: "Europe/Vienna", label: "Austria Time (CET/CEST)" },
  { countryCode: "PL", countryName: "Poland", dialCode: "48", timeZone: "Europe/Warsaw", label: "Poland Time (CET/CEST)" },
  { countryCode: "SE", countryName: "Sweden", dialCode: "46", timeZone: "Europe/Stockholm", label: "Sweden Time (CET/CEST)" },
  { countryCode: "NO", countryName: "Norway", dialCode: "47", timeZone: "Europe/Oslo", label: "Norway Time (CET/CEST)" },
  { countryCode: "DK", countryName: "Denmark", dialCode: "45", timeZone: "Europe/Copenhagen", label: "Denmark Time (CET/CEST)" },
  { countryCode: "FI", countryName: "Finland", dialCode: "358", timeZone: "Europe/Helsinki", label: "Finland Time (EET/EEST)" },
  { countryCode: "PT", countryName: "Portugal", dialCode: "351", timeZone: "Europe/Lisbon", label: "Portugal Time (WET/WEST)" },
  { countryCode: "GR", countryName: "Greece", dialCode: "30", timeZone: "Europe/Athens", label: "Greece Time (EET/EEST)" },
  { countryCode: "CZ", countryName: "Czech Republic", dialCode: "420", timeZone: "Europe/Prague", label: "Czechia Time (CET/CEST)" },
  { countryCode: "RO", countryName: "Romania", dialCode: "40", timeZone: "Europe/Bucharest", label: "Romania Time (EET/EEST)" },
  { countryCode: "HU", countryName: "Hungary", dialCode: "36", timeZone: "Europe/Budapest", label: "Hungary Time (CET/CEST)" },
  { countryCode: "CY", countryName: "Cyprus", dialCode: "357", timeZone: "Asia/Nicosia", label: "Cyprus Time (EET/EEST)" },
  { countryCode: "MT", countryName: "Malta", dialCode: "356", timeZone: "Europe/Malta", label: "Malta Time (CET/CEST)" },
  { countryCode: "HR", countryName: "Croatia", dialCode: "385", timeZone: "Europe/Zagreb", label: "Croatia Time (CET/CEST)" },
  { countryCode: "RS", countryName: "Serbia", dialCode: "381", timeZone: "Europe/Belgrade", label: "Serbia Time (CET/CEST)" },
  { countryCode: "SK", countryName: "Slovakia", dialCode: "421", timeZone: "Europe/Bratislava", label: "Slovakia Time (CET/CEST)" },
  { countryCode: "SI", countryName: "Slovenia", dialCode: "386", timeZone: "Europe/Ljubljana", label: "Slovenia Time (CET/CEST)" },
  { countryCode: "BG", countryName: "Bulgaria", dialCode: "359", timeZone: "Europe/Sofia", label: "Bulgaria Time (EET/EEST)" },
  { countryCode: "LT", countryName: "Lithuania", dialCode: "370", timeZone: "Europe/Vilnius", label: "Lithuania Time (EET/EEST)" },
  { countryCode: "LV", countryName: "Latvia", dialCode: "371", timeZone: "Europe/Riga", label: "Latvia Time (EET/EEST)" },
  { countryCode: "EE", countryName: "Estonia", dialCode: "372", timeZone: "Europe/Tallinn", label: "Estonia Time (EET/EEST)" },
  { countryCode: "LU", countryName: "Luxembourg", dialCode: "352", timeZone: "Europe/Luxembourg", label: "Luxembourg Time (CET/CEST)" },
  { countryCode: "IS", countryName: "Iceland", dialCode: "354", timeZone: "Atlantic/Reykjavik", label: "Iceland Time (GMT)" },
  { countryCode: "AL", countryName: "Albania", dialCode: "355", timeZone: "Europe/Tirane", label: "Albania Time (CET/CEST)" },
  { countryCode: "MK", countryName: "North Macedonia", dialCode: "389", timeZone: "Europe/Skopje", label: "Macedonia Time (CET/CEST)" },
  { countryCode: "BA", countryName: "Bosnia and Herzegovina", dialCode: "387", timeZone: "Europe/Sarajevo", label: "Bosnia Time (CET/CEST)" },
  { countryCode: "ME", countryName: "Montenegro", dialCode: "382", timeZone: "Europe/Podgorica", label: "Montenegro Time (CET/CEST)" },
  { countryCode: "MD", countryName: "Moldova", dialCode: "373", timeZone: "Europe/Chisinau", label: "Moldova Time (EET/EEST)" },
  { countryCode: "UA", countryName: "Ukraine", dialCode: "380", timeZone: "Europe/Kyiv", label: "Ukraine Time (EET/EEST)" },
  { countryCode: "BY", countryName: "Belarus", dialCode: "375", timeZone: "Europe/Minsk", label: "Belarus Time (MSK)" },
  { countryCode: "RU", countryName: "Russia", dialCode: "7", timeZone: "Europe/Moscow", label: "Moscow Time (MSK)" },

  // --- Oceania & Pacific ---
  { countryCode: "AU", countryName: "Australia", dialCode: "61", timeZone: "Australia/Sydney", label: "Australia Time (AEST/AEDT)" },
  { countryCode: "NZ", countryName: "New Zealand", dialCode: "64", timeZone: "Pacific/Auckland", label: "New Zealand Time (NZST/NZDT)" },
  { countryCode: "FJ", countryName: "Fiji", dialCode: "679", timeZone: "Pacific/Fiji", label: "Fiji Time (FJT)" },
  { countryCode: "PG", countryName: "Papua New Guinea", dialCode: "675", timeZone: "Pacific/Port_Moresby", label: "PNG Time (PGT)" },
  { countryCode: "WS", countryName: "Samoa", dialCode: "685", timeZone: "Pacific/Apia", label: "Samoa Time (WST)" },
  { countryCode: "TO", countryName: "Tonga", dialCode: "676", timeZone: "Pacific/Tongatapu", label: "Tonga Time (TOT)" },
  { countryCode: "SB", countryName: "Solomon Islands", dialCode: "677", timeZone: "Pacific/Guadalcanal", label: "Solomon Islands Time (SBT)" },
  { countryCode: "VU", countryName: "Vanuatu", dialCode: "678", timeZone: "Pacific/Efate", label: "Vanuatu Time (VUT)" },

  // --- Americas & Caribbean ---
  { countryCode: "JM", countryName: "Jamaica", dialCode: "1876", timeZone: "America/Jamaica", label: "Jamaica Time (EST)" },
  { countryCode: "TT", countryName: "Trinidad and Tobago", dialCode: "1868", timeZone: "America/Port_of_Spain", label: "Trinidad Time (AST)" },
  { countryCode: "BS", countryName: "Bahamas", dialCode: "1242", timeZone: "America/Nassau", label: "Bahamas Time (EST)" },
  { countryCode: "BB", countryName: "Barbados", dialCode: "1246", timeZone: "America/Barbados", label: "Barbados Time (AST)" },
  { countryCode: "DO", countryName: "Dominican Republic", dialCode: "1809", timeZone: "America/Santo_Domingo", label: "Dominican Rep. Time (AST)" },
  { countryCode: "US", countryName: "United States", dialCode: "1", timeZone: "America/New_York", label: "US Eastern Time (ET)" },
  { countryCode: "CA", countryName: "Canada", dialCode: "1", timeZone: "America/Toronto", label: "Canada Eastern Time (ET)" },
  { countryCode: "MX", countryName: "Mexico", dialCode: "52", timeZone: "America/Mexico_City", label: "Mexico Time (CST)" },
  { countryCode: "BR", countryName: "Brazil", dialCode: "55", timeZone: "America/Sao_Paulo", label: "Brazil Time (BRT)" },
  { countryCode: "AR", countryName: "Argentina", dialCode: "54", timeZone: "America/Argentina/Buenos_Aires", label: "Argentina Time (ART)" },
  { countryCode: "CO", countryName: "Colombia", dialCode: "57", timeZone: "America/Bogota", label: "Colombia Time (COT)" },
  { countryCode: "CL", countryName: "Chile", dialCode: "56", timeZone: "America/Santiago", label: "Chile Time (CLT)" },
  { countryCode: "PE", countryName: "Peru", dialCode: "51", timeZone: "America/Lima", label: "Peru Time (PET)" },
  { countryCode: "EC", countryName: "Ecuador", dialCode: "593", timeZone: "America/Guayaquil", label: "Ecuador Time (ECT)" },
  { countryCode: "VE", countryName: "Venezuela", dialCode: "58", timeZone: "America/Caracas", label: "Venezuela Time (VET)" },
  { countryCode: "BO", countryName: "Bolivia", dialCode: "591", timeZone: "America/La_Paz", label: "Bolivia Time (BOT)" },
  { countryCode: "PY", countryName: "Paraguay", dialCode: "595", timeZone: "America/Asuncion", label: "Paraguay Time (PYT)" },
  { countryCode: "UY", countryName: "Uruguay", dialCode: "598", timeZone: "America/Montevideo", label: "Uruguay Time (UYT)" },
  { countryCode: "GY", countryName: "Guyana", dialCode: "592", timeZone: "America/Guyana", label: "Guyana Time (GYT)" },
  { countryCode: "SR", countryName: "Suriname", dialCode: "597", timeZone: "America/Paramaribo", label: "Suriname Time (SRT)" },
  { countryCode: "PA", countryName: "Panama", dialCode: "507", timeZone: "America/Panama", label: "Panama Time (EST)" },
  { countryCode: "CR", countryName: "Costa Rica", dialCode: "506", timeZone: "America/Costa_Rica", label: "Costa Rica Time (CST)" },
  { countryCode: "GT", countryName: "Guatemala", dialCode: "502", timeZone: "America/Guatemala", label: "Guatemala Time (CST)" },
  { countryCode: "HN", countryName: "Honduras", dialCode: "504", timeZone: "America/Tegucigalpa", label: "Honduras Time (CST)" },
  { countryCode: "SV", countryName: "El Salvador", dialCode: "503", timeZone: "America/El_Salvador", label: "El Salvador Time (CST)" },
  { countryCode: "NI", countryName: "Nicaragua", dialCode: "505", timeZone: "America/Managua", label: "Nicaragua Time (CST)" },
  { countryCode: "CU", countryName: "Cuba", dialCode: "53", timeZone: "America/Havana", label: "Cuba Time (CST/CDT)" },
  { countryCode: "HT", countryName: "Haiti", dialCode: "509", timeZone: "America/Port-au-Prince", label: "Haiti Time (EST)" },
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
 * Converts 24h time string like "13:00" to 12h format like "01:00 PM"
 */
export function format12hTime(time24: string): string {
  if (!time24) return "";
  const parts = time24.split(":");
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return time24;
  const m = parts[1] || "00";
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  h = h ? h : 12;
  const hFormatted = h < 10 ? `0${h}` : `${h}`;
  return `${hFormatted}:${m} ${ampm}`;
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
 * Common aliases for countries
 */
const COUNTRY_ALIASES: Record<string, string> = {
  uae: "AE",
  uk: "GB",
  usa: "US",
  us: "US",
  saudi: "SA",
  "cote d'ivoire": "CI",
  swaziland: "SZ",
  burma: "MM",
  czechia: "CZ",
  korea: "KR",
  "russian federation": "RU",
};

/**
 * Match a country name or ISO code against COUNTRY_TIMEZONE_MAP
 */
export function findCountryByNameOrCode(nameOrCode: string): CountryTimezoneInfo | null {
  if (!nameOrCode) return null;
  const norm = nameOrCode.toLowerCase().trim();

  // Alias lookup
  if (COUNTRY_ALIASES[norm]) {
    const code = COUNTRY_ALIASES[norm];
    const match = COUNTRY_TIMEZONE_MAP.find((c) => c.countryCode === code);
    if (match) return match;
  }

  // Exact code match
  const exactCode = COUNTRY_TIMEZONE_MAP.find((c) => c.countryCode.toLowerCase() === norm);
  if (exactCode) return exactCode;

  // Exact name match
  const exactName = COUNTRY_TIMEZONE_MAP.find((c) => c.countryName.toLowerCase() === norm);
  if (exactName) return exactName;

  // Substring match
  return (
    COUNTRY_TIMEZONE_MAP.find(
      (c) =>
        c.countryName.toLowerCase().includes(norm) ||
        norm.includes(c.countryName.toLowerCase()),
    ) || null
  );
}

/**
 * Calculates the next 10:00 AM in the candidate's local timezone.
 * If it is already past 10:00 AM there today, returns 10:00 AM tomorrow.
 * This ensures follow-up messages are always sent at a reasonable hour
 * in the candidate's own country — not IST or UTC.
 *
 * @param candidateTimeZone IANA timezone string e.g. "Africa/Lagos", "Asia/Kolkata"
 * @param fromDate Optional base date (default = now)
 * @returns UTC Date object representing next 10:00 AM in that timezone
 */
export function getNext10AmInTimezone(candidateTimeZone: string, fromDate?: Date): Date {
  const base = fromDate || new Date();
  const tz = candidateTimeZone || "Asia/Kolkata";

  try {
    // Get the current hour in the candidate's timezone
    const nowInCandidateTz = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(base);

    const year = parseInt(nowInCandidateTz.find((p) => p.type === "year")?.value || "2026");
    const month = parseInt(nowInCandidateTz.find((p) => p.type === "month")?.value || "1") - 1;
    const day = parseInt(nowInCandidateTz.find((p) => p.type === "day")?.value || "1");
    const hour = parseInt(nowInCandidateTz.find((p) => p.type === "hour")?.value || "0");


    // Build a proper UTC timestamp for 10 AM in the candidate's tz
    // Approach: format 10:00 AM local as an ISO string, then parse
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    const todayLocalDate = formatter.format(base); // "YYYY-MM-DD"

    // Create a fake date string at 10:00 in that timezone and convert to UTC
    // The trick: format a UTC time that, when displayed in that timezone, shows 10:00
    // We binary-search by trying UTC offset of the timezone
    // Simpler: use the fact that we know the local date is todayLocalDate
    // and construct 10 AM local, then find the UTC equivalent
    const guess = new Date(`${todayLocalDate}T10:00:00`);
    // Adjust: find what time "guess" is in candidate tz
    const guessHour = parseInt(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        hour: "2-digit",
        hour12: false,
      }).format(guess),
    );
    // Calculate offset needed (in ms)
    const offsetMs = (10 - guessHour) * 3600 * 1000;
    const target10Am = new Date(guess.getTime() + offsetMs);

    // If it is already past 10 AM there (or within 5 min), schedule for tomorrow
    const isAlreadyPast = base.getTime() >= target10Am.getTime() - 5 * 60 * 1000;
    if (isAlreadyPast) {
      return new Date(target10Am.getTime() + 24 * 3600 * 1000);
    }
    return target10Am;
  } catch {
    // Fallback: just use 24 hours from now (safe default)
    return new Date(base.getTime() + 24 * 3600 * 1000);
  }
}
