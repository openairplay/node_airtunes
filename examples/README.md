Two simple examples to demonstrate the module:

`play_stdin.js`: Play PCM data passed from stdin:

Usage: `cat ./sample.pcm | node play_stdin.js --host <AirTunes host>`

`play_ffmpeg.js`: Harness FFmpeg to transcode a source on-the-fly.

Both examples require optimist, although the module itself doesn't.
