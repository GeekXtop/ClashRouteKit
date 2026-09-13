import type { ReactNode } from "react";
import { Layout, Menu, Space, Tag } from "antd";
import { Route } from "lucide-react";
import type { ProjectView } from "../projectController.js";

const navItems: { key: ProjectView; label: string }[] = [
  { key: "project", label: "项目" },
  { key: "library", label: "规则库" },
  { key: "routing", label: "路由" },
  { key: "output", label: "输出" },
];

export function AppShell({
  children,
  selectedView,
  saveLabel,
  onSelectView,
}: {
  children: ReactNode;
  selectedView: ProjectView;
  saveLabel?: string;
  onSelectView: (view: ProjectView) => void;
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
        {saveLabel ? (
          <Tag color={saveLabel === "保存失败" ? "error" : saveLabel === "保存中…" ? "processing" : "success"}>
            {saveLabel}
          </Tag>
        ) : null}
      </Layout.Header>
      <Layout.Content style={{ overflow: "hidden" }}>{children}</Layout.Content>
    </Layout>
  );
}
