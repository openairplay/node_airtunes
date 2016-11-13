var events = require('events'),
    util = require('util'),
    config = require('./config.js'),
    nu = require('./num_util.js');

function AudioOut() {
  events.EventEmitter.call(this);

  this.lastSeq = -1;
  this.hasAirTunes = false;
}

util.inherits(AudioOut, events.EventEmitter);

AudioOut.prototype.init = function(devices, circularBuffer) {
  var self = this;
  config.rtp_time_ref = new Date().getTime();

  devices.on('airtunes_devices', function(hasAirTunes) {
    self.hasAirTunes = hasAirTunes;
  });

  devices.on('need_sync', function() {
    // a sync is forced when a new remote device is added
    self.emit('need_sync', self.lastSeq);
  });

  function sendPacket(seq) {
    var packet = circularBuffer.readPacket();

    packet.seq = seq;
    packet.timestamp = nu.low32(seq*config.frames_per_packet + 2*config.sampling_rate);

    if(self.hasAirTunes && seq % config.sync_period == 0)
      self.emit('need_sync', seq);

    self.emit('packet', packet);
    packet.release();
  }

  function syncAudio() {
    /*
     * Each time syncAudio() runs, a burst of packet is sent.
     * Increasing config.stream_latency lowers CPU usage but increases the size of the burst.
     * If the burst size exceeds the UDP windows size (which we do not know), packets are lost.
     */
    var elapsed = new Date().getTime() - config.rtp_time_ref;

    /*
     * currentSeq is the # of the packet we should be sending now. We have some packets to catch-up
     * since syncAudio is not always running.
     */
    var currentSeq = Math.floor(elapsed*config.sampling_rate/(config.frames_per_packet*1000));

    for(var i = self.lastSeq + 1; i <= currentSeq; i++)
      sendPacket(i);

    self.lastSeq = currentSeq;

    // reschedule ourselves later
    setTimeout(syncAudio, config.stream_latency);
  }

  syncAudio();
}

module.exports = AudioOut;