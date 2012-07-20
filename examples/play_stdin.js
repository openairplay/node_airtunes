var airtunes = require('../lib/'),
    argv = require('optimist')
      .usage('Usage: $0 --host [host] --port [num] --volume [num] --password [string]')
      .default('host', 'localhost')
      .default('port', 5000)
      .default('volume', 50)
      .demand(['host'])
      .argv;

console.log('pipe PCM data to play over AirTunes');
console.log('example: cat sample.pcm | node play_stdin.js --host <AirTunes host>\n');

// Only works on OSX
// airtunes.addCoreAudio();

console.log('adding device: ' + argv.host + ':' + argv.port);
var device = airtunes.add(argv.host, argv);


// when the device is online, spawn ffmpeg to transcode the file
device.on('status', function(status) {
  process.stdin.pipe(airtunes);
  process.stdin.resume();
});

device.on('error', function(err) {
  console.log('device error: ' + err);
  process.exit(1);
})

// monitor buffer events
airtunes.on('buffer', function(status) {
  console.log('buffer ' + status);

  // after the playback ends, give AirTunes some time to finish
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
