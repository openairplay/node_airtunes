var nu = require('./num_util.js');

var Config = {
  user_agent: 'Radioline/1.4.0',
  udp_default_port: 6002,         // preferred starting port in AirTunes v2
  frames_per_packet: 352,         // samples per frames in ALAC packets
  channels_per_frame: 2,          // always stereo in AirTunes v2
  bits_per_channel: 16,           // -> 2 bytes per channel
  packet_size: 352*2*2,           // frames*channels*bytes
  packets_in_buffer: 100,         // increase this buffer protects against network issues
  coreaudio_min_level: 5,         // if CoreAudio's internal buffer drops too much, inject some silence to raise it
  coreaudio_check_period: 2000,   // CoreAudio buffer level check period
  coreaudio_preload: 1408*50,     // ~0.5s of silence pushed to CoreAudio to avoid draining AudioQueue
  sampling_rate: 44100,           // fixed by AirTunes v2
  sync_period: 126,               // UDP sync packets are sent to all AirTunes devices regularly
  stream_latency: 50,             // audio UDP packets are flushed in bursts periodically
  rtsp_timeout: 5000,             // RTSP servers are considered gone if no reply is received before the timeout
  rtp_time_ref: 0,
  device_magic: nu.randomInt(9),
  ntp_epoch: 0x83aa7e80,
  iv_base64: "ePRBLI0XN5ArFaaz7ncNZw",
  rsa_aeskey_base64: "VjVbxWcmYgbBbhwBNlCh3K0CMNtWoB844BuiHGUJT51zQS7SDpMnlbBIobsKbfEJ3SCgWHRXjYWf7VQWRYtEcfx7ejA8xDIk5PSBYTvXP5dU2QoGrSBv0leDS6uxlEWuxBq3lIxCxpWO2YswHYKJBt06Uz9P2Fq2hDUwl3qOQ8oXb0OateTKtfXEwHJMprkhsJsGDrIc5W5NJFMAo6zCiM9bGSDeH2nvTlyW6bfI/Q0v0cDGUNeY3ut6fsoafRkfpCwYId+bg3diJh+uzw5htHDyZ2sN+BFYHzEfo8iv4KDxzeya9llqg6fRNQ8d5YjpvTnoeEQ9ye9ivjkBjcAfVw"
};

module.exports = Config;
