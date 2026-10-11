const fs=require('node:fs');
const rate=44100, length=Math.round(rate*.19), output=Buffer.alloc(44+length*2);
output.write('RIFF',0);output.writeUInt32LE(36+length*2,4);output.write('WAVE',8);output.write('fmt ',12);output.writeUInt32LE(16,16);output.writeUInt16LE(1,20);output.writeUInt16LE(1,22);output.writeUInt32LE(rate,24);output.writeUInt32LE(rate*2,28);output.writeUInt16LE(2,32);output.writeUInt16LE(16,34);output.write('data',36);output.writeUInt32LE(length*2,40);
let phase=0;
for(let i=0;i<length;i++){const t=i/rate;const frequency=210+1050*Math.exp(-t*33);phase+=Math.PI*2*frequency/rate;const envelope=Math.min(1,t/.004)*Math.exp(-t*28);const glint=Math.sin(Math.PI*2*1720*t)*Math.exp(-t*70)*.11;const sample=(Math.sin(phase)*.7+Math.sin(phase*1.47)*.1)*envelope+glint;output.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(sample*21000))),44+i*2);}
fs.writeFileSync('dist/assets/bubble-pop.wav',output);
console.log('Created the short bubble-pop sound cue.');
