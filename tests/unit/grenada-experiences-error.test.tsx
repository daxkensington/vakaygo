import { act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import ExperiencesError from "@/app/(platform)/grenada/experiences/error";

it("asks Next to refetch failed server contents when the visitor retries", async () => {
  const retry = vi.fn();
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => { root.render(<ExperiencesError retry={retry} />); });
    const button = host.querySelector("button");
    expect(button?.textContent).toBe("Try again");
    await act(async () => { button!.click(); });
    expect(retry).toHaveBeenCalledOnce();
    expect(host.querySelector('a[href="/grenada"]')).not.toBeNull();
  } finally {
    await act(async () => { root.unmount(); });
    host.remove();
  }
});
