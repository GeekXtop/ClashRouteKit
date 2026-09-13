import { useMemo } from "react";
import { Modal } from "antd";
import { renderIni, type RouteKitProjectConfig } from "@clash-route-kit/core";

/** 「查看生成结果」次级入口：仅在打开时按需渲染当前配置的 INI，不做常驻预览。 */
export function IniResultModal(props: {
  open: boolean;
  config: RouteKitProjectConfig;
  onClose: () => void;
}) {
  const ini = useMemo(
    () => (props.open ? renderIni(props.config) : ""),
    [props.open, props.config],
  );
  return (
    <Modal
      open={props.open}
      title="生成结果（INI）"
      footer={null}
      width={760}
      destroyOnHidden
      onCancel={props.onClose}
    >
      {props.open ? (
        <pre data-testid="ini-result" className="rk-ini rk-ini-scroll">
          {ini}
        </pre>
      ) : null}
    </Modal>
  );
}
