#!/usr/bin/env python3
"""Cut one long narration take into one clip per line.

The narrator records many short lines in a single take, separated by long
pauses. This finds the pauses, checks that the number of spoken segments
matches the number of names given, then writes each segment as a trimmed,
loudness-levelled mono MP3.

    python3 tools/split_narration.py take.mp3 public/assets/audio/voice name1 name2 ...
"""
import re
import subprocess
import sys


def duration(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
                         capture_output=True, text=True).stdout
    return float(out)


def segments(path, gap):
    err = subprocess.run(['ffmpeg', '-hide_banner', '-i', path, '-af', f'silencedetect=noise=-38dB:d={gap}', '-f', 'null', '-'],
                         capture_output=True, text=True).stderr
    starts = [float(x) for x in re.findall(r'silence_start: ([-\d.]+)', err)]
    ends = [float(x) for x in re.findall(r'silence_end: ([-\d.]+)', err)]
    total = duration(path)
    out, cur = [], 0.0
    for s, e in zip(starts, ends + [total] * (len(starts) - len(ends))):
        if s - cur > 0.15:
            out.append((cur, s))
        cur = e
    if total - cur > 0.15:
        out.append((cur, total))
    return out


def main():
    take, out_dir, names = sys.argv[1], sys.argv[2], sys.argv[3:]
    found = None
    for gap in (1.2, 1.0, 0.8, 0.65, 0.5):
        segs = segments(take, gap)
        if len(segs) == len(names):
            found = (gap, segs)
            break
    if not found:
        print(f'FAILED: expected {len(names)} lines, pauses give', [len(segments(take, g)) for g in (1.2, 1.0, 0.8, 0.65, 0.5)])
        sys.exit(1)
    gap, segs = found
    for (a, e), name in zip(segs, names):
        af = (f'atrim=start={max(0, a - 0.06):.3f}:end={e + 0.12:.3f},asetpts=PTS-STARTPTS,'
              'loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.02,areverse,afade=t=in:d=0.06,areverse')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', take, '-af', af,
                        '-ac', '1', '-ar', '44100', '-b:a', '112k', f'{out_dir}/{name}.mp3'], check=True)
    print(f'{len(names)} clips (pause {gap}s):', ' '.join(f'{n}={e - a:.2f}s' for (a, e), n in zip(segs, names)))


if __name__ == '__main__':
    main()
