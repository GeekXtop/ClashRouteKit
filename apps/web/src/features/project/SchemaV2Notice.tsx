import { Alert } from "antd";

/**
 * v2 项目的编辑占位条：v2 实体编辑由后续任务提供，此前各工作域页面
 * 按 v1 投影只读浏览，编辑入口不产生写盘（App 侧自动保存已对 v2 关闸）。
 */
export function SchemaV2Notice() {
  return (
    <Alert
      type="warning"
      showIcon
      message="当前项目使用 Schema v2，v2 实体编辑即将支持"
      description="本页暂时按 v1 投影只读浏览，编辑操作不会写入配置文件。"
      data-testid="schema-v2-notice"
    />
  );
}
