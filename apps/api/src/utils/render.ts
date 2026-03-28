import { escapeHtml } from "./sanitize";

export function renderVars(template: string, vars: Record<string, any>) {
  return template.replace(/{{\s*([\w.]+)\s*}}/g, (_m, p1) => {
    const path = String(p1).split(".");
    let ref: any = vars;
    for (const k of path) ref = ref?.[k];
    return ref == null ? "" : escapeHtml(String(ref));
  });
}
