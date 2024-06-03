import {ChatWrapper} from "../ChatWrapper.js";
import {
    ChatHistoryItem, ChatModelFunctions, ChatWrapperGenerateContextStateOptions, ChatWrapperGeneratedContextState, ChatWrapperSettings,
    isChatModelResponseFunctionCall
} from "../types.js";
import {SpecialToken, LlamaText, SpecialTokensText} from "../utils/LlamaText.js";
import {ChatModelFunctionsDocumentationGenerator} from "./utils/ChatModelFunctionsDocumentationGenerator.js";

// source: https://github.com/MeetKai/functionary/blob/main/tests/prompt_test_v2.txt
export class FunctionaryChatWrapper extends ChatWrapper {
    public readonly wrapperName: string = "Functionary";

    public override readonly settings = {
        supportsSystemMessages: true,
        functions: {
            call: {
                optionalPrefixSpace: true,
                prefix: LlamaText(new SpecialTokensText("\n<|from|>assistant\n<|recipient|>")),
                paramsPrefix: LlamaText(new SpecialTokensText("\n<|content|>")),
                suffix: ""
            },
            result: {
                prefix: LlamaText([
                    new SpecialTokensText("\n<|from|>"),
                    "{{functionName}}",
                    new SpecialTokensText("\n<|recipient|>all\n<|content|>")
                ]),
                suffix: ""
            },
            parallelism: {
                call: {
                    sectionPrefix: "",
                    betweenCalls: "\n",
                    sectionSuffix: LlamaText(new SpecialTokensText("<|stop|>"))
                },
                result: {
                    sectionPrefix: "",
                    betweenResults: "",
                    sectionSuffix: ""
                }
            }
        }
    } satisfies ChatWrapperSettings;

