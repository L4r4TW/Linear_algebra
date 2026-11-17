// Independent student-question oracles. Never request or read instructor answer maps.
import assert from 'node:assert/strict';
const match=(text,regex)=>{const value=text.match(regex);assert.ok(value,'QUESTION_SHAPE_CHANGED');return value.slice(1).map(Number);};
export function solveStudentQuestion(kind,text){
 text=text.replace(/\\>/g,'').replace(/\s+/g,' ').trim();
 if(kind===0){const[a]=match(text,/f\(x\) = (\d+)/),[b]=match(text,/g\(x\) = (\d+)/),[d]=match(text,/f\(x\) \+(\d+) g\(x\)/),[e]=match(text,/of \{(\d+) \+ f/),[f,g]=match(text,/frac \{(\d+) g\(x\)\} \{(\d+) f/);return[a+d*b,a*b,Math.cbrt(e+a),f*b/(g*a+b)];}
 if(kind===1){const[b,a]=match(text,/frac\{(\d+)\}\{x- (\d+)\}/);return[`(${b}/(x+h-${a})-${b}/(x-${a}))/h`,`-${b}*h`,`(x+h-${a})*(x-${a})*h`,'h',String(-b),`(x-${a})*(x+h-${a})`,`-${b}/(x-${a})^2`];}
 if(kind===2)return match(text,/f\(x\) = (\d+) x/);
 if(kind===3){const[x]=match(text,/f''\(\s*([-\d.]+)/);return[2*Math.cos(x)-x*Math.sin(x)];}
 if(kind===4){const[a]=match(text,/y = (\d+)x/),[rate]=match(text,/dx\/dt = ([-\d]+)/);return[a*rate];}
 if(kind===5){const[x]=match(text,/at x = (\d+)/),[dx]=match(text,/Delta x = (\d+)/);return[2*x*dx,(x+dx)*(x+dx)-x*x];}
 if(kind===6){const m=text.match(/y = (-?\d*)x\^\{(\d+)\}/);assert.ok(m,'QUESTION_SHAPE_CHANGED');const coefficient=m[1]===''?1:m[1]==='-'?-1:Number(m[1]),n=Number(m[2]);return[`${coefficient*n}*x^(${n-1})`];}
 if(kind===7){const[a,n]=match(text,/frac\{(\d+)\}\{ x\^\{(\d+)\}/);return[`ln(${a})-${n}*ln(abs(x))`,`-${n}/x`];}
 if(kind===8){const[a,b,c,d]=match(text,/at \(([-\d]+), ([-\d]+)\).*point \(([-\d]+), ([-\d]+)\)/);assert.notEqual(a,c);return[b,(d-b)/(c-a)];}
 if(kind===9){const[a,x]=match(text,/y = (\d+)x\^\{3\} at the point \((\d+)/);return[3*a*x*x];}
 throw Error('UNREVIEWED_SOLVER');
}
