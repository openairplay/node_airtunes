var airtunes = require('../lib/'),
    spawn = require('child_process').spawn,
    argv = require('optimist')
      .usage('Usage: $0 --host [host] --port [num] --ffmpeg [path] --file [path] --volume [num] --password [string]')
      .default('port', 5000)
      .default('volume', 50)
      .default('ffmpeg', '/usr/local/bin/ffmpeg')
      .default('file', './sample.mp3')
      .demand(['host'])
      .argv;

console.log('adding device: ' + argv.host + ':' + argv.port);
var device = airtunes.add(argv.host, argv);

// when the device is online, spawn ffmpeg to transcode the file
device.on('status', function(status) {
  console.log('status: ' + status);

  if(status !== 'ready')
    return;

  var ffmpeg = spawn(argv.ffmpeg, [
    '-i', argv.file,
    '-f', 's16le',        // PCM 16bits, little-endian
    '-ar', '44100',       // Sampling rate
    '-ac', 2,             // Stereo
    'pipe:1'              // Output on stdout
  ]);

  // pipe data to AirTunes
  ffmpeg.stdout.pipe(airtunes);

  // detect if ffmpeg was not spawned correctly
  ffmpeg.stderr.setEncoding('utf8');
  ffmpeg.stderr.on('data', function(data) {
    if(/^execvp\(\)/.test(data)) {
      console.log('failed to start ' + argv.ffmpeg);
      process.exit(1);
    }
  });
});

// monitor buffer events
airtunes.on('buffer', function(status) {
  console.log('buffer ' + status);

  // after the playback ends, give some time to AirTunes devices
  if(status === 'end') {
    console.log('playback ended, waiting for AirTunes devices');
    setTimeout(function() {
      airtunes.stopAll(function() {
        console.log('end');
        process.exit();
      });
    }, 2000);
  }
});
