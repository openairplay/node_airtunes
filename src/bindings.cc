#include <v8.h>
#include <node.h>

using namespace v8;
using namespace node;

namespace nodeairtunes {

void InitCodec(Handle<Object>);
#ifdef __APPLE__
void InitCoreAudio(Handle<Object>);
#endif

void Initialize(Handle<Object> target) {
  HandleScope scope;

  InitCodec(target);
#ifdef __APPLE__
  InitCoreAudio(target);
#endif
}

} // nodeairtunes namespace

NODE_MODULE(airtunes, nodeairtunes::Initialize);
