import { describe, it, expect } from "vitest";
import { splitTopLevelObjects, findPluginsArraySpan, replaceEntryVersion } from "./gen-marketplace-versions.mjs";

describe("splitTopLevelObjects (AC-18 text-surgery primitive)", () => {
  it("finds each top-level object in an array body, ignoring nested objects", () => {
    const body = `\n    { "a": 1, "nested": { "b": 2 } },\n    { "a": 3 }\n  `;
    const spans = splitTopLevelObjects(body);
    expect(spans).toHaveLength(2);
    expect(body.slice(spans[0].start, spans[0].end)).toBe('{ "a": 1, "nested": { "b": 2 } }');
    expect(body.slice(spans[1].start, spans[1].end)).toBe('{ "a": 3 }');
  });

  it("is string-aware — braces inside a string value do not confuse depth tracking", () => {
    const body = `{ "description": "has a { brace } inside" }`;
    const spans = splitTopLevelObjects(body);
    expect(spans).toHaveLength(1);
    expect(body.slice(spans[0].start, spans[0].end)).toBe(body);
  });
});

describe("findPluginsArraySpan", () => {
  it("locates the plugins array body, tolerant of other top-level keys", () => {
    const text = '{\n  "name": "x",\n  "plugins": [\n    { "a": 1 }\n  ]\n}\n';
    const span = findPluginsArraySpan(text);
    expect(text.slice(span.start, span.end)).toBe('\n    { "a": 1 }\n  ');
  });

  it("throws when there is no top-level plugins array", () => {
    expect(() => findPluginsArraySpan('{ "name": "x" }')).toThrow(/plugins/);
  });
});

describe("replaceEntryVersion", () => {
  it("replaces only the entry's own (first) version field, leaving everything else byte-identical", () => {
    const entry = '{\n      "name": "x",\n      "source": "./plugins/x",\n      "version": "1.0.0",\n      "description": "d",\n      "dependencies": [\n        { "name": "y", "version": "^1.0.0" }\n      ]\n    }';
    const { text, changed } = replaceEntryVersion(entry, "1.2.0");
    expect(changed).toBe(true);
    expect(text).toContain('"version": "1.2.0"');
    // The nested dependency's version must be untouched.
    expect(text).toContain('"version": "^1.0.0"');
    // Nothing else in the entry changed.
    expect(text.replace('"version": "1.2.0"', '"version": "1.0.0"')).toBe(entry);
  });

  it("is a no-op (changed: false, identical text) when the version already matches", () => {
    const entry = '{ "name": "x", "version": "1.0.0" }';
    const { text, changed } = replaceEntryVersion(entry, "1.0.0");
    expect(changed).toBe(false);
    expect(text).toBe(entry);
  });

  it("returns the text unchanged when the entry has no version field", () => {
    const entry = '{ "name": "x" }';
    const { text, changed } = replaceEntryVersion(entry, "1.0.0");
    expect(changed).toBe(false);
    expect(text).toBe(entry);
  });
});
