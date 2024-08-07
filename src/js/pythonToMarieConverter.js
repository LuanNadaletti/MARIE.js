(function () {
    PythonToMarieConverter = function (tokens) {
        this.tokens = tokens;
        this.current = 0;
        this.ifCounter = 0;
        this.forCounter = 0; // Counter for for loops
        this.nextLabelForIfExit = null;
        this.currentConsumedTokens = [];

        this.instructions = [];
        this.variables = new Map();
        this.subroutines = [];
        this.constants = [];
        this.ifStack = [];

        this.usesMultiplicationSubroutine = false;
    };

    // Main function to convert tokens to MARIE assembly code
    PythonToMarieConverter.prototype.convert = function () {
        while (!this.isAtEnd()) {
            this.processStatement();
        }

        if (this.usesMultiplicationSubroutine) {
            this.addMultiplicationSubroutine();
        }

        this.ensureFinalInstructions();

        return [
            ...this.instructions,
            ...Array.from(this.variables.values()),
            ...this.subroutines,
            ...this.constants
        ].join("\n");
    };

    // Ensures the final set of instructions include necessary parts
    PythonToMarieConverter.prototype.ensureFinalInstructions = function () {
        if (this.hasInstructions() && !this.isLastInstructionEmptyLine()) {
            this.appendInstruction("");
        }

        if (this.hasInstructions() || this.hasVariables()) {
            this.appendInstruction("Halt");
        }

        if (this.hasVariables() && !this.isLastInstructionEmptyLine()) {
            this.appendInstruction("");
        }
    };

    // Token handling functions
    PythonToMarieConverter.prototype.consumeToken = function (tokenType, string) {
        this.skipUselessTokens();

        const token = this.peekToken();
        if (this.isAtEnd() || token.type !== tokenType) {
            this.throwError(`Expected ${tokenType || string}.`);
        }

        if (string && token.string !== string) {
            this.throwError(`Expected ${tokenType || "token"} to be equal to "${string}"`);
        }

        this.advanceToken();
        return token;
    };

    PythonToMarieConverter.prototype.consumeAnyToken = function (...conditions) {
        this.skipUselessTokens();

        const token = this.peekToken();
        if (this.isAtEnd()) {
            this.throwError("Reached end of input but was expecting a token.");
        }

        const matchFound = conditions.some(condition => {
            if (Array.isArray(condition)) {
                // Expecting a tuple of [type, string]
                return token.type === condition[0] && (condition.length === 1 || token.string === condition[1]);
            } else {
                // Expecting just a type
                return token.type === condition;
            }
        });

        if (!matchFound) {
            this.throwError(`Expected one of the following: ${conditions.map(JSON.stringify).join(", ")}, but got a ${token.type} with value ${token.string}.`);
        }

        this.advanceToken();
        return token;
    };

    PythonToMarieConverter.prototype.throwError = function (message) {
        const errorToken = this.peekToken() || this.peekPreviousToken();
        throw new PythonToMarieConverterError(message, errorToken.line);
    };

    PythonToMarieConverter.prototype.skipUselessTokens = function () {
        while (!this.isAtEnd() && (this.peekToken().type === "comment" || this.peekToken().string.trim() === "")) {
            this.advanceToken();
        }
    };

    PythonToMarieConverter.prototype.advanceToken = function () {
        if (this.peekToken() && this.peekToken().type !== "comment") {
            this.currentConsumedTokens.push(this.peekToken());
        }

        if (!this.isAtEnd()) {
            this.current++;
        }
    };

    PythonToMarieConverter.prototype.matchToken = function (tokenType, string) {
        this.skipUselessTokens();
        if (this.isAtEnd()) {
            return false;
        }
        return this.peekToken().type === tokenType && (!string || this.peekToken().string === string);
    };

    PythonToMarieConverter.prototype.peekPreviousToken = function () {
        return this.tokens[this.current - 1];
    };

    PythonToMarieConverter.prototype.peekToken = function () {
        return this.tokens[this.current];
    };

    PythonToMarieConverter.prototype.peekNextToken = function () {
        return this.tokens[this.current + 1];
    };

    PythonToMarieConverter.prototype.isAtEnd = function () {
        return this.current >= this.tokens.length;
    };

    PythonToMarieConverter.prototype.getFormattedConsumedTokens = function () {
        const formattedTokens = this.currentConsumedTokens.map(token => token.string).join("").trim();
        this.currentConsumedTokens = [];
        return formattedTokens;
    };

    PythonToMarieConverter.prototype.isEmptyLine = function () {
        const currentLineNumber = this.peekToken().line;
        if (this.peekPreviousToken() && currentLineNumber - this.peekPreviousToken().line > 1) {
            return true;
        }
        return this.peekNextToken() && this.peekNextToken().line - currentLineNumber > 1;
    };

    PythonToMarieConverter.prototype.isLastInstructionEmptyLine = function () {
        if (this.getLastInstruction() === undefined) {
            return false;
        }
        return this.getLastInstruction().length === 0;
    };

    PythonToMarieConverter.prototype.getLastInstruction = function () {
        if (!this.hasInstructions()) {
            return undefined;
        }
        return this.instructions[this.instructions.length - 1];
    };

    PythonToMarieConverter.prototype.hasInstructions = function () {
        return this.instructions.length !== 0;
    };

    PythonToMarieConverter.prototype.hasVariables = function () {
        return this.variables.size !== 0;
    };

    // Statement processing functions
    PythonToMarieConverter.prototype.processStatement = function () {
        if (this.isEmptyLine() && this.hasInstructions() && !this.isLastInstructionEmptyLine()) {
            this.addEmptyLine();
        } else if (this.matchToken("variable")) {
            this.handleAssignment();
        } else if (this.matchToken("builtin", "print")) {
            this.handlePrint();
        } else if (this.matchToken("keyword", "if")) {
            this.handleIf();
        } else if (this.matchToken("keyword", "for")) {
            this.handleFor();
        } else if (!this.isAtEnd()) {
            this.throwError("Unidentified expression.");
        }
    };

    PythonToMarieConverter.prototype.handleAssignment = function () {
        const variable = this.consumeToken("variable");
        this.consumeToken("operator", "=");

        if (this.matchToken("number") || this.matchToken("variable")) {
            const firstOperand = this.consumeAnyToken("number", "variable");

            if (this.matchToken("operator")) {
                const operator = this.consumeToken("operator");
                const secondOperand = this.consumeAnyToken(["variable"], ["number"]);

                this.handleArithmeticOperation(variable.string, firstOperand.string, operator.string, secondOperand.string);
            } else {
                if (firstOperand.type === "number") {
                    this.variables.set(variable.string, `${variable.string}, DEC ${firstOperand.string}`);
                } else {
                    this.appendInstruction(`Load ${firstOperand.string}`);
                    this.appendInstruction(`Store ${variable.string}`);
                    this.variables.set(variable.string, `${variable.string}, DEC 0 / ${variable} = ${firstOperand.string}`);
                }
            }
        } else if (this.matchToken("builtin", "input")) {
            this.handleInputAssignment(variable.string);
        } else {
            this.throwError("Invalid assignment expression.");
        }
    };

    PythonToMarieConverter.prototype.handlePrint = function () {
        this.consumeToken("builtin", "print");
        this.consumeToken(null, "(");
        const variable = this.consumeToken("variable");
        this.consumeToken(null, ")");

        this.appendInstruction(`Load ${variable.string}`);
        this.appendInstruction(`Output`);
    };

    PythonToMarieConverter.prototype.handleInputAssignment = function (variable) {
        this.consumeToken("builtin", "input")
        this.consumeToken(null, "(");
        this.consumeToken(null, ")");
        this.appendInstruction(`Input`);
        this.appendInstruction(`Store ${variable}`);
        this.variables.set(variable, `${variable}, DEC 0 / ${variable} = input()`);
    };

    PythonToMarieConverter.prototype.handleIf = function () {
        const initialIndent = this.peekToken().state.indent;
        this.consumeToken("keyword", "if");
        this.consumeToken(null, "(");
        const leftOperand = this.consumeAnyToken("variable", "number");
        const operator = this.consumeToken("operator");
        const rightOperand = this.consumeAnyToken("variable", "number");
        this.consumeToken(null, ")");
        this.consumeToken(null, ":");

        const leftIsNumber = !isNaN(parseInt(leftOperand.string));
        const rightIsNumber = !isNaN(parseInt(rightOperand.string));
        const leftVarName = leftIsNumber ? this.ensureConstantAndGetItsName(leftOperand.string) : leftOperand.string;
        const rightVarName = rightIsNumber ? this.ensureConstantAndGetItsName(rightOperand.string) : rightOperand.string;

        const ifExitLabel = `EndIf${++this.ifCounter}`;
        this.ifStack.push(ifExitLabel);

        this.appendInstruction(`Load ${leftVarName}`);
        this.appendInstruction(`Subt ${rightVarName}`);
        this.appendInstruction(`Skipcond ${this.operatorToSkipcond(operator.string)}`);
        this.appendInstruction(`Jump ${ifExitLabel}`);

        while (!this.isAtEnd()) {
            this.skipUselessTokens();
            if (this.peekToken().state.indent <= initialIndent) {
                break;
            }
            this.processStatement();
        }

        const endLabel = this.ifStack.pop();
        this.appendInstruction(`${endLabel}`);
    };


    PythonToMarieConverter.prototype.handleFor = function () {
        this.consumeToken("keyword", "for");
        const loopVariable = this.consumeToken("variable");
        this.consumeToken("keyword", "in");
        this.consumeToken("builtin", "range");
        this.consumeToken(null, "(");
        const startValue = this.consumeToken("number");
        this.consumeToken(null, ",");
        const endValue = this.consumeToken("number");
        this.consumeToken(null, ")");
        this.consumeToken(null, ":");

        const forStartLabel = `ForStart${++this.forCounter}`;
        const forEndLabel = `ForEnd${this.forCounter}`;

        this.appendInstruction(`${forStartLabel}`);
        this.appendInstruction(`Load ${loopVariable.string}`);
        this.appendInstruction(`Subt For${loopVariable.string}`);
        this.appendInstruction(`Skipcond 000`);
        this.appendInstruction(`Jump ${forEndLabel}`);

        const initialIndent = this.peekToken().state.indent;

        while (!this.isAtEnd()) {
            this.skipUselessTokens();

            if (this.peekNextToken().state.indent < initialIndent) {
                break;
            }

            this.processStatement();
        }

        this.appendInstruction(`Load ${loopVariable.string}`);
        this.appendInstruction(`Add One`);
        this.appendInstruction(`Store ${loopVariable.string}`);
        this.appendInstruction(`Jump ${forStartLabel}`);
        this.appendInstruction(`${forEndLabel}`);

        this.variables.set(loopVariable.string, `${loopVariable.string}, DEC ${startValue.string}`);
        this.variables.set(`For${loopVariable.string}`, `For${loopVariable.string}, DEC ${endValue.string}`);
        this.variables.set('One', 'One, DEC 1');
    };

    PythonToMarieConverter.prototype.appendInstruction = function (instruction) {
        if (instruction === '') {
            return;
        }
        if (instruction.match(/^(EndIf\d+|ForEnd\d+|ForStart\d+|Else\d+)/)) {
            if (this.instructions.length > 0 && this.instructions[this.instructions.length - 1].match(/,$/)) {
                this.instructions[this.instructions.length - 1] += ` ${instruction}`;
            } else {
                this.instructions.push(`${instruction},`);
            }
        } else {
            if (this.instructions.length > 0 && this.instructions[this.instructions.length - 1].match(/,$/)) {
                this.instructions[this.instructions.length - 1] += ` ${instruction}`;
            } else {
                this.instructions.push(instruction);
            }
        }
    };

    PythonToMarieConverter.prototype.addEmptyLine = function () {
        this.appendInstruction("");
    };

    PythonToMarieConverter.prototype.ensureConstant = function (name, value) {
        if (!this.constants.includes(`${name}, DEC ${value}`)) {
            this.constants.push(`${name}, DEC ${value}`);
        }
    };

    PythonToMarieConverter.prototype.ensureConstantAndGetItsName = function (value) {
        if (!isNaN(parseInt(value))) {
            const constName = `Const${value}`;
            this.ensureConstant(constName, value);
            return constName;
        }
        return value;
    };

    // Arithmetic operation handling functions
    PythonToMarieConverter.prototype.handleArithmeticOperation = function (resultVar, var1, operator, var2) {
        if (!isNaN(parseInt(var1))) {
            var1 = this.ensureConstantAndGetItsName(var1);
        }

        if (!isNaN(parseInt(var2))) {
            var2 = this.ensureConstantAndGetItsName(var2);
        }

        switch (operator) {
            case "+":
                this.appendInstruction(`Load ${var1}`);
                this.appendInstruction(`Add ${var2}`);
                break;
            case "-":
                this.appendInstruction(`Load ${var1}`);
                this.appendInstruction(`Subt ${var2}`);
                break;
            case "*":
                this.appendInstruction(`Load ${var1}`);
                this.appendInstruction(`Store MultA`);
                this.appendInstruction(`Load ${var2}`);
                this.appendInstruction(`Store MultB`);
                this.appendInstruction(`JnS MultReturn`);
                this.appendInstruction(`Load MultResult`);
                this.usesMultiplicationSubroutine = true;
                break;
        }
        this.appendInstruction(`Store ${resultVar}`);
        this.variables.set(resultVar, `${resultVar}, DEC 0 / ${resultVar} = ${var1} ${operator} ${var2}`);
    };

    // Subroutine handling functions
    PythonToMarieConverter.prototype.addMultiplicationSubroutine = function () {
        this.appendSubroutine("");
        this.appendSubroutine("/ Multiplication SubRoutine");
        this.appendSubroutine("MultReturn, DEC 0");
        this.appendSubroutine("            Clear");
        this.appendSubroutine("            Store MultResult");
        this.appendSubroutine("");
        this.appendSubroutine("            Load MultB");
        this.appendSubroutine("            Skipcond 400");
        this.appendSubroutine("            Jump Mult");
        this.appendSubroutine("            JumpI MultReturn");
        this.appendSubroutine("");
        this.appendSubroutine("Mult,    Load MultResult");
        this.appendSubroutine("         Add MultA");
        this.appendSubroutine("         Store MultResult");
        this.appendSubroutine("");
        this.appendSubroutine("         Load MultB");
        this.appendSubroutine("         Subt One");
        this.appendSubroutine("         Store MultB");
        this.appendSubroutine("");
        this.appendSubroutine("         Skipcond 400");
        this.appendSubroutine("         Jump Mult");
        this.appendSubroutine("");
        this.appendSubroutine("         JumpI MultReturn");
        this.appendSubroutine("");
        this.appendSubroutine("MultA, DEC 0");
        this.appendSubroutine("MultB, DEC 0");
        this.appendSubroutine("");
        this.appendSubroutine("MultResult, DEC 0");
        this.appendSubroutine("");
        this.appendSubroutine("One, DEC 1");
    };

    // Append subroutine and constant functions
    PythonToMarieConverter.prototype.appendSubroutine = function (subroutine) {
        this.subroutines.push(subroutine);
    };

    PythonToMarieConverter.prototype.appendConstant = function (constant) {
        this.constants.push(constant);
    };

    PythonToMarieConverter.prototype.operatorToSkipcond = function (operator) {
        const opCodeMap = {
            ">": "800",  // Skipcond 800 (Pula se ACC > 0)
            "==": "400", // Skipcond 400 (Pula se ACC == 0)
            "<": "000"   // Skipcond 000 (Pula se ACC < 0)
        };

        return opCodeMap[operator] || "400"; // Padrão para "==", caso o operador não seja reconhecido
    };

    // Custom error handling
    PythonToMarieConverterError = function (message, line) {
        this.message = message;
        this.line = line;

        this.toString = function () {
            return ["L", this.line, " - ", this.message].join("");
        };
    };
}());
