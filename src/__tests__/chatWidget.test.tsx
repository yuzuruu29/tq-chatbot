// Regression test: ensure that submitting "hello" exactly once produces
// exactly one user bubble and one assistant bubble. This guards against
// duplicate-render bugs in the chat input submit path.

import { describe, it, expect, beforeEach } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import ChatWidget from "../components/ChatWidget";

// Polyfill crypto.randomUUID if not present (jsdom)
if (!globalThis.crypto || !globalThis.crypto.randomUUID) {
  (globalThis.crypto as unknown as { randomUUID: () => string }).randomUUID = () =>
    `${Math.random()}`;
}

// Polyfill scrollIntoView (not implemented in jsdom)
if (
  typeof Element !== "undefined" &&
  !(Element.prototype as { scrollIntoView?: () => void }).scrollIntoView
) {
  (Element.prototype as { scrollIntoView: () => void }).scrollIntoView =
    function () {};
}

const flush = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe("ChatWidget - single send of 'hello'", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("renders exactly one user bubble and one assistant bubble after one submit", async () => {
    const onClose = () => {};
    await act(async () => {
      root.render(<ChatWidget tenantId="00000000-0000-0000-0000-000000000000" onClose={onClose} />);
    });
    // Let the welcome-message initialization complete
    await flush();
    await flush();

    // Find the input and submit the form exactly once
    const input = container.querySelector(
      ".tq-chatbot-input input"
    ) as HTMLInputElement | null;
    expect(input).toBeTruthy();

    const form = container.querySelector("form.tq-chatbot-input") as HTMLFormElement | null;
    expect(form).toBeTruthy();

    await act(async () => {
      // Use the native value setter so React picks up the change
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(input, "hello");
      input!.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await flush();

    // Submit the form once via a real submit event
    await act(async () => {
      form!.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true })
      );
    });

    // Allow async handleSendMessage + assistant generation to complete
    await flush();
    await flush();
    await flush();

    // Count user bubbles (excluding the synthetic welcome, which is assistant)
    const userBubbles = container.querySelectorAll(
      ".tq-chatbot-message-user"
    ).length;
    const assistantBubbles = container.querySelectorAll(
      ".tq-chatbot-message-assistant"
    ).length;

    expect(userBubbles).toBe(1);
    // assistant = welcome + 1 reply
    expect(assistantBubbles).toBe(2);
  });
});
