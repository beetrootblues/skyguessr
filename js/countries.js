/* SKYQ — country metadata: ISO-3166 alpha-2 codes (for flag emoji) + display info.
   Keyed by the country names used in data.js. */
'use strict';

const COUNTRY_ISO = {
  "United States": "US", Canada: "CA", Mexico: "MX", Greenland: "GL", Guatemala: "GT",
  Belize: "BZ", "El Salvador": "SV", Honduras: "HN", Nicaragua: "NI", "Costa Rica": "CR",
  Panama: "PA", Cuba: "CU", Jamaica: "JM", Haiti: "HT", "Dominican Republic": "DO",
  Bahamas: "BS", Barbados: "BB", Aruba: "AW", "Sint Maarten": "SX", "Cayman Islands": "KY",
  "Trinidad & Tobago": "TT", "Antigua & Barbuda": "AG", "Saint Kitts": "KN", Montserrat: "MS",
  Guadeloupe: "GP", "Puerto Rico": "PR", Dominica: "DM", Grenada: "GD",
  "Saint Vincent": "VC", "Turks & Caicos": "TC", "Saint Martin": "MF",

  Brazil: "BR", Argentina: "AR", Chile: "CL", Colombia: "CO", Peru: "PE", Ecuador: "EC",
  Venezuela: "VE", Bolivia: "BO", Paraguay: "PY", Uruguay: "UY", Guyana: "GY",
  Suriname: "SR", "Falkland Islands": "FK",

  "United Kingdom": "GB", Ireland: "IE", France: "FR", Netherlands: "NL", Belgium: "BE",
  Germany: "DE", Switzerland: "CH", Austria: "AT", Spain: "ES", Portugal: "PT",
  Italy: "IT", Malta: "MT", Greece: "GR", Cyprus: "CY", Turkey: "TR",
  Sweden: "SE", Norway: "NO", Denmark: "DK", Finland: "FI", Iceland: "IS",
  "Faroe Islands": "FO", Poland: "PL", Czechia: "CZ", Slovakia: "SK", Hungary: "HU",
  Romania: "RO", Bulgaria: "BG", Serbia: "RS", Croatia: "HR", Slovenia: "SI",
  Albania: "AL", "North Macedonia": "MK", "Bosnia": "BA", Montenegro: "ME", Kosovo: "XK",
  Moldova: "MD", Ukraine: "UA", Belarus: "BY", Lithuania: "LT", Latvia: "LV",
  Estonia: "EE", Russia: "RU", Georgia: "GE", Armenia: "AM", Luxembourg: "LU",
  Jersey: "JE", Guernsey: "GG", "Isle of Man": "IM",

  Morocco: "MA", Algeria: "DZ", Tunisia: "TN", Libya: "LY", Egypt: "EG", Sudan: "SD",
  "South Sudan": "SS", Ethiopia: "ET", Eritrea: "ER", Djibouti: "DJ", Somalia: "SO",
  Somaliland: "XS", Kenya: "KE", Uganda: "UG", Rwanda: "RW", Burundi: "BI",
  "Tanzania": "TZ", Zambia: "ZM", Malawi: "MW", Mozambique: "MZ", Zimbabwe: "ZW",
  Botswana: "BW", Namibia: "NA", "South Africa": "ZA", Lesotho: "LS", Swaziland: "SZ",
  Madagascar: "MG", Mauritius: "MU", Seychelles: "SC", Comoros: "KM", Mayotte: "YT",
  Nigeria: "NG", Ghana: "GH", "Côte d'Ivoire": "CI", Senegal: "SN", Gambia: "GM",
  Mali: "ML", "Burkina Faso": "BF", Niger: "NE", Chad: "TD", Cameroon: "CM",
  Gabon: "GA", Angola: "AO", "Cape Verde": "CV", Liberia: "LR", "Sierra Leone": "SL",
  Togo: "TG", Benin: "BJ", Tunisia2: "TN", "DR Congo": "CD", Congo: "CG",
  "Equatorial Guinea": "GQ", Mauritania: "MR", Guinea: "GN", "Guinea Bissau": "GW",

  "United Arab Emirates": "AE", Qatar: "QA", Bahrain: "BH", Kuwait: "KW", Oman: "OM",
  "Saudi Arabia": "SA", Yemen: "YE", Israel: "IL", Palestine: "PS", Jordan: "JO",
  Lebanon: "LB", Iraq: "IQ", Iran: "IR", Syria: "SY", Azerbaijan: "AZ",
  Armenia2: "AM", Kazakhstan: "KZ", Uzbekistan: "UZ", Turkmenistan: "TM",
  Kyrgyzstan: "KG", Tajikistan: "TJ", Afghanistan: "AF", Pakistan: "PK", India: "IN",
  Nepal: "NP", Bhutan: "BT", Bangladesh: "BD", "Sri Lanka": "LK", Maldives: "MV",

  China: "CN", "Hong Kong SAR": "HK", Macau: "MO", Taiwan: "TW", Japan: "JP",
  "South Korea": "KR", "North Korea": "KP", Mongolia: "MN", Philippines: "PH",
  Vietnam: "VN", Laos: "LA", Cambodia: "KH", Thailand: "TH", Myanmar: "MM",
  Malaysia: "MY", Singapore: "SG", Indonesia: "ID", "Timor-Leste": "TL",
  Brunei: "BN",

  Australia: "AU", "New Zealand": "NZ", Fiji: "FJ", "Papua New Guinea": "PG",
  Vanuatu: "VU", "Solomon Islands": "SB", Nauru: "NR", Samoa: "WS", Tonga: "TO",
  Kiribati: "KI", Niue: "NU", "Cook Islands": "CK", "French Polynesia": "PF",
  "New Caledonia": "NC", Guam: "GU", Palau: "PW", Micronesia: "FM",
  "French Guiana": "GF", "Timor-Leste": "TL", Bermuda: "BM",
  "Saint Pierre": "PM", Antigua: "AG", "San Marino": "SM",
};

// clean duplicate placeholder keys
if (typeof COUNTRY_ISO !== 'undefined') {
  delete COUNTRY_ISO.Tunisia2; delete COUNTRY_ISO.Armenia2;
}

if (typeof window !== 'undefined') {
  window.COUNTRY_ISO = COUNTRY_ISO;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { COUNTRY_ISO };
}
