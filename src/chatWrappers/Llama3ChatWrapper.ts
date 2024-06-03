import {ChatWrapper} from "../ChatWrapper.js";
import {
    ChatModelFunctions, ChatWrapperGenerateContextStateOptions, ChatWrapperGeneratedContextState, ChatWrapperSettings
} from "../types.js";
import {SpecialToken, LlamaText, SpecialTokensText} from "../utils/LlamaText.js";
import {ChatModelFunctionsDocumentationGenerator} from "./utils/ChatModelFunctionsDocumentationGenerator.js";

// source: https://github.com/meta-llama/llama-recipes/blob/79aa70442e97c3127e53c2d22c54438c32adcf5e/README.md
// source: https://llama.meta.com/docs/model-cards-and-prompt-formats/meta-llama-3/
export class Llama3ChatWrapper extends ChatWrapper {
    public readonly wrapperName: string = "Llama3Chat";

    public override readonly settings: ChatWrapperSettings = {
        supportsSystemMessages: true,
        functions: {
            call: {
                optionalPrefixSpace: true,
                prefix: "[[call: ",
                paramsPrefix: "(",
                suffix: ")]]"
            },
            result: {
                prefix: " [[result: ",
                suffix: "]]"
            }
        }
    };

    public override generateContextState({
        chatHistory, availableFunctions, documentFunctionParams
    }: ChatWrapperGenerateContextStateOptions): ChatWrapperGeneratedContextState {
        const historyWithFunctions = this.addAvailableFunctionsSystemMessageToHistory(chatHistory, availableFunctions, {
            documentParams: documentFunctionParams
        });

        const resultItems: Array<{
            system: LlamaText | null,
            user: LlamaText | null,
            model: LlamaText | null
        }> = [];

        let systemTexts: LlamaText[] = [];
        let userTexts: LlamaText[] = [];
        let modelTexts: LlamaText[] = [];
        let currentAggregateFocus: "system" | "user" | "model" | null = null;

        function flush() {
            if (systemTexts.length > 0 || userTexts.length > 0 || modelTexts.length > 0)
                resultItems.push({
                    system: systemTexts.length === 0
                        ? null
                        : LlamaText.joinValues("\n\n", systemTexts),
                    user: userTexts.length === 0
                        ? null
                        : LlamaText.joinValues("\n\n", userTexts),
                    model: modelTexts.length === 0
                        ? null
                        : LlamaText.joinValues("\n\n", modelTexts)
                });

            systemTexts = [];
            userTexts = [];
            modelTexts = [];
        }

        for (const item of historyWithFunctions) {
            if (item.type === "system") {
                if (currentAggregateFocus !== "system")
                    flush();

                currentAggregateFocus = "system";
                systemTexts.push(LlamaText.fromJSON(item.text));
            } else if (item.type === "user") {
                if (currentAggregateFocus !== "user")
                    flush();

                currentAggregateFocus = "user";
                userTexts.push(LlamaText(item.text));
            } else if (item.type === "model") {
                if (currentAggregateFocus !== "model")
                    flush();

                currentAggregateFocus = "model";
                modelTexts.push(this.generateModelResponseText(item.response));
            } else
                void (item satisfies never);
        }

        flush();

        const contextText = LlamaText(
            new SpecialToken("BOS"),
            resultItems.map((item, index) => {
                const isLastItem = index === resultItems.length - 1;
                const res: LlamaText[] = [];

                if (item.system != null) {
                    res.push(
                        LlamaText([
                            new SpecialTokensText("<|start_header_id|>system<|end_header_id|>\n\n"),
                            item.system,
                            new SpecialToken("EOT")
                        ])
                    );
                }

                if (item.user != null) {
                    res.push(
                        LlamaText([
                            new SpecialTokensText("<|start_header_id|>user<|end_header_id|>\n\n"),
                            item.user,
                            new SpecialToken("EOT")
                        ])
                    );
                }

                if (item.model != null) {
                    res.push(
                        LlamaText([
                            new SpecialTokensText("<|start_header_id|>assistant<|end_header_id|>\n\n"),
                            item.model,
                            isLastItem
                                ? LlamaText([])
                                : new SpecialToken("EOT")
                        ])
                    );
                }

                // void (item satisfies never);
                return LlamaText(res);
            })
        );

        return {
            contextText,
            stopGenerationTriggers: [
                LlamaText(new SpecialToken("EOS")),
                LlamaText(new SpecialToken("EOT")),
                LlamaText("<|eot_id|>"),
                LlamaText("<|end_of_text|>")
            ]
        };
    }

    public override generateAvailableFunctionsSystemText(availableFunctions: ChatModelFunctions, {documentParams = true}: {
        documentParams?: boolean
    }) {
        const functionsDocumentationGenerator = new ChatModelFunctionsDocumentationGenerator(availableFunctions);

        if (!functionsDocumentationGenerator.hasAnyFunctions)
            return LlamaText([]);

        return LlamaText.joinValues("\n", [
            "The assistant calls the provided functions as needed to retrieve information instead of relying on existing knowledge.",
            "To fulfill a request, the assistant calls relevant functions in advance when needed before responding to the request, and does not tell the user prior to calling a function.",
            "Provided functions:",
            "```typescript",
            functionsDocumentationGenerator.getTypeScriptFunctionSignatures({documentParams}),
            "```",
            "",
            "Calling any of the provided functions can be done like this:",
            this.generateFunctionCall("functionName", {someKey: "someValue"}),
            "",
            "After calling a function the raw result is written afterwards, and a natural language version of the result is written afterwards."
        ]);
    }
}
