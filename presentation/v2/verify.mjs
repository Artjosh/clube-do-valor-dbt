import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
process.chdir(fileURLToPath(new URL('.',import.meta.url)));
fs.mkdirSync('evidence/decoded',{recursive:true});
const narr='renders/apresentacao-cdv-v2-narrada.mp4',silent='renders/apresentacao-cdv-v2-sem-audio.mp4';
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const probe=p=>JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',p],{encoding:'utf8'}));
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',narr,'-map','0:v:0','-c:v','copy','-an','-movflags','+faststart',silent]);
const report={at:new Date().toISOString(),files:[],v1Preserved:false,videoPacketsIdentical:false,decoded:[]};
for(const file of [narr,silent]){
 const meta=probe(file);fs.writeFileSync(`evidence/${file===narr?'narrada':'sem-audio'}-ffprobe.json`,JSON.stringify(meta,null,2));
 const video=meta.streams.find(s=>s.codec_type==='video'),audio=meta.streams.filter(s=>s.codec_type==='audio');
 if(video.codec_name!=='h264'||video.width!==1920||video.height!==1080||video.avg_frame_rate!=='30/1'||Number(meta.format.duration)>=300)throw new Error('Unexpected video format');
 if(file===narr&&audio.length!==1)throw new Error('Narrated file missing audio');
 if(file===silent&&audio.length)throw new Error('Silent file has audio');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-i',file,'-f','null','NUL']);
 const packetHash=execFileSync('ffmpeg',['-v','error','-i',file,'-map','0:v:0','-c:v','copy','-f','hash','-hash','sha256','-'],{encoding:'utf8'}).trim();
 report.files.push({file,sha256:sha(file),bytes:fs.statSync(file).size,duration:Number(meta.format.duration),video:{codec:video.codec_name,width:video.width,height:video.height,fps:video.avg_frame_rate,frames:video.nb_frames},audio:audio.map(s=>({codec:s.codec_name,sampleRate:s.sample_rate,channels:s.channels})),decodeExit:0,videoPacketHash:packetHash});
}
report.videoPacketsIdentical=report.files[0].videoPacketHash===report.files[1].videoPacketHash;
if(!report.videoPacketsIdentical)throw new Error('Video packets differ');
const v1before=JSON.parse(fs.readFileSync('evidence/v1-before.json','utf8').replace(/^\uFEFF/,''));
report.v1Preserved=sha('../renders/apresentacao-cdv.mp4').toUpperCase()===v1before.Hash;
if(!report.v1Preserved)throw new Error('V1 changed');
const audio=spawnSync('ffmpeg',['-hide_banner','-i',narr,'-af','ebur128=peak=true','-f','null','NUL'],{encoding:'utf8',maxBuffer:20*1024*1024});
fs.writeFileSync('evidence/audio-ebur128.txt',audio.stderr);
if(audio.status!==0)throw new Error('Audio measurement failed');
const loudness=[...audio.stderr.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)?.[1];
const peak=[...audio.stderr.matchAll(/Peak:\s+(-?[\d.]+) dBFS/g)].at(-1)?.[1];
report.audioMeasurement={integratedLUFS:Number(loudness),truePeakDbfs:Number(peak),measuredNotHumanAudition:true};
if(!Number.isFinite(Number(loudness))||!Number.isFinite(Number(peak))||Number(loudness)<-40||Number(peak)>=0)throw new Error('Audio loudness or peak invalid');
for(const [i,time] of [0,10,31,54,77,102,127,149,170,193,218,230].entries()){
 const file=`evidence/decoded/frame-${String(i).padStart(2,'0')}-${time}s.png`;
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-ss',String(time),'-i',narr,'-frames:v','1',file]);report.decoded.push({time,file});
}
fs.writeFileSync('evidence/decoded/frames.txt',report.decoded.map(f=>`file '${f.file.split('/').at(-1)}'`).join('\n'));
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i','evidence/decoded/frames.txt','-vf','scale=640:360,tile=3x4','-frames:v','1','evidence/decoded/contact-sheet.jpg'],{stdio:'pipe'});
fs.writeFileSync('evidence/verification.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
