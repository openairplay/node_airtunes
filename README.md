node-airtunes - a node.js implementation of AirTunes v2
=======================================================

I'm in a hurry
--------------

Installation

<pre>
  npm install airtunes
</pre>

The example folder contains several test scripts:

* `cat sample.pcm | node play_stdin.js --host yourhost` will stream PCM data passed by stdin.
* `play_ffmpeg.js` harnesses ffmpeg to stream audio files or URL.
* `scan_airtunes.js` will list nearby AirTunes devices (OS X only).

What is AirTunes ?
------------------

[AirTunes](http://en.wikipedia.org/wiki/AirTunes$) is a proprietary audio streaming protocol developed by Apple Inc. It allows wireless streaming of audio between devices. It is used today as the audio-streaming portion of AirPlay.

AirTunes, AirPlay, RAOP ?
-------------------------

When AirTunes was introduced in 2004, its underlying protocol was called [RAOP](http://en.wikipedia.org/wiki/RAOP). It was based on RTSP/RTP and used a TCP transport. It was reverse-engineered in 2004 by Jon Lech Johansen, which opened the way to projects like [Shairport](https://github.com/albertz/shairport).

RAOP didn't support synchronisation between separate streams so AirTunes underwent a major revision in 2011 to include advanced timing features. Its name was also changed to AirPlay. AirTunes v2 still uses RTSP/RTP but now uses a UDP transport.

Most of the available open projects implement AirTunes v1. This is a problem because newer devices tend to drop support for this protocol.

OK, now what is node-airtunes ?
-------------------------------

Node-airtunes is a node.js implementation of AirTunes v2. It supports synchronized audio output to any number of
AirTunes receivers (like Apple's AirPort Express or AirFoil Speakers). It also allows synchronized local playback with CoreAudio (OS X only).

Credits
-------

- [The Airtunes 2 Team](http://git.zx2c4.com/Airtunes2/about/)
- Clément Vasseur for [Air Speaker](https://github.com/nto/AirSpeaker)
- [Rogue Amoeba Software, LLC](http://www.rogueamoeba.com/) for AirFoil
- Apple Inc and [Apple Lossless Audio Codec)[http://alac.macosforge.org/]

Usage
-----

### Playback

`airtunes` is a writable stream to which you can pipe 16bits, little-endian, stereo PCM data. Only this format is supported at the moment.

```javascript
var airtunes = require('airtunes');
myPCMStream.pipe(airtunes);
```

The module has an internal circular buffer which makes it possible to stream from a network source. The stream will pause/resume to keep-up with the streaming. `airtunes` emits 'buffer' events when the status of its internal buffer changes:

* `'buffering'`: Silence is being played while the buffer fills with data.
* `'playing'`: Real sound is being streamed to devices.
* `'end'`: The buffer has been closed by the input stream. Attempting to write more data will raise an exception.

After an `end` event, you should close all devices with `airtunes.stopAll()` after 2s (most AirTunes devices have a 2s buffer). If you want to pipe several successive streams to airtunes, you must pass `{end: false}` to pipe.

### Devices

You can add devices at any time. The sound will be synchronized between all devices, regardless of when they were added. Node-airtunes does not do device discovery, but there's a small script in the examples folder that will do it for OS X users.

```javascript
var deviceKey = airtunes.add({
  host: 'myairtunesdevice', // mandatory
  port: 5000,
  volume: 100,
  password: 'mypassword'
});
```

* `host` and `port` are the location of the AirTunes device as reported by Zeroconf. The default port is 5000.
* `volume` is the initial volume, which must be between 0 and 100. The default volume is 50.
* AirTunes makes it possible to protect devices with a `password`, which is of course optional. Bonjour indicates if the device demands a password.

`airtunes` emits `'device'` events when the state of a device changes:

```javascript
airtunes.on('device', function(deviceKey, status, err) {
  if(err)
    console.log('device ' + deviceKey has an error: ' + err);
  else
    console.log('device ' + deviceKey + ' is ' + status);
});
```

* `'playing'`: when a device is added, it emits this event when it is ready.
* `'error'`: the device was removed from the pool because an error occured.

Possible errors are:

* 'connection_refused': The device refused the connection on the given port.
* 'busy': Another application is already streaming to this device.
* 'timeout': The device did not reply within 'config.rtsp_timeout'.
* 'disconnected': The device closed the connection.
* 'need_password': The device demands a password, but none was passed.
* 'bad_password': The device refused the given password.
* 'udp_ports': Could not bind UDP ports (these are required by AirPort v2).
* 'rtsp_socket': Another RTSP error.

You can stop devices with:

```javascript
airtunes.stop(deviceKey, function() {
  // device was stopped
});
```

You can stop everything with:

```javascript
airtunes.stopAll(function() {
  // everything stopped
});
```

### Volume

You can change the volume with.

```
airtunes.setVolume(deviceKey, volume); // volume must be 0-100
```

Support
-------

Node-airtunes was tested on the following devices:

* AirPort Express
* AirFoil Speakers
* Air Speaker
* Freebox Server

Ping me to add more devices to this list.

How does it work ?
------------------

If you want detailed information about AirTunes v2, you should read the excellent documentation written by the [Airtunes 2 Team](http://git.zx2c4.com/Airtunes2/about/).

Here's just enough information to follow the code.

### RTSP Handshake

RTSP is an HTTP-like protocol used to negociate parameters between the server (the output device) and us. AirTunes devices emit the 'playing' event when the handshake successfully completes.

We send the following sequence:

* _OPTIONS_: Apple added a proprietary 'Apple-Challenge' header so that iTunes can check if the receiving device is legit. We do send the header, but we don't check the challenge response.
* _ANNOUNCE_: Among other things, we send an AES key and an IV (injection vector). The AES key is encrypted with a public RSA key shared by all AirTunes device. For simplicity's sake, we always use the same key/IV.
* _SETUP_: We send UDP ports for control and timing. These ports are chosen before the handshake starts. The device replies with ports of its own.
* _RECORD_: During record, we send the initial sequence and RTP time. These values allow devices to synchronize themselves.
* _SET_PARAMETER_: Used to change the volume.
* _TEARDOWN_: Used to terminate the connection.

The RTSP socket stays open during the whole audio session. Since everything else is tranferred with UDP, closing the RTSP socket is the easiest way of terminating the session.

### UDP Ports

AirTunes v2 uses [RTP](http://en.wikipedia.org/wiki/Real-time_Transport_Protocol), which needs several UDP ports to transmit information. The ports are exchanged during the SETUP query.

On the client (us):

* Control: Used to send synchronization events and to receive information about resend packets.
* Timing: Devices send queries to this port to synchronize their clocks with the client. The format follows [NTP](http://en.wikipedia.org/wiki/Network_Time_Protocol).

On the device:

* Control: every second, the client sends a synchronization message to all devices. This message contains the current time and says: "you should be playing the packet with this timestamp" right now.
* Timing: the port where we send timing replies.
* Audio: Where we send the audio stream.

Each port has a preferred value (starting from UDP/6002). However, since ports can be used by other applications, we keep trying ports until we can bind both the control and the timing sockets. The sockets are bound only when there are active AirTunes devices.

### Audio Streaming

Now we get to the fun part. As stated earlier, the input audio must be 16bits, little-endian, stereo PCM. The stream is first split in chunks by the circular buffer, each chunk containing exactly 352 frames. It then compressed with [Apple Lossless](http://fr.wikipedia.org/wiki/Apple_Lossless) and encrypted with AES. The AES key is sent to devices during the _ANNOUNCE_ query. We use native code to compress and encrypt packets.

The packets are then sent periodically. Since we have no congestion control, we must take great care to send packets at the right time. To achieve this, we trigger a timeout every 'config.stream_latency' ms. At each iteration, we compute the sequence number of the packet that we should be sending right now and we catch-up by sending in a burst all the packets that should have been sent since the last iteration. A higher latency reduces the CPU usage, but results in larger UDP bursts.

