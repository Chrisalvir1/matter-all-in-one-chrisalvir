const {spawnSync}=require('node:child_process');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const assert=require('node:assert/strict');
const binary=process.env.MIAO_FFMPEG;if(!binary)throw new Error('Set MIAO_FFMPEG to the binary under audit');
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'miao-aac-eld-'));const output=path.join(directory,'tone.mp4');
try{
 const encoded=spawnSync(binary,['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=440:sample_rate=24000','-t','1','-c:a','libfdk_aac','-profile:a','aac_eld','-frame_length','480','-ac','1','-b:a','48k','-movflags','+empty_moov+default_base_moof+frag_every_frame','-f','mp4',output],{timeout:10000});
 assert.equal(encoded.status,0,encoded.stderr?.toString());
 const decoded=spawnSync(binary,['-hide_banner','-loglevel','error','-i',output,'-acodec','pcm_s16le','-ar','24000','-ac','1','-f','s16le','pipe:1'],{timeout:10000,maxBuffer:1000000});
 assert.equal(decoded.status,0,decoded.stderr?.toString());const pcm=decoded.stdout;let crossings=0;for(let i=2;i<pcm.length;i+=2)if(pcm.readInt16LE(i-2)<=0&&pcm.readInt16LE(i)>0)crossings++;
 const seconds=pcm.length/2/24000;const hz=crossings/seconds;assert.ok(seconds>.9&&seconds<1.1);assert.ok(hz>430&&hz<450);
 console.log(JSON.stringify({scope:'synthetic local Camera.UI FFmpeg encode/decode; NOT MIAO Docker/HA/Apple Home',encoder:'libfdk_aac',profile:'aac_eld',sampleRate:24000,channels:1,frameLengthRequested:480,encodedBytes:fs.statSync(output).size,decodedDurationSeconds:seconds,measuredToneHz:hz,exit:0}));
}finally{fs.rmSync(directory,{recursive:true,force:true});}
