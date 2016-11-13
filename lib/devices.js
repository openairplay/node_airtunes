var events = require('events'),
    util = require('util'),
    async = require('async'),
    CoreAudioDevice = require('./device_coreaudio.js'),
    AirTunesDevice = require('./device_airtunes.js'),
    config = require('./config.js');

function Devices(audioOut) {
  events.EventEmitter.call(this);

  this.source = null;
  this.devices = {};
  this.hasAirTunes = false;
  this.audioOut = audioOut;
}

util.inherits(Devices, events.EventEmitter);

Devices.prototype.init = function() {
  var self = this;
  self.audioOut.on('need_sync', function(seq) {
    // relay to all devices
    self.forEach(function(dev) {
      if(dev.onSyncNeeded && dev.controlPort)
        dev.onSyncNeeded(seq);
    });
  });
};

Devices.prototype.forEach = function(it) {
  for(var i in this.devices) {
    if(!this.devices.hasOwnProperty(i))
      continue;

    it(this.devices[i], i);
  }
};

Devices.prototype.add = function(type, host, options) {
  var self = this;
  options = options || {};

  var dev = type === 'coreaudio' ?
    new CoreAudioDevice(this.hasAirTunes, this.audioOut, options) :
    new AirTunesDevice(host, this.audioOut, options);

  var previousDev = this.devices[dev.key];

  if(previousDev) {
    // if device is already in the pool, just report its existing status.
    previousDev.reportStatus();

    return previousDev;
  }

  this.devices[dev.key] = dev;

  dev.on('status', function(status, arg) {
    if(status === 'error' || status === 'stopped') {
      delete self.devices[dev.key];
      self.checkAirTunesDevices();
    }

    if(this.hasAirTunes && status === 'playing') {
      self.emit('need_sync');
    }
  });

  dev.start();
  self.checkAirTunesDevices();

  return dev;
};

Devices.prototype.setVolume = function(key, volume, callback) {
  var dev = this.devices[key];

  if(!dev) {
    this.emit('status', key, 'error', 'not_found');

    return;
  }

  dev.setVolume(volume, callback);
};

Devices.prototype.setTrackInfo = function(key, name, artist, album, callback) {
  var dev = this.devices[key];

  if(!dev) {
    this.emit('status', key, 'error', 'not_found');

    return;
  }

  dev.setTrackInfo(name, artist, album, callback);
};

Devices.prototype.setArtwork = function(key, art, contentType, callback) {
  var dev = this.devices[key];

  if(!dev) {
    this.emit('status', key, 'error', 'not_found');

    return;
  }

  dev.setArtwork(art, contentType, callback);
};

Devices.prototype.stopAll = function(allCb) {
  // conver to array to make async happy
  var devices = [];
  for(var i in this.devices) {
    if(!this.devices.hasOwnProperty(i))
      continue;

    devices.push(this.devices[i]);
  }

  async.forEach(
    devices,
    function(dev, cb) {
      dev.stop(cb);
    },
    function() {
      this.devices = {};
      allCb();
    }
  );
};

Devices.prototype.checkAirTunesDevices = function() {
  var newHasAirTunes = false;

  for(var key in this.devices) {
    if(!this.devices.hasOwnProperty(key))
      continue;

    var device = this.devices[key];

    if(device.type === 'airtunes') {
      newHasAirTunes = true;
      break;
    }
  }

  if(newHasAirTunes !== this.hasAirTunes) {
    this.emit('airtunes_devices', newHasAirTunes);

    this.forEach(function(dev) {
      if(dev.setHasAirTunes)
        dev.setHasAirTunes(newHasAirTunes);
    });
  }

  this.hasAirTunes = newHasAirTunes;
};

module.exports = Devices;
