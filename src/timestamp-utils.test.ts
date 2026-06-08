import { toDualTimestamp, nowDual, parseToDual } from "./timestamp-utils";

describe("toDualTimestamp", () => {
  it("should convert microseconds to DualTimestamp", () => {
    const result = toDualTimestamp(1_700_000_000_000_000);
    expect(result.timestamp).toBe(1_700_000_000_000_000);
    expect(result.iso).toBe("2023-11-14T22:13:20.000Z");
  });

  it("should round milliseconds floor", () => {
    const result = toDualTimestamp(1_700_000_000_000_999);
    expect(result.iso.endsWith(".000Z")).toBe(true);
  });

  it("should handle zero timestamp", () => {
    const result = toDualTimestamp(0);
    expect(result.timestamp).toBe(0);
    expect(result.iso).toBe("1970-01-01T00:00:00.000Z");
  });

  it("should handle large future timestamps", () => {
    const future = 2_100_000_000_000_000; // ~2036
    const result = toDualTimestamp(future);
    expect(result.timestamp).toBe(future);
    expect(result.iso).toContain("2036");
  });
});

describe("nowDual", () => {
  it("should return current time with both formats", () => {
    const before = Date.now() * 1000;
    const result = nowDual();
    const after = Date.now() * 1000;

    expect(result.timestamp).toBeGreaterThanOrEqual(before);
    expect(result.timestamp).toBeLessThanOrEqual(after);
    expect(result.iso).toBeDefined();
    expect(result.iso).toContain("T");
    expect(result.iso.endsWith("Z")).toBe(true);
  });

  it("should be consistent between timestamp and iso", () => {
    const result = nowDual();
    // Convert ISO back and compare
    const reconstructed = new Date(result.iso).getTime() * 1000;
    // Allow small delta due to execution time
    expect(Math.abs(reconstructed - result.timestamp)).toBeLessThan(100_000); // <100ms
  });
});

describe("parseToDual", () => {
  it("should parse a number as microseconds", () => {
    const result = parseToDual(1_700_000_000_000_000);
    expect(result.timestamp).toBe(1_700_000_000_000_000);
    expect(result.iso).toBe("2023-11-14T22:13:20.000Z");
  });

  it("should parse an ISO string", () => {
    const input = "2024-01-15T10:30:00.000Z";
    const result = parseToDual(input);
    // 2024-01-15T10:30:00.000Z = 1705314600000 ms = 1705314600000000 µs
    expect(result.timestamp).toBe(1_705_314_600_000_000);
    expect(result.iso).toBe(input);
  });

  it("should parse ISO string without Z suffix", () => {
    const input = "2024-06-01T12:00:00.000";
    const result = parseToDual(input);
    expect(result.timestamp).toBeDefined();
    expect(result.iso).toContain("2024-06-01");
  });

  it("should throw for invalid date string", () => {
    // parseToDual ruft date.toISOString() auf, das für Invalid Date einen RangeError wirft
    expect(() => parseToDual("not-a-date")).toThrow(RangeError);
  });
});