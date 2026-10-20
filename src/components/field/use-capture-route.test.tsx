import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { useCaptureRoute } from "./use-capture-route";

// Phase 2.5 — the field capture route lives in the hash: `#/<draftId>` opens a draft and
// `#/new/<recordTypeCode>` is the deep link that starts a new one (spec/forms.md#Offline capture).

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/field/capture");
});

function Probe() {
  const { draftId, newType, open } = useCaptureRoute();
  return (
    <div>
      <span data-testid="draft">{draftId ?? "none"}</span>
      <span data-testid="new">{newType ?? "none"}</span>
      <button type="button" onClick={() => open("draft-1")}>
        open
      </button>
      <button type="button" onClick={() => open("draft-2", { replace: true })}>
        replace
      </button>
      <button type="button" onClick={() => open(null)}>
        close
      </button>
    </div>
  );
}

function at(hash: string) {
  window.history.replaceState(null, "", `/field/capture${hash}`);
  return render(<Probe />);
}

const values = () => ({
  draft: screen.getByTestId("draft").textContent,
  newType: screen.getByTestId("new").textContent,
});

describe("useCaptureRoute: parsing the hash", () => {
  it("reads a draft id from `#/<draftId>`", async () => {
    at("#/0190draft-id");
    await waitFor(() => expect(values()).toEqual({ draft: "0190draft-id", newType: "none" }));
  });

  it("reads a record type code from `#/new/<code>` and yields no draft", async () => {
    at("#/new/toolbox_talk");
    await waitFor(() =>
      expect(values()).toEqual({ draft: "none", newType: "toolbox_talk" }),
    );
  });

  it("accepts a code with digits and underscores (ats, toolbox_talk)", async () => {
    const { unmount } = at("#/new/ats");
    await waitFor(() => expect(values().newType).toBe("ats"));
    unmount();
    at("#/new/toolbox_talk_v2");
    await waitFor(() => expect(values().newType).toBe("toolbox_talk_v2"));
  });

  it("does not treat an invalid code as a new draft link", async () => {
    at("#/new/Bad-Code");
    await waitFor(() => expect(values()).toEqual({ draft: "new/Bad-Code", newType: "none" }));
  });

  it("returns nothing without a hash (the hub list)", async () => {
    at("");
    await waitFor(() => expect(values()).toEqual({ draft: "none", newType: "none" }));
  });

  it("reacts to a hashchange", async () => {
    at("");
    await waitFor(() => expect(values().draft).toBe("none"));
    act(() => {
      window.location.hash = "#/other-draft";
    });
    await waitFor(() => expect(values()).toEqual({ draft: "other-draft", newType: "none" }));
  });
});

describe("useCaptureRoute: open()", () => {
  it("pushes the draft id into the hash", async () => {
    at("");
    await waitFor(() => expect(values().draft).toBe("none"));
    act(() => {
      screen.getByRole("button", { name: "open" }).click();
    });
    await waitFor(() => expect(values()).toEqual({ draft: "draft-1", newType: "none" }));
    expect(window.location.hash).toBe("#/draft-1");
  });

  it("replaces the history entry when asked (the `#/new` deep link)", async () => {
    at("#/new/toolbox_talk");
    await waitFor(() => expect(values().newType).toBe("toolbox_talk"));
    const before = window.history.length;
    act(() => {
      screen.getByRole("button", { name: "replace" }).click();
    });
    await waitFor(() => expect(values()).toEqual({ draft: "draft-2", newType: "none" }));
    expect(window.history.length).toBe(before);
    expect(window.location.hash).toBe("#/draft-2");
  });

  it("clears the hash when the draft is closed", async () => {
    at("#/draft-1");
    await waitFor(() => expect(values().draft).toBe("draft-1"));
    act(() => {
      screen.getByRole("button", { name: "close" }).click();
    });
    await waitFor(() => expect(values()).toEqual({ draft: "none", newType: "none" }));
    expect(window.location.hash).toBe("");
  });
});
