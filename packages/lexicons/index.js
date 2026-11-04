"use strict";
/**
 * The app.civic.* lexicon documents, loaded straight from schemas/.
 *
 * Plain CommonJS on purpose: there is nothing to compile, so the package
 * works the same under ts-node-dev, the compiled server and the Docker
 * image, with no build step and no generated files in git.
 */
const lexicons = [
  require("./schemas/app.civic.course.json"),
  require("./schemas/app.civic.courseSpace.json"),
  require("./schemas/app.civic.lesson.json"),
  require("./schemas/app.civic.progress.json"),
  require("./schemas/app.civic.video.json"),
];

const CIVIC_LEXICON_IDS = lexicons.map((doc) => doc.id);

/** Lexicons the civic schemas reference but don't define. */
const dependencies = [require("./schemas/vendor/com.atproto.repo.strongRef.json")];

/**
 * A validator that knows every app.civic.* schema *and* what they reference.
 * Loading only `lexicons` into `new Lexicons()` is not enough: course, lesson
 * and progress records point at com.atproto.repo.strongRef, and validating
 * them without it throws "Lexicon not found" for every record.
 */
function createCivicValidator() {
  const { Lexicons } = require("@atproto/lexicon");
  return new Lexicons([...dependencies, ...lexicons]);
}

module.exports = { lexicons, CIVIC_LEXICON_IDS, createCivicValidator };
