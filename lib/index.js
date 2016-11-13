var Stream = require('stream'),
    util = require('util'),
    Devices = require('./devices.js'),
    config = require('./config.js'),
    CircularBuffer = require('./circular_buffer.js'),
    AudioOut = require('./audio_out.js');

function AirTunes() {
  var self = this;

  Stream.call(this);

  var audioOut = new AudioOut();
  this.devices = new Devices(audioOut);

  this.devices.init();
  this.devices.on('status', function(key, status, desc) {
    self.emit('device', key, status, desc);
  });

  this.circularBuffer = new CircularBuffer(config.packets_in_buffer, config.packet_size);

  this.circularBuffer.on('status', function(status) {
    self.emit('buffer', status);
  });

  audioOut.init(this.devices, this.circularBuffer);

  this.circularBuffer.on('drain', function() {
    self.emit('drain');
  });

  this.circularBuffer.on('error', function(err) {
    self.emit('error', err);
  });

  this.writable = true;
}

util.inherits(AirTunes, Stream);

AirTunes.prototype.add = function(host, options) {
  return this.devices.add('airtunes', host, options);
};

AirTunes.prototype.addCoreAudio = function(options) {
  return this.devices.add('coreaudio', null, options);
};

AirTunes.prototype.stopAll = function(cb) {
  this.devices.stopAll(cb);
};

AirTunes.prototype.setVolume = function(deviceKey, volume, callback) {
  this.devices.setVolume(deviceKey, volume, callback);
};

AirTunes.prototype.setTrackInfo = function(deviceKey, name, artist, album, callback) {
  this.devices.setTrackInfo(deviceKey, name, artist, album, callback);
};

AirTunes.prototype.reset = function() {
	this.circularBuffer.reset();
};

AirTunes.prototype.setArtwork = function(deviceKey, art, contentType, callback) {
  this.devices.setArtwork(deviceKey, art, contentType, callback);
};

AirTunes.prototype.write = function(data) {
  return this.circularBuffer.write(data);
};

AirTunes.prototype.end = function() {
  this.circularBuffer.end();
};

module.exports = new AirTunes();
module.exports.AirTunes = AirTunes;