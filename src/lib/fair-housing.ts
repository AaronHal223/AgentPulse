/**
 * A plain-wording check for fair housing. Real estate copy should describe the property, not
 * the people who live nearby or who the home is "for". This catches the common slips in AI
 * text and in drafts the agent edits; it is a safety net, not legal advice.
 */

export type FairFlag = { phrase: string; why: string };

type Rule = { pattern: RegExp; why: string };

const PEOPLE = "Describes who lives in the area. Describe the home and its features instead.";
const WHO_FOR = "Says who the home is for. Describe the space and let the client decide.";
const SAFETY = "Claims about safety or crime can steer clients. Point them to public crime maps instead.";
const SCHOOLS = "Judging schools can steer clients. Name nearby schools and link to official ratings instead.";
const ABILITY = "Mentions physical ability. Describe the features (stairs, entry steps) instead.";

const RULES: Rule[] = [
  { pattern: /\b(white|black|hispanic|latino|asian|jewish|christian|muslim|catholic|indian|immigrant|ethnic|minority|minorities)\s+(neighbo(u)?rhood|area|community|family|families|street|block)s?\b/i, why: PEOPLE },
  { pattern: /\b(racially|ethnically)\s+\w+|\b(integrated|homogeneous|diverse|exclusive)\s+(neighbo(u)?rhood|area|community)\b/i, why: PEOPLE },
  { pattern: /\b(no|not\s+(?:for|suited\s+for))\s+(kids|children|families)\b|\badults?\s+only\b|\bmature\s+(couple|person|individual)s?\b/i, why: WHO_FOR },
  { pattern: /\b(perfect|ideal|great)\s+for\s+(a\s+)?(young\s+)?(famil(y|ies)|couples?|singles?|bachelors?|retirees|empty[\s-]nesters|professionals|newlyweds)\b/i, why: WHO_FOR },
  { pattern: /\b(family|kid)[\s-]friendly\s+(neighbo(u)?rhood|area|community|street)\b/i, why: WHO_FOR },
  { pattern: /\b(safe|safest|low[\s-]crime|crime[\s-]free|dangerous|sketchy|rough|bad)\s+(neighbo(u)?rhood|area|part\s+of\s+town|street|community)\b/i, why: SAFETY },
  { pattern: /\b(good|great|best|top|excellent|bad|poor|failing)\s+(public\s+)?(schools?|school\s+district)\b/i, why: SCHOOLS },
  { pattern: /\bable[\s-]bodied\b|\bno\s+wheelchairs?\b|\bhandicapped\b|\bmust\s+be\s+able\s+to\s+(walk|climb)\b/i, why: ABILITY },
];

/** Every phrase in the text that could read as steering, with the reason. Empty when it's fine. */
export function fairHousingFlags(text: string): FairFlag[] {
  const flags: FairFlag[] = [];
  for (const { pattern, why } of RULES) {
    const global = new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`);
    for (const m of text.matchAll(global)) flags.push({ phrase: m[0], why });
  }
  return flags;
}

/**
 * Copy with any sentence that trips the check left out. Used on AI text that may be sent to a
 * client. If every sentence trips it, the result is empty and the caller shows facts only.
 */
export function keepFairCopy(text: string): string {
  if (!fairHousingFlags(text).length) return text;
  const sentences = text.match(/[^.!?]+[.!?]*\s*/g) ?? [text];
  return sentences
    .filter((s) => !fairHousingFlags(s).length)
    .join("")
    .trim();
}

/** The instruction every AI prompt that writes about homes or areas includes. */
export const FAIR_HOUSING_RULES = `Fair housing: describe the property and plain facts about location (distances, nearby places by name). Never describe the people who live in an area, never say who a home is "perfect for", and never judge how safe an area is or how good its schools are. If the client asked about schools or safety, say the agent can share official sources.`;
