#include <node.h>
#include <node_buffer.h>
#include <v8.h>
#include <cstring>
#include <openssl/aes.h>
#include <openssl/engine.h>
#include <openssl/rand.h>

extern "C" {
#include "aes_utils.h"
}

#include "base64.h"

#include "../alac/ALACEncoder.h"
#include "../alac/ALACBitUtilities.h"

using namespace v8;
using namespace node;

static int kBlockSize = 16;
static int kFramesPerPacket = 352;

// These values should be changed at each iteration
static uint8_t iv [] = { 0x78, 0xf4, 0x41, 0x2c, 0x8d, 0x17, 0x37, 0x90, 0x2b, 0x15, 0xa6, 0xb3, 0xee, 0x77, 0x0d, 0x67 };
static uint8_t aes_key [] = { 0x14, 0x49, 0x7d, 0xcc, 0x98, 0xe1, 0x37, 0xa8, 0x55, 0xc1, 0x45, 0x5a, 0x6b, 0xc0, 0xc9, 0x79 };

namespace nodeairtunes {

void FillInputAudioFormat(AudioFormatDescription *format) {
  format->mFormatID = kALACFormatLinearPCM;
  format->mSampleRate = 44100;
  format->mFormatFlags = 12;

  format->mBytesPerPacket = 4;
  format->mBytesPerFrame = 4;
  format->mBitsPerChannel = 16;
  format->mChannelsPerFrame = 2;
  format->mFramesPerPacket = 1;

  format->mReserved = 0;
}

void FillOutputAudioFormat(AudioFormatDescription *format) {
  format->mFormatID = kALACFormatAppleLossless;
  format->mSampleRate = 44100;
  format->mFormatFlags = 1;

  format->mBytesPerPacket = 0;
  format->mBytesPerFrame = 0;
  format->mBitsPerChannel = 0;
  format->mChannelsPerFrame = 2;
  format->mFramesPerPacket = kFramesPerPacket;

  format->mReserved = 0;
}

void encoder_weak_callback (Persistent<Value> wrapper, void *arg) {
  HandleScope scope;
  ALACEncoder *encoder = (ALACEncoder *)arg;
  delete encoder;
  wrapper.Dispose();
}

// Creates a new encoder instance and wraps it in a JavaScript object.
// This encoder is freed when the object is released by the GC.
Handle<Value> NewEncoder(const Arguments& args) {
  HandleScope scope;

  AudioFormatDescription outputFormat;
  FillOutputAudioFormat(&outputFormat);

  ALACEncoder *encoder = new ALACEncoder();

  encoder->SetFrameSize(kFramesPerPacket);
  encoder->InitializeEncoder(outputFormat);

  Persistent<ObjectTemplate> encoderClass = Persistent<ObjectTemplate>::New(ObjectTemplate::New());
  encoderClass->SetInternalFieldCount(1);
  Persistent<Object> o = Persistent<Object>::New(encoderClass->NewInstance());
  o->SetPointerInInternalField(0, encoder);
  o.MakeWeak(encoder, encoder_weak_callback);

  return scope.Close(o);
}

Handle<Value> EncodeALAC(const Arguments& args) {
  HandleScope scope;

  if(args.Length() < 4) {
    printf("expected: EncodeALAC(encoder, pcmData, pcmSize, alacData, alacSize)\n");
    return scope.Close(Null());
  }

  Local<Object>wrapper = args[0]->ToObject();
  ALACEncoder *encoder = (ALACEncoder*)wrapper->GetPointerFromInternalField(0);

  Local<Value> pcmBuffer = args[1];
  unsigned char* pcmData = (unsigned char*)Buffer::Data(pcmBuffer->ToObject());

  Local<Value> alacBuffer = args[2];
  unsigned char* alacData = (unsigned char*)Buffer::Data(alacBuffer->ToObject());

  int32_t pcmSize = args[3]->Int32Value();

  AudioFormatDescription inputFormat, outputFormat;
  FillInputAudioFormat(&inputFormat);
  FillOutputAudioFormat(&outputFormat);

  int32_t alacSize = pcmSize;
  encoder->Encode(inputFormat, outputFormat, pcmData, alacData, &alacSize);

  return scope.Close(Integer::New(alacSize));
}

Handle<Value> EncryptAES(const Arguments& args) {
  HandleScope scope;

  if(args.Length() < 2) {
    printf("expected: EncryptAES(alacData, alacSize)\n");
    return scope.Close(Null());
  }

  Local<Value> alacBuffer = args[0];
  unsigned char* alacData = (unsigned char*)Buffer::Data(alacBuffer->ToObject());
  int32_t alacSize = args[1]->Int32Value();

  // This will encrypt data in-place
  uint8_t *buf;
  int i = 0, j;
  uint8_t nv[kBlockSize];

  aes_context ctx;
  aes_set_key(&ctx, aes_key, 128);
  memcpy(nv, iv, kBlockSize);

  while(i + kBlockSize <= alacSize) {
    buf = alacData + i;

    for(j = 0; j < kBlockSize; j++)
      buf[j] ^= nv[j];

    aes_encrypt(&ctx, buf, buf);
    memcpy(nv, buf, kBlockSize);

    i += kBlockSize;
  }

  return scope.Close(Null());
}

void InitCodec(Handle<Object> target) {
  NODE_SET_METHOD(target, "encodeALAC", EncodeALAC);
  NODE_SET_METHOD(target, "encryptAES", EncryptAES);
  NODE_SET_METHOD(target, "newEncoder", NewEncoder);
}

} // nodeairtunes namespace
