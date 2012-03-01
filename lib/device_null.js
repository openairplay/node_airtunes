var events = require('events'),
    util = require('util'),
    audioOut = require('./audio_out.js');

function NullDevice() {
  events.EventEmitter.call(this);
  this.type = 'null';
  this.key = 'null';
};

util.inherits(NullDevice, events.EventEmitter);

NullDevice.prototype.start = function() {
  this.emit('status', 'playing');

  this.audioCallback = function(packet) {
    // don't do anything
  };

  audioOut.on('packet', this.audioCallback);
};

NullDevice.prototype.setVolume = function(volume) {
};

NullDevice.prototype.reportStatus = function() {
  // we're always playing
  this.emit('status', 'playing');
};

NullDevice.prototype.stop = function(cb) {
  if(this.audioCallback)
    audioOut.removeListener('packet', this.audioCallback);

  if(cb)
    cb();
};

module.exports = NullDevice;
