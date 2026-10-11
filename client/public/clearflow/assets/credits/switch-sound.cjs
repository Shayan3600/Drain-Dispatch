const fs=require('node:fs');
// A short, dry double click, like a small physical rocker switch.
const rate=44100, samples=Math.round(rate*.085), wav=Buffer.alloc(44+samples*2);
wav.write('RIFF',0);wav.writeUInt32LE(36+samples*2,4);wav.write('WAVE',8);wav.write('fmt ',12);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
let seed=9217;
for(let i=0;i<samples;i++){
  const t=i/rate;
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const noise=seed/0xffffffff*2-1;
  const a=Math.exp(-t*220), second=t>.025?Math.exp(-(t-.025)*260)*.65:0;
  const sample=(noise*.48+Math.sin(2*Math.PI*1600*t)*.52)*(a+second)*Math.min(1,t/.0005);
  wav.writeInt16LE(Math.max(-32767,Math.min(32767,Math.round(sample*21000))),44+i*2);
}
fs.writeFileSync('dist/assets/switch-click.wav',wav);
