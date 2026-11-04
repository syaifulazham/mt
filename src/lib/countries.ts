// ISO 3166-1 countries: [iso2, iso3, English name]. Used to add rows to the
// `countries` table (which is seeded with Malaysia only) without anyone
// typing codes by hand.

export const ISO_COUNTRIES: ReadonlyArray<readonly [string, string, string]> = [
  ["AF", "AFG", "Afghanistan"], ["AL", "ALB", "Albania"], ["DZ", "DZA", "Algeria"],
  ["AD", "AND", "Andorra"], ["AO", "AGO", "Angola"], ["AG", "ATG", "Antigua and Barbuda"],
  ["AR", "ARG", "Argentina"], ["AM", "ARM", "Armenia"], ["AU", "AUS", "Australia"],
  ["AT", "AUT", "Austria"], ["AZ", "AZE", "Azerbaijan"], ["BS", "BHS", "Bahamas"],
  ["BH", "BHR", "Bahrain"], ["BD", "BGD", "Bangladesh"], ["BB", "BRB", "Barbados"],
  ["BY", "BLR", "Belarus"], ["BE", "BEL", "Belgium"], ["BZ", "BLZ", "Belize"],
  ["BJ", "BEN", "Benin"], ["BT", "BTN", "Bhutan"], ["BO", "BOL", "Bolivia"],
  ["BA", "BIH", "Bosnia and Herzegovina"], ["BW", "BWA", "Botswana"], ["BR", "BRA", "Brazil"],
  ["BN", "BRN", "Brunei Darussalam"], ["BG", "BGR", "Bulgaria"], ["BF", "BFA", "Burkina Faso"],
  ["BI", "BDI", "Burundi"], ["CV", "CPV", "Cabo Verde"], ["KH", "KHM", "Cambodia"],
  ["CM", "CMR", "Cameroon"], ["CA", "CAN", "Canada"], ["CF", "CAF", "Central African Republic"],
  ["TD", "TCD", "Chad"], ["CL", "CHL", "Chile"], ["CN", "CHN", "China"],
  ["CO", "COL", "Colombia"], ["KM", "COM", "Comoros"], ["CG", "COG", "Congo"],
  ["CD", "COD", "Congo (Democratic Republic)"], ["CR", "CRI", "Costa Rica"], ["CI", "CIV", "Côte d'Ivoire"],
  ["HR", "HRV", "Croatia"], ["CU", "CUB", "Cuba"], ["CY", "CYP", "Cyprus"],
  ["CZ", "CZE", "Czechia"], ["DK", "DNK", "Denmark"], ["DJ", "DJI", "Djibouti"],
  ["DM", "DMA", "Dominica"], ["DO", "DOM", "Dominican Republic"], ["EC", "ECU", "Ecuador"],
  ["EG", "EGY", "Egypt"], ["SV", "SLV", "El Salvador"], ["GQ", "GNQ", "Equatorial Guinea"],
  ["ER", "ERI", "Eritrea"], ["EE", "EST", "Estonia"], ["SZ", "SWZ", "Eswatini"],
  ["ET", "ETH", "Ethiopia"], ["FJ", "FJI", "Fiji"], ["FI", "FIN", "Finland"],
  ["FR", "FRA", "France"], ["GA", "GAB", "Gabon"], ["GM", "GMB", "Gambia"],
  ["GE", "GEO", "Georgia"], ["DE", "DEU", "Germany"], ["GH", "GHA", "Ghana"],
  ["GR", "GRC", "Greece"], ["GD", "GRD", "Grenada"], ["GT", "GTM", "Guatemala"],
  ["GN", "GIN", "Guinea"], ["GW", "GNB", "Guinea-Bissau"], ["GY", "GUY", "Guyana"],
  ["HT", "HTI", "Haiti"], ["HN", "HND", "Honduras"], ["HK", "HKG", "Hong Kong"],
  ["HU", "HUN", "Hungary"], ["IS", "ISL", "Iceland"], ["IN", "IND", "India"],
  ["ID", "IDN", "Indonesia"], ["IR", "IRN", "Iran"], ["IQ", "IRQ", "Iraq"],
  ["IE", "IRL", "Ireland"], ["IL", "ISR", "Israel"], ["IT", "ITA", "Italy"],
  ["JM", "JAM", "Jamaica"], ["JP", "JPN", "Japan"], ["JO", "JOR", "Jordan"],
  ["KZ", "KAZ", "Kazakhstan"], ["KE", "KEN", "Kenya"], ["KI", "KIR", "Kiribati"],
  ["KP", "PRK", "Korea (North)"], ["KR", "KOR", "Korea (South)"], ["KW", "KWT", "Kuwait"],
  ["KG", "KGZ", "Kyrgyzstan"], ["LA", "LAO", "Lao PDR"], ["LV", "LVA", "Latvia"],
  ["LB", "LBN", "Lebanon"], ["LS", "LSO", "Lesotho"], ["LR", "LBR", "Liberia"],
  ["LY", "LBY", "Libya"], ["LI", "LIE", "Liechtenstein"], ["LT", "LTU", "Lithuania"],
  ["LU", "LUX", "Luxembourg"], ["MO", "MAC", "Macao"], ["MG", "MDG", "Madagascar"],
  ["MW", "MWI", "Malawi"], ["MY", "MYS", "Malaysia"], ["MV", "MDV", "Maldives"],
  ["ML", "MLI", "Mali"], ["MT", "MLT", "Malta"], ["MH", "MHL", "Marshall Islands"],
  ["MR", "MRT", "Mauritania"], ["MU", "MUS", "Mauritius"], ["MX", "MEX", "Mexico"],
  ["FM", "FSM", "Micronesia"], ["MD", "MDA", "Moldova"], ["MC", "MCO", "Monaco"],
  ["MN", "MNG", "Mongolia"], ["ME", "MNE", "Montenegro"], ["MA", "MAR", "Morocco"],
  ["MZ", "MOZ", "Mozambique"], ["MM", "MMR", "Myanmar"], ["NA", "NAM", "Namibia"],
  ["NR", "NRU", "Nauru"], ["NP", "NPL", "Nepal"], ["NL", "NLD", "Netherlands"],
  ["NZ", "NZL", "New Zealand"], ["NI", "NIC", "Nicaragua"], ["NE", "NER", "Niger"],
  ["NG", "NGA", "Nigeria"], ["MK", "MKD", "North Macedonia"], ["NO", "NOR", "Norway"],
  ["OM", "OMN", "Oman"], ["PK", "PAK", "Pakistan"], ["PW", "PLW", "Palau"],
  ["PS", "PSE", "Palestine"], ["PA", "PAN", "Panama"], ["PG", "PNG", "Papua New Guinea"],
  ["PY", "PRY", "Paraguay"], ["PE", "PER", "Peru"], ["PH", "PHL", "Philippines"],
  ["PL", "POL", "Poland"], ["PT", "PRT", "Portugal"], ["QA", "QAT", "Qatar"],
  ["RO", "ROU", "Romania"], ["RU", "RUS", "Russian Federation"], ["RW", "RWA", "Rwanda"],
  ["KN", "KNA", "Saint Kitts and Nevis"], ["LC", "LCA", "Saint Lucia"], ["VC", "VCT", "Saint Vincent and the Grenadines"],
  ["WS", "WSM", "Samoa"], ["SM", "SMR", "San Marino"], ["ST", "STP", "Sao Tome and Principe"],
  ["SA", "SAU", "Saudi Arabia"], ["SN", "SEN", "Senegal"], ["RS", "SRB", "Serbia"],
  ["SC", "SYC", "Seychelles"], ["SL", "SLE", "Sierra Leone"], ["SG", "SGP", "Singapore"],
  ["SK", "SVK", "Slovakia"], ["SI", "SVN", "Slovenia"], ["SB", "SLB", "Solomon Islands"],
  ["SO", "SOM", "Somalia"], ["ZA", "ZAF", "South Africa"], ["SS", "SSD", "South Sudan"],
  ["ES", "ESP", "Spain"], ["LK", "LKA", "Sri Lanka"], ["SD", "SDN", "Sudan"],
  ["SR", "SUR", "Suriname"], ["SE", "SWE", "Sweden"], ["CH", "CHE", "Switzerland"],
  ["SY", "SYR", "Syria"], ["TW", "TWN", "Taiwan"], ["TJ", "TJK", "Tajikistan"],
  ["TZ", "TZA", "Tanzania"], ["TH", "THA", "Thailand"], ["TL", "TLS", "Timor-Leste"],
  ["TG", "TGO", "Togo"], ["TO", "TON", "Tonga"], ["TT", "TTO", "Trinidad and Tobago"],
  ["TN", "TUN", "Tunisia"], ["TR", "TUR", "Türkiye"], ["TM", "TKM", "Turkmenistan"],
  ["TV", "TUV", "Tuvalu"], ["UG", "UGA", "Uganda"], ["UA", "UKR", "Ukraine"],
  ["AE", "ARE", "United Arab Emirates"], ["GB", "GBR", "United Kingdom"], ["US", "USA", "United States"],
  ["UY", "URY", "Uruguay"], ["UZ", "UZB", "Uzbekistan"], ["VU", "VUT", "Vanuatu"],
  ["VA", "VAT", "Vatican City"], ["VE", "VEN", "Venezuela"], ["VN", "VNM", "Viet Nam"],
  ["YE", "YEM", "Yemen"], ["ZM", "ZMB", "Zambia"], ["ZW", "ZWE", "Zimbabwe"],
];

/** The host country. Contingents from any other country are "foreign". */
export const HOME_COUNTRY_ISO2 = "MY";

export function isForeignCountry(country: { codeIso2: string } | null | undefined): boolean {
  return !!country && country.codeIso2.toUpperCase() !== HOME_COUNTRY_ISO2;
}

/**
 * Judging / results scope that groups every foreign team, whatever its country
 * ("Antarabangsa"). Stored like a state id in the per-state judging rows.
 */
export const INTERNATIONAL_SCOPE_ID = "INTL";
export const INTERNATIONAL_SCOPE_NAME = "Antarabangsa";

export function findIsoCountry(iso2: string) {
  const code = iso2.trim().toUpperCase();
  const row = ISO_COUNTRIES.find(([c]) => c === code);
  return row ? { codeIso2: row[0], codeIso3: row[1], name: row[2] } : null;
}

/** Emoji flag from an ISO2 code ("ID" → 🇮🇩). */
export function flagEmoji(iso2: string | null | undefined): string {
  if (!iso2 || iso2.length !== 2) return "";
  return String.fromCodePoint(...[...iso2.toUpperCase()].map((c) => 0x1f1a5 + c.charCodeAt(0)));
}
