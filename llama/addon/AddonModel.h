#pragma once
#include "llama.h"
#include "napi.h"
#include "addonGlobals.h"
#include "globals/addonProgress.h"

class AddonModel : public Napi::ObjectWrap<AddonModel> {
    public:
        llama_model_params model_params;
        llama_model* model;
        uint64_t loadedModelSize;
        Napi::Reference<Napi::Object> addonExportsRef;
        bool hasAddonExportsRef;
        AddonModelData* data;

        std::string modelPath;
        bool modelLoaded;
        bool abortModelLoad;
        bool model_load_stopped;
        float rawModelLoadPercentage;
        unsigned modelLoadPercentage;
        AddonThreadSafeProgressEventCallbackFunction addonThreadSafeOnLoadProgressEventCallback;
        bool onLoadProgressEventCallbackSet;
        bool hasLoadAbortSignal;

        bool disposed;

        AddonModel(const Napi::CallbackInfo& info);
        ~AddonModel();
        void dispose();

        Napi::Value Init(const Napi::CallbackInfo& info);
        Napi::Value LoadLora(const Napi::CallbackInfo& info);
        Napi::Value AbortActiveModelLoad(const Napi::CallbackInfo& info);
        Napi::Value Dispose(const Napi::CallbackInfo& info);
        Napi::Value Tokenize(const Napi::CallbackInfo& info);
        Napi::Value Detokenize(const Napi::CallbackInfo& info);
        Napi::Value GetTrainContextSize(const Napi::CallbackInfo& info);
        Napi::Value GetEmbeddingVectorSize(const Napi::CallbackInfo& info);
        Napi::Value GetTotalSize(const Napi::CallbackInfo& info);
        Napi::Value GetTotalParameters(const Napi::CallbackInfo& info);
        Napi::Value GetModelDescription(const Napi::CallbackInfo& info);

        Napi::Value TokenBos(const Napi::CallbackInfo& info);
        Napi::Value TokenEos(const Napi::CallbackInfo& info);
        Napi::Value TokenNl(const Napi::CallbackInfo& info);
        Napi::Value PrefixToken(const Napi::CallbackInfo& info);
        Napi::Value MiddleToken(const Napi::CallbackInfo& info);
        Napi::Value SuffixToken(const Napi::CallbackInfo& info);
        Napi::Value EotToken(const Napi::CallbackInfo& info);
        Napi::Value GetTokenString(const Napi::CallbackInfo& info);

        Napi::Value GetTokenAttributes(const Napi::CallbackInfo& info);
        Napi::Value IsEogToken(const Napi::CallbackInfo& info);
        Napi::Value GetVocabularyType(const Napi::CallbackInfo& info);
        Napi::Value ShouldPrependBosToken(const Napi::CallbackInfo& info);
        Napi::Value GetModelSize(const Napi::CallbackInfo& info);

        static void init(Napi::Object exports);
};