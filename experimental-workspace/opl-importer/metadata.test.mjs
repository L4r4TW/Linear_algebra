import test from 'node:test';import assert from 'node:assert/strict';
import {parseMetadata,vocabulary,taxonomyIndex} from './metadata.mjs';
const index=taxonomyIndex([vocabulary('Algebra\n\tVectors\n\t\tDot product')]);
const parse=text=>parseMetadata(Buffer.from(text),'OpenProblemLibrary/test.pg',index);
test('Normalization preserves raw declarations and separates bibliography/unknowns',()=>{
 const m=parse('# DBsubject( algebra )\n# DBchapter(Vectors)\n# DBsection(Dot   product)\n# Author(Ada)\n# TitleText1(Book title)\n# Level(4)\n# DESCRIPTION\n# <b>Compute</b> a product.\n# ENDDESCRIPTION');
 assert.equal(m.state,'matched');assert.deepEqual(m.normalized,['Algebra','Vectors','Dot product']);
 assert.equal(m.raw[0].line,1);assert.equal(m.description,'Compute a product.');
 assert.deepEqual(m.authors,['Ada']);assert.equal(m.difficulty,null);assert.equal(m.language,null);assert.ok(!m.title.includes('Book title'));
});
test('Missing, partial, conflict, malformed and unmapped remain explicit',()=>{
 assert.equal(parse('').state,'missing');assert.equal(parse('# DBsubject(Algebra)').state,'partial');
 assert.equal(parse('# DBsubject(Algebra)\n# DBsubject(Calculus)').state,'conflicting');
 assert.equal(parse('# DBsubject malformed').state,'malformed');
 assert.equal(parse('# DBsubject(X)\n# DBchapter(Y)\n# DBsection(Z)').state,'unmapped');
 assert.equal(parseMetadata(Buffer.from([255]),'OpenProblemLibrary/x.pg',index).state,'malformed');
});