    public override generateContextState({
        chatHistory, availableFunctions, documentFunctionParams
    }: ChatWrapperGenerateContextStateOptions): ChatWrapperGeneratedContextState {
        const hasFunctions = Object.keys(availableFunctions ?? {}).length > 0;

        const historyWithFunctions = this.addAvailableFunctionsSystemMessageToHistory(chatHistory, availableFunctions, {
            documentParams: documentFunctionParams
        });

        const contextText = LlamaText(
            new SpecialToken("BOS"),
            historyWithFunctions.map((item, index) => {
                const isFirstItem = index === 0;
                const isLastItem = index === historyWithFunctions.length - 1;

                if (item.type === "system") {
                    if (item.text.length === 0)
                        return "";

                    return LlamaText([
                        isFirstItem
                            ? LlamaText([])
                            : new SpecialTokensText("\n"),
                        new SpecialTokensText("<|from|>system\n"),
                        new SpecialTokensText("<|recipient|>all\n"),
                        new SpecialTokensText("<|content|>"),
                        LlamaText.fromJSON(item.text)
                    ]);
                } else if (item.type === "user") {
                    return LlamaText([
                        isFirstItem
                            ? LlamaText([])
                            : new SpecialTokensText("\n"),
                        new SpecialTokensText("<|from|>user\n"),
                        new SpecialTokensText("<|recipient|>all\n"),
                        new SpecialTokensText("<|content|>"),
                        item.text
                    ]);
                } else if (item.type === "model") {
                    if (isLastItem && item.response.length === 0 && !hasFunctions)
                        return LlamaText([
                            isFirstItem
                                ? LlamaText([])
                                : new SpecialTokensText("\n"),
                            new SpecialTokensText("<|from|>assistant\n"),
                            new SpecialTokensText("<|recipient|>all\n"),
                            new SpecialTokensText("<|content|>")
                        ]);

                    const res: LlamaText[] = [];
                    const pendingFunctionCalls: LlamaText[] = [];
                    const pendingFunctionResults: LlamaText[] = [];

                    const addPendingFunctions = () => {
                        if (pendingFunctionResults.length === 0)
                            return;

                        res.push(LlamaText(pendingFunctionCalls));
                        res.push(LlamaText(new SpecialTokensText("<|stop|>")));
                        res.push(LlamaText(pendingFunctionResults));

                        pendingFunctionResults.length = 0;
                    };

                    for (let index = 0; index < item.response.length; index++) {
                        const response = item.response[index];
                        const isFirstResponse = index === 0;

                        if (typeof response === "string") {
                            addPendingFunctions();
                            res.push(
                                LlamaText([
                                    (isFirstItem && isFirstResponse)
                                        ? LlamaText([])
                                        : new SpecialTokensText("\n"),
                                    new SpecialTokensText("<|from|>assistant\n"),
                                    new SpecialTokensText("<|recipient|>all\n"),
                                    new SpecialTokensText("<|content|>"),
                                    response
                                ])
                            );
                        } else if (isChatModelResponseFunctionCall(response)) {
                            pendingFunctionCalls.push(
                                response.rawCall != null
                                    ? LlamaText.fromJSON(response.rawCall)
                                    : LlamaText([
                                        (isFirstItem && isFirstResponse)
                                            ? LlamaText([])
                                            : new SpecialTokensText("\n"),

                                        new SpecialTokensText("<|from|>assistant\n"),
                                        new SpecialTokensText("<|recipient|>"), response.name, new SpecialTokensText("\n"),
                                        new SpecialTokensText("<|content|>"),
                                        response.params === undefined
                                            ? ""
                                            : JSON.stringify(response.params)
                                    ])
                            );
                            pendingFunctionResults.push(
                                LlamaText([
                                    new SpecialTokensText("\n"),
                                    new SpecialTokensText("<|from|>"), response.name, new SpecialTokensText("\n"),
                                    new SpecialTokensText("<|recipient|>all\n"),
                                    new SpecialTokensText("<|content|>"),
                                    response.result === undefined
                                        ? "" // "void"
                                        : JSON.stringify(response.result)
                                ])
                            );
                        } else
                            void (response satisfies never);
                    }

                    addPendingFunctions();

                    if (res.length === 0) {
                        if (isLastItem) {
                            if (!hasFunctions)
                                res.push(
                                    LlamaText([
                                        isFirstItem
                                            ? LlamaText([])
                                            : new SpecialTokensText("\n"),
                                        new SpecialTokensText("<|from|>assistant\n"),
                                        new SpecialTokensText("<|recipient|>all\n"),
                                        new SpecialTokensText("<|content|>")
                                    ])
                                );
                        } else
                            res.push(
                                LlamaText([
                                    isFirstItem
                                        ? LlamaText([])
                                        : new SpecialTokensText("\n"),
                                    new SpecialTokensText("<|from|>assistant\n"),
                                    new SpecialTokensText("<|recipient|>all\n"),
                                    new SpecialTokensText("<|content|>")
                                ])
                            );
                    } else if (isLastItem && typeof item.response[item.response.length - 1] !== "string") {
                        if (!hasFunctions)
                            res.push(
                                LlamaText([
                                    isFirstItem
                                        ? LlamaText([])
                                        : new SpecialTokensText("\n"),
                                    new SpecialTokensText("<|from|>assistant\n"),
                                    new SpecialTokensText("<|recipient|>all\n"),
                                    new SpecialTokensText("<|content|>")
                                ])
                            );
                    }

                    if (!isLastItem)
                        res.push(LlamaText(new SpecialTokensText("<|stop|>")));

                    return LlamaText(res);
                }

                void (item satisfies never);
                return "";
            })
        );

        if (!hasFunctions) {
            return {
                contextText,
                stopGenerationTriggers: [
                    LlamaText(new SpecialToken("EOS")),
                    LlamaText(new SpecialTokensText("<|stop|>")),

                    LlamaText(" <|stop|>"),
                    LlamaText("<|stop|>"),
                    LlamaText("\n<|from|>user"),
                    LlamaText("\n<|from|>assistant"),
                    LlamaText("\n<|from|>system"),

                    LlamaText(new SpecialTokensText(" <|stop|>")),
                    LlamaText(new SpecialTokensText("<|stop|>")),
                    LlamaText(new SpecialTokensText("\n<|from|>user")),
                    LlamaText(new SpecialTokensText("\n<|from|>assistant")),
                    LlamaText(new SpecialTokensText("\n<|from|>system"))
                ]
            };
        }

        const textResponseStart = [
            "\n",
            "\n\n",
            " \n",
            " \n\n"
        ].flatMap((prefix) => [
            LlamaText(new SpecialTokensText(prefix + "<|from|>assistant\n<|recipient|>all\n<|content|>")),
            LlamaText(prefix + "<|from|>assistant\n<|recipient|>all\n<|content|>")
        ]);

        return {
            contextText,
            stopGenerationTriggers: [
                LlamaText(new SpecialToken("EOS")),
                LlamaText(new SpecialTokensText("<|stop|>")),

                LlamaText(" <|stop|>"),
                LlamaText("<|stop|>"),
                LlamaText("\n<|from|>user"),

                LlamaText(new SpecialTokensText(" <|stop|>")),
                LlamaText(new SpecialTokensText("<|stop|>")),
                LlamaText(new SpecialTokensText("\n<|from|>user"))
            ],
            ignoreStartText: textResponseStart,
            functionCall: {
                initiallyEngaged: true,
                disengageInitiallyEngaged: textResponseStart
            }
        };
    }

    public override generateAvailableFunctionsSystemText(availableFunctions: ChatModelFunctions, {documentParams = true}: {
        documentParams?: boolean
    }) {
        const functionsDocumentationGenerator = new ChatModelFunctionsDocumentationGenerator(availableFunctions);

        if (!functionsDocumentationGenerator.hasAnyFunctions)
            return LlamaText([]);

        const availableFunctionNames = Object.keys(availableFunctions ?? {});

        if (availableFunctionNames.length === 0)
            return LlamaText([]);

        return LlamaText.joinValues("\n", [
            "// Supported function definitions that should be called when necessary.",
            "namespace functions {",
            "",
            functionsDocumentationGenerator.getTypeScriptFunctionTypes({documentParams, reservedFunctionNames: ["all"]}),
            "",
            "} // namespace functions"
        ]);
    }

    public override addAvailableFunctionsSystemMessageToHistory(
        history: readonly ChatHistoryItem[],
        availableFunctions?: ChatModelFunctions,
        {
            documentParams = true
        }: {
            documentParams?: boolean
        } = {}
    ) {
        const availableFunctionNames = Object.keys(availableFunctions ?? {});

        if (availableFunctions == null || availableFunctionNames.length === 0)
            return history;

        const res = history.slice();

        const firstSystemMessageIndex = res.findIndex((item) => item.type === "system");
        res.splice(
            Math.max(0, firstSystemMessageIndex),
            0,
            {
                type: "system",
                text: this.generateAvailableFunctionsSystemText(availableFunctions, {documentParams}).toJSON()
            }, {
                type: "system",
                text: "The assistant calls functions with appropriate input when necessary. The assistant writes <|stop|> when finished answering."
            });

        return res;
    }
}
