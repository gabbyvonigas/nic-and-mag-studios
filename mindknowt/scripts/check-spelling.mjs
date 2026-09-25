#!/usr/bin/env node
/**
 * American English only. See the copy rules in AGENTS.md.
 *
 * Run over every tracked text file, or over a list of paths:
 *
 *   node scripts/check-spelling.mjs
 *   node scripts/check-spelling.mjs src/screens/HomeScreen.tsx
 *   node scripts/check-spelling.mjs --self-test
 *
 * Exits 1 with a file:line:column list when it finds anything.
 *
 * Why a curated list rather than a rule for "-ise" verbs: most words ending in
 * -ise are correct American English. surprise, advertise, exercise, promise,
 * compromise, franchise, merchandise, revise, supervise, advise, devise and
 * raise would all be flagged by the obvious pattern. Two more traps are in
 * here as well: "organism" is not "organise", and "analyses" is the ordinary
 * plural of "analysis", so only the verb forms of analyse are caught.
 *
 * Suffixes are spelled out per word rather than left open, and stems are not
 * anchored with \b on the left, because prefixed forms are what slip through:
 * a \b anchored search finds "coloured" and walks straight past "recoloured".
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';

/** `british` is a regex source, matched case-insensitively. */
const RULES = [
  { british: 'colour', american: 'color' },
  { british: 'behaviour', american: 'behavior' },
  { british: 'flavour', american: 'flavor' },
  { british: 'favourite', american: 'favorite' },
  { british: 'honour', american: 'honor' },
  { british: 'neighbour', american: 'neighbor' },
  { british: 'centre', american: 'center' },
  { british: 'metre(s)?\\b', american: 'meter' },
  { british: 'grey', american: 'gray' },
  { british: 'licence', american: 'license' },
  { british: 'defence', american: 'defense' },
  { british: 'offence', american: 'offense' },
  { british: 'practise', american: 'practice' },
  { british: 'programme', american: 'program' },
  { british: 'catalogue', american: 'catalog' },
  // Not dialogue: "dialogue" is standard American for a conversation, and only
  // the UI control is spelled "dialog". Flagging it would be wrong in prose.
  { british: 'artefact', american: 'artifact' },
  { british: 'judgement', american: 'judgment' },
  { british: 'ageing', american: 'aging' },
  { british: 'amongst', american: 'among' },
  { british: 'whilst', american: 'while' },
  { british: 'learnt', american: 'learned' },
  { british: 'spelt\\b', american: 'spelled' },
  { british: 'fulfil(ment|s)?\\b', american: 'fulfill' },
  { british: 'enrol(ment|s)?\\b', american: 'enroll' },
  { british: 'skilful', american: 'skillful' },
  { british: 'instal\\b', american: 'install' },

  // Doubled consonant before a suffix.
  { british: 'cancell(ed|ing|ation)', american: 'cancel' },
  { british: 'labell(ed|ing)', american: 'label' },
  { british: 'modell(ed|ing)', american: 'model' },
  { british: 'travell(ed|ing|er)', american: 'travel' },
  { british: 'signall(ed|ing)', american: 'signal' },
  { british: 'totall(ed|ing)', american: 'total' },

  // The -ise verbs, spelled out. A general rule here catches correct words.
  ...[
    'organis',
    'recognis',
    'categoris',
    'customis',
    'optimis',
    'realis',
    'minimis',
    'maximis',
    'summaris',
    'normalis',
    'initialis',
    'serialis',
    'utilis',
    'prioritis',
    'synchronis',
    'authoris',
    'capitalis',
    'emphasis',
    'visualis',
    'localis',
    'specialis',
    'standardis',
    'apologis',
    'memoris',
    'personalis',
  ].map((stem) => ({
    british: `${stem}(e|es|ed|ing|ation|ations|able|ably)\\b`,
    american: `${stem.slice(0, -1)}ze`,
  })),

  // analyses is the ordinary plural of analysis, so anything followed by an s
  // is left alone. That gives up the British verb "he analyses", which cannot
  // be told apart from the American noun without knowing the sentence.
  { british: 'analyse(?!s)', american: 'analyze' },
  { british: 'analysing', american: 'analyzing' },
  { british: 'paralyse(d|s)?\\b', american: 'paralyze' },
];

