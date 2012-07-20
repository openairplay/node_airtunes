#include <node.h>
#include <node_buffer.h>
#include <v8.h>
//Includes from phoenixLib iOS HAL
#include <stdio.h>
#include <time.h>
#include <stdlib.h>
#include <unistd.h>
#include <stdarg.h>
#include <AudioToolbox/AudioToolbox.h>
#include <CoreFoundation/CoreFoundation.h>
#include "CAHostTimeBase.h"
#include <pthread.h>
#include <sys/resource.h>

#define FRAME_SIZE 1408
#define NUMBER_OF_BUFFERS 100
#define BUFFER_SIZE FRAME_SIZE * 4

//using namespace v8;
using namespace node;

namespace nodeairtunes {

  struct coreAudioObjects {
    AudioQueueRef audioQueue;

    unsigned int fillBufferIndex; // the index of the audioQueueBuffer that is being filled

    size_t bytesFilled; // how many bytes have been filled

    AudioQueueBufferRef audioQueueBuffer[NUMBER_OF_BUFFERS]; // audio queue buffers
    bool inuse[NUMBER_OF_BUFFERS]; // flags to indicate that a buffer is still in use

    bool isPlaying;
    unsigned int buffersUsed;

    OSStatus err;

    pthread_mutex_t queueBuffersMutex; // a mutex to protect the inuse flags
    pthread_cond_t queueBufferReadyCondition; // a condition varable for handling the inuse flags

  };

  // This will free the AudioQueue when the wraping JS object is released by the GC
  void coreAudio_weak_callback(v8::Persistent<v8::Value> wrapper, void *arg) {
    v8::HandleScope scope;
    struct coreAudioObjects *coreAudio = (struct coreAudioObjects *) arg;
    AudioQueueDispose(coreAudio->audioQueue, true);
    wrapper.Dispose();
  }

  void OnAudioQueueBufferConsumed(void *inUserData, AudioQueueRef inAQ, AudioQueueBufferRef inBuffer) {
    struct coreAudioObjects* coreAudio;
    coreAudio = (struct coreAudioObjects*) inUserData;

    int bufIndex = -1;
    for (unsigned int i = 0; i < NUMBER_OF_BUFFERS; i++) {
      if (inBuffer == coreAudio->audioQueueBuffer[i]) {
        bufIndex = i;
        break;
      }
    }

    if (bufIndex == -1) {
      pthread_mutex_lock(&(coreAudio->queueBuffersMutex));
      pthread_cond_signal(&(coreAudio->queueBufferReadyCondition));
      pthread_mutex_unlock(&(coreAudio->queueBuffersMutex));
      //DEBUG_AUDIOMANAGER_ERROR("Buffer mismatch !");
      return;
    }
    // signal waiting thread that the buffer is free.
    pthread_mutex_lock(&(coreAudio->queueBuffersMutex));
    coreAudio->inuse[bufIndex] = false;
    coreAudio->buffersUsed--;
    pthread_cond_signal(&(coreAudio->queueBufferReadyCondition));
    pthread_mutex_unlock(&(coreAudio->queueBuffersMutex));
  }

  static void enqueueBuffer(struct coreAudioObjects *coreAudio) {

    OSStatus err = 0;

    // enqueue buffer
    pthread_mutex_lock(&(coreAudio->queueBuffersMutex));

    AudioQueueBufferRef fillBuf = coreAudio->audioQueueBuffer[coreAudio->fillBufferIndex];
    fillBuf->mAudioDataByteSize = coreAudio->bytesFilled;
    err = AudioQueueEnqueueBuffer(coreAudio->audioQueue, fillBuf, 0, NULL);
    if (err) {
      //DEBUG_AUDIOMANAGER_ERROR("enqueue failed !!!!! %d", coreAudio->fillBufferIndex);
      coreAudio->bytesFilled = 0;
      pthread_mutex_unlock(&(coreAudio->queueBuffersMutex));
      return;
    }

    coreAudio->inuse[coreAudio->fillBufferIndex] = true; // set in use flag
    coreAudio->buffersUsed++;

    // go to next buffer
    if (++(coreAudio->fillBufferIndex) >= NUMBER_OF_BUFFERS) coreAudio->fillBufferIndex = 0;

    coreAudio->bytesFilled = 0; // reset bytes filled

    // wait until next buffer is not in use
    while (coreAudio->inuse[coreAudio->fillBufferIndex]) {
      pthread_cond_wait(&(coreAudio->queueBufferReadyCondition), &(coreAudio->queueBuffersMutex));
    }

    pthread_mutex_unlock(&(coreAudio->queueBuffersMutex));
  }

