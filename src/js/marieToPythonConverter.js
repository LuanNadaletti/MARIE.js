let MarieToPythonConverter, MarieToPythonConverterError;

(function () {
    MarieToPythonConverter = function (instructions) {
        this.instructions = instructions.split("\n");
        this.current = 0;
        this.variables = new Map();
        this.constants = new Map();
        this.subroutines = new Map();
        this.output = [];
        this.currentIndent = 0;
    };

    // Main function to convert MARIE assembly code to Python code
    MarieToPythonConverter.prototype.convert = function () {
        console.log(this.instructions);

        while (!this.isAtEnd()) {
            this.processInstruction();
        }

        return this.output.join("\n");
    };

    // Process each MARIE instruction
    MarieToPythonConverter.prototype.processInstruction = function () {
        const line = this.peekInstruction().trim();

        if (line === "") {
            this.advanceInstruction();
            return;
        }

        const parts = line.split(/,|\s+/).filter(Boolean);

        if (parts.length === 0) {
            this.advanceInstruction();
            return;
        }

        const label = parts.length > 1 && parts[1] === "" ? parts[0] : null;
        const instruction = label ? parts[1] : parts[0];
        const operand = parts.length > 2 ? parts[2] : null;

        if (label) {
            this.handleLabel(label);
        }

        switch (instruction) {
            case "Load":
                this.handleLoad(operand);
                break;
            case "Store":
                this.handleStore(operand);
                break;
            case "Add":
                this.handleAdd(operand);
                break;
            case "Subt":
                this.handleSubt(operand);
                break;
            case "Input":
                this.handleInput();
                break;
            case "Output":
                this.handleOutput();
                break;
            case "Halt":
                this.handleHalt();
                break;
            case "Jump":
                this.handleJump(operand);
                break;
            case "Skipcond":
                this.handleSkipcond(operand);
                break;
            case "Clear":
                this.handleClear();
                break;
            case "JnS":
                this.handleJnS(operand);
                break;
            case "JumpI":
                this.handleJumpI(operand);
                break;
            default:
                this.handleVariableOrConstant(parts);
                break;
        }

        this.advanceInstruction();
    };

    // Handle various MARIE instructions
    MarieToPythonConverter.prototype.handleLabel = function (label) {
        this.output.push(`${" ".repeat(this.currentIndent)}${label}:`);
    };

    MarieToPythonConverter.prototype.handleLoad = function (operand) {
        this.output.push(`${" ".repeat(this.currentIndent)}accumulator = ${operand}`);
    };

    MarieToPythonConverter.prototype.handleStore = function (operand) {
        this.output.push(`${" ".repeat(this.currentIndent)}${operand} = accumulator`);
    };

    MarieToPythonConverter.prototype.handleAdd = function (operand) {
        this.output.push(`${" ".repeat(this.currentIndent)}accumulator += ${operand}`);
    };

    MarieToPythonConverter.prototype.handleSubt = function (operand) {
        this.output.push(`${" ".repeat(this.currentIndent)}accumulator -= ${operand}`);
    };

    MarieToPythonConverter.prototype.handleInput = function () {
        this.output.push(`${" ".repeat(this.currentIndent)}accumulator = int(input())`);
    };

    MarieToPythonConverter.prototype.handleOutput = function () {
        this.output.push(`${" ".repeat(this.currentIndent)}print(accumulator)`);
    };

    MarieToPythonConverter.prototype.handleHalt = function () {
        this.output.push(`${" ".repeat(this.currentIndent)}# End of program`);
    };

    MarieToPythonConverter.prototype.handleJump = function (operand) {
        this.output.push(`${" ".repeat(this.currentIndent)}goto ${operand}`);
    };

    MarieToPythonConverter.prototype.handleSkipcond = function (operand) {
        const condition = {
            "000": "< 0",
            "400": "== 0",
            "800": "> 0"
        }[operand];
        this.output.push(`${" ".repeat(this.currentIndent)}if accumulator ${condition}:`);
        this.currentIndent += 4;
    };

    MarieToPythonConverter.prototype.handleClear = function () {
        this.output.push(`${" ".repeat(this.currentIndent)}accumulator = 0`);
    };

    MarieToPythonConverter.prototype.handleJnS = function (operand) {
        this.output.push(`${" ".repeat(this.currentIndent)}# Call subroutine ${operand}`);
        this.output.push(`${" ".repeat(this.currentIndent)}${operand}()`);
    };

    MarieToPythonConverter.prototype.handleJumpI = function (operand) {
        this.output.push(`${" ".repeat(this.currentIndent)}# Indirect jump to ${operand}`);
    };

    MarieToPythonConverter.prototype.handleVariableOrConstant = function (parts) {
        if (parts.length === 3 && parts[1] === "DEC") {
            this.constants.set(parts[0], parseInt(parts[2], 10));
            this.output.push(`${" ".repeat(this.currentIndent)}${parts[0]} = ${parts[2]}`);
        } else if (parts.length === 3 && parts[1] === "HEX") {
            this.constants.set(parts[0], parseInt(parts[2], 16));
            this.output.push(`${" ".repeat(this.currentIndent)}${parts[0]} = 0x${parts[2]}`);
        } else {
            throw new MarieToPythonConverterError("Invalid variable or constant definition.");
        }
    };

    // Helper functions
    MarieToPythonConverter.prototype.advanceInstruction = function () {
        if (!this.isAtEnd()) {
            this.current++;
        }
    };

    MarieToPythonConverter.prototype.peekInstruction = function () {
        return this.instructions[this.current];
    };

    MarieToPythonConverter.prototype.isAtEnd = function () {
        return this.current >= this.instructions.length;
    };

    // Custom error handling
    MarieToPythonConverterError = function (message) {
        this.message = message;

        this.toString = function () {
            return this.message;
        };
    };
}());
