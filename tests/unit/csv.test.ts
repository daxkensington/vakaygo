// @vitest-environment node
import { describe, expect, it } from "vitest";
import { csvCell, csvRow, neutralizeCsvFormula } from "@/lib/csv";

describe("csvCell", () => {
  it.each([
    ["=HYPERLINK(\"https://evil.example\",\"x\")", "\"'=HYPERLINK(\"\"https://evil.example\"\",\"\"x\"\")\""],
    ["+cmd|' /C calc'!A0", "'+cmd|' /C calc'!A0"],
    ["-2+3+cmd", "'-2+3+cmd"],
    ["@SUM(A1:A9)", "'@SUM(A1:A9)"],
    ["\t=1+1", "'\t=1+1"],
    ["\r=1+1", "\"'\r=1+1\""],
  ])("stops %j from running as a formula", (input, expected) => {
    expect(csvCell(input)).toBe(expected);
  });

  it("leaves ordinary text and numbers as they were", () => {
    expect(csvCell("Ada Lovelace")).toBe("Ada Lovelace");
    expect(csvCell("ada@example.invalid")).toBe("ada@example.invalid");
    expect(csvCell("-12.50")).toBe("-12.50");
    expect(csvCell(-12.5)).toBe("-12.5");
    expect(csvCell(0)).toBe("0");
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(Number.NaN)).toBe("");
  });

  it("still quotes delimiters, quotes and line breaks", () => {
    expect(csvCell("Smith, Jane")).toBe("\"Smith, Jane\"");
    expect(csvCell("The \"Best\" Tours")).toBe("\"The \"\"Best\"\" Tours\"");
    expect(csvCell("line one\nline two")).toBe("\"line one\nline two\"");
  });

  it("joins a row field by field", () => {
    expect(csvRow(["VG-1", "=1+1", 80, null, "a,b"])).toBe("VG-1,'=1+1,80,,\"a,b\"");
  });

  it("only prefixes a cell that would be read as a formula", () => {
    expect(neutralizeCsvFormula("plain")).toBe("plain");
    expect(neutralizeCsvFormula("a=b")).toBe("a=b");
    expect(neutralizeCsvFormula("-5")).toBe("-5");
    expect(neutralizeCsvFormula("-5x")).toBe("'-5x");
  });
});
