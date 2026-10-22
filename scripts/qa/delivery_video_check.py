"""Read-only metadata checks for the final v2 video pair; never renders or edits media."""
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
result = {'checked_at': datetime.now(timezone.utc).isoformat(), 'files': [], 'passed': False}
planned = Decimal(str(json.loads((ROOT/'presentation/v2/timing.json').read_text(encoding='utf-8'))['duration']))
try:
    for name, audio_expected in [('apresentacao-cdv-v2-narrada.mp4', True), ('apresentacao-cdv-v2-sem-audio.mp4', False)]:
        path = ROOT/'presentation/v2/renders'/name
        if not path.is_file() or path.stat().st_size == 0:
            raise AssertionError('Final media missing or empty: '+name)
        command = ['ffprobe','-v','error','-show_entries','format=duration,size:stream=codec_type,codec_name,width,height,r_frame_rate,duration','-of','json',str(path)]
        process = subprocess.run(command,capture_output=True,text=True,encoding='utf-8')
        if process.returncode: raise AssertionError('ffprobe failed: '+name)
        metadata=json.loads(process.stdout)
        duration=Decimal(metadata['format']['duration'])
        video=[s for s in metadata['streams'] if s['codec_type']=='video']
        audio=[s for s in metadata['streams'] if s['codec_type']=='audio']
        passed=(0<duration<=300 and abs(duration-planned)<Decimal('0.1') and len(video)==1
                and video[0]['width']==1920 and video[0]['height']==1080
                and video[0]['r_frame_rate']=='30/1' and bool(audio)==audio_expected)
        result['files'].append({'path':path.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                                'exit_code':process.returncode,'metadata':metadata,'passed':passed})
        if not passed: raise AssertionError('Video metadata differs from delivery contract: '+name)
    result['passed']=True
finally:
    (ROOT/'scripts/qa/delivery_video_results.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'passed':result['passed'],'files':[{'path':x['path'],'duration':x['metadata']['format']['duration'],'passed':x['passed']} for x in result['files']]}))
