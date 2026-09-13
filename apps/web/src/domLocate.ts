/** 路由页"定位到行"共享工具：属性选择器转义 + 滚动并移动键盘焦点。 */

export function attrSelector(attribute: string, value: string): string {
  return `[${attribute}="${value.replace(/[\\"]/g, "\\$&")}"]`;
}

export function locateElement(
  selector: string,
  block: ScrollLogicalPosition = "center",
): void {
  const element = document.querySelector(selector);
  if (!element) return;
  if (typeof element.scrollIntoView === "function") {
    element.scrollIntoView({ block });
  }
  if (element instanceof HTMLElement) {
    element.focus({ preventScroll: true });
  }
}
