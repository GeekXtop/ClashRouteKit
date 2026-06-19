import type { ReactNode } from "react";
import { App as AntApp, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";
import { NotifyBridge } from "../notify.js";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      button={{ autoInsertSpace: false }}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: {
          colorPrimary: "#6366f1",
          borderRadius: 8,
          colorBgBase: "#0b0e14",
          colorBgContainer: "#131720",
          colorBgElevated: "#1a1f2b",
          colorBorder: "#232a36",
          colorBorderSecondary: "#1c222d",
          colorText: "#e6e9ef",
          colorTextSecondary: "#9aa3b8",
          fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          controlHeight: 34,
          wireframe: false,
        },
        components: {
          Layout: { headerBg: "#0e1219", bodyBg: "#0b0e14", headerHeight: 52 },
          Menu: { darkItemBg: "transparent", darkItemSelectedBg: "#1a1f2b", darkItemColor: "#9aa3b8" },
          Collapse: { headerBg: "transparent", contentBg: "transparent" },
        },
      }}
    >
      <AntApp>
        <NotifyBridge />
        {children}
      </AntApp>
    </ConfigProvider>
  );
}