  v8::Handle<v8::Value> NewCoreAudio(const v8::Arguments& args) {
    v8::HandleScope scope;

    struct coreAudioObjects *coreAudio = (struct coreAudioObjects *) malloc(sizeof (*coreAudio));
    v8::Persistent<v8::ObjectTemplate> coreAudioClass = v8::Persistent<v8::ObjectTemplate>::New(v8::ObjectTemplate::New());
    coreAudioClass->SetInternalFieldCount(1);
    v8::Persistent<v8::Object> o = v8::Persistent<v8::Object>::New(coreAudioClass->NewInstance());
    o->SetPointerInInternalField(0, coreAudio);
    o.MakeWeak(coreAudio, coreAudio_weak_callback);

    coreAudio->isPlaying = false;
    coreAudio->buffersUsed = 0;
    coreAudio->bytesFilled = 0;
    coreAudio->fillBufferIndex = 0;
    // initialize a mutex and condition so that we can block on buffers in use.
    pthread_mutex_init(&(coreAudio->queueBuffersMutex), NULL);
    pthread_cond_init(&(coreAudio->queueBufferReadyCondition), NULL);

    AudioStreamBasicDescription LFormat;
    OSStatus LRet;

    LFormat.mSampleRate = 44100;
    LFormat.mFormatID = kAudioFormatLinearPCM;
    LFormat.mFormatFlags = kAudioFormatFlagIsSignedInteger; // signed int
    LFormat.mFramesPerPacket = 1; // for uncompressed audio 
    LFormat.mBytesPerFrame = 4; //AChannels * 2; // interleaved pcm datas (16bits per chan)
    LFormat.mBytesPerPacket = 4; // for pcm: a packet contains a single frame
    LFormat.mChannelsPerFrame = 2;
    LFormat.mBitsPerChannel = 16;

    // Allocating AudioQueue

    if ((LRet = AudioQueueNewOutput(&LFormat, OnAudioQueueBufferConsumed, coreAudio, NULL, NULL, 0, &(coreAudio->audioQueue)))) {
      return scope.Close(v8::Null());
    }

    OSStatus status = 0;

    // Allocate buffers for the AudioQueue 
    for (int i = 0; i < NUMBER_OF_BUFFERS; ++i) {
      status = AudioQueueAllocateBuffer(coreAudio->audioQueue, BUFFER_SIZE, &(coreAudio->audioQueueBuffer[i]));
      coreAudio->inuse[i] = false;
    }

    return scope.Close(o);
  }

  v8::Handle<v8::Value> EnqueuePacket(const v8::Arguments& args) {
    v8::HandleScope scope;

    if (args.Length() < 3) {
      printf("expected: EnqueuePacket(coreAudio, pcmData, pcmSize)\n");
      return scope.Close(v8::Null());
    }

    v8::Local<v8::Object>wrapper = args[0]->ToObject();
    struct coreAudioObjects *coreAudio = (struct coreAudioObjects *) wrapper->GetPointerFromInternalField(0);

    v8::Local<v8::Value> pcmBuffer = args[1];
    unsigned char* pcmData = (unsigned char*) (Buffer::Data(pcmBuffer->ToObject()));

    int32_t pcmSize = args[2]->Int32Value();

    //We have all infos needed

    size_t offset = 0;
    while (pcmSize) {
      // if the space remaining in the buffer is not enough for this packet, then enqueue the buffer.
      size_t bufSpaceRemaining = BUFFER_SIZE - coreAudio->bytesFilled;
      if (bufSpaceRemaining < pcmSize) {
        //DEBUG_AUDIOMANAGER_VERBOSE("Before enqueue");
        enqueueBuffer(coreAudio);
        //DEBUG_AUDIOMANAGER_VERBOSE("After enqueue");
      }

      bufSpaceRemaining = BUFFER_SIZE - coreAudio->bytesFilled;
      size_t copySize;
      if (bufSpaceRemaining < pcmSize) {
        copySize = bufSpaceRemaining;
      } else {
        copySize = pcmSize;
      }

      // copy data to the audio queue buffer
      AudioQueueBufferRef fillBuf = coreAudio->audioQueueBuffer[coreAudio->fillBufferIndex];
      memcpy((char*) fillBuf->mAudioData + coreAudio->bytesFilled, (const char*) (pcmData + offset), copySize);

      // keep track of bytes filled and packets filled
      coreAudio->bytesFilled += copySize;

      pcmSize -= copySize;
      offset += copySize;
    }

    return scope.Close(v8::Null());
  }

