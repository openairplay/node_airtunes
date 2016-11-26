var Stream = require('stream'),
    util = require('util'),
    PacketPool = require('./packet_pool.js');

var WAITING = 0,
    FILLING = 1,
    NORMAL = 2,
    DRAINING = 3,
    ENDING = 4,
    ENDED = 5;

function CircularBuffer(packetsInBuffer, packetSize) {
  Stream.call(this);

  this.packetPool = new PacketPool();
  this.maxSize = packetsInBuffer*packetSize;
  this.packetSize = packetSize;
  this.writable = true;
  this.muted = false;
  this.buffers = [];
  this.currentSize = 0;
  this.status = WAITING;
}

util.inherits(CircularBuffer, Stream);

CircularBuffer.prototype.write = function(chunk) {
  this.buffers.push(chunk);
  this.currentSize += chunk.length;

  if(this.status === ENDING || this.status === ENDED)
    throw new Error('Cannot write in buffer after closing it');

  if(this.status === WAITING) {
    // notify when we receive the first chunk
    this.emit('status', 'buffering');
    this.status = FILLING;
  }

  if(this.status === FILLING && this.currentSize > this.maxSize/2) {
    this.status = NORMAL;
    this.emit('status', 'playing');
  }

  if(this.currentSize >= this.maxSize) {
    this.status = DRAINING;
    return false;
  } else {
    return true;
  }
};

CircularBuffer.prototype.readPacket = function() {
  var packet = this.packetPool.getPacket();

  // play silence until buffer is filled enough
  if(this.status !== ENDING && this.status !== ENDED &&
      (this.status === FILLING || this.currentSize < this.packetSize)) {
    packet.pcm.fill(0);

    if(this.status !== FILLING && this.status !== WAITING) {
      this.status = FILLING;
      this.emit('status', 'buffering');
    }
  } else {
    var offset = 0, remaining = this.packetSize;

    // fill a whole packet with data
    while(remaining > 0) {
      // pad packet with silence if buffer is empty
      if(this.buffers.length === 0) {
        packet.pcm.fill(0, offset);
        remaining = 0;
        break;
      }

      var first = this.buffers[0];

      if(first.length <= remaining) {
        // pop the whole buffer from the queue
        first.copy(packet.pcm, offset);
        offset += first.length;
        remaining -= first.length;
        this.buffers.shift();
      } else {
        // first buffer contains enough data to fill a packet: slice it
        first.copy(packet.pcm, offset, 0, remaining);
        this.buffers[0] = first.slice(remaining);
        remaining = 0;
        offset += remaining;
      }
    }

    this.currentSize -= this.packetSize;

    // emit 'end' only once
    if(this.status === ENDING && this.currentSize <= 0) {
      this.status = ENDED;
      this.currentSize = 0;
      this.emit('status', 'end');
    }

    // notify that the buffer now has enough room if needed
    if(this.status === DRAINING && this.currentSize < this.maxSize/2) {
      this.status = NORMAL;
      this.emit('drain');
    }
  }

  if(this.muted)
    packet.pcm.fill(0);

  return packet;
};

CircularBuffer.prototype.end = function() {
  // flush the buffer if it was filling
  if(this.status === FILLING)
    this.emit('status', 'playing');

  this.status = ENDING;
};

CircularBuffer.prototype.reset = function() {
  this.buffers = [];
  this.currentSize = 0;
  this.status = WAITING;
};

module.exports = CircularBuffer;