/**
 * This file names every form it is looking for, so it can never pass its own
 * check. AGENTS.md spells them out for the same reason.
 */
const EXCLUDED = new Set([
  'AGENTS.md',
  'scripts/check-spelling.mjs',
  // Generated, and full of third-party package names this project does not
  // get to spell. `@expo/...optimise...` is somebody else's choice.
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
]);

const EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|txt)$/;

function compiled() {
  return RULES.map((rule) => ({
    ...rule,
    re: new RegExp(rule.british, 'gi'),
  }));
}

function findInText(text, rules) {
  const hits = [];
  const lines = text.split('\n');
  for (const [index, line] of lines.entries()) {
    for (const rule of rules) {
      rule.re.lastIndex = 0;
      let match;
      while ((match = rule.re.exec(line)) !== null) {
        hits.push({
          line: index + 1,
          column: match.index + 1,
          found: match[0],
          suggest: rule.american,
        });
        if (match[0].length === 0) rule.re.lastIndex += 1;
      }
    }
  }
  return hits;
}

/**
 * A checker nobody has seen fire is indistinguishable from a broken one, so it
 * can prove both halves: that it catches what it should, and that it leaves
 * correct American English alone.
 */
function selfTest() {
  const rules = compiled();
  const mustCatch = [
    'colour',
    'recoloured',
    'Uncategorised',
    'the grey one',
    'centred',
    'cancelled',
    'labelled',
    'behaviour',
    'organise',
    'organisation',
    'recognisably',
    'judgement',
    'licence',
    'whilst',
    'analysed',
  ];
  const mustPass = [
    'color',
    'recolored',
    'Uncategorized',
    'gray',
    'centered',
    'canceled',
    'organism',
    'organisms',
    'analyses of the data',
    'surprise',
    'advertise',
    'exercise',
    'compromise',
    'franchise',
    'merchandise',
    'supervise',
    'promise',
    'raise',
    'wise',
    'parameter',
    'diameter',
    'precise',
  ];

  let failures = 0;
  for (const sample of mustCatch) {
    if (findInText(sample, rules).length === 0) {
      console.error(`  self-test: "${sample}" should have been caught`);
      failures += 1;
    }
  }
  for (const sample of mustPass) {
    const hits = findInText(sample, rules);
    if (hits.length > 0) {
      console.error(
        `  self-test: "${sample}" is correct American English but matched "${hits[0].found}"`,
      );
      failures += 1;
    }
  }

  if (failures > 0) {
    console.error(`\nSpelling check self-test failed: ${failures} case(s).`);
    process.exit(1);
  }
  console.log(
    `Spelling check self-test passed: ${mustCatch.length} caught, ${mustPass.length} left alone.`,
  );
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    return;
  }

  const given = args.filter((a) => !a.startsWith('--'));
  const candidates = (given.length > 0 ? given : trackedFiles())
    .filter((file) => EXTENSIONS.test(file))
    .filter((file) => !EXCLUDED.has(file))
    .filter((file) => {
      try {
        return statSync(file).isFile();
      } catch {
        // Staged deletions reach here; there is nothing left to read.
        return false;
      }
    });

  const rules = compiled();
  let total = 0;

  for (const file of candidates) {
    const hits = findInText(readFileSync(file, 'utf8'), rules);
    for (const hit of hits) {
      console.error(
        `${file}:${hit.line}:${hit.column}  "${hit.found}" should be American English (${hit.suggest})`,
      );
      total += 1;
    }
  }

  if (total > 0) {
    console.error(
      `\n${total} British spelling(s) found. MindKnowt is American English only; see the copy rules in AGENTS.md.`,
    );
    process.exit(1);
  }
  console.log(`Spelling: American English, ${candidates.length} files clean.`);
}

main();
