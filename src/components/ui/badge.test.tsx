import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Badge } from "./badge";

describe("Badge", () => {
  it("renders status as dot + text, never a filled background", () => {
    const { container } = render(<Badge tone="danger">Vencido</Badge>);
    expect(screen.getByText("Vencido")).toBeTruthy();
    const dot = container.querySelector("[aria-hidden]");
    expect(dot?.className).toContain("bg-danger");
    expect(container.firstElementChild?.className).not.toContain("bg-");
  });
});
