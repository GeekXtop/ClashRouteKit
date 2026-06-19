import type { ReactNode } from "react";
import { Badge, Button, Layout, Menu, Space } from "antd";
import { Download, Route, Upload } from "lucide-react";
import type { ProjectView } from "../projectController.js";

const navItems: { key: ProjectView; label: string }[] = [
  { key: "routing", label: "路由" },
  { key: "library", label: "规则库" },
  { key: "publish", label: "发布" },
];

export function AppShell({
  children,
  selectedView,
  dirty,
  onSelectView,
  onImport,
  onExport,
}: {
  children: ReactNode;
  selectedView: ProjectView;
  dirty: boolean;
  onSelectView: (view: ProjectView) => void;
  onImport: () => void;
  onExport: () => void;
}) {
  return (
    <Layout style={{ height: "100vh" }}>
      <Layout.Header style={{ display: "flex", alignItems: "center", gap: 16, paddingInline: 16 }}>
        <Space style={{ color: "#fff", fontWeight: 600 }}>
          <Route size={16} /> ClashRouteKit
        </Space>
        <Menu
          theme="dark"
          mode="horizontal"
          selectedKeys={[selectedView]}
          onClick={(info) => onSelectView(info.key as ProjectView)}
          items={navItems.map((item) => ({ key: item.key, label: item.label }))}
          style={{ flex: 1, minWidth: 0 }}
        />
        <Space>
          {dirty ? <Badge status="warning" text="未保存" /> : null}
          <Button size="small" icon={<Upload size={14} />} onClick={onImport}>
            导入
          </Button>
          <Button size="small" icon={<Download size={14} />} onClick={onExport}>
            导出
          </Button>
        </Space>
      </Layout.Header>
      <Layout.Content style={{ overflow: "hidden" }}>{children}</Layout.Content>
    </Layout>
  );
}
