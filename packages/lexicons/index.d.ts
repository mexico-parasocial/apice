import type { LexiconDoc, Lexicons } from "@atproto/lexicon";

export type CivicLexiconId =
  | "app.civic.course"
  | "app.civic.courseSpace"
  | "app.civic.lesson"
  | "app.civic.progress"
  | "app.civic.video";

/** Every app.civic.* lexicon document, ready for `new Lexicons(lexicons)`. */
export declare const lexicons: LexiconDoc[];

export declare const CIVIC_LEXICON_IDS: CivicLexiconId[];

/** Validator preloaded with the civic lexicons and the defs they reference. */
export declare function createCivicValidator(): Lexicons;
