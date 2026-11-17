import test from 'node:test';import assert from 'node:assert/strict';import {TOPICS,topicOf} from './contract.mjs';
test('the eight course quotas total exactly 100 distinct exercises',()=>{assert.equal(TOPICS.reduce((n,t)=>n+t.target,0),100);assert.equal(new Set(TOPICS.map(t=>t.id)).size,8);});
test('overlapping derivative labels go to their intended course category',()=>{
 const classify=section=>topicOf(['Calculus - single variable','Differentiation',section]);
 assert.equal(classify('Logarithmic differentiation'),'implicit-logarithmic');assert.equal(classify('Derivatives of logarithmic functions'),'chain-transcendental');
 assert.equal(classify('Higher-order derivatives'),'higher-tangents-linear');assert.equal(classify('Quotient rule (with trigonometric functions)'),'chain-transcendental');
 assert.equal(classify('Definition of the derivative'),'definition-differentiability');assert.equal(classify('Derivatives of polynomials and power functions'),'basic-rules');
});
test('single-variable scope excludes multivariable and integral metadata',()=>{
 assert.equal(topicOf(['Calculus - multivariable','Differentiation of multivariable functions','Implicit differentiation']),null);
 assert.equal(topicOf(['Calculus - single variable','Integrals','Indefinite integrals']),null);
 assert.equal(topicOf(['Calculus - single variable','Limits and continuity','Applications - tangent lines and slopes']),'higher-tangents-linear');
});
