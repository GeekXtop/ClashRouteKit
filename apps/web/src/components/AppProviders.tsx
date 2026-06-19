import type { ReactNode } from "react";
import { App as AntApp, ConfigProvider, theme } from "antd";
import zhCN from "antd/locale/zh_CN";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: { colorPrimary: "#3b82f6", borderRadius: 6 },
      }}
    >
      <AntApp>{children}</AntApp>
    </ConfigProvider>
  );
}
