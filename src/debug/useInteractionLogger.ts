import { useEffect } from "react";
import { isEnabled, isCategoryEnabled, log } from "./debugLogger";

function getElementSummary(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const id = el.id ? `#${el.id}` : "";
  const cls = el.classList.length ? `.${[...el.classList].slice(0, 3).join(".")}` : "";
  return `${tag}${id}${cls}`.slice(0, 80);
}

function getVisibleText(el: Element): string | undefined {
  const text = (el.textContent ?? "").trim().slice(0, 50);
  return text.length > 0 && text.length < 50 ? text : undefined;
}

function getNearestComponent(el: Element): string | undefined {
  let node: Element | null = el;
  while (node) {
    const c = node.getAttribute("data-component");
    if (c) return c;
    node = node.parentElement;
  }
  return undefined;
}

export function useInteractionLogger(): void {
  useEffect(() => {
    function handlePointerDown(e: PointerEvent): void {
      if (!isEnabled() || !isCategoryEnabled("interaction")) return;
      const target = e.target instanceof Element ? e.target : null;
      log("info", "interaction", "click", "interaction", {
        screenX: Math.round(e.clientX),
        screenY: Math.round(e.clientY),
        viewportW: window.innerWidth,
        viewportH: window.innerHeight,
        pointerType: e.pointerType || undefined,
        target: target ? getElementSummary(target) : undefined,
        ariaLabel: target?.getAttribute("aria-label") ?? undefined,
        text: target ? getVisibleText(target) : undefined,
        component: target ? getNearestComponent(target) : undefined,
      });
    }
    document.addEventListener("pointerdown", handlePointerDown, { capture: true });
    return () => document.removeEventListener("pointerdown", handlePointerDown, { capture: true });
  }, []);
}
