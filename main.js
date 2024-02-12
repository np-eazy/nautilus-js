const TOKEN_TYPE = {
    END: -2, 
    SPACE: -1, 
    REFERENCE: 0,
    DELIM_LEFT: 1,
    DELIM_RIGHT: 2,
    FUNCTION: 3,
    UNARY_OPERATOR: 4,
    BINARY_OPERATOR: "BINARY_OPERATOR",
    DOUBLE_BINARY_OPERATOR: 6,
    DECIMAL: 6,
    CONTROL: 7,

    SUBEXPRESSION: 8,
    LEFT_OPERAND: 9,
    RIGHT_OPERAND: 10,
    TUPLE: 11,
    ARRAY: 12,
    OBJECT: 13,
    UNEVALUATED: "UNEVALUATED",
    EVALUATED: "EVALUATED",
}

const OBJECT_TYPE = {
    OBJECT: 0,
    STRING: 1,
    NUMBER: 2,
    TUPLE: 3,
}

const EVAL_TYPE = {
    REFERENCE: 0,
}

const ERROR_TYPE = {
    UNEXPECTED_TOKEN: 0,
}

const Shell = class {
    constructor() {
        this.history = {};
        this.tokenDictionary = [
            [TOKEN_TYPE.END, [";", null]],
            [TOKEN_TYPE.SPACE, [" ", null], ["\n", null], ["\t", null]],
            [TOKEN_TYPE.REFERENCE],
            [TOKEN_TYPE.DELIM_LEFT, ["{", [":", ","]], ["[", [","]], ["(", [","]], ["\"", []], ["\'", []]],
            [TOKEN_TYPE.DELIM_RIGHT, ["}", ["{", this.createObject]], ["]", ["[", this.createArray]], [")", ["(", this.createTuple]], ["\"", ["\"", this.createString]], ["\'", ["\'",this.createString]]],
            [TOKEN_TYPE.FUNCTION],
            [TOKEN_TYPE.UNARY_OPERATOR, ["!", this.not]],
            [TOKEN_TYPE.BINARY_OPERATOR, [".", "REFERENCE"], ["=", this.assign], ["==", this.equals], ["+", this.add], ["-", this.subtract], ["*", this.multiply], ["/", this.divide], ["%", this.modulo]],
            [TOKEN_TYPE.DOUBLE_BINARY_OPERATOR, ["=", this.equals], ["&", this.and], ["|", this.or]],
            [TOKEN_TYPE.DECIMAL, ["0", 0], ["1", 1], ["2", 2], ["3", 3], ["4", 4], ["5", 5], ["6", 6], ["7", 7], ["8", 8], ["9", 9],],
            [TOKEN_TYPE.CONTROL],
            [TOKEN_TYPE.NULL, ["undefined", undefined], ["null", null]],
        ];
        this.tokenMap = new Map();
        for (const tokenList of this.tokenDictionary) {
            const charSet = new Map();
            for (let i = 1; i < tokenList.length; i++) {
                charSet.set(tokenList[i][0], tokenList[i][1]);
            }
            this.tokenMap.set(tokenList[0], charSet);
        }
        this.objectMap = new Map();
        this.objectMap.set("}", OBJECT_TYPE.OBJECT);
        this.objectMap.set(")", OBJECT_TYPE.TUPLE);
        this.objectMap.set("\"", OBJECT_TYPE.STRING);
        this.objectMap.set("\'", OBJECT_TYPE.STRING);

        const references = new Map();
        references.set("log", {
            type: TOKEN_TYPE.FUNCTION,
            contents: (args) => { 
                console.log(args[1][0].slice(1, -1));
            }
        });
        this.mem = new Map();
        this.mem.set('console', {
            source: console,
            references: references,
        });
    }

    run(expr) {
        this.read(expr);
    }

    read(expr) {
        let prevTokenLength = 0;
        let depth = 0;

        const delimiterStack = [];
        const state = {
            error: null, 

            readingSubexpr: false,
            currToken: "",
            currSubexprType: null,

            readingRightOperand: false,
            currRightOperand: null,
        };
        let tokens = [];
        const transformations = [
            [TOKEN_TYPE.DELIM_LEFT, (c) => {
                delimiterStack.push(c);
                if (!state.readingSubexpr) {
                    tokens.push([TOKEN_TYPE.UNEVALUATED, [state.currToken, EVAL_TYPE.REFERENCE]]);
                    state.readingSubexpr = true;
                    state.depth = delimiterStack.length - 1; // Convention: length beforehand
                    state.currToken = "";
                    state.currSubexprType = c;
                }
                state.readingRightOperand = false;
            }],
            [TOKEN_TYPE.DELIM_RIGHT, (c) => {
                if (this.tokenMap.get(TOKEN_TYPE.DELIM_RIGHT).get(c)[0] == delimiterStack[delimiterStack.length-1]) { // End of subexpression: right delimiter reached
                    delimiterStack.pop();
                    if (delimiterStack.length == depth) { // Check for the correct depth to stop reading the subexpression
                        tokens.push([TOKEN_TYPE.UNEVALUATED, [state.currToken, c]]);
                        state.readingSubexpr = false;
                    }
                } else { 
                    state.error = ERROR_TYPE.UNEXPECTED_TOKEN; 
                }
                state.readingRightOperand = false;
            }],
            [TOKEN_TYPE.BINARY_OPERATOR, (c) => {
                if (tokens.length > 0 && tokens[tokens.length - 1][0] == TOKEN_TYPE.SPACE) {
                    tokens.pop();
                } else if (state.currToken.length > 0) {
                    tokens.push([TOKEN_TYPE.UNEVALUATED, [state.currToken, EVAL_TYPE.REFERENCE]]); // 1: [console]
                    state.currToken = c;
                }
                if (tokens.length >= 1) { // Expecting a non-whitespace token preceding
                    state.readingRightOperand = true;
                    state.currRightOperand = c;
                } else { 
                    state.error = ERROR_TYPE.UNEXPECTED_TOKEN; 
                }
                state.readingRightOperand = true;
            }], 
            [TOKEN_TYPE.SPACE, (c) => {
                if (state.currToken.length > 0) {
                    tokens.push([TOKEN_TYPE.UNEVALUATED, [state.currToken, EVAL_TYPE.REFERENCE]]); // 1: [console]
                    state.currToken = "";
                }
                if (tokens.length > 0 && tokens[tokens.length-1][0] != TOKEN_TYPE.SPACE) { 
                    tokens.push([TOKEN_TYPE.SPACE, null]);
                    state.currToken = "";
                }
            }],
            [TOKEN_TYPE.END, (c) => {
                state.finished = true;
                state.readingRightOperand = false;
            }],
        ];
        const transformationMap = new Map();
        transformations.forEach((transformation) => {
            transformationMap.set(transformation[0], transformation[1]);
        })
        const apply = (tokenType, c) => {
            if (this.tokenMap.get(tokenType).get(c)) {
                transformationMap.get(tokenType)(c);
                return true;
            }
        }
        const endOfExpression = (c) => {
            return apply(TOKEN_TYPE.SPACE, c) 
            || apply(TOKEN_TYPE.BINARY_OPERATOR, c) 
            || apply(TOKEN_TYPE.DELIM_LEFT, c) 
            || apply(TOKEN_TYPE.END, c);
        } // Because this function directly calls voided logic, it can only be used once in each of the loop below.
        const checkDoubleBinary = (currOperation, c) => {
            return (currOperation == "!" && c == "=")  
            || (currOperation == "=" && c == "=")   
            || (currOperation == ">" && c == "=")  
            || (currOperation == "<" && c == "=")     
            || (currOperation == "!" && c == "!")    
            || (currOperation == "&" && c == "&");
        }

        for (const c of expr) {
            if (state.readingSubexpr) {
                if (this.tokenMap.get(TOKEN_TYPE.DELIM_RIGHT).get(c)) { // Right delimiter
                    apply(TOKEN_TYPE.DELIM_RIGHT, c);
                    if (state.readingSubexpr) { 
                        state.currToken += c;
                    }
                } else if (this.tokenMap.get(TOKEN_TYPE.DELIM_LEFT).get(c)) {
                    apply(TOKEN_TYPE.DELIM_LEFT, c);
                    state.currToken += c;
                } else {
                    state.currToken += c;
                }
            } else if (state.readingRightOperand) { // Binary Operator Mode: Check for an extra special character and the right operand; 
                if (state.currToken.length == 1) { // This only gets called once; currToken is padded for this reason; that padding will get cut out on eval calls after
                    if (checkDoubleBinary(state.currToken, c)) {
                        tokens.push([TOKEN_TYPE.BINARY_OPERATOR, state.currToken + c]);
                        state.currToken = "  "; 
                    } else {
                        tokens.push([TOKEN_TYPE.BINARY_OPERATOR, state.currToken]);
                        state.currToken = " " + c; 
                    }
                } else {
                    if (endOfExpression(c)) {
                        
                    } else {
                        state.currToken += c; 
                    }
                }
            } else { // Global mode: EOE checking automatically adds all resolvable tokens at or before c
                if (endOfExpression(c)) {

                } else {
                    state.currToken += c;
                } // console._ [console, ]
            }

            if (prevTokenLength != tokens.length) {
                if (tokens.length >= 1) {
                    if (tokens[tokens.length - 1][0] == TOKEN_TYPE.UNEVALUATED) {
                        tokens[tokens.length - 1] = this.eval(TOKEN_TYPE.UNEVALUATED, tokens[tokens.length - 1]);
                    }
                } 
    
                if (tokens.length >= 2) {
                    const [f, x] = [tokens[tokens.length - 2], tokens[tokens.length - 1]];
                    if (f[0] == TOKEN_TYPE.FUNCTION && x[1][1] == ')') {
                        return f[1](x);
                    }
                } 
    
                if (tokens.length >= 3) {
                    const [a, op, b] = [tokens[tokens.length - 3], tokens[tokens.length - 2], tokens[tokens.length - 1]];
                    if (op[0] == TOKEN_TYPE.BINARY_OPERATOR) {
                        if (op[1] == ".") {
                            const evaluation = a[1].references.get(b[1][0].trim());
                            tokens = tokens.slice(0, tokens.length - 3);
                            tokens.push([evaluation.type, evaluation.contents]);
                        }
                    }
                } 
            }
            prevTokenLength = tokens.length;
        }
    }

    eval(evalType, token) {
        if (evalType == TOKEN_TYPE.UNEVALUATED) {
            if (this.mem.get(token[1][0].trim())) {
                return [TOKEN_TYPE.REFERENCE, this.mem.get(token[1][0].trim())];
            } else {
                return [TOKEN_TYPE.UNEVALUATED, token[1]];
            }
        }
    }
};

const shell = new Shell();
shell.run("console.log(\"Hello world!\"); \n");
