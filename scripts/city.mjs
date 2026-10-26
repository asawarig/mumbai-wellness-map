/* The OpenStreetMap areas the map covers, shared by every build script.
 *
 * Mumbai (BMC) has no single relation: it is Mumbai City District plus Mumbai
 * Suburban District. Navi Mumbai (NMMC) is one relation, across Thane Creek;
 * Thane (TMC) is one more, north of both.
 * Kharghar, Panvel and Ulwe are Panvel Municipal Corporation, so they are
 * not in it.
 */
export const CITY_RELS = [
  7964376, // Mumbai City District
  7964375, // Mumbai Suburban District
  13180880, // Navi Mumbai Municipal Corporation
  7120000, // Thane Municipal Corporation (Thane, Kalwa, Mumbra, Diva)
];
export const CITY_NAME = 'Mumbai, Navi Mumbai and Thane (BMC, NMMC and TMC)';
