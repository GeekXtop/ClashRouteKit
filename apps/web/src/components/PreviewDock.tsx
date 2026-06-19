import { Collapse } from "antd";

export function PreviewDock({ ini }: { ini: string }) {
  return (
    <Collapse
      className="rk-preview-dock"
      size="small"
      items={[{ key: "ini", label: "INI 预览", children: <pre className="rk-ini">{ini}</pre> }]}
    />
  );
}
