import { STUDY_COLLECTIONS } from './study-model.mjs';
export const COLLECTIONS = STUDY_COLLECTIONS;
export function classify(labels = []) {
  if (!Array.isArray(labels)) return null;
  const [s = '', c = '', section = ''] = labels.map((v) =>
    typeof v === 'string' ? v.toLowerCase().trim() : '',
  );
  const t = c + ' ' + section;
  if (
    s === 'calculus - single variable' &&
    ['limits and continuity', 'differentiation', 'applications of differentiation'].includes(c)
  ) {
    let topic;
    if (c === 'limits and continuity') topic = 'limits';
    else if (/implicit|logarithmic differentiation/.test(t)) topic = 'implicit';
    else if (/higher.order|tangent|linear approximation|differentials/.test(t)) topic = 'higher';
    else if (
      /definition of the derivative|conceptual understanding of derivatives|differentiability/.test(
        t,
      )
    )
      topic = 'definition';
    else if (c === 'applications of differentiation') topic = 'applications';
    else if (/chain|trigonometric|exponential|logarithmic|hyperbolic|inverse/.test(t))
      topic = 'chain';
    else if (/polynomial|power function|product|quotient|no chain/.test(t)) topic = 'rules';
    return topic ? { collection: 'calculus', topic } : null;
  }
  if (s === 'algebra' || s === 'precalculus') {
    let topic;
    if (/systems of equations/.test(c)) topic = 'systems';
    else if (/quadratic/.test(c)) topic = 'quadratic';
    else if (/exponential|logarithm/.test(c)) topic = 'logarithms';
    else if (/exponents|radical/.test(c)) topic = 'exponents';
    else if (/linear equations|linear inequalities|linear functions/.test(c)) topic = 'linear';
    else if (/factoring|simplifying expressions/.test(c)) topic = 'expressions';
    else if (/polynomial|rational/.test(c)) topic = 'polynomials';
    return topic ? { collection: 'algebra', topic } : null;
  }
  if (s === 'trigonometry') {
    let topic;
    if (/inverse/.test(section)) topic = 'inverse';
    else if (/equation/.test(section)) topic = 'equations';
    else if (/identit|sum|difference|double.angle|half.angle|simplif/.test(section))
      topic = 'identities';
    else if (/radian|angle measur|degrees|arc length|sector/.test(section)) topic = 'angles';
    else if (/unit circle|special angle|evaluat|exact value|reference angle/.test(section))
      topic = 'circle';
    else if (c === 'triangle trigonometry' && /triangle|sine|cosine|application/.test(section))
      topic = 'triangles';
    else if (c === 'geometric and algebraic foundations for trigonometry') topic = 'angles';
    else if (
      c === 'trigonometric functions' ||
      c === 'periodic functions' ||
      c === 'trigonometric functions of angles'
    )
      topic = 'functions';
    return topic ? { collection: 'trigonometry', topic } : null;
  }
  if (s === 'statistics' || s === 'probability') {
    let topic;
    if (/confidence interval/.test(c)) topic = 'intervals';
    else if (/hypothesis test/.test(c)) topic = 'tests';
    else if (/conditional|bayes|counting|permutation|combination/.test(t)) topic = 'conditional';
    else if (/discrete|binomial|poisson|geometric distribution/.test(t)) topic = 'discrete';
    else if (/normal|sampling distribution|central limit/.test(t)) topic = 'normal';
    else if (/descriptive|exploratory|summary statistics|exploring data/.test(c))
      topic = 'descriptive';
    else if (/sample space|probability|laws, theory/.test(c)) topic = 'probability';
    return topic ? { collection: 'statistics', topic } : null;
  }
  return null;
}
export const KNOWN_BAD = new Set([
  'OpenProblemLibrary/AlfredUniv/anton8e/chapter4/4.1/prob11.pg',
  'OpenProblemLibrary/270/setDerivatives1/ur_dr_1_7.pg',
]);
export function screenSource(text, row) {
  const reasons = [];
  if (KNOWN_BAD.has(row.path)) reasons.push('KNOWN_SOURCE_DEFECT');
  if (!row.path.startsWith('OpenProblemLibrary/')) reasons.push('OUTSIDE_INITIAL_OPL_COLLECTION');
  if (!/DOCUMENT\s*\(/.test(text) || !/ENDDOCUMENT\s*\(/.test(text))
    reasons.push('INCOMPLETE_PROBLEM_STRUCTURE');
  if (Buffer.byteLength(text) > 24000) reasons.push('LARGE_MULTIPART_SOURCE_DEFERRED');
  if (/\b(?:essay_cmp|file_upload|LiveGraphics3D|Applet)\b/i.test(text))
    reasons.push('UNSUPPORTED_INTERACTION');
  if (!row.manifest || row.manifest.unsupported?.length !== 0) reasons.push('UNSUPPORTED_MANIFEST');
  if (!classify(row.metadata?.normalized ?? [])) reasons.push('UNCLASSIFIED');
  return {
    version: 'collection-source-screen-v1',
    sha256: row.sha256,
    passed: reasons.length === 0,
    reasons,
    scope:
      'Automated source screening and known-defect exclusion; not independent mathematical or human approval',
  };
}
