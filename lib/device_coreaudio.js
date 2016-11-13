var events = require('events'),
    util = require('util'),
    config = require('./config.js'),
    bindings = require('../build/Release/airtunes');

function CoreAudioDevice(hasAirTunes, audioOut, options) {
  events.EventEmitter.call(this);

  this.audioOut = audioOut;
  this.type = 'coreaudio';
  this.key = 'coreaudio';
  this.coreAudio = null;
  this.latency = 0;
  this.started = false;
  this.audioCallback = null;
  this.setHasAirTunes(hasAirTunes);
  this.volume = options.volume || 50;
  this.bufferLevelTimer = null;
  this.status = 'init';
}

util.inherits(CoreAudioDevice, events.EventEmitter);

CoreAudioDevice.prototype.start = function(hideStatus) {
  if(this.started)
    return;

  var self = this;
  this.started = true;

  var elapsed = new Date().getTime() - config.rtp_time_ref;
  var elapsedFrames = Math.floor(elapsed*config.sampling_rate/1000);
  var caTimeRef = this.latency + this.audioOut.lastSeq*config.frames_per_packet - elapsedFrames;
  this.coreAudio = bindings.newCoreAudio();

  /*
   * Since the AudioQueue consumes data as fast as we send it, the internal buffer never
   * has a chance to fill. We add this margin to avoid ever draining the buffer.
   * This is done in a separate scope to avoid retaining the buffer in the closure.
   */
  function checkBufferLevel() {
    if(bindings.getBufferLevel(self.coreAudio) <= config.coreaudio_min_level) {
      var silence = new Buffer(config.coreaudio_preload);
      silence.fill(0);
      bindings.enqueuePacket(self.coreAudio, silence, silence.length);
    }

    self.bufferLevelTimer = setTimeout(checkBufferLevel, config.coreaudio_check_period);
  }

  checkBufferLevel();

  bindings.play(this.coreAudio, caTimeRef);

  this.setVolume(this.volume);

  this.status = 'ready';
  if(!hideStatus)
    this.emit('status', 'ready');

  this.audioCallback = function(packet) {
    bindings.enqueuePacket(self.coreAudio, packet.pcm, packet.pcm.length);
  };

  this.audioOut.on('packet', this.audioCallback);
}

CoreAudioDevice.prototype.reportStatus = function(){
   this.emit('status', this.status);
};

CoreAudioDevice.prototype.setHasAirTunes = function(hasAirTunes) {
  this.latency = hasAirTunes ?
    11025 + 2*config.sampling_rate :
    11025;

  // restart to update audio latency
  if(this.started) {
    this.cleanup();
    this.start(true);
  }
};

CoreAudioDevice.prototype.stop = function(cb) {
  this.cleanup();

  this.status = 'stopped';
  this.emit('status', 'stopped');
  this.removeAllListeners();

  if(cb)
    cb();
};

CoreAudioDevice.prototype.setVolume = function(volume) {
  if(this.coreAudio)
    bindings.setVolume(this.coreAudio, volume);
};

CoreAudioDevice.prototype.getInternalBufferLevel = function() {
  if(this.coreAudio)
    return bindings.getBufferLevel(this.coreAudio);
};

CoreAudioDevice.prototype.cleanup = function() {
  if(!this.started)
    return;

  this.started = false;

  if(this.audioCallback) {
    this.audioOut.removeListener('packet', this.audioCallback);
    this.audioCallback = null;
  }

  if(this.bufferLevelTimer) {
    clearTimeout(this.bufferLevelTimer);
    this.bufferLevelTimer = null;
  }

  bindings.stop(this.coreAudio);
  this.coreAudio = null;
};

module.exports = CoreAudioDevice;
