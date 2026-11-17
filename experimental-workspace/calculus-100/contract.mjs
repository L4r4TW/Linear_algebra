export const TOPICS=[
 {id:'limits-continuity',title:'Limits and continuity',target:10},
 {id:'definition-differentiability',title:'Derivative definition and differentiability',target:10},
 {id:'basic-rules',title:'Power, product and quotient rules',target:15},
 {id:'chain-transcendental',title:'Chain rule and transcendental derivatives',target:20},
 {id:'implicit-logarithmic',title:'Implicit and logarithmic differentiation',target:10},
 {id:'higher-tangents-linear',title:'Higher derivatives, tangents and linear approximation',target:10},
 {id:'curve-analysis',title:'Monotonicity, concavity and extrema',target:15},
 {id:'optimization-related-rates',title:'Optimization and related rates',target:10}
];
export function topicOf(labels=[]){
 const [subject='',chapter='',section='']=labels;if(subject!=='Calculus - single variable'||!['Limits and continuity','Differentiation','Applications of differentiation'].includes(chapter))return null;
 const text=(chapter+' '+section).toLowerCase();
 if(/implicit differentiation|logarithmic differentiation/.test(text))return 'implicit-logarithmic';
 if(/higher.order|linear approximation|differentials|tangent lines/.test(text))return 'higher-tangents-linear';
 if(/optimization|related rates/.test(text))return 'optimization-related-rates';
 if(/increasing|decreasing|extrema|concavity|inflection|curve sketching|mean value theorem/.test(text))return 'curve-analysis';
 if(/definition of the derivative|conceptual understanding of derivatives|differentiability/.test(text))return 'definition-differentiability';
 if(/limits and continuity/.test(text))return 'limits-continuity';
 if(/chain rule|trigonometric|exponential|logarithmic|hyperbolic|inverse functions/.test(text))return 'chain-transcendental';
 if(/polynomial|power functions|product rule|quotient rule|no chain rule/.test(text))return 'basic-rules';
 return null;
}
