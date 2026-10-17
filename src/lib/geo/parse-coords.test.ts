import { describe, expect, it } from "vitest";
import { isShortMapsLink, parseCoords, round6 } from "./parse-coords";

const nqn = { lat: -38.95, lng: -68.06 };

describe("parseCoords", () => {
  it("parses plain text", () => {
    expect(parseCoords("-38.95, -68.06")).toEqual(nqn);
    expect(parseCoords("  -38.95,-68.06 ")).toEqual(nqn);
    expect(parseCoords("-38.95 -68.06")).toEqual(nqn);
  });
  it("parses @lat,lng URLs", () => {
    expect(parseCoords("https://www.google.com/maps/place/X/@-38.95,-68.06,15z/data=abc")).toEqual(
      nqn,
    );
  });
  it("parses q= and ll= params", () => {
    expect(parseCoords("https://maps.google.com/?q=-38.95,-68.06")).toEqual(nqn);
    expect(parseCoords("https://maps.google.com/?q=-38.95%2C-68.06")).toEqual(nqn);
    expect(parseCoords("https://maps.google.com/?ll=-38.95,-68.06&z=10")).toEqual(nqn);
  });
  it("prefers the !3d!4d pin over the viewport", () => {
    expect(
      parseCoords("https://www.google.com/maps/place/X/@-30,-60,15z/data=!3d-38.95!4d-68.06"),
    ).toEqual(nqn);
  });
  it("rejects invalid input", () => {
    expect(parseCoords("")).toBeNull();
    expect(parseCoords("hola")).toBeNull();
    expect(parseCoords("https://example.com")).toBeNull();
    expect(parseCoords("-38.95")).toBeNull();
  });
  it("rejects out-of-range values", () => {
    expect(parseCoords("91, 10")).toBeNull();
    expect(parseCoords("10, 181")).toBeNull();
    expect(parseCoords("https://maps.google.com/?q=-95,-68")).toBeNull();
  });
});

describe("isShortMapsLink", () => {
  it("detects Google Maps short links", () => {
    expect(isShortMapsLink("https://maps.app.goo.gl/AbC123")).toBe(true);
    expect(isShortMapsLink("goo.gl/maps/xyz")).toBe(true);
    expect(isShortMapsLink("https://goo.gl/maps/xyz")).toBe(true);
  });
  it("ignores other input", () => {
    expect(isShortMapsLink("https://www.google.com/maps/@-38,-68,15z")).toBe(false);
    expect(isShortMapsLink("-38.95, -68.06")).toBe(false);
    expect(isShortMapsLink("https://example.com/goo.gl/maps")).toBe(false);
  });
});

describe("round6", () => {
  it("rounds to 6 decimals", () => {
    expect(round6(-38.95123456789)).toBe(-38.951235);
    expect(round6(-68.06)).toBe(-68.06);
  });
});
