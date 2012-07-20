Simple examples to demonstrate the module. You can try it with (AirFoil Speakers)[http://rogueamoeba.com/airfoil/] if you do not own an AirPlay device.

`play_stdin.js`: Play PCM data passed from stdin:

Usage: `cat ./sample.pcm | node play_stdin.js --host <AirTunes host>`

`play_ffmpeg.js`: Harness FFmpeg to transcode a source on-the-fly.

Both examples require optimist, although the module itself doesn't.

`scan_airtunes.js`: Simple wrapper around mDNS to list nearby AirTunes devices (OS X only).
