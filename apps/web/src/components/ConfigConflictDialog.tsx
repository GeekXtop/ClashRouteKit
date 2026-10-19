import { Modal, Space, Button, Typography } from "antd";

interface ConfigConflictDialogProps {
  open: boolean;
  /** 服务端当前 mtime（409 响应携带），用于提示外部修改时间。 */
  serverMtime: number;
  /** 以当前编辑内容覆盖服务端文件（以 serverMtime 为新 base 重试保存）。 */
  onOverwrite: () => void;
  /** 放弃本地草稿，重新拉取服务端内容。 */
  onReload: () => void;
  onCancel: () => void;
}

/** 配置写冲突（PUT 409）对话框：文件被外部修改后让用户显式选择覆盖或重载。 */
export function ConfigConflictDialog({
  open,
  serverMtime,
  onOverwrite,
  onReload,
  onCancel,
}: ConfigConflictDialogProps) {
  return (
    <Modal
      open={open}
      title="配置文件已被外部修改"
      onCancel={onCancel}
      footer={
        <Space>
          <Button onClick={onReload}>重载</Button>
          <Button type="primary" danger onClick={onOverwrite}>
            覆盖
          </Button>
        </Space>
      }
    >
      <Typography.Paragraph>
        服务端文件在本次编辑期间被外部修改（{serverMtime > 0 ? new Date(serverMtime).toLocaleString() : "文件不存在"}）。
        「覆盖」将以当前编辑内容覆盖服务端文件；「重载」放弃本地改动并重新读取。
      </Typography.Paragraph>
    </Modal>
  );
}