  v8::Handle<v8::Value> Play(const v8::Arguments& args) {
    v8::HandleScope scope;

    if (args.Length() < 2) {
      printf("expected: Play(coreAudio, audioQueueTimeRef)\n");
      return scope.Close(v8::Null());
    }

    v8::Local<v8::Object>wrapper = args[0]->ToObject();
    struct coreAudioObjects *coreAudio = (struct coreAudioObjects *) wrapper->GetPointerFromInternalField(0);

    int64_t timeStamp = args[1]->IntegerValue();

    AudioTimeStamp myAudioQueueStartTime = {0};
    Float64 theNumberOfSecondsInTheFuture = timeStamp/44100.0;

    Float64 hostTimeFreq = CAHostTimeBase::GetFrequency();
    UInt64 startHostTime = CAHostTimeBase::GetCurrentTime() + theNumberOfSecondsInTheFuture * hostTimeFreq;

    myAudioQueueStartTime.mFlags = kAudioTimeStampHostTimeValid;
    myAudioQueueStartTime.mHostTime = startHostTime;

    if (coreAudio->isPlaying == false) {
      if (AudioQueueStart(coreAudio->audioQueue, &myAudioQueueStartTime)) {
        printf("AudioQueueStart() Failed!\n");
      } else {
        coreAudio->isPlaying = true;
      }
    }

    return scope.Close(v8::Null());
  }

  v8::Handle<v8::Value> Stop(const v8::Arguments& args) {
    v8::HandleScope scope;

    if (args.Length() < 1) {
      printf("expected: Play(coreAudio)\n");
      return scope.Close(v8::Null());
    }

    v8::Local<v8::Object>wrapper = args[0]->ToObject();
    struct coreAudioObjects *coreAudio = (struct coreAudioObjects *) wrapper->GetPointerFromInternalField(0);

    if (coreAudio->isPlaying) {
      if (AudioQueueStop(coreAudio->audioQueue, true)) {
        printf("AudioQueueStop() Failed!\n");
      } else {
        coreAudio->isPlaying = false;
      }
    }

    return scope.Close(v8::Null());
  }

  v8::Handle<v8::Value> SetVolume(const v8::Arguments& args) {
    v8::HandleScope scope;

    if (args.Length() < 1) {
      printf("expected: Play(coreAudio)\n");
      return scope.Close(v8::Null());
    }

    v8::Local<v8::Object>wrapper = args[0]->ToObject();
    struct coreAudioObjects *coreAudio = (struct coreAudioObjects *) wrapper->GetPointerFromInternalField(0);
    float volumeToSet=args[1]->IntegerValue()/100.0;

    if (coreAudio->isPlaying)
      AudioQueueSetParameter(coreAudio->audioQueue, kAudioQueueParam_Volume, volumeToSet);

    return scope.Close(v8::Null());
  }
  
  v8::Handle<v8::Value> GetBufferLevel(const v8::Arguments& args) {
    v8::HandleScope scope;
    v8::Local<v8::Object>wrapper = args[0]->ToObject();
    struct coreAudioObjects *coreAudio = (struct coreAudioObjects *) wrapper->GetPointerFromInternalField(0);
    v8::Handle<v8::Integer> o= v8::Integer::New((int)((coreAudio->buffersUsed/(float)NUMBER_OF_BUFFERS)*100));

    return scope.Close(o);
  }

  void InitCoreAudio(v8::Handle<v8::Object> target) {
    NODE_SET_METHOD(target, "enqueuePacket", EnqueuePacket);
    NODE_SET_METHOD(target, "newCoreAudio", NewCoreAudio);
    NODE_SET_METHOD(target, "play", Play);
    NODE_SET_METHOD(target, "stop", Stop);
    NODE_SET_METHOD(target, "setVolume", SetVolume);
    NODE_SET_METHOD(target, "getBufferLevel", GetBufferLevel);
  }

} // nodeairtunes namespace
