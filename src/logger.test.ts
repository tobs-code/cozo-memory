import { LogLevel, logger } from "./logger";

describe("Logger", () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    logger.setLevel(LogLevel.INFO);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe("Log Level Filtering", () => {
    it("should log ERROR messages", () => {
      logger.error("TestComponent", "Error message");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[TestComponent] ERROR:"),
        "Error message"
      );
    });

    it("should log WARN messages", () => {
      logger.warn("TestComponent", "Warn message");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[TestComponent] WARN:"),
        "Warn message"
      );
    });

    it("should log INFO messages", () => {
      logger.info("TestComponent", "Info message");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[TestComponent] INFO:"),
        "Info message"
      );
    });

    it("should NOT log DEBUG messages at INFO level", () => {
      logger.debug("TestComponent", "Debug message");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should NOT log TRACE messages at INFO level", () => {
      logger.trace("TestComponent", "Trace message");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("Level Changes", () => {
    it("should log DEBUG after setting DEBUG level", () => {
      logger.setLevel(LogLevel.DEBUG);
      logger.debug("TestComponent", "Debug message");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[TestComponent] DEBUG:"),
        "Debug message"
      );
    });

    it("should log TRACE after setting TRACE level", () => {
      logger.setLevel(LogLevel.TRACE);
      logger.trace("TestComponent", "Trace message");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[TestComponent] TRACE:"),
        "Trace message"
      );
    });

    it("should NOT log INFO after setting ERROR level", () => {
      logger.setLevel(LogLevel.ERROR);
      logger.info("TestComponent", "Info message");
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should NOT log WARN after setting ERROR level", () => {
      logger.setLevel(LogLevel.ERROR);
      logger.warn("TestComponent", "Warn message");
      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe("Message Formatting", () => {
    it("should include prefix and component in output", () => {
      logger.info("MyComp", "Hello World");
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[CozoDB]"),
        "Hello World"
      );
    });

    it("should pass additional arguments", () => {
      const error = new Error("Test error");
      logger.error("ErrComp", "Something failed", error);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[ErrComp] ERROR:"),
        "Something failed",
        error
      );
    });

    it("should pass multiple extra arguments", () => {
      logger.warn("WarnComp", "Warning", { code: 42 }, "context");
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("[WarnComp] WARN:"),
        "Warning",
        { code: 42 },
        "context"
      );
    });
  });
});
