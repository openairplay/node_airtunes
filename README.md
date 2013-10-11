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
* `play_ffmpeg.js` harnesses ffmpeg to stream from local audio files or remote URLs.
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
AirTunes receivers (like Apple's AirPort Express or AirFoil Speakers).

What about Core Audio ?
-----------------------

Core Audio is the name Apple gives to iOS/OS X low-level sound API. node-airtunes has bindings to Core Audio to allow synchronized local and remote playback (local sync is not perfect yet). Obviously, this will only work on OS X.

Credits
-------

- [The Airtunes 2 Team](http://git.zx2c4.com/Airtunes2/about/)
- Cl&eacute;ment Vasseur for [Air Speaker](https://github.com/nto/AirSpeaker)
- [Rogue Amoeba Software, LLC](http://www.rogueamoeba.com/) for AirFoil
- Julien Blache for this [blog post](http://blog.technologeek.org/airtunes-v2)
- Apple Inc and [Apple Lossless Audio Codec](http://alac.macosforge.org/)

Usage
-----

### Build

`node-gyp configure build`

### Playback

`airtunes` is a writable stream which accepts 16 bits, little-endian, stereo PCM data.

```javascript
var airtunes = require('airtunes');
myPCMStream.pipe(airtunes);
```

There is an internal circular buffer which allows to stream from a network source. The stream will ouput audio at the correct pace and  will pause/resume accordingly. `airtunes` emits 'buffer' events to help you monitor the buffer:

* `'buffering'`: Silence is being played while the buffer fills with data.
* `'playing'`: Real sound is being streamed to devices.
* `'end'`: The buffer was closed by the input stream. Attempting to write more data will raise an exception.

After an `end` event, you should close all devices with `airtunes.stopAll()` 2s later (AirTunes devices usually have a 2s delay). If you want to pipe several successive streams to airtunes, just pass `{end: false}` to `stream.pipe`.

### AirTunes Devices

You can add devices at any time: sound will be synchronized between all devices. The second parameter is optional:

```javascript
var device = airtunes.add(host, {
  port: 5000,
  volume: 100,
  password: 'mypassword'
});
```

* `host` and `port` are the location of the AirTunes device as reported by Zeroconf. The default port is 5000.
* `volume` is the initial volume, which must be between 0 and 100. The default volume is 50.
* AirTunes makes it possible to protect devices with a `password`, which is of course optional. Bonjour indicates if the device demands a password.

AirTunes devices emit `'status'` events:

* `'ready'`: The device connected and ready to stream.
* `'stopped'`: The device was stopped and has been removed from the pool.

They also emit `'error'` events. After an error, a device will no longer emit any events.

* `'timeout'`: The device did not reply within `'config.rtsp_timeout'`.
* `'connection_refused'`: The device refused the connection on the given port.
* `'busy'`: Another application is already streaming to this device.
* `'disconnected'`: The device closed the connection. This usually happens at the user's request.
* `'need_password'`: The device demands a password, but none was passed.
* `'bad_password'`: The device refused the given password.
* `'udp_ports'`: Could not bind UDP ports (these are required by AirPort v2).
* `'rtsp_socket'`: Another unhandled RTSP error.

You can stop a device with:

```javascript
device.stop(function() {
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

Volume must be between 0 and 100.

```
device.setVolume(volume);
```

Support
-------

Node-airtunes was tested on the following devices:

* AirPort Express
* AirFoil Speakers
* Air Speaker
* Freebox Server
* Apple TV
* Zeppelin Air
* Raspberry PI

Ping me to add more devices to this list.

Known Issues
------------

While synchronization works nicely with AirTunes devices, there are sometimes problems with Core Audio.

License
-------

node-airtunes is available under the BSD license.

How does it work ?
------------------

If you want detailed information about AirTunes v2, you should read the excellent documentation written by the [Airtunes 2 Team](http://git.zx2c4.com/Airtunes2/about/). I'm including theses short explanations for those not familiar with audio streaming in general.

While being promoted as a proprietary protocol, AirTunes is really built on several existing protocols (RTSP, RTP and NTP) with several quirks. Not reinventing the wheel is a good thing.

### RTSP Handshake

AirTunes starts with an RTSP negociation. it is an HTTP-like protocol. The major difference being that it uses different verbs. Several successive requests are made to exchange parameters tneeded later. The `'status' = 'ready'` event is emitted when this handshake successfully completes.

We follow this sequence:

* `OPTIONS`: Apple added a proprietary `'Apple-Challenge'` header so that iTunes can check if the receiving device is legit. We do send the header, but we don't check the challenge response.
* `ANNOUNCE`: Among other things, we send an AES key and an IV (injection vector). The AES key is encrypted with a public RSA key shared by all AirTunes device. It is used to encrypt the audio packets. For simplicity's sake, we always use the same key/IV.
* `SETUP`: We send UDP ports for control and timing. These ports are chosen before the handshake starts. The device replies with ports of its own.
* `RECORD`: During record, we send the initial sequence and RTP time. These values allow devices to synchronize themselves.
* `SET_PARAMETER`: Used to change the volume.
* `TEARDOWN`: Used to terminate the connection. The stop callback is called when the device replies to this query.

The RTSP socket stays open during the whole audio session. Since everything else is tranferred with UDP, closing this socket is the easiest way of letting the other peer know that the session is finished.

### UDP Ports

AirTunes v2 uses [RTP](http://en.wikipedia.org/wiki/Real-time_Transport_Protocol), which needs several UDP ports to transmit information. The ports are exchanged during the `SETUP` query.

On the client (us):

* Control: Used to send synchronization events and to receive information about resend packets.
* Timing: Devices send queries to this port to synchronize their clocks with the client. The format follows [NTP](http://en.wikipedia.org/wiki/Network_Time_Protocol).

On the device:

* Control: every second, the client sends a synchronization message to all devices. This message contains the current time and says: "you should be playing the packet with this timestamp right now".
* Timing: the port where we send timing replies.
* Audio: Where we send the audio stream.

Each port has a preferred value (starting from UDP/6002). Since ports can be used by other applications, we test increasing port numbers until we can bind both the control and the timing sockets. The sockets are bound only when there are active AirTunes devices.

### Audio Streaming

The stream is first split in chunks by the circular buffer, each chunk containing exactly 352 frames. A PCM frame is just a single sample. We have 16 bits and 2 channels, so this translates into 4 bytes (chunks are 1408 bytes long).

It is then compressed with [Apple Lossless](http://fr.wikipedia.org/wiki/Apple_Lossless), which was made public by Apple. The ALAC packet is then encrypted with AES. The key is chosen by the client and sent to devices during the `ANNOUNCE` query. We use native code to compress and encrypt packets. A gotcha: AES works by encrypting 16-byte chunks and the remaining bytes are not encrypted.

Since we have no congestion control (UDP, remember), packets must be sent at the right time. There are 44,100 frames per second, so we need to send around 125 packets per second. Ideally, we should send a packet every 7-8 ms, but node.js's timing is not reliable at this precision. To make it work, we trigger a timeout every `config.stream_latency` ms. At each iteration, we compute the sequence number of the packet that we should be sending right now and we catch-up by sending in a burst all the packets that should have been sent since the last iteration. A higher latency reduces the CPU usage, but results in larger UDP bursts.

