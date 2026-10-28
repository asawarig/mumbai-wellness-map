/* Organisations the map never lists, whichever script finds them: religious
 * and spiritual organisations and guru-led movements. The map is for health,
 * and some of these border on cults. Healthcare run by a religious trust (a
 * mission hospital, a Jain medical centre) is not matched and stays, except
 * where the user has asked otherwise (Bhaktivedanta Hospital, ISKCON-linked).
 */
export const NOT_WELLNESS = /brahma\s*kumari|vipassana|\bdhamma\b|global pagoda|ramakrishna math|ananda sangha|transcendental meditation|\bisha (foundation|yoga|centre|center)|sadhguru|art of living|sri sri|heartfulness|sahaja|iskcon|hare krishna|\bosho\b|satsang|\bashram\b|ambika yoga kutir|raja ?yoga meditation|rajyoga|\bscientology|\bkabbalah|bhaktivedanta|patanjali/i;

/* Places that have shut, or that are not where a listing says they are, so a
 * rerun of research or the OSM sweep cannot bring them back. Add a name
 * pattern here when someone reports one. PicklePro Breach Candy: residents
 * found nothing at the listed address (2026-10-28).
 */
export const CLOSED = /^(birdsong\b|picklepro club breach candy\b)/i;

/* Venues Playo shows only as a landmark: they appear in its search but cannot
 * be booked there, so they must not carry the Playo tag. */
export const NOT_ON_PLAYO = /^willingdon sports club\b/i;